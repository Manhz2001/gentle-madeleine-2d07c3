const test = require('node:test');
const assert = require('node:assert/strict');
const Demo = require('../js/interaction-groups.js');

const cell = value => ({ value });
const drug = (name, code) => ({ name, code });
const celecoxib = drug('Celecoxib', 'M01AH01');
const azathioprine = drug('Azathioprin', 'L04AX01');
const allopurinol = drug('Allopurinol', 'M04AA01');
const atcOnly = { atc: true, families: false };
const familiesOnly = { atc: false, families: true };
const fixture = (a, b, extra = {}) => ({
  'Thuốc 1': cell(a.name), 'ATC 1': cell(a.code),
  'Thuốc 2': cell(b.name), 'ATC 2': cell(b.code),
  'Mức độ': cell('Dữ liệu kiểm thử phần mềm'),
  ...extra,
});

test('direct identity keeps normalized names/codes and bounded spelling aliases', () => {
  assert.equal(Demo.sideMatch(fixture(celecoxib, allopurinol), 1, drug('  CELECOXIB ', ' m01ah01 ')).kind, 'exact');
  assert.equal(Demo.sideMatch(fixture(azathioprine, allopurinol), 1, drug('Azathioprine', 'L04AX01')).kind, 'exact');
  assert.equal(Demo.sideMatch(fixture(azathioprine, allopurinol), 2, drug('allopuriol', 'M04AA01')).kind, 'exact');
  assert.equal(Demo.sideMatch(fixture(celecoxib, allopurinol), 1, drug('cele', 'M01AH01'), false), null);
  assert.equal(Demo.canonicalName('  Thuốc  ức chế ĐẶC BIỆT '), 'thuoc uc che dac biet');
});

test('same complete ATC can retrieve a differently named source row only in expanded mode', () => {
  const source = fixture(drug('Tên đồng nghĩa trong nguồn', 'M01AH01'), allopurinol);
  assert.equal(Demo.sideMatch(source, 1, celecoxib, true).kind, 'atc');
  assert.equal(Demo.sideMatch(source, 1, celecoxib, false), null);
});

test('ATC-only lookup inherits only confirmed Coxibs/NSAID labels at proper ancestors', () => {
  assert.equal(Demo.sideMatch(fixture(drug('Coxibs', 'M01AH'), allopurinol), 1, celecoxib, atcOnly).kind, 'parent');
  for (const label of Demo.confirmedGroups.M01A) {
    const match = Demo.sideMatch(fixture(drug(label, 'M01A'), allopurinol), 1, celecoxib, atcOnly);
    assert.equal(match.kind, 'parent', label);
    assert.match(match.reason, /M01AH01.*M01A/);
  }
});

test('misclassified Parecoxib and narrower NSAID rows are review candidates, not confirmed inheritance', () => {
  const names = [drug('Parecoxib', 'M01AH'), drug('Fenamates', 'M01A'), drug('Nimesulide', 'M01A'), drug('Oxicam derivatives', 'M01A')];
  const result = Demo.analyze(names.map(name => fixture(name, allopurinol)), [celecoxib]);
  assert.equal(result.confirmed.length, 0);
  assert.equal(result.candidates.length, names.length);
  assert.ok(result.candidates.every(item => item.evidence[0].kind === 'review'));
});

test('directional hierarchy rejects sibling codes, descendant expansion and organ-level prefixes', () => {
  for (const code of ['M01AH04', 'M01AE01', 'M01', 'M']) {
    assert.equal(Demo.sideMatch(fixture(drug('Coxibs', code), allopurinol), 1, celecoxib, atcOnly), null, code);
  }
  assert.equal(Demo.sideMatch(fixture(celecoxib, allopurinol), 1, drug('Coxibs', 'M01AH'), atcOnly), null);
  assert.equal(Demo.sideMatch(fixture(celecoxib, allopurinol), 1, drug('Thuốc chống viêm không steroid (NSAID)', 'M01A'), atcOnly), null);
});

