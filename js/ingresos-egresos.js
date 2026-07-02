
// Elimina un ingreso: Checklist + Persona + Eventos relacionados
async function deleteIngreso(checklistId, nombre){
  // 1. Eliminar de Checklist
  await atDelete('Checklist', checklistId).catch(()=>{});

  // 2. Eliminar de Personas (buscar por nombre exacto)
  const pRecs=await atGet('Personas',`&filterByFormula={Nombre}="${nombre.replace(/"/g,'\\"')}"`).then(d=>d.records||[]).catch(()=>[]);
  await atDeleteBatch('Personas', pRecs.map(r=>r.id));

  // 3. Eliminar Eventos que contengan el nombre en el título
  const eRecs=await atGet('Eventos',`&filterByFormula=FIND("${nombre.replace(/"/g,'\\"')}",{Evento})`).then(d=>d.records||[]).catch(()=>[]);
  await atDeleteBatch('Eventos', eRecs.map(r=>r.id));

  // Limpiar estado local
  delete clState[checklistId];
  delete recMeta[checklistId];

  toast(`${nombre} eliminado ✓`);
  await loadAll();
}

// ─── PRE-LLENADO FORMULARIO COMPLETO ─────────────────────────────────────────
// Busca el ingreso HR más reciente sin Mail cargado en Personas
async function getUltimoIngresoHR(){
  try{
    // Tomar los registros de Checklist tipo Ingreso ordenados por fecha desc
    const d=await atGet('Checklist','&filterByFormula={Tipo}="Ingreso"&sort[0][field]=Fecha&sort[0][direction]=desc');
    const recs=(d.records||[]).filter(r=>r.fields.Persona);
    if(!recs.length) return null;
    // Para cada uno, ver si la persona tiene Mail vacío en Personas
    for(const r of recs){
      const nombre=(r.fields.Persona||'').trim();
      const persona=cachePersonasRaw.find(p=>(p.fields.Nombre||'').trim().toLowerCase()===nombre.toLowerCase());
      if(persona&&!persona.fields.Mail){
        return{
          checklistId: r.id,
          nombre:      persona.fields.Nombre||nombre,
          rol:         persona.fields['Rol en empresa']||'',
          proyecto:    persona.fields.Proyecto||'',
          fecha:       persona.fields['Fecha de ingreso']||r.fields.Fecha||'',
          perfil:      r.fields.Rol||'Otro',
        };
      }
    }
    // Si todos tienen mail, devolver el más reciente igual
    const r=recs[0];
    const persona=cachePersonasRaw.find(p=>(p.fields.Nombre||'').trim().toLowerCase()===(r.fields.Persona||'').trim().toLowerCase());
    return{
      checklistId: r.id,
      nombre:      r.fields.Persona||'',
      rol:         persona?.fields['Rol en empresa']||'',
      proyecto:    persona?.fields.Proyecto||'',
      fecha:       persona?.fields['Fecha de ingreso']||r.fields.Fecha||'',
      perfil:      r.fields.Rol||'Otro',
    };
  }catch(e){ return null; }
}

