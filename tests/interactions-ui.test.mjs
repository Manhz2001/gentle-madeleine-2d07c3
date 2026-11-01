import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../tra-cuu-thuoc-tuong-tac-thuoc.html', import.meta.url), 'utf8');
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
  assert.equal(h.nodes.pcBody.children.length, 12);
});

test('exact matching rejects substring pairs and preserves reverse order', async () => {
  const h = harness(); await h.ready(); const drugs = h.state().suggestionsList;
  assert.equal(h.call('findInteractions', h.state().allData, drugs).length, 1);
  assert.equal(h.call('findInteractions', h.state().allData, [...drugs].reverse()).length, 1);
  assert.equal(h.call('findInteractions', h.state().allData, [{ name: 'Đường', code: 'A01AA01' }, drugs.find(d => d.code === 'B02BB02')]).length, 0);
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
  assert.equal(h.nodes.pcBody.children.length, 0); assert.equal(h.nodes.mobileResults.children.length, 0);
  assert.equal(h.nodes.msgInit.style.display, 'block'); assert.match(h.nodes.msgInit.textContent, /tối thiểu 2/);
});

test('same ATC with different names remains distinct, not a broad substring/group match', async () => {
  const h = harness({ rows: [fixture(), fixture({ STT: 2, 'Thuốc 1': 'Đường thử Á nhóm rộng' })] }); await h.ready();
  const catalog = h.state().suggestionsList;
  const a = catalog.find(d => d.name === 'Đường thử Á'); const b = catalog.find(d => d.name === 'Thuốc thử B');
  assert.equal(catalog.filter(d => d.code === 'A01AA01').length, 2);
  const results = h.call('findInteractions', h.state().allData, [a, b]);
  assert.equal(results.length, 1); assert.equal(h.call('getVal', results[0].STT), 1);
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
  assert.match(h.nodes.msgError.textContent, /ÍT NHẤT HAI/);
  h.nodes.searchInput.value = ' a01aa01 '; await h.nodes.searchInput.dispatch('keydown', { key: 'Enter' });
  assert.equal(h.state().selectedDrugs.length, 1);
  h.nodes.searchInput.value = ' B02BB02 '; await h.nodes.btnSearch.dispatch('click');
  assert.equal(h.state().selectedDrugs.length, 2); assert.equal(h.nodes.pcBody.children.length, 12);
  assert.match(h.requests[0].url, /\?v=\d+$/); assert.equal(h.requests[0].options.cache, 'no-store');
});

