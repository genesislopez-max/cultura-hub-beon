// ─── EVENTOS (histórico + satisfacción) ───────────────────────────────────────
// Junta el histórico de "Asistencia a Actividades" y "Get Together" en una
// sola lista de eventos (no se cargan eventos sueltos acá — siempre salen de
// esas dos fuentes) y le suma el nivel de satisfacción que sale de la
// encuesta que se manda post-evento solo a quienes asistieron. Ese puntaje
// vive en una tabla aparte ("Eventos Feedback": Evento, Fecha, Fuente,
// Puntaje 1-5, Respuestas, Comentario) porque ninguna de las dos tablas de
// asistencia tiene ni va a tener ese dato.

// Get Together no tiene un campo de nombre de evento (se identifica por
// Ciudad+Fecha) — se sintetiza un nombre para poder tratarlo igual que un
// evento de Actividades en la lista combinada.
function agruparGTPorEncuentro(rows){
  const mapa={};
  (rows||[]).forEach(r=>{
    const f=r.fields||{};
    const ciudad=f.Ciudad||'Sin ciudad';
    const key=`${ciudad}|${f.Fecha||''}`;
    if(!mapa[key]) mapa[key]={evento:`Get Together — ${ciudad}`,fecha:f.Fecha||'',ciudad,pais:f['País']||'',asistentes:[]};
    if(f.BEONer) mapa[key].asistentes.push(f.BEONer);
  });
  return mapa;
}

// Une los eventos agrupados de ambas fuentes con su puntaje de satisfacción
// (si ya se cargó) — clave de match: Fuente+Evento+Fecha exactos. Un feedback
// que no matchea ningún evento agrupado (ej. el evento se borró o se editó
// el nombre/fecha después) simplemente no aparece, no genera un evento fantasma.
function combinarEventos(avRows,gtRows,feedbackRows){
  const avMapa=agruparAVPorEvento(avRows||[]);
  const gtMapa=agruparGTPorEncuentro(gtRows||[]);

  const feedbackPorClave={};
  (feedbackRows||[]).forEach(r=>{
    const f=r.fields||{};
    const key=`${f.Fuente||''}|${f.Evento||''}|${f.Fecha||''}`;
    feedbackPorClave[key]={
      id:r.id,
      puntaje:f.Puntaje!=null?Number(f.Puntaje):null,
      respuestas:f.Respuestas!=null?Number(f.Respuestas):null,
      comentario:f.Comentario||null,
    };
  });

  const lista=[
    ...Object.values(avMapa).map(e=>({fuente:'Actividades',evento:e.evento,fecha:e.fecha,asistentes:e.asistentes.length})),
    ...Object.values(gtMapa).map(e=>({fuente:'Get Together',evento:e.evento,fecha:e.fecha,asistentes:e.asistentes.length})),
  ].map(ev=>{
    const fb=feedbackPorClave[`${ev.fuente}|${ev.evento}|${ev.fecha}`];
    return {...ev,puntaje:fb?fb.puntaje:null,respuestas:fb?fb.respuestas:null,comentario:fb?fb.comentario:null};
  });

  lista.sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
  return lista;
}

function mostrarCargandoEventos(){
  const tb=document.getElementById('ev-tbody');
  if(!tb) return;
  tb.innerHTML=`<tr class="empty-row"><td colspan="6">
    <div class="ev-empty">
      <div class="ev-empty-icon"><i class="ti ti-loader"></i></div>
      <div class="ev-empty-title">Cargando eventos…</div>
      <div class="ev-empty-sub">Juntando el histórico de Actividades y Get Together</div>
    </div>
  </td></tr>`;
}

// Índice id→Nombre de Personas. Las dos tablas de asistencia son las más
// largas de la base (una fila por persona por evento), así que resolver cada
// linked record con un cachePersonasRaw.find() lineal era O(filas × personas).
function indicePersonasPorId(){
  const idx=new Map();
  (cachePersonasRaw||[]).forEach(p=>idx.set(p.id,p.fields.Nombre));
  return idx;
}

