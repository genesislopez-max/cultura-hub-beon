function toggleRol(){
  const t=document.getElementById('f-tipo')?.value;
  {const _fg=document.getElementById('fg-rol');if(_fg) _fg.style.display=t==='Egreso'?'none':'block';}
  {const _e=document.getElementById('rem-preview');if(_e) _e.style.display=t==='Egreso'?'none':'block';}
}

function toggleTipoReminder(){
  const t=document.getElementById('f-rv-tipo')?.value;
  const esManual=t==='Manual';
  {const _fg=document.getElementById('fg-rv-persona');if(_fg) _fg.style.display=esManual?'none':'block';}
  {const _fg=document.getElementById('fg-rv-evento');if(_fg) _fg.style.display=esManual?'block':'none';}
}

// ─── TEMA (claro/oscuro) ─────────────────────────────────────────────────────
function actualizarIconoTema(tema){
  const icon=document.getElementById('sb-theme-icon');
  const label=document.getElementById('sb-theme-label');
  if(icon) icon.className=tema==='dark'?'ti ti-sun':'ti ti-moon';
  if(label) label.textContent=tema==='dark'?'Modo claro':'Modo oscuro';
}
function toggleTheme(){
  const actual=document.documentElement.getAttribute('data-theme')||'light';
  const nuevo=actual==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',nuevo);
  localStorage.setItem('hub_theme',nuevo);
  actualizarIconoTema(nuevo);
}

// ─── MENÚ LATERAL (dropdown) ─────────────────────────────────────────────────
function toggleSidebarGroup(nombre){
  const btnGrupo=document.querySelector(`.sb-section[data-group="${nombre}"]`);
  const grupo=document.getElementById(`sbg-${nombre}`);
  if(!btnGrupo||!grupo) return;
  const colapsado=grupo.classList.toggle('collapsed');
  btnGrupo.classList.toggle('collapsed',colapsado);
  const guardados=new Set(JSON.parse(localStorage.getItem('hub_sidebar_collapsed')||'[]'));
  if(colapsado) guardados.add(nombre); else guardados.delete(nombre);
  localStorage.setItem('hub_sidebar_collapsed',JSON.stringify([...guardados]));
}

// Se llama al arrancar — colapsa los grupos que el usuario ya había cerrado
// en una sesión anterior (mismo patrón que el theme guardado).
function aplicarSidebarColapsado(){
  const guardados=JSON.parse(localStorage.getItem('hub_sidebar_collapsed')||'[]');
  guardados.forEach(nombre=>{
    document.querySelector(`.sb-section[data-group="${nombre}"]`)?.classList.add('collapsed');
    document.getElementById(`sbg-${nombre}`)?.classList.add('collapsed');
  });
}

