// ─── EVENTOS (histórico + satisfacción) ───────────────────────────────────────
// Junta el histórico de "Asistencia a Actividades" y "Get Together" en una
// sola lista de eventos (no se cargan eventos sueltos acá — siempre salen de
// esas dos fuentes) y le suma el nivel de satisfacción que sale de la
// encuesta que se manda post-evento solo a quienes asistieron. Ese puntaje
// vive en una tabla aparte ("Eventos Feedback": Evento, Fecha, Fuente,
// Puntaje 1-5, Respuestas) porque ninguna de las dos tablas de asistencia
// tiene ni va a tener ese dato.

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
    };
  });

  const lista=[
    ...Object.values(avMapa).map(e=>({fuente:'Actividades',evento:e.evento,fecha:e.fecha,asistentes:e.asistentes.length})),
    ...Object.values(gtMapa).map(e=>({fuente:'Get Together',evento:e.evento,fecha:e.fecha,asistentes:e.asistentes.length})),
  ].map(ev=>{
    const fb=feedbackPorClave[`${ev.fuente}|${ev.evento}|${ev.fecha}`];
    return {...ev,puntaje:fb?fb.puntaje:null,respuestas:fb?fb.respuestas:null};
  });

  lista.sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
  return lista;
}

async function loadEventos(){
  const [dAV,dGT,dFB]=await Promise.all([
    atGet('Asistencia a Actividades').catch(()=>({records:[]})),
    atGet('Get Together').catch(()=>({records:[]})),
    atGet('Eventos Feedback').catch(()=>({records:[]})),
  ]);

  // Resuelve linked records de forma independiente (no asume que ya están
  // resueltas en cacheAVRaw/cacheGetTogetherRaw — Eventos puede ser la
  // primera sección que se visita en la sesión), mismo criterio que ya usan
  // actividades-virtuales.js/get-together.js.
  const avRows=(dAV.records||[]).map(r=>{
    const f={...r.fields};
    if(Array.isArray(f.Persona)){
      const match=cachePersonasRaw.find(p=>p.id===f.Persona[0]);
      f.Persona=match?match.fields.Nombre:f.Persona[0];
    }
    return {...r,fields:f};
  });
  const gtRows=(dGT.records||[]).map(r=>{
    const f={...r.fields};
    if(Array.isArray(f.BEONer)){
      const match=cachePersonasRaw.find(p=>p.id===f.BEONer[0]);
      f.BEONer=match?match.fields.Nombre:f.BEONer[0];
    }
    if(Array.isArray(f.Ciudad)) f.Ciudad=f.Ciudad[0]||'';
    if(Array.isArray(f['País'])) f['País']=f['País'][0]||'';
    return {...r,fields:f};
  });

  cacheEventosFeedbackRaw=dFB.records||[];
  cacheEventosLista=combinarEventos(avRows,gtRows,cacheEventosFeedbackRaw);

  renderEventosKpis();
  filtrarEventos();
}