// "Asistencia a Actividades" y "Get Together" son las dos tablas más grandes y
// atGet() las pagina de 100 en 100 en requests secuenciales, así que bajarlas
// de nuevo cuesta varios segundos. Si el usuario ya pasó por esas secciones,
// sus caches están listos y con la misma resolución de linked records que
// necesitamos acá, así que se reusan; y si Eventos es la primera sección que
// se visita, se dejan poblados para que esas dos carguen instantáneo después.
async function loadEventos(){
  const faltaAV=!cacheAVRaw.length;
  const faltaGT=!cacheGetTogetherRaw.length;
  // Si hay que bajar las tablas de asistencia esto tarda unos segundos (son
  // miles de filas y Airtable pagina de a 100), así que conviene decirlo en vez
  // de dejar la tabla vacía como si no hubiera eventos.
  if(faltaAV||faltaGT) mostrarCargandoEventos();
  const [dAV,dGT,dFB]=await Promise.all([
    faltaAV?atGet('Asistencia a Actividades').catch(()=>({records:[]})):null,
    faltaGT?atGet('Get Together').catch(()=>({records:[]})):null,
    atGet('Eventos Feedback').catch(()=>({records:[]})),
  ]);

  const personas=indicePersonasPorId();
  if(faltaAV){
    cacheAVRaw=(dAV.records||[]).map(r=>{
      const f={...r.fields};
      if(Array.isArray(f.Persona)) f.Persona=personas.get(f.Persona[0])||f.Persona[0];
      return {...r,fields:f};
    });
  }
  if(faltaGT){
    cacheGetTogetherRaw=(dGT.records||[]).map(r=>{
      const f={...r.fields};
      if(Array.isArray(f.BEONer)) f.BEONer=personas.get(f.BEONer[0])||f.BEONer[0];
      if(Array.isArray(f.Ciudad)) f.Ciudad=f.Ciudad[0]||'';
      if(Array.isArray(f['País'])) f['País']=f['País'][0]||'';
      return {...r,fields:f};
    });
  }

  cacheEventosFeedbackRaw=dFB.records||[];
  recombinarEventos();
}

// Rearma la lista y repinta, sin tocar la red. Se usa después de guardar o
// borrar un puntaje: ahí solo cambió "Eventos Feedback", así que volver a
// bajar las dos tablas de asistencia (lo que hacía el loadEventos() completo)
// era gratis en resultado y carísimo en tiempo.
function recombinarEventos(){
  cacheEventosLista=combinarEventos(cacheAVRaw,cacheGetTogetherRaw,cacheEventosFeedbackRaw);
  renderEventosKpis();
  filtrarEventos();
}

async function recargarFeedbackEventos(){
  const dFB=await atGet('Eventos Feedback').catch(()=>({records:[]}));
  cacheEventosFeedbackRaw=dFB.records||[];
  recombinarEventos();
}

function renderEventosKpis(){
  const total=cacheEventosLista.length;
  document.getElementById('ev-total').textContent=total;

  const conPuntaje=cacheEventosLista.filter(e=>e.puntaje!=null);
  const prom=conPuntaje.length?conPuntaje.reduce((s,e)=>s+e.puntaje,0)/conPuntaje.length:null;
  document.getElementById('ev-prom-satisfaccion').textContent=prom!=null?prom.toFixed(1):'—';
  const star=document.getElementById('ev-prom-satisfaccion-star');
  if(star) star.style.display=prom!=null?'inline':'none';
  document.getElementById('ev-prom-satisfaccion-sub').textContent=conPuntaje.length
    ?`sobre ${conPuntaje.length} evento${conPuntaje.length!==1?'s':''} con encuesta`
    :'sin encuestas cargadas';

  document.getElementById('ev-sin-encuesta').textContent=total-conPuntaje.length;

  const hoy=new Date();
  const q=Math.floor(hoy.getMonth()/3)+1;
  const inicioQ=new Date(hoy.getFullYear(),(q-1)*3,1);
  const enQ=cacheEventosLista.filter(e=>e.fecha&&new Date(e.fecha+'T12:00:00')>=inicioQ);
  document.getElementById('ev-trimestre').textContent=enQ.length;
  document.getElementById('ev-trimestre-sub').textContent=`Q${q} ${hoy.getFullYear()}`;
}