// ─── NAV ─────────────────────────────────────────────────────────────────────
function showSection(name,btn){
  document.querySelectorAll('.section-page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  document.querySelectorAll('.sb-item').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  // Si la sección vive en un grupo del menú colapsado, expandirlo — para que
  // la navegación (ej. un link de "Ver proyecto") nunca deje el item activo escondido.
  const grupoNombre=SECCION_GRUPO[name];
  if(grupoNombre&&document.getElementById(`sbg-${grupoNombre}`)?.classList.contains('collapsed')){
    toggleSidebarGroup(grupoNombre);
  }
  document.getElementById('page-title').textContent=TITLES[name]||name;
  const eyebrow=document.getElementById('page-eyebrow');
  if(eyebrow){
    const texto=EYEBROWS[name];
    eyebrow.style.display=texto?'block':'none';
    eyebrow.textContent=texto||'';
  }
  const btnExportar=document.getElementById('btn-inicio-exportar');
  const btnAgregarPersona=document.getElementById('btn-inicio-agregar');
  if(btnExportar) btnExportar.style.display=name==='inicio'?'flex':'none';
  if(btnAgregarPersona) btnAgregarPersona.style.display=name==='inicio'?'flex':'none';
  const ab=document.getElementById('btn-add');
  const abf=document.getElementById('btn-add-full');
  const abh=document.getElementById('btn-add-historico');
  if(ADD.includes(name)){
    ab.style.display='flex';
    document.getElementById('btn-label').textContent=LABELS[name];
    currentForm=FORMS[name];
    if(ADD_FULL_SECTIONS.includes(name)){
      abf.style.display='flex';
      const fullLabel=document.getElementById('btn-full-label');
      if(fullLabel) fullLabel.textContent='Ingreso completo';
      currentFormFull=FORMS['ingresos_full'];
      if(abh) abh.style.display='flex';
    } else {
      abf.style.display='none';
      currentFormFull=null;
      if(abh) abh.style.display='none';
    }
  } else {
    ab.style.display='none';
    abf.style.display='none';
    if(abh) abh.style.display='none';
    currentForm=null;
    currentFormFull=null;
  }
  cargarSeccionLazy(name);
}

function openModal(){
  if(!currentForm)return;
  _openFormModal(currentForm);
}
// Carga silenciosa de una persona que ya no está en BEON — a diferencia de
// "Nuevo ingreso"/"HR rápido", no genera tarjeta de Kanban ni aviso de Slack
// (ver sincronizarPersonasEnKanban), para no ensuciar el flujo activo con
// gente que se cargó recién pero se fue hace tiempo.
function openModalHistorico(){
  _openFormModal(FORMS.historico);
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
// Rellena un <select> de proyectos con el cache actual, opcionalmente preseleccionando uno
function fillProyectosSelect(selectId, selected){
  const sel=document.getElementById(selectId);
  if(!sel) return;
  const opts=[...new Set((cacheProyectos||[]).filter(Boolean))].sort();
  sel.innerHTML='<option value="">Sin proyecto</option>'+opts.map(p=>`<option value="${p}"${p===selected?' selected':''}>${p}</option>`).join('');
}
function buildIngresoSimpleHTML(){
  return`
<div class="field-group"><label class="field-label">Nombre *</label><input class="field-input" id="f-nombre" placeholder="Nombre y apellido"></div>
<div class="field-group"><label class="field-label">Rol en empresa *</label>
  <select class="field-input" id="f-rol-empresa">
    <option value="Engineer">Engineer</option>
    <option value="Core Team">Core Team</option>
    <option value="Supervisor">Supervisor</option>
    <option value="TEM">TEM</option>
    <option value="Lead">Lead</option>
    <option value="Manager">Manager</option>
  </select>
</div>
<div class="field-group"><label class="field-label">Fecha de ingreso *</label><input class="field-input" id="f-ingreso" type="date"></div>
<div class="field-group"><label class="field-label">Comentarios</label><textarea class="field-input" id="f-comentarios" placeholder="Cualquier dato útil para completar el ingreso después"></textarea></div>
`;
}
async function saveIngresoSimple(){
  const v=id=>document.getElementById(id)?.value||'';
  if(!v('f-nombre')){toast('El nombre es obligatorio',true);return false;}
  if(!v('f-ingreso')){toast('La fecha de ingreso es obligatoria',true);return false;}
  const fields={Nombre:v('f-nombre'),'Rol en empresa':v('f-rol-empresa')||'Engineer','Fecha de ingreso':v('f-ingreso')};
  if(v('f-comentarios')) fields.Comentarios=v('f-comentarios');
  await atPost('Personas',fields);
  return true;
}
// HR rápido — formulario simple
function openModalHR(){
  const hrForm={
    title:'Ingreso rápido (HR)',
    html:()=>buildIngresoSimpleHTML(),
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
    if(ok!==false){closeModal();toast('Guardado ✓');await loadAll();}
  }catch(e){toast('Error: '+e.message,true);}
  btn.disabled=false;lbl.textContent='Guardar';
}

// Secciones que necesita el dashboard de Inicio — se cargan siempre al arrancar
async function cargarSeccionesIniciales(){
  const personas=await loadPersonas();
  await loadProyectos();
  await sincronizarPersonasEnKanban(personas);
  const resultados=await Promise.allSettled([
    loadCumpleanos(personas),
    loadAniversarios(personas),
    loadKanbanIngresos(),
    loadKanbanEgresos(),
    loadReviews(),
  ]);
  const nombres=['Cumpleaños','Aniversarios','Ingresos','Egresos','Glassdoor'];
  const fallidas=resultados.map((r,i)=>({nombre:nombres[i],r})).filter(({r})=>r.status==='rejected');
  fallidas.forEach(({nombre,r})=>console.error(`Error cargando "${nombre}":`,r.reason));
  if(fallidas.length) toast(`⚠️ No se pudo cargar: ${fallidas.map(f=>f.nombre).join(', ')}`,true);
}

// Secciones que recién se piden a Airtable la primera vez que el usuario las visita
const SECCIONES_LAZY=[
  ['checklist','Checklist',loadChecklist],
  ['beneficios','Beneficios',loadBeneficios],
  ['ambassadors','Ambassador Week',loadAmbassadors],
  ['offsites','Off Sites',loadOffsites],
  ['gettogether','Get Together',loadGetTogether],
  ['tareas','Tareas',loadTareas],
  ['actividades','Asistencia a Actividades',loadActividadesVirtuales],
];

// Se llama al entrar a una sección — si ya se cargó antes en esta sesión, no repite el fetch
function cargarSeccionLazy(name){
  const entry=SECCIONES_LAZY.find(([id])=>id===name);
  if(!entry||seccionesCargadas.has(name)) return;
  const [id,label,loader]=entry;
  seccionesCargadas.add(id);
  loader().catch(e=>{
    seccionesCargadas.delete(id); // permite reintentar si el usuario vuelve a entrar
    console.error(`Error cargando "${label}":`,e);
    toast(`⚠️ No se pudo cargar ${label}: ${e.message}`,true);
  });
}

// Recarga todo — se usa después de guardar/eliminar registros, donde no sabemos
// de antemano qué secciones pueden haberse visto afectadas
async function loadAll(){
  await cargarSeccionesIniciales();
  const resultados=await Promise.allSettled(SECCIONES_LAZY.map(([id,,loader])=>loader().then(()=>seccionesCargadas.add(id))));
  const fallidas=resultados
    .map((r,i)=>({label:SECCIONES_LAZY[i][1],r}))
    .filter(({r})=>r.status==='rejected');
  fallidas.forEach(({label,r})=>console.error(`Error cargando "${label}":`,r.reason));
  if(fallidas.length){
    toast(`⚠️ No se pudo cargar: ${fallidas.map(f=>f.label).join(', ')}`,true);
  }
}

async function iniciarHub(){
  const fechaHoy=new Date().toLocaleDateString('es-AR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  document.getElementById('page-date').innerHTML=`<i class="ti ti-calendar"></i><span>${fechaHoy}</span>`;
  // Inicio ya arranca "active" en el HTML (no pasa por showSection()), así que
  // hay que prender acá su eyebrow/botones del header por única vez.
  const eyebrow=document.getElementById('page-eyebrow');
  if(eyebrow) eyebrow.style.display='block';
  const btnExportar=document.getElementById('btn-inicio-exportar');
  const btnAgregarPersona=document.getElementById('btn-inicio-agregar');
  if(btnExportar) btnExportar.style.display='flex';
  if(btnAgregarPersona) btnAgregarPersona.style.display='flex';
  try{
    await cargarSeccionesIniciales();
    setBanner('Hub conectado ✓','ok');
    document.getElementById('dot').className='dot ok';
    document.getElementById('conn-status').textContent='Conectado';
  }catch(e){
    // Si falla con 401/403, la sesión de Google venció o no es válida
    if(e.status===401||e.status===403){
      setBanner('Tu sesión expiró — iniciá sesión de nuevo','err');
      document.getElementById('dot').className='dot err';
      document.getElementById('conn-status').textContent='Sesión expirada';
      setTimeout(()=>{ cerrarSesion(); },2000);
    } else {
      setBanner('Error de conexión: '+e.message,'err');
      document.getElementById('dot').className='dot err';
      document.getElementById('conn-status').textContent='Error de conexión';
    }
    console.error(e);
  }
}

async function init(){
  actualizarIconoTema(document.documentElement.getAttribute('data-theme')||'light');
  aplicarSidebarColapsado();
  if(!checkSesion()) return; // muestra la pantalla de login; onGoogleSignIn() llama a iniciarHub()
  await iniciarHub();
}
init();
