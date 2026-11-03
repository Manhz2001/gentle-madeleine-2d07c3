(function (root) {
  const value = cell => cell && typeof cell === 'object' && 'value' in cell ? cell.value ?? '' : cell ?? '';
  const fold = text => String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const atc = text => String(text ?? '').trim().toUpperCase();
  const aliases = new Map([['azathioprine', 'azathioprin'], ['allopuriol', 'allopurinol'],
    ['mercaptopurine', 'mercaptopurin'], ['mercaptopurin (6-mp)', 'mercaptopurin'], ['6-mp', 'mercaptopurin'],
    ['tioguanine', 'thioguanine'], ['thioguanin', 'thioguanine']]);
  const canonicalName = text => aliases.get(fold(text)) || fold(text);
  const confirmedGroups = {
    M01AH: ['Coxibs'],
    M01A: [
      'Thuốc chống viêm không steroid (NSAID)',
      'Aspirin và thuốc chống viêm không steroid (NSAID)',
      'Thuốc chống viêm NSAID, Aspirin và Salicylat',
      'Thuốc chống viêm không steroid (NSAID) và Aspirin',
      'Thuốc NSAID và các dẫn xuất Salicylat',
    ],
  };
  // Family membership is independent of ATC. Names identify substances here;
  // row ATCs (including placeholders such as V03A) never define these edges.
  const families = [
    { id: 'thiopurines', label: 'Thiopurines', sourceLabels: ['Thiopurines'],
      members: ['Azathioprin', 'Mercaptopurin', 'Thioguanine'], parents: [],
      reference: 'https://files.cpicpgx.org/data/guideline/publication/thiopurines/2026/41618934.pdf' },
    { id: 'immunosuppressants', label: 'Thuốc ức chế miễn dịch', sourceLabels: ['Immunosuppressants'],
      members: ['Azathioprin'], parents: [],
      reference: 'https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/017391s018lbl.pdf' },
    { id: 'coxibs', label: 'Coxibs / ức chế chọn lọc COX-2', sourceLabels: ['Coxibs'],
      members: ['Celecoxib', 'Etoricoxib', 'Parecoxib'], parents: ['nsaids'],
      reference: 'https://atcddd.fhi.no/atc_ddd_index/?code=M01AH&showdescription=no' },
    { id: 'nsaids', label: 'Thuốc chống viêm không steroid (NSAID)', sourceLabels: confirmedGroups.M01A,
      members: [], parents: [], reference: 'https://atcddd.fhi.no/atc_ddd_index/?code=M01AH&showdescription=no' },
    { id: 'coumarins', label: 'Thuốc chống đông nhóm Coumarin', sourceLabels: ['Thuốc chống đông nhóm Coumarin'],
      members: ['Warfarin', 'Acenocoumarol'], parents: [],
      references: ['https://www.medicines.org.uk/emc/product/5766/smpc', 'https://www.medicines.org.uk/emc/product/2058/smpc'] },
  ];
  function groupsForDrug(drug) {
    const found = new Map();
    function visit(family, path) {
      if (found.has(family.id)) return;
      found.set(family.id, { ...family, path: [...path, family.label] });
      family.parents.forEach(id => {
        const parent = families.find(item => item.id === id);
        if (parent) visit(parent, [...path, family.label]);
      });
    }
    families.filter(family => family.members.some(name => canonicalName(name) === canonicalName(drug.name)))
      .forEach(family => visit(family, [drug.name]));
    return [...found.values()];
  }
  const familyRules = families; // exported for inspecting the demo registry
  const expansionOptions = expanded => typeof expanded === 'object' && expanded !== null
    ? { atc: Boolean(expanded.atc), families: Boolean(expanded.families) }
    : { atc: Boolean(expanded), families: Boolean(expanded) };
  function sideMatch(row, side, drug, expanded = true) {
    const name = String(value(row[`Thuốc ${side}`]));
    const code = atc(value(row[`ATC ${side}`]));
    const selectedCode = atc(drug.code);
    const selectedName = canonicalName(drug.name);
    const base = { side, selected: drug.name, selectedCode, sourceName: name, sourceCode: code };
    if (canonicalName(name) === selectedName && code === selectedCode) {
      return { ...base, kind: 'exact', rank: 0, reason: 'Đúng tên thuốc và mã ATC' };
    }
    const options = expansionOptions(expanded);
    if (!options.atc && !options.families) return null;
    const family = options.families && groupsForDrug(drug).find(item => item.sourceLabels.some(label => fold(label) === fold(name)));
    if (family) return { ...base, kind: 'family', rank: 2, familyId: family.id, path: family.path,
      reference: family.reference || family.references?.[0],
      reason: `${family.path.join(' → ')} (phân loại nhóm dược lý, độc lập với ATC)` };
    // Equal short group codes alone are not identities: V03A occurs under unrelated families.
    if (options.atc && /^[A-Z]\d{2}[A-Z]{2}\d{2}$/.test(selectedCode) && code === selectedCode) {
      return { ...base, kind: 'atc', rank: 1, reason: `Cùng mã hoạt chất ${code}` };
    }
    // Only directional, proper ATC ancestors at pharmacological/chemical group levels.
    // Never infer siblings, descendants, organ-level groups or arbitrary string prefixes.
    if (options.atc && /^[A-Z]\d{2}[A-Z]{2}\d{2}$/.test(selectedCode) && /^[A-Z]\d{2}[A-Z]{1,2}$/.test(code)
      && code.length < selectedCode.length && selectedCode.startsWith(code)) {
      const approved = (confirmedGroups[code] || []).some(label => fold(label) === fold(name));
      return { ...base, kind: approved ? 'parent' : 'review', rank: approved ? 2 : 3,
        reason: approved ? `${selectedCode} → nhóm cha ${code}: ${name}` : `Mã nhóm ${code} khớp tiền tố nhưng tên “${name}” chưa được xác nhận là nhóm chung của ${drug.name}` };
    }
    return null;
  }
  function analyze(rows, drugs, expanded = true) {
    const confirmed = [], candidates = [];
    if (!drugs.length) return { confirmed, candidates, exactCount: 0 };
    rows.forEach((row, index) => {
      const matches = [];
      if (drugs.length === 1) {
        [1, 2].forEach(side => {
          const match = sideMatch(row, side, drugs[0], expanded);
          if (match) matches.push([match]);
        });
      } else {
        drugs.forEach((a, i) => drugs.slice(i + 1).forEach(b => {
          [[1, 2], [2, 1]].forEach(([sideA, sideB]) => {
            const ma = sideMatch(row, sideA, a, expanded), mb = sideMatch(row, sideB, b, expanded);
            if (ma && mb) matches.push([ma, mb]);
          });
        }));
      }
      if (!matches.length) return;
      matches.sort((a, b) => Number(a.some(x => x.kind === 'review')) - Number(b.some(x => x.kind === 'review'))
        || a.reduce((sum, x) => sum + x.rank, 0) - b.reduce((sum, x) => sum + x.rank, 0));
      const evidence = matches[0];
      const item = { row, sheetRow: index + 2, evidence, expanded: evidence.some(x => x.rank > 0) };
      (evidence.some(x => x.kind === 'review') ? candidates : confirmed).push(item);
    });
    return { confirmed, candidates, exactCount: confirmed.filter(item => !item.expanded).length };
  }
  const api = { value, fold, atc, canonicalName, confirmedGroups, familyRules, families, groupsForDrug, expansionOptions, sideMatch, analyze };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InteractionDemo = api;
})(typeof window !== 'undefined' ? window : globalThis);
