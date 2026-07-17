// ─── ACTIVIDADES VIRTUALES (webinars/workshops/townhalls/etc.) ────────────────
// A diferencia del sheet que reemplaza, acá solo se guarda un registro por
// PERSONA QUE ASISTIÓ — no una fila por cada persona de la empresa con
// TRUE/FALSE. El "% de asistencia" se calcula al vuelo comparando contra
// cuánta gente estaba activa (Personas: Fecha de ingreso/egreso) en la fecha
// del evento, así no hace falta guardar quién NO fue.
async function loadActividadesVirtuales(){
  const d=await atGet('Asistencia a Actividades','&sort[0][field]=Fecha&sort[0][direction]=desc').catch(()=>({records:[]}));
  cacheAVRaw=(d.records||[]).map(r=>{
    const f={...r.fields};
    if(Array.isArray(f.Persona)){
      const id=f.Persona[0];
      const match=cachePersonasRaw.find(p=>p.id===id);
      f.Persona=match?match.fields.Nombre:id;
    }
    return {...r, fields:f};
  });
  renderAVMetricas();
  renderAVPersona();
  poblarAVEventoAnio();
  renderAVEvento();
}

function poblarAVEventoAnio(){
  const sel=document.getElementById('av-evento-anio');
  if(!sel) return;
  const actual=sel.value;
  const anios=[...new Set(cacheAVRaw.map(r=>r.fields.Fecha).filter(Boolean).map(f=>new Date(f+'T12:00:00').getFullYear()))].sort((a,b)=>b-a);
  sel.innerHTML='<option value="">Todos los años</option>'+anios.map(a=>`<option value="${a}"${String(a)===actual?' selected':''}>${a}</option>`).join('');
}

function switchAVTab(tab,btn){
  document.querySelectorAll('#page-actividades .tab-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  document.getElementById('av-tab-persona').style.display=tab==='persona'?'':'none';
  document.getElementById('av-tab-evento').style.display=tab==='evento'?'':'none';
  const tabMetricas=document.getElementById('av-tab-metricas');
  if(tabMetricas) tabMetricas.style.display=tab==='metricas'?'':'none';
  if(tab==='metricas'){
    poblarSelectorAnio('avq-anio',cacheAVRaw.map(r=>r.fields.Fecha).filter(Boolean).map(f=>new Date(f+'T12:00:00').getFullYear()));
    if(!avqInicializado){
      const hoy=new Date();
      document.getElementById('avq-anio').value=String(hoy.getFullYear());
      document.getElementById('avq-trimestre').value=String(Math.floor(hoy.getMonth()/3)+1);
      avqInicializado=true;
    }
    renderAVMetricasQ();
  }
}

// Agrupa las asistencias por evento+fecha — clave compartida por varias
// funciones (render de "Por evento", métricas, % de asistencia).
function agruparAVPorEvento(rows){
  const mapa={};
  rows.forEach(r=>{
    const key=`${r.fields.Evento||'—'}|${r.fields.Fecha||''}`;
    if(!mapa[key]) mapa[key]={evento:r.fields.Evento||'—',fecha:r.fields.Fecha||'',grupo:r.fields.Grupo||'Todos',asistentes:[]};
    if(r.fields.Persona) mapa[key].asistentes.push(r.fields.Persona);
  });
  return mapa;
}

// Un evento puede estar dirigido solo a Core Team o solo a Engineers & Tech
// — el denominador del % de asistencia tiene que limitarse a ese grupo, no a
// toda la empresa, para que el porcentaje sea real.
function personaPerteneceAGrupoAV(persona,grupo){
  if(!grupo||grupo==='Todos') return true;
  const esCore=CORE_TEAM_ROLES.has((persona.fields['Rol en empresa']||'').trim());
  return grupo==='Core Team'?esCore:!esCore;
}

function activosParaEventoAV(evento){
  return (cachePersonasRaw||[]).filter(p=>personaActivaEnFecha(p,evento.fecha)&&personaPerteneceAGrupoAV(p,evento.grupo)).length;
}

// % de asistencia de un evento sobre un grupo puntual (Core Team/Engineers &
// Tech), sin importar a quién estaba dirigido el evento — así un evento
// "Todos" se puede leer separado por grupo en vez de un solo número mezclado.
function pctPorGrupoAV(evento,grupo){
  const activos=(cachePersonasRaw||[]).filter(p=>personaActivaEnFecha(p,evento.fecha)&&personaPerteneceAGrupoAV(p,grupo)).length;
  if(!activos) return null;
  const asistio=evento.asistentes.filter(nombre=>{
    const p=(cachePersonasRaw||[]).find(x=>(x.fields.Nombre||'').trim()===nombre.trim());
    return p&&personaPerteneceAGrupoAV(p,grupo);
  }).length;
  return Math.round(asistio/activos*100);
}

function promPorGrupoAV(eventos,grupo){
  const pcts=eventos.map(e=>pctPorGrupoAV(e,grupo)).filter(p=>p!=null);
  return pcts.length?Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length):null;
}

