import * as runtime from '../../nbcare-server/runtime.mjs';

const MAX_BODY=3*1024*1024;
const counts=new Map();
const SITE='https://gentle-madeleine-2d07c3.netlify.app';
const headersFor=(origin)=>({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...(origin?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Methods':'GET, HEAD, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'});
const reply=(code,data,origin,head=false)=>({statusCode:code,headers:headersFor(origin),body:head?'':JSON.stringify(data)});
const error=(status,message,code='INVALID_REQUEST')=>Object.assign(new Error(message),{status,code});

function allowed(origin,env){if(!origin)return true;const values=[SITE,'https://www.drugviewninhbinh.com','https://drugviewninhbinh.com',env.URL,env.DEPLOY_PRIME_URL,env.DEPLOY_URL].filter(Boolean).flatMap(v=>{try{return [new URL(v).origin];}catch{return [];}});if(values.includes(origin))return true;return env.NBCARE_ALLOW_LOCAL==='true'&&/^http:\/\/(127\.0\.0\.1|localhost):[0-9]+$/.test(origin);}
function text(value,max,optional=false){if(optional&&value==null)return '';if(typeof value!=='string'||value.length>max)throw error(422,'Nội dung văn bản không hợp lệ hoặc quá dài.');return value.trim();}
export function validateChat(data){if(!data||typeof data!=='object'||Array.isArray(data))throw error(422,'Dữ liệu không hợp lệ.');const message=text(data.message,4000);if(!message)throw error(422,'Hãy nhập câu hỏi.');if(!['closed','open'].includes(data.sourceMode)||!['basic','deep'].includes(data.answerStyle||'basic'))throw error(422,'Chế độ nguồn hoặc kiểu trả lời không hợp lệ.');const history=data.history||[];if(!Array.isArray(history)||history.length>12)throw error(422,'Lịch sử hội thoại vượt giới hạn.');return {message,sourceMode:data.sourceMode,answerStyle:data.answerStyle||'basic',ocrText:text(data.ocrText,12000,true),history:history.map(turn=>{if(!turn||!['user','assistant'].includes(turn.role))throw error(422,'Lịch sử hội thoại không hợp lệ.');return {role:turn.role,text:text(turn.text,4000)};})};}
function limit(ip,now=Date.now()){for(const [key,v] of counts)if(v.expiry<=now)counts.delete(key);if(counts.size>10000)counts.delete(counts.keys().next().value);const entry=counts.get(ip)||{count:0,expiry:now+60000};counts.set(ip,entry);if(++entry.count>12)throw error(429,'Vui lòng chờ một phút trước khi gửi thêm yêu cầu.','RATE_LIMITED');}

export function createHandler({api=runtime,env=process.env}={}){return async(event)=>{
  const headers=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),String(v)])),origin=headers.origin||'';const method=event.httpMethod||'GET';
  try{
    if(!allowed(origin,env))throw error(403,'Nguồn gửi yêu cầu không được phép.','ORIGIN_NOT_ALLOWED');
    if(method==='OPTIONS')return reply(204,null,origin);
    const path=String(event.path||'');const action=event.queryStringParameters?.action||path.match(/\/api\/(status|chat|ocr)\/?$/)?.[1];
    if(action==='status'){if(!['GET','HEAD'].includes(method))throw error(405,'Đường dẫn trạng thái chỉ nhận GET.');return reply(200,api.runtimeStatus(env),origin,method==='HEAD');}
    if(!['chat','ocr'].includes(action))throw error(404,'Không tìm thấy đường dẫn.','NOT_FOUND');
    if(method!=='POST')throw error(405,'Yêu cầu phải dùng POST.');
    if(!/^application\/json(?:\s*;|$)/i.test(headers['content-type']||''))throw error(415,'Yêu cầu phải dùng JSON.');
    const body=event.isBase64Encoded?Buffer.from(event.body||'','base64'):Buffer.from(event.body||'','utf8');if(body.length>MAX_BODY)throw error(413,'Dữ liệu gửi lên vượt giới hạn.');let data;try{data=JSON.parse(body.toString('utf8'));}catch{throw error(422,'Dữ liệu JSON không hợp lệ.');}
    limit(String(headers['x-nf-client-connection-ip']||'unknown').slice(0,100));
    const signal=AbortSignal.timeout(52000);const payload=action==='chat'?validateChat(data):data;if(action==='ocr')api.validateImage(payload?.image);
    const result=await (action==='chat'?api.chat(payload,{env,signal}):api.ocr(payload,{env,signal}));return reply(200,result,origin);
  }catch(failure){const status=Number.isInteger(failure.status)&&failure.status>=400&&failure.status<600?failure.status:(failure.name==='TimeoutError'||failure.name==='AbortError'?504:502);const message=status===429?'Vui lòng chờ một phút trước khi gửi thêm yêu cầu.':status===503?'Máy chủ Vertex AI chưa được cấu hình.':status===504?'Xử lý đang mất nhiều thời gian. Vui lòng thử lại.':status===502?'Chưa nhận được phản hồi hợp lệ từ Vertex AI. Hãy thử lại sau.':failure.code==='INVALID_REQUEST'||['ORIGIN_NOT_ALLOWED','NOT_FOUND'].includes(failure.code)?failure.message:status===413?'Ảnh hoặc nội dung vượt giới hạn cho phép.':'Dữ liệu không hợp lệ hoặc không thể xử lý.';return reply(status,{error:{code:failure.code||'REQUEST_FAILED',message}},allowed(origin,env)?origin:'');}
};}
const handleEvent=createHandler();
// A modern default export preserves ESM package resolution in Netlify's bundle.
// The legacy named `handler` export turns ADK into its incompatible CJS build.
export default async function handleRequest(request,context={}){
  const url=new URL(request.url),headers=Object.fromEntries(request.headers);
  headers['x-nf-client-connection-ip']=String(context.ip||'unknown');
  let body='';
  if(!['GET','HEAD','OPTIONS'].includes(request.method)&&request.body){
    const reader=request.body.getReader(),parts=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();const origin=headers.origin||'';const r=reply(413,{error:{code:'INVALID_REQUEST',message:'Dữ liệu gửi lên vượt giới hạn.'}},allowed(origin,process.env)?origin:'');return new Response(r.body,{status:r.statusCode,headers:r.headers});}parts.push(Buffer.from(value));}}
    finally{reader.releaseLock();}
    body=Buffer.concat(parts).toString('utf8');
  }
  const result=await handleEvent({httpMethod:request.method,path:url.pathname,headers,body,queryStringParameters:Object.fromEntries(url.searchParams)});
  return new Response(result.statusCode===204||request.method==='HEAD'?null:result.body,{status:result.statusCode,headers:result.headers});
}
