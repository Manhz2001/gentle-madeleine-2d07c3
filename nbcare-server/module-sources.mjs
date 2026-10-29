// Fixed published DrugView module sources. Clinical/patient queries are matched
// locally; no patient narrative is sent in an upstream URL or request body.
export const MODULES=Object.freeze({
  interactions:{api:'https://script.google.com/macros/s/AKfycbxybEUZXYbZxuz2EESUzC1tgIb1nWw4I7CrLTB6yIpGFYk1pLzfNl9Z8V2Kb49HyryS/exec',sheetId:'1XKOSQrEAUXg1TPr7TlLUT7CET4ONkJVF9P9CDX3SXn0',tab:'Data',title:'Module tương tác thuốc — DrugView Ninh Bình'},
  compatibility:{api:'https://script.google.com/macros/s/AKfycbyvH1DMRvHlsvXmK2t_7T7_9MZ2gJwatF1oEeV5izosArhTgNAMO2dQ1mSS-K8kmQ_lJg/exec',sheetId:'16DU7A9krRN4wvFqbjUphDVQpQg-COgA76HVoPvDCN0k',tab:'Ysite',title:'Module tương hợp / tương kỵ — DrugView Ninh Bình'},
  mlct:{api:'https://script.google.com/macros/s/AKfycby1NsEE3QoqacmE4ep-It1loImsf_Zbgru3yZ7ITZVbdNNJFYTDKY-zJRhzaWYPtMR8/exec',sheetId:'1vmuz5pDyPMleMZUFphZoGAAhOoXqB62eEing3NVn8gs',tab:'Du lieu chuan hoa',gid:1879897713,title:'Module hiệu chỉnh liều theo MLCT — DrugView Ninh Bình'},
});
const STATIC='https://gentle-madeleine-2d07c3.netlify.app/';
export const MLCT_INDEX_URL=STATIC+'data/mlct-index.json';
const MAX_BYTES=12*1024*1024,MAX_FIELD=12000,MAX_EXCERPT=18000,CACHE_MS=300000;
const cache=new Map(),inflight=new Map();let cacheBytes=0;
const normal=value=>String(value??'').toLowerCase().replace(/đ/g,'d').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
export function moduleCell(cell){const value=cell&&typeof cell==='object'&&!Array.isArray(cell)?cell.value:cell;return typeof value==='string'||typeof value==='number'&&Number.isFinite(value)?String(value).trim():'';}
const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')?u:null;}catch{return null;}};
export function allowedModuleFetchUrl(value){const u=safeUrl(value);if(!u)return false;return [MODULES.interactions.api,MODULES.compatibility.api,MLCT_INDEX_URL].includes(u.href)||(u.origin===new URL(STATIC).origin&&/^\/data\/mlct-drugs\/drug-\d{4}\.json$/.test(u.pathname)&&!u.search&&!u.hash);}
const allowedRedirect=value=>{const u=safeUrl(value);return Boolean(u&&u.hostname==='script.googleusercontent.com'&&u.pathname.startsWith('/macros/'));};
async function aborted(promise,signal){if(!signal)return promise;signal.throwIfAborted();let listener;const stopped=new Promise((_,reject)=>{listener=()=>reject(signal.reason||new Error('Module lookup aborted'));signal.addEventListener('abort',listener,{once:true});});try{return await Promise.race([promise,stopped]);}finally{signal.removeEventListener('abort',listener);}}
async function readLimited(response,signal){
  if(Number(response.headers.get('content-length'))>MAX_BYTES||!response.body)throw new Error('Module data exceeds limit');
  const reader=response.body.getReader(),parts=[];let bytes=0;
  try{for(;;){const {value,done}=await aborted(reader.read(),signal);if(done)break;bytes+=value.byteLength;if(bytes>MAX_BYTES)throw new Error('Module data exceeds limit');parts.push(value);}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const output=new Uint8Array(bytes);let offset=0;for(const part of parts){output.set(part,offset);offset+=part.byteLength;}
  return new TextDecoder('utf-8',{fatal:true}).decode(output).replace(/^\uFEFF/,'');
}
async function getJSON(url,{signal,fetchImpl=fetch}={}){
  signal?.throwIfAborted();if(!allowedModuleFetchUrl(url))throw new Error('Unapproved module endpoint');
  const hit=cache.get(url);if(hit&&Date.now()-hit.at<CACHE_MS)return hit.value;
  if(inflight.has(url))return aborted(inflight.get(url),signal);
  const task=(async()=>{let target=url;const script=url===MODULES.interactions.api||url===MODULES.compatibility.api;
    for(let hop=0;hop<4;hop++){
      signal?.throwIfAborted();if(target!==url&&(!script||!allowedRedirect(target)))throw new Error('Unapproved module redirect');
      const response=await aborted(fetchImpl(target,{method:'GET',redirect:'manual',signal,headers:{Accept:'application/json','Accept-Encoding':'identity'}}),signal);
      if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel().catch(()=>{});if(!location||location.length>16000)throw new Error('Invalid module redirect');target=new URL(location,target).href;continue;}
      if(!response.ok){await response.body?.cancel().catch(()=>{});throw new Error('Module unavailable');}
      const text=await readLimited(response,signal),value=JSON.parse(text),bytes=text.length*2;
      if(cache.has(url)){cacheBytes-=cache.get(url).bytes;cache.delete(url);}
      while(cache.size&&(cache.size>=32||cacheBytes+bytes>24*1024*1024)){const key=cache.keys().next().value;cacheBytes-=cache.get(key).bytes;cache.delete(key);}
      if(bytes<=24*1024*1024){cache.set(url,{at:Date.now(),value,bytes});cacheBytes+=bytes;}
      return value;
    }throw new Error('Too many module redirects');
  })();inflight.set(url,task);try{return await task;}finally{if(inflight.get(url)===task)inflight.delete(url);}
}
function namesInQuery(names,query,drugNames=[]){
  // Prefer the longest full source names and never match one token of a pair.
  const text=' '+normal(query)+' ',explicit=new Set((Array.isArray(drugNames)?drugNames:[]).map(normal)),found=[],spans=[];
  const unique=[...new Map(names.filter(v=>typeof v==='string'&&v.length<=180).map(v=>[normal(v),v])).entries()].filter(([key])=>key.length>=3).sort((a,b)=>b[0].length-a[0].length);
  for(const [name,display] of unique){let from=0,index;while((index=text.indexOf(' '+name+' ',from))>=0){const start=index+1,end=start+name.length;from=index+name.length;if(spans.some(([a,b])=>start<b&&end>a))continue;spans.push([start,end]);found.push({name,display});break;}}
  // Tool-supplied names are still required to occur in this lookup's query.
  return found.filter(v=>!explicit.size||explicit.has(v.name)||text.includes(' '+v.name+' '));
}
const pairKey=(a,b)=>[normal(a),normal(b)].sort().join('\0');
function referenceMetadata(reference){const years=[...new Set((String(reference).match(/\b(?:19|20)\d{2}\b/g)||[]))];return years.length===1?{year:Number(years[0]),yearBasis:'Năm ghi rõ trong cột Nguồn của bản ghi; không phải ngày tải module'}:{};}
function sourceRecord(kind,index,label,fields,{reference='',rowNumber=null,snapshotGeneratedAt,legendVerified=false,rawStatus}={}){
  const module=MODULES[kind],lines=[];for(const [key,value] of fields){const text=moduleCell(value);if(text.length>MAX_FIELD)return null;if(text)lines.push(`${key}: ${text}`);}
  const excerpt=lines.join('\n\n');if(excerpt.length<30||excerpt.length>MAX_EXCERPT)return null;
  const row=Number.isSafeInteger(rowNumber)&&rowNumber>=2&&rowNumber<100000?rowNumber:null;
  const locator=row?`Tab ${module.tab}, dòng ${row}`:`Tab ${module.tab}, ${kind==='interactions'?'STT':'bản ghi API'} ${index}`;
  const metadata=referenceMetadata(reference),url=`https://docs.google.com/spreadsheets/d/${module.sheetId}/edit`+(row&&module.gid!==undefined?`#gid=${module.gid}&range=A${row}:K${row}`:'');
  const limitations=[`Dữ liệu module DrugView đã xuất bản, ${locator}. Không tự coi là bản gốc tài liệu y khoa.`,!metadata.year?'Bản ghi không có năm tài liệu được xác minh; không tự điền năm từ ngày tải hoặc ngày đồng bộ.':'Năm được giữ từ cột Nguồn; cần đối chiếu tài liệu gốc trước khi áp dụng.',kind==='compatibility'&&!legendVerified?'Giữ nguyên nhãn API; chưa xác minh chú giải mã/điều kiện nồng độ, dung môi, thời gian và đường truyền. Không suy thành khuyến cáo phối hợp thuốc.':'',snapshotGeneratedAt?`Snapshot tĩnh được tạo ${snapshotGeneratedAt}; không khẳng định đây là lần đồng bộ mới nhất của Sheet.`:''].filter(Boolean).join(' ');
  return {id:`module_${kind}_${index}`,title:`${module.title} — ${label}`,documentTitle:reference?`${module.title}; nguồn ghi trong bản ghi: ${reference}`:module.title,url,excerpt,tags:[label],origin:'closed',provenance:'published_drugview_module',sourceType:'drugview_module',moduleKind:kind,priority:0,section:locator,sheetId:module.sheetId,sheetName:module.tab,sourceRow:row,reference,...metadata,legendVerified,...(rawStatus?{rawStatus}:{}),...(snapshotGeneratedAt?{snapshotGeneratedAt}:{}),usableForIntervention:Boolean(metadata.year&&reference&&kind!=='compatibility'),limitations};
}
export function interactionSourcesFromRows(rows,query,{drugNames=[]}={}){
  if(!Array.isArray(rows)||rows.length>12000)return {sources:[],coverageComplete:false,requestedDrugs:[]};
  const names=namesInQuery(rows.flatMap(row=>[moduleCell(row?.['Thuốc 1']),moduleCell(row?.['Thuốc 2'])]),query,drugNames),wanted=new Set(names.map(v=>v.name));
  if(wanted.size<2)return {sources:[],coverageComplete:false,requestedDrugs:names.map(v=>v.display)};
  const pairs=new Set(),sources=[];for(const [offset,row] of rows.entries()){
    const a=moduleCell(row?.['Thuốc 1']),b=moduleCell(row?.['Thuốc 2']);if(!wanted.has(normal(a))||!wanted.has(normal(b))||normal(a)===normal(b))continue;
    const stt=moduleCell(row.STT)||String(offset+1),reference=moduleCell(row['Nguồn']);
    const source=sourceRecord('interactions',offset+1,`${a} + ${b}`,[['STT',stt],...['Nhóm tương tác','Thuốc 1','Thuốc 2','Mức độ','Cơ chế','Hậu quả','Xử trí','Nguồn'].map(key=>[key,row[key]])],{reference});
    if(source){source.section=`Tab ${MODULES.interactions.tab}, STT ${stt} (không suy ra số dòng Sheet)`;sources.push(source);pairs.add(pairKey(a,b));}if(sources.length>=16)break;
  }
  return {sources,coverageComplete:pairs.size===wanted.size*(wanted.size-1)/2,requestedDrugs:names.map(v=>v.display)};
}
export function compatibilitySourcesFromRows(rows,query,{drugNames=[]}={}){
  if(!Array.isArray(rows)||rows.length>12000)return {sources:[],coverageComplete:false,requestedDrugs:[]};
  const names=namesInQuery(rows.flatMap(row=>[moduleCell(row?.drug1),moduleCell(row?.drug2)]),query,drugNames),wanted=new Set(names.map(v=>v.name));
  if(wanted.size<2)return {sources:[],coverageComplete:false,requestedDrugs:names.map(v=>v.display)};
  const pairs=new Set(),sources=[];for(const [offset,row] of rows.entries()){
    const a=moduleCell(row?.drug1),b=moduleCell(row?.drug2);if(!wanted.has(normal(a))||!wanted.has(normal(b))||normal(a)===normal(b))continue;
    const status=moduleCell(row.status),source=sourceRecord('compatibility',offset+1,`${a} + ${b}`,[['Thuốc 1',a],['Thuốc 2',b],['Nhãn API giữ nguyên, không tự diễn giải',status]],{rawStatus:status,legendVerified:false});
    if(source){sources.push(source);pairs.add(pairKey(a,b));}if(sources.length>=16)break;
  }
  return {sources,coverageComplete:pairs.size===wanted.size*(wanted.size-1)/2,requestedDrugs:names.map(v=>v.display)};
}
export function mlctSourcesFromRows(rows,name,{snapshotGeneratedAt}={}){
  if(!Array.isArray(rows)||rows.length>5000)return [];
  const seen=new Set();
  return rows.flatMap((row,index)=>{if(!row||normal(moduleCell(row.HoatChat))!==normal(name))return [];
    // The static module splits one sheet row into several CrCl threshold rows.
    // Keep its complete original rule once, with one stable sheet locator.
    const key=Number.isSafeInteger(row.RowNumber)?`row:${row.RowNumber}`:`item:${index}`;
    if(seen.has(key))return [];seen.add(key);
    const rule=row.LieuTheoMLCT||row.LieuChuanHoa||row.LieuTheoMLCTDongDayDu||row.LieuChuanHoaDongDayDu||row.RawCrClLine;
    const reference=moduleCell(row.Nguon||row.Source||row.GhiChuNguon),fields=[['Hoạt chất',row.HoatChat],['Chỉ định',row.ChiDinh],['Đường dùng',row.DuongDung],['Liều thông thường theo chỉ định',row.LieuThongThuong],['Hiệu chỉnh liều theo CrCl, nguyên văn',rule],['Lọc máu IHD',row.IHD],['Lọc máu CAPD',row.CAPD],['Lọc máu CRRT',row.CRRT],['Ghi chú',row.GhiChu],['Nguồn',reference],['Liên kết ghi trong dữ liệu nguồn, chưa tự tải',row.GhiChuNguonLink]];
    const source=sourceRecord('mlct',Number.isSafeInteger(row.RowNumber)?row.RowNumber:index+1,name,fields,{reference,rowNumber:row.RowNumber,snapshotGeneratedAt});return source?[source]:[];
  }).slice(0,16);
}
function kindFor(query,intent){if(intent==='other')return null;const text=normal(query),renal=/\bcrcl\b|\begfr\b|\bmlct\b|suy than|loc mau|tham tach|dialysis|chuc nang than|thanh thai creatinin/.test(text);if(intent==='special_dose'&&renal)return 'mlct';if(/tuong ky|tuong ki|tuong hop|ysite|y site|pha chung|cung day truyen|duong truyen|compatib/.test(text))return 'compatibility';if(renal||/hieu chinh lieu/.test(text)&&!/suy gan|xo gan|child pugh|tre em|so sinh|mang thai|cho con bu/.test(text))return 'mlct';if(intent==='interactions'||/tuong tac|interaction/.test(text))return 'interactions';return null;}
export async function getModuleSources(query,{intent='general',preferredModuleKind,drugNames=[],enabled=true,signal,fetchImpl=fetch}={}){
  const moduleKind=Object.hasOwn(MODULES,preferredModuleKind)?preferredModuleKind:kindFor(query,intent),empty={sources:[],moduleKind,coverageComplete:false,citationComplete:false,sufficient:false,requestedDrugs:[]};
  if(!enabled||!moduleKind)return empty;signal?.throwIfAborted();const bounded=AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(12000)]);
  let result;
  try{
    if(moduleKind==='interactions')result=interactionSourcesFromRows(await getJSON(MODULES.interactions.api,{signal:bounded,fetchImpl}),query,{drugNames});
    else if(moduleKind==='compatibility'){const data=await getJSON(MODULES.compatibility.api,{signal:bounded,fetchImpl});result=compatibilitySourcesFromRows(data?.incompatibilities,query,{drugNames});}
    else{
      const index=await getJSON(MLCT_INDEX_URL,{signal:bounded,fetchImpl});if(index?.source!==MODULES.mlct.api||!Array.isArray(index.drugNames)||index.drugNames.length>2000||!index.drugFiles||typeof index.drugFiles!=='object')return empty;
      const names=namesInQuery(index.drugNames,query,drugNames).slice(0,3),sources=[];
      for(const {display:name} of names){const file=index.drugFiles[name];if(typeof file!=='string'||!/^data\/mlct-drugs\/drug-\d{4}\.json$/.test(file))continue;const data=await getJSON(new URL(file,STATIC).href,{signal:bounded,fetchImpl});if(data?.name!==name)continue;sources.push(...mlctSourcesFromRows(data.rows,name,{snapshotGeneratedAt:typeof index.generatedAt==='string'?index.generatedAt.slice(0,40):undefined}));}
      result={sources,coverageComplete:names.length>0&&names.every(v=>sources.some(s=>normal(s.tags[0])===v.name)),requestedDrugs:names.map(v=>v.display)};
    }
  }catch(error){signal?.throwIfAborted();return {...empty,unavailable:true};}
  const citationComplete=result.sources.length>0&&result.sources.every(source=>Boolean(source.year&&source.section&&source.reference&&source.usableForIntervention));
  return {...empty,...result,citationComplete,sufficient:Boolean(result.coverageComplete&&citationComplete)};
}
export function resetModuleCacheForTests(){cache.clear();inflight.clear();cacheBytes=0;}