function barraPctAV(pct,color){
  return `<div style="display:flex;align-items:center;gap:8px;">
    <div style="flex:1;max-width:100px;height:6px;background:var(--border);border-radius:3px;overflow:hidden"><div style="width:${pct||0}%;height:100%;background:${color};border-radius:3px"></div></div>
    <span style="font-size:12px;color:var(--text2)">${pct!=null?pct+'%':'—'}</span>
  </div>`;
}

function renderAVMetricas(){
  const eventos=Object.values(agruparAVPorEvento(cacheAVRaw));
  document.getElementById('av-total-eventos').textContent=eventos.length;
  document.getElementById('av-total-asistencias').textContent=cacheAVRaw.length;
  const personas=new Set(cacheAVRaw.map(r=>r.fields.Persona).filter(Boolean));
  document.getElementById('av-total-personas').textContent=personas.size;

  const pcts=eventos.map(e=>{
    const activos=activosParaEventoAV(e);
    return activos?Math.round(e.asistentes.length/activos*100):null;
  }).filter(p=>p!=null);
  const prom=pcts.length?Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length):0;
  document.getElementById('av-prom-asistencia').textContent=eventos.length?`${prom}%`:'—';
}

function filtrarAVPersona(){ renderAVPersona(); }
function filtrarAVEvento(){ renderAVEvento(); }

function renderAVPersona(){
  const q=(document.getElementById('av-search-persona')?.value||'').toLowerCase();
  const mapa={};
  cacheAVRaw.forEach(r=>{
    const nombre=r.fields.Persona;
    if(!nombre) return;
    if(!mapa[nombre]) mapa[nombre]={eventos:[],ultFecha:''};
    mapa[nombre].eventos.push({evento:r.fields.Evento||'—',fecha:r.fields.Fecha||''});
    if(r.fields.Fecha&&r.fields.Fecha>mapa[nombre].ultFecha) mapa[nombre].ultFecha=r.fields.Fecha;
  });

  // Denominador de cada persona: cantidad de eventos únicos que se hicieron
  // mientras esa persona estaba activa en la empresa y dentro de su grupo.
  const eventosUnicos=Object.values(agruparAVPorEvento(cacheAVRaw));

  // "Por persona" es para consulta del día a día — solo gente activa hoy.
  // Las personas históricas (con Fecha de egreso) se consultan desde "Por
  // evento", que sí lista a todos los asistentes de cada actividad.
  const filas=Object.entries(mapa)
    .filter(([nombre])=>{
      const persona=(cachePersonasRaw||[]).find(p=>(p.fields.Nombre||'').trim()===nombre.trim());
      return persona&&!yaEgreso(persona);
    })
    .filter(([n])=>!q||n.toLowerCase().includes(q))
    .sort((a,b)=>b[1].ultFecha.localeCompare(a[1].ultFecha));

  document.getElementById('av-badge-persona').textContent=`${filas.length} persona${filas.length!==1?'s':''}`;
  const tb=document.getElementById('av-tbody-persona');
  if(!tb) return;
  tb.innerHTML=filas.map(([nombre,d],idx)=>{
    const persona=(cachePersonasRaw||[]).find(p=>(p.fields.Nombre||'').trim()===nombre.trim());
    const elegibles=persona?eventosUnicos.filter(e=>personaActivaEnFecha(persona,e.fecha)&&personaPerteneceAGrupoAV(persona,e.grupo)).length:eventosUnicos.length;
    const pct=elegibles?Math.round(d.eventos.length/elegibles*100):null;
    const bg=idx%2===0?'background:var(--bg2)':'';
    return `<tr class="tr-clickable" style="${bg}" onclick="verAVPersona('${nombre.replace(/'/g,"\\'")}')">
      <td>${avH(nombre)}${nombre}</td>
      <td style="font-weight:600;font-size:15px;color:var(--blue)">${d.eventos.length}</td>
      <td style="font-size:12px;color:var(--text2)">${pct!=null?pct+'% ('+elegibles+' posibles)':'—'}</td>
      <td style="font-size:12px;color:var(--text2)">${fmt(d.ultFecha)}</td>
    </tr>`;
  }).join('')||'<tr class="empty-row"><td colspan="4">Sin resultados</td></tr>';
}

