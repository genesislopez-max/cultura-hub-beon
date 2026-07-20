// Reminders de Glassdoor ("Sincronizar Glassdoor" abajo) y reminders manuales
// sueltos viven los dos en la tabla Eventos — antes tenían una pestaña propia
// ("Reminders") que terminaba duplicando esta, así que quedaron acá.
async function loadReviews(){
  // Ancla al mediodía (no medianoche) para que coincida con el T12:00:00 con el
  // que se parsean las fechas de los eventos — si no, un evento de hoy queda a
  // 12hs de diferencia y Math.round() lo redondea a "en 1 día" en vez de "Hoy".
  const hoy=new Date();hoy.setHours(12,0,0,0);

  const d=await atGet('Eventos','&sort[0][field]=Fecha&sort[0][direction]=asc');
  const allRecs=d.records||[];

  // Cumpleaños/Aniversarios tienen su propia sección — acá quedan Glassdoor y manuales
  const recs=allRecs.filter(r=>!['Cumpleaños','Aniversario'].includes(r.fields.Tipo));

  // Auto-completar si la fecha ya pasó — solo para reminders manuales (no
  // Glassdoor). Un Glassdoor vencido NO se marca solo como "Completado"
  // (Solicitada): que la fecha sugerida haya pasado no significa que se haya
  // pedido — para eso ya está el indicador "· vencida" en filtrarGD(), y la
  // persona sigue en "pendientes" hasta que alguien la marque a mano.
  for(const r of recs){
    if(r.fields.Tipo!=='Glassdoor'&&r.fields.Estado==='Pendiente'&&r.fields.Fecha){
      if(new Date(r.fields.Fecha+'T12:00:00')<hoy){
        await atPatch(`Eventos/${r.id}`,{Estado:'Completado'}).catch(()=>{});
        r.fields.Estado='Completado';
      }
    }
  }

  // Solo Engineers — cruzar con cachePersonasRaw
  const engineerNames=new Set(
    cachePersonasRaw.filter(p=>(p.fields['Rol en empresa']||'').trim()==='Engineer').map(p=>(p.fields.Nombre||'').trim())
  );
  const gdRecs=recs.filter(r=>{
    if(r.fields.Tipo!=='Glassdoor') return false;
    const nombre=(r.fields.Evento||'').replace(/.*—\s*/,'').trim();
    return !nombre||engineerNames.size===0||engineerNames.has(nombre);
  });
  cacheGDRecs=gdRecs;
  cacheOtrosReminders=recs.filter(r=>r.fields.Tipo!=='Glassdoor');

  // Métricas
  const pendientes=gdRecs.filter(r=>!['Completado','Solicitada','No aplica'].includes(r.fields.Estado));
  document.getElementById('rv-gd-pend').textContent=pendientes.length;
  document.getElementById('rv-badge-gd').textContent=`${gdRecs.length} engineers`;
  const badgeOtros=document.getElementById('badge-otros-reminders');
  if(badgeOtros) badgeOtros.textContent=`${cacheOtrosReminders.length} reminders`;

  // Próxima a solicitar
  const proximasOrd=pendientes.slice().sort((a,b)=>(a.fields.Fecha||'').localeCompare(b.fields.Fecha||''));
  const proxima=proximasOrd[0];
  if(proxima){
    const nombre=(proxima.fields.Evento||'').replace(/.*—\s*/,'').trim();
    const dias=proxima.fields.Fecha?Math.round((new Date(proxima.fields.Fecha+'T12:00:00')-hoy)/86400000):null;
    document.getElementById('rv-gd-prox').textContent=nombre;
    document.getElementById('rv-gd-prox-dias').textContent=dias===0?'¡Hoy!':dias===1?'Mañana':dias!==null?`en ${dias} días`:'sin fecha';
  } else {
    document.getElementById('rv-gd-prox').textContent='—';
    document.getElementById('rv-gd-prox-dias').textContent='al día';
  }

  // Card de Inicio
  document.getElementById('sc-glassdoor').textContent=pendientes.length;
  const listEl=document.getElementById('sc-list-glassdoor');
  const moreEl=document.getElementById('sc-more-glassdoor');
  listEl.innerHTML=proximasOrd.slice(0,5).map(r=>{
    const nombre=(r.fields.Evento||'').replace(/.*—\s*/,'').trim()||r.fields.Evento||'—';
    return `<div class="sc-list-item">${avH(nombre)}<span class="sc-list-item-name">${nombre}</span></div>`;
  }).join('');
  moreEl.style.display=pendientes.length>5?'flex':'none';

  poblarGDManagers();
  filtrarGD();
  renderOtrosReminders();
}

