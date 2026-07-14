// Combobox unificado — un <select> nativo (mismo look que el resto de los
// dropdowns del Hub: checkmark y resaltado del navegador) con una opción
// final "Otro (escribir a mano)" que revela un input de texto libre para
// cargar un valor que todavía no está en la lista. Reemplaza los inputs con
// <datalist>, que el navegador dibuja como una lista plana sin ese estilo.
function buildSelectConOtro(id,opciones,valorActual,placeholderOtro,placeholderSelect){
  const enLista=!!valorActual&&opciones.includes(valorActual);
  const esOtro=!!valorActual&&!enLista;
  return`<select class="field-input" id="${id}" onchange="toggleOtroSelect('${id}')">
    <option value="">${placeholderSelect||'Seleccioná…'}</option>
    ${opciones.map(o=>`<option value="${o}"${o===valorActual?' selected':''}>${o}</option>`).join('')}
    <option value="__otro__"${esOtro?' selected':''}>Otro (escribir a mano)</option>
  </select>
  <input class="field-input" id="${id}-otro" placeholder="${placeholderOtro}" value="${esOtro?valorActual:''}" style="margin-top:8px;display:${esOtro?'block':'none'}">`;
}
function toggleOtroSelect(id){
  const sel=document.getElementById(id);
  const otro=document.getElementById(id+'-otro');
  if(!sel||!otro) return;
  otro.style.display=sel.value==='__otro__'?'block':'none';
}
function valorSelectOtro(id){
  const sel=document.getElementById(id);
  if(!sel) return '';
  if(sel.value==='__otro__'){
    const otro=document.getElementById(id+'-otro');
    return otro?otro.value.trim():'';
  }
  return sel.value;
}

// Form completo de Persona — lo usan "Nueva persona", "Nuevo ingreso" (misma carga,
// es la forma de no tener que completar nada aparte) y la edición desde la
// tarjeta del Kanban de Ingresos/Egresos. mostrarEgreso solo se activa al
// editar: la fecha de egreso se carga desde la pestaña de Egresos, no al
// dar de alta a alguien nuevo.
function buildPersonaCompletaHTML(v={},mostrarEgreso=false,ocultarNivel=false){
  const proyectos=[...new Set((cacheProyectosRaw||[]).map(p=>p.fields.Proyecto||'').filter(Boolean))].sort();
  const opt=(val,cur)=>`<option value="${val}"${val===(cur||'')?' selected':''}>${val}</option>`;
  // COO/Founder ya no se pueden asignar al dar de alta — son roles fijos de
  // 1 persona. Si ya estaba cargado así (edición), se deja la opción para
  // no perderlo sin querer al guardar.
  const rolActual=v['Rol en empresa'];
  const rolesBase=['Engineer','Core Team','Supervisor','TEM','Lead','Manager'];
  const roles=(rolActual==='COO'||rolActual==='Founder')?[...rolesBase,rolActual]:rolesBase;
  return`
<div class="field-group"><label class="field-label">Nombre *</label><input class="field-input" id="f-per-nombre" placeholder="Nombre y apellido" value="${v.Nombre||''}"></div>
<div class="field-group"><label class="field-label">BEON mail</label><input class="field-input" id="f-per-mail" type="email" placeholder="nombre@beon.tech" value="${v.Mail||''}"></div>
<div class="field-group"><label class="field-label">Rol en empresa *</label>
  <select class="field-input" id="f-per-rol" onchange="actualizarManagerOptions()">
    ${roles.map(r=>opt(r,rolActual)).join('')}
  </select>
</div>
${ocultarNivel?'':`<div class="field-group"><label class="field-label">Nivel Loyalty</label>
  <select class="field-input" id="f-per-nivel">
    ${['Spark','Ray','Lightning','Thunder','Storm'].map(n=>opt(n,v['Nivel Loyalty']||'Spark')).join('')}
  </select>
</div>`}
<div class="field-group"><label class="field-label">Proyecto</label>
  ${buildSelectConOtro('f-per-proyecto',proyectos,v.Proyecto||'','Ej: Atlas')}
</div>
<div class="field-group"><label class="field-label">País</label><input class="field-input" id="f-per-pais" placeholder="Ej: Argentina" value="${v['País']||''}"></div>
<div class="field-group"><label class="field-label">Ciudad</label><input class="field-input" id="f-per-ciudad" placeholder="Ej: Buenos Aires" value="${v.Ciudad||''}"></div>
<div class="field-group"><label class="field-label">Manager</label>
  ${buildSelectConOtro('f-per-manager',[],v.Manager||'','TEM / Manager a cargo')}
</div>
<div class="field-group"><label class="field-label">Fecha de ingreso</label><input class="field-input" id="f-per-ingreso" type="date" value="${v['Fecha de ingreso']||''}"></div>
<div class="field-group"><label class="field-label">Fecha de cumpleaños</label><input class="field-input" id="f-per-cumple" type="date" value="${v['Fecha de cumpleaños']||''}"></div>
${mostrarEgreso?`<div class="field-group"><label class="field-label">Fecha de egreso (último día)</label><input class="field-input" id="f-per-egreso" type="date" value="${v['Fecha de egreso']||''}"></div>`:''}
<div class="field-group"><label class="field-label">Comentarios</label><textarea class="field-input" id="f-per-comentarios" placeholder="Notas sobre el ingreso">${v.Comentarios||''}</textarea></div>
`;
}
// Sugerencias de Manager según el Rol en empresa elegido: Engineers ven a
// los TEM, Core Team ve a Supervisor/Lead/Manager/Founder/COO. Reconstruye
// las opciones del <select> preservando lo que ya estaba elegido/tipeado —
// si ese valor no entra en la nueva lista de candidatos, cae en "Otro" con
// el texto conservado en vez de perderse.
function actualizarManagerOptions(){
  const sel=document.getElementById('f-per-manager');
  if(!sel) return;
  const valorPrevio=valorSelectOtro('f-per-manager');
  const rol=document.getElementById('f-per-rol')?.value;
  const ROLES_MANAGER_ENGINEER=new Set(['TEM']);
  const ROLES_MANAGER_CORE=new Set(['Supervisor','Lead','Manager','Founder','COO']);
  const rolesValidos=rol==='Engineer'?ROLES_MANAGER_ENGINEER:rol==='Core Team'?ROLES_MANAGER_CORE:null;
  const candidatos=rolesValidos?(cachePersonasRaw||[]).filter(p=>rolesValidos.has((p.fields['Rol en empresa']||'').trim())):[];
  const nombres=[...new Set(candidatos.map(p=>p.fields.Nombre).filter(Boolean))].sort();
  const enLista=!!valorPrevio&&nombres.includes(valorPrevio);
  sel.innerHTML=`<option value="">Seleccioná…</option>${nombres.map(n=>`<option value="${n}"${n===valorPrevio?' selected':''}>${n}</option>`).join('')}<option value="__otro__"${valorPrevio&&!enLista?' selected':''}>Otro (escribir a mano)</option>`;
  const otro=document.getElementById('f-per-manager-otro');
  if(otro){
    otro.style.display=valorPrevio&&!enLista?'block':'none';
    if(valorPrevio&&!enLista) otro.value=valorPrevio;
  }
}

