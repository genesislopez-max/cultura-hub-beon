// Emite y valida un token de sesión propio, firmado con HMAC-SHA256, para no
// depender directamente del ID token de Google (que expira en ~1 hora) en
// cada pedido — así la sesión del Hub puede durar más sin que el usuario
// tenga que volver a loguearse todo el tiempo. Sin librerías externas: usa
// el módulo nativo crypto de Node, igual que el resto de las funciones acá.
const crypto=require('node:crypto');

const DEFAULT_TTL_MS=36*60*60*1000; // 36 horas — "día y medio"

function b64url(buf){
  return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64urlToBuf(str){
  const pad=str.length%4===0?'':'='.repeat(4-(str.length%4));
  return Buffer.from(str.replace(/-/g,'+').replace(/_/g,'/')+pad,'base64');
}

function getSecret(){
  const secret=process.env.SESSION_SECRET;
  if(!secret) throw new Error('El servidor no tiene configurado SESSION_SECRET.');
  return secret;
}

function signSession({email,name},ttlMs=DEFAULT_TTL_MS){
  const payload={email,name,exp:Date.now()+ttlMs};
  const payloadB64=b64url(Buffer.from(JSON.stringify(payload)));
  const sig=crypto.createHmac('sha256',getSecret()).update(payloadB64).digest();
  return `${payloadB64}.${b64url(sig)}`;
}

function verifySession(token){
  if(!token||!token.includes('.')) return {ok:false,error:'Falta la sesión.'};
  const [payloadB64,sigB64]=token.split('.');
  let expectedSig;
  try{
    expectedSig=crypto.createHmac('sha256',getSecret()).update(payloadB64).digest();
  }catch(e){
    return {ok:false,error:e.message};
  }
  const gotSig=b64urlToBuf(sigB64||'');
  if(gotSig.length!==expectedSig.length||!crypto.timingSafeEqual(gotSig,expectedSig)){
    return {ok:false,error:'Sesión inválida.'};
  }
  let payload;
  try{
    payload=JSON.parse(b64urlToBuf(payloadB64).toString('utf8'));
  }catch(e){
    return {ok:false,error:'Sesión corrupta.'};
  }
  if(!payload.exp||Date.now()>payload.exp) return {ok:false,error:'Tu sesión expiró — iniciá sesión de nuevo.'};
  return {ok:true,email:payload.email,name:payload.name};
}

module.exports={signSession,verifySession,DEFAULT_TTL_MS};
