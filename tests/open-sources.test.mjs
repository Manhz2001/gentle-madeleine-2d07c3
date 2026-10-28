import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedOpenFetchUrl,xmlText,topLevelSections,sourcesFromSpl,cleanDrugNames,cleanSearchTerms,getOpenSources,getDailyMedSources,sourcesFromPubmed,resetOpenSourceCacheForTests} from '../nbcare-server/open-sources.mjs';

const setid='74ff19b5-6156-4a27-affb-744b0ce1aeec';
const label={setid,title:'MEROPENEM INJECTION, POWDER, FOR SOLUTION [TEST LABEL]',published_date:'Sep 24, 2026'};
const spl=(contra='Do not use if there is known hypersensitivity. This is a full condition, not a positive safety claim.')=>`<document><title>Meropenem label</title><effectiveTime value="20200529"/><setId root="${setid}"/><component><structuredBody><component><section ID="C1"><title>4 CONTRAINDICATIONS</title><text><paragraph>${contra}</paragraph></text></section></component><component><section ID="W1"><title>5 WARNINGS AND PRECAUTIONS</title><text><paragraph>Do not omit these restrictions. Monitor renal function when clinically required.</paragraph></text><component><section><title>5.1 Renal impairment</title><text>Do not use a dose without checking the full label and patient data.</text></section></component></section></component><component><section><title>16 HOW SUPPLIED</title><text>Packaging details are not evidence for a clinical warning.</text></section></component></structuredBody></component></document>`;

test('fetch allowlist restricts exact official APIs, protocols, ports and redirects',()=>{
  assert.equal(allowedOpenFetchUrl('https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json?drug_name=meropenem'),true);
  assert.equal(allowedOpenFetchUrl(`https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/${setid}.xml`),true);
  for(const url of ['https://dailymed.nlm.nih.gov.evil.test/dailymed/services/v2/spls.json','https://user:pass@dailymed.nlm.nih.gov/dailymed/services/v2/spls.json','http://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json','https://dailymed.nlm.nih.gov:8080/dailymed/services/v2/spls.json','https://eutils.ncbi.nlm.nih.gov/private','https://127.0.0.1/dailymed/services/v2/spls.json'])assert.equal(allowedOpenFetchUrl(url),false,url);
});
test('SPL evidence preserves complete nested warnings and differentiates effective and publication dates',()=>{
  const records=sourcesFromSpl(spl(),label,{query:'renal dose'});assert.equal(records.length,2);
  const warning=records.find(s=>s.section.startsWith('5 '));assert.ok(warning.excerpt.includes('Do not use a dose without checking the full label and patient data.'));
  assert.equal(warning.year,2020);assert.equal(warning.publishedDate,'Sep 24, 2026');assert.equal(warning.provenance,'official_dailymed');assert.equal(warning.sourceType,'us_spl');assert.ok(warning.citation.includes('2020'));assert.ok(warning.citation.includes('5 WARNINGS'));
  assert.equal(warning.page,undefined);assert.equal(warning.approved,undefined);assert.ok(warning.limitations.includes('không tự xác nhận'));
});
test('SPL sections are omitted whole when too long and wrong set IDs are rejected',()=>{
  const records=sourcesFromSpl(spl('Do not use. '+ 'Unchanged full condition. '.repeat(800)),label);assert.equal(records.some(s=>s.section.includes('CONTRA')),false);assert.equal(records.length,1);
  assert.equal(sourcesFromSpl(spl(),{...label,setid:'11111111-1111-1111-1111-111111111111'}).length,0);
  assert.equal(topLevelSections('<section><title>broken</title>').length,0);
});
test('plain-text conversion preserves table cell boundaries, entities and negation without HTML execution',()=>{
  assert.equal(xmlText('<text><paragraph>Do not use &lt;5 mg.</paragraph><table><tr><td>CrCl</td><td>10</td></tr></table></text>'),'Do not use <5 mg.\nCrCl | 10 |');
  assert.equal(xmlText('<text>&#x2264; &#8805; &amp; &#x110000;</text>'),'≤ ≥ &');
});
test('external search accepts only explicit public medical terms, never forwards a clinical narrative by default',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;throw new Error('must not fetch');};
  const records=await getOpenSources('Nguyễn Văn A, nam 65 tuổi, ĐT: 0912345678, suy thận',{fetchImpl});assert.deepEqual(records,[]);assert.equal(calls,0);
  assert.deepEqual(cleanDrugNames(['meropenem','MEROPENEM','patient John 65','https://evil.test','0912345678','metformin']),['meropenem','metformin']);
  assert.equal(cleanSearchTerms('hand hygiene prevention'),'hand hygiene prevention');assert.equal(cleanSearchTerms('John Doe age 65 0912345678'),'');
});
test('DailyMed requests bounded exact JSON and actual XML and never follows remote metadata URLs',async()=>{
  resetOpenSourceCacheForTests();const seen=[];
  const fetchImpl=async(url,options)=>{seen.push({url:String(url),options});return String(url).includes('spls.json')?new Response(JSON.stringify({data:[{...label,url:'https://evil.test/payload'}]})):new Response(spl());};
  const sources=await getDailyMedSources('meropenem',{fetchImpl});assert.equal(seen.length,2);assert.ok(sources.length);assert.ok(seen.every(r=>allowedOpenFetchUrl(r.url)&&r.options.redirect==='manual'));assert.ok(seen[0].url.includes('drug_name=meropenem'));assert.ok(seen[1].url.endsWith(setid+'.xml'));
});
test('external API redirects and oversized responses are refused without arbitrary follow-up requests',async()=>{
  resetOpenSourceCacheForTests();let calls=0;
  await assert.rejects(getDailyMedSources('meropenem',{fetchImpl:async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}});}}));assert.equal(calls,1);
  resetOpenSourceCacheForTests();await assert.rejects(getDailyMedSources('meropenem',{fetchImpl:async()=>new Response('{}',{headers:{'content-length':String(8*1024*1024)}})}));
});
test('PubMed uses actual full abstract and publication metadata without claiming full-text review or an intervention basis',()=>{
  const records=sourcesFromPubmed('<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>12345</PMID><Article><Journal><Title>Actual Journal</Title><JournalIssue><PubDate><Year>2021</Year></PubDate></JournalIssue></Journal><ArticleTitle>Actual guideline title</ArticleTitle><Abstract><AbstractText Label="CONCLUSION">Do not make an individual treatment decision from an abstract alone. This full negated statement must be preserved.</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle></PubmedArticleSet>');
  assert.equal(records.length,1);assert.equal(records[0].year,2021);assert.equal(records[0].section,'Abstract');assert.equal(records[0].usableForIntervention,false);assert.equal(records[0].evidenceLevel,'abstract_only');assert.ok(records[0].excerpt.startsWith('CONCLUSION: Do not'));assert.equal(records[0].page,undefined);assert.equal(records[0].url,'https://pubmed.ncbi.nlm.nih.gov/12345/');
});