// esEdicion=true permite vaciar un campo para borrarlo; en alta simplemente se omite
function leerPersonaCompletaForm(esEdicion){
  const v=id=>document.getElementById(id)?.value||'';
  if(!v('f-per-nombre')){toast('El nombre es obligatorio',true);return null;}
  const fields={Nombre:v('f-per-nombre'),'Rol en empresa':v('f-per-rol')||'Engineer','Nivel Loyalty':v('f-per-nivel')||'Spark'};
  const setTexto=(campo,id)=>{const val=v(id);if(val) fields[campo]=val; else if(esEdicion) fields[campo]='';};
  const setTextoSelectOtro=(campo,id)=>{const val=valorSelectOtro(id);if(val) fields[campo]=val; else if(esEdicion) fields[campo]='';};
  setTexto('Mail','f-per-mail');
  setTextoSelectOtro('Proyecto','f-per-proyecto');
  setTexto('País','f-per-pais');
  setTexto('Ciudad','f-per-ciudad');
  setTextoSelectOtro('Manager','f-per-manager');
  setTexto('Comentarios','f-per-comentarios');
  const setFecha=(campo,id)=>{const val=v(id);if(val) fields[campo]=val; else if(esEdicion) fields[campo]=null;};
  setFecha('Fecha de ingreso','f-per-ingreso');
  setFecha('Fecha de cumpleaños','f-per-cumple');
  setFecha('Fecha de egreso','f-per-egreso');
  return fields;
}
// Editar una persona ya creada — se abre desde la tarjeta del Kanban de
// Ingresos/Egresos, para no tener que completar datos aparte.
function abrirEdicionPersona(nombre){
  const persona=cachePersonasRaw.find(p=>(p.fields.Nombre||'').trim()===nombre.trim());
  if(!persona){toast(`No encontré a "${nombre}" en Personas`,true);return;}
  _openFormModal({
    title:`Editar — ${nombre}`,
    html:()=>buildPersonaCompletaHTML(persona.fields,true),
    onMount:actualizarManagerOptions,
    save:async()=>{
      const fields=leerPersonaCompletaForm(true);
      if(!fields) return false;
      await atPatch(`Personas/${persona.id}`,fields);
      return true;
    },
  });
}