// ─── Resumen del trimestre ────────────────────────────────────────────────────
// Junta en un solo objeto todo lo que se muestra en la ventana de resumen. Es
// pura (recibe los datos, no lee los caches) para poder testearla sin DOM.
//
// "personasUnicas" NO se puede sacar de la lista de eventos: ahí `asistentes`
// ya viene contado por evento, así que sumarlo cuenta a la misma persona una
// vez por evento al que fue. Se calcula sobre las filas crudas de asistencia,
// que son una por persona por evento.
function resumenTrimestreEventos(lista,avRows,gtRows,personas,anio,q){
  const {inicio,fin}=rangoTrimestre(anio,q);
  const enRango=f=>{
    if(!f) return false;
    const d=new Date(f+'T12:00:00');
    return d>=inicio&&d<=fin;
  };

  const eventos=(lista||[]).filter(e=>enRango(e.fecha))
    .slice().sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||''));

  const nombres=new Set();
  (avRows||[]).forEach(r=>{ if(enRango(r.fields?.Fecha)&&r.fields.Persona) nombres.add(String(r.fields.Persona).trim()); });
  (gtRows||[]).forEach(r=>{ if(enRango(r.fields?.Fecha)&&r.fields.BEONer) nombres.add(String(r.fields.BEONer).trim()); });

  // Denominador del % de participación: gente activa al cierre del trimestre,
  // pero sin pasarse de hoy — en el Q en curso lo que importa es el equipo de
  // hoy, no el que va a haber cuando termine.
  const hoy=new Date();
  const corte=fin>hoy?hoy:fin;
  const corteStr=`${corte.getFullYear()}-${String(corte.getMonth()+1).padStart(2,'0')}-${String(corte.getDate()).padStart(2,'0')}`;
  const activos=(personas||[]).filter(p=>personaActivaEnFecha(p,corteStr)&&!yaEgreso(p)).length;

  const conPuntaje=eventos.filter(e=>e.puntaje!=null);
  const prom=conPuntaje.length?conPuntaje.reduce((s,e)=>s+e.puntaje,0)/conPuntaje.length:null;
  const asistencias=eventos.reduce((s,e)=>s+(e.asistentes||0),0);

  const porFuente={};
  eventos.forEach(e=>{
    if(!porFuente[e.fuente]) porFuente[e.fuente]={eventos:0,asistencias:0};
    porFuente[e.fuente].eventos++;
    porFuente[e.fuente].asistencias+=e.asistentes||0;
  });

  const masConvocante=eventos.reduce((max,e)=>!max||e.asistentes>max.asistentes?e:max,null);
  const mejorPuntuado=conPuntaje.reduce((max,e)=>!max||e.puntaje>max.puntaje?e:max,null);

  return {
    anio,q,etiqueta:`Q${q} ${anio}`,
    eventos,
    totalEventos:eventos.length,
    asistencias,
    personasUnicas:nombres.size,
    activos,
    pctParticipacion:activos?Math.round(nombres.size/activos*100):null,
    conEncuesta:conPuntaje.length,
    sinEncuesta:eventos.length-conPuntaje.length,
    promedio:prom,
    porFuente,
    masConvocante,
    mejorPuntuado,
    comentarios:eventos.filter(e=>e.comentario).map(e=>({evento:e.evento,fecha:e.fecha,comentario:e.comentario})),
  };
}

