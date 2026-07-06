// ─── OFF SITES ────────────────────────────────────────────────────────────────
async function loadOffsites(){
  const d=await atGet('Off Sites','&sort[0][field]=Fecha inicio&sort[0][direction]=desc').catch(()=>({records:[]}));
  // Resolver linked record IDs a nombres reales
  cacheOSRaw=(d.records||[]).map(r=>{
    const f={...r.fields};
    // Persona: si es array con ID, buscar en cachePersonasRaw
    if(Array.isArray(f.Persona)){
      const id=f.Persona[0];
      const match=cachePersonasRaw.find(p=>p.id===id);
      f.Persona=match?match.fields.Nombre:id;
    }
    // Proyecto: si es array con ID, buscar en cacheProyectosRaw
    if(Array.isArray(f.Proyecto)){
      const id=f.Proyecto[0];
      const match=(cacheProyectosRaw||[]).find(p=>p.id===id);
      f.Proyecto=match?match.fields.Proyecto:id;
    }
    return {...r, fields:f};
  });
  buildOSProyMap(); // precalcular mapa de proyectos una sola vez
  renderOSMetricas();
  renderOSPersona();
  renderOSProyecto();
  renderOSHistorial();
  poblarOSFiltroProyecto();
}

function switchOSTab(tab,btn){
  document.querySelectorAll('#page-offsites .tab-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  document.getElementById('os-tab-persona').style.display=tab==='persona'?'':'none';
  document.getElementById('os-tab-proyecto').style.display=tab==='proyecto'?'':'none';
  const tabMetricas=document.getElementById('os-tab-metricas');
  if(tabMetricas) tabMetricas.style.display=tab==='metricas'?'':'none';
  if(tab==='metricas'){
    poblarSelectorAnio('osq-anio',cacheOSRaw.map(r=>r.fields['Fecha inicio']).filter(Boolean).map(f=>new Date(f+'T12:00:00').getFullYear()));
    if(!osqInicializado){
      const hoy=new Date();
      document.getElementById('osq-anio').value=String(hoy.getFullYear());
      document.getElementById('osq-trimestre').value=String(Math.floor(hoy.getMonth()/3)+1);
      osqInicializado=true;
    }
    renderOSMetricasQ();
  }
}

// "Alta" = un off site cuya Fecha inicio cae dentro del trimestre elegido.
function renderOSMetricasQ(){
  const anio=Number(document.getElementById('osq-anio')?.value)||new Date().getFullYear();
  const q=Number(document.getElementById('osq-trimestre')?.value)||1;
  const {inicio,fin}=rangoTrimestre(anio,q);

  const enQ=cacheOSRaw.filter(r=>{
    const f=r.fields['Fecha inicio'];
    if(!f) return false;
    const d=new Date(f+'T12:00:00');
    return d>=inicio&&d<=fin;
  });
  document.getElementById('osq-total').textContent=enQ.length;
  document.getElementById('osq-total-sub').textContent=`Q${q} ${anio}`;

  const personas=new Set(enQ.map(r=>r.fields.Persona).filter(Boolean));
  document.getElementById('osq-personas').textContent=personas.size;

  document.getElementById('osq-dias').textContent=enQ.reduce((s,r)=>s+calcDiasOS(r.fields),0);

  const conteo={};
  enQ.forEach(r=>{
    const dest=r.fields.Destino;
    if(!dest) return;
    conteo[dest]=(conteo[dest]||0)+1;
  });
  const ranking=Object.entries(conteo).sort((a,b)=>b[1]-a[1]);
  const top=ranking[0];
  document.getElementById('osq-top').textContent=top?top[0]:'—';
  document.getElementById('osq-top-sub').textContent=top?`${top[1]} viaje${top[1]!==1?'s':''} en el Q`:'Sin off sites en este período';

  const cont=document.getElementById('osq-ranking-container');
  if(!cont) return;
  if(!ranking.length){
    cont.innerHTML='<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px;">Sin off sites registrados en este trimestre.</div>';
    return;
  }
  const total=enQ.length;
  cont.innerHTML=`<table class="data-table"><thead><tr><th>Destino</th><th>Off sites en el Q</th><th>% del total</th></tr></thead><tbody>
    ${ranking.map(([dest,cant])=>{
      const pct=total?Math.round(cant/total*100):0;
      return`<tr><td>📍 ${dest}</td><td style="font-weight:600">${cant}</td><td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;max-width:140px;height:6px;background:var(--border);border-radius:3px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--blue);border-radius:3px"></div></div>
          <span style="font-size:12px;color:var(--text2)">${pct}%</span>
        </div>
      </td></tr>`;
    }).join('')}
  </tbody></table>`;
}