const FORMS={
  actividades:{title:'Registrar actividad virtual',html:()=>`
<div class="field-group"><label class="field-label">Evento *</label><input class="field-input" id="f-av-evento" placeholder="Ej: Bingo Halloween"></div>
<div class="field-group"><label class="field-label">Fecha *</label><input class="field-input" id="f-av-fecha" type="date"></div>
<div class="field-group"><label class="field-label">Dirigido a *</label>
  <select class="field-input" id="f-av-grupo" onchange="renderListaAsistentesAV()">
    <option value="Todos">Todos</option>
    <option value="Engineers & Tech">Engineers &amp; Tech</option>
    <option value="Core Team">Core Team</option>
  </select>
  <div class="field-hint">Se usa para calcular el % de asistencia sobre el grupo correcto, no sobre toda la empresa.</div>
</div>
<div class="field-group">
  <label class="field-label">Asistentes *</label>
  <div class="search-wrap" style="margin-bottom:8px">
    <i class="ti ti-search search-icon"></i>
    <input class="search-input" id="f-av-buscar" placeholder="Buscar persona…" oninput="filtrarListaAsistentesAV()">
  </div>
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
    <span class="field-hint" id="f-av-contador">0 seleccionados</span>
    <button type="button" onclick="toggleSeleccionarTodosAV()" style="background:none;border:none;color:var(--blue);font-size:12px;font-weight:600;cursor:pointer">Seleccionar todos</button>
  </div>
  <div id="f-av-lista" style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:9px;padding:6px 10px;"></div>
</div>
`,
    onMount:()=>{ avAsistentesPreseleccionados=new Set(); renderListaAsistentesAV(); },
    save:async()=>{
      const v=id=>document.getElementById(id)?.value||'';
      const evento=v('f-av-evento').trim();
      const fecha=v('f-av-fecha');
      const grupo=v('f-av-grupo')||'Todos';
      if(!evento){toast('El evento es obligatorio',true);return false;}
      if(!fecha){toast('La fecha es obligatoria',true);return false;}
      const nombres=asistentesSeleccionadosAV();
      if(!nombres.length){toast('Seleccioná al menos un asistente',true);return false;}
      for(const nombre of nombres){
        const persona=cachePersonasRaw.find(p=>(p.fields.Nombre||'').trim()===nombre.trim());
        if(!persona) continue;
        await atPost('Asistencia a Actividades',{Persona:[persona.id],Evento:evento,Fecha:fecha,Grupo:grupo});
      }
      return true;
    }},

  ambassadors:{title:'Registrar asistencia AW',html:()=>{
    const personas=cachePersonasRaw.map(p=>p.fields.Nombre||'').filter(Boolean).sort();
    const ediciones=[...new Set(cacheAWRaw.map(r=>r.fields['Edición AW']||'').filter(Boolean))].sort();
    return`
<div class="field-group"><label class="field-label">Persona *</label>
  <select class="field-input" id="f-aw-persona" onchange="previewAWPct()">
    <option value="">Seleccioná una persona…</option>
    ${personas.map(n=>`<option value="${n}">${n}</option>`).join('')}
  </select>
</div>
<div class="field-group"><label class="field-label">Edición AW *</label>
  ${buildSelectConOtro('f-aw-edicion',ediciones,'','Ej: diciembre 2021')}
</div>
<div class="field-group"><label class="field-label">Acompañantes</label>
  <input class="field-input" id="f-aw-acomp" type="number" min="0" placeholder="0 si fue solo/a">
</div>
<div id="aw-pct-preview" style="padding:8px 0;font-size:12px;color:var(--text3)">Seleccioná una persona para ver la cobertura que le corresponde.</div>
`;},
    save:async()=>{
      const v=id=>document.getElementById(id)?.value||'';
      if(!v('f-aw-persona')){toast('Seleccioná una persona',true);return false;}
      const edicion=valorSelectOtro('f-aw-edicion');
      if(!edicion){toast('La edición AW es obligatoria',true);return false;}
      const persona=cachePersonasRaw.find(p=>p.fields.Nombre===v('f-aw-persona'));
      const nivel=persona?.fields['Nivel Loyalty']||'Spark';
      const pctCalculado=calcPctVuelo(v('f-aw-persona'),nivel,cacheAWRaw);
      const fields={Persona:v('f-aw-persona'),'Edición AW':edicion,'Porcentaje cubierto':pctCalculado};
      if(v('f-aw-acomp')) fields['Acompañantes']=Number(v('f-aw-acomp'));
      await atPost('Ambassador Week',fields);return true;
    }},

  'beneficios-asignados':{title:'Asignar beneficio',html:()=>{
    return`
<div class="field-group"><label class="field-label">Persona *</label>
  <div class="search-wrap" style="margin-bottom:6px">
    <i class="ti ti-search search-icon"></i>
    <input class="search-input" id="f-ba-persona-buscar" placeholder="Buscar persona…" oninput="filtrarPersonaAsignacion()">
  </div>
  <select class="field-input" id="f-ba-persona" onchange="actualizarBeneficiosPorPersona()">
    <option value="">Seleccioná una persona…</option>
  </select>
</div>
<div class="field-group"><label class="field-label">Beneficio *</label>
  <select class="field-input" id="f-ba-beneficio" onchange="actualizarMontoBenef();toggleCamposTerapia();toggleCamposLink();">
    <option value="">Seleccioná un beneficio…</option>
  </select>
  <div class="field-hint" id="f-ba-beneficio-hint" style="font-size:11px;color:var(--text3);padding:4px 0 0"></div>
</div>
<div class="field-group"><label class="field-label">Monto ($)</label>
  <input class="field-input" id="f-ba-monto" type="number" min="0" placeholder="Se autocompleta si el beneficio tiene valor fijo">
</div>
<div class="field-group"><label class="field-label">Fecha activación</label><input class="field-input" id="f-ba-fecha" type="date"></div>
<div id="fg-ba-terapia" style="display:none">
  <div class="field-group"><label class="field-label">Frecuencia</label>
    <select class="field-input" id="f-ba-frecuencia">
      <option value="">Seleccioná…</option>
      <option value="Semanal">Semanal</option>
      <option value="Quincenal">Quincenal</option>
      <option value="Mensual">Mensual</option>
      <option value="Otro">Otro</option>
    </select>
  </div>
  <div class="field-group"><label class="field-label">Profesional asignado</label><input class="field-input" id="f-ba-profesional" placeholder="Nombre del/de la profesional"></div>
</div>
<div id="fg-ba-link" style="display:none">
  <div class="field-group"><label class="field-label">Curso</label><input class="field-input" id="f-ba-curso" placeholder="Ej: CompTIA Pentest+ PT0-002 (Ethical Hacking)"></div>
  <div class="field-group"><label class="field-label">Link</label><input class="field-input" id="f-ba-link" type="url" placeholder="https://www.udemy.com/course/…"></div>
  <div class="field-hint" style="font-size:11px;color:var(--text3);padding:0 0 8px">El Quarter se calcula solo a partir de la Fecha activación — no hace falta escribirlo.</div>
</div>
<div class="field-hint" style="font-size:11px;color:var(--text3);padding:0 0 8px">Si el beneficio tiene valor fijo en el catálogo, se autocompleta. Podés modificarlo.</div>
`;},
    onMount:()=>{ filtrarPersonaAsignacion(); actualizarBeneficiosPorPersona(); },
    save:async()=>{
      const v=id=>document.getElementById(id)?.value||'';
      const nombrePersona=v('f-ba-persona'), nombreBeneficio=v('f-ba-beneficio');
      if(!nombrePersona){toast('La persona es obligatoria',true);return false;}
      if(!nombreBeneficio){toast('El beneficio es obligatorio',true);return false;}
      const persona=cachePersonasRaw.find(p=>(p.fields.Nombre||'').trim()===nombrePersona.trim());
      const beneficio=cacheBeneficiosRaw.find(b=>b.fields.Beneficio===nombreBeneficio);
      if(!persona||!beneficio){toast('No se encontró la persona o el beneficio seleccionado',true);return false;}
      // Persona y Beneficio son linked records en Airtable — van como array de IDs, no como texto.
      const fields={Persona:[persona.id],Beneficio:[beneficio.id],Estado:'Activo'};
      const fecha=v('f-ba-fecha');
      if(fecha) fields['Fecha activación']=fecha;
      if(v('f-ba-monto')) fields.Monto=Number(v('f-ba-monto'));
      if(esBeneficioTerapia(nombreBeneficio)){
        if(v('f-ba-frecuencia')) fields.Frecuencia=v('f-ba-frecuencia');
        if(v('f-ba-profesional')) fields['Profesional Asignado']=v('f-ba-profesional');
      }
      if(esBeneficioUdemy(nombreBeneficio)){
        if(v('f-ba-curso')) fields.Curso=v('f-ba-curso');
        if(v('f-ba-link')) fields.Link=v('f-ba-link');
      }
      if(esBeneficioConQuarterAuto(nombreBeneficio)&&fecha) fields.Quarter=quarterLabel(fecha);
      await atPost('Beneficios Asignados',fields);return true;
    }},

  beneficios:{title:'Nuevo beneficio al catálogo',html:()=>`
<div class="field-group"><label class="field-label">Nombre *</label><input class="field-input" id="f-nombre" placeholder="Ej: Prepaga médica"></div>
<div class="field-group"><label class="field-label">Grupo</label>
  <select class="field-input" id="f-grupo">
    <option value="Ambos">Ambos grupos</option>
    <option value="Engineers">Engineers</option>
    <option value="Core Team">Core Team</option>
  </select>
</div>
<div class="field-group"><label class="field-label">Categoría</label>
  <select class="field-input" id="f-cat">
    <option>Salud</option><option>Bienestar</option><option>Aprendizaje</option><option>Tiempo</option><option>Equipamiento</option><option>Otro</option>
  </select>
</div>
<div class="field-group"><label class="field-label">Nivel mínimo Loyalty</label>
  <select class="field-input" id="f-loyalty">
    <option value="">Todos los niveles</option>
    <option value="Spark">⚡ Spark</option>
    <option value="Ray">☀️ Ray</option>
    <option value="Lightning">🌩 Lightning</option>
    <option value="Thunder">🌪 Thunder</option>
    <option value="Storm">🌊 Storm</option>
  </select>
</div>
<div class="field-group"><label class="field-label">Valor mensual ($)</label><input class="field-input" id="f-valor" type="number" min="0" placeholder="Ej: 4200 — dejá vacío si no tiene valor fijo"></div>
<div class="field-group"><label class="field-label">Descripción</label><textarea class="field-input" id="f-desc" placeholder="Breve descripción del beneficio"></textarea></div>`,
    save:async()=>{
      const v=id=>document.getElementById(id)?.value||'';
      if(!v('f-nombre')){toast('El nombre es obligatorio',true);return false;}
      const fields={Beneficio:v('f-nombre'),Grupo:v('f-grupo'),Categoría:v('f-cat'),Descripción:v('f-desc'),Estado:'Activo'};
      if(v('f-loyalty')) fields['Nivel Loyalty']=v('f-loyalty');
      if(v('f-valor')) fields.Valor=Number(v('f-valor'));
      await atPost('Beneficios',fields);return true;
    }},

  gettogether:{title:'Registrar Get Together',html:()=>{
    const personas=cachePersonasRaw.map(p=>p.fields.Nombre||'').filter(Boolean).sort();
    const proyectos=[...new Set((cacheProyectosRaw||[]).map(p=>p.fields.Proyecto||'').filter(Boolean))].sort();
    const paises=[...new Set(cacheGetTogetherRaw.map(r=>r.fields['País']||'').filter(Boolean))].sort();
    return`
<div class="field-group"><label class="field-label">BEONer *</label>
  <select class="field-input" id="f-gt-persona">
    <option value="">Seleccioná una persona…</option>
    ${personas.map(n=>`<option value="${n}">${n}</option>`).join('')}
  </select>
</div>
<div class="field-group"><label class="field-label">País *</label>
  ${buildSelectConOtro('f-gt-pais',paises,'','Ej: Argentina')}
</div>
<div class="field-group"><label class="field-label">Ciudad *</label><input class="field-input" id="f-gt-ciudad" placeholder="Ej: Buenos Aires"></div>
<div class="field-group"><label class="field-label">Proyecto</label>
  <select class="field-input" id="f-gt-proyecto">
    <option value="">Sin proyecto</option>
    ${proyectos.map(p=>`<option value="${p}">${p}</option>`).join('')}
  </select>
</div>
<div class="field-group"><label class="field-label">Fecha *</label><input class="field-input" id="f-gt-fecha" type="date"></div>
`;},
    save:async()=>{
      const v=id=>document.getElementById(id)?.value||'';
      if(!v('f-gt-persona')){toast('Seleccioná una persona',true);return false;}
      const pais=valorSelectOtro('f-gt-pais');
      if(!pais){toast('El país es obligatorio',true);return false;}
      if(!v('f-gt-ciudad')){toast('La ciudad es obligatoria',true);return false;}
      if(!v('f-gt-fecha')){toast('La fecha es obligatoria',true);return false;}
      const fields={BEONer:v('f-gt-persona'),'País':pais,Ciudad:v('f-gt-ciudad'),Fecha:v('f-gt-fecha')};
      if(v('f-gt-proyecto')) fields.Proyecto=v('f-gt-proyecto');
      await atPost('Get Together',fields);return true;
    }},

  engineers:{title:'Nueva persona',html:()=>buildPersonaCompletaHTML(),
    onMount:actualizarManagerOptions,
    save:async()=>{
      const fields=leerPersonaCompletaForm(false);
      if(!fields) return false;
      await atPost('Personas',fields);return true;
    }},

  proyectos:{title:'Nuevo proyecto',html:()=>`
<div class="field-group"><label class="field-label">Nombre *</label><input class="field-input" id="f-proy-nombre" placeholder="Ej: Atlas"></div>
<div class="field-group"><label class="field-label">Fecha de inicio</label><input class="field-input" id="f-proy-fecha" type="date"></div>
<div class="field-group"><label class="field-label">Estado</label>
  <select class="field-input" id="f-proy-estado">
    <option value="Activo">Activo</option>
    <option value="De Baja">De Baja</option>
  </select>
</div>`,
    save:async()=>{
      const v=id=>document.getElementById(id)?.value||'';
      if(!v('f-proy-nombre')){toast('El nombre es obligatorio',true);return false;}
      const fields={Proyecto:v('f-proy-nombre'),Estado:v('f-proy-estado')||'Activo'};
      if(v('f-proy-fecha')) fields['Fecha de Inicio']=v('f-proy-fecha');
      await atPost('Proyectos',fields);return true;
    }},

  // "Nuevo ingreso" es la carga más completa — mismos campos que "Nueva persona".
  // El checklist en el Kanban se crea solo al recargar (sincronizarPersonasEnKanban),
  // ya con el proyecto/mail/país copiados para que se vean en la tarjeta.
  ingresos:{title:'Nuevo ingreso',html:()=>buildPersonaCompletaHTML(),
    onMount:actualizarManagerOptions,
    save:async()=>{
      const fields=leerPersonaCompletaForm(false);
      if(!fields) return false;
      await atPost('Personas',fields);return true;
    }},

  // Carga silenciosa para gente que ya no está en BEON — mismo form que
  // "Nueva persona" pero mostrando también Fecha de egreso, que es la que
  // sincronizarPersonasEnKanban() usa para reconocer que es un alta histórica
  // y así NO crear tarjeta de Kanban ni mandar el Slack de "Nuevo ingreso".
  historico:{title:'Cargar persona histórica',html:()=>`
<div class="field-hint" style="margin-bottom:14px">Para gente que ya no está en BEON. No se crea tarjeta en los Kanban de Ingresos/Egresos ni se avisa por Slack — queda cargada en silencio para poder asignarle después los eventos a los que asistió mientras estuvo.</div>
`+buildPersonaCompletaHTML({},true,true),
    onMount:actualizarManagerOptions,
    save:async()=>{
      const fields=leerPersonaCompletaForm(false);
      if(!fields) return false;
      delete fields['Nivel Loyalty']; // no aplica a alguien que ya no está — no se pide en este form
      if(!fields['Fecha de egreso']){toast('La fecha de egreso es obligatoria en una carga histórica',true);return false;}
      await atPost('Personas',fields);return true;
    }},

  egresos:{title:'Nuevo egreso',html:()=>{
    const personas=cachePersonasRaw.map(p=>p.fields.Nombre||'').filter(Boolean).sort();
    return`
<div class="field-group"><label class="field-label">Persona *</label>
  <select class="field-input" id="f-egr-persona">
    <option value="">Seleccioná una persona…</option>
    ${personas.map(n=>`<option value="${n}">${n}</option>`).join('')}
  </select>
</div>
<div class="field-group"><label class="field-label">Fecha de aviso *</label><input class="field-input" id="f-egr-fecha" type="date"></div>
<div class="field-group"><label class="field-label">Fecha del último día *</label><input class="field-input" id="f-egr-ultimo-dia" type="date"></div>
<div class="field-hint">A partir de esa fecha, la persona deja de contar como activa en Personas.</div>
`;},
    save:async()=>{
      const v=id=>document.getElementById(id)?.value||'';
      const nombre=v('f-egr-persona');
      if(!nombre){toast('La persona es obligatoria',true);return false;}
      if(!v('f-egr-fecha')){toast('La fecha de aviso es obligatoria',true);return false;}
      if(!v('f-egr-ultimo-dia')){toast('La fecha del último día es obligatoria',true);return false;}
      await atPost('Checklist',{Persona:nombre,Tipo:'Egreso',Fecha:v('f-egr-fecha'),EstadoKanban:'Aviso dado'});
      const persona=cachePersonasRaw.find(p=>(p.fields.Nombre||'').trim()===nombre.trim());
      if(persona) await atPatch(`Personas/${persona.id}`,{'Fecha de egreso':v('f-egr-ultimo-dia')});
      sendSlack(`👋 *Egreso registrado en el Hub*\n${nombre} — último día: ${fmt(v('f-egr-ultimo-dia'))}`);
      return true;
    }},

  checklist:{title:'Nuevo checklist',html:()=>{
    const personas=cachePersonasRaw.map(p=>p.fields.Nombre||'').filter(Boolean).sort();
    return`
<div class="field-group"><label class="field-label">Tipo *</label>
  <select class="field-input" id="f-tipo" onchange="toggleRol()">
    <option value="Ingreso">Ingreso</option>
    <option value="Egreso">Egreso</option>
  </select>
</div>
<div class="field-group"><label class="field-label">Persona *</label>
  ${buildSelectConOtro('f-cl-persona',personas,'','Nombre de la persona')}
</div>
<div class="field-group" id="fg-rol"><label class="field-label">Rol</label>
  <select class="field-input" id="f-cl-rol">
    <option value="Engineer">Engineer</option>
    <option value="Core Team">Core Team</option>
    <option value="Ambos">Ambos</option>
  </select>
</div>
<div class="field-group"><label class="field-label">Fecha *</label><input class="field-input" id="f-cl-fecha" type="date"></div>
<div class="field-hint" id="rem-preview">El checklist se inicia en la primera etapa y se completa desde el Kanban de Ingresos/Egresos.</div>
`;},
    save:async()=>{
      const v=id=>document.getElementById(id)?.value||'';
      const tipo=v('f-tipo')||'Ingreso';
      const persona=valorSelectOtro('f-cl-persona');
      if(!persona){toast('La persona es obligatoria',true);return false;}
      if(!v('f-cl-fecha')){toast('La fecha es obligatoria',true);return false;}
      const fields={Persona:persona,Tipo:tipo,Fecha:v('f-cl-fecha'),EstadoKanban:tipo==='Egreso'?'Aviso dado':'Pre-ingreso'};
      if(tipo==='Ingreso') fields.Rol=v('f-cl-rol')||'Engineer';
      await atPost('Checklist',fields);return true;
    }},

  // Cubre tanto los reminders de Glassdoor (elegís persona, se arma el texto
  // solo) como reminders manuales sueltos (ej: "Renovación de visa") — antes
  // eran dos formularios separados en pestañas distintas.
  reviews:{title:'Nuevo reminder',html:()=>{
    const personas=cachePersonasRaw.filter(p=>(p.fields['Rol en empresa']||'').trim()==='Engineer').map(p=>p.fields.Nombre||'').filter(Boolean).sort();
    return`
<div class="field-group"><label class="field-label">Tipo</label>
  <select class="field-input" id="f-rv-tipo" onchange="toggleTipoReminder()">
    <option value="Glassdoor">Glassdoor</option>
    <option value="Manual">Manual</option>
  </select>
</div>
<div class="field-group" id="fg-rv-persona"><label class="field-label">Persona *</label>
  <select class="field-input" id="f-rv-persona">
    <option value="">Seleccioná una persona…</option>
    ${personas.map(n=>`<option value="${n}">${n}</option>`).join('')}
  </select>
</div>
<div class="field-group" id="fg-rv-evento" style="display:none"><label class="field-label">Evento *</label>
  <input class="field-input" id="f-rv-evento" placeholder="Ej: Renovación de visa — Juan Pérez">
</div>
<div class="field-group"><label class="field-label">Fecha *</label><input class="field-input" id="f-rv-fecha" type="date"></div>
`;},
    save:async()=>{
      const v=id=>document.getElementById(id)?.value||'';
      const tipo=v('f-rv-tipo')||'Glassdoor';
      const fecha=v('f-rv-fecha');
      if(!fecha){toast('La fecha es obligatoria',true);return false;}
      let evento;
      if(tipo==='Manual'){
        evento=v('f-rv-evento');
        if(!evento){toast('El evento es obligatorio',true);return false;}
      } else {
        const persona=v('f-rv-persona');
        if(!persona){toast('Seleccioná una persona',true);return false;}
        evento=`📝 Review Glassdoor — ${persona}`;
      }
      await atPost('Eventos',{Evento:evento,Tipo:tipo,Fecha:fecha,Estado:'Pendiente'});
      if(tipo==='Glassdoor') sendSlack(`📝 *Reminder de Glassdoor creado*\n${evento.replace(/.*—\s*/,'')} — a solicitar el ${fmt(fecha)}`);
      return true;
    }},

  tareas:{title:'Nueva tarea',html:()=>{
    const personas=personasAreaPeople();
    return`
<div class="field-group"><label class="field-label">Título *</label><input class="field-input" id="f-tar-titulo" placeholder="Ej: Preparar presentación AW"></div>
<div class="field-group"><label class="field-label">Asignado a *</label>
  <select class="field-input" id="f-tar-asignado">
    <option value="">Seleccioná una persona…</option>
    ${personas.map(n=>`<option value="${n}">${n}</option>`).join('')}
  </select>
  ${!personas.length?'<div class="field-hint" style="color:#C62828">No hay nadie con Área = "People" cargado en Airtable todavía — completá ese campo en Personas para poder asignar tareas.</div>':''}
</div>
<div class="field-group">
  <label class="field-label">Fecha límite *</label>
  <div style="display:flex;gap:8px;">
    <input class="field-input" id="f-tar-fecha" type="date" style="flex:1" onchange="actualizarHintRepeticionTarea()">
    <input class="field-input" id="f-tar-hora" type="time" style="flex:0 0 110px" title="Horario (opcional)">
    <button type="button" class="repeat-toggle-btn" id="f-tar-repetir-btn" title="Configurar repetición" onclick="toggleRepeticionTarea()"><i class="ti ti-repeat"></i></button>
  </div>
  <div class="repeat-panel" id="f-tar-repeat-panel" style="display:none">
    <label class="field-label" style="margin-bottom:5px">Repetir</label>
    <select class="field-input" id="f-tar-frecuencia" onchange="onFrecuenciaTareaChange()">
      <option value="">No repetir</option>
      <option value="diaria">Diariamente</option>
      <option value="semanal">Semanalmente</option>
      <option value="mensual">Mensualmente</option>
      <option value="anual">Anualmente</option>
      <option value="personalizada">Personalizado…</option>
    </select>
    <div id="f-tar-personalizado-row" class="personalizado-row" style="display:none">
      <span>Repetir cada</span>
      <input class="field-input" id="f-tar-intervalo" type="number" min="1" value="1" style="width:60px" oninput="actualizarHintRepeticionTarea()">
      <select class="field-input" id="f-tar-unidad" style="width:auto" onchange="onUnidadPersonalizadaChange()">
        <option value="dia">día(s)</option>
        <option value="semana">semana(s)</option>
        <option value="mes">mes(es)</option>
        <option value="anio">año(s)</option>
      </select>
    </div>
    <div id="f-tar-dias-row" class="dias-semana-row" style="display:none">
      ${DIAS_SEMANA_ES.map((d,i)=>`<button type="button" class="dia-chip" data-dia="${DIAS_SEMANA_VALORES[i]}" onclick="toggleDiaTarea(this)">${d}</button>`).join('')}
    </div>
    <div id="f-tar-cantidad-row" class="personalizado-row" style="display:none">
      <span>Termina después de</span>
      <input class="field-input" id="f-tar-cantidad" type="number" min="1" max="104" value="10" style="width:60px" oninput="actualizarHintRepeticionTarea()">
      <span>repeticiones</span>
    </div>
    <div class="field-hint" id="f-tar-repeat-hint"></div>
  </div>
</div>
<div class="field-group"><label class="field-label">Descripción</label><textarea class="field-input" id="f-tar-desc" placeholder="Detalles de la tarea"></textarea></div>
`;},
    save:async()=>{
      const v=id=>document.getElementById(id)?.value||'';
      const titulo=v('f-tar-titulo'),asignado=v('f-tar-asignado'),fecha=v('f-tar-fecha'),hora=v('f-tar-hora');
      if(!titulo){toast('El título es obligatorio',true);return false;}
      if(!asignado){toast('Asigná la tarea a alguien',true);return false;}
      if(!fecha){toast('La fecha límite es obligatoria',true);return false;}
      const campos={Título:titulo,Asignado:asignado,Fecha:fecha,Descripción:v('f-tar-desc'),Estado:'Por hacer'};
      if(hora) campos.Hora=hora;
      const frecuencia=v('f-tar-frecuencia');
      if(frecuencia){
        const config={frecuencia,dias:diasSemanaSeleccionados()};
        if(frecuencia==='personalizada'){
          config.intervalo=Math.max(1,Number(v('f-tar-intervalo'))||1);
          config.unidad=v('f-tar-unidad')||'dia';
          config.restantes=Math.max(1,Math.min(104,Number(v('f-tar-cantidad'))||10));
        }
        campos.RepeticionConfig=JSON.stringify(config);
      }
      await atPost('Tareas',campos);
      sendSlack(`✅ *Nueva tarea asignada*\n*${titulo}* — ${asignado} (vence el ${fmt(fecha)})${frecuencia?`\n🔁 Se repite — la siguiente se crea sola cuando la marques como Hecha`:''}`);
      return true;
    }},

  offsites:{title:'Registrar Off Site',html:()=>{
    const personas=cachePersonasRaw.map(p=>p.fields.Nombre||'').filter(Boolean).sort();
    const proyectos=[...new Set((cacheProyectosRaw||[]).map(p=>p.fields.Proyecto||'').filter(Boolean))].sort();
    return`
<div class="field-group"><label class="field-label">Persona *</label>
  <select class="field-input" id="f-os-persona">
    <option value="">Seleccioná una persona…</option>
    ${personas.map(n=>`<option value="${n}">${n}</option>`).join('')}
  </select>
</div>
<div class="field-group"><label class="field-label">Proyecto</label>
  <select class="field-input" id="f-os-proyecto">
    <option value="">Sin proyecto</option>
    ${proyectos.map(p=>`<option value="${p}">${p}</option>`).join('')}
  </select>
</div>
<div class="field-group"><label class="field-label">Destino *</label><input class="field-input" id="f-os-destino" placeholder="Ej: Miami, USA"></div>
<div class="field-group"><label class="field-label">Fecha inicio *</label><input class="field-input" id="f-os-inicio" type="date"></div>
<div class="field-group"><label class="field-label">Fecha fin *</label><input class="field-input" id="f-os-fin" type="date"></div>
<div class="field-group"><label class="field-label">Descripción</label><textarea class="field-input" id="f-os-desc" placeholder="Notas del viaje"></textarea></div>
`;},
    save:async()=>{
      const v=id=>document.getElementById(id)?.value||'';
      if(!v('f-os-persona')){toast('La persona es obligatoria',true);return false;}
      if(!v('f-os-destino')){toast('El destino es obligatorio',true);return false;}
      if(!v('f-os-inicio')||!v('f-os-fin')){toast('Las fechas de inicio y fin son obligatorias',true);return false;}
      const fields={Persona:v('f-os-persona'),Destino:v('f-os-destino'),'Fecha inicio':v('f-os-inicio'),'Fecha fin':v('f-os-fin')};
      if(v('f-os-proyecto')) fields.Proyecto=v('f-os-proyecto');
      if(v('f-os-desc')) fields.Descripción=v('f-os-desc');
      await atPost('Off Sites',fields);return true;
    }}
};
FORMS.coreteam=FORMS.engineers; // Engineers & Tech y Core Team comparten el mismo alta de persona