// Mapa explícito columna → id del DOM (evita bugs con caracteres especiales como í, ó)
function setupDragDrop(boardId){
  const board=document.getElementById(boardId);
  if(!board)return;
  board.querySelectorAll('.kanban-col').forEach(col=>{
    col.addEventListener('dragover',e=>{e.preventDefault();col.classList.add('drag-over');});
    col.addEventListener('dragleave',e=>{if(!col.contains(e.relatedTarget))col.classList.remove('drag-over');});
    col.addEventListener('drop',async e=>{
      e.preventDefault();
      col.classList.remove('drag-over');
      // FIX: capturar id ANTES de que dragend lo limpie a null
      const idToMove=dragId;
      if(!idToMove) return;
      const newCol=col.dataset.col;
      if(!newCol) return;
      try{
        await atPatch(`Checklist/${idToMove}`,{EstadoKanban:newCol});
        if(recMeta[idToMove]) recMeta[idToMove].etapa=newCol;
        toast(`Movido a "${newCol}" ✓`);
        await loadKanbans();
      }catch(err){
        toast('Error al mover: '+err.message,true);
      }
    });
  });
}
function renderCard(r,tipo){
  const f=r.fields,rol=f.Rol||'Otro';
  const st=clState[r.id]||[];
  const {comp,total,pct}=contarProgreso(tipo,rol,st);
  const rbc=rol==='Engineer'?'badge-blue':rol==='Core Team'?'badge-purple':rol==='Ambos'?'badge-amber':'badge-gray';
  const nombre=f.Persona||'—';
  const div=document.createElement('div');
  div.className='kanban-card';
  div.innerHTML=`
    <div class="kc-name">${avH(nombre)}${nombre}</div>
    <div class="kc-meta">
      ${f.Proyecto?`📁 ${f.Proyecto}<br>`:''}
      ${f.Mail?`✉️ ${f.Mail}<br>`:''}
      ${f['País']?`🌎 ${f['País']}<br>`:''}
      ${f.Fecha?`📅 ${fmt(f.Fecha)}<br>`:''}
      <span class="badge ${rbc}" style="margin-top:3px">${rol}</span>
    </div>
    <div class="kc-progress">
      <div class="kc-bar"><div class="kc-bar-fill" style="width:${pct}%"></div></div>
      <span class="kc-pct">${comp}/${total}</span>
    </div>
    <div class="kc-actions">
      ${tipo==='Ingreso'?`<button class="kc-btn-edit" title="Editar persona" onclick="event.stopPropagation();abrirEdicionPersona('${nombre.replace(/'/g,"\\'")}')">
        <i class="ti ti-pencil"></i>
      </button>`:''}
      <button class="kc-btn-del" title="Eliminar ingreso" onclick="event.stopPropagation();confirmarEliminar('${r.id}','${nombre.replace(/'/g,"\\'")}')">
        <i class="ti ti-trash"></i>
      </button>
    </div>`;
  div.onclick=e=>{if(!e.defaultPrevented)openChecklistFromKanban(r.id,nombre,tipo,rol,f.Fecha,f.EstadoKanban);};
  div.draggable=true;
  div.addEventListener('dragstart',e=>{dragId=r.id;div.classList.add('dragging');e.dataTransfer.effectAllowed='move';});
  div.addEventListener('dragend',()=>{div.classList.remove('dragging');dragId=null;});
  return div;
}

function confirmarEliminar(checklistId, nombre){
  showConfirm(
    `¿Eliminar a ${nombre}?`,
    `Se borrará el registro de Checklist, la persona de la tabla Personas y todos los reminders/eventos creados para ${nombre}. Esta acción no se puede deshacer.`,
    ()=>deleteIngreso(checklistId, nombre)
  );
}

async function loadKanbans(){
  await Promise.all([loadKanbanIngresos(),loadKanbanEgresos()]);
}

// FIX PRINCIPAL: sincroniza personas que están en Personas pero no en Checklist
async function sincronizarPersonasEnKanban(personasRecs){
  const checklistRecs=await atGet('Checklist','&filterByFormula={Tipo}="Ingreso"').then(d=>d.records||[]).catch(()=>[]);
  const checklistPorNombre=new Map(checklistRecs.map(r=>[(r.fields.Persona||'').trim().toLowerCase(),r]));
  for(const p of personasRecs){
    const nombre=(p.fields.Nombre||'').trim();
    if(!nombre) continue;
    const rol=p.fields['Rol en empresa']||'Otro';
    const denormalizados={};
    if(p.fields.Proyecto) denormalizados.Proyecto=p.fields.Proyecto;
    if(p.fields.Mail) denormalizados.Mail=p.fields.Mail;
    if(p.fields['País']) denormalizados['País']=p.fields['País'];

    const existente=checklistPorNombre.get(nombre.toLowerCase());
    if(existente){
      // Ya tiene tarjeta en el Kanban — si le faltan datos que Personas ya tiene
      // (por ejemplo, se completaron después con "Editar"), los copiamos ahora.
      const faltantes={};
      for(const campo of ['Proyecto','Mail','País']){
        if(denormalizados[campo]&&!existente.fields[campo]) faltantes[campo]=denormalizados[campo];
      }
      if(Object.keys(faltantes).length){
        await atPatch(`Checklist/${existente.id}`,faltantes).catch(e=>console.error(`Error completando datos del checklist de "${nombre}":`,e));
      }
      continue;
    }

    // No tiene checklist todavía → lo creamos, con los datos ya copiados
    const perfilChecklist=rol==='Engineer'?'Engineer':rol==='Core Team'||rol==='Manager'||rol==='Lead'?'Core Team':'Otro';
    const fields={
      Persona:nombre,
      Tipo:'Ingreso',
      Rol:perfilChecklist,
      Fecha:p.fields['Fecha de ingreso']||undefined,
      EstadoKanban:'Pre-ingreso',
      ...denormalizados,
    };
    await atPost('Checklist',fields).then(()=>{
      const detalle=[rol,p.fields.Proyecto,p.fields['Fecha de ingreso']?`ingresa el ${fmt(p.fields['Fecha de ingreso'])}`:''].filter(Boolean).join(' · ');
      sendSlack(`🎉 *Nuevo ingreso registrado en el Hub*\n${nombre}${detalle?' — '+detalle:''}`);
    }).catch(e=>{
      console.error(`Error creando el checklist de "${nombre}":`,e);
      toast(`⚠️ No se pudo crear el checklist de ${nombre}: ${e.message}`,true);
    });
  }
}