test('explicit thiopurine membership bridges azathioprine to exact family name without V03A collisions', () => {
  const family = fixture(drug('Thiopurines', 'V03A'), allopurinol);
  const match = Demo.sideMatch(family, 1, azathioprine);
  assert.equal(match.kind, 'family');
  assert.equal(match.sourceCode, 'V03A');
  assert.equal(match.selectedCode, 'L04AX01');
  assert.match(match.reference, /^https:\/\/files\.cpicpgx\.org\//);
  for (const name of ['Thiopurines; Mercaptopurine', 'Selenium', 'Miscellaneous', 'Thiopurines; Thioguanine']) {
    assert.equal(Demo.sideMatch(fixture(drug(name, 'V03A'), allopurinol), 1, azathioprine), null, name);
  }
  assert.equal(Demo.sideMatch(family, 1, drug('Thalidomide', 'L04AX02')), null);
  assert.equal(Demo.sideMatch(family, 1, drug('Selenium', 'V03A')), null);
});

test('invalid ATC shapes never expand to a generic or sibling source row', () => {
  for (const code of ['', 'M01AH010', 'M01AH0', 'M01AH 01', 'M01AH01junk', 'M01A*', '01AH01']) {
    assert.equal(Demo.sideMatch(fixture(drug('Coxibs', 'M01AH'), allopurinol), 1, drug('Other', code), atcOnly), null, code);
  }
  for (const code of ['M0', 'M01AH0', 'M01AH01junk', 'M01A*']) {
    assert.equal(Demo.sideMatch(fixture(drug('Coxibs', code), allopurinol), 1, celecoxib, atcOnly), null, code);
  }
});

test('single mode collects both columns; pair mode requires both distinct sides and supports reversed selection', () => {
  const rows = [
    fixture(celecoxib, allopurinol),
    fixture(allopurinol, drug('Coxibs', 'M01AH')),
    fixture(drug('Coxibs', 'M01AH'), drug('FixtureThird', 'A01AA01')),
  ];
  assert.equal(Demo.analyze(rows, [celecoxib]).confirmed.length, 3);
  const forward = Demo.analyze(rows, [celecoxib, allopurinol]);
  const reverse = Demo.analyze(rows, [allopurinol, celecoxib]);
  assert.deepEqual(forward.confirmed.map(item => item.sheetRow), [2, 3]);
  assert.deepEqual(reverse.confirmed.map(item => item.sheetRow), [2, 3]);
  assert.ok(forward.confirmed.every(item => item.evidence.length === 2));
  assert.equal(Demo.analyze([fixture(celecoxib, drug('FixtureThird', 'A01AA01'))], [celecoxib, allopurinol]).confirmed.length, 0);
});

test('a source row matching several selected pairs appears once, while distinct duplicate source rows survive', () => {
  const shared = fixture(drug('Coxibs', 'M01AH'), allopurinol);
  const drugs = [celecoxib, drug('Etoricoxib', 'M01AH05'), allopurinol];
  const result = Demo.analyze([shared, { ...shared }], drugs);
  assert.equal(result.confirmed.length, 2);
  assert.deepEqual(result.confirmed.map(item => item.sheetRow), [2, 3]);
  assert.equal(result.confirmed[0].row, shared);
  assert.equal(result.confirmed[0].evidence.length, 2);
});

test('disabled expansion preserves direct-only matches and empty selection produces no results', () => {
  const rows = [fixture(celecoxib, allopurinol), fixture(drug('Coxibs', 'M01AH'), allopurinol), fixture(drug('Parecoxib', 'M01AH'), allopurinol)];
  const direct = Demo.analyze(rows, [celecoxib], false);
  assert.equal(direct.confirmed.length, 1); assert.equal(direct.exactCount, 1); assert.equal(direct.candidates.length, 0);
  assert.deepEqual(Demo.analyze(rows, []), { confirmed: [], candidates: [], exactCount: 0 });
});

test('non-ATC family matching survives absent or different selected and source ATCs', () => {
  for (const selectedCode of ['', 'L04AX01', 'source-placeholder']) {
    for (const sourceCode of ['', 'V03A', 'another-placeholder']) {
      const source = fixture(drug('Thiopurines', sourceCode), allopurinol);
      const match = Demo.sideMatch(source, 1, drug('Azathioprine', selectedCode), familiesOnly);
      assert.equal(match.kind, 'family');
      assert.equal(match.familyId, 'thiopurines');
      assert.equal(match.selectedCode, Demo.atc(selectedCode));
      assert.equal(match.sourceCode, Demo.atc(sourceCode));
      assert.match(match.reason, /độc lập với ATC/);
    }
  }
});

test('azathioprin has distinct thiopurine and immunosuppressant memberships without V03A leakage', () => {
  const groups = Demo.groupsForDrug(azathioprine);
  assert.deepEqual(groups.map(group => group.id).sort(), ['immunosuppressants', 'thiopurines']);
  assert.ok(groups.every(group => group.path[0] === 'Azathioprin'));
  const rows = ['Thiopurines', 'Immunosuppressants', 'Miscellaneous', 'Selenium', 'Monoclonal antibodies']
    .map(name => fixture(drug(name, 'V03A'), allopurinol));
  const result = Demo.analyze(rows, [azathioprine, allopurinol], familiesOnly);
  assert.deepEqual(result.confirmed.map(item => Demo.value(item.row['Thuốc 1'])), ['Thiopurines', 'Immunosuppressants']);
  assert.deepEqual(result.confirmed.map(item => item.evidence[0].familyId), ['thiopurines', 'immunosuppressants']);
  assert.equal(result.candidates.length, 0);
  assert.match(result.confirmed[1].evidence[0].reference, /accessdata\.fda\.gov/);
});

test('thiopurine member aliases resolve as substances without collapsing the family into a sibling medicine', () => {
  const family = fixture(drug('Thiopurines', 'V03A'), allopurinol);
  for (const name of ['Mercaptopurin', 'Mercaptopurine', 'Mercaptopurin (6-MP)', '6-MP', 'Thioguanine', 'Tioguanine', 'Thioguanin']) {
    const match = Demo.sideMatch(family, 1, drug(name, ''), familiesOnly);
    assert.equal(match.familyId, 'thiopurines', name);
    assert.equal(Demo.sideMatch(fixture(drug('Mercaptopurin (6-MP)', 'L01BB02'), allopurinol), 1, azathioprine, familiesOnly), null);
  }
  const alias = fixture(drug('Mercaptopurin (6-MP)', 'L01BB02'), allopurinol);
  assert.equal(Demo.sideMatch(alias, 1, drug('Mercaptopurine', 'L01BB02'), false).kind, 'exact');
  for (const name of ['Thalidomide', 'Cladribin', 'Fludarabin']) {
    assert.equal(Demo.sideMatch(family, 1, drug(name, 'L01BB'), familiesOnly), null, name);
  }
});

test('family parent closure provides Coxibs and NSAID groups without inheriting another coxib-specific row', () => {
  for (const name of ['Celecoxib', 'Etoricoxib', 'Parecoxib']) {
    const member = drug(name, '');
    const groups = Demo.groupsForDrug(member);
    assert.deepEqual(groups.map(group => group.id), ['coxibs', 'nsaids']);
    const nsaid = groups.find(group => group.id === 'nsaids');
    assert.deepEqual(nsaid.path, [name, 'Coxibs / ức chế chọn lọc COX-2', 'Thuốc chống viêm không steroid (NSAID)']);
    for (const label of ['Coxibs', ...Demo.confirmedGroups.M01A]) {
      assert.equal(Demo.sideMatch(fixture(drug(label, ''), allopurinol), 1, member, familiesOnly).kind, 'family');
    }
  }
  for (const sibling of [drug('Parecoxib', 'M01AH'), drug('Etoricoxib', 'M01AH05'), drug('Fenamates', 'M01A')]) {
    assert.equal(Demo.sideMatch(fixture(sibling, allopurinol), 1, celecoxib, familiesOnly), null, sibling.name);
  }
});

test('ATC and non-ATC expansion switches operate independently on the same source rows', () => {
  const thiopurineRow = fixture(drug('Thiopurines', 'V03A'), allopurinol);
  assert.equal(Demo.analyze([thiopurineRow], [azathioprine, allopurinol], atcOnly).confirmed.length, 0);
  assert.equal(Demo.analyze([thiopurineRow], [azathioprine, allopurinol], familiesOnly).confirmed.length, 1);
  const nsaid = fixture(drug('Coxibs', 'M01AH'), allopurinol);
  assert.equal(Demo.sideMatch(nsaid, 1, celecoxib, atcOnly).kind, 'parent');
  assert.equal(Demo.sideMatch(nsaid, 1, celecoxib, familiesOnly).kind, 'family');
  assert.equal(Demo.sideMatch(nsaid, 1, celecoxib, { atc: false, families: false }), null);
});

test('coumarin membership is explicit and never inferred for every Vitamin K antagonist', () => {
  const source = fixture(drug('Thuốc chống đông nhóm Coumarin', 'V03A'), allopurinol);
  for (const member of [drug('Warfarin', 'B01AA03'), drug('Acenocoumarol', 'B01AA07')]) {
    const match = Demo.sideMatch(source, 1, member, familiesOnly);
    assert.equal(match.kind, 'family'); assert.equal(match.familyId, 'coumarins');
  }
  for (const member of [drug('Phenindione', 'B01AA02'), drug('Dicoumarol', 'B01AA01'), drug('FixtureOther', 'B01AA03')]) {
    // Even a true family member not yet entered in the registry remains unclassified.
    assert.equal(Demo.sideMatch(source, 1, member, familiesOnly), null, member.name);
  }
});

test('equal generic pharmacological descriptions never create an unapproved family edge', () => {
  const source = fixture(drug('Thiopurines', 'V03A'), allopurinol, { 'Nhóm tác dụng 1': cell('Nhóm tác dụng dược lý chuyên biệt theo chuyên luận') });
  const unrelated = { name: 'FixtureUnrelated', code: 'V03A', group: 'Nhóm tác dụng dược lý chuyên biệt theo chuyên luận' };
  assert.equal(Demo.sideMatch(source, 1, unrelated, familiesOnly), null);
});