// ─── OTROS REMINDERS (manuales, no-Glassdoor) ────────────────────────────────
function rowReminder(r,idx){
  const f=r.fields;
  const completado=f.Estado==='Completado';
  const bg=idx%2===0?'background:var(--bg2)':'background:var(--bg)';
  return`<tr style="opacity:${completado?'0.5':'1'};${bg}">
    <td style="font-weight:500">${f.Evento||'—'}</td>
    <td style="font-size:12px;color:var(--text2)">${fmt(f.Fecha)}</td>
    <td>
      <button onclick="toggleEventoEstado('${r.id}','${f.Estado||'Pendiente'}')"
        style="border:none;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;background:${completado?'var(--chip-green-bg)':'var(--chip-amber-bg)'};color:${completado?'var(--chip-green-text)':'var(--chip-amber-text)'};"
        ${completado?'✓ Listo':'Pendiente'}
      </button>
    </td>
  </tr>`;
}

function renderOtrosReminders(){
  const container=document.getElementById('eventos-container');
  if(!container) return;
  if(!cacheOtrosReminders.length){
    container.innerHTML='<div style="padding:32px;text-align:center;color:var(--text3);font-size:13px;">No hay otros reminders. Usá "+Nuevo reminder" para agregar uno manual.</div>';
    return;
  }
  const ord=[...cacheOtrosReminders].sort((a,b)=>(a.fields.Estado==='Completado'?1:0)-(b.fields.Estado==='Completado'?1:0));
  container.innerHTML=`<table class="data-table"><thead><tr><th>Evento</th><th>Fecha</th><th>Estado</th></tr></thead>
    <tbody>${ord.map((r,i)=>rowReminder(r,i)).join('')}</tbody></table>`;
}

async function toggleEventoEstado(id,estadoActual){
  const nuevo=estadoActual==='Completado'?'Pendiente':'Completado';
  await atPatch(`Eventos/${id}`,{Estado:nuevo}).catch(()=>{});
  await loadReviews();
}

function filtrarReminders(){
  const q=(document.getElementById('reminders-search')?.value||'').toLowerCase();
  const estado=document.getElementById('reminders-estado')?.value||'';
  document.querySelectorAll('#eventos-container tr').forEach(tr=>{
    if(tr.closest('thead')) return;
    const texto=tr.textContent.toLowerCase();
    const esPendiente=texto.includes('pendiente');
    const esCompletado=texto.includes('listo');
    const matchQ=!q||texto.includes(q);
    const matchEst=!estado||(estado==='pendiente'&&esPendiente)||(estado==='completado'&&esCompletado);
    tr.style.display=matchQ&&matchEst?'':'none';
  });
}

