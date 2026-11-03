(function (root) {
  const registry = typeof module !== 'undefined' && module.exports
    ? require('./interaction-registry.js') : root.InteractionRegistry;
  if (!registry) throw new Error('Không thể tải danh mục nhóm tương tác thuốc.');
  const value = cell => cell && typeof cell === 'object' && 'value' in cell ? cell.value ?? '' : cell ?? '';
  const fold = text => String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const atc = text => String(text ?? '').trim().toUpperCase();
  const aliases = new Map([['azathioprine', 'azathioprin'], ['allopuriol', 'allopurinol'],
    ['mercaptopurine', 'mercaptopurin'], ['mercaptopurin (6-mp)', 'mercaptopurin'], ['6-mp', 'mercaptopurin'],
    ['tioguanine', 'thioguanine'], ['thioguanin', 'thioguanine'], ...registry.aliases]);
  const canonicalName = text => aliases.get(fold(text)) || fold(text);
  const confirmedGroups = {};
  const parentRules = new Map();
  registry.parentRules.forEach(rule => {
    if (rule.prefixes.includes(rule.sourceCode)) (confirmedGroups[rule.sourceCode] ||= []).push(rule.name);
    parentRules.set(`${fold(rule.name)}|${rule.sourceCode}`, rule);
  });
  const validSubstance = code => /^[A-Z]\d{2}[A-Z]{2}\d{2}$/.test(code);
  const validParent = code => /^[A-Z]\d{2}[A-Z]{0,2}$/.test(code);
  function parseATCCodes(text) {
    const tokens = atc(text).split(/\s*[/;,]\s*/);
    return tokens.length && tokens.every(code => validSubstance(code) || validParent(code)) ? [...new Set(tokens)] : [];
  }
  // Legacy codes are scoped to the substance: the source assigns L04AA10 to two different medicines.
  function effectiveCodes(drug) {
    const name = canonicalName(drug.name);
    let codes = parseATCCodes(drug.code).map(code => {
      const mapping = registry.codeMappings.find(rule => rule.from === code && rule.names.some(item => canonicalName(item) === name));
      return mapping ? mapping.to : code;
    });
    // The source's ATRA combination includes an acne code. Keep systemic interaction scope.
    if (registry.systemicTretinoinNames.some(item => canonicalName(item) === name) && codes.includes('L01XF01')) {
      codes = codes.filter(code => code !== 'D10AD01');
    }
    return [...new Set(codes)];
  }
  function drugIdentity(name, code) {
    const codes = effectiveCodes({ name, code });
    return JSON.stringify([canonicalName(name), codes.length ? codes.sort().join('/') : atc(code)]);
  }
  function buildDrugCatalog(rows) {
    const catalog = new Map();
    function add(name, rawCode) {
      name = String(name).trim(); rawCode = String(rawCode).trim();
      if (!name) return;
      const codes = effectiveCodes({ name, code: rawCode });
      const code = codes.length ? codes.join(' / ') : rawCode;
      const id = drugIdentity(name, code);
      if (!catalog.has(id)) catalog.set(id, { id, name, code, searchCodes: [], searchLabels: [] });
      const item = catalog.get(id);
      const compatibleTokens = parseATCCodes(rawCode).filter(token => effectiveCodes({ name, code: token }).some(item => codes.includes(item)));
      item.searchCodes = [...new Set([...item.searchCodes, ...compatibleTokens, code, ...codes])];
      item.searchLabels = [...new Set([...item.searchLabels, rawCode, `${rawCode} · ${name}`, `${code} · ${name}`])];
    }
    rows.forEach(row => [1, 2].forEach(side => add(value(row[`Thuốc ${side}`]), value(row[`ATC ${side}`]))));
    registry.supplementalDrugs.forEach(drug => add(drug.name, drug.code));
    return [...catalog.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi') || a.code.localeCompare(b.code));
  }
  // Family membership is independent of ATC. Names identify substances here;
  // row ATCs (including placeholders such as V03A) never define these edges.
  const originalFamilies = [
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
  const families = [...originalFamilies.filter(family => !registry.families.some(item => item.id === family.id)), ...registry.families]
    .map(family => ({ parents: [], ...family }));
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
  const familyRules = families;
  const expansionOptions = expanded => typeof expanded === 'object' && expanded !== null
    ? { atc: Boolean(expanded.atc), families: Boolean(expanded.families) }
    : { atc: Boolean(expanded), families: Boolean(expanded) };
  function sideMatch(row, side, drug, expanded = true, profile) {
    const name = String(value(row[`Thuốc ${side}`]));
    const code = atc(value(row[`ATC ${side}`]));
    const selectedCode = atc(drug.code);
    const selectedName = profile?.name ?? canonicalName(drug.name);
    const sourceCodes = effectiveCodes({ name, code });
    const selectedCodes = profile?.codes ?? effectiveCodes(drug);
    const base = { side, selected: drug.name, selectedCode, sourceName: name, sourceCode: code };
    if (canonicalName(name) === selectedName && (code === selectedCode || sourceCodes.some(item => selectedCodes.includes(item)))) {
      return { ...base, kind: 'exact', rank: 0, reason: 'Đúng tên thuốc và mã ATC' };
    }
    const options = expansionOptions(expanded);
    if (!options.atc && !options.families) return null;
    const family = options.families && (profile?.groups ?? groupsForDrug(drug)).find(item => item.sourceLabels.some(label => fold(label) === fold(name)));
    if (family) return { ...base, kind: 'family', rank: 2, familyId: family.id, path: family.path,
      reference: family.reference || family.references?.[0],
      reason: `${family.path.join(' → ')} (phân loại nhóm dược lý, độc lập với ATC)` };
    // Equal short group codes alone are not identities: V03A occurs under unrelated families.
    const sharedCode = sourceCodes.find(item => validSubstance(item) && selectedCodes.includes(item));
    if (options.atc && sharedCode) {
      return { ...base, kind: 'atc', rank: 1, reason: `Cùng mã hoạt chất ${sharedCode}` };
    }
    // Match a known source code AND label before applying its verified scope.
    // Some source labels use an incorrect or overly broad ATC (e.g. beta blockers C07AA).
    if (options.atc) {
      const substances = selectedCodes.filter(validSubstance);
      const rule = parentRules.get(`${fold(name)}|${code}`);
      if (rule) {
        const matched = substances.find(item => rule.prefixes.some(prefix => item.startsWith(prefix)));
        if (matched) return { ...base, kind: 'parent', rank: 2, matchedCode: matched, reference: rule.references?.[0],
          reason: `${matched} → nhóm ${name} (${rule.prefixes.join(', ')})` };
        return null;
      }
      const parent = sourceCodes.find(item => validParent(item) && substances.some(selected => selected.startsWith(item)));
      if (parent) return { ...base, kind: 'review', rank: 3,
        reason: `Mã nhóm ${parent} khớp tiền tố nhưng tên “${name}” chưa được xác nhận là nhóm chung của ${drug.name}` };
    }
    return null;
  }
  function analyze(rows, drugs, expanded = true) {
    const confirmed = [], candidates = [];
    if (!drugs.length) return { confirmed, candidates, exactCount: 0 };
    const profiles = new Map(drugs.map(drug => [drug, { name: canonicalName(drug.name), codes: effectiveCodes(drug), groups: groupsForDrug(drug) }]));
    rows.forEach((row, index) => {
      const matches = [];
      if (drugs.length === 1) {
        [1, 2].forEach(side => {
          const match = sideMatch(row, side, drugs[0], expanded, profiles.get(drugs[0]));
          if (match) matches.push([match]);
        });
      } else {
        drugs.forEach((a, i) => drugs.slice(i + 1).forEach(b => {
          [[1, 2], [2, 1]].forEach(([sideA, sideB]) => {
            const ma = sideMatch(row, sideA, a, expanded, profiles.get(a)), mb = sideMatch(row, sideB, b, expanded, profiles.get(b));
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
  const api = { value, fold, atc, canonicalName, parseATCCodes, effectiveCodes, drugIdentity, buildDrugCatalog,
    registry, confirmedGroups, familyRules, families, groupsForDrug, expansionOptions, sideMatch, analyze };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InteractionDemo = api;
})(typeof window !== 'undefined' ? window : globalThis);