async function loadKanbanIngresos(){
  const d=await atGet('Checklist','&filterByFormula={Tipo}="Ingreso"').catch(()=>({records:[]}));
  const recs=d.records||[];
  document.getElementById('bc-ingresos').textContent=recs.length;

  recs.forEach(r=>{
    const items=getItems('Ingreso',r.fields.Rol||'Otro');
    const saved=r.fields.ItemsCompletados?JSON.parse(r.fields.ItemsCompletados):[];
    clState[r.id]=items.map((_,i)=>saved[i]===true);
    recMeta[r.id]={tipo:'Ingreso',rol:r.fields.Rol||'Otro',fecha:r.fields.Fecha||'',etapa:r.fields.EstadoKanban||'Pre-ingreso'};
  });

  // Avance automático por tiempo
  for(const r of recs){
    const fecha=r.fields.Fecha||'';
    const dias=fecha?Math.floor((new Date()-new Date(fecha+'T12:00:00'))/86400000):-1;
    const esViejoPorTiempo=dias>=15;
    const etapaCalc=calcularEtapa('Ingreso',r.fields.Rol||'Otro',clState[r.id],fecha);

    if(esViejoPorTiempo && r.fields.EstadoKanban!=='Onboarding completo'){
      // Marcar todos los ítems como completados
      const totalItems=clState[r.id].length;
      clState[r.id]=Array(totalItems).fill(true);
      const patch={EstadoKanban:'Onboarding completo',ItemsCompletados:JSON.stringify(clState[r.id])};
      await atPatch(`Checklist/${r.id}`,patch).catch(()=>{});
      r.fields.EstadoKanban='Onboarding completo';
      r.fields.ItemsCompletados=patch.ItemsCompletados;
      if(recMeta[r.id]) recMeta[r.id].etapa='Onboarding completo';
    } else if(!esViejoPorTiempo && etapaCalc==='Onboarding completo' && r.fields.EstadoKanban!=='Onboarding completo'){
      await atPatch(`Checklist/${r.id}`,{EstadoKanban:etapaCalc}).catch(()=>{});
      r.fields.EstadoKanban=etapaCalc;
      if(recMeta[r.id]) recMeta[r.id].etapa=etapaCalc;
    }
  }

  // Limpiar columnas usando mapa explícito
  Object.values(COL_ID_INGRESO).forEach(cid=>{
    const el=document.getElementById(cid);
    if(el) el.innerHTML='';
  });
  Object.values(COL_CNT_INGRESO).forEach(cid=>{
    const el=document.getElementById(cid);
    if(el) el.textContent='0';
  });

  // Ordenar por fecha de ingreso: más cercana primero
  recs.sort((a,b)=>{
    const fa=a.fields.Fecha||'9999', fb=b.fields.Fecha||'9999';
    return fa.localeCompare(fb);
  });

  const counts={};
  for(const r of recs){
    // Normalizar EstadoKanban — si vacío o inválido, forzar Pre-ingreso
    let col=(r.fields.EstadoKanban||'').trim();
    if(!ETAPAS_INGRESO.includes(col)){
      col='Pre-ingreso';
      await atPatch(`Checklist/${r.id}`,{EstadoKanban:'Pre-ingreso'}).catch(()=>{});
      r.fields.EstadoKanban='Pre-ingreso';
      if(recMeta[r.id]) recMeta[r.id].etapa='Pre-ingreso';
    }
    counts[col]=(counts[col]||0)+1;
    // Usar mapa explícito para evitar bugs con caracteres especiales (í, ó, etc.)
    const cid=COL_ID_INGRESO[col];
    const el=cid?document.getElementById(cid):null;
    if(el) el.appendChild(renderCard(r,'Ingreso'));
  }

  ETAPAS_INGRESO.forEach(col=>{
    const cid=COL_ID_INGRESO[col];
    const cnt=COL_CNT_INGRESO[col];
    if(cnt) document.getElementById(cnt).textContent=counts[col]||0;
    if(cid&&!counts[col]) document.getElementById(cid).innerHTML='<div class="kanban-empty">Sin tarjetas</div>';
  });
  setupDragDrop('kb-ingresos');

  // Card inicio — ingresos del mes
  const now=new Date();
  const ingresosDelMes=recs.filter(r=>{
    const f=r.fields.Fecha;if(!f)return false;
    const d=new Date(f+'T12:00:00');
    return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
  });
  document.getElementById('sc-ingresos').textContent=ingresosDelMes.length;
  document.getElementById('sc-ingresos-sub').textContent=ingresosDelMes.length===1?'ingreso este mes':'ingresos este mes';
  const listEl=document.getElementById('sc-list-ingresos');
  const moreEl=document.getElementById('sc-more-ingresos');
  const top5=ingresosDelMes.slice(0,5);
  listEl.innerHTML=top5.map(r=>`<div class="sc-list-item">• ${r.fields.Persona||'—'}</div>`).join('');
  moreEl.style.display=ingresosDelMes.length>5?'block':'none';
  if(ingresosDelMes.length>5) moreEl.textContent=`Ver los ${ingresosDelMes.length} →`;
}