// ─── Sincronización / limpieza de reminders de Glassdoor ─────────────────────
async function sincronizarGlassdoor(){
  const btn=document.getElementById('btn-sync-reminders');
  btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> Sincronizando...';

  const [personasData,eventosData]=await Promise.all([
    atGet('Personas','&sort[0][field]=Nombre&sort[0][direction]=asc').catch(()=>({records:[]})),
    atGet('Eventos').catch(()=>({records:[]}))
  ]);

  const personas=personasData.records||[];
  const eventosExistentes=eventosData.records||[];

  let creados=0,omitidos=0,sinFecha=0,noAplica=0;

  for(const p of personas){
    const f=p.fields;
    const nombre=(f.Nombre||'').trim();
    if(!nombre){omitidos++;continue;}

    const rol=(f['Rol en empresa']||'').trim();
    if(rol!=='Engineer'){noAplica++;continue;}

    const fechaIngreso=f['Fecha de ingreso']||'';

    const eventosPer=eventosExistentes.filter(e=>(e.fields.Evento||'').includes(nombre));
    const tieneGlass=eventosPer.some(e=>(e.fields.Evento||'').toLowerCase().includes('glassdoor'));

    if(fechaIngreso){
      const ing=new Date(fechaIngreso+'T12:00:00');
      const hoy=new Date();

      if(!tieneGlass){
        const gdDate=new Date(ing);gdDate.setMonth(gdDate.getMonth()+4);
        if(gdDate>=hoy){
          try{
            const fechaGd=gdDate.toISOString().split('T')[0];
            await atPost('Eventos',{Evento:`📝 Review Glassdoor — ${nombre}`,Tipo:'Glassdoor',Fecha:fechaGd,Estado:'Pendiente'});
            creados++;
            sendSlack(`📝 *Reminder de Glassdoor creado*\n${nombre} — a solicitar el ${fmt(fechaGd)}`);
          }catch(e){console.error('GD error',nombre,e.message);}
        } else { omitidos++; }
      } else { omitidos++; }
    } else { sinFecha++; }
  }

  btn.disabled=false;btn.innerHTML='<i class="ti ti-refresh"></i> Sincronizar Glassdoor';
  const msg=`✅ Glassdoor sincronizado: ${creados} reminders creados, ${omitidos} ya existían o ya vencieron${sinFecha?' · '+sinFecha+' sin fecha de ingreso':''}${noAplica?' · '+noAplica+' omitidos (no son Engineers)':''}`;
  toast(msg);
  await loadReviews();
}

async function limpiarGlassdoorCoreTeam(){
  const btn=document.getElementById('btn-clean-reminders');
  btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> Limpiando...';

  const [dEventos,dPersonas]=await Promise.all([
    atGet('Eventos','&filterByFormula=FIND("glassdoor",LOWER({Evento}))').catch(()=>({records:[]})),
    atGet('Personas').catch(()=>({records:[]}))
  ]);

  const engineers=new Set(
    (dPersonas.records||[])
      .filter(p=>(p.fields['Rol en empresa']||'').trim()==='Engineer')
      .map(p=>(p.fields.Nombre||'').trim())
  );

  const aEliminar=(dEventos.records||[]).filter(r=>{
    const evento=r.fields.Evento||'';
    const nombre=evento.replace(/.*—\s*/,'').trim();
    return nombre&&!engineers.has(nombre);
  });

  if(!aEliminar.length){
    toast('✅ No hay reminders de Glassdoor para Core Team — todo limpio.');
    btn.disabled=false;btn.innerHTML='<i class="ti ti-trash"></i> Limpiar Core Team';
    return;
  }

  const confirmado=confirm(`Se van a eliminar ${aEliminar.length} reminder${aEliminar.length!==1?'s':''} de Glassdoor de personas que no son Engineers. ¿Continuar?`);
  if(!confirmado){
    btn.disabled=false;btn.innerHTML='<i class="ti ti-trash"></i> Limpiar Core Team';
    return;
  }

  let eliminados=0;
  for(const r of aEliminar){
    try{
      await atDelete('Eventos',r.id);
      eliminados++;
    }catch(e){console.error('Error eliminando reminder:',r.id,e.message);}
  }

  btn.disabled=false;btn.innerHTML='<i class="ti ti-trash"></i> Limpiar Core Team';
  toast(`✅ ${eliminados} reminder${eliminados!==1?'s':''} de Core Team eliminados.`);
  await loadReviews();
}