function renderEventosKpis(){
  const total=cacheEventosLista.length;
  document.getElementById('ev-total').textContent=total;

  const conPuntaje=cacheEventosLista.filter(e=>e.puntaje!=null);
  const prom=conPuntaje.length?conPuntaje.reduce((s,e)=>s+e.puntaje,0)/conPuntaje.length:null;
  document.getElementById('ev-prom-satisfaccion').textContent=prom!=null?`${prom.toFixed(1)}★`:'—';
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

function filtrarEventos(){
  const q=(document.getElementById('ev-search')?.value||'').toLowerCase();
  const fuenteFil=document.getElementById('ev-fuente')?.value||'';
  const encuestaFil=document.getElementById('ev-encuesta')?.value||'';
  const filtrados=cacheEventosLista.filter(ev=>
    (!q||ev.evento.toLowerCase().includes(q))&&
    (!fuenteFil||ev.fuente===fuenteFil)&&
    (!encuestaFil||(encuestaFil==='con'?ev.puntaje!=null:ev.puntaje==null))
  );
  document.getElementById('ev-badge').textContent=`${filtrados.length} evento${filtrados.length!==1?'s':''}`;
  renderEventosTabla(filtrados);
}

function estrellasHtml(puntaje){
  const redondeado=Math.round(puntaje);
  let out='';
  for(let i=1;i<=5;i++) out+=`<i class="ti ${i<=redondeado?'ti-star-filled':'ti-star'}" style="color:var(--amber)"></i>`;
  return `<span style="display:inline-flex;gap:1px;vertical-align:middle;margin-right:6px">${out}</span>${puntaje.toFixed(1)}`;
}

function renderEventosTabla(filtrados){
  const tb=document.getElementById('ev-tbody');
  if(!tb) return;
  tb.innerHTML=filtrados.map((ev,idx)=>{
    const bg=idx%2===0?'background:var(--bg2)':'';
    const fuenteBadge=ev.fuente==='Get Together'?'badge-purple':'badge-blue';
    const puntajeHtml=ev.puntaje!=null
      ?estrellasHtml(ev.puntaje)+(ev.respuestas?`<span style="font-size:11px;color:var(--text3);margin-left:6px">(${ev.respuestas} resp.)</span>`:'')
      :'<span style="color:var(--text3);font-size:12px">— Sin encuesta</span>';
    return`<tr style="${bg}">
      <td><strong>${ev.evento}</strong></td>
      <td style="font-size:12px;color:var(--text2)">${fmt(ev.fecha)}</td>
      <td><span class="badge ${fuenteBadge}">${ev.fuente}</span></td>
      <td style="font-weight:600;color:var(--blue)">${ev.asistentes}</td>
      <td>${puntajeHtml}</td>
      <td style="text-align:right"><button onclick="abrirPuntajeEventoModal(this.dataset.fuente,this.dataset.evento,this.dataset.fecha)" data-fuente="${ev.fuente.replace(/"/g,'&quot;')}" data-evento="${ev.evento.replace(/"/g,'&quot;')}" data-fecha="${ev.fecha}" style="background:none;border:1px solid var(--border);border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;color:var(--text2);cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;">${ev.puntaje!=null?'Editar':'Cargar'} puntaje</button></td>
    </tr>`;
  }).join('')||'<tr class="empty-row"><td colspan="6">Sin resultados</td></tr>';
}

// ─── Modal "Cargar/editar puntaje" ────────────────────────────────────────────
// El puntaje sale de PROMEDIAR las respuestas de la encuesta post-evento, así
// que rara vez es un entero (ej. 4.5, 3.8) — por eso es un input numérico con
// vista previa de estrellas (relleno parcial vía overlay), no estrellas
// clickeables de a una (que solo permitirían enteros de 1 a 5).
let evPuntajeActual=null; // {fuente, evento, fecha} del evento con el modal abierto

function abrirPuntajeEventoModal(fuente,evento,fecha){
  const existente=cacheEventosLista.find(e=>e.fuente===fuente&&e.evento===evento&&e.fecha===fecha);
  evPuntajeActual={fuente,evento,fecha};
  document.getElementById('ev-puntaje-titulo').textContent=evento;
  document.getElementById('ev-puntaje-subtitulo').textContent=`${fuente} · ${fmt(fecha)}`;
  document.getElementById('ev-puntaje-valor').value=existente?.puntaje??'';
  document.getElementById('ev-puntaje-respuestas').value=existente?.respuestas??'';
  document.getElementById('ev-puntaje-btn-borrar').style.display=existente?.puntaje!=null?'block':'none';
  actualizarPreviewPuntaje();
  document.getElementById('ev-puntaje-overlay').style.display='flex';
}

function cerrarPuntajeEventoModal(){
  document.getElementById('ev-puntaje-overlay').style.display='none';
  evPuntajeActual=null;
}

// Relleno parcial de las estrellas por porcentaje (no por estrella entera) —
// así un puntaje como 4.5 se ve con la quinta estrella a la mitad, en vez de
// redondear a 4 o 5 llenas.
function actualizarPreviewPuntaje(){
  const fill=document.getElementById('ev-puntaje-preview-fill');
  if(!fill) return;
  const valor=Number(document.getElementById('ev-puntaje-valor')?.value)||0;
  const pct=Math.max(0,Math.min(100,valor/5*100));
  fill.style.width=`${pct}%`;
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
  const fields={Fuente:fuente,Evento:evento,Fecha:fecha,Puntaje:valor};
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
  await loadEventos();
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
  await loadEventos();
}