// ─── Tarjeta lateral "Por persona" — historial completo + filtro de año/Q ─────
// Se usa para revisiones internas (cuántos eventos asistió una persona en un
// período dado), por eso el año y el trimestre se pueden filtrar por separado.
function verAVPersona(nombre){
  avPanelPersona=nombre;
  const panel=document.getElementById('sp-panel');
  const overlay=document.getElementById('sp-overlay');
  document.getElementById('sp-nombre').textContent=nombre;
  document.getElementById('sp-subtitle').textContent='Asistencia a Actividades';
  const anios=[...new Set(cacheAVRaw.map(r=>r.fields.Fecha).filter(Boolean).map(f=>new Date(f+'T12:00:00').getFullYear()))].sort((a,b)=>b-a);
  document.getElementById('sp-body').innerHTML=`
    <div style="display:flex;gap:8px;margin-bottom:18px">
      <select class="filter-select" id="sp-av-anio" onchange="renderAVPersonaCard()" style="flex:1">
        <option value="">Todos los años</option>
        ${anios.map(a=>`<option value="${a}">${a}</option>`).join('')}
      </select>
      <select class="filter-select" id="sp-av-trimestre" onchange="renderAVPersonaCard()" style="flex:1">
        <option value="">Todos los trimestres</option>
        <option value="1">Q1 · Ene-Mar</option>
        <option value="2">Q2 · Abr-Jun</option>
        <option value="3">Q3 · Jul-Sep</option>
        <option value="4">Q4 · Oct-Dic</option>
      </select>
    </div>
    <div class="metrics-2" id="sp-av-resumen" style="margin-bottom:20px"></div>
    <div class="side-panel-section">
      <div class="side-panel-section-title">Actividades</div>
      <div id="sp-av-lista"></div>
    </div>
    <div class="side-panel-section">
      <div class="side-panel-section-title" id="sp-av-titulo-no"></div>
      <div id="sp-av-lista-no"></div>
    </div>`;
  panel.classList.add('open');
  overlay.classList.add('open');
  document.body.style.overflow='hidden';
  renderAVPersonaCard();
}

