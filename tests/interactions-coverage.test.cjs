const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/interaction-groups.js');

// These fixtures exercise lookup scope. They are not a clinical interaction database.
const cell = value => ({ value });
const drug = (name, code = '') => ({ name, code });
const partner = drug('Allopurinol', 'M04AA01');
const row = (medicine, other = partner, id = 'fixture') => ({
  STT: cell(id),
  'Thuốc 1': cell(medicine.name), 'ATC 1': cell(medicine.code),
  'Thuốc 2': cell(other.name), 'ATC 2': cell(other.code),
});
const ids = result => result.confirmed.map(item => Engine.value(item.row.STT));
const search = (rows, ...drugs) => Engine.analyze(rows, drugs, true);

test('the five audited source pairs are retrievable in either selection order', () => {
  // Source identifiers and ATC/name cells from Sheet Data, reviewed 2026-11-03.
  const source = [
    row(drug('Thuốc ức chế men chuyển (ACEI)', 'C09AA'), drug('Thuốc chống viêm không steroid (NSAID)', 'M01A'), 1294),
    row(drug('Kháng sinh nhóm Quinolon', 'J01MA'), drug('Thuốc chống viêm không steroid (NSAID)', 'M01A'), 2275),
    row(drug('Thuốc chống đông nhóm Coumarin', 'B01AA'), drug('Thuốc ức chế bơm proton (PPI)', 'A02BC'), 1165),
    row(drug('Thuốc chống viêm không steroid (NSAID)', 'M01A'), drug('Thuốc ức chế tái hấp thu Serotonin (SSRI)', 'N06AB'), 3250),
    row(drug('Thuốc an thần nhóm Benzodiazepin', 'N05BA'), drug('Thuốc ức chế bơm proton (PPI)', 'A02BC'), 3785),
  ];
  for (const [a, b, expected] of [
    [drug('Ibuprofen', 'M01AE01'), drug('Enalapril', 'C09AA02'), 1294],
    [drug('Ibuprofen', 'M01AE01'), drug('Ciprofloxacin', 'J01MA02'), 2275],
    [drug('Acenocoumarol', 'B01AA07'), drug('Omeprazol', 'A02BC01'), 1165],
    [drug('Sertralin', 'N06AB06'), drug('Ibuprofen', 'M01AE01'), 3250],
    [drug('Diazepam', 'N05BA01'), drug('Omeprazol', 'A02BC01'), 3785],
  ]) {
    assert.deepEqual(ids(search(source, a, b)), [expected]);
    assert.deepEqual(ids(search(source, b, a)), [expected]);
  }
});

test('other audited pharmacological parents retrieve their concrete substances', () => {
  for (const [medicine, parent] of [
    [drug('Simvastatin', 'C10AA01'), drug('Thuốc hạ lipid nhóm Statin', 'C10AA')],
    [drug('Erythromycin', 'J01FA01'), drug('Kháng sinh nhóm Macrolid', 'J01FA')],
    [drug('Methylprednisolon', 'H02AB04'), drug('Corticosteroid toàn thân', 'H02AB')],
  ]) assert.equal(search([row(parent)], medicine, partner).confirmed.length, 1, medicine.name);
});

test('known erroneous complete source codes cannot merge distinct medicines or inherit the wrong class', () => {
  for (const [wrong, corrected, unrelated] of [
    [drug('Fluconazol', 'C10AB05'), 'J02AC01', drug('Fenofibrat', 'C10AB05')],
    [drug('Fenoldopam', 'C02KX01'), 'C01CA19', drug('Bosentan', 'C02KX01')],
    [drug('Apomorphine', 'N02AA01'), 'N04BC07', drug('Morphin', 'N02AA01')],
    [drug('Bicalutamide', 'L02BB01'), 'L02BB03', drug('Flutamid', 'L02BB01')],
    [drug('Nevirapin', 'J05AH01'), 'J05AG01', drug('Zanamivir', 'J05AH01')],
    [drug('Methylnaltrexone', 'N07BB04'), 'A06AH01', drug('Naltrexone', 'N07BB04')],
  ]) {
    assert.deepEqual(Engine.effectiveCodes(wrong), [corrected]);
    const source = [row(wrong, partner, 'corrected'), row(unrelated, partner, 'unrelated')];
    assert.deepEqual(ids(search(source, wrong)), ['corrected']);
    assert.deepEqual(ids(search(source, unrelated)), ['unrelated']);
    assert.deepEqual(ids(search(source, drug(wrong.name, corrected))), ['corrected']);
  }
  assert.deepEqual(ids(search([row(drug('Thuốc hạ lipid nhóm Fibrat', 'C10AB'))], drug('Fluconazol', 'C10AB05'))), []);
});

