// ─── LOGIN CON GOOGLE ───────────────────────────────────────────────────────
// Reemplaza la vieja pantalla de "pegá tu token de Airtable": ahora se entra
// con la cuenta de Google de la empresa y el token de Airtable vive solo en
// el servidor (ver api/_lib/auth.js) — nunca llega al navegador.

const GOOGLE_CLIENT_ID='451797243389-ot89q4kunoj43a9p4186iqsar8mi5nrj.apps.googleusercontent.com';
const ALLOWED_DOMAIN='beon.tech';

function decodeJwt(token){
  const payload=token.split('.')[1];
  const json=decodeURIComponent(atob(payload.replace(/-/g,'+').replace(/_/g,'/')).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join(''));
  return JSON.parse(json);
}

function getIdToken(){ return sessionStorage.getItem('hub_id_token')||''; }

function mostrarErrorLogin(msg){
  const el=document.getElementById('login-error');
  if(!el) return;
  el.textContent=msg;
  el.style.display='block';
}

// Callback que dispara Google Identity Services al elegir una cuenta
function onGoogleSignIn(response){
  let payload;
  try{ payload=decodeJwt(response.credential); }
  catch(e){ mostrarErrorLogin('No se pudo leer la respuesta de Google. Probá de nuevo.'); return; }

  const email=payload.email||'';
  const dominioOk=payload.hd===ALLOWED_DOMAIN||email.toLowerCase().endsWith('@'+ALLOWED_DOMAIN);
  if(!dominioOk){
    mostrarErrorLogin(`Esta cuenta (${email}) no pertenece a ${ALLOWED_DOMAIN}. Iniciá sesión con tu cuenta de la empresa.`);
    if(window.google) google.accounts.id.disableAutoSelect();
    return;
  }

  sessionStorage.setItem('hub_id_token',response.credential);
  sessionStorage.setItem('hub_user',JSON.stringify({email,nombre:payload.name||email,foto:payload.picture||''}));
  const err=document.getElementById('login-error');
  if(err) err.style.display='none';
  mostrarSesionActiva();
  document.getElementById('login-screen').style.display='none';
  iniciarHub();
}

function mostrarSesionActiva(){
  const raw=sessionStorage.getItem('hub_user');
  if(!raw) return;
  const u=JSON.parse(raw);
  const box=document.getElementById('sb-user');
  if(!box) return;
  document.getElementById('sb-user-pic').src=u.foto||'';
  document.getElementById('sb-user-name').textContent=u.nombre||u.email;
  box.style.display='flex';
}

function cerrarSesion(){
  sessionStorage.removeItem('hub_id_token');
  sessionStorage.removeItem('hub_user');
  if(window.google&&google.accounts&&google.accounts.id) google.accounts.id.disableAutoSelect();
  location.reload();
}

function initGoogleSignIn(){
  if(!window.google||!google.accounts||!google.accounts.id){ setTimeout(initGoogleSignIn,200); return; }
  google.accounts.id.initialize({
    client_id:GOOGLE_CLIENT_ID,
    callback:onGoogleSignIn,
    hd:ALLOWED_DOMAIN,
  });
  const btn=document.getElementById('google-signin-btn');
  if(btn) google.accounts.id.renderButton(btn,{theme:'outline',size:'large',text:'signin_with',shape:'rectangular'});
}

// Se llama al arrancar — si ya hay sesión guardada, no vuelve a pedir login.
// Devuelve true si hay sesión activa (y el caller puede seguir con iniciarHub()).
function checkSesion(){
  if(!getIdToken()){
    document.getElementById('login-screen').style.display='flex';
    initGoogleSignIn();
    return false;
  }
  mostrarSesionActiva();
  return true;
}