function renderAVPersonaCard(){
  const nombre=avPanelPersona;
  if(!nombre) return;
  const anio=document.getElementById('sp-av-anio')?.value||'';
  const trimestre=document.getElementById('sp-av-trimestre')?.value||'';
  const dentroDelRango=fecha=>{
    if(!fecha) return false;
    const d=new Date(fecha+'T12:00:00');
    if(anio&&d.getFullYear()!==Number(anio)) return false;
    if(trimestre&&Math.floor(d.getMonth()/3)+1!==Number(trimestre)) return false;
    return true;
  };

  const eventosPersona=cacheAVRaw.filter(r=>r.fields.Persona===nombre&&dentroDelRango(r.fields.Fecha))
    .map(r=>({evento:r.fields.Evento||'—',fecha:r.fields.Fecha||''}))
    .sort((a,b)=>b.fecha.localeCompare(a.fecha));

  // Denominador: eventos únicos (de cualquier persona) dentro del mismo
  // período filtrado, en los que esta persona estaba activa en la empresa y
  // dentro de su grupo.
  const eventosUnicosEnRango=Object.values(agruparAVPorEvento(cacheAVRaw)).filter(e=>dentroDelRango(e.fecha));
  const persona=(cachePersonasRaw||[]).find(p=>(p.fields.Nombre||'').trim()===nombre.trim());
  const eventosElegibles=persona?eventosUnicosEnRango.filter(e=>personaActivaEnFecha(persona,e.fecha)&&personaPerteneceAGrupoAV(persona,e.grupo)):eventosUnicosEnRango;
  const elegibles=eventosElegibles.length;
  const pct=elegibles?Math.round(eventosPersona.length/elegibles*100):null;

  // Lo que le faltó: eventos elegibles para esta persona (activa + su grupo)
  // en los que no hay un registro de asistencia a su nombre.
  const asistioKeys=new Set(eventosPersona.map(e=>`${e.evento}|${e.fecha}`));
  const eventosNoAsistio=eventosElegibles
    .filter(e=>!asistioKeys.has(`${e.evento}|${e.fecha}`))
    .map(e=>({evento:e.evento,fecha:e.fecha}))
    .sort((a,b)=>b.fecha.localeCompare(a.fecha));

  document.getElementById('sp-av-resumen').innerHTML=`
    <div class="metric"><div class="metric-label">Asistió</div><div class="metric-val" style="color:var(--blue)">${eventosPersona.length}</div><div class="metric-sub">actividad${eventosPersona.length!==1?'es':''}</div></div>
    <div class="metric"><div class="metric-label">% asistencia</div><div class="metric-val">${pct!=null?pct+'%':'—'}</div><div class="metric-sub">${elegibles} posible${elegibles!==1?'s':''}</div></div>`;

  document.getElementById('sp-av-lista').innerHTML=eventosPersona.length
    ?eventosPersona.map(e=>`<div class="side-panel-row"><span>${e.evento}</span><span style="font-size:12px;color:var(--text2)">${fmt(e.fecha)}</span></div>`).join('')
    :'<div class="sp-empty">Sin actividades en este período</div>';

  document.getElementById('sp-av-titulo-no').textContent=`No asistió (${eventosNoAsistio.length})`;
  document.getElementById('sp-av-lista-no').innerHTML=eventosNoAsistio.length
    ?eventosNoAsistio.map(e=>`<div class="side-panel-row"><span style="color:var(--text3)">${e.evento}</span><span style="font-size:12px;color:var(--text3)">${fmt(e.fecha)}</span></div>`).join('')
    :'<div class="sp-empty">Asistió a todas las actividades elegibles en este período</div>';
}