async function loadKanbanEgresos(){
  const d=await atGet('Checklist','&filterByFormula={Tipo}="Egreso"').catch(()=>({records:[]}));
  const recs=d.records||[];
  document.getElementById('bc-egresos').textContent=recs.length;

  recs.forEach(r=>{
    const items=getItems('Egreso','—');
    const saved=r.fields.ItemsCompletados?JSON.parse(r.fields.ItemsCompletados):[];
    clState[r.id]=items.map((_,i)=>saved[i]===true);
    recMeta[r.id]={tipo:'Egreso',rol:'—',fecha:r.fields.Fecha||'',etapa:r.fields.EstadoKanban||'Aviso dado'};
  });

  Object.values(COL_ID_EGRESO).forEach(cid=>{
    const el=document.getElementById(cid);
    if(el) el.innerHTML='';
  });
  Object.values(COL_CNT_EGRESO).forEach(cid=>{
    const el=document.getElementById(cid);
    if(el) el.textContent='0';
  });

  // Ordenar por fecha: más cercana primero
  recs.sort((a,b)=>{
    const fa=a.fields.Fecha||'9999', fb=b.fields.Fecha||'9999';
    return fa.localeCompare(fb);
  });

  const counts={};
  recs.forEach(r=>{
    let col=(r.fields.EstadoKanban||'').trim();
    if(!ETAPAS_EGRESO.includes(col)) col='Aviso dado';
    counts[col]=(counts[col]||0)+1;
    const cid=COL_ID_EGRESO[col];
    const el=cid?document.getElementById(cid):null;
    if(el) el.appendChild(renderCard(r,'Egreso'));
  });
  ETAPAS_EGRESO.forEach(col=>{
    const cid=COL_ID_EGRESO[col];
    const cnt=COL_CNT_EGRESO[col];
    if(cnt) document.getElementById(cnt).textContent=counts[col]||0;
    if(cid&&!counts[col]) document.getElementById(cid).innerHTML='<div class="kanban-empty">Sin tarjetas</div>';
  });
  setupDragDrop('kb-egresos');

  const now=new Date();
  const esteM=recs.filter(r=>{
    const f=r.fields.Fecha;if(!f)return false;
    const d=new Date(f+'T12:00:00');
    return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
  });
  document.getElementById('me-offboard-mes').textContent=esteM.length;
  document.getElementById('me-offboard-total').textContent=recs.length;

  const personasMap={};
  cachePersonasRaw.forEach(p=>{if(p.fields.Nombre)personasMap[p.fields.Nombre.trim()]=p.fields['Fecha de ingreso'];});
  const estadias=recs.map(r=>{
    const nombre=(r.fields.Persona||'').trim();
    const fi=personasMap[nombre],fe=r.fields.Fecha;
    if(!fi||!fe)return null;
    const m=(new Date(fe+'T12:00:00')-new Date(fi+'T12:00:00'))/(1000*60*60*24*30.44);
    return m>0?m:null;
  }).filter(Boolean);
  const prom=estadias.length?Math.round(estadias.reduce((a,b)=>a+b,0)/estadias.length):null;
  document.getElementById('me-estadia').textContent=prom||'—';

  // Card inicio
  document.getElementById('sc-offboard').textContent=esteM.length;
  document.getElementById('sc-offboard-sub').textContent=esteM.length===1?'offboarding este mes':'offboardings este mes';
  const listEl=document.getElementById('sc-list-offboard');
  const moreEl=document.getElementById('sc-more-offboard');
  listEl.innerHTML=esteM.slice(0,5).map(r=>`<div class="sc-list-item">• ${r.fields.Persona||'—'}</div>`).join('');
  moreEl.style.display=esteM.length>5?'block':'none';
}