function renderOSMetricas(){
  const personas=new Set(), proyectos=new Set();
  let diasTotal=0;
  const viajesUnicos=new Set();
  cacheOSRaw.forEach(r=>{
    const f=r.fields;
    const p=f.Persona||'';
    const proy=f.Proyecto||'';
    if(p) personas.add(p);
    if(proy) proyectos.add(proy);
    const key=`${f.Destino||''}|${f['Fecha inicio']||''}`;
    if(key!=='|'&&!viajesUnicos.has(key)){
      viajesUnicos.add(key);
      diasTotal+=calcDiasOS(f);
    }
  });
  document.getElementById('os-total').textContent=cacheOSRaw.length;
  document.getElementById('os-personas').textContent=personas.size;
  document.getElementById('os-proyectos').textContent=proyectos.size;
  document.getElementById('os-dias').textContent=diasTotal||'—';
}

function poblarOSFiltroProyecto(){
  const proyectos=[...new Set(cacheOSRaw.map(r=>r.fields.Proyecto||'').filter(Boolean))].sort();
  const sel=document.getElementById('os-filter-proyecto');
  if(sel) sel.innerHTML='<option value="">Todos los proyectos</option>'+proyectos.map(p=>`<option value="${p}">${p}</option>`).join('');
}

function openOSPerModal(nombre){
  const overlay=document.getElementById('os-per-overlay');
  overlay.style.display='flex';

  // Filtrar todos los registros de esta persona
  const recs=cacheOSRaw.filter(r=>{
    const p=Array.isArray(r.fields.Persona)?r.fields.Persona[0]:(typeof r.fields.Persona==='string'?r.fields.Persona:String(r.fields.Persona||''));
    return p.trim()===nombre.trim();
  }).sort((a,b)=>(b.fields['Fecha inicio']||'').localeCompare(a.fields['Fecha inicio']||''));

  const totalDias=recs.reduce((s,r)=>s+calcDiasOS(r.fields),0);
  const destinos=new Set(recs.map(r=>r.fields.Destino||'').filter(Boolean));

  document.getElementById('os-per-title').textContent=nombre;
  document.getElementById('os-per-subtitle').textContent=
    `${recs.length} off site${recs.length!==1?'s':''} · ${destinos.size} destino${destinos.size!==1?'s':''} · ${totalDias} días totales`;

  let html='';
  recs.forEach((r,idx)=>{
    const f=r.fields;
    const dest=f.Destino||'—';
    const proy=f.Proyecto||'';
    const fechaI=fmt(f['Fecha inicio']);
    const fechaF=fmt(f['Fecha fin']);
    const dias=calcDiasOS(f);
    const bg=idx%2===0?'background:var(--bg2)':'';
    html+=`<div style="padding:12px 0;border-bottom:1px solid var(--border);${bg}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:14px;font-weight:600">📍 ${dest}</span>
        <span style="font-size:12px;font-weight:600;color:var(--blue)">${dias} días</span>
      </div>
      <div style="display:flex;gap:16px;font-size:12px;color:var(--text3)">
        ${proy?`<span>💼 ${proy}</span>`:''}
        ${fechaI?`<span>📅 ${fechaI}${fechaF?' → '+fechaF:''}</span>`:''}
      </div>
      ${f.Descripción?`<div style="font-size:12px;color:var(--text2);margin-top:4px">${f.Descripción}</div>`:''}
    </div>`;
  });

  document.getElementById('os-per-body').innerHTML=html||'<div style="color:var(--text3);font-size:13px">Sin registros</div>';
}

function closeOSPerModal(){
  document.getElementById('os-per-overlay').style.display='none';
}

function filtrarOSPersona(){ renderOSPersona(); }

function calcDiasOS(f){
  // Intentar campo Días primero, sino calcular de fechas
  if(f['Días']&&Number(f['Días'])>0) return Number(f['Días']);
  if(f['Dias']&&Number(f['Dias'])>0) return Number(f['Dias']);
  if(f['dias']&&Number(f['dias'])>0) return Number(f['dias']);
  if(f['Fecha inicio']&&f['Fecha fin']){
    const d1=new Date(f['Fecha inicio']+'T12:00:00');
    const d2=new Date(f['Fecha fin']+'T12:00:00');
    const diff=Math.round((d2-d1)/86400000)+1;
    return diff>0?diff:0;
  }
  return 0;
}