function renderAVEvento(){
  const q=(document.getElementById('av-search-evento')?.value||'').toLowerCase();
  const anio=document.getElementById('av-evento-anio')?.value||'';
  const grupo=document.getElementById('av-evento-grupo')?.value||'';
  const mapa=agruparAVPorEvento(cacheAVRaw);

  const filas=Object.entries(mapa)
    .filter(([,d])=>!q||d.evento.toLowerCase().includes(q))
    .filter(([,d])=>!anio||(d.fecha&&new Date(d.fecha+'T12:00:00').getFullYear()===Number(anio)))
    .filter(([,d])=>!grupo||d.grupo===grupo)
    .sort((a,b)=>(b[1].fecha||'').localeCompare(a[1].fecha||''));

  document.getElementById('av-badge-evento').textContent=`${filas.length} evento${filas.length!==1?'s':''}`;
  const tb=document.getElementById('av-tbody-evento');
  if(!tb) return;
  tb.innerHTML=filas.map(([key,d],idx)=>{
    const activos=activosParaEventoAV(d);
    const pct=activos?Math.round(d.asistentes.length/activos*100):null;
    const bg=idx%2===0?'background:var(--bg2)':'';
    const fila=`<tr class="tr-clickable" style="${bg}" onclick="toggleAVEventoDetalle('${key.replace(/'/g,"\\'")}')">
      <td><strong>${d.evento}</strong> ${d.grupo&&d.grupo!=='Todos'?`<span class="badge badge-gray" style="font-size:10px">${d.grupo}</span>`:''}</td>
      <td style="font-size:12px;color:var(--text2)">${fmt(d.fecha)}</td>
      <td style="font-weight:600;font-size:15px;color:var(--blue)">${d.asistentes.length}</td>
      <td style="font-size:12px;color:var(--text2)">${pct!=null?pct+'% ('+activos+' activos)':'—'}</td>
    </tr>`;
    return avEventoExpandido===key?fila+filaDetalleAVEvento(d):fila;
  }).join('')||'<tr class="empty-row"><td colspan="4">Sin resultados</td></tr>';
}

function filaDetalleAVEvento(d){
  const nombres=[...d.asistentes].sort();
  const items=nombres.map(n=>`<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">${avH(n)}<span style="font-size:13px">${n}</span></div>`).join('');
  const key=`${d.evento}|${d.fecha}`;
  return `<tr class="benef-detalle-row" onclick="event.stopPropagation()"><td colspan="4"><div style="padding:12px 18px;background:var(--bg2);border-radius:8px;margin:4px 0;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text3);">${d.asistentes.length} asistente${d.asistentes.length!==1?'s':''}</div>
      <button onclick="editarEventoAV('${key.replace(/'/g,"\\'")}')" style="background:none;border:none;color:var(--blue);font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;"><i class="ti ti-pencil"></i>Editar evento</button>
    </div>
    ${items}
  </div></td></tr>`;
}

function toggleAVEventoDetalle(key){
  avEventoExpandido=avEventoExpandido===key?null:key;
  renderAVEvento();
}

function registrosDeEventoAV(evento,fecha){
  return cacheAVRaw.filter(r=>(r.fields.Evento||'—')===evento&&(r.fields.Fecha||'')===fecha);
}