// Texto plano del resumen, con el mismo orden de datos que la ventana — para
// pegar en Slack o en un doc. Pura, así que también se testea sin DOM.
function textoResumenTrimestre(r){
  const L=[];
  L.push(`Eventos ${r.etiqueta} — BEON.tech`);
  L.push('');
  if(!r.totalEventos){
    L.push('Sin eventos registrados en este trimestre.');
    return L.join('\n');
  }
  L.push(`${r.totalEventos} evento${r.totalEventos!==1?'s':''} · ${r.asistencias} asistencia${r.asistencias!==1?'s':''} · ${r.personasUnicas} persona${r.personasUnicas!==1?'s':''} distinta${r.personasUnicas!==1?'s':''}`);
  if(r.pctParticipacion!=null) L.push(`Participación: ${r.pctParticipacion}% del equipo (${r.activos} activos)`);
  if(r.promedio!=null) L.push(`Satisfacción promedio: ${r.promedio.toFixed(2)}/5 (sobre ${r.conEncuesta} evento${r.conEncuesta!==1?'s':''} con encuesta)`);
  L.push('');
  r.eventos.forEach(e=>{
    L.push(`▸ ${e.evento} (${fmt(e.fecha)}) · ${e.fuente}`);
    L.push(`   Asistencia: ${e.asistentes} participante${e.asistentes!==1?'s':''}`);
    if(e.puntaje!=null) L.push(`   Puntaje: ${e.puntaje.toFixed(1)}/5${e.respuestas?` (${e.respuestas} respuesta${e.respuestas!==1?'s':''})`:''}`);
    else L.push('   Puntaje: sin encuesta cargada');
    if(e.comentario) L.push(`   💬 "${e.comentario}"`);
    L.push('');
  });
  if(r.sinEncuesta) L.push(`${r.sinEncuesta===1?'Queda 1 evento':`Quedan ${r.sinEncuesta} eventos`} sin encuesta cargada.`);
  return L.join('\n').trimEnd();
}

// Combina los selects (fuente/encuesta), la búsqueda y el tab rápido
// (Todos/Sin encuesta/4.5+/-4.5) — todos los filtros aplican en simultáneo (AND).
function eventosFiltrados(){
  const q=(document.getElementById('ev-search')?.value||'').toLowerCase();
  const fuenteFil=document.getElementById('ev-fuente')?.value||'';
  const encuestaFil=document.getElementById('ev-encuesta')?.value||'';
  return cacheEventosLista.filter(ev=>
    (!q||ev.evento.toLowerCase().includes(q))&&
    (!fuenteFil||ev.fuente===fuenteFil)&&
    (!encuestaFil||(encuestaFil==='con'?ev.puntaje!=null:ev.puntaje==null))&&
    (evTabActual==='all'
      ||(evTabActual==='pend'&&ev.puntaje==null)
      ||(evTabActual==='top'&&ev.puntaje!=null&&ev.puntaje>=4.5)
      ||(evTabActual==='low'&&ev.puntaje!=null&&ev.puntaje<4.5))
  );
}

function filtrarEventos(){
  const filtrados=eventosFiltrados();
  document.getElementById('ev-badge').textContent=`${filtrados.length} evento${filtrados.length!==1?'s':''}`;
  renderEventosTabla(filtrados);
}

function filtrarEventosTab(tab,btn){
  evTabActual=tab;
  document.querySelectorAll('.ev-tab').forEach(b=>b.classList.remove('active'));
  btn?.classList.add('active');
  filtrarEventos();
}