test('serotonergic and gastric-pH labels use bounded mechanism scopes rather than their broad source ATCs', () => {
  const serotonin = [row(drug('Serotonergic drugs', 'N06A')), row(drug('Tetracyclic antidepressants', 'N06A'), partner, 'tetracyclic')];
  assert.deepEqual(ids(search(serotonin, drug('Sertralin', 'N06AB06'))), ['fixture']);
  assert.deepEqual(ids(search(serotonin, drug('Bupropion', 'N06AX12'))), []);
  const gastric = [row(drug('Drugs that affect gastric pH', 'A02'))];
  assert.equal(search(gastric, drug('Omeprazol', 'A02BC01')).confirmed.length, 1);
  assert.equal(search(gastric, drug('Sucralfat', 'A02BX02')).confirmed.length, 0);
});

test('three-character class rows appear for concrete calcium blockers, antidiabetics and diuretics', () => {
  const groups = [
    row(drug('Thuốc chẹn kênh calci', 'C08'), partner, 'calcium'),
    row(drug('Antidiabetics', 'A10'), partner, 'diabetes'),
    row(drug('Thuốc lợi tiểu', 'C03'), partner, 'diuretics'),
  ];
  for (const [medicine, expected] of [
    [drug('Amlodipin', 'C08CA01'), 'calcium'],
    [drug('Verapamil', 'C08DA01'), 'calcium'],
    [drug('Metformin', 'A10BA02'), 'diabetes'],
    [drug('Gliclazid', 'A10BB09'), 'diabetes'],
    [drug('Furosemid', 'C03CA01'), 'diuretics'],
    [drug('Spironolacton', 'C03DA01'), 'diuretics'],
  ]) {
    assert.deepEqual(ids(search(groups, medicine)), [expected], medicine.name);
    assert.deepEqual(ids(search(groups, medicine, partner)), [expected], medicine.name);
    assert.deepEqual(ids(search(groups, partner, medicine)), [expected], medicine.name);
  }
});

test('coarse ATCs on individual medicines do not turn them into generic class interactions', () => {
  const rows = [
    row(drug('Thuốc chẹn kênh calci', 'C08'), partner, 'generic-calcium'),
    row(drug('Polycarbophil calcium', 'C08'), partner, 'specific-calcium'),
    row(drug('Nitrendipin', 'C08'), partner, 'specific-nitrendipine'),
    row(drug('Loop', 'C03'), partner, 'loop-only'),
  ];
  assert.deepEqual(ids(search(rows, drug('Amlodipin', 'C08CA01'))), ['generic-calcium']);
  assert.deepEqual(ids(search(rows, drug('Spironolacton', 'C03DA01'))), []);
  assert.deepEqual(ids(search(rows, drug('Furosemid', 'C03CA01'))), ['loop-only']);
});

test('generic beta-blocker source label covers selective and alpha/beta medicines without propranolol bleed', () => {
  const rows = [
    row(drug('Thuốc chẹn beta', 'C07AA'), partner, 'beta-class'),
    row(drug('Propranolol', 'C07AA05'), partner, 'propranolol-only'),
    row(drug('Propranolol', 'C07AA'), partner, 'coarse-propranolol'),
  ];
  for (const medicine of [
    drug('Metoprolol', 'C07AB02'), drug('Bisoprolol', 'C07AB07'),
    drug('Atenolol', 'C07AB03'), drug('Nebivolol', 'C07AB12'),
    drug('Carvedilol', 'C07AG02'),
  ]) assert.deepEqual(ids(search(rows, medicine, partner)), ['beta-class'], medicine.name);
  assert.deepEqual(ids(search(rows, drug('Amlodipin', 'C08CA01'), partner)), []);
});

