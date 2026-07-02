// Form completo de Persona — lo usan "Nueva persona", "Nuevo ingreso" (misma carga,
// es la forma de no tener que ir a Airtable a completar nada) y la edición desde
// la tarjeta del Kanban de Ingresos.
function buildPersonaCompletaHTML(v={}){
  const proyectos=[...new Set((cacheProyectosRaw||[]).map(p=>p.fields.Proyecto||'').filter(Boolean))].sort();
  const opt=(val,cur)=>`<option value="${val}"${val===(cur||'')?' selected':''}>${val}</option>`;
  return`
<div class="field-group"><label class="field-label">Nombre *</label><input class="field-input" id="f-per-nombre" placeholder="Nombre y apellido" value="${v.Nombre||''}"></div>
<div class="field-group"><label class="field-label">Mail</label><input class="field-input" id="f-per-mail" type="email" placeholder="nombre@beon.tech" value="${v.Mail||''}"></div>
<div class="field-group"><label class="field-label">Rol en empresa *</label>
  <select class="field-input" id="f-per-rol">
    ${['Engineer','Core Team','Supervisor','TEM','Lead','Manager','COO','Founder'].map(r=>opt(r,v['Rol en empresa'])).join('')}
  </select>
</div>
<div class="field-group"><label class="field-label">Nivel Loyalty</label>
  <select class="field-input" id="f-per-nivel">
    ${['Spark','Ray','Lightning','Thunder','Storm'].map(n=>opt(n,v['Nivel Loyalty']||'Spark')).join('')}
  </select>
</div>
<div class="field-group"><label class="field-label">Proyecto</label>
  <input class="field-input" id="f-per-proyecto" list="per-proyectos-list" placeholder="Ej: Atlas" value="${v.Proyecto||''}">
  <datalist id="per-proyectos-list">${proyectos.map(p=>`<option value="${p}">`).join('')}</datalist>
</div>
<div class="field-group"><label class="field-label">País</label><input class="field-input" id="f-per-pais" placeholder="Ej: Argentina" value="${v['País']||''}"></div>
<div class="field-group"><label class="field-label">Ciudad</label><input class="field-input" id="f-per-ciudad" placeholder="Ej: Buenos Aires" value="${v.Ciudad||''}"></div>
<div class="field-group"><label class="field-label">Manager</label><input class="field-input" id="f-per-manager" placeholder="TEM / Manager a cargo" value="${v.Manager||''}"></div>
<div class="field-group"><label class="field-label">Fecha de ingreso</label><input class="field-input" id="f-per-ingreso" type="date" value="${v['Fecha de ingreso']||''}"></div>
<div class="field-group"><label class="field-label">Fecha de cumpleaños</label><input class="field-input" id="f-per-cumple" type="date" value="${v['Fecha de cumpleaños']||''}"></div>
<div class="field-group"><label class="field-label">Comentarios</label><textarea class="field-input" id="f-per-comentarios" placeholder="Notas sobre el ingreso">${v.Comentarios||''}</textarea></div>
`;
}
// esEdicion=true permite vaciar un campo para borrarlo; en alta simplemente se omite
function leerPersonaCompletaForm(esEdicion){
  const v=id=>document.getElementById(id)?.value||'';
  if(!v('f-per-nombre')){toast('El nombre es obligatorio',true);return null;}
  const fields={Nombre:v('f-per-nombre'),'Rol en empresa':v('f-per-rol')||'Engineer','Nivel Loyalty':v('f-per-nivel')||'Spark'};
  const setTexto=(campo,id)=>{const val=v(id);if(val) fields[campo]=val; else if(esEdicion) fields[campo]='';};
  setTexto('Mail','f-per-mail');
  setTexto('Proyecto','f-per-proyecto');
  setTexto('País','f-per-pais');
  setTexto('Ciudad','f-per-ciudad');
  setTexto('Manager','f-per-manager');
  setTexto('Comentarios','f-per-comentarios');
  const setFecha=(campo,id)=>{const val=v(id);if(val) fields[campo]=val; else if(esEdicion) fields[campo]=null;};
  setFecha('Fecha de ingreso','f-per-ingreso');
  setFecha('Fecha de cumpleaños','f-per-cumple');
  return fields;
}
// Editar una persona ya creada — se abre desde la tarjeta del Kanban de Ingresos,
// para no tener que ir a Airtable a completar datos que faltaron al principio.
function abrirEdicionPersona(nombre){
  const persona=cachePersonasRaw.find(p=>(p.fields.Nombre||'').trim()===nombre.trim());
  if(!persona){toast(`No encontré a "${nombre}" en Personas`,true);return;}
  _openFormModal({
    title:`Editar — ${nombre}`,
    html:()=>buildPersonaCompletaHTML(persona.fields),
    save:async()=>{
      const fields=leerPersonaCompletaForm(true);
      if(!fields) return false;
      await atPatch(`Personas/${persona.id}`,fields);
      return true;
    },
  });
}

