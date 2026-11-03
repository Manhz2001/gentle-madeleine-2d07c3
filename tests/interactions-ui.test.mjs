import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../tra-cuu-thuoc-tuong-tac-thuoc.html', import.meta.url), 'utf8');
const groupScript = readFileSync(new URL('../js/interaction-groups.js', import.meta.url), 'utf8');
const registryScript = readFileSync(new URL('../js/interaction-registry.js', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => match[1]).find(code => code.includes('function searchInteraction'));
assert.ok(script, 'The deployed HTML must contain the interaction module script');

const columns = ['STT', 'ATC 1', 'Thuốc 1', 'Nhóm tác dụng 1', 'ATC 2', 'Thuốc 2', 'Nhóm tác dụng 2', 'Mức độ', 'Cơ chế', 'Hậu quả', 'Xử trí', 'Nguồn'];
const colors = ['#c00000', '#b25900', '#805b00', '#1f4e78', '#595959'];
const levels = ['Rất nghiêm trọng (Chống chỉ định)', 'Nghiêm trọng', 'Đáng kể (Cần điều chỉnh liều)', 'Đáng kể - Trung bình', 'Nhẹ - Không đáng kể'];

function fixture(overrides = {}) {
  return {
    STT: { value: 1 }, 'ATC 1': { value: 'A01AA01' }, 'Thuốc 1': { value: 'Đường thử Á' },
    'Nhóm tác dụng 1': { value: 'Nhóm chỉ dùng để hiển thị' },
    'ATC 2': { value: 'B02BB02' }, 'Thuốc 2': { value: 'Thuốc thử B' },
    'Nhóm  tác dụng 2': { value: 'Nhóm thứ hai' }, 'Mức độ': { value: levels[0], foreground: colors[0] },
    'Cơ chế': { value: 'Cơ chế giả định <b>giữ nguyên văn bản</b>' },
    'Hậu quả': { value: 'Hậu quả giả định' }, 'Xử trí': { value: 'Dòng đầu\nDòng thứ hai' },
    'Nguồn': 'Tài liệu kiểm thử giả định', ...overrides,
  };
}

// Small DOM double: tests execute the production functions and their event handlers.
// CSS layout/computed colors are covered separately by the browser verification.
class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.attributes = {};
    this.listeners = new Map(); this.value = ''; this.disabled = false; this._text = ''; this.className = '';
    this.classList = { add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); } };
  }
  set textContent(value) { this.children = []; this._text = String(value); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  get firstElementChild() { return this.children[0] || null; }
  get lastElementChild() { return this.children.at(-1) || null; }
  appendChild(child) { this._text = ''; this.children.push(child); return child; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  replaceChildren(...children) { this._text = ''; this.children = []; this.append(...children); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(event, listener) { this.listeners.set(event, [...(this.listeners.get(event) || []), listener]); }
  async dispatch(event, extra = {}) {
    for (const listener of this.listeners.get(event) || []) await listener({ target: this, preventDefault() {}, ...extra });
  }
  contains(target) { return this === target || this.children.some(child => child.contains(target)); }
  focus() { this.focused = true; }
}

function harness({ rows = [fixture()], status = 200, payload = rows, fetchError } = {}) {
  const ids = ['searchInput', 'btnSearch', 'suggestionsBox', 'chips', 'msgInit', 'msgError', 'msgEmpty', 'pcBody', 'mobileResults'];
  const nodes = Object.fromEntries(ids.map(id => [id, new Element()]));
  const document = new Element();
  document.querySelector = selector => nodes[selector.slice(1)];
  document.createElement = tag => new Element(tag);
  document.body = { scrollHeight: 100 }; document.documentElement = { scrollHeight: 100 };
  const window = new Element(); window.parent = { postMessage() {} };
  const pendingTimers = new Map(); let timerId = 0;
  const requests = [];
  const context = vm.createContext({
    document, window,
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    setTimeout: callback => { const id = ++timerId; pendingTimers.set(id, callback); return id; },
    clearTimeout: id => pendingTimers.delete(id),
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (fetchError) throw fetchError;
      return { ok: status >= 200 && status < 300, status, json: async () => payload };
    },
  });
  vm.runInContext(registryScript, context, { filename: 'interaction-registry.js' });
  vm.runInContext(groupScript, context, { filename: 'interaction-groups.js' });
  vm.runInContext(script, context, { filename: 'interaction-module.inline.js' });
  const evaluate = code => vm.runInContext(code, context);
  const call = (name, ...args) => { context.testArgs = args; return evaluate(`${name}(...testArgs)`); };
  return {
    nodes, requests, context, call, evaluate,
    ready: () => window.dispatch('load'),
    state: () => evaluate('({ dataReady, allData, suggestionsList, selectedDrugs })'),
    flushTimers: async () => { const callbacks = [...pendingTimers.values()]; pendingTimers.clear(); for (const callback of callbacks) await callback(); },
    select: name => { const item = evaluate('suggestionsList').find(drug => drug.name === name); assert.ok(item, `Missing fixture drug ${name}`); call('selectSuggestion', item); return item; },
  };
}

test('hides STT and renders the other eleven source fields and normalizes the double-space source header', async () => {
  const h = harness(); await h.ready();
  h.call('renderResults', h.state().allData);
  const desktop = h.nodes.pcBody.children.slice(1);
  const mobile = h.nodes.mobileResults.firstElementChild.children.slice(1);
  assert.deepEqual(desktop.map(row => row.firstElementChild.textContent), columns.filter(key => key !== "STT").map(key => key.toLocaleUpperCase('vi')));
  assert.deepEqual(mobile.map(field => field.firstElementChild.textContent), columns.filter(key => key !== "STT").map(key => key.toLocaleUpperCase('vi')));
  assert.equal(desktop[5].lastElementChild.textContent, 'Nhóm thứ hai');
  assert.equal(desktop[7].lastElementChild.textContent, 'Cơ chế giả định <b>giữ nguyên văn bản</b>');
  assert.equal(desktop[9].lastElementChild.textContent, 'Dòng đầu\nDòng thứ hai');
  assert.equal(desktop[9].lastElementChild.style.whiteSpace, 'pre-wrap');
  assert.ok(!h.nodes.pcBody.textContent.includes('NHÓM TƯƠNG TÁC'));
});

test('preserves all five direct API colors and text styles in desktop and mobile', async () => {
  const rows = colors.map((color, i) => fixture({ STT: i + 1, 'Mức độ': { value: levels[i], foreground: color, isBold: true, isItalic: true, isUnderlined: true } }));
  const h = harness({ rows }); await h.ready(); h.call('renderResults', h.state().allData);
  for (let i = 0; i < 5; i++) {
    const desktopValue = h.nodes.pcBody.children[i * 12 + 7].lastElementChild;
    const mobileValue = h.nodes.mobileResults.children[i].children[7].lastElementChild;
    for (const node of [desktopValue, mobileValue]) {
      assert.equal(node.style.color, colors[i]);
      assert.equal(node.style.fontWeight, '800'); assert.equal(node.style.fontStyle, 'italic');
      assert.equal(node.style.textDecoration, 'underline');
    }
  }
});

test('severity frames do not depend on MOH attribution and use five separate levels', async () => {
  const rows = levels.map((level, i) => fixture({ STT: i, 'Mức độ': { value: level, foreground: colors[i] } }));
  const h = harness({ rows }); await h.ready(); h.call('renderResults', h.state().allData);
  const keys = ['critical', 'serious', 'significant', 'moderate', 'minor'];
  for (let i = 0; i < rows.length; i++) {
    assert.match(h.nodes.pcBody.children[i * 12].className, new RegExp(`severity-${keys[i]}`));
    assert.match(h.nodes.mobileResults.children[i].className, new RegExp(`severity-${keys[i]}`));
    assert.ok(!h.nodes.mobileResults.children[i].firstElementChild.textContent.includes('Bộ Y tế'));
  }
  const moh = h.call('normalizeRows', [fixture({ 'Nguồn': 'Quyết định 5948/QĐ-BYT' })])[0];
  assert.equal(h.call('isContraindicatedByMOH', moh), true);
  h.call('renderResults', [moh]);
  assert.match(h.nodes.pcBody.textContent, /Chống chỉ định Bộ Y tế/);
});

test('suggestions search only ATC/name and fold Vietnamese accents, đ, case and whitespace', async () => {
  const h = harness(); await h.ready();
  for (const query of ['duong thu a', ' ĐƯỜNG   THỬ Á ', 'a01aa01', 'A01']) assert.equal(h.call('matchingSuggestions', query).length, 1);
  for (const query of ['Cơ chế', 'Hậu quả', 'Nhóm chỉ dùng', 'Tài liệu kiểm thử', 'Dòng thứ hai']) assert.equal(h.call('matchingSuggestions', query).length, 0);
  h.nodes.searchInput.value = 'duong thu a';
  await h.nodes.searchInput.dispatch('input'); await h.flushTimers();
  assert.equal(h.nodes.suggestionsBox.children.length, 1);
  assert.equal(h.nodes.suggestionsBox.firstElementChild.textContent, 'A01AA01 · Đường thử Á');
  await h.nodes.suggestionsBox.firstElementChild.dispatch('click');
  assert.equal(h.state().selectedDrugs.length, 1);
  assert.equal(h.nodes.searchInput.value, '');
});

test('all matching suggestions are reachable beyond the former fifteen-item limit', async () => {
  const rows = Array.from({ length: 20 }, (_, i) => fixture({ 'ATC 1': `A01XX${i}`, 'Thuốc 1': `Thuốc mẫu ${i}` }));
  const h = harness({ rows }); await h.ready();
  h.nodes.searchInput.value = 'thuoc mau'; h.call('showSuggestions');
  assert.equal(h.nodes.suggestionsBox.children.length, 20);
});

test('exact ATC/name searches reject ambiguity and accept explicitly selected candidates', async () => {
  const rows = [fixture(), fixture({ 'Thuốc 1': 'Thuốc khác cùng mã', STT: 2 })];
  const h = harness({ rows }); await h.ready();
  h.nodes.searchInput.value = 'a01aa01'; await h.nodes.btnSearch.dispatch('click');
  assert.equal(h.state().selectedDrugs.length, 0);
  assert.match(h.nodes.msgError.textContent, /Có nhiều thuốc phù hợp/);
  assert.equal(h.nodes.suggestionsBox.children.length, 2);
  await h.nodes.suggestionsBox.children[1].dispatch('click');
  assert.equal(h.state().selectedDrugs.length, 1);
  h.nodes.searchInput.value = 'b02bb02'; await h.nodes.searchInput.dispatch('keydown', { key: 'Enter' });
  assert.equal(h.state().selectedDrugs.length, 2);
  assert.equal(h.nodes.pcBody.children.length, 24);
});

test('matching rejects unconfirmed name substrings without full ATCs and preserves reverse order', async () => {
  const h = harness(); await h.ready(); const drugs = h.state().suggestionsList;
  assert.equal(h.call('findInteractions', h.state().allData, drugs).length, 1);
  assert.equal(h.call('findInteractions', h.state().allData, [...drugs].reverse()).length, 1);
  assert.equal(h.call('findInteractions', h.state().allData, [{ name: 'Đường', code: 'A01AA' }, drugs.find(d => d.code === 'B02BB02')]).length, 0);
  h.nodes.searchInput.value = 'duong'; await h.nodes.btnSearch.dispatch('click');
  assert.equal(h.state().selectedDrugs.length, 0);
  assert.match(h.nodes.msgError.textContent, /Không tìm thấy tên hoặc mã ATC chính xác/);
});

test('adding/removing chips recomputes pairs without consuming unfinished input', async () => {
  const a = { name: 'Đường thử Á', code: 'A01AA01' }, b = { name: 'Thuốc thử B', code: 'B02BB02' }, c = { name: 'Thuốc thử C', code: 'C03CC03' };
  const rows = [fixture(), fixture({ STT: 2, 'ATC 2': c.code, 'Thuốc 2': c.name }), fixture({ STT: 3, 'ATC 1': b.code, 'Thuốc 1': b.name, 'ATC 2': c.code, 'Thuốc 2': c.name })];
  const h = harness({ rows }); await h.ready();
  h.select(a.name); h.select(b.name);
  assert.equal(h.nodes.pcBody.children.length, 12);
  h.select(c.name); assert.equal(h.nodes.pcBody.children.length, 36);
  h.select(c.name); assert.equal(h.state().selectedDrugs.length, 3);
  h.nodes.searchInput.value = 'unfinished query';
  await h.nodes.chips.children[2].lastElementChild.dispatch('click');
  assert.equal(h.nodes.pcBody.children.length, 12);
  assert.equal(h.state().selectedDrugs.length, 2); assert.equal(h.nodes.searchInput.value, 'unfinished query');
  await h.nodes.chips.children[0].lastElementChild.dispatch('click');
  assert.equal(h.nodes.pcBody.children.length, 24); assert.equal(h.nodes.mobileResults.children.length, 2);
  assert.equal(h.state().selectedDrugs.length, 1);
  assert.equal(h.nodes.searchInput.value, 'unfinished query');
  await h.nodes.chips.children[0].lastElementChild.dispatch('click');
  assert.equal(h.nodes.pcBody.children.length, 0); assert.equal(h.nodes.mobileResults.children.length, 0);
  assert.equal(h.nodes.msgInit.style.display, 'block'); assert.match(h.nodes.msgInit.textContent, /một thuốc/);
});

test('catalog identities stay distinct while lookup intentionally includes the same complete ATC', async () => {
  const h = harness({ rows: [fixture(), fixture({ STT: 2, 'Thuốc 1': 'Đường thử Á nhóm rộng' })] }); await h.ready();
  const catalog = h.state().suggestionsList;
  const a = catalog.find(d => d.name === 'Đường thử Á'); const b = catalog.find(d => d.name === 'Thuốc thử B');
  assert.equal(catalog.filter(d => d.code === 'A01AA01').length, 2);
  const results = h.call('findInteractions', h.state().allData, [a, b]);
  assert.equal(results.length, 2);
  assert.deepEqual(Array.from(results, row => h.call('getVal', row.STT)), [1, 2]);
});

test('load rejects malformed schema and disables search instead of claiming no interactions', async () => {
  for (const payload of [{ rows: [] }, [], [{}], [fixture({ 'Thuốc 1': '' })], { error: 'Backend unavailable' }]) {
    const h = harness({ payload }); await h.ready();
    assert.equal(h.state().dataReady, false); assert.equal(h.nodes.btnSearch.disabled, true); assert.equal(h.nodes.searchInput.disabled, true);
    assert.equal(h.nodes.msgError.style.display, 'block'); assert.match(h.nodes.msgError.textContent, /^LỖI:/);
    assert.notEqual(h.nodes.msgEmpty.style.display, 'block'); assert.equal(h.nodes.pcBody.children.length, 0);
  }
});

test('HTTP and network failures remain explicit load errors', async () => {
  for (const options of [{ status: 503 }, { fetchError: new Error('network failure') }]) {
    const h = harness(options); await h.ready();
    assert.equal(h.state().dataReady, false); assert.equal(h.nodes.btnSearch.disabled, true);
    assert.match(h.nodes.msgError.textContent, options.status ? /HTTP 503/ : /network failure/);
    assert.equal(h.nodes.msgError.style.display, 'block');
  }
});

test('unique exact ATC search and no-selection guard work through click/keyboard events', async () => {
  const h = harness(); await h.ready(); await h.nodes.btnSearch.dispatch('click');
  assert.equal(h.nodes.msgInit.style.display, 'block');
  assert.match(h.nodes.msgInit.textContent, /một thuốc/);
  assert.equal(h.nodes.pcBody.children.length, 0);
  h.nodes.searchInput.value = ' a01aa01 '; await h.nodes.searchInput.dispatch('keydown', { key: 'Enter' });
  assert.equal(h.state().selectedDrugs.length, 1);
  assert.equal(h.nodes.pcBody.children.length, 12);
  h.nodes.searchInput.value = ' B02BB02 '; await h.nodes.btnSearch.dispatch('click');
  assert.equal(h.state().selectedDrugs.length, 2); assert.equal(h.nodes.pcBody.children.length, 12);
  assert.match(h.requests[0].url, /\?v=\d+$/); assert.equal(h.requests[0].options.cache, 'no-store');
});

test('one selected drug collects related rows from either source side and pairs narrow the results', async () => {
  const rows = [fixture(), fixture({ STT: 2, 'Thuốc 1': 'Thuốc thử C', 'ATC 1': 'C03CC03', 'Thuốc 2': 'Đường thử Á', 'ATC 2': 'A01AA01' })];
  const h = harness({ rows }); await h.ready();
  h.select('Đường thử Á');
  assert.equal(h.nodes.pcBody.children.length, 24);
  assert.equal(h.nodes.mobileResults.children.length, 2);
  h.select('Thuốc thử B');
  assert.equal(h.nodes.pcBody.children.length, 12);
  await h.nodes.chips.children[1].lastElementChild.dispatch('click');
  assert.equal(h.nodes.pcBody.children.length, 24);
});

test('automatic family lookup retrieves the registered thiopurine source row without unknown-family leakage', async () => {
  const rows = [
    fixture({ STT: 101, 'Thuốc 1': 'Azathioprin', 'ATC 1': 'L04AX01', 'Thuốc 2': 'FixtureOther', 'ATC 2': 'X99XX99' }),
    fixture({ STT: 102, 'Thuốc 1': 'Thiopurines', 'ATC 1': 'V03A', 'Thuốc 2': 'Allopurinol', 'ATC 2': 'M04AA01', 'Nguồn': 'Source fixture for family lookup' }),
    fixture({ STT: 103, 'Thuốc 1': 'Unknown purine family', 'ATC 1': 'V03A', 'Thuốc 2': 'Allopurinol', 'ATC 2': 'M04AA01' }),
    fixture({ STT: 104, 'Thuốc 1': 'Thiopurines; Mercaptopurine', 'ATC 1': 'V03A', 'Thuốc 2': 'Allopurinol', 'ATC 2': 'M04AA01' }),
  ];
  const h = harness({ rows }); await h.ready();
  h.nodes.searchInput.value = 'azathioprine'; await h.nodes.searchInput.dispatch('keydown', { key: 'Enter' });
  assert.equal(h.state().selectedDrugs.length, 1);
  assert.equal(h.nodes.pcBody.children.length, 24);
  h.nodes.searchInput.value = 'allopuriol'; await h.nodes.btnSearch.dispatch('click');
  assert.equal(h.state().selectedDrugs.length, 2);
  assert.equal(h.nodes.pcBody.children.length, 12);
  assert.equal(h.nodes.mobileResults.children.length, 1);
  assert.equal(h.nodes.pcBody.children[2].lastElementChild.textContent, 'Thiopurines');
  assert.match(h.nodes.pcBody.textContent, /Source fixture for family lookup/);
  assert.ok(!h.nodes.pcBody.textContent.includes('Unknown purine family'));
  assert.ok(!h.nodes.pcBody.textContent.includes('Thiopurines; Mercaptopurine'));
  assert.equal(h.call('getVal', h.state().allData[1]['Thuốc 1']), 'Thiopurines');
});

test('production keeps the original UI without demo diagnostics, toggles or source locators', () => {
  assert.match(html, /<script[^>]+src=["'][^"']*\/js\/interaction-groups\.js[^"']*["']/);
  assert.ok(html.indexOf('/js/interaction-groups.js') < html.indexOf('const Demo = window.InteractionDemo'));
  assert.doesNotMatch(html, /<(?:div|section|button|input)[^>]+(?:class|id)=["'][^"']*\bdemo(?:[-_\s]|["'])/i);
  assert.doesNotMatch(html, /<input[^>]+type=["']checkbox["']/i);
  assert.doesNotMatch(html, /(?:Hàng nguồn|Chờ rà soát|Khớp trực tiếp|demoStats|demoResults|demoCandidates)/i);
});

test('registered aliases with the same ATC share one suggestion identity and do not duplicate chips', async () => {
  const rows = [
    fixture({ 'Thuốc 1': 'Mercaptopurin (6-MP)', 'ATC 1': 'L01BB02' }),
    fixture({ STT: 2, 'Thuốc 1': 'Mercaptopurine', 'ATC 1': 'L01BB02' }),
  ];
  const h = harness({ rows }); await h.ready();
  assert.equal(h.state().suggestionsList.filter(drug => drug.code === 'L01BB02').length, 1);
  for (const alias of ['6-MP', 'mercaptopurine']) {
    h.nodes.searchInput.value = alias; await h.nodes.btnSearch.dispatch('click');
  }
  assert.equal(h.state().selectedDrugs.length, 1);
  assert.equal(h.nodes.pcBody.children.length, 24);
});

test('supplemental concrete names retrieve class-only source rows through normal search events', async () => {
  const h = harness({ rows: [
    fixture({ STT: 1, 'Thuốc 1': 'Corticosteroid toàn thân', 'ATC 1': 'H02AB' }),
    fixture({ STT: 2, 'Thuốc 1': 'Thuốc chẹn beta', 'ATC 1': 'C07AA' }),
  ] });
  await h.ready();
  for (const query of ['methylprednisolone', 'bisoprolol']) {
    h.nodes.searchInput.value = query; await h.nodes.searchInput.dispatch('keydown', { key: 'Enter' });
    assert.equal(h.state().selectedDrugs.length, 1);
    assert.equal(h.nodes.mobileResults.children.length, 1);
    h.select('Thuốc thử B');
    assert.equal(h.nodes.mobileResults.children.length, 1);
    for (const chip of [...h.nodes.chips.children]) await chip.lastElementChild.dispatch('click');
  }
});

test('legacy systemic Tretinoin is selectable by old/current code without offering topical-only code', async () => {
  const h = harness({ rows: [fixture({ 'Thuốc 1': 'Tretinoin (ATRA)', 'ATC 1': 'L01XX14 / D10AD01' })] });
  await h.ready();
  assert.equal(h.call('matchingSuggestions', 'L01XX14').length, 1);
  assert.equal(h.call('matchingSuggestions', 'L01XF01').length, 1);
  assert.equal(h.call('matchingSuggestions', 'D10AD01').length, 0);
  h.nodes.searchInput.value = 'L01XX14'; await h.nodes.btnSearch.dispatch('click');
  assert.equal(h.state().selectedDrugs[0].code, 'L01XF01');
  assert.equal(h.nodes.mobileResults.children.length, 1);
  assert.match(h.nodes.pcBody.textContent, /L01XX14 \/ D10AD01/);
});
