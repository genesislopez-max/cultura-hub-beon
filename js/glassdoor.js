function filtrarReviews(){
  if(!document.getElementById('tbody-reviews')) return;
  const q=(document.getElementById('reviews-search')?.value||'').toLowerCase();
  const manager=document.getElementById('reviews-manager')?.value||'';
  const estado=document.getElementById('reviews-estado')?.value||'';
  const tb=document.getElementById('tbody-reviews');
  if(!tb) return;
  let count=0;
  tb.querySelectorAll('tr').forEach(tr=>{
    if(tr.classList.contains('empty-row')){tr.style.display='none';return;}
    const cells=[...tr.querySelectorAll('td')].map(td=>td.textContent.toLowerCase());
    const persona=cells[0]||'', mgr=cells[1]||'', estadoCell=cells[4]||'';
    const matchQ=!q||persona.includes(q);
    const matchMgr=!manager||mgr.includes(manager.toLowerCase());
    const matchEst=!estado||estadoCell.includes(estado.toLowerCase());
    const visible=matchQ&&matchMgr&&matchEst;
    tr.style.display=visible?'':'none';
    if(visible) count++;
  });
  let emptyRow=tb.querySelector('.empty-row');
  if(count===0){
    if(!emptyRow){emptyRow=document.createElement('tr');emptyRow.className='empty-row';emptyRow.innerHTML='<td colspan="5">Sin resultados</td>';tb.appendChild(emptyRow);}
    emptyRow.style.display='';
  } else if(emptyRow){ emptyRow.style.display='none'; }
}
function poblarFiltrosReviews(){
  const tb=document.getElementById('tbody-reviews');
  if(!tb) return;
  const managers=[...new Set([...tb.querySelectorAll('tr:not(.empty-row) td:nth-child(2)')].map(td=>td.textContent.trim()).filter(Boolean))].sort();
  const sel=document.getElementById('reviews-manager');
  if(sel) sel.innerHTML='<option value="">Todos los managers</option>'+managers.map(m=>`<option value="${m}">${m}</option>`).join('');
}
// Reminders de Glassdoor ("Sincronizar Glassdoor" abajo) y reminders manuales
// sueltos viven los dos en la tabla Eventos — antes tenían una pestaña propia
// ("Reminders") que terminaba duplicando esta, así que quedaron acá.
async function loadReviews(){
  const hoy=new Date();hoy.setHours(0,0,0,0);

  const d=await atGet('Eventos','&sort[0][field]=Fecha&sort[0][direction]=asc');
  const allRecs=d.records||[];

  // Cumpleaños/Aniversarios tienen su propia sección — acá quedan Glassdoor y manuales
  const recs=allRecs.filter(r=>!['Cumpleaños','Aniversario'].includes(r.fields.Tipo));

  // Auto-completar si la fecha ya pasó
  for(const r of recs){
    if(r.fields.Estado==='Pendiente'&&r.fields.Fecha){
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
  const pendientes=gdRecs.filter(r=>r.fields.Estado!=='Completado'&&r.fields.Estado!=='Solicitada');
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
    return `<div class="sc-list-item">• ${nombre}</div>`;
  }).join('');
  moreEl.style.display=pendientes.length>5?'block':'none';

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
        style="border:none;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;background:${completado?'#D1FAE5':'#FEF3C7'};color:${completado?'#065F46':'#92400E'};">
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

function filtrarGD(){
  const q=(document.getElementById('gd-search')?.value||'').toLowerCase();
  const estadoFil=document.getElementById('gd-estado')?.value||'';
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const filtrados=cacheGDRecs.filter(r=>{
    const nombre=(r.fields.Evento||'').toLowerCase();
    const estado=(r.fields.Estado||'Pendiente').toLowerCase();
    const matchQ=!q||nombre.includes(q);
    const matchE=!estadoFil||(estadoFil==='pendiente'&&estado!=='completado')||(estadoFil==='solicitada'&&estado==='completado');
    return matchQ&&matchE;
  }).sort((a,b)=>(a.fields.Fecha||'').localeCompare(b.fields.Fecha||''));
  const tb=document.getElementById('tbody-glassdoor');
  if(!tb) return;
  const hoy2=new Date();hoy2.setHours(0,0,0,0);
  tb.innerHTML=filtrados.map((r,idx)=>{
    const f=r.fields;
    const nombre=(f.Evento||'').replace(/[^—]+—\s*/,'').trim()||f.Evento||'—';
    const solicitada=f.Estado==='Completado'||f.Estado==='Solicitada';
    const diasRestantes=f.Fecha?Math.round((new Date(f.Fecha+'T12:00:00')-hoy2)/86400000):null;
    let diasStr='';
    if(!solicitada&&diasRestantes!==null){
      if(diasRestantes<0) diasStr='<span style="color:#C62828;font-size:11px"> · vencida</span>';
      else if(diasRestantes===0) diasStr='<span style="color:#C62828;font-weight:600;font-size:11px"> · Hoy</span>';
      else if(diasRestantes<=30) diasStr=`<span style="color:#E65100;font-size:11px"> · en ${diasRestantes}d</span>`;
    }
    const bg=idx%2===0?'background:var(--bg2)':'';
    const fechaSol=f['Fecha solicitada']||f['fecha_solicitada']||f['FechaSolicitada']||'';
    return`<tr class="tr-clickable" style="${bg};opacity:${solicitada?'0.65':'1'}" onclick="openGDModal('${r.id}')">
      <td>${avH(nombre)}${nombre}</td>
      <td style="font-size:12px;color:var(--text2)">${fmt(f.Fecha)}${diasStr}</td>
      <td><span class="badge ${solicitada?'badge-green':'badge-amber'}">${solicitada?'Solicitada':'Pendiente'}</span></td>
      <td style="font-size:12px;color:var(--text2)">${fechaSol?fmt(fechaSol):'—'}</td>
      <td onclick="event.stopPropagation()">${!solicitada?`<button onclick="marcarGDSolicitada('${r.id}')" style="background:none;border:1px solid var(--border);border-radius:7px;padding:4px 10px;font-size:12px;font-weight:600;color:var(--blue);cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;">Solicitada</button>`:''}</td>
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
