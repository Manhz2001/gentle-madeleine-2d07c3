import {createHash} from 'node:crypto';
import {GoogleGenAI} from '@google/genai';

const READY_MS=5*60*1000,FAILURE_MS=10000,PROBE_MS=8000;
let cached=null,inflight=null;
const publicResult=entry=>({ready:entry.ready,verifiedAt:entry.verifiedAt,expiresAt:entry.expiresAt,model:entry.model});
const clockFor=now=>typeof now==='function'?now:now===undefined?Date.now:()=>now;
function outputText(response){const parts=response?.candidates?.[0]?.content?.parts;if(Array.isArray(parts))return parts.filter(part=>!part.thought&&typeof part.text==='string').map(part=>part.text).join('').trim();return typeof response?.text==='string'?response.text.trim():'';}

// A configured key is not proof of connectivity. The green indicator requires a
// bounded, fixed non-clinical model request. Cache it to avoid a billable check
// on every tab focus; no patient text, API errors or credentials are returned.
export async function checkReadiness({env=process.env,signal,clientFactory=options=>new GoogleGenAI(options),now}={}){
  const clock=clockFor(now),time=clock(),apiKey=String(env.GEMINI_API_KEY||env.GOOGLE_API_KEY||'').trim();
  const value=String(env.GEMINI_MODEL||'gemini-3.8-flash'),model=/^gemini-[a-z0-9.-]+$/.test(value)?value:'gemini-3.8-flash';
  const enabled=String(env.NBCARE_VERTEX_ENABLED??env.GEMINI_ENABLED??'true').toLowerCase()==='true';
  if(!enabled||!apiKey||signal?.aborted)return {ready:false,verifiedAt:null,expiresAt:time+FAILURE_MS,model};
  const tag=createHash('sha256').update(apiKey+'\0'+model).digest('hex');
  if(cached?.tag===tag&&cached.expiresAt>time)return publicResult(cached);
  if(inflight?.tag===tag)return inflight.promise;
  const task={tag,promise:null};inflight=task;
  task.promise=(async()=>{
    const controller=new AbortController();let timer,listener;
    const bounded=new Promise((_,reject)=>{
      const abort=()=>{controller.abort();reject(new Error('Readiness check ended'));};
      timer=setTimeout(abort,PROBE_MS);listener=abort;
      if(signal){signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();}
    });
    let ready=false;
    try{
      controller.signal.throwIfAborted();
      const client=clientFactory({vertexai:true,apiKey,httpOptions:{apiVersion:'v1',timeout:PROBE_MS}});
      const response=await Promise.race([client.models.generateContent({model,contents:[{role:'user',parts:[{text:'Reply with exactly READY. This is a connectivity check.'}]}],config:{maxOutputTokens:128,thinkingConfig:{thinkingLevel:'LOW'},abortSignal:controller.signal}}),bounded]);
      ready=!controller.signal.aborted&&outputText(response)==='READY';
    }catch{ready=false;}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',listener);}
    const checked=clock(),entry={tag,model,ready,verifiedAt:ready?checked:null,expiresAt:checked+(ready?READY_MS:FAILURE_MS)};
    if(inflight===task){cached=entry;inflight=null;}
    return publicResult(entry);
  })();
  return task.promise;
}
export function resetReadinessForTests(){cached=null;inflight=null;}
