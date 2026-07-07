// ─── TAREAS (tipo Asana) — Kanban + Calendario ────────────────────────────────
const COL_SUF_TAREA={'Por hacer':'Por-hacer','En progreso':'En-progreso','Hecho':'Hecho'};

// Personas del área de People — son las únicas asignables en el formulario de
// Tareas. El campo Área se carga a mano en Airtable (no tiene form propio en
// el Hub todavía), así que si el dropdown aparece vacío hay que revisar que
// esté completo ahí.
function personasAreaPeople(){
  return (cachePersonasRaw||[]).filter(p=>(p.fields['Área']||p.fields['Area']||'').trim()==='People').map(p=>p.fields.Nombre||'').filter(Boolean).sort();
}

async function loadTareas(){
  const d=await atGet('Tareas','&sort[0][field]=Fecha&sort[0][direction]=asc');
  cacheTareasRaw=d.records||[];
  poblarFiltroTareas();
  renderTareasKanban();
  renderTareasCalendario();
  actualizarMetricasTareas();
  document.getElementById('bc-tareas').textContent=cacheTareasRaw.filter(r=>r.fields.Estado!=='Hecho').length;
}

function poblarFiltroTareas(){
  const sel=document.getElementById('tareas-filtro-asignado');
  if(!sel) return;
  const actual=sel.value;
  const nombres=[...new Set(cacheTareasRaw.map(r=>r.fields.Asignado).filter(Boolean))].sort();
  sel.innerHTML='<option value="">Todos los asignados</option>'+nombres.map(n=>`<option value="${n}"${n===actual?' selected':''}>${n}</option>`).join('');
}

function filtrarTareas(){
  renderTareasKanban();
  renderTareasCalendario();
}

function tareasFiltradas(){
  const asignado=document.getElementById('tareas-filtro-asignado')?.value||'';
  return asignado?cacheTareasRaw.filter(r=>r.fields.Asignado===asignado):cacheTareasRaw;
}

function actualizarMetricasTareas(){
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const porHacer=cacheTareasRaw.filter(r=>(r.fields.Estado||'Por hacer')==='Por hacer').length;
  const hechas=cacheTareasRaw.filter(r=>r.fields.Estado==='Hecho').length;
  const vencidas=cacheTareasRaw.filter(r=>r.fields.Estado!=='Hecho'&&r.fields.Fecha&&new Date(r.fields.Fecha+'T12:00:00')<hoy).length;
  document.getElementById('mt-porhacer').textContent=porHacer;
  document.getElementById('mt-vencidas').textContent=vencidas;
  document.getElementById('mt-hechas').textContent=hechas;
}

function tarjetaTarea(r){
  const f=r.fields;
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const vencida=f.Estado!=='Hecho'&&f.Fecha&&new Date(f.Fecha+'T12:00:00')<hoy;
  const div=document.createElement('div');
  div.className='kanban-card';
  div.innerHTML=`
    <div class="kc-name">${f.Título||'—'}</div>
    <div class="kc-meta">
      ${f.Asignado?`${avH(f.Asignado)}${f.Asignado}<br>`:''}
      ${f.Fecha?`<span style="${vencida?'color:#C62828;font-weight:700':''}">📅 ${fmt(f.Fecha)}${f.Hora?` · ${f.Hora}`:''}${vencida?' · vencida':''}</span>`:''}
    </div>
    <div class="kc-actions">
      <button class="kc-btn-edit" title="Editar tarea" onclick="event.stopPropagation();abrirEdicionTarea('${r.id}')"><i class="ti ti-pencil"></i></button>
      <button class="kc-btn-del" title="Eliminar tarea" onclick="event.stopPropagation();eliminarTarea('${r.id}')"><i class="ti ti-trash"></i></button>
    </div>`;
  div.draggable=true;
  div.addEventListener('dragstart',e=>{dragId=r.id;div.classList.add('dragging');e.dataTransfer.effectAllowed='move';});
  div.addEventListener('dragend',()=>{div.classList.remove('dragging');dragId=null;});
  return div;
}

function renderTareasKanban(){
  const board=document.getElementById('kb-tareas');
  if(!board) return;
  const rows=tareasFiltradas();
  Object.entries(COL_SUF_TAREA).forEach(([estado,suf])=>{
    const cont=document.getElementById(`cardst-${suf}`);
    const cnt=document.getElementById(`kct-${suf}`);
    if(!cont||!cnt) return;
    const delEstado=rows.filter(r=>(r.fields.Estado||'Por hacer')===estado);
    cnt.textContent=delEstado.length;
    cont.innerHTML='';
    if(!delEstado.length){cont.innerHTML='<div class="kanban-empty">Sin tareas</div>';return;}
    delEstado.forEach(r=>cont.appendChild(tarjetaTarea(r)));
  });
  setupDragDropTareas();
}

