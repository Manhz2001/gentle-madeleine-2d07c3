const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../nbcare/app.js'),'utf8');

// The renderer runs with a minimal DOM: assigning raw HTML is deliberately absent.
class Node {
  constructor(tag,text=''){this.tagName=tag;this.childNodes=[];this._text=text;}
  set textContent(value){this._text=String(value);this.childNodes=[];}
  get textContent(){return this._text+this.childNodes.map(n=>n.textContent).join('');}
  append(...nodes){this.childNodes.push(...nodes);}
}
const document={createElement:tag=>new Node(tag),createTextNode:text=>new Node('#text',String(text)),createDocumentFragment:()=>new Node('#fragment')};
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const context=vm.createContext({document,el,Map,Set,String,URL});
const start=code.indexOf('  function renderMarkdown('),end=code.indexOf('  const modeName');
assert.ok(start>0&&end>start);
vm.runInContext(code.slice(start,end)+'\nthis.renderMarkdown=renderMarkdown;',context);
const render=context.renderMarkdown;
const all=node=>[node,...node.childNodes.flatMap(all)];
const source={id:'s1',title:'Hướng dẫn chính thức',url:'https://moh.gov.vn/example',citation:'Bộ Y tế, 2024, Mục 2'};

test('clinical Markdown builds headings, lists, bold and accessible severity text',()=>{
  const tree=render('### 1. TÓM TẮT ĐƠN THUỐC\n- **Hoạt chất:** Chưa đủ dữ liệu.\n\n> 🔴 **CẢNH BÁO MỨC ĐỘ 1**\n> - Không tự ngừng thuốc. [s1]\n\n> 🟡 **LƯU Ý MỨC ĐỘ 2**\n> - Cần đối chiếu.\n\n> 🟢 **ĐÁNH GIÁ**\n> - Chỉ theo phạm vi đã xác minh.',[source]);
  const nodes=all(tree);
  assert.ok(nodes.some(n=>n.tagName==='h3'));
  assert.ok(nodes.some(n=>n.tagName==='strong'&&n.textContent==='Hoạt chất:'));
  assert.ok(nodes.some(n=>n.tagName==='ul'));
  for(const cls of ['is-critical','is-caution','is-suitable'])assert.ok(nodes.some(n=>n.tagName==='blockquote'&&n.className.includes(cls)));
  assert.ok(tree.textContent.includes('Không tự ngừng thuốc.'));
});

test('raw HTML, image markup and unverified links cannot create executable elements or URLs',()=>{
  const tree=render('<img src=x onerror=alert(1)>\n<script>alert(1)</script>\n![ảnh](https://evil.test/image.png)\n[x](javascript:alert(1))\n[ngoài danh sách](https://evil.test/)\n[giả mạo](https://moh.gov.vn@evil.test/)',[source]);
  const nodes=all(tree);
  assert.equal(nodes.filter(n=>['img','script','iframe','a'].includes(n.tagName)).length,0);
  assert.ok(tree.textContent.includes('<script>alert(1)</script>'));
});

test('only verified evidence links and known source IDs become HTTPS links',()=>{
  const tree=render('[Đọc tài liệu](https://moh.gov.vn/example) [s1] [invented]',[source]);
  const links=all(tree).filter(n=>n.tagName==='a');
  assert.equal(links.length,2);
  for(const link of links){assert.equal(link.href,source.url);assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');}
  assert.ok(tree.textContent.includes('[invented]'));
});

test('deeply nested quotations terminate and preserve clinical negations',()=>{
  const tree=render('> > > > > **Không được tự ý đổi liều.**');
  assert.ok(tree.textContent.includes('Không được tự ý đổi liều.'));
  assert.ok(all(tree).filter(n=>n.tagName==='blockquote').length<=3);
});

test('removed global source panels and Google suggestions renderer are absent',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../nbcare/index.html'),'utf8');
  for(const id of ['sourceDescription','openLibrary','evidenceContent','mobileSources'])assert.ok(!html.includes(`id="${id}"`));
  assert.ok(!code.includes('searchSuggestionsHtml'));
  assert.ok(!code.includes('srcdoc'));
  assert.ok(html.includes('id="sourcesDialog"'));
  assert.ok(!code.includes('WHO & cơ quan y tế'));
  assert.ok(!code.includes('Căn cứ tìm được qua Gemini'));
});

test('returned source citations and reference limitations remain bounded and preserve provenance',()=>{
  const start=code.indexOf('  function safeSources('),end=code.indexOf('  function evidenceNodes(');
  vm.runInContext(code.slice(start,end)+'\nthis.safeSources=safeSources;',context);
  const result=context.safeSources([{id:'dm_example',title:'DailyMed label',url:'https://dailymed.nlm.nih.gov/example',citation:'DailyMed, 2025, Mục 4',limitations:'Nhãn SPL Hoa Kỳ. Không phải SPC Việt Nam.',provenance:'official_dailymed'}]);
  assert.equal(result.length,1);assert.equal(result[0].citation,'DailyMed, 2025, Mục 4');assert.equal(result[0].provenance,'official_dailymed');assert.ok(result[0].limitations.includes('Không phải SPC Việt Nam.'));
  const long=context.safeSources([{id:'pm_example',url:'https://pubmed.ncbi.nlm.nih.gov/1/',limitations:'x'.repeat(2000),provenance:'pubmed_abstract'}]);
  assert.equal(long[0].limitations.length,1200);assert.equal(long[0].provenance,'pubmed_abstract');
});