function buildOSProyMap(){
  cacheOSProyMap = {};
  cacheOSRaw.forEach(r=>{
    const f=r.fields;
    const proy=Array.isArray(f.Proyecto)?f.Proyecto[0]:(f.Proyecto||'Sin proyecto');
    const persona=Array.isArray(f.Persona)?f.Persona[0]:(typeof f.Persona==='string'?f.Persona:String(f.Persona||''));
    const dias=calcDiasOS(f);
    if(!cacheOSProyMap[proy]) cacheOSProyMap[proy]={count:0,personas:new Set(),destinos:{},viajesUnicos:new Map(),diasUnicos:0};
    cacheOSProyMap[proy].count++;
    if(persona) cacheOSProyMap[proy].personas.add(persona);
    const dest=(f.Destino||'').trim();
    const fechaInicio=f['Fecha inicio']||'';
    if(dest){
      if(!cacheOSProyMap[proy].destinos[dest]) cacheOSProyMap[proy].destinos[dest]=[];
      cacheOSProyMap[proy].destinos[dest].push({persona,dias,fechaInicio});
    }
    // Viaje único = destino + fecha inicio → sumar días una sola vez
    const viajeKey=`${dest}|${fechaInicio}`;
    if(viajeKey!=='|'&&!cacheOSProyMap[proy].viajesUnicos.has(viajeKey)){
      cacheOSProyMap[proy].viajesUnicos.set(viajeKey, dias);
      cacheOSProyMap[proy].diasUnicos+=dias;
    }
  });
}

function openOSProyModal(proy){
  const d=cacheOSProyMap[proy];
  if(!d) return;
  const overlay=document.getElementById('os-proy-overlay');
  overlay.style.display='flex';
  document.getElementById('os-proy-title').textContent=proy;
  document.getElementById('os-proy-subtitle').textContent=
    `${d.viajesUnicos.size} off site${d.viajesUnicos.size!==1?'s':''} · ${d.personas.size} persona${d.personas.size!==1?'s':''} · ${d.diasUnicos||0} días totales`;

  // Construir contenido agrupado por destino
  const destinos=Object.entries(d.destinos).sort((a,b)=>b[1].length-a[1].length);
  let html='';
  destinos.forEach(([dest,viajes])=>{
    // Días únicos del destino = un valor por fecha de inicio única
    const viajesUnicosDestino=new Map();
    viajes.forEach(v=>{if(!viajesUnicosDestino.has(v.fechaInicio)) viajesUnicosDestino.set(v.fechaInicio,v.dias);});
    const diasDest=[...viajesUnicosDestino.values()].reduce((s,d)=>s+d,0);
    const personas=[...new Set(viajes.map(v=>v.persona).filter(Boolean))];
    html+=`<div style="margin-bottom:18px">
      <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:8px;border-bottom:1px solid var(--border);margin-bottom:10px">
        <span style="font-size:14px;font-weight:600;color:var(--text)">📍 ${dest}</span>
        <span style="font-size:12px;color:var(--text3)">${viajes.length} viaje${viajes.length!==1?'s':''} · ${diasDest} días</span>
      </div>
      ${personas.map(p=>`
        <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:0.5px solid var(--border)">
          ${avH(p)}
          <span style="font-size:13px">${p}</span>
        </div>`).join('')}
    </div>`;
  });

  document.getElementById('os-proy-body').innerHTML=html||'<div style="color:var(--text3);font-size:13px">Sin destinos registrados</div>';
}

function closeOSProyModal(){
  document.getElementById('os-proy-overlay').style.display='none';
}

function filtrarOSProyecto(){ renderOSProyecto(); }
function filtrarOSHistorial(){ renderOSHistorial(); }

function renderOSPersona(){
  const q=(document.getElementById('os-search-persona')?.value||'').toLowerCase();
  // Agrupar por persona
  const mapa={};
  cacheOSRaw.forEach(r=>{
    const f=r.fields;
    const nombre=Array.isArray(f.Persona)?f.Persona[0]:(typeof f.Persona==='string'?f.Persona:String(f.Persona||'—'));
    if(!mapa[nombre]) mapa[nombre]={count:0,destinos:new Set(),dias:0,ultFecha:''};
    mapa[nombre].count++;
    if(f.Destino) mapa[nombre].destinos.add(f.Destino.trim());
    mapa[nombre].dias+=calcDiasOS(f);
    if(f['Fecha inicio']&&f['Fecha inicio']>mapa[nombre].ultFecha) mapa[nombre].ultFecha=f['Fecha inicio'];
  });

  const filas=Object.entries(mapa)
    .filter(([n])=>!q||n.toLowerCase().includes(q))
    .sort((a,b)=>b[1].ultFecha.localeCompare(a[1].ultFecha));

  document.getElementById('os-badge-persona').textContent=`${filas.length} personas`;
  const tb=document.getElementById('os-tbody-persona');
  tb.innerHTML=filas.map(([nombre,d],idx)=>{
    const bg=idx%2===0?'background:var(--bg2)':'';
    const destStr=[...d.destinos].slice(0,3).join(', ')+(d.destinos.size>3?` +${d.destinos.size-3}`:'');
    return`<tr class="tr-clickable" style="${bg}" onclick="openOSPerModal(this.dataset.nombre)" data-nombre="${nombre.replace(/"/g,'&quot;')}">
      <td>${avH(nombre)}${nombre}</td>
      <td style="font-weight:600;font-size:15px;color:var(--blue)">${d.count}</td>
      <td style="font-size:12px;color:var(--text2)">${destStr||'—'}</td>
      <td style="font-size:13px">${d.dias||'—'} días</td>
      <td style="font-size:12px;color:var(--text2)">${fmt(d.ultFecha)}</td>
    </tr>`;
  }).join('')||'<tr class="empty-row"><td colspan="5">Sin resultados</td></tr>';
}

