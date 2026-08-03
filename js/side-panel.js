// Tarjeta con detalle de la persona (Beneficios → "Por persona"). Modal
// propio y centrado (#bp-detalle-overlay) — NO reusa el panel lateral
// genérico #sp-panel, que también usa verAVPersona() en
// actividades-virtuales.js con contenido totalmente distinto.
function bpEmptyBox(icon, texto, accion){
  return`<div class="bp-detalle-empty">
    <div class="bp-detalle-empty-icon"><i class="ti ${icon}"></i></div>
    <div class="bp-detalle-empty-text">${texto}</div>
    ${accion?`<button class="bp-detalle-empty-btn" onclick="${accion.onclick}"><i class="ti ti-plus"></i>${accion.label}</button>`:''}
  </div>`;
}

async function verBenefPersona(nombre, grupo, nivel){
  const overlay=document.getElementById('bp-detalle-overlay');

  document.getElementById('bpd-avatar').textContent=ini(nombre);
  document.getElementById('bpd-nombre').textContent=nombre;
  document.getElementById('bpd-pills').innerHTML=`
    <span class="bp-detalle-pill"><i class="ti ti-users"></i>${grupo}</span>
    <span class="bp-detalle-pill"><i class="ti ${NIVEL_ICONS[nivel]||'ti-award'}"></i>${nivel}</span>`;
  document.getElementById('bpd-stats').innerHTML='';
  document.getElementById('bpd-body').innerHTML='<div style="text-align:center;padding:40px 0;color:var(--text3);font-size:13px;">Cargando...</div>';
  overlay.classList.add('open');
  document.body.style.overflow='hidden';

  // Cargar datos en paralelo
  const [dBenefAsig, dCap, dAW, dOS, dGT] = await Promise.all([
    atGet('Beneficios Asignados',`&filterByFormula=FIND("${nombre}",{Persona})`).catch(()=>({records:[]})),
    atGet('Capacitaciones',`&filterByFormula=FIND("${nombre}",{Persona})`).catch(()=>({records:[]})),
    // Ambassador Week no tiene campo "Fecha" (ver comentario en getEdicionAW,
    // js/ambassador-week.js) — pedir sort[0][field]=Fecha hacía que Airtable
    // rechazara el pedido entero (campo inexistente) y el .catch() de abajo
    // lo convertía en 0 registros silenciosamente, sin importar si la persona
    // sí tenía asistencias cargadas. Se ordena acá abajo por Edición AW.
    atGet('Ambassador Week',`&filterByFormula=FIND("${nombre}",{Persona})`).catch(()=>({records:[]})),
    atGet('Off Sites',`&filterByFormula=FIND("${nombre}",{Persona})&sort[0][field]=Fecha inicio&sort[0][direction]=desc`).catch(()=>({records:[]})),
    atGet('Get Together',`&filterByFormula=FIND("${nombre}",{BEONer})&sort[0][field]=Fecha&sort[0][direction]=desc`).catch(()=>({records:[]})),
  ]);

  const benefAsig=dBenefAsig.records||[];
  spBenefAsigActual=benefAsig;
  const caps=dCap.records||[];
  const awRecs=(dAW.records||[]).sort((a,b)=>(getEdicionAW(b.fields)||'').localeCompare(getEdicionAW(a.fields)||''));
  // Sumar monto de beneficios asignados con prioridad a campo Monto
  const usadoBenef=benefAsig.filter(r=>(r.fields.Estado||'Activo')==='Activo').reduce((s,a)=>{
    if(a.fields.Monto) return s+Number(a.fields.Monto);
    const bNombre=typeof a.fields.Beneficio==='string'?a.fields.Beneficio:(Array.isArray(a.fields.Beneficio)?a.fields.Beneficio[0]:'');
    const b=cacheBeneficiosRaw.find(x=>x.fields.Beneficio===bNombre);
    return s+(b?.fields.Valor?Number(b.fields.Valor):0);
  },0);
  // Proyecto es un linked record — resolver el ID a nombre acá también,
  // igual que hacen loadOffsites()/loadGetTogether() con su propio caché,
  // para no mostrar el código crudo (recXXXXXXXX) en el resumen.
  const resolverProyecto=f=>{
    if(!Array.isArray(f.Proyecto)) return f;
    const match=(cacheProyectosRaw||[]).find(p=>p.id===f.Proyecto[0]);
    return {...f, Proyecto:match?match.fields.Proyecto:''};
  };
  const osRecs=(dOS.records||[]).map(r=>({...r, fields:resolverProyecto(r.fields)}));
  const gtRecs=(dGT.records||[]).map(r=>({...r, fields:resolverProyecto(r.fields)}));

  // Tope capacitación
  const topeCapEntry=cachePresupuestoLoyalty.find(r=>r.fields.Grupo===grupo&&r.fields.Nivel===nivel);
  const topeCap=topeCapEntry?.fields['Tope anual capacitación']||0;
  const totalCap=caps.reduce((s,r)=>s+Number(r.fields.Monto||0),0);
  const capPct=topeCap>0?Math.min(100,Math.round((totalCap/topeCap)*100)):0;
  const capBarColor=capPct>=90?'var(--critical)':capPct>=70?'var(--warning)':'var(--blue)';

  // AW — cuántas veces fue y cobertura
  const awVeces=awRecs.length;
  const awRegla=AW_RULES[nivel]||AW_RULES.Spark;
  let awCobertura='';
  if(nivel==='Storm') awCobertura='Ilimitadas · 50% vuelo + 100% alojamiento';
  else if(awVeces<awRegla.asistenciasConVuelo) awCobertura=`${awRegla.asistenciasConVuelo-awVeces} restante${awRegla.asistenciasConVuelo-awVeces!==1?'s':''} con vuelo`;
  else awCobertura='Sin cobertura de vuelo disponible';

  const activosCount=benefAsig.filter(r=>(r.fields.Estado||'Activo')==='Activo').length;
  const nombreEscJs=nombre.replace(/'/g,"\\'");

  document.getElementById('bpd-stats').innerHTML=`
    <div class="bp-detalle-stat"><div class="bp-detalle-stat-val">${activosCount}</div><div class="bp-detalle-stat-label">Beneficios</div></div>
    <div class="bp-detalle-stat"><div class="bp-detalle-stat-val">$${usadoBenef.toLocaleString('es-AR')}</div><div class="bp-detalle-stat-label">Presupuesto</div></div>
    <div class="bp-detalle-stat"><div class="bp-detalle-stat-val">${osRecs.length}</div><div class="bp-detalle-stat-label">Viajes</div></div>`;

  let html='';

  // ── Beneficios asignados
  html+=`<div class="bp-detalle-section-head">
    <div class="bp-detalle-section-left">
      <div class="bp-detalle-section-icon" style="background:var(--tinte-eng);color:var(--blue)"><i class="ti ti-gift"></i></div>
      <span class="bp-detalle-section-title">Beneficios asignados</span>
      <span class="bp-detalle-section-badge" style="background:var(--tinte-eng);color:var(--blue)">${activosCount} activos</span>
    </div>
    <button class="bp-detalle-assign-btn" onclick="abrirAsignarBeneficioPara('${nombreEscJs}')"><i class="ti ti-plus"></i>Asignar</button>
  </div>`;
  if(benefAsig.length){
    html+=`<div class="bp-detalle-rows">${benefAsig.map(r=>{
      const bId=Array.isArray(r.fields.Beneficio)?r.fields.Beneficio[0]:r.fields.Beneficio;
      const benef=cacheBeneficiosRaw.find(b=>b.id===bId||b.fields.Beneficio===bId);
      const bNombre=benef?.fields.Beneficio||bId||'—';
      const cat=estiloCategoria(benef?.fields.Categoria);
      // Prioridad al Monto particular de esta asignación (editable) sobre el
      // valor fijo del catálogo — mismo criterio que se usa para sumar el
      // total usado más arriba.
      const valor=r.fields.Monto?`$${Number(r.fields.Monto).toLocaleString('es-AR')}/año`:benef?.fields.Valor?`$${Number(benef.fields.Valor).toLocaleString('es-AR')}/año`:'';
      const activo=(r.fields.Estado||'Activo')==='Activo';
      const nombreEsc=nombre.replace(/'/g,"\\'"),bNombreEsc=bNombre.replace(/'/g,"\\'");
      const fechaAct=r.fields['Fecha activación'];
      const fechaBaja=r.fields['Fecha de baja'];
      const motivoBaja=r.fields['Motivo de baja'];
      let fechaLabel;
      if(activo){
        fechaLabel=fechaAct?`Activo desde ${fmt(fechaAct)}`:'Sin fecha registrada';
      } else {
        const partes=[fechaAct?`Usado desde ${fmt(fechaAct)}`:'',fechaBaja?`Baja: ${fmt(fechaBaja)}`:''].filter(Boolean);
        fechaLabel=partes.length?partes.join(' · '):'Sin fecha registrada';
      }
      return`<div class="bp-detalle-row">
        <div class="bp-detalle-row-icon" style="background:${cat.tinte};color:${cat.accent}"><i class="ti ${cat.icon}"></i></div>
        <div class="bp-detalle-row-mid">
          <div class="bp-detalle-row-title">${bNombre}${valor?`<span class="bp-detalle-row-amount">${valor}</span>`:''}</div>
          <div class="bp-detalle-row-sub">${fechaLabel}${motivoBaja?` · "${motivoBaja}"`:''}</div>
        </div>
        <span class="badge ${activo?'badge-green':'badge-amber'}">${activo?'Activo':'Inactivo'}</span>
        <div class="bp-detalle-actions">
          <button class="bp-detalle-action-btn" onclick="editarBenefAsignado('${r.id}','${nombreEsc}','${grupo}','${nivel}')" title="Editar"><i class="ti ti-pencil"></i></button>
          <button class="bp-detalle-action-btn danger" onclick="eliminarBenefAsignado('${r.id}','${bNombreEsc}','${nombreEsc}','${grupo}','${nivel}')" title="Eliminar"><i class="ti ti-trash"></i></button>
        </div>
      </div>`;
    }).join('')}</div>`;
  } else {
    html+=bpEmptyBox('ti-gift','Sin beneficios asignados',null);
  }

  // ── Capacitaciones
  const capEstilo=estiloCategoria('Aprendizaje');
  html+=`<div class="bp-detalle-section-head">
    <div class="bp-detalle-section-left">
      <div class="bp-detalle-section-icon" style="background:${capEstilo.tinte};color:${capEstilo.accent}"><i class="ti ${capEstilo.icon}"></i></div>
      <span class="bp-detalle-section-title">Capacitaciones</span>
    </div>
  </div>`;
  if(topeCap>0){
    html+=`<div style="margin:0 2px 12px">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-bottom:4px">
        <span>Capacitación usada (anual)</span>
        <span style="font-weight:600;color:${capPct>=90?'var(--critical)':capPct>=70?'var(--warning)':'var(--text)'}">$${totalCap.toLocaleString('es-AR')} / $${topeCap.toLocaleString('es-AR')}</span>
      </div>
      <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
        <div style="width:${capPct}%;height:100%;background:${capBarColor};border-radius:3px;transition:width 0.3s"></div>
      </div>
    </div>`;
  }
  if(caps.length){
    html+=`<div class="bp-detalle-rows">${caps.map(r=>{
      const f=r.fields;
      return`<div class="bp-detalle-row">
        <div class="bp-detalle-row-icon" style="background:${capEstilo.tinte};color:${capEstilo.accent}"><i class="ti ${capEstilo.icon}"></i></div>
        <div class="bp-detalle-row-mid">
          <div class="bp-detalle-row-title">${f.Descripción||'—'}</div>
          <div class="bp-detalle-row-sub">${f.Fecha?fmt(f.Fecha):''}${f['URL del curso']?` · <a href="${f['URL del curso']}" target="_blank" style="color:var(--blue)">Ver curso →</a>`:''}</div>
        </div>
        <div class="bp-detalle-row-meta" style="font-weight:700;color:var(--blue)">$${Number(f.Monto||0).toLocaleString('es-AR')}</div>
      </div>`;
    }).join('')}</div>`;
  } else {
    html+=bpEmptyBox(capEstilo.icon,'Sin capacitaciones registradas',null);
  }

  // ── Ambassador Week
  html+=`<div class="bp-detalle-section-head">
    <div class="bp-detalle-section-left">
      <div class="bp-detalle-section-icon" style="background:var(--tinte-amber-icon);color:var(--amber)"><i class="ti ti-star"></i></div>
      <span class="bp-detalle-section-title">Ambassador Week</span>
      <span class="bp-detalle-section-badge" style="background:var(--tinte-amber-icon);color:var(--amber)">${awVeces} asistencia${awVeces!==1?'s':''}</span>
    </div>
  </div>
  <div class="bp-detalle-section-note">${awCobertura}</div>`;
  if(awRecs.length){
    html+=`<div class="bp-detalle-rows">${awRecs.map(r=>{
      const f=r.fields;
      const edicion=getEdicionAW(f)||'—';
      let pctRaw2=f['Porcentaje cubierto'];
      const pct=pctRaw2!=null?(pctRaw2<=1?Math.round(pctRaw2*100):Number(pctRaw2)):null;
      return`<div class="bp-detalle-row">
        <div class="bp-detalle-row-icon" style="background:var(--tinte-amber-icon);color:var(--amber)"><i class="ti ti-star"></i></div>
        <div class="bp-detalle-row-mid"><div class="bp-detalle-row-title">${edicion}</div></div>
        <div class="bp-detalle-row-meta" style="font-weight:600;color:${pct===50?'var(--blue)':pct===100?'var(--green)':'var(--text2)'}">${pct!=null?pct+'% vuelo':'—'}</div>
      </div>`;
    }).join('')}</div>`;
  } else {
    html+=bpEmptyBox('ti-star','Sin asistencias registradas',{onclick:`abrirRegistrarAWPara('${nombreEscJs}')`,label:'Registrar'});
  }

  // ── Off Sites
  html+=`<div class="bp-detalle-section-head">
    <div class="bp-detalle-section-left">
      <div class="bp-detalle-section-icon" style="background:var(--tinte-eng);color:var(--blue)"><i class="ti ti-plane"></i></div>
      <span class="bp-detalle-section-title">Off Sites</span>
      <span class="bp-detalle-section-badge" style="background:var(--tinte-eng);color:var(--blue)">${osRecs.length} viaje${osRecs.length!==1?'s':''}</span>
    </div>
  </div>`;
  if(osRecs.length){
    html+=`<div class="bp-detalle-rows">${osRecs.map(r=>{
      const f=r.fields;
      return`<div class="bp-detalle-row">
        <div class="bp-detalle-row-icon" style="background:var(--tinte-eng);color:var(--blue)"><i class="ti ti-plane"></i></div>
        <div class="bp-detalle-row-mid">
          <div class="bp-detalle-row-title">${f.Destino||'—'}</div>
          <div class="bp-detalle-row-sub">${f.Proyecto||''}</div>
        </div>
        <div class="bp-detalle-row-meta">${fmt(f['Fecha inicio'])}${f['Días']?' · '+f['Días']+'d':''}</div>
      </div>`;
    }).join('')}</div>`;
  } else {
    html+=bpEmptyBox('ti-plane','Sin off sites registrados',{onclick:`abrirRegistrarOffSitePara('${nombreEscJs}')`,label:'Registrar'});
  }

  // ── Get Together
  html+=`<div class="bp-detalle-section-head">
    <div class="bp-detalle-section-left">
      <div class="bp-detalle-section-icon" style="background:var(--tinte-pink);color:var(--text-pink-accent)"><i class="ti ti-users"></i></div>
      <span class="bp-detalle-section-title">Get Togethers</span>
      <span class="bp-detalle-section-badge" style="background:var(--tinte-pink);color:var(--text-pink-accent)">${gtRecs.length}</span>
    </div>
  </div>`;
  if(gtRecs.length){
    html+=`<div class="bp-detalle-rows">${gtRecs.map(r=>{
      const f=r.fields;
      return`<div class="bp-detalle-row">
        <div class="bp-detalle-row-icon" style="background:var(--tinte-pink);color:var(--text-pink-accent)"><i class="ti ti-users"></i></div>
        <div class="bp-detalle-row-mid">
          <div class="bp-detalle-row-title">${f.Ciudad||'—'}${f['País']?` <span style="font-weight:500;color:var(--text3)">(${f['País']})</span>`:''}</div>
          <div class="bp-detalle-row-sub">${f.Proyecto||''}</div>
        </div>
        <div class="bp-detalle-row-meta">${fmt(f.Fecha)}</div>
      </div>`;
    }).join('')}</div>`;
  } else {
    html+=bpEmptyBox('ti-users','Sin get togethers registrados',{onclick:`abrirRegistrarGetTogetherPara('${nombreEscJs}')`,label:'Registrar'});
  }

  document.getElementById('bpd-body').innerHTML=html;
}

function closeBenefPersonaDetalle(e){
  if(!e||e.target===document.getElementById('bp-detalle-overlay')){
    document.getElementById('bp-detalle-overlay').classList.remove('open');
    document.body.style.overflow='';
  }
}

function toggleCampoMotivoBaja(){
  const fg=document.getElementById('fg-eba-motivo');
  if(fg) fg.style.display=document.getElementById('f-eba-estado')?.value==='Inactivo'?'block':'none';
}

// Editar Monto/Fecha activación/Estado de un beneficio ya asignado — el
// registro se busca en spBenefAsigActual (cargado por verBenefPersona) en
// vez de volver a pedirlo a Airtable.
function editarBenefAsignado(id,nombre,grupo,nivel){
  const rec=spBenefAsigActual.find(r=>r.id===id);
  if(!rec) return;
  const f=rec.fields;
  const bId=Array.isArray(f.Beneficio)?f.Beneficio[0]:f.Beneficio;
  const benef=cacheBeneficiosRaw.find(b=>b.id===bId||b.fields.Beneficio===bId);
  const bNombre=benef?.fields.Beneficio||bId||'—';
  const esTerapia=esBeneficioTerapia(bNombre),esUdemy=esBeneficioUdemy(bNombre),esConQuarterAuto=esBeneficioConQuarterAuto(bNombre);
  _openFormModal({
    title:`Editar — ${bNombre}`,
    html:()=>`
<div class="field-group"><label class="field-label">Beneficio</label><input class="field-input" value="${bNombre}" disabled></div>
<div class="field-group"><label class="field-label">Monto ($)</label><input class="field-input" id="f-eba-monto" type="number" min="0" value="${f.Monto||''}" placeholder="Valor del catálogo si se deja vacío"></div>
<div class="field-group"><label class="field-label">Fecha activación</label><input class="field-input" id="f-eba-fecha" type="date" value="${f['Fecha activación']||''}"></div>
<div class="field-group"><label class="field-label">Estado</label>
  <select class="field-input" id="f-eba-estado" onchange="toggleCampoMotivoBaja()">
    <option value="Activo"${(f.Estado||'Activo')==='Activo'?' selected':''}>Activo</option>
    <option value="Inactivo"${f.Estado==='Inactivo'?' selected':''}>Inactivo</option>
  </select>
</div>
<div class="field-group" id="fg-eba-motivo" style="display:${f.Estado==='Inactivo'?'block':'none'}">
  <label class="field-label">Motivo de la baja</label>
  <textarea class="field-input" id="f-eba-motivo" placeholder="Ej: dejó de usarlo, cambió de beneficio…">${f['Motivo de baja']||''}</textarea>
  ${f['Fecha de baja']?`<div class="field-hint" style="font-size:11px;color:var(--text3);padding:4px 0 0">Dado de baja el ${fmt(f['Fecha de baja'])}</div>`:''}
</div>
${esTerapia?`
<div class="field-group"><label class="field-label">Frecuencia</label>
  <select class="field-input" id="f-eba-frecuencia">
    <option value="">Seleccioná…</option>
    ${['Semanal','Quincenal','Mensual','Otro'].map(o=>`<option value="${o}"${f.Frecuencia===o?' selected':''}>${o}</option>`).join('')}
  </select>
</div>
<div class="field-group"><label class="field-label">Profesional asignado</label><input class="field-input" id="f-eba-profesional" value="${f['Profesional Asignado']||''}"></div>
`:''}
${esUdemy?`
<div class="field-group"><label class="field-label">Curso</label><input class="field-input" id="f-eba-curso" value="${f.Curso||''}"></div>
<div class="field-group"><label class="field-label">Link</label><input class="field-input" id="f-eba-link" type="url" value="${f.Link||''}"></div>
<div class="field-hint" style="font-size:11px;color:var(--text3);padding:0 0 8px">El Quarter se recalcula solo si cambiás la Fecha activación.</div>
`:''}`,
    save:async()=>{
      const v=id2=>document.getElementById(id2)?.value||'';
      const fecha=v('f-eba-fecha');
      const nuevoEstado=v('f-eba-estado')||'Activo';
      const fields={
        Estado:nuevoEstado,
        'Fecha activación':fecha||null,
        Monto:v('f-eba-monto')?Number(v('f-eba-monto')):null,
      };
      if(nuevoEstado==='Inactivo'){
        fields['Motivo de baja']=v('f-eba-motivo')||null;
        // Solo se pisa la Fecha de baja al momento en que PASA a Inactivo —
        // si ya estaba Inactivo y se reabre el form para otra cosa (ej.
        // corregir el motivo), no hace falta correr la fecha a hoy de nuevo.
        if(f.Estado!=='Inactivo') fields['Fecha de baja']=new Date().toISOString().slice(0,10);
      } else {
        fields['Motivo de baja']=null;
        fields['Fecha de baja']=null;
      }
      if(esTerapia){
        fields.Frecuencia=v('f-eba-frecuencia')||null;
        fields['Profesional Asignado']=v('f-eba-profesional')||null;
      }
      if(esUdemy){
        fields.Curso=v('f-eba-curso')||null;
        fields.Link=v('f-eba-link')||null;
      }
      if(esConQuarterAuto) fields.Quarter=fecha?quarterLabel(fecha):null;
      await atPatch(`Beneficios Asignados/${id}`,fields);
      await verBenefPersona(nombre,grupo,nivel);
      return true;
    },
  });
}

function eliminarBenefAsignado(id,nombreBeneficio,nombre,grupo,nivel){
  showConfirm(
    `¿Eliminar "${nombreBeneficio}" de ${nombre}?`,
    'Esta acción no se puede deshacer.',
    async()=>{
      await atDelete('Beneficios Asignados',id).catch(()=>{});
      toast('Beneficio eliminado ✓');
      await Promise.all([loadAll(),verBenefPersona(nombre,grupo,nivel)]);
    }
  );
}

function closeSidePanel(){
  document.getElementById('sp-panel').classList.remove('open');
  document.getElementById('sp-overlay').classList.remove('open');
  document.body.style.overflow='';
}