// Manager de la persona asociada a un reminder de Glassdoor — el Evento no
// tiene el dato directo, hay que cruzarlo contra Personas por nombre.
function managerDeEventoGD(f){
  const nombre=(f.Evento||'').replace(/.*—\s*/,'').trim();
  const persona=cachePersonasRaw.find(p=>(p.fields.Nombre||'').trim()===nombre);
  return persona?.fields.Manager||'';
}
function poblarGDManagers(){
  const sel=document.getElementById('gd-manager');
  if(!sel) return;
  const actual=sel.value;
  const managers=[...new Set(cacheGDRecs.map(r=>managerDeEventoGD(r.fields)).filter(Boolean))].sort();
  sel.innerHTML='<option value="">Todos los managers</option>'+managers.map(m=>`<option value="${m}"${m===actual?' selected':''}>${m}</option>`).join('');
}
function filtrarGD(){
  const q=(document.getElementById('gd-search')?.value||'').toLowerCase();
  const estadoFil=document.getElementById('gd-estado')?.value||'';
  const managerFil=document.getElementById('gd-manager')?.value||'';
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const filtrados=cacheGDRecs.filter(r=>{
    const nombre=(r.fields.Evento||'').toLowerCase();
    const estado=(r.fields.Estado||'Pendiente').toLowerCase();
    const matchQ=!q||nombre.includes(q);
    const matchE=!estadoFil||(estadoFil==='pendiente'&&estado!=='completado'&&estado!=='no aplica')||(estadoFil==='solicitada'&&estado==='completado')||(estadoFil==='no-aplica'&&estado==='no aplica');
    const matchM=!managerFil||managerDeEventoGD(r.fields)===managerFil;
    return matchQ&&matchE&&matchM;
  }).sort((a,b)=>(a.fields.Fecha||'').localeCompare(b.fields.Fecha||''));
  const tb=document.getElementById('tbody-glassdoor');
  if(!tb) return;
  const hoy2=new Date();hoy2.setHours(12,0,0,0); // ver comentario en loadReviews()
  tb.innerHTML=filtrados.map((r,idx)=>{
    const f=r.fields;
    const nombre=(f.Evento||'').replace(/[^—]+—\s*/,'').trim()||f.Evento||'—';
    const solicitada=f.Estado==='Completado'||f.Estado==='Solicitada';
    const noAplica=f.Estado==='No aplica';
    const diasRestantes=f.Fecha?Math.round((new Date(f.Fecha+'T12:00:00')-hoy2)/86400000):null;
    let diasStr='';
    if(!solicitada&&!noAplica&&diasRestantes!==null){
      if(diasRestantes<0) diasStr='<span style="color:var(--critical);font-size:11px"> · vencida</span>';
      else if(diasRestantes===0) diasStr='<span style="color:var(--critical);font-weight:600;font-size:11px"> · Hoy</span>';
      else if(diasRestantes<=30) diasStr=`<span style="color:var(--warning);font-size:11px"> · en ${diasRestantes}d</span>`;
    }
    const bg=idx%2===0?'background:var(--bg2)':'';
    const fechaSol=f['Fecha solicitada']||f['fecha_solicitada']||f['FechaSolicitada']||'';
    // La fecha sugerida se puede reprogramar siempre (incluso ya solicitada o
    // marcada "No aplica"), para poder corregir un error de carga.
    const fechaTd=`<td style="font-size:12px;color:var(--text2)" onclick="event.stopPropagation()"><input type="date" class="field-input" value="${f.Fecha||''}" onchange="cambiarFechaGD('${r.id}',this.value)" style="width:auto;padding:4px 6px;font-size:12px;">${diasStr}</td>`;
    const estadoTd=noAplica
      ?'<td><span class="badge badge-red">No aplica</span></td>'
      :`<td><span class="badge ${solicitada?'badge-green':'badge-amber'}">${solicitada?'Solicitada':'Pendiente'}</span></td>`;
    let acciones='';
    if(noAplica){
      acciones=`<button onclick="revertirGDNoAplica('${r.id}')" style="background:none;border:1px solid var(--border);border-radius:7px;padding:4px 10px;font-size:12px;font-weight:600;color:var(--text2);cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;">Revertir</button>`;
    } else if(solicitada){
      acciones=`<button onclick="revertirGDSolicitada('${r.id}')" title="Volver a Pendiente y borrar la fecha en que se marcó como solicitada" style="background:none;border:1px solid var(--border);border-radius:7px;padding:4px 10px;font-size:12px;font-weight:600;color:var(--text2);cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;">Revertir a Pendiente</button>`;
    } else {
      acciones=`<button onclick="marcarGDSolicitada('${r.id}')" style="background:none;border:1px solid var(--border);border-radius:7px;padding:4px 10px;font-size:12px;font-weight:600;color:var(--blue);cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;">Solicitada</button>
      <button onclick="marcarGDNoAplica('${r.id}')" title="Se va de la empresa u otro motivo por el que no corresponde pedirla" style="background:none;border:1px solid var(--critical-border);border-radius:7px;padding:4px 10px;font-size:12px;font-weight:600;color:var(--critical);cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;">No aplica</button>`;
    }
    return`<tr class="tr-clickable" style="${bg};opacity:${solicitada||noAplica?'0.65':'1'}" onclick="openGDModal('${r.id}')">
      <td>${avH(nombre)}${nombre}</td>
      ${fechaTd}
      ${estadoTd}
      <td style="font-size:12px;color:var(--text2)">${fechaSol?fmt(fechaSol):'—'}</td>
      <td onclick="event.stopPropagation()">${acciones}</td>
    </tr>`;
  }).join('')||'<tr class="empty-row"><td colspan="5">Sin resultados</td></tr>';
}


