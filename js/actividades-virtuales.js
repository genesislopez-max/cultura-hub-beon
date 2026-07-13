// ─── ACTIVIDADES VIRTUALES (webinars/workshops/townhalls/etc.) ────────────────
// A diferencia del sheet que reemplaza, acá solo se guarda un registro por
// PERSONA QUE ASISTIÓ — no una fila por cada persona de la empresa con
// TRUE/FALSE. El "% de asistencia" se calcula al vuelo comparando contra
// cuánta gente estaba activa (Personas: Fecha de ingreso/egreso) en la fecha
// del evento, así no hace falta guardar quién NO fue.
async function loadActividadesVirtuales(){
  const d=await atGet('Actividades Virtuales','&sort[0][field]=Fecha&sort[0][direction]=desc').catch(()=>({records:[]}));
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
  renderAVEvento();
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
    if(!mapa[key]) mapa[key]={evento:r.fields.Evento||'—',fecha:r.fields.Fecha||'',asistentes:[]};
    if(r.fields.Persona) mapa[key].asistentes.push(r.fields.Persona);
  });
  return mapa;
}

function renderAVMetricas(){
  const eventos=Object.values(agruparAVPorEvento(cacheAVRaw));
  document.getElementById('av-total-eventos').textContent=eventos.length;
  document.getElementById('av-total-asistencias').textContent=cacheAVRaw.length;
  const personas=new Set(cacheAVRaw.map(r=>r.fields.Persona).filter(Boolean));
  document.getElementById('av-total-personas').textContent=personas.size;

  const pcts=eventos.map(e=>{
    const activos=(cachePersonasRaw||[]).filter(p=>personaActivaEnFecha(p,e.fecha)).length;
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
  // mientras esa persona estaba activa en la empresa.
  const eventosUnicos=Object.values(agruparAVPorEvento(cacheAVRaw)).map(e=>e.fecha);

  const filas=Object.entries(mapa)
    .filter(([n])=>!q||n.toLowerCase().includes(q))
    .sort((a,b)=>b[1].ultFecha.localeCompare(a[1].ultFecha));

  document.getElementById('av-badge-persona').textContent=`${filas.length} persona${filas.length!==1?'s':''}`;
  const tb=document.getElementById('av-tbody-persona');
  if(!tb) return;
  tb.innerHTML=filas.map(([nombre,d],idx)=>{
    const persona=(cachePersonasRaw||[]).find(p=>(p.fields.Nombre||'').trim()===nombre.trim());
    const elegibles=persona?eventosUnicos.filter(fecha=>personaActivaEnFecha(persona,fecha)).length:eventosUnicos.length;
    const pct=elegibles?Math.round(d.eventos.length/elegibles*100):null;
    const bg=idx%2===0?'background:var(--bg2)':'';
    const fila=`<tr class="tr-clickable" style="${bg}" onclick="toggleAVPersonaDetalle('${nombre.replace(/'/g,"\\'")}')">
      <td>${avH(nombre)}${nombre}</td>
      <td style="font-weight:600;font-size:15px;color:var(--blue)">${d.eventos.length}</td>
      <td style="font-size:12px;color:var(--text2)">${pct!=null?pct+'% ('+elegibles+' posibles)':'—'}</td>
      <td style="font-size:12px;color:var(--text2)">${fmt(d.ultFecha)}</td>
    </tr>`;
    return avPersonaExpandido===nombre?fila+filaDetalleAVPersona(d):fila;
  }).join('')||'<tr class="empty-row"><td colspan="4">Sin resultados</td></tr>';
}

function filaDetalleAVPersona(d){
  const items=[...d.eventos].sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(e=>
    `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:13px;"><span>${e.evento}</span><span style="color:var(--text3);font-size:12px">${fmt(e.fecha)}</span></div>`
  ).join('');
  return `<tr class="benef-detalle-row" onclick="event.stopPropagation()"><td colspan="4"><div style="padding:12px 18px;background:var(--bg2);border-radius:8px;margin:4px 0;">${items}</div></td></tr>`;
}

function toggleAVPersonaDetalle(nombre){
  avPersonaExpandido=avPersonaExpandido===nombre?null:nombre;
  renderAVPersona();
}

function renderAVEvento(){
  const q=(document.getElementById('av-search-evento')?.value||'').toLowerCase();
  const mapa=agruparAVPorEvento(cacheAVRaw);

  const filas=Object.entries(mapa)
    .filter(([,d])=>!q||d.evento.toLowerCase().includes(q))
    .sort((a,b)=>(b[1].fecha||'').localeCompare(a[1].fecha||''));

  document.getElementById('av-badge-evento').textContent=`${filas.length} evento${filas.length!==1?'s':''}`;
  const tb=document.getElementById('av-tbody-evento');
  if(!tb) return;
  tb.innerHTML=filas.map(([key,d],idx)=>{
    const activos=(cachePersonasRaw||[]).filter(p=>personaActivaEnFecha(p,d.fecha)).length;
    const pct=activos?Math.round(d.asistentes.length/activos*100):null;
    const bg=idx%2===0?'background:var(--bg2)':'';
    const fila=`<tr class="tr-clickable" style="${bg}" onclick="toggleAVEventoDetalle('${key.replace(/'/g,"\\'")}')">
      <td><strong>${d.evento}</strong></td>
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
  return `<tr class="benef-detalle-row" onclick="event.stopPropagation()"><td colspan="4"><div style="padding:12px 18px;background:var(--bg2);border-radius:8px;margin:4px 0;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text3);margin-bottom:6px;">${d.asistentes.length} asistente${d.asistentes.length!==1?'s':''}</div>${items}</div></td></tr>`;
}

function toggleAVEventoDetalle(key){
  avEventoExpandido=avEventoExpandido===key?null:key;
  renderAVEvento();
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

  const pcts=eventos.map(e=>{
    const activos=(cachePersonasRaw||[]).filter(p=>personaActivaEnFecha(p,e.fecha)).length;
    return activos?Math.round(e.asistentes.length/activos*100):null;
  }).filter(p=>p!=null);
  const prom=pcts.length?Math.round(pcts.reduce((a,b)=>a+b,0)/pcts.length):0;
  document.getElementById('avq-prom').textContent=eventos.length?`${prom}%`:'—';

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
  cont.innerHTML=`<table class="data-table"><thead><tr><th>Evento</th><th>Fecha</th><th>Asistentes</th><th>% asistencia</th></tr></thead><tbody>
    ${ranking.map(e=>{
      const activos=(cachePersonasRaw||[]).filter(p=>personaActivaEnFecha(p,e.fecha)).length;
      const pct=activos?Math.round(e.asistentes.length/activos*100):null;
      return`<tr><td>${e.evento}</td><td style="font-size:12px;color:var(--text2)">${fmt(e.fecha)}</td><td style="font-weight:600">${e.asistentes.length}</td><td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;max-width:140px;height:6px;background:var(--border);border-radius:3px;overflow:hidden"><div style="width:${pct||0}%;height:100%;background:var(--blue);border-radius:3px"></div></div>
          <span style="font-size:12px;color:var(--text2)">${pct!=null?pct+'%':'—'}</span>
        </div>
      </td></tr>`;
    }).join('')}
  </tbody></table>`;
}

// ─── Formulario "Registrar actividad" — lista de asistentes con checkboxes ────
function renderListaAsistentesAV(){
  const cont=document.getElementById('f-av-lista');
  if(!cont) return;
  const nombres=[...(cachePersonasRaw||[])].map(p=>p.fields.Nombre).filter(Boolean).sort();
  cont.innerHTML=nombres.map(n=>`
    <label style="display:flex;align-items:center;gap:8px;padding:5px 2px;font-size:13px;cursor:pointer" data-nombre-lower="${n.toLowerCase()}">
      <input type="checkbox" class="av-asistente-chk" value="${n.replace(/"/g,'&quot;')}"> ${n}
    </label>`).join('');
  cont.querySelectorAll('.av-asistente-chk').forEach(chk=>chk.addEventListener('change',actualizarContadorAV));
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
