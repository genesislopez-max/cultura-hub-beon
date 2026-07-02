// Verifica el ID token que manda el navegador (login de Google) antes de dejar
// pasar cualquier pedido a Airtable o Slack. Usa el endpoint público de Google
// en vez de una librería, para no depender de node_modules en las funciones.

// Mismo Client ID que en js/auth.js — no es secreto, se expone igual en el
// botón de login del navegador.
const GOOGLE_CLIENT_ID='PENDIENTE.apps.googleusercontent.com';
const ALLOWED_DOMAIN='beon.tech';

async function verifyGoogleIdToken(idToken,fetchImpl){
  const doFetch=fetchImpl||fetch;
  if(!idToken) return {ok:false,error:'Falta la sesión de Google.'};

  let info;
  try{
    const r=await doFetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if(!r.ok) return {ok:false,error:'Token de Google inválido o expirado.'};
    info=await r.json();
  }catch(e){
    return {ok:false,error:'No se pudo verificar la sesión con Google.'};
  }

  if(info.aud!==GOOGLE_CLIENT_ID) return {ok:false,error:'El token no corresponde a esta app.'};
  if(info.email_verified!=='true'&&info.email_verified!==true) return {ok:false,error:'El email de Google no está verificado.'};

  const email=info.email||'';
  const dominioOk=info.hd===ALLOWED_DOMAIN||email.toLowerCase().endsWith('@'+ALLOWED_DOMAIN);
  if(!dominioOk) return {ok:false,error:`La cuenta ${email} no pertenece a ${ALLOWED_DOMAIN}.`};

  return {ok:true,email,name:info.name||''};
}

module.exports={verifyGoogleIdToken,GOOGLE_CLIENT_ID,ALLOWED_DOMAIN};
