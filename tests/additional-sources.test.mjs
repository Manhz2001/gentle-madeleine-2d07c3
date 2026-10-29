import test from 'node:test';
import assert from 'node:assert/strict';
import {additionalSources} from '../nbcare-server/additional-sources.mjs';
import {draftCandidates} from '../nbcare-server/clinical-policy.mjs';
test('additional label retrieval keeps actual metadata and is always reference-only',async()=>{
 const urls=[];const sources=await additionalSources({drugNames:['fixture'],fetchImpl:async url=>{urls.push(String(url));return new Response(JSON.stringify({results:[{id:'fixture',effective_time:'20240101',openfda:{brand_name:['Fictional test only']},description:['This complete paragraph is synthetic software test data and must never be used for clinical treatment.']}]}));}});
 assert.equal(urls.length,1);assert.equal(new URL(urls[0]).hostname,'api.fda.gov');assert.equal(sources[0].year,2024);assert.equal(sources[0].usableForIntervention,false);
});
test('undated reference permission allows general information but never a dose intervention',()=>{
 const source={id:'fixture',title:'Fictional reference',url:'https://moh.gov.vn/mock',section:'Description',allowUndatedReference:true,excerpt:'This complete paragraph is synthetic software test data and must never be used for clinical treatment.'};
 const evidence=[{source_id:'fixture',quote:source.excerpt}],records=new Map([['fixture',source]]);
 const result=draftCandidates({information:[{section:'identity',text:'Fictional explanatory fact',evidence},{section:'dose',text:'Fictional dosing claim',evidence}],recommendations:[{section:'adjusted_dose',proposal:'Fictional dose',evidence}]},records);
 assert.equal(result.length,1);assert.equal(result[0].item.section,'identity');assert.equal(result[0].sources[0].year,null);
});
