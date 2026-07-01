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
    }}
};