// Edita Evento/Fecha/Grupo y la lista de asistentes de un evento ya guardado.
// Como cada asistente es un registro separado en Airtable, "editar el evento"
// significa: actualizar los registros de quienes siguen, borrar los de quienes
// se sacaron, y crear uno nuevo por cada persona agregada.
function editarEventoAV(key){
  const sep=key.lastIndexOf('|');
  const evento=key.slice(0,sep), fecha=key.slice(sep+1);
  const registros=registrosDeEventoAV(evento,fecha);
  if(!registros.length) return;
  const grupoActual=registros[0].fields.Grupo||'Todos';
  avAsistentesPreseleccionados=new Set(registros.map(r=>r.fields.Persona).filter(Boolean));
  _openFormModal({
    title:`Editar — ${evento}`,
    html:()=>`
<div class="field-group"><label class="field-label">Evento *</label><input class="field-input" id="f-av-evento" value="${evento.replace(/"/g,'&quot;')}"></div>
<div class="field-group"><label class="field-label">Fecha *</label><input class="field-input" id="f-av-fecha" type="date" value="${fecha}" onchange="renderListaAsistentesAV()"></div>
<div class="field-group"><label class="field-label">Dirigido a *</label>
  <select class="field-input" id="f-av-grupo" onchange="renderListaAsistentesAV()">
    <option value="Todos"${grupoActual==='Todos'?' selected':''}>Todos</option>
    <option value="Engineers & Tech"${grupoActual==='Engineers & Tech'?' selected':''}>Engineers &amp; Tech</option>
    <option value="Core Team"${grupoActual==='Core Team'?' selected':''}>Core Team</option>
  </select>
  <div class="field-hint">Se usa para calcular el % de asistencia sobre el grupo correcto, no sobre toda la empresa.</div>
</div>
<div class="field-group">
  <label class="field-label">Asistentes *</label>
  <div class="field-hint" style="margin-top:0;margin-bottom:8px">Solo se muestra a quienes ya estaban activos en BEON en la Fecha elegida.</div>
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
    onMount:()=>{ renderListaAsistentesAV(); },
    save:async()=>{
      const v=id=>document.getElementById(id)?.value||'';
      const evento2=v('f-av-evento').trim();
      const fecha2=v('f-av-fecha');
      const grupo2=v('f-av-grupo')||'Todos';
      if(!evento2){toast('El evento es obligatorio',true);return false;}
      if(!fecha2){toast('La fecha es obligatoria',true);return false;}
      const nuevosNombres=new Set(asistentesSeleccionadosAV());
      if(!nuevosNombres.size){toast('Seleccioná al menos un asistente',true);return false;}

      for(const r of registros){
        const nombre=r.fields.Persona;
        if(nuevosNombres.has(nombre)){
          await atPatch(`Asistencia a Actividades/${r.id}`,{Evento:evento2,Fecha:fecha2,Grupo:grupo2});
          nuevosNombres.delete(nombre);
        } else {
          await atDelete('Asistencia a Actividades',r.id).catch(()=>{});
        }
      }
      for(const nombre of nuevosNombres){
        const persona=cachePersonasRaw.find(p=>(p.fields.Nombre||'').trim()===nombre.trim());
        if(!persona) continue;
        await atPost('Asistencia a Actividades',{Persona:[persona.id],Evento:evento2,Fecha:fecha2,Grupo:grupo2});
      }
      avEventoExpandido=null;
      return true;
    },
  });
}

// "Alta" = una actividad cuya Fecha cae dentro del trimestre elegido.
function renderAVMetricasQ(){
  const anio=Number(document.getElementById('avq-anio')?.value)||new Date().getFullYear();
  const q=Number(document.getElementById('avq-trimestre')?.value)||1;
  const {inicio,fin}=rangoTrimestre(anio,q);

  const enQ=cacheAVRaw.filter(r=>{
    const f=r.fields.Fecha;
    if(!f) return false;
    const d=new Date(f+'T12:00:00');
    return d>=inicio&&d<=fin;
  });

  const eventos=Object.values(agruparAVPorEvento(enQ));
  document.getElementById('avq-total').textContent=eventos.length;
  document.getElementById('avq-total-sub').textContent=`Q${q} ${anio}`;

  const personas=new Set(enQ.map(r=>r.fields.Persona).filter(Boolean));
  document.getElementById('avq-personas').textContent=personas.size;

  const promCore=promPorGrupoAV(eventos,'Core Team');
  const promEng=promPorGrupoAV(eventos,'Engineers & Tech');
  document.getElementById('avq-prom-core').textContent=promCore!=null?`${promCore}%`:'—';
  document.getElementById('avq-prom-eng').textContent=promEng!=null?`${promEng}%`:'—';

  const ranking=eventos.sort((a,b)=>b.asistentes.length-a.asistentes.length);
  const top=ranking[0];
  document.getElementById('avq-top').textContent=top?top.evento:'—';
  document.getElementById('avq-top-sub').textContent=top?`${top.asistentes.length} asistente${top.asistentes.length!==1?'s':''}`:'Sin actividades en este período';

  const cont=document.getElementById('avq-ranking-container');
  if(!cont) return;
  if(!ranking.length){
    cont.innerHTML='<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px;">Sin actividades registradas en este trimestre.</div>';
    return;
  }
  // Se muestra el % separado por Core Team y por Engineers & Tech (en vez de
  // un solo % mezclado) — sobre todo relevante en eventos "Todos", donde antes
  // un solo número escondía que la asistencia real puede ser muy distinta
  // entre los dos grupos.
  cont.innerHTML=`<table class="data-table"><thead><tr><th>Evento</th><th>Fecha</th><th>Asistentes</th><th>% Core Team</th><th>% Engineers & Tech</th></tr></thead><tbody>
    ${ranking.map(e=>{
      const pctCore=pctPorGrupoAV(e,'Core Team');
      const pctEng=pctPorGrupoAV(e,'Engineers & Tech');
      return`<tr><td>${e.evento}</td><td style="font-size:12px;color:var(--text2)">${fmt(e.fecha)}</td><td style="font-weight:600">${e.asistentes.length}</td>
        <td>${barraPctAV(pctCore,'var(--purple)')}</td>
        <td>${barraPctAV(pctEng,'var(--blue)')}</td>
      </tr>`;
    }).join('')}
  </tbody></table>`;
}

// ─── Formulario "Registrar actividad"/"Editar evento" — lista de asistentes
// con checkboxes. avAsistentesPreseleccionados trae los nombres que ya
// figuraban en el evento cuando se abre en modo edición (vacío al crear uno
// nuevo) — se re-aplica cada vez que se re-renderiza la lista (ej. al cambiar
// el grupo "Dirigido a" o la Fecha). Con la Fecha puesta, solo se muestra a
// quienes ya estaban activos en BEON ese día — clave ahora que hay personas
// históricas cargadas que no tiene sentido ofrecer para cualquier fecha.
function renderListaAsistentesAV(){
  const cont=document.getElementById('f-av-lista');
  if(!cont) return;
  const grupo=document.getElementById('f-av-grupo')?.value||'Todos';
  const fecha=document.getElementById('f-av-fecha')?.value||'';
  const marcados=avAsistentesPreseleccionados||new Set();
  const nombres=[...(cachePersonasRaw||[])]
    .filter(p=>personaPerteneceAGrupoAV(p,grupo))
    .filter(p=>!fecha||personaActivaEnFecha(p,fecha))
    .map(p=>p.fields.Nombre).filter(Boolean).sort();
  cont.innerHTML=nombres.map(n=>`
    <label style="display:flex;align-items:center;gap:8px;padding:5px 2px;font-size:13px;cursor:pointer" data-nombre-lower="${n.toLowerCase()}">
      <input type="checkbox" class="av-asistente-chk" value="${n.replace(/"/g,'&quot;')}"${marcados.has(n)?' checked':''}> ${n}
    </label>`).join('');
  cont.querySelectorAll('.av-asistente-chk').forEach(chk=>chk.addEventListener('change',actualizarContadorAV));
  filtrarListaAsistentesAV();
  actualizarContadorAV();
}

function filtrarListaAsistentesAV(){
  const q=(document.getElementById('f-av-buscar')?.value||'').toLowerCase();
  document.querySelectorAll('#f-av-lista label').forEach(lab=>{
    lab.style.display=(!q||lab.dataset.nombreLower.includes(q))?'flex':'none';
  });
}

function toggleSeleccionarTodosAV(){
  const visibles=[...document.querySelectorAll('#f-av-lista label')].filter(l=>l.style.display!=='none');
  const chks=visibles.map(l=>l.querySelector('.av-asistente-chk'));
  const todosMarcados=chks.length>0&&chks.every(c=>c.checked);
  chks.forEach(c=>c.checked=!todosMarcados);
  actualizarContadorAV();
}

function actualizarContadorAV(){
  const n=document.querySelectorAll('.av-asistente-chk:checked').length;
  const el=document.getElementById('f-av-contador');
  if(el) el.textContent=`${n} seleccionado${n!==1?'s':''}`;
}

function asistentesSeleccionadosAV(){
  return [...document.querySelectorAll('.av-asistente-chk:checked')].map(c=>c.value);
}