// ─── CHECKLIST DETAIL ─────────────────────────────────────────────────────────
function openChecklistFromKanban(id,nombre,tipo,rol,fecha,etapa){
  // Abrir overlay de checklist sin cambiar sección
  const overlay=document.getElementById('cl-overlay');
  overlay.style.display='flex';
  document.body.style.overflow='hidden';
  openChecklistInline(id,nombre,tipo,rol,fecha,etapa);
}

function closeChecklistOverlay(){
  document.getElementById('cl-overlay').style.display='none';
  document.body.style.overflow='';
  // Refrescar kanban para reflejar progreso
  loadKanbans();
}
function openChecklist(id,nombre,tipo,rol,fecha,etapa){
  openChecklistFromKanban(id,nombre,tipo,rol,fecha,etapa);
}

function openChecklistInline(id,nombre,tipo,rol,fecha,etapa){
  document.getElementById('cl-nombre').textContent=nombre;
  document.getElementById('cl-badge').className=`badge ${tipo==='Ingreso'?'badge-green':'badge-red'}`;
  document.getElementById('cl-badge').textContent=tipo;
  document.getElementById('cl-subtitle').textContent=`${tipo} · ${rol}${fecha?' · '+fmt(fecha):''}`;
  const items=getItems(tipo,rol);
  if(!clState[id]) clState[id]=Array(items.length).fill(false);
  clState[id]=items.map((_,i)=>clState[id][i]===true);
  renderChecklistItemsInline(id,tipo,rol,fecha||'');
}

function renderChecklistItemsInline(id,tipo,rol,fecha){
  const items=getItemsMap(tipo,rol);
  const etapas=tipo==='Egreso'?ETAPAS_EGRESO:ETAPAS_INGRESO;
  if(!clState[id]) clState[id]=Array(items.length).fill(false);
  clState[id]=items.map((_,i)=>clState[id][i]===true);
  const {comp,total,pct}=contarProgreso(tipo,rol,clState[id]);
  document.getElementById('cl-progress').textContent=`${comp}/${total} completados (${pct}%)`;
  document.getElementById('cl-progress').className=`badge ${pct===100?'badge-green':pct>0?'badge-amber':'badge-red'}`;
  let html='';
  etapas.forEach(etapa=>{
    if(tipo==='Ingreso'&&etapa==='Onboarding completo') return;
    const its=items.filter(it=>it.e===etapa&&it.activo!==false);
    if(!its.length) return;
    const idxs=its.map(it=>items.indexOf(it));
    const ec=idxs.filter(i=>clState[id][i]).length;
    const eb=ec===idxs.length?'badge-green':ec>0?'badge-amber':'badge-gray';
    html+=`<div class="cl-etapa-header"><span>${etapa}</span><span class="cl-etapa-badge ${eb}">${ec}/${idxs.length}</span></div>`;
    html+=its.map(it=>{
      const i=items.indexOf(it);
      const checked=clState[id][i]===true;
      const lnk=it.l?` <a href="${it.l}" target="_blank" style="color:var(--blue);font-size:11px;margin-left:6px;text-decoration:none">↗ Link</a>`:'';
      return`<div class="cl-item ${checked?'cl-item-done':''}" onclick="toggleItemInline('${id}','${tipo}','${rol}','${fecha}',${i})">
        <div class="cl-check ${checked?'cl-check-done':''}">${checked?'✓':''}</div>
        <span>${it.t}${lnk}</span>
      </div>`;
    }).join('');
  });
  document.getElementById('cl-items').innerHTML=html;
}