function openGDModal(id){
  const rec=cacheGDRecs.find(r=>r.id===id);
  if(!rec) return;
  gdModalId=id;
  const f=rec.fields;
  const nombre=(f.Evento||'').replace(/.*—\s*/,'').trim();

  // Buscar info de la persona en cachePersonasRaw
  const persona=cachePersonasRaw.find(p=>(p.fields.Nombre||'').trim()===nombre);
  const pf=persona?.fields||{};

  document.getElementById('gd-modal-nombre').textContent=nombre;

  // Info de la persona
  let bodyHtml='';
  bodyHtml+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:4px">`;
  bodyHtml+=`<div><div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px">Proyecto</div><div style="font-size:13px">${pf.Proyecto||'—'}</div></div>`;
  bodyHtml+=`<div><div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px">Ingreso</div><div style="font-size:13px">${fmt(pf['Fecha de ingreso'])||'—'}</div></div>`;
  bodyHtml+=`<div><div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px">TEM / Manager</div><div style="font-size:13px">${pf.Manager||'—'}</div></div>`;
  bodyHtml+=`<div><div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px">Fecha a solicitar</div><div style="font-size:13px;font-weight:600;color:var(--blue)">${fmt(f.Fecha)||'—'}</div></div>`;
  bodyHtml+=`</div>`;
  document.getElementById('gd-modal-body').innerHTML=bodyHtml;

  // Fecha solicitada actual
  const fechaSol=f['Fecha solicitada']||'';
  const inputFecha=document.getElementById('gd-modal-fecha');
  inputFecha.value=fechaSol||'';
  const labelFecha=document.getElementById('gd-modal-fecha-actual');
  labelFecha.textContent=fechaSol?`Ya registrada: ${fmt(fechaSol)}`:'';

  document.getElementById('gd-modal-overlay').style.display='flex';
}

function closeGDModal(){
  document.getElementById('gd-modal-overlay').style.display='none';
  gdModalId=null;
}

async function guardarFechaGD(){
  const fecha=document.getElementById('gd-modal-fecha')?.value;
  if(!fecha||!gdModalId){ toast('Ingresá una fecha',true); return; }
  try{
    await atPatch(`Eventos/${gdModalId}`,{Estado:'Completado','Fecha solicitada':fecha});
  }catch(e){
    toast(`⚠️ Error: ${e.message}`,true);
    return;
  }
  // Actualizar cache local
  const rec=cacheGDRecs.find(r=>r.id===gdModalId);
  if(rec){ rec.fields.Estado='Completado'; rec.fields['Fecha solicitada']=fecha; }
  document.getElementById('gd-modal-fecha-actual').textContent=`Ya registrada: ${fmt(fecha)}`;
  toast('✅ Fecha guardada correctamente');
  filtrarGD();
}