function renderOSProyecto(){
  const q=(document.getElementById('os-search-proyecto')?.value||'').toLowerCase();
  // Usar cache precalculado — ordenar por viajes únicos
  const filas=Object.entries(cacheOSProyMap)
    .filter(([n])=>!q||n.toLowerCase().includes(q))
    .sort((a,b)=>b[1].viajesUnicos.size-a[1].viajesUnicos.size)
    .map(([proy,d])=>[proy,{...d,destinos:new Set(Object.keys(d.destinos)),viajesCount:d.viajesUnicos.size}]);

  document.getElementById('os-badge-proyecto').textContent=`${filas.length} proyectos`;
  const tb=document.getElementById('os-tbody-proyecto');
  tb.innerHTML=filas.map(([proy,d],idx)=>{
    const bg=idx%2===0?'background:var(--bg2)':'';
    const destStr=[...d.destinos].slice(0,3).join(', ')+(d.destinos.size>3?` +${d.destinos.size-3}`:'');
    return`<tr class="tr-clickable" style="${bg}" onclick="openOSProyModal(this.dataset.proy)" data-proy="${proy.replace(/"/g,'&quot;')}">
      <td><strong>${proy}</strong></td>
      <td style="font-weight:600;font-size:15px;color:var(--blue)">${d.viajesCount||d.viajesUnicos?.size||'—'}</td>
      <td style="font-size:12px;color:var(--text2)">${[...d.personas].slice(0,4).join(', ')}${d.personas.size>4?` +${d.personas.size-4} más`:''}</td>
      <td style="font-size:12px;color:var(--text2)">${destStr||'—'}</td>
      <td style="font-size:13px">${d.diasUnicos||'—'} días</td>
    </tr>`;
  }).join('')||'<tr class="empty-row"><td colspan="5">Sin resultados</td></tr>';
}

function renderOSHistorial(){
  const q=(document.getElementById('os-search-hist')?.value||'').toLowerCase();
  const proyFil=document.getElementById('os-filter-proyecto')?.value||'';
  const recs=cacheOSRaw.filter(r=>{
    const f=r.fields;
    const texto=`${f.Persona||''} ${f.Proyecto||''} ${f.Destino||''}`.toLowerCase();
    return(!q||texto.includes(q))&&(!proyFil||(f.Proyecto||'')=== proyFil);
  });
  (()=>{const _e=document.getElementById('os-badge-historial');if(_e) _e.textContent=`${recs.length} registros`;})();
  const tb=document.getElementById('os-tbody-historial');
  if(!tb) return;
  tb.innerHTML=recs.map((r,idx)=>{
    const f=r.fields;
    const bg=idx%2===0?'background:var(--bg2)':'';
    const dias=f['Días']||'—';
    // Sanitizar Persona — puede venir como array (linked record) o string
    const persona=Array.isArray(f.Persona)?f.Persona[0]:(typeof f.Persona==='string'?f.Persona:String(f.Persona||''));
    const proyecto=Array.isArray(f.Proyecto)?f.Proyecto[0]:(f.Proyecto||'—');
    return`<tr style="${bg}">
      <td>${avH(persona)}${persona||'—'}</td>
      <td style="font-size:12px;color:var(--text2)">${proyecto}</td>
      <td style="font-size:12px">${f.Destino||'—'}</td>
      <td style="font-size:12px;color:var(--text2)">${fmt(f['Fecha inicio'])}</td>
      <td style="font-size:12px;color:var(--text2)">${fmt(f['Fecha fin'])}</td>
      <td style="font-weight:600">${dias} ${dias!=='—'?'días':''}</td>
      <td style="font-size:11px;color:var(--text3);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.Descripción||''}</td>
    </tr>`;
  }).join('')||'<tr class="empty-row"><td colspan="7">Sin registros</td></tr>';
}