async function toggleItemInline(id,tipo,rol,fecha,idx){
  clState[id][idx]=!clState[id][idx];
  // Guardar en Airtable
  await atPatch(`Checklist/${id}`,{ItemsCompletados:JSON.stringify(clState[id])}).catch(()=>{});
  // Avance automático de etapa si corresponde
  const etapaCalc=calcularEtapa(tipo,rol,clState[id],fecha);
  const recMeta_entry=recMeta[id];
  if(recMeta_entry&&etapaCalc!==recMeta_entry.etapa){
    await atPatch(`Checklist/${id}`,{EstadoKanban:etapaCalc}).catch(()=>{});
    recMeta_entry.etapa=etapaCalc;
  }
  renderChecklistItemsInline(id,tipo,rol,fecha);
}
function renderChecklistItems(id,tipo,rol,fecha){
  const items=getItemsMap(tipo,rol);
  const etapas=tipo==='Egreso'?ETAPAS_EGRESO:ETAPAS_INGRESO;
  if(!clState[id]) clState[id]=Array(items.length).fill(false);
  clState[id]=items.map((_,i)=>clState[id][i]===true);
  const {comp,total,pct}=contarProgreso(tipo,rol,clState[id]);
  document.getElementById('detail-progress').textContent=`${comp}/${total} completados (${pct}%)`;
  document.getElementById('detail-progress').className=`badge ${pct===100?'badge-green':pct>0?'badge-amber':'badge-red'}`;
  let html='';
  etapas.forEach(etapa=>{
    if(tipo==='Ingreso'&&etapa==='Onboarding completo') return;
    const its=items.filter(it=>it.e===etapa&&it.activo!==false);
    if(!its.length) return;
    const idxs=its.map(it=>items.indexOf(it));
    const ec=idxs.filter(i=>clState[id][i]).length;
    const eb=ec===idxs.length?'badge-green':ec>0?'badge-amber':'badge-gray';
    html+=`<div class="cl-etapa-header"><span>${etapa}</span><span class="cl-etapa-badge ${eb}">${ec}/${idxs.length}</span></div>`;
    its.forEach(it=>{
      const idx=items.indexOf(it);const ck=clState[id][idx];
      const linkBtn=it.l?`<a href="${it.l}" target="_blank" onclick="event.stopPropagation()" style="flex-shrink:0;color:var(--blue);opacity:0.6;font-size:14px;line-height:1;text-decoration:none;" title="Abrir referencia"><i class="ti ti-external-link"></i></a>`:'';
      html+=`<div class="cl-item">
        <div class="cl-check ${ck?'done':''}" onclick="toggleItem('${id}',${idx},'${tipo}','${rol}','${fecha}')">
          ${ck?'<i class="ti ti-check" style="color:#fff;font-size:12px;"></i>':''}
        </div>
        <span class="cl-text ${ck?'done':''}" style="flex:1">${it.t}</span>
        ${linkBtn}
      </div>`;
    });
  });
  document.getElementById('detail-items').innerHTML=html;
}
async function toggleItem(id,idx,tipo,rol,fecha){
  const items=getItems(tipo,rol);
  if(!clState[id]) clState[id]=Array(items.length).fill(false);
  clState[id]=items.map((_,i)=>clState[id][i]===true);
  clState[id][idx]=!clState[id][idx];
  renderChecklistItems(id,tipo,rol,fecha);

  // Actualizar barra de progreso en la tarjeta del kanban sin recargar todo
  updateCardProgress(id,tipo,rol);

  await atPatch(`Checklist/${id}`,{ItemsCompletados:JSON.stringify(clState[id])}).catch(()=>{});

  const etapaCalc=calcularEtapa(tipo,rol,clState[id],fecha);
  const etapaActual=recMeta[id]?.etapa;
  if(etapaCalc&&etapaCalc!==etapaActual){
    await atPatch(`Checklist/${id}`,{EstadoKanban:etapaCalc}).catch(()=>{});
    if(recMeta[id]) recMeta[id].etapa=etapaCalc;
    toast(`✓ Avanzó a "${etapaCalc}"`);
    // Recargar kanban para mover la tarjeta a la nueva columna
    await loadKanbans();
  }
}

