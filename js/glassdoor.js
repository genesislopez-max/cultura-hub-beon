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
async function loadReviews(){
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const año=hoy.getFullYear();

  // Reviews internas
  const d=await atGet('Reviews');
  const recs=d.records||[];
  // Glassdoor desde Eventos
  const dGD=await atGet('Eventos',`&sort[0][field]=Fecha&sort[0][direction]=asc&filterByFormula={Tipo}="Glassdoor"`);
  // Solo Engineers — cruzar con cachePersonasRaw
  const engineerNames=new Set(
    cachePersonasRaw.filter(p=>(p.fields['Rol en empresa']||'').trim()==='Engineer').map(p=>(p.fields.Nombre||'').trim())
  );
  const gdRecs=(dGD.records||[]).filter(r=>{
    // Filtrar por Tipo=Glassdoor (más preciso que buscar en texto)
    if(r.fields.Tipo!=='Glassdoor') return false;
    // Solo Engineers — doble verificación
    const nombre=(r.fields.Evento||'').replace(/.*—\s*/,'').trim();
    return !nombre||engineerNames.size===0||engineerNames.has(nombre);
  });
  cacheGDRecs=gdRecs;

  // Métricas
  const pendientes=gdRecs.filter(r=>r.fields.Estado!=='Completado'&&r.fields.Estado!=='Solicitada');
  document.getElementById('rv-gd-pend').textContent=pendientes.length;
  document.getElementById('rv-badge-gd').textContent=`${gdRecs.length} engineers`;

  // Próxima a solicitar
  const proxima=pendientes.slice().sort((a,b)=>(a.fields.Fecha||'').localeCompare(b.fields.Fecha||''))[0];
  if(proxima){
    const nombre=(proxima.fields.Evento||'').replace(/.*—\s*/,'').trim();
    const dias=proxima.fields.Fecha?Math.round((new Date(proxima.fields.Fecha+'T12:00:00')-hoy)/86400000):null;
    document.getElementById('rv-gd-prox').textContent=nombre;
    document.getElementById('rv-gd-prox-dias').textContent=dias===0?'¡Hoy!':dias===1?'Mañana':dias!==null?`en ${dias} días`:'sin fecha';
  } else {
    document.getElementById('rv-gd-prox').textContent='—';
    document.getElementById('rv-gd-prox-dias').textContent='al día';
  }

  filtrarGD();
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
  if(!fecha||!gdModalId){ toast('Ingresá una fecha',false); return; }
  const result=await fetch(`https://api.airtable.com/v0/${BASE}/Eventos/${gdModalId}`,{
    method:'PATCH',headers:HDR,
    body:JSON.stringify({fields:{Estado:'Completado'}})
  });
  if(!result.ok){
    const err=await result.json();
    toast(`⚠️ Error: ${err.error?.message||result.statusText}`,false);
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
  // Marcar como Completado en Airtable (es el estado válido para "ya gestionada")
  const result=await fetch(`https://api.airtable.com/v0/${BASE}/Eventos/${id}`,{
    method:'PATCH',headers:HDR,
    body:JSON.stringify({fields:{Estado:'Completado'}})
  });
  if(!result.ok){
    const err=await result.json();
    console.error('Error Airtable:',err);
    toast(`⚠️ Error: ${err.error?.message||result.statusText}`,false);
    return;
  }
  // Actualizar cache local — marcar visualmente como Solicitada
  const rec=cacheGDRecs.find(r=>r.id===id);
  if(rec){ rec.fields.Estado='Completado'; rec.fields['Fecha solicitada']=hoy; }
  toast('✅ Glassdoor review marcada como solicitada');
  filtrarGD();
}