const FORMS={
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
  <input class="field-input" id="f-aw-edicion" list="aw-ediciones-list" placeholder="Ej: diciembre 2021">
  <datalist id="aw-ediciones-list">${ediciones.map(e=>`<option value="${e}">`).join('')}</datalist>
</div>
<div class="field-group"><label class="field-label">Acompañantes</label>
  <input class="field-input" id="f-aw-acomp" type="number" min="0" placeholder="0 si fue solo/a">
</div>
<div id="aw-pct-preview" style="padding:8px 0;font-size:12px;color:var(--text3)">Seleccioná una persona para ver la cobertura que le corresponde.</div>
`;},
    save:async()=>{
      const v=id=>document.getElementById(id)?.value||'';
      if(!v('f-aw-persona')){toast('Seleccioná una persona',true);return false;}
      if(!v('f-aw-edicion')){toast('La edición AW es obligatoria',true);return false;}
      const persona=cachePersonasRaw.find(p=>p.fields.Nombre===v('f-aw-persona'));
      const nivel=persona?.fields['Nivel Loyalty']||'Spark';
      const pctCalculado=calcPctVuelo(v('f-aw-persona'),nivel,cacheAWRaw);
      const fields={Persona:v('f-aw-persona'),'Edición AW':v('f-aw-edicion'),'Porcentaje cubierto':pctCalculado};
      if(v('f-aw-acomp')) fields['Acompañantes']=Number(v('f-aw-acomp'));
      await atPost('Ambassador Week',fields);return true;
    }},

  'beneficios-asignados':{title:'Asignar beneficio',html:()=>{
    const personas=cachePersonasRaw.map(p=>p.fields.Nombre||'').filter(Boolean).sort();
    const beneficios=cacheBeneficiosRaw.filter(b=>(b.fields.Estado||'Activo')==='Activo').map(b=>b.fields.Beneficio||'').filter(Boolean).sort();
    return`
<div class="field-group"><label class="field-label">Persona *</label>
  <select class="field-input" id="f-ba-persona">
    <option value="">Seleccioná una persona…</option>
    ${personas.map(n=>`<option value="${n}">${n}</option>`).join('')}
  </select>
</div>
<div class="field-group"><label class="field-label">Beneficio *</label>
  <select class="field-input" id="f-ba-beneficio" onchange="actualizarMontoBenef()">
    <option value="">Seleccioná un beneficio…</option>
    ${beneficios.map(b=>`<option value="${b}">${b}</option>`).join('')}
  </select>
</div>
<div class="field-group"><label class="field-label">Monto ($)</label>
  <input class="field-input" id="f-ba-monto" type="number" min="0" placeholder="Se autocompleta si el beneficio tiene valor fijo">
</div>
<div class="field-group"><label class="field-label">Fecha activación</label><input class="field-input" id="f-ba-fecha" type="date"></div>
<div class="field-hint" style="font-size:11px;color:var(--text3);padding:0 0 8px">Si el beneficio tiene valor fijo en el catálogo, se autocompleta. Podés modificarlo.</div>
`;},
    save:async()=>{
      const v=id=>document.getElementById(id)?.value||'';
      if(!v('f-ba-persona')){toast('La persona es obligatoria',true);return false;}
      if(!v('f-ba-beneficio')){toast('El beneficio es obligatorio',true);return false;}
      const fields={Persona:v('f-ba-persona'),Beneficio:v('f-ba-beneficio'),Estado:'Activo'};
      if(v('f-ba-fecha')) fields['Fecha activación']=v('f-ba-fecha');
      if(v('f-ba-monto')) fields.Monto=Number(v('f-ba-monto'));
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
  <input class="field-input" id="f-gt-pais" list="gt-paises-list" placeholder="Ej: Argentina">
  <datalist id="gt-paises-list">${paises.map(p=>`<option value="${p}">`).join('')}</datalist>
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
      if(!v('f-gt-pais')){toast('El país es obligatorio',true);return false;}
      if(!v('f-gt-ciudad')){toast('La ciudad es obligatoria',true);return false;}
      if(!v('f-gt-fecha')){toast('La fecha es obligatoria',true);return false;}
      const fields={BEONer:v('f-gt-persona'),'País':v('f-gt-pais'),Ciudad:v('f-gt-ciudad'),Fecha:v('f-gt-fecha')};
      if(v('f-gt-proyecto')) fields.Proyecto=v('f-gt-proyecto');
      await atPost('Get Together',fields);return true;
    }},

  engineers:{title:'Nueva persona',html:()=>buildPersonaCompletaHTML(),
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
    save:async()=>{
      const fields=leerPersonaCompletaForm(false);
      if(!fields) return false;
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
`;},
    save:async()=>{
      const v=id=>document.getElementById(id)?.value||'';
      if(!v('f-egr-persona')){toast('La persona es obligatoria',true);return false;}
      if(!v('f-egr-fecha')){toast('La fecha es obligatoria',true);return false;}
      await atPost('Checklist',{Persona:v('f-egr-persona'),Tipo:'Egreso',Fecha:v('f-egr-fecha'),EstadoKanban:'Aviso dado'});
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
  <input class="field-input" id="f-cl-persona" list="cl-personas-list" placeholder="Nombre de la persona">
  <datalist id="cl-personas-list">${personas.map(n=>`<option value="${n}">`).join('')}</datalist>
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
      if(!v('f-cl-persona')){toast('La persona es obligatoria',true);return false;}
      if(!v('f-cl-fecha')){toast('La fecha es obligatoria',true);return false;}
      const fields={Persona:v('f-cl-persona'),Tipo:tipo,Fecha:v('f-cl-fecha'),EstadoKanban:tipo==='Egreso'?'Aviso dado':'Pre-ingreso'};
      if(tipo==='Ingreso') fields.Rol=v('f-cl-rol')||'Engineer';
      await atPost('Checklist',fields);return true;
    }},

  eventos:{title:'Nuevo reminder',html:()=>`
<div class="field-group"><label class="field-label">Evento *</label><input class="field-input" id="f-ev-evento" placeholder="Ej: Renovación de visa — Juan Pérez"></div>
<div class="field-group"><label class="field-label">Fecha *</label><input class="field-input" id="f-ev-fecha" type="date"></div>
<div class="field-group"><label class="field-label">Tipo</label>
  <select class="field-input" id="f-ev-tipo">
    <option value="Manual">Manual</option>
    <option value="Glassdoor">Glassdoor</option>
  </select>
</div>`,
    save:async()=>{
      const v=id=>document.getElementById(id)?.value||'';
      if(!v('f-ev-evento')){toast('El evento es obligatorio',true);return false;}
      if(!v('f-ev-fecha')){toast('La fecha es obligatoria',true);return false;}
      await atPost('Eventos',{Evento:v('f-ev-evento'),Fecha:v('f-ev-fecha'),Tipo:v('f-ev-tipo')||'Manual',Estado:'Pendiente'});
      return true;
    }},

  reviews:{title:'Nueva review Glassdoor',html:()=>{
    const personas=cachePersonasRaw.filter(p=>(p.fields['Rol en empresa']||'').trim()==='Engineer').map(p=>p.fields.Nombre||'').filter(Boolean).sort();
    return`
<div class="field-group"><label class="field-label">Persona *</label>
  <select class="field-input" id="f-rv-persona">
    <option value="">Seleccioná una persona…</option>
    ${personas.map(n=>`<option value="${n}">${n}</option>`).join('')}
  </select>
</div>
<div class="field-group"><label class="field-label">Fecha a solicitar *</label><input class="field-input" id="f-rv-fecha" type="date"></div>
`;},
    save:async()=>{
      const v=id=>document.getElementById(id)?.value||'';
      if(!v('f-rv-persona')){toast('Seleccioná una persona',true);return false;}
      if(!v('f-rv-fecha')){toast('La fecha es obligatoria',true);return false;}
      await atPost('Eventos',{Evento:`📝 Review Glassdoor — ${v('f-rv-persona')}`,Tipo:'Glassdoor',Fecha:v('f-rv-fecha'),Estado:'Pendiente'});
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