test('missing concrete drugs remain selectable when the source contains only class interactions', () => {
  const catalog = Engine.buildDrugCatalog([
    row(drug('Thuốc chẹn beta', 'C07AA')),
    row(drug('Corticosteroid toàn thân', 'H02AB')),
  ]);
  assert.ok(catalog.some(item => item.name === 'Bisoprolol' && item.code === 'C07AB07'));
  assert.ok(catalog.some(item => item.name === 'Methylprednisolon' && item.code === 'H02AB04'));
});

test('immunosuppressant members retrieve both source spellings even when ATC is missing', () => {
  const rows = [
    row(drug('Immunosuppressants', 'V03A'), partner, 'joined'),
    row(drug('Immuno suppressants'), partner, 'spaced'),
    row(drug('Miscellaneous', 'V03A'), partner, 'unrelated-placeholder'),
  ];
  for (const name of ['Azathioprin', 'Ciclosporin', 'Tacrolimus', 'Mycophenolat', 'Sirolimus', 'Everolimus']) {
    assert.deepEqual(ids(search(rows, drug(name), partner)), ['joined', 'spaced'], name);
    assert.deepEqual(ids(search(rows, partner, drug(name))), ['joined', 'spaced'], name);
  }
  assert.deepEqual(ids(search(rows, drug('Temsirolimus', 'L01EG01'), partner)), []);
  assert.deepEqual(ids(search(rows, drug('Selenium', 'V03A'), partner)), []);
});

test('the narrower immunosuppressant mTOR class is not inherited by every immunosuppressant', () => {
  const rows = [row(drug('Thuốc ức chế miễn dịch nhóm mTOR', 'L04AH'), partner, 'mtor')];
  for (const name of ['Sirolimus', 'Everolimus']) assert.deepEqual(ids(search(rows, drug(name))), ['mtor']);
  for (const medicine of [drug('Ciclosporin', 'L04AD01'), drug('Tacrolimus', 'L04AD02'), drug('Temsirolimus', 'L01EG01')]) {
    assert.deepEqual(ids(search(rows, medicine)), [], medicine.name);
  }
});

test('TCA rows cover known tricyclic substances without treating maprotiline as tricyclic', () => {
  const rows = [row(drug('Thuốc chống trầm cảm ba vòng (TCA)', 'N06AA'), partner, 'tca')];
  for (const medicine of [drug('Amitriptylin', 'N06AA09'), drug('Clomipramin', 'N06AA04'), drug('Desipramin', 'N06AA01'), drug('Doxepin', 'N06AA12')]) {
    assert.deepEqual(ids(search(rows, medicine)), ['tca'], medicine.name);
  }
  for (const name of ['Maprotilin', 'Maprotiline']) assert.deepEqual(ids(search(rows, drug(name, 'N06AA21'))), [], name);
});

test('SNRI rows exclude other N06AX antidepressants such as bupropion and mirtazapine', () => {
  const rows = [row(drug('SNRIs', 'N06AX'), partner, 'snri')];
  for (const medicine of [drug('Duloxetin', 'N06AX21'), drug('Venlafaxin', 'N06AX16'), drug('Milnacipran', 'N06AX17')]) {
    assert.deepEqual(ids(search(rows, medicine)), ['snri'], medicine.name);
  }
  for (const medicine of [drug('Bupropion', 'N06AX12'), drug('Mirtazapin', 'N06AX11'), drug('Trazodon', 'N06AX05'), drug('Reboxetine', 'N06AX18')]) {
    assert.deepEqual(ids(search(rows, medicine)), [], medicine.name);
  }
});

test('Coumarin rows do not cover phenindione merely because it shares the B01AA parent', () => {
  const rows = [row(drug('Thuốc chống đông nhóm Coumarin', 'B01AA'), partner, 'coumarin')];
  assert.deepEqual(ids(search(rows, drug('Warfarin', 'B01AA03'))), ['coumarin']);
  assert.deepEqual(ids(search(rows, drug('Acenocoumarol', 'B01AA07'))), ['coumarin']);
  assert.deepEqual(ids(search(rows, drug('Phenindione', 'B01AA02'))), []);
});