function setupDragDropTareas(){
  const board=document.getElementById('kb-tareas');
  if(!board) return;
  board.querySelectorAll('.kanban-col').forEach(col=>{
    col.addEventListener('dragover',e=>{e.preventDefault();col.classList.add('drag-over');});
    col.addEventListener('dragleave',e=>{if(!col.contains(e.relatedTarget))col.classList.remove('drag-over');});
    col.addEventListener('drop',async e=>{
      e.preventDefault();
      col.classList.remove('drag-over');
      const idToMove=dragId;
      if(!idToMove) return;
      const nuevoEstado=col.dataset.col;
      if(!nuevoEstado) return;
      try{
        await atPatch(`Tareas/${idToMove}`,{Estado:nuevoEstado});
        toast(`Movida a "${nuevoEstado}" ✓`);
        await loadTareas();
      }catch(err){
        toast('Error al mover: '+err.message,true);
      }
    });
  });
}

function switchTareasTab(tab,btn){
  document.querySelectorAll('#page-tareas .tab-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  document.getElementById('tareas-tab-kanban').style.display=tab==='kanban'?'':'none';
  document.getElementById('tareas-tab-calendario').style.display=tab==='calendario'?'':'none';
}

function cambiarMesTareas(delta){
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const base=tareasCalMes||new Date(hoy.getFullYear(),hoy.getMonth(),1);
  tareasCalMes=new Date(base.getFullYear(),base.getMonth()+delta,1);
  renderTareasCalendario();
}

function renderTareasCalendario(){
  const grid=document.getElementById('tareas-calendario-grid');
  if(!grid) return;
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const base=tareasCalMes||new Date(hoy.getFullYear(),hoy.getMonth(),1);
  const ultimoDia=new Date(base.getFullYear(),base.getMonth()+1,0);
  const nombreMes=base.toLocaleString('es-AR',{month:'long',year:'numeric'});
  document.getElementById('tareas-cal-mes').textContent=nombreMes.charAt(0).toUpperCase()+nombreMes.slice(1);

  // Lunes como primer día de la semana
  const primerDiaSemana=new Date(base.getFullYear(),base.getMonth(),1).getDay();
  const diaSemanaInicio=(primerDiaSemana+6)%7; // 0=lunes
  const totalCeldas=Math.ceil((diaSemanaInicio+ultimoDia.getDate())/7)*7;

  const porFecha={};
  tareasFiltradas().forEach(r=>{
    if(!r.fields.Fecha) return;
    (porFecha[r.fields.Fecha]=porFecha[r.fields.Fecha]||[]).push(r);
  });

  const nombresDia=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  let html='<div class="tareas-cal-grid">';
  nombresDia.forEach(n=>html+=`<div class="tareas-cal-daynames">${n}</div>`);
  for(let i=0;i<totalCeldas;i++){
    const numDia=i-diaSemanaInicio+1;
    const fecha=new Date(base.getFullYear(),base.getMonth(),numDia);
    const esOtroMes=fecha.getMonth()!==base.getMonth();
    const esHoy=fecha.getTime()===hoy.getTime();
    const fechaStr=`${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,'0')}-${String(fecha.getDate()).padStart(2,'0')}`;
    const tareasDia=porFecha[fechaStr]||[];
    html+=`<div class="tareas-cal-cell${esOtroMes?' otro-mes':''}${esHoy?' hoy':''}" title="Agregar tarea el ${fechaStr}" onclick="abrirNuevaTareaConFecha('${fechaStr}')">
      <div class="tareas-cal-daynum">${fecha.getDate()}</div>
      ${tareasDia.map(r=>{
        const estado=r.fields.Estado||'Por hacer';
        const bg=estado==='Hecho'?'#D1FAE5':estado==='En progreso'?'#DBEAFE':'#FEF3C7';
        const fg=estado==='Hecho'?'#065F46':estado==='En progreso'?'#1E40AF':'#92400E';
        const titulo=(r.fields.Título||'—').replace(/"/g,'&quot;');
        return`<div class="tareas-cal-chip" style="background:${bg};color:${fg}" title="${titulo} — ${r.fields.Asignado||''}${r.fields.Hora?' · '+r.fields.Hora:''}" onclick="event.stopPropagation();abrirEdicionTarea('${r.id}')">${r.fields.Hora?r.fields.Hora+' · ':''}${r.fields.Título||'—'}</div>`;
      }).join('')}
    </div>`;
  }
  html+='</div>';
  grid.innerHTML=html;
}

// Crea una tarea nueva con la Fecha límite pre-cargada — se abre al hacer
// click en un día vacío del Calendario, para no tener que ir al botón
// "+Nueva tarea" de arriba y volver a tipear la fecha.
function abrirNuevaTareaConFecha(fechaStr){
  _openFormModal({
    ...FORMS.tareas,
    onMount:()=>{const el=document.getElementById('f-tar-fecha');if(el)el.value=fechaStr;},
  });
}

function abrirEdicionTarea(id){
  const tarea=cacheTareasRaw.find(r=>r.id===id);
  if(!tarea) return;
  const f=tarea.fields;
  // Si la tarea ya estaba asignada a alguien que ya no es de People (o que
  // se cargó antes de este filtro), se conserva la opción para no perder el
  // dato al editar otro campo sin querer.
  const personas=personasAreaPeople();
  const opciones=(f.Asignado&&!personas.includes(f.Asignado))?[...personas,f.Asignado]:personas;
  _openFormModal({
    title:'Editar tarea',
    html:()=>`
<div class="field-group"><label class="field-label">Título *</label><input class="field-input" id="f-tar-titulo" value="${f.Título||''}"></div>
<div class="field-group"><label class="field-label">Asignado a *</label>
  <select class="field-input" id="f-tar-asignado">
    ${opciones.map(n=>`<option value="${n}"${n===f.Asignado?' selected':''}>${n}</option>`).join('')}
  </select>
</div>
<div class="field-group">
  <label class="field-label">Fecha límite *</label>
  <div style="display:flex;gap:8px;">
    <input class="field-input" id="f-tar-fecha" type="date" style="flex:1" value="${f.Fecha||''}">
    <input class="field-input" id="f-tar-hora" type="time" style="flex:0 0 110px" title="Horario (opcional)" value="${f.Hora||''}">
  </div>
</div>
<div class="field-group"><label class="field-label">Estado</label>
  <select class="field-input" id="f-tar-estado">
    ${['Por hacer','En progreso','Hecho'].map(e=>`<option value="${e}"${e===(f.Estado||'Por hacer')?' selected':''}>${e}</option>`).join('')}
  </select>
</div>
<div class="field-group"><label class="field-label">Descripción</label><textarea class="field-input" id="f-tar-desc">${f.Descripción||''}</textarea></div>
`,
    save:async()=>{
      const v=id2=>document.getElementById(id2)?.value||'';
      if(!v('f-tar-titulo')){toast('El título es obligatorio',true);return false;}
      if(!v('f-tar-asignado')){toast('Asigná la tarea a alguien',true);return false;}
      if(!v('f-tar-fecha')){toast('La fecha límite es obligatoria',true);return false;}
      await atPatch(`Tareas/${id}`,{Título:v('f-tar-titulo'),Asignado:v('f-tar-asignado'),Fecha:v('f-tar-fecha'),Hora:v('f-tar-hora'),Estado:v('f-tar-estado')||'Por hacer',Descripción:v('f-tar-desc')});
      return true;
    },
  });
}

// ─── Repetición (panel del formulario "Nueva tarea") ──────────────────────────
function toggleRepeticionTarea(){
  const panel=document.getElementById('f-tar-repeat-panel');
  if(!panel) return;
  const abierto=panel.style.display!=='none';
  panel.style.display=abierto?'none':'';
  document.getElementById('f-tar-repetir-btn')?.classList.toggle('active',!abierto);
}

function onFrecuenciaTareaChange(){
  const frecuencia=document.getElementById('f-tar-frecuencia')?.value||'';
  const filaDias=document.getElementById('f-tar-dias-row');
  if(filaDias){
    filaDias.style.display=frecuencia==='semanal'?'':'none';
    if(frecuencia==='semanal'&&!filaDias.querySelector('.dia-chip.active')){
      const fecha=document.getElementById('f-tar-fecha')?.value;
      if(fecha){
        const dow=new Date(fecha+'T12:00:00').getDay();
        filaDias.querySelector(`.dia-chip[data-dia="${dow}"]`)?.classList.add('active');
      }
    }
  }
  actualizarHintRepeticionTarea();
}

function toggleDiaTarea(btn){
  btn.classList.toggle('active');
  actualizarHintRepeticionTarea();
}

function diasSemanaSeleccionados(){
  return[...document.querySelectorAll('#f-tar-dias-row .dia-chip.active')].map(b=>Number(b.dataset.dia));
}

function actualizarHintRepeticionTarea(){
  const hint=document.getElementById('f-tar-repeat-hint');
  if(!hint) return;
  const frecuencia=document.getElementById('f-tar-frecuencia')?.value||'';
  const fecha=document.getElementById('f-tar-fecha')?.value||'';
  if(!frecuencia){hint.textContent='';return;}
  if(!fecha){hint.textContent='Elegí primero la fecha límite para calcular las repeticiones.';return;}
  const extras=generarFechasRecurrentes(fecha,frecuencia,diasSemanaSeleccionados());
  const horizonte={diaria:'los próximos 30 días',semanal:'las próximas 8 semanas',mensual:'los próximos 12 meses',anual:'los próximos 5 años'}[frecuencia];
  hint.textContent=extras.length?`Se van a crear ${extras.length} tarea${extras.length===1?'':'s'} más durante ${horizonte}.`:`No hay más ocurrencias durante ${horizonte} — probá elegir al menos un día.`;
}

function eliminarTarea(id){
  const tarea=cacheTareasRaw.find(r=>r.id===id);
  const titulo=tarea?.fields?.Título||'esta tarea';
  showConfirm(
    `¿Eliminar "${titulo}"?`,
    'Esta acción no se puede deshacer.',
    async()=>{
      await atDelete('Tareas',id).catch(()=>{});
      toast('Tarea eliminada ✓');
      await loadTareas();
    }
  );
}
