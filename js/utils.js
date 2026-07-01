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
