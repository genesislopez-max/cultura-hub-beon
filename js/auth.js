// ─── LOGIN CON GOOGLE ───────────────────────────────────────────────────────
// Reemplaza la vieja pantalla de "pegá tu token de Airtable": ahora se entra
// con la cuenta de Google de la empresa y el token de Airtable vive solo en
// el servidor (ver api/_lib/auth.js) — nunca llega al navegador.
//
// El ID token que devuelve Google dura solo ~1 hora y no sirve como sesión
// larga, así que se intercambia una vez por un token de sesión propio emitido
// por /api/session (ver api/_lib/session.js), que dura ~36hs y se guarda en
// localStorage (sobrevive a cerrar el navegador, a diferencia de sessionStorage).

const GOOGLE_CLIENT_ID='451797243389-ot89q4kunoj43a9p4186iqsar8mi5nrj.apps.googleusercontent.com';
const ALLOWED_DOMAIN='beon.tech';

function decodeJwt(token){
  const payload=token.split('.')[1];
  const json=decodeURIComponent(atob(payload.replace(/-/g,'+').replace(/_/g,'/')).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join(''));
  return JSON.parse(json);
}

function getIdToken(){ return localStorage.getItem('hub_session_token')||''; }

// Datos del usuario logueado (nombre/email/etc.) — ver onGoogleSignIn().
function usuarioActual(){
  try{
    return JSON.parse(localStorage.getItem('hub_user')||'{}');
  }catch(e){
    return {};
  }
}

// Rol de acceso resuelto por el servidor al loguear (ver api/_lib/roles.js) —
// 'full' | 'hr' | 'tem' | 'manager' | 'equipo'. Se usa para ocultar
// secciones/datos restringidos del lado del cliente (el bloqueo real ya
// pasó en el servidor).
function rolUsuarioActual(){
  try{
    return JSON.parse(localStorage.getItem('hub_user')||'{}').rol||'equipo';
  }catch(e){
    return 'equipo';
  }
}

// Único grupo de Beneficios que puede ver este rol ('Engineers'|'Core Team'),
// o null si ve los dos grupos sin restricción (full/tem/manager).
function grupoBeneficiosActual(){
  try{
    return JSON.parse(localStorage.getItem('hub_user')||'{}').grupoBeneficios||null;
  }catch(e){
    return null;
  }
}

// El token de sesión propio es "payload.firma" (no un JWT de 3 partes como el
// de Google) — decodeJwt no sirve acá porque toma la parte [1] asumiendo
// header.payload.firma.
function decodeSessionPayload(token){
  const payloadB64=token.split('.')[0];
  const json=decodeURIComponent(atob(payloadB64.replace(/-/g,'+').replace(/_/g,'/')).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join(''));
  return JSON.parse(json);
}

// Solo mira el campo "exp" del payload (no valida la firma — eso lo hace
// siempre el servidor) para poder avisar y limpiar la sesión vieja sin
// esperar a que un pedido a la API falle con 401.
function sesionExpirada(){
  const token=getIdToken();
  if(!token||!token.includes('.')) return true;
  try{
    const payload=decodeSessionPayload(token);
    return !payload.exp||Date.now()>payload.exp;
  }catch(e){ return true; }
}

function mostrarErrorLogin(msg){
  const el=document.getElementById('login-error');
  if(!el) return;
  el.textContent=msg;
  el.style.display='block';
}

// Callback que dispara Google Identity Services al elegir una cuenta
async function onGoogleSignIn(response){
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

  // Cambia el ID token de Google (corto) por un token de sesión propio (largo)
  let sesion;
  try{
    const r=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:response.credential})});
    sesion=await r.json();
    if(!r.ok) throw new Error(sesion?.error?.message||'No se pudo iniciar sesión.');
  }catch(e){
    mostrarErrorLogin('No se pudo iniciar sesión: '+e.message);
    return;
  }

  localStorage.setItem('hub_session_token',sesion.token);
  localStorage.setItem('hub_user',JSON.stringify({email,nombre:payload.name||email,foto:payload.picture||'',rol:sesion.rol||'equipo',grupoBeneficios:sesion.grupoBeneficios||null}));
  const err=document.getElementById('login-error');
  if(err) err.style.display='none';
  mostrarSesionActiva();
  document.getElementById('login-screen').style.display='none';
  aplicarRestriccionesDeAcceso();
  iniciarHub();
}

function mostrarSesionActiva(){
  const raw=localStorage.getItem('hub_user');
  if(!raw) return;
  const u=JSON.parse(raw);
  const box=document.getElementById('sb-user');
  if(!box) return;
  document.getElementById('sb-user-pic').src=u.foto||'';
  document.getElementById('sb-user-name').textContent=u.nombre||u.email;
  box.style.display='flex';
}

function cerrarSesion(){
  localStorage.removeItem('hub_session_token');
  localStorage.removeItem('hub_user');
  // Limpieza de sesiones guardadas antes de este cambio (sessionStorage)
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
  // El botón real de Google se renderiza invisible (ver .login-gbtn-real)
  // centrado sobre el botón con el estilo del mockup (.login-gbtn-visual) —
  // así el click cae siempre sobre el widget oficial de Google.
  if(btn) google.accounts.id.renderButton(btn,{theme:'outline',size:'large',text:'signin_with',shape:'rectangular',width:380});
}

// Se llama al arrancar — si ya hay sesión guardada (y no venció), no vuelve a
// pedir login. Devuelve true si hay sesión activa (y el caller puede seguir
// con iniciarHub()).
function checkSesion(){
  if(!getIdToken()||sesionExpirada()){
    localStorage.removeItem('hub_session_token');
    document.getElementById('login-screen').style.display='block';
    const anioEl=document.getElementById('login-year');
    if(anioEl) anioEl.textContent=new Date().getFullYear();
    initGoogleSignIn();
    return false;
  }
  mostrarSesionActiva();
  return true;
}