async function marcarGDSolicitada(id){
  const hoy=new Date().toISOString().split('T')[0];
  try{
    // Marcar como Completado en Airtable (es el estado válido para "ya gestionada")
    await atPatch(`Eventos/${id}`,{Estado:'Completado','Fecha solicitada':hoy});
  }catch(e){
    toast(`⚠️ Error: ${e.message}`,true);
    return;
  }
  // Actualizar cache local — marcar visualmente como Solicitada
  const rec=cacheGDRecs.find(r=>r.id===id);
  if(rec){ rec.fields.Estado='Completado'; rec.fields['Fecha solicitada']=hoy; }
  toast('✅ Glassdoor review marcada como solicitada');
  filtrarGD();
}

// Reprograma la fecha sugerida cuando el momento original no es bueno
// (ej. la persona está en medio de una entrega) — patchea directo el campo
// Fecha del reminder, sin tocar el Estado.
async function cambiarFechaGD(id,nuevaFecha){
  if(!nuevaFecha) return;
  try{
    await atPatch(`Eventos/${id}`,{Fecha:nuevaFecha});
  }catch(e){
    toast(`⚠️ Error: ${e.message}`,true);
    return;
  }
  const rec=cacheGDRecs.find(r=>r.id===id);
  if(rec) rec.fields.Fecha=nuevaFecha;
  toast('✅ Fecha actualizada');
  filtrarGD();
}

// "No aplica": para cuando avisan que no corresponde pedir la review (ej. la
// persona se va de la empresa) — saca el reminder de "pendientes" sin
// eliminarlo, y queda reversible por si la situación cambia.
async function marcarGDNoAplica(id){
  const rec=cacheGDRecs.find(r=>r.id===id);
  const nombre=rec?(rec.fields.Evento||'').replace(/.*—\s*/,'').trim():'';
  if(!confirm(`¿Marcar como "No aplica" el reminder de Glassdoor de ${nombre||'esta persona'}?`)) return;
  try{
    await atPatch(`Eventos/${id}`,{Estado:'No aplica'});
  }catch(e){
    toast(`⚠️ Error: ${e.message}`,true);
    return;
  }
  if(rec) rec.fields.Estado='No aplica';
  toast('✅ Marcado como "No aplica"');
  filtrarGD();
}

async function revertirGDNoAplica(id){
  try{
    await atPatch(`Eventos/${id}`,{Estado:'Pendiente'});
  }catch(e){
    toast(`⚠️ Error: ${e.message}`,true);
    return;
  }
  const rec=cacheGDRecs.find(r=>r.id===id);
  if(rec) rec.fields.Estado='Pendiente';
  toast('✅ Reminder reactivado');
  filtrarGD();
}

// Para corregir un "Solicitada" que no correspondía (ej. quedó así por el
// auto-completado de fecha vencida, o un click de más) — vuelve a Pendiente
// y borra la Fecha solicitada, ya que no fue algo que realmente se hizo.
async function revertirGDSolicitada(id){
  if(!confirm('¿Volver a "Pendiente"? Se borra la fecha en que se había marcado como solicitada.')) return;
  try{
    await atPatch(`Eventos/${id}`,{Estado:'Pendiente','Fecha solicitada':null});
  }catch(e){
    toast(`⚠️ Error: ${e.message}`,true);
    return;
  }
  const rec=cacheGDRecs.find(r=>r.id===id);
  if(rec){ rec.fields.Estado='Pendiente'; rec.fields['Fecha solicitada']=null; }
  toast('✅ Reminder vuelto a "Pendiente"');
  filtrarGD();
}
