// Read-only access to the fixed DrugView catalogue; a patient's query is never sent upstream.
export const DRUGVIEW_API_URL = 'https://script.google.com/macros/s/AKfycbwPjxaE67xfN1pV4A6nO2ND-tjOc_65jvpBR1xfeBwBSkVFMHf5IbLQ5rKWGu_xsRQ23Q/exec';
export const DRUGVIEW_PUBLIC_URL = 'https://gentle-madeleine-2d07c3.netlify.app/tra-cuu-thuoc-tiem-truyen.html';
const CACHE_MS = 300000, MAX_BYTES = 15 * 1024 * 1024, MAX_FIELD = 12000, MAX_EXCERPT = 18000;
const BASE = ['Hoạt chất', 'Biệt dược', 'Dạng bào chế'];
const SAFETY = ['Chống chỉ định', 'Cảnh báo thuốc'];
const GENERAL = ['Chỉ định', 'Cách dùng', 'Tác dụng phụ', 'PNCT&PNCCB'];
const DOSE = ['Chỉ định', 'Liều dùng', 'Liều tối đa', 'Cách dùng', 'PNCT&PNCCB'];
const DILUTION = ['Đường tiêm', 'Dung môi hoàn nguyên', 'Cách hoàn nguyên', 'Dung môi pha loãng', 'Nồng độ khuyến nghị', 'Bảo quản sau hoàn nguyên', 'Bảo quản sau pha loãng', 'Bảo quản', 'Thời gian/tốc độ khuyến cáo tiêm, truyền tĩnh mạch', 'Lưu ý khi tiêm, truyền tĩnh mạch', 'Tương hợp', 'Tương kỵ', 'Cách dùng'];
const COMMON = new Set('toi minh ban giup hay cho xem tra cuu thong tin thuoc lieu dung cach pha truyen tiem than dinh canh bao chong dieu tri nguyen hoan loang nong khuyen nghi tac phu chi nhom hoat chat ham luong the nao khong nhung truoc sau voi cua trong mot cac medical medicine drug dose dosing what tell about used use information'.split(' '));
const OFFICIAL = ['drugviewninhbinh.com', 'moh.gov.vn', 'dav.gov.vn', 'kcb.vn', 'vncdc.gov.vn', 'who.int', 'nhs.uk', 'nice.org.uk', 'fda.gov', 'ema.europa.eu', 'nih.gov', 'cdc.gov'];
let rows = null, loadedAt = 0, inflight = null, lastError = false;