function exportarEventosExcel(){
  if(typeof XLSX==='undefined'){ toast('No se pudo cargar el generador de Excel',true); return; }
  const filtrados=eventosFiltrados();
  if(!filtrados.length){ toast('No hay eventos para exportar con este filtro',true); return; }
  const filas=filtrados.map(e=>({
    Evento:e.evento,
    Fecha:fmt(e.fecha),
    Fuente:e.fuente,
    Asistentes:e.asistentes,
    Puntaje:e.puntaje!=null?e.puntaje:'',
    Respuestas:e.respuestas!=null?e.respuestas:'',
    Comentario:e.comentario||'',
  }));
  const ws=XLSX.utils.json_to_sheet(filas);
  ws['!cols']=[{wch:34},{wch:14},{wch:14},{wch:10},{wch:9},{wch:11},{wch:50}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Eventos');
  XLSX.writeFile(wb,'Eventos.xlsx');
}

function estrellasHtml(puntaje){
  const redondeado=Math.round(puntaje);
  let out='';
  for(let i=1;i<=5;i++) out+=`<i class="ti ${i<=redondeado?'ti-star-filled':'ti-star'}" style="color:var(--amber)"></i>`;
  return `<span style="display:inline-flex;gap:1px;vertical-align:middle;margin-right:6px">${out}</span>${puntaje.toFixed(1)}`;
}

// Mapa fuente → ícono/color del chip que identifica la fuente en cada fila
// y en el header del modal (mismos colores que ya usan los badges de fuente).
const EV_SRC_ICONO={
  'Actividades':{icon:'ti-sparkles',color:'var(--blue)'},
  'Get Together':{icon:'ti-users',color:'var(--purple)'},
};

function renderEventosTabla(filtrados){
  const tb=document.getElementById('ev-tbody');
  if(!tb) return;
  tb.innerHTML=filtrados.map(ev=>{
    const fuenteBadge=ev.fuente==='Get Together'?'badge-purple':'badge-blue';
    const src=EV_SRC_ICONO[ev.fuente]||EV_SRC_ICONO['Actividades'];
    const puntajeHtml=ev.puntaje!=null
      ?estrellasHtml(ev.puntaje)+(ev.respuestas?`<span style="font-size:11px;color:var(--text3);margin-left:6px">(${ev.respuestas} resp.)</span>`:'')
      :'<span class="ev-sin-encuesta-pill"><i class="ti ti-circle-dot"></i>Sin encuesta</span>';
    const comentarioHtml=ev.comentario
      ?`<i class="ti ti-message-circle-2-filled" style="color:var(--blue);margin-left:6px;cursor:default" title="${ev.comentario.replace(/"/g,'&quot;')}"></i>`
      :'';
    const fuenteAttr=ev.fuente.replace(/"/g,'&quot;');
    const eventoAttr=ev.evento.replace(/"/g,'&quot;');
    const btnIcon=ev.puntaje!=null?'ti-pencil':'ti-star';
    const btnClase=ev.puntaje!=null?'':'ev-action-cargar';
    return`<tr class="ev-row" data-fuente="${fuenteAttr}" data-evento="${eventoAttr}" data-fecha="${ev.fecha}" onclick="abrirPuntajeEventoModal(this.dataset.fuente,this.dataset.evento,this.dataset.fecha)" style="cursor:pointer">
      <td><div style="display:flex;align-items:center;gap:11px;min-width:0">
        <div class="ev-src-icon" style="background:color-mix(in srgb,${src.color} 12%,transparent);color:${src.color}"><i class="ti ${src.icon}"></i></div>
        <strong style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ev.evento}</strong>
      </div></td>
      <td style="font-size:12px;color:var(--text2)">${fmt(ev.fecha)}</td>
      <td><span class="badge ${fuenteBadge}">${ev.fuente}</span></td>
      <td style="font-weight:600;color:var(--blue);text-align:right">${ev.asistentes}</td>
      <td>${puntajeHtml}${comentarioHtml}</td>
      <td style="text-align:right"><button class="ev-action-btn ${btnClase}"><i class="ti ${btnIcon}"></i>${ev.puntaje!=null?'Editar':'Cargar puntaje'}</button></td>
    </tr>`;
  }).join('')||`<tr class="empty-row"><td colspan="6">
      <div class="ev-empty">
        <div class="ev-empty-icon"><i class="ti ti-search-off"></i></div>
        <div class="ev-empty-title">Sin eventos que coincidan</div>
        <div class="ev-empty-sub">Ajustá la búsqueda o los filtros</div>
      </div>
    </td></tr>`;
}

// ─── Ventana "Resumen del trimestre" ──────────────────────────────────────────
let evResumenInicializado=false;

function abrirResumenTrimestreModal(){
  poblarSelectorAnio('evq-anio',cacheEventosLista.map(e=>e.fecha).filter(Boolean)
    .map(f=>new Date(f+'T12:00:00').getFullYear()));
  // Arranca en el trimestre en curso, pero si el usuario ya eligió otro se lo
  // respeta al reabrir (mismo criterio que las pestañas de Métricas).
  if(!evResumenInicializado){
    const hoy=new Date();
    const selAnio=document.getElementById('evq-anio');
    const selQ=document.getElementById('evq-trimestre');
    if(selAnio) selAnio.value=String(hoy.getFullYear());
    if(selQ) selQ.value=String(Math.floor(hoy.getMonth()/3)+1);
    evResumenInicializado=true;
  }
  renderResumenTrimestre();
  document.getElementById('ev-resumen-overlay').style.display='flex';
}

function cerrarResumenTrimestreModal(){
  document.getElementById('ev-resumen-overlay').style.display='none';
}

function resumenTrimestreActual(){
  const anio=Number(document.getElementById('evq-anio')?.value)||new Date().getFullYear();
  const q=Number(document.getElementById('evq-trimestre')?.value)||Math.floor(new Date().getMonth()/3)+1;
  return resumenTrimestreEventos(cacheEventosLista,cacheAVRaw,cacheGetTogetherRaw,cachePersonasRaw,anio,q);
}

function renderResumenTrimestre(){
  const cont=document.getElementById('ev-resumen-body');
  if(!cont) return;
  const r=resumenTrimestreActual();
  document.getElementById('ev-resumen-subtitulo').textContent=r.etiqueta;

  if(!r.totalEventos){
    cont.innerHTML=`<div class="ev-empty">
      <div class="ev-empty-icon"><i class="ti ti-calendar-off"></i></div>
      <div class="ev-empty-title">Sin eventos en ${r.etiqueta}</div>
      <div class="ev-empty-sub">Probá con otro trimestre</div>
    </div>`;
    return;
  }

  const kpi=(label,valor,sub,color)=>`<div class="evq-kpi">
    <div class="evq-kpi-label">${label}</div>
    <div class="evq-kpi-val" style="color:${color}">${valor}</div>
    <div class="evq-kpi-sub">${sub}</div>
  </div>`;

  const fuentes=Object.entries(r.porFuente).map(([f,d])=>{
    const badge=f==='Get Together'?'badge-purple':'badge-blue';
    return `<span class="badge ${badge}">${f}: ${d.eventos} · ${d.asistencias} asist.</span>`;
  }).join(' ');

  cont.innerHTML=`
    <div class="evq-kpis">
      ${kpi('Eventos',r.totalEventos,fuentes||'—','var(--blue)')}
      ${kpi('Asistencias',r.asistencias,`${r.personasUnicas} persona${r.personasUnicas!==1?'s':''} distinta${r.personasUnicas!==1?'s':''}`,'var(--purple)')}
      ${kpi('Participación',r.pctParticipacion!=null?`${r.pctParticipacion}%`:'—',`${r.activos} activos al cierre`,'var(--green)')}
      ${kpi('Satisfacción',r.promedio!=null?r.promedio.toFixed(2):'—',r.conEncuesta?`sobre ${r.conEncuesta} con encuesta`:'sin encuestas cargadas','var(--amber)')}
    </div>

    <div class="evq-destacados">
      ${r.masConvocante?`<div class="evq-destacado"><i class="ti ti-users" style="color:var(--blue)"></i>
        <div><div class="evq-destacado-label">Más convocante</div>
        <div class="evq-destacado-val">${r.masConvocante.evento}</div>
        <div class="evq-destacado-sub">${r.masConvocante.asistentes} asistentes · ${fmt(r.masConvocante.fecha)}</div></div></div>`:''}
      ${r.mejorPuntuado?`<div class="evq-destacado"><i class="ti ti-star-filled" style="color:var(--amber)"></i>
        <div><div class="evq-destacado-label">Mejor puntuado</div>
        <div class="evq-destacado-val">${r.mejorPuntuado.evento}</div>
        <div class="evq-destacado-sub">${r.mejorPuntuado.puntaje.toFixed(1)}/5 · ${fmt(r.mejorPuntuado.fecha)}</div></div></div>`:''}
    </div>

    <div class="evq-seccion-titulo">Los ${r.totalEventos} evento${r.totalEventos!==1?'s':''} del trimestre</div>
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>Evento</th><th>Fecha</th><th style="text-align:right">Asist.</th><th>Puntaje</th></tr></thead>
        <tbody>${r.eventos.map(e=>`<tr>
          <td><strong>${e.evento}</strong>${e.comentario?`<i class="ti ti-message-2" style="color:var(--blue);margin-left:6px" title="${e.comentario.replace(/"/g,'&quot;')}"></i>`:''}</td>
          <td style="font-size:12px;color:var(--text2)">${fmt(e.fecha)}</td>
          <td style="text-align:right;font-weight:600;color:var(--blue)">${e.asistentes}</td>
          <td>${e.puntaje!=null
            ?`<strong>${e.puntaje.toFixed(1)}</strong>${e.respuestas?`<span style="font-size:11px;color:var(--text3)"> (${e.respuestas} resp.)</span>`:''}`
            :'<span class="ev-sin-encuesta-pill"><i class="ti ti-circle-dot"></i>Sin encuesta</span>'}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>

    ${r.comentarios.length?`<div class="evq-seccion-titulo">Comentarios destacados</div>
      ${r.comentarios.map(c=>`<div class="evq-quote">
        <div class="evq-quote-txt">"${c.comentario}"</div>
        <div class="evq-quote-meta">${c.evento} · ${fmt(c.fecha)}</div>
      </div>`).join('')}`:''}

    ${r.sinEncuesta?`<div class="evq-aviso"><i class="ti ti-circle-dot"></i>${r.sinEncuesta===1?'Queda 1 evento':`Quedan ${r.sinEncuesta} eventos`} sin encuesta cargada en este trimestre.</div>`:''}
  `;
}

async function copiarResumenTrimestre(){
  const texto=textoResumenTrimestre(resumenTrimestreActual());
  try{
    await navigator.clipboard.writeText(texto);
    toast('✅ Resumen copiado');
  }catch(e){
    // clipboard falla sin HTTPS o sin permiso — fallback al textarea oculto
    const ta=document.createElement('textarea');
    ta.value=texto;
    ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);
    ta.select();
    const ok=document.execCommand&&document.execCommand('copy');
    document.body.removeChild(ta);
    toast(ok?'✅ Resumen copiado':'No se pudo copiar — seleccioná el texto a mano',!ok);
  }
}

// ─── Modal "Cargar/editar puntaje" ────────────────────────────────────────────
// El puntaje sale de PROMEDIAR las respuestas de la encuesta post-evento, así
// que rara vez es un entero (ej. 4.5, 3.8) — por eso conviven dos formas de
// cargarlo: 5 estrellas clickeables (para el caso común de un entero) y el
// input numérico de al lado (para cuando hay que afinar con un decimal).
let evPuntajeActual=null; // {fuente, evento, fecha, asistentes} del evento con el modal abierto

function abrirPuntajeEventoModal(fuente,evento,fecha){
  const existente=cacheEventosLista.find(e=>e.fuente===fuente&&e.evento===evento&&e.fecha===fecha);
  evPuntajeActual={fuente,evento,fecha,asistentes:existente?.asistentes||0};

  const src=EV_SRC_ICONO[fuente]||EV_SRC_ICONO['Actividades'];
  document.getElementById('ev-puntaje-titulo').textContent=evento;
  document.getElementById('ev-puntaje-src-icon').className=`ti ${src.icon}`;
  document.getElementById('ev-puntaje-fuente-label').textContent=fuente;
  document.getElementById('ev-puntaje-fecha-label').textContent=fmt(fecha);
  document.getElementById('ev-puntaje-asistentes-label').textContent=`${evPuntajeActual.asistentes} asistentes`;

  document.getElementById('ev-puntaje-valor').value=existente?.puntaje??'';
  document.getElementById('ev-puntaje-respuestas').value=existente?.respuestas??'';
  document.getElementById('ev-puntaje-comentario').value=existente?.comentario??'';
  document.getElementById('ev-puntaje-btn-borrar').style.display=existente?.puntaje!=null?'flex':'none';
  actualizarPreviewPuntaje();
  actualizarTasaRespuesta();
  document.getElementById('ev-puntaje-overlay').style.display='flex';
}

function cerrarPuntajeEventoModal(){
  document.getElementById('ev-puntaje-overlay').style.display='none';
  evPuntajeActual=null;
}

// Fija el puntaje al hacer click en una de las 5 estrellas — solo permite
// enteros; para un decimal (ej. 4.5) hay que escribirlo en el input de al lado.
function setEstrellaModal(valor){
  const input=document.getElementById('ev-puntaje-valor');
  if(input) input.value=valor;
  actualizarPreviewPuntaje();
}

// Pinta las 5 estrellas del picker según el valor actual del input — mismo
// umbral que estrellasHtml()/starRow() (>=i-0.4) para que un 4.5 se vea con
// la 5ta estrella todavía apagada, no a mitad de camino.
function actualizarPreviewPuntaje(){
  const valor=Number(document.getElementById('ev-puntaje-valor')?.value)||null;
  document.querySelectorAll('#ev-puntaje-estrellas .ev-star-btn').forEach((btn,idx)=>{
    const on=valor!=null&&valor>=(idx+1)-0.4;
    btn.classList.toggle('filled',on);
    const icon=btn.querySelector('i');
    if(icon) icon.className=`ti ${on?'ti-star-filled':'ti-star'}`;
  });
}

// Respuestas de la encuesta sobre el total de asistentes al evento — solo
// informativo, no se guarda (Respuestas ya es el dato que se persiste).
function actualizarTasaRespuesta(){
  const el=document.getElementById('ev-puntaje-tasa');
  if(!el||!evPuntajeActual) return;
  const resp=Number(document.getElementById('ev-puntaje-respuestas')?.value)||0;
  const asistentes=evPuntajeActual.asistentes||0;
  if(!resp||!asistentes){ el.textContent='—'; el.style.color='var(--text2)'; return; }
  const pct=Math.round((resp/asistentes)*100);
  el.textContent=`${pct}%`;
  el.style.color=pct>=50?'var(--green)':'var(--amber)';
}

function feedbackRawDe(fuente,evento,fecha){
  return cacheEventosFeedbackRaw.find(r=>(r.fields.Fuente||'')===fuente&&(r.fields.Evento||'')===evento&&(r.fields.Fecha||'')===fecha);
}

async function guardarPuntajeEvento(){
  if(!evPuntajeActual) return;
  const valor=Number(document.getElementById('ev-puntaje-valor')?.value);
  if(!valor||valor<1||valor>5){ toast('Ingresá un puntaje entre 1 y 5 (puede tener decimales)',true); return; }
  const {fuente,evento,fecha}=evPuntajeActual;
  const respuestas=document.getElementById('ev-puntaje-respuestas')?.value;
  const comentario=(document.getElementById('ev-puntaje-comentario')?.value||'').trim();
  const fields={Fuente:fuente,Evento:evento,Fecha:fecha,Puntaje:valor,Comentario:comentario};
  if(respuestas) fields.Respuestas=Number(respuestas);

  const existenteRaw=feedbackRawDe(fuente,evento,fecha);
  try{
    if(existenteRaw) await atPatch(`Eventos Feedback/${existenteRaw.id}`,fields);
    else await atPost('Eventos Feedback',fields);
  }catch(e){
    toast('Error al guardar: '+e.message,true);
    return;
  }
  toast('✅ Puntaje guardado');
  cerrarPuntajeEventoModal();
  await recargarFeedbackEventos();
}

async function borrarPuntajeEvento(){
  if(!evPuntajeActual) return;
  const {fuente,evento,fecha}=evPuntajeActual;
  const existenteRaw=feedbackRawDe(fuente,evento,fecha);
  if(!existenteRaw) return;
  if(!confirm('¿Borrar el puntaje cargado para este evento?')) return;
  try{
    await atDelete('Eventos Feedback',existenteRaw.id);
  }catch(e){
    toast('Error al borrar: '+e.message,true);
    return;
  }
  toast('✅ Puntaje borrado');
  cerrarPuntajeEventoModal();
  await recargarFeedbackEventos();
}
