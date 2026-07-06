// ─── UTILS ───────────────────────────────────────────────────────────────────
function setBanner(msg,type='info'){
  const b=document.getElementById('banner'),sp=document.getElementById('banner-spinner');
  document.getElementById('banner-msg').textContent=msg;
  b.className='banner banner-'+type;
  sp.style.display=type==='info'?'block':'none';
  if(type!=='info')setTimeout(()=>b.style.display='none',4000);
}
function toast(msg,err=false){
  const t=document.getElementById('toast');
  t.textContent=msg;t.style.background=err?'#A32D2D':'#1E2235';
  t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3500);
}
function fmt(d){if(!d)return'—';const dt=new Date(d+'T12:00:00');return dt.toLocaleDateString('es-AR',{day:'2-digit',month:'short',year:'numeric'});}
function daysTo(ds){
  if(!ds)return 9999;
  const now=new Date();now.setHours(0,0,0,0);
  let d=new Date(ds+'T12:00:00');d.setHours(0,0,0,0);d.setFullYear(now.getFullYear());
  if(d<now)d.setFullYear(now.getFullYear()+1);
  return Math.round((d-now)/86400000);
}
function safeStr(n){return Array.isArray(n)?n[0]||'':typeof n==='string'?n:String(n||'');}
function av(n){const s=safeStr(n);return AVS[s.split('').reduce((a,c)=>a+c.charCodeAt(0),0)%AVS.length];}
function ini(n){const s=safeStr(n)||'?';return s.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();}
function avH(n){const s=safeStr(n);return`<div class="avatar ${av(s)}">${ini(s)}</div>`;}

// ─── MÉTRICAS POR TRIMESTRE (Beneficios / Off Sites / Get Together / AW) ──────
const MESES_ES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// Puebla un <select> de años con el año actual + los años detectados en los
// datos, preservando la selección vigente si sigue siendo una opción válida.
function poblarSelectorAnio(selectId,anios){
  const sel=document.getElementById(selectId);
  if(!sel) return;
  const actual=sel.value;
  const todos=new Set([new Date().getFullYear(),...anios]);
  sel.innerHTML=[...todos].sort((a,b)=>b-a).map(a=>`<option value="${a}"${String(a)===actual?' selected':''}>${a}</option>`).join('');
}

// Rango [inicio,fin] del trimestre calendario q (1-4) del año dado.
function rangoTrimestre(anio,q){
  const mesInicio=(q-1)*3;
  return {inicio:new Date(anio,mesInicio,1),fin:new Date(anio,mesInicio+3,0)};
}

// Ambassador Week no tiene un campo de fecha real, solo "Edición AW" a mano
// (ej. "diciembre 2021") — intenta interpretarlo como fecha para poder
// agruparlo por trimestre. Devuelve 'YYYY-MM-01' o null si no lo reconoce.
function parsearEdicionAW(texto){
  if(!texto) return null;
  const m=String(texto).toLowerCase().match(/([a-záéíóúñ]+)\D{0,3}(\d{4})/i);
  if(!m) return null;
  const palabra=m[1];
  const mesIdx=MESES_ES.findIndex(mes=>mes.startsWith(palabra)||palabra.startsWith(mes));
  if(mesIdx===-1) return null;
  return `${m[2]}-${String(mesIdx+1).padStart(2,'0')}-01`;
}
// ─── CONFIRM DIALOG ──────────────────────────────────────────────────────────
function showConfirm(title, msg, onOk){
  document.getElementById('confirm-title').textContent=title;
  document.getElementById('confirm-msg').textContent=msg;
  const btn=document.getElementById('confirm-ok');
  // Clonar para limpiar listeners previos
  const newBtn=btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn,btn);
  newBtn.onclick=async()=>{
    newBtn.disabled=true;
    newBtn.innerHTML='<i class="ti ti-loader" style="animation:spin 0.8s linear infinite"></i> Eliminando...';
    try{ await onOk(); }finally{ closeConfirm(); }
  };
  document.getElementById('confirm-overlay').classList.add('open');
}
function closeConfirm(){
  document.getElementById('confirm-overlay').classList.remove('open');
  document.getElementById('confirm-ok').disabled=false;
  document.getElementById('confirm-ok').innerHTML='<i class="ti ti-trash"></i>Eliminar';
}
function getRolGroup(rol){
  const core=['Core Team','Supervisor','TEM','Lead','Manager','COO','Founder'];
  return core.includes(rol)?'Core Team':'Engineers';
}