// Actualiza solo la barra de progreso de una tarjeta ya renderizada en el kanban
function updateCardProgress(id,tipo,rol){
  const st=clState[id]||[];
  const {comp,total,pct}=contarProgreso(tipo,rol,st);
  // Buscar la tarjeta en el DOM por data o por búsqueda de texto del nombre
  const allCards=document.querySelectorAll('.kanban-card');
  allCards.forEach(card=>{
    // Identificar la tarjeta por el onclick registrado en recMeta
    const meta=recMeta[id];
    if(!meta) return;
    const nameEl=card.querySelector('.kc-name');
    if(!nameEl||!nameEl.textContent.includes(meta.rol||'')) return;
    // Solo actualizar si es la tarjeta correcta (verificar por texto del nombre)
    const barFill=card.querySelector('.kc-bar-fill');
    const pctEl=card.querySelector('.kc-pct');
    if(barFill) barFill.style.width=pct+'%';
    if(pctEl) pctEl.textContent=`${comp}/${total}`;
  });
}
function closeChecklist(){
  document.getElementById('checklist-list-view').style.display='block';
  document.getElementById('checklist-detail-view').style.display='none';
  document.getElementById('btn-add').style.display='flex';
  const seccAct=document.querySelector('.section-page.active');
  if(seccAct&&seccAct.id==='page-checklist'){
    document.getElementById('btn-add-full').style.display='none';
  }
}
async function loadChecklist(){
  const d=await atGet('Checklist').catch(()=>({records:[]}));
  const recs=d.records||[];
  document.getElementById('badge-checklist-h').textContent=`${recs.length} registros`;
  const tb=document.getElementById('tbody-checklist');
  if(!recs.length){tb.innerHTML='<tr class="empty-row"><td colspan="7">No hay registros</td></tr>';return;}
  tb.innerHTML=recs.map(r=>{
    const f=r.fields,tipo=f.Tipo||'Ingreso',rol=f.Rol||'Otro';
    const items=getItems(tipo,rol);
    const saved=f.ItemsCompletados?JSON.parse(f.ItemsCompletados):[];
    clState[r.id]=items.map((_,i)=>saved[i]===true);
    recMeta[r.id]={tipo,rol,fecha:f.Fecha||'',etapa:f.EstadoKanban||''};
    const {comp,total,pct}=contarProgreso(tipo,rol,clState[r.id]);
    const eb=pct===100?'badge-green':pct>0?'badge-amber':'badge-red';
    const tb2=tipo==='Ingreso'?'badge-green':'badge-red';
    const rb=rol==='Engineer'?'badge-blue':rol==='Core Team'?'badge-purple':rol==='Ambos'?'badge-amber':'badge-gray';
    return`<tr>
      <td>${avH(f.Persona)}${f.Persona||'—'}</td>
      <td><span class="badge ${tb2}">${tipo}</span></td>
      <td><span class="badge ${rb}">${rol}</span></td>
      <td>${fmt(f.Fecha)}</td>
      <td><span class="badge ${eb}">${pct===100?'Completo ✓':pct>0?'En progreso':'Pendiente'}</span></td>
      <td style="min-width:120px"><div style="display:flex;align-items:center;gap:8px;"><div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:var(--blue);border-radius:3px"></div></div><span style="font-size:11px;color:var(--text2)">${comp}/${total}</span></div></td>
      <td><button onclick="openChecklist('${r.id}','${(f.Persona||'').replace(/'/g,"\\'")}','${tipo}','${rol}','${f.Fecha||''}','${f.EstadoKanban||''}')" style="background:none;border:1px solid var(--border);border-radius:7px;padding:5px 10px;font-size:12px;font-weight:600;color:var(--blue);cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;">Ver →</button></td>
    </tr>`;
  }).join('');
}