export class DrugViewUnavailable extends Error {}
const failure = () => new DrugViewUnavailable('Chưa tải được danh mục DrugView. Không tự chuyển sang nguồn mở hoặc dùng dữ liệu nhớ sẵn.');
const normal = value => String(value).toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const words = value => new Set((normal(value).match(/[a-z0-9]+/g) || []).filter(w => w.length >= 3 && !/^\d+$/.test(w) && !COMMON.has(w)));
export function cellText(cell) {
  const value = cell && typeof cell === 'object' && !Array.isArray(cell) ? cell.value : cell;
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) ? String(value).trim() : '';
}
function safeUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') ? u : null; } catch { return null; }
}
export function closedUrlAllowed(value) {
  const u = safeUrl(value); if (!u) return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (OFFICIAL.some(d => host === d || host.endsWith(`.${d}`))) return true;
  return (host === 'drive.google.com' && /^\/file\/d\/[A-Za-z0-9_-]+(?:\/|$)/.test(u.pathname)) || (host === 'docs.google.com' && /^\/(?:document|spreadsheets)\/d\/[A-Za-z0-9_-]+(?:\/|$)/.test(u.pathname));
}
export function allowedFetchUrl(value) {
  const u = safeUrl(value); if (!u) return false;
  return u.hostname === 'script.google.com' || u.hostname === 'script.googleusercontent.com' || u.hostname.endsWith('.script.googleusercontent.com');
}
export function drugviewStatus(enabled = true) {
  return {provider:'drugview-api', configured:Boolean(enabled), recordCount:rows === null ? null : rows.length, sourceUrl:DRUGVIEW_PUBLIC_URL, loaded:rows !== null, cacheFresh:rows !== null && Date.now() - loadedAt < CACHE_MS, lastFetchFailed:lastError, provenance:'published_drugview'};
}
async function readLimited(response) {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw failure();
  if (!response.body) throw failure();
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try { for (;;) { const {value, done} = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) throw failure(); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const all = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', {fatal:true}).decode(all).replace(/^\uFEFF/, '');
}
async function fetchRows({signal, fetchImpl}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
  const merged = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  let target = DRUGVIEW_API_URL;
  try {
    for (let hop = 0; hop < 5; hop++) {
      merged.throwIfAborted(); if (!allowedFetchUrl(target)) throw failure();
      const response = await fetchImpl(target, {method:'GET', redirect:'manual', signal:merged, headers:{Accept:'application/json', 'Accept-Encoding':'identity'}});
      if ([301,302,303,307,308].includes(response.status)) {
        const location = response.headers.get('location'); await response.body?.cancel().catch(() => {});
        if (!location || location.length > 16000) throw failure();
        target = new URL(location, target).href; continue;
      }
      if (!response.ok) { await response.body?.cancel().catch(() => {}); throw failure(); }
      const value = JSON.parse(await readLimited(response));
      if (!Array.isArray(value) || value.length > 5000 || value.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw failure();
      return value;
    }
    throw failure();
  } finally { clearTimeout(timer); }
}
async function awaitWithAbort(promise, signal) {
  if (!signal) return promise;
  signal.throwIfAborted(); let listener;
  const aborted = new Promise((_, reject) => { listener = () => reject(signal.reason || new Error('Request aborted')); signal.addEventListener('abort', listener, {once:true}); });
  try { return await Promise.race([promise, aborted]); } finally { signal.removeEventListener('abort', listener); }
}
async function catalogue(options) {
  options.signal?.throwIfAborted();
  if (rows !== null && Date.now() - loadedAt < CACHE_MS) return rows;
  if (!inflight) {
    inflight = fetchRows(options).then(value => { rows = value; loadedAt = Date.now(); lastError = false; return value; }).catch(() => { lastError = true; throw failure(); }).finally(() => { inflight = null; });
  }
  return awaitWithAbort(inflight, options.signal);
}
function scope(query) {
  const text = normal(query);
  if (['hoan nguyen', 'pha loang', 'dung moi', 'nong do', 'tiem', 'truyen', 'tuong ky', 'tuong hop', 'bao quan'].some(t => text.includes(t))) return DILUTION;
  if (['lieu', 'than', 'mlct', 'crcl', 'egfr'].some(t => text.includes(t))) return DOSE;
  if (text.includes('tuong tac')) return ['Tương tác thuốc', 'Chỉ định', 'Cách dùng'];
  return GENERAL;
}
export function sourcesFromRows(inputRows, query, allowedUrl = closedUrlAllowed) {
  const terms = words(query); if (!terms.size) return [];
  const selected = scope(query), matches = [];
  inputRows.forEach((row, index) => {
    const [activity, brand, form] = BASE.map(key => cellText(row[key]));
    if ((!activity && !brand) || Math.max(activity.length, brand.length, form.length) > 1200) return;
    const titleWords = words(`${activity} ${brand}`), titleHits = [...terms].filter(t => titleWords.has(t)).length;
    const reference = row['Tài liệu tham khảo'], url = reference && typeof reference === 'object' && typeof reference.url === 'string' ? reference.url.trim() : '';
    if (!titleHits || !allowedUrl(url) || SAFETY.some(key => cellText(row[key]).length > MAX_FIELD)) return;
    const lines = ['Dữ liệu công bố trên DrugView Ninh Bình; chưa xác nhận riêng việc thẩm định tờ hướng dẫn trong lần tra cứu này.'];
    for (const key of [...BASE, ...SAFETY]) { const value = cellText(row[key]); if (value) lines.push(`${key}: ${value}`); }
    const length = () => lines.reduce((sum, s) => sum + s.length, 0);
    if (length() > MAX_EXCERPT) return;
    const missing = SAFETY.filter(key => !cellText(row[key])), omitted = [];
    for (const key of selected) {
      if (BASE.includes(key) || SAFETY.includes(key)) continue;
      const value = cellText(row[key]); if (!value) { missing.push(key); continue; }
      const field = `${key}: ${value}`;
      if (value.length > MAX_FIELD || length() + field.length > MAX_EXCERPT) { omitted.push(key); continue; }
      lines.push(field);
    }
    if (missing.length) lines.push(`Mục chưa có dữ liệu trong danh mục: ${missing.join('; ')}. Không được hiểu là không có chống chỉ định hoặc cảnh báo.`);
    if (omitted.length) lines.push(`Mục không hiển thị vì quá dài, cần đọc trực tiếp tài liệu gốc: ${omitted.join('; ')}.`);
    lines.push('Đối chiếu tài liệu tham khảo gốc trước khi áp dụng cho người bệnh.');
    const record = {id:`drugview_${String(index + 1).padStart(4,'0')}`, title:[...new Set([activity,brand,form].filter(Boolean))].join(' · '), url, excerpt:lines.join('\n\n'), tags:[activity,brand].filter(Boolean), origin:'closed', provenance:'published_drugview'};
    matches.push({hits:titleHits, index, record});
  });
  return matches.sort((a,b) => b.hits-a.hits || a.index-b.index).slice(0,24).map(m => m.record);
}
export async function getDrugviewSources(query, {enabled = true, signal, fetchImpl = fetch} = {}) {
  if (!enabled) return [];
  return sourcesFromRows(await catalogue({signal, fetchImpl}), query);
}
// Unit tests reset only memory; this is never exposed as an HTTP or model tool.
export function resetDrugviewCacheForTests({cachedRows = null, cachedAt = 0} = {}) { rows = cachedRows; loadedAt = cachedAt; inflight = null; lastError = false; }
