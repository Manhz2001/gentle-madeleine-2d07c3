import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import config from './clinical-access-config.json' with {type:'json'};

const DURATION=30*60*1000,attempts=new Map();
const keyOf=env=>String(env.GEMINI_API_KEY||env.GOOGLE_API_KEY||'').trim();
const failure=(status,code,message)=>Object.assign(new Error(message),{status,code});
const digest=(key,purpose,value)=>createHmac('sha256',key).update(purpose+'\0'+value).digest('base64url');
const equal=(a,b)=>{const left=Buffer.from(String(a)),right=Buffer.from(String(b));return left.length===right.length&&timingSafeEqual(left,right);};
export function pinDigest(pin,env){return digest(keyOf(env),'nbcare-clinical-pin-v1',pin);}
export function issueAccessToken({env=process.env,now=Date.now()}={}){
  const key=keyOf(env);if(!key)throw failure(503,'NOT_CONFIGURED','Máy chủ chưa sẵn sàng.');
  const expiresAt=now+DURATION,body=Buffer.from(JSON.stringify({scope:'clinical-deep',iat:now,exp:expiresAt,nonce:randomBytes(16).toString('hex')})).toString('base64url');
  return {accessToken:body+'.'+digest(key,'nbcare-clinical-session-v1',body),expiresAt};
}
export function verifyAccessToken(token,{env=process.env,now=Date.now()}={}){
  if(typeof token!=='string'||token.length>800||!keyOf(env))return false;
  const parts=token.split('.');if(parts.length!==2||!equal(parts[1],digest(keyOf(env),'nbcare-clinical-session-v1',parts[0])))return false;
  try{const value=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));return value.scope==='clinical-deep'&&Number.isFinite(value.iat)&&Number.isFinite(value.exp)&&value.iat<=now+5000&&value.exp>now&&value.exp-value.iat===DURATION&&typeof value.nonce==='string'&&/^[a-f0-9]{32}$/.test(value.nonce);}catch{return false;}
}
export function unlockClinicalAccess(payload,{env=process.env,ip='unknown',now=Date.now(),expectedDigest}={}){
  if(!keyOf(env))throw failure(503,'NOT_CONFIGURED','Máy chủ chưa sẵn sàng.');
  for(const [address,entry] of attempts)if(entry.until<=now)attempts.delete(address);
  if(attempts.size>10000)attempts.delete(attempts.keys().next().value);
  const address=String(ip).slice(0,100),entry=attempts.get(address)||{count:0,until:now+10*60*1000};
  if(entry.count>=5)throw failure(429,'CLINICAL_ACCESS_RATE_LIMITED','Vui lòng thử lại sau.');
  const pin=typeof payload?.pin==='string'?payload.pin:'';
  const configured=expectedDigest??(env.NBCARE_CLINICAL_PIN?pinDigest(String(env.NBCARE_CLINICAL_PIN),env):env.NBCARE_CLINICAL_PIN_HMAC||config.pinDigest);
  if(!configured)throw failure(503,'NOT_CONFIGURED','Mã truy cập chưa được cấu hình.');
  if(!/^\d{4,10}$/.test(pin)||!equal(pinDigest(pin,env),configured)){entry.count++;attempts.set(address,entry);throw failure(403,'CLINICAL_ACCESS_INVALID','Mã truy cập không hợp lệ.');}
  attempts.delete(address);return issueAccessToken({env,now});
}
export function accessStatus(){return {deepRequiresCode:true,sessionMinutes:30};}
export function resetAccessAttemptsForTests(){attempts.clear();}