test('shared erroneous old code cannot merge sirolimus and temsirolimus source rows', () => {
  const rows = [
    row(drug('Sirolimus', 'L04AA10'), partner, 'sirolimus'),
    row(drug('Temsirolimus', 'L04AA10'), partner, 'temsirolimus'),
  ];
  for (const code of ['L04AA10', 'L04AH01']) assert.deepEqual(ids(search(rows, drug('Sirolimus', code))), ['sirolimus'], code);
  for (const code of ['L04AA10', 'L01EG01']) assert.deepEqual(ids(search(rows, drug('Temsirolimus', code))), ['temsirolimus'], code);
  const catalog = Engine.buildDrugCatalog(rows);
  assert.equal(catalog.find(item => item.name === 'Sirolimus').code, 'L04AH01');
  assert.equal(catalog.find(item => item.name === 'Temsirolimus').code, 'L01EG01');
});

test('name-scoped legacy mappings preserve equivalent direct identities but do not rewrite unknown substances', () => {
  const source = row(drug('Everolimus', 'L04AA18'), partner, 'everolimus');
  assert.deepEqual(ids(Engine.analyze([source], [drug('Everolimus', 'L04AH02')], false)), ['everolimus']);
  assert.equal(Engine.drugIdentity('Everolimus', 'L04AA18'), Engine.drugIdentity('Everolimus', 'L04AH02'));
  assert.deepEqual(Engine.effectiveCodes(drug('Unknown medicine', 'L04AA18')), ['L04AA18']);
  assert.notEqual(Engine.drugIdentity('Sirolimus', 'L04AA10'), Engine.drugIdentity('Temsirolimus', 'L04AA10'));
});

test('compound ATCs parse complete tokens and reject malformed, partial or trailing junk cells', () => {
  assert.deepEqual(Engine.parseATCCodes(' l01xx14 / d10ad01 '), ['L01XX14', 'D10AD01']);
  assert.deepEqual(Engine.parseATCCodes('C08; C08CA; C08CA01; C08CA01'), ['C08', 'C08CA', 'C08CA01']);
  for (const malformed of ['', 'L01XX14 /', '/ D10AD01', 'L01XX14 / D10AD01junk', 'L01XX14 / D10AD0', 'L01XX14 D10AD01', 'D10AD01*', 'C0', 'C08CA010']) {
    assert.deepEqual(Engine.parseATCCodes(malformed), [], malformed);
  }
});

test('systemic Tretinoin legacy/current queries retrieve ATRA rows without extending them to topical treatment', () => {
  const source = row(drug('Tretinoin (ATRA)', 'L01XX14 / D10AD01'), drug('Doxycyclin', 'J01AA02'), 'atra');
  for (const medicine of [
    drug('Tretinoin (ATRA)', 'L01XX14 / D10AD01'),
    drug('Tretinoin (ATRA)', 'L01XX14'),
    drug('Tretinoin (ATRA)', 'L01XF01'),
    drug('Tretinoin', 'L01XF01'),
  ]) {
    const result = search([source], medicine);
    assert.deepEqual(ids(result), ['atra'], medicine.code);
    assert.equal(result.confirmed[0].row, source, 'raw source row remains available for rendering');
    assert.equal(Engine.value(source['ATC 1']), 'L01XX14 / D10AD01');
  }
  for (const name of ['Tretinoin', 'Tretinoin (ATRA)', 'Tretinoin bôi ngoài da']) {
    assert.deepEqual(ids(search([source], drug(name, 'D10AD01'))), [], name);
  }
  const catalog = Engine.buildDrugCatalog([source]);
  const atra = catalog.find(item => item.name === 'Tretinoin (ATRA)');
  assert.equal(atra.code, 'L01XF01');
  assert.ok(atra.searchCodes.includes('L01XX14'));
  assert.ok(!atra.searchCodes.includes('D10AD01'));
});

test('a topical-only Tretinoin row does not inherit systemic antineoplastic group interactions', () => {
  const rows = [
    row(drug('Tretinoin', 'D10AD01'), partner, 'topical-direct'),
    row(drug('Antineoplastics', 'L01'), partner, 'systemic-group'),
  ];
  assert.deepEqual(ids(search(rows, drug('Tretinoin', 'D10AD01'))), ['topical-direct']);
  assert.deepEqual(ids(search(rows, drug('Tretinoin', 'L01XF01'))), ['systemic-group']);
});
