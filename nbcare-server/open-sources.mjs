import {additionalSources} from './additional-sources.mjs';
// Public reference retrieval only. Do not pass a patient's narrative as a query.
// DailyMed is an NLM SPL repository, not proof that a label is FDA approved or a Vietnamese SPC.
const DAILYMED='https://dailymed.nlm.nih.gov/dailymed/services/v2/';
const EUTILS='https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
const MAX_BYTES=4*1024*1024, CACHE_MS=300000, MAX_SECTION=14000;
const cache=new Map();
let cacheBytes=0;
let nextNcbi=0;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const normal=s=>String(s).toLowerCase().replace(/đ/g,'d').normalize('NFD').replace(/[\u0300-\u036f]/g,'');

export function allowedOpenFetchUrl(value){
  try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443'))return false;
    return (u.hostname==='dailymed.nlm.nih.gov'&&/^\/dailymed\/services\/v2\/spls(?:\.json|\/[a-f0-9-]{36}\.xml)$/.test(u.pathname)) ||
      (u.hostname==='eutils.ncbi.nlm.nih.gov'&&/^\/entrez\/eutils\/(?:esearch|efetch)\.fcgi$/.test(u.pathname));
  }catch{return false;}
}
function mergedSignal(signal,timeout=18000){return AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(timeout)]);}
function delay(ms,signal){if(ms<=0)return Promise.resolve();return new Promise((resolve,reject)=>{const finish=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};const abort=()=>{finish();reject(signal.reason);};const timer=setTimeout(()=>{finish();resolve();},ms);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();});}
async function readLimited(response){
  if(Number(response.headers.get('content-length'))>MAX_BYTES||!response.body)throw new Error('Reference exceeds size limit');
  const reader=response.body.getReader(),parts=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES)throw new Error('Reference exceeds size limit');parts.push(value);}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const output=new Uint8Array(size);let offset=0;for(const part of parts){output.set(part,offset);offset+=part.byteLength;}
  return new TextDecoder('utf-8',{fatal:true}).decode(output).replace(/^\uFEFF/,'');
}
async function get(url,{signal,fetchImpl}){
  if(!allowedOpenFetchUrl(url))throw new Error('Unapproved reference endpoint');
  const key=String(url),now=Date.now(),cached=cache.get(key);if(cached&&now-cached.at<CACHE_MS)return cached.text;
  const response=await fetchImpl(key,{method:'GET',redirect:'manual',signal:mergedSignal(signal,8500),headers:{Accept:'application/json, application/xml, text/xml','Accept-Encoding':'identity'}});
  // These API endpoints do not need redirects. Never follow an arbitrary Location.
  if(!response.ok||response.status>=300){await response.body?.cancel().catch(()=>{});throw new Error('Reference service unavailable');}
  const text=await readLimited(response);const old=cache.get(key);if(old){cacheBytes-=old.text.length*2;cache.delete(key);}
  const bytes=text.length*2;while(cache.size&&(cache.size>=64||cacheBytes+bytes>24*1024*1024)){const first=cache.keys().next().value;cacheBytes-=cache.get(first).text.length*2;cache.delete(first);}
  cache.set(key,{at:now,text});cacheBytes+=bytes;return text;
}
export function xmlText(xml){
  return String(xml).replace(/<!--[\s\S]*?-->/g,'').replace(/<\/?(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi,'')
    .replace(/<\/(?:paragraph|p|item|list|tr|title|text|section|AbstractText)>/gi,'\n').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(?:td|th)>/gi,' | ')
    .replace(/<[^>]*>/g,'').replace(/&#x([0-9a-f]+);/gi,(_,n)=>character(parseInt(n,16))).replace(/&#([0-9]+);/g,(_,n)=>character(Number(n)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[n])
    .replace(/[ \t]+/g,' ').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
function character(value){return Number.isInteger(value)&&value>0&&value<=0x10ffff&&!(value>=0xd800&&value<=0xdfff)?String.fromCodePoint(value):'';}
function firstTag(block,name){return block.match(new RegExp('<'+name+'\\b[^>]*>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1]||'';}
export function topLevelSections(xml){
  const result=[];let start=-1,depth=0;const regex=/<\/?section\b[^>]*>/gi;let match;
  while((match=regex.exec(xml))){if(match[0].startsWith('</')){if(depth<=0)return [];depth--;if(depth===0){result.push(xml.slice(start,regex.lastIndex));start=-1;}}else if(!match[0].endsWith('/>')){if(depth===0)start=match.index;depth++;}}
  return depth===0?result:[];
}
const CATEGORY_PATTERNS=[
  ['boxed',/boxed warning|warning:|warning\s*$/i],['contraindications',/contraindication/i],['warnings',/warnings and precautions/i],
  ['interactions',/drug interactions/i],['dose',/dosage and administration/i],['population',/use in specific populations/i],['indications',/indications and usage/i]
];
function relevance(section,query){const q=normal(query),s=normal(section);let score=0;
  if(/contraindication|boxed warning/.test(s))score+=100;
  if(/warnings and precautions/.test(s))score+=70;
  if(/tuong tac|interaction/.test(q)&&/drug interactions/.test(s))score+=130;
  if(/lieu|than|crcl|egfr|renal|dose|dosing|hepatic|gan/.test(q)&&/dosage and administration|use in specific populations/.test(s))score+=120;
  if(/chi dinh|indication/.test(q)&&/indications and usage/.test(s))score+=120;
  if(/dosage and administration|drug interactions|use in specific populations/.test(s))score+=35;
  return score;
}
export function sourcesFromSpl(xml,record,{query='',maxSections=6}={}){
  if(!record||!UUID.test(String(record.setid||''))||typeof record.title!=='string'||record.title.length>1000)return [];
  // Metadata is read from this exact document; do not invent a year/page from today's date.
  const head=xml.slice(0,xml.indexOf('<component>')>0?xml.indexOf('<component>'):3000);
  const documentSetId=head.match(/<setId\b[^>]*\broot=["']([^"']+)["']/i)?.[1];if(documentSetId?.toLowerCase()!==record.setid.toLowerCase())return [];
  const date=head.match(/<effectiveTime\b[^>]*\bvalue=["'](\d{8})["']/i)?.[1]||'';
  const year=date?Number(date.slice(0,4)):null;
  const sections=topLevelSections(xml).map((block,index)=>{
    const title=xmlText(firstTag(block,'title'));if(!title||title.length>240)return null;
    if(!CATEGORY_PATTERNS.some(([,re])=>re.test(title)))return null;
    const body=xmlText(block);if(body.length<50||body.length>MAX_SECTION)return null; // Omit oversized sections, never truncate a clinical condition or negation.
    const id=block.match(/^<section\b[^>]*\bID=["']([A-Za-z][A-Za-z0-9_.:-]{0,99})["']/i)?.[1];
    const url=`https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${record.setid}`+(id?'#'+encodeURIComponent(id):'');
    const titleText=xmlText(record.title);
    return {id:`dm_${record.setid.replaceAll('-','')}_${index}`,title:`DailyMed SPL — ${titleText}`,url,excerpt:body,tags:[titleText,title],origin:'open',provenance:'official_dailymed',sourceType:'us_spl',section:title,
      ...(year&&year>=1900&&year<=2100?{year,yearBasis:'Năm hiệu lực ghi trong SPL',effectiveDate:date}:{}),
      ...(typeof record.published_date==='string'&&record.published_date.length<80?{publishedDate:record.published_date}:{}),
      citation:`DailyMed SPL — ${titleText}${year?' ('+year+', năm hiệu lực SPL)':''}, mục ${title}`,
      limitations:'Nhãn SPL công bố tại NLM/DailyMed của Hoa Kỳ; không tự xác nhận phê duyệt FDA, không đồng nhất với SPC hoặc tờ hướng dẫn được duyệt tại Việt Nam. Không có số trang trong XML.',score:relevance(title,query),usableForIntervention:true};
  }).filter(Boolean).sort((a,b)=>b.score-a.score);
  return sections.slice(0,Math.min(maxSections,8)).map(({score,...source})=>source);
}
export function cleanDrugNames(values){
  if(!Array.isArray(values))return [];
  const seen=new Set();return values.slice(0,8).flatMap(value=>{if(typeof value!=='string')return [];const name=value.trim().toLowerCase();if(!/^[a-z][a-z0-9 -]{2,69}$/.test(name)||/\d{4,}|https?|patient|benh nhan|\b(?:nam|nu|tuoi|age|male|female)\b/.test(name)||seen.has(name))return [];seen.add(name);return [name];}).slice(0,3);
}
export async function getDailyMedSources(drugName,{query=drugName,signal,fetchImpl=fetch,maxSections=6}={}){
  const [name]=cleanDrugNames([drugName]);if(!name)return [];
  const url=new URL('spls.json',DAILYMED);url.search=new URLSearchParams({drug_name:name,doctype:'34391-3',pagesize:'2',page:'1'}).toString();
  const records=JSON.parse(await get(url,{signal,fetchImpl})).data;if(!Array.isArray(records))return [];
  const candidates=records.filter(r=>r&&UUID.test(String(r.setid||''))&&typeof r.title==='string'&&r.title.toLowerCase().includes(name)).slice(0,2);
  // One label per drug avoids silently combining different products/formulations.
  for(const record of candidates){try{const xml=await get(new URL(`spls/${record.setid}.xml`,DAILYMED),{signal,fetchImpl});const sources=sourcesFromSpl(xml,record,{query,maxSections});if(sources.length)return sources;}catch(error){if(signal?.aborted)throw error;}}
  return [];
}
export function cleanSearchTerms(value){if(typeof value!=='string')return '';const text=value.trim();return text.length>=3&&text.length<=180&&/^[A-Za-z][A-Za-z -]*$/.test(text)&&!/(?:patient|name|address|email|phone|born|male|female|years old)/i.test(text)?text:'';}
async function ncbiGet(url,options){const now=Date.now(),slot=Math.max(now,nextNcbi);nextNcbi=slot+370;await delay(slot-now,options.signal);return get(url,options);}
export function sourcesFromPubmed(xml){
  const articles=xml.match(/<PubmedArticle\b[^>]*>[\s\S]*?<\/PubmedArticle>/g)||[];
  return articles.slice(0,3).flatMap(block=>{
    const pmid=firstTag(block,'PMID').trim(),title=xmlText(firstTag(block,'ArticleTitle')),abstract=firstTag(block,'Abstract');
    if(!/^\d{1,10}$/.test(pmid)||!title||!abstract)return [];
    const abstractText=[...abstract.matchAll(/<AbstractText\b([^>]*)>([\s\S]*?)<\/AbstractText>/gi)].map(m=>{const label=m[1].match(/\bLabel=["']([^"']+)["']/)?.[1];return (label?xmlText(label)+': ':'')+xmlText(m[2]);}).join('\n\n');
    if(abstractText.length<80||abstractText.length>12000)return [];
    const pubDate=firstTag(block,'PubDate'),yearValue=firstTag(pubDate,'Year').trim(),medlineDate=xmlText(firstTag(pubDate,'MedlineDate'));
    const year=/^\d{4}$/.test(yearValue)?Number(yearValue):/^\d{4}/.test(medlineDate)?Number(medlineDate.slice(0,4)):null;
    const journal=xmlText(firstTag(block,'Title'));
    return [{id:'pm_'+pmid,title,url:`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,excerpt:abstractText,tags:[title],origin:'open',provenance:'pubmed_abstract',sourceType:'pubmed_abstract',section:'Abstract',...(year?{year,yearBasis:'Năm công bố trong PubMed'}:{}),
      journal,citation:`${title}${year?' ('+year+')':''}, Abstract, PMID ${pmid}`,evidenceLevel:'abstract_only',usableForIntervention:false,
      limitations:'Chỉ đọc tóm tắt bài báo được lập chỉ mục PubMed; không tự coi là hướng dẫn chính thức hay dùng một mình để quyết định đổi thuốc hoặc liều. Không có trang toàn văn được xác minh.'}];
  });
}
export async function getPubmedSources(searchTerms,{signal,fetchImpl=fetch}={}){
  const terms=cleanSearchTerms(searchTerms);if(!terms)return [];
  const url=new URL('esearch.fcgi',EUTILS);url.search=new URLSearchParams({db:'pubmed',term:`(${terms}) AND (guideline[pt] OR practice guideline[pt] OR systematic review[pt])`,retmode:'json',retmax:'2',sort:'relevance',tool:'NBCare_public_reference'}).toString();
  const value=JSON.parse(await ncbiGet(url,{signal,fetchImpl})),ids=value.esearchresult?.idlist;
  if(!Array.isArray(ids))return [];const valid=ids.filter(s=>/^\d{1,10}$/.test(s)).slice(0,2);if(!valid.length)return [];
  const detail=new URL('efetch.fcgi',EUTILS);detail.search=new URLSearchParams({db:'pubmed',id:valid.join(','),retmode:'xml',tool:'NBCare_public_reference'}).toString();
  return sourcesFromPubmed(await ncbiGet(detail,{signal,fetchImpl}));
}
export async function getOpenSources(query,{drugNames=[],searchTerms='',signal,fetchImpl=fetch,maxSources=8}={}){
  const timeout=mergedSignal(signal,18000);const names=cleanDrugNames(drugNames);
  // An isolated generic-name query is supported for direct callers. A clinical narrative is never forwarded.
  if(!names.length&&typeof query==='string'&&/^[a-z][a-z-]{2,49}$/i.test(query.trim()))names.push(query.trim().toLowerCase());
  const requests=names.map(name=>getDailyMedSources(name,{query,signal:timeout,fetchImpl,maxSections:names.length>1?3:6}));
  const terms=cleanSearchTerms(searchTerms);if(terms)requests.push(getPubmedSources(terms,{signal:timeout,fetchImpl}));
  requests.push(additionalSources({drugNames:names,searchTerms:terms,signal:timeout,fetchImpl}));
  const results=await Promise.allSettled(requests);signal?.throwIfAborted();
  const groups=results.map(result=>result.status==='fulfilled'?result.value:[]),diverse=[];for(let i=0;i<12;i++)for(const group of groups)if(group[i])diverse.push(group[i]);
  const seen=new Set();return diverse.filter(source=>{if(seen.has(source.id))return false;seen.add(source.id);return true;}).slice(0,Math.min(Math.max(maxSources,1),12));
}
export function resetOpenSourceCacheForTests(){cache.clear();cacheBytes=0;nextNcbi=0;}
