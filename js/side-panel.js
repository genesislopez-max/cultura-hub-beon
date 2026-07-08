async function verBenefPersona(nombre, grupo, nivel){
  const panel=document.getElementById('sp-panel');
  const overlay=document.getElementById('sp-overlay');
  const nivelEmoji={'Spark':'⚡','Ray':'☀️','Lightning':'🌩','Thunder':'🌪','Storm':'🌊'};

  document.getElementById('sp-nombre').textContent=nombre;
  document.getElementById('sp-subtitle').textContent=`${grupo} · ${nivel}`;
  document.getElementById('sp-body').innerHTML='<div style="text-align:center;padding:40px 0;color:var(--text3);font-size:13px;">Cargando...</div>';
  panel.classList.add('open');
  overlay.classList.add('open');
  document.body.style.overflow='hidden';

  // Cargar datos en paralelo
  const [dBenefAsig, dCap, dAW, dOS, dGT] = await Promise.all([
    atGet('Beneficios Asignados',`&filterByFormula=FIND("${nombre}",{Persona})`).catch(()=>({records:[]})),
    atGet('Capacitaciones',`&filterByFormula=FIND("${nombre}",{Persona})`).catch(()=>({records:[]})),
    atGet('Ambassador Week',`&filterByFormula=FIND("${nombre}",{Persona})&sort[0][field]=Fecha&sort[0][direction]=desc`).catch(()=>({records:[]})),
    atGet('Off Sites',`&filterByFormula=FIND("${nombre}",{Persona})&sort[0][field]=Fecha inicio&sort[0][direction]=desc`).catch(()=>({records:[]})),
    atGet('Get Together',`&filterByFormula=FIND("${nombre}",{BEONer})&sort[0][field]=Fecha&sort[0][direction]=desc`).catch(()=>({records:[]})),
  ]);

  const benefAsig=dBenefAsig.records||[];
  spBenefAsigActual=benefAsig;
  const caps=dCap.records||[];
  const awRecs=dAW.records||[];
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
  const capBarColor=capPct>=90?'#C62828':capPct>=70?'#E65100':'var(--blue)';

  // AW — cuántas veces fue y cobertura
  const awVeces=awRecs.length;
  const awRegla=AW_RULES[nivel]||AW_RULES.Spark;
  let awCobertura='';
  if(nivel==='Storm') awCobertura='Ilimitadas · 50% vuelo + 100% alojamiento';
  else if(awVeces<awRegla.asistenciasConVuelo) awCobertura=`${awRegla.asistenciasConVuelo-awVeces} restante${awRegla.asistenciasConVuelo-awVeces!==1?'s':''} con vuelo`;
  else awCobertura='Sin cobertura de vuelo disponible';

  let html='';

  // ── Beneficios asignados
  html+=`<div class="side-panel-section">
    <div class="side-panel-section-title">Beneficios asignados (${benefAsig.filter(r=>(r.fields.Estado||'Activo')==='Activo').length} activos)</div>
    ${benefAsig.length?benefAsig.map(r=>{
      const bId=Array.isArray(r.fields.Beneficio)?r.fields.Beneficio[0]:r.fields.Beneficio;
      const benef=cacheBeneficiosRaw.find(b=>b.id===bId||b.fields.Beneficio===bId);
      const bNombre=benef?.fields.Beneficio||bId||'—';
      // Prioridad al Monto particular de esta asignación (editable) sobre el
      // valor fijo del catálogo — mismo criterio que se usa para sumar el
      // total usado más arriba.
      const valor=r.fields.Monto?`$${Number(r.fields.Monto).toLocaleString('es-AR')}/año`:benef?.fields.Valor?`$${Number(benef.fields.Valor).toLocaleString('es-AR')}/año`:'';
      const activo=(r.fields.Estado||'Activo')==='Activo';
      const nombreEsc=nombre.replace(/'/g,"\\'"),bNombreEsc=bNombre.replace(/'/g,"\\'");
      return`<div class="side-panel-row">
        <span>${bNombre}</span>
        <span style="display:flex;gap:6px;align-items:center">
          ${valor?`<span style="font-size:12px;color:var(--text3)">${valor}</span>`:''}
          <span class="badge ${activo?'badge-green':'badge-amber'}" style="font-size:11px">${activo?'Activo':'Inactivo'}</span>
          <button onclick="editarBenefAsignado('${r.id}','${nombreEsc}','${grupo}','${nivel}')" title="Editar" style="background:none;border:none;cursor:pointer;color:var(--text3);padding:2px;line-height:1;"><i class="ti ti-pencil"></i></button>
          <button onclick="eliminarBenefAsignado('${r.id}','${bNombreEsc}','${nombreEsc}','${grupo}','${nivel}')" title="Eliminar" style="background:none;border:none;cursor:pointer;color:#C62828;padding:2px;line-height:1;"><i class="ti ti-trash"></i></button>
        </span>
      </div>`;
    }).join(''):`<div class="sp-empty">Sin beneficios asignados</div>`}
  </div>`;

  // ── Capacitaciones
  html+=`<div class="side-panel-section">
    <div class="side-panel-section-title">Capacitaciones</div>
    ${topeCap>0?`<div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-bottom:4px">
        <span>Capacitación usada (anual)</span>
        <span style="font-weight:600;color:${capPct>=90?'#C62828':capPct>=70?'#E65100':'var(--text)'}">$${totalCap.toLocaleString('es-AR')} / $${topeCap.toLocaleString('es-AR')}</span>
      </div>
      <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
        <div style="width:${capPct}%;height:100%;background:${capBarColor};border-radius:3px;transition:width 0.3s"></div>
      </div>
    </div>`:''}
    ${caps.length?caps.map(r=>{
      const f=r.fields;
      return`<div class="side-panel-row" style="flex-direction:column;align-items:flex-start;gap:3px">
        <div style="display:flex;justify-content:space-between;width:100%">
          <span style="font-weight:500">${f.Descripción||'—'}</span>
          <span style="font-weight:600;color:var(--blue)">$${Number(f.Monto||0).toLocaleString('es-AR')}</span>
        </div>
        <div style="display:flex;gap:12px;font-size:11px;color:var(--text3)">
          ${f.Fecha?`<span>${fmt(f.Fecha)}</span>`:''}
          ${f['URL del curso']?`<a href="${f['URL del curso']}" target="_blank" style="color:var(--blue)">Ver curso →</a>`:''}
        </div>
      </div>`;
    }).join(''):`<div class="sp-empty">Sin capacitaciones registradas</div>`}
  </div>`;

  // ── Ambassador Week
  html+=`<div class="side-panel-section">
    <div class="side-panel-section-title">Ambassador Week · ${awVeces} asistencia${awVeces!==1?'s':''}</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:8px">${awCobertura}</div>
    ${awRecs.length?awRecs.map(r=>{
      const f=r.fields;
      const edicion=getEdicionAW(f)||'—';
      let pctRaw2=f['Porcentaje cubierto'];
      const pct=pctRaw2!=null?(pctRaw2<=1?Math.round(pctRaw2*100):Number(pctRaw2)):null;
      return`<div class="side-panel-row">
        <span>${edicion}</span>
        <span style="font-size:12px;font-weight:600;color:${pct===50?'var(--blue)':pct===100?'#0F6E56':'var(--text2)'}">${pct!=null?pct+'% vuelo cubierto':'—'}</span>
      </div>`;
    }).join(''):`<div class="sp-empty">Sin asistencias registradas</div>`}
  </div>`;

  // ── Off Sites
  html+=`<div class="side-panel-section">
    <div class="side-panel-section-title">Off Sites · ${osRecs.length} viaje${osRecs.length!==1?'s':''}</div>
    ${osRecs.length?osRecs.map(r=>{
      const f=r.fields;
      return`<div class="side-panel-row">
        <span><strong>${f.Destino||'—'}</strong> <span style="font-size:11px;color:var(--text3)">${f.Proyecto||''}</span></span>
        <span style="font-size:12px;color:var(--text2)">${fmt(f['Fecha inicio'])}${f['Días']?' · '+f['Días']+'d':''}</span>
      </div>`;
    }).join(''):`<div class="sp-empty">Sin off sites registrados</div>`}
  </div>`;

  // ── Get Together
  html+=`<div class="side-panel-section">
    <div class="side-panel-section-title">Get Togethers · ${gtRecs.length}</div>
    ${gtRecs.length?gtRecs.map(r=>{
      const f=r.fields;
      return`<div class="side-panel-row">
        <span><strong>${f.Ciudad||'—'}</strong>${f.País?' <span style="font-size:11px;color:var(--text3)">('+f.País+')</span>':''} <span style="font-size:11px;color:var(--text3)">${f.Proyecto||''}</span></span>
        <span style="font-size:12px;color:var(--text2)">${fmt(f.Fecha)}</span>
      </div>`;
    }).join(''):`<div class="sp-empty">Sin get togethers registrados</div>`}
  </div>`;

  document.getElementById('sp-body').innerHTML=html;
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
  <select class="field-input" id="f-eba-estado">
    <option value="Activo"${(f.Estado||'Activo')==='Activo'?' selected':''}>Activo</option>
    <option value="Inactivo"${f.Estado==='Inactivo'?' selected':''}>Inactivo</option>
  </select>
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
      const fields={
        Estado:v('f-eba-estado')||'Activo',
        'Fecha activación':fecha||null,
        Monto:v('f-eba-monto')?Number(v('f-eba-monto')):null,
      };
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
