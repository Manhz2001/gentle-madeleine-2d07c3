import {cp,mkdir,readdir,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'dist');
if(path.dirname(output)!==root||path.basename(output)!=='dist')throw new Error('Invalid static output path');
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
const ignored=new Set(['.git','node_modules','__pycache__','backend','tests']);
async function copyPublic(name){
  const source=path.join(root,name);
  try{await stat(source);}catch{return;}
  await cp(source,path.join(output,name),{recursive:true,filter:async file=>{
    const relative=path.relative(root,file),parts=relative.split(path.sep);
    if(parts.some(part=>ignored.has(part)||part.startsWith('.env')))return false;
    const info=await stat(file);
    if(info.isDirectory())return true;
    return !/\.(?:gs|py|pyc|toml|lock|test\.mjs)$/i.test(file);
  }});
}
for(const entry of await readdir(root,{withFileTypes:true}))if(entry.isFile()&&(entry.name.endsWith('.html')||['_redirects','_headers'].includes(entry.name)))await copyPublic(entry.name);
for(const folder of ['css','js','img','data','nbcare','nb-care','docs'])await copyPublic(folder);
const publicEntries=await readdir(output);
if(publicEntries.some(name=>['netlify','nbcare-server','node_modules','package.json','backend'].includes(name)))throw new Error('Server source entered publish output');
console.log('Static publish output prepared in dist; server code and dependencies excluded.');
