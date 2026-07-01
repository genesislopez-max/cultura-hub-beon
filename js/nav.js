function toggleRol(){
  const t=document.getElementById('f-tipo')?.value;
  {const _fg=document.getElementById('fg-rol');if(_fg) _fg.style.display=t==='Egreso'?'none':'block';}
  {const _e=document.getElementById('rem-preview');if(_e) _e.style.display=t==='Egreso'?'none':'block';}
}

// ─── NAV ─────────────────────────────────────────────────────────────────────
function showSection(name,btn){
  document.querySelectorAll('.section-page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.querySelectorAll('.sb-item').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  document.getElementById('page-title').textContent=TITLES[name]||name;
  const ab=document.getElementById('btn-add');
  const abf=document.getElementById('btn-add-full');
  if(ADD.includes(name)){
    ab.style.display='flex';
    document.getElementById('btn-label').textContent=LABELS[name];
    currentForm=FORMS[name];
    if(ADD_FULL_SECTIONS.includes(name)){
      abf.style.display='flex';
      const fullLabel=document.getElementById('btn-full-label');
      if(fullLabel) fullLabel.textContent='Ingreso completo';
      currentFormFull=FORMS['ingresos_full'];
    } else {
      abf.style.display='none';
      currentFormFull=null;
    }
  } else {
    ab.style.display='none';
    abf.style.display='none';
    currentForm=null;
    currentFormFull=null;
  }
}

function openModal(){
  if(!currentForm)return;
  _openFormModal(currentForm);
}
// "Ingreso completo" — pre-llena con datos del último ingreso HR sin completar
async function openModalFull(){
  if(!currentFormFull)return;
  // Abrir el form primero con datos vacíos
  _openFormModal(currentFormFull);
  // Buscar último ingreso HR y pre-llenar
  const datos=await getUltimoIngresoHR();
  if(!datos) return;
  // Pre-llenar campos si existen en el DOM
  const set=(id,val)=>{const el=document.getElementById(id);if(el&&val)el.value=val;};
  set('f-nombre', datos.nombre);
  set('f-ingreso', datos.fecha);
  // Rol en empresa
  const fRolEmpresa=document.getElementById('f-rol-empresa');
  if(fRolEmpresa&&datos.rol){
    fRolEmpresa.value=datos.rol;
    onRolEmpresaChange(); // sincroniza perfil checklist y managers
  }
  // Proyecto — esperar a que se llene el select y pasar el valor actual
  await new Promise(r=>setTimeout(r,300));
  if(datos.proyecto) fillProyectosSelect('f-proyecto', datos.proyecto);
  // Info al usuario
  if(datos.nombre) toast(`Pre-llenado con datos de ${datos.nombre} ✓`);
}
// HR rápido — formulario simple
function openModalHR(){
  const hrForm={
    title:'Ingreso rápido (HR)',
    html:()=>buildIngresoSimpleHTML(),
    onMount:async()=>{
      fillProyectosSelect('f-proyecto');
      if(!cacheProyectos.length){
        try{const d=await atGet('Proyectos');cacheProyectos=d.records.map(r=>r.fields.Proyecto||'').filter(Boolean);fillProyectosSelect('f-proyecto');}catch(e){}
      }
    },
    save:saveIngresoSimple
  };
  _openFormModal(hrForm);
}
function _openFormModal(form){
  document.getElementById('modal-title').textContent=form.title;
  document.getElementById('modal-body').innerHTML=typeof form.html==='function'?form.html():form.html;
  document.getElementById('modal-overlay').classList.add('open');
  // guardar referencia al form activo para saveRecord
  window._activeForm=form;
  if(form.onMount)form.onMount();
}
function closeModal(e){
  if(!e||e.target===document.getElementById('modal-overlay'))
    document.getElementById('modal-overlay').classList.remove('open');
}
async function saveRecord(){
  const form=window._activeForm;
  if(!form)return;
  const btn=document.getElementById('btn-save'),lbl=document.getElementById('save-label');
  btn.disabled=true;lbl.textContent='Guardando...';
  try{
    const ok=await form.save();
    if(ok!==false){closeModal();toast('Guardado en Airtable ✓');await loadAll();}
  }catch(e){toast('Error: '+e.message,true);}
  btn.disabled=false;lbl.textContent='Guardar en Airtable';
}

function guardarConfig(){
  const token=document.getElementById('cfg-token')?.value.trim();
  const base=document.getElementById('cfg-base')?.value.trim();
  const slack=document.getElementById('cfg-slack')?.value.trim();
  if(!token||!base){alert('Completá el Token y Base ID para continuar.');return;}
  localStorage.setItem('at_token',token);
  localStorage.setItem('at_base',base);
  if(slack) localStorage.setItem('slack_webhook',slack);
  TOKEN=token; BASE=base; SLACK_WEBHOOK=slack||localStorage.getItem('slack_webhook')||''; actualizarHDR();
  document.getElementById('config-screen').style.display='none';
  iniciarHub();
}

function resetConfig(){
  localStorage.removeItem('at_token');
  localStorage.removeItem('at_base');
  TOKEN=''; BASE='';
  document.getElementById('cfg-token').value='';
  document.getElementById('cfg-base').value='';
  document.getElementById('config-screen').style.display='flex';
}

async function loadAll(){
  const personas=await loadPersonas();
  await loadProyectos();
  await sincronizarPersonasEnKanban(personas);
  await Promise.all([
    loadCumpleanos(personas),
    loadAniversarios(personas),
    loadReviews(),
    loadChecklist(),
    loadBeneficios(),
    loadAmbassadors(),
    loadOffsites(),
    loadGetTogether(),
    loadKanbanIngresos(),
    loadKanbanEgresos(),
  ]);
}

async function iniciarHub(){
  document.getElementById('page-date').textContent=new Date().toLocaleDateString('es-AR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  try{
    await loadAll();
    setBanner('Hub conectado a Airtable ✓','ok');
    document.getElementById('dot').className='dot ok';
    document.getElementById('conn-status').textContent='Conectado a Airtable';
  }catch(e){
    // Si falla con 401, probablemente el token es inválido
    if(e.message&&e.message.includes('401')){
      setBanner('Token inválido — revisá tu configuración','err');
      document.getElementById('dot').className='dot err';
      document.getElementById('conn-status').textContent='Token inválido';
      setTimeout(()=>{ document.getElementById('config-screen').style.display='flex'; },2000);
    } else {
      setBanner('Error de conexión: '+e.message,'err');
      document.getElementById('dot').className='dot err';
      document.getElementById('conn-status').textContent='Error de conexión';
    }
    console.error(e);
  }
}

async function init(){
  // Cargar webhook de Slack si existe
  SLACK_WEBHOOK=localStorage.getItem('slack_webhook')||'';
  if(!TOKEN||!BASE){
    // Mostrar pantalla de configuración
    const savedSlack=localStorage.getItem('slack_webhook')||'';
    if(savedSlack) document.getElementById('cfg-slack').value=savedSlack;
    document.getElementById('config-screen').style.display='flex';
    return;
  }
  await iniciarHub();
}
init();
