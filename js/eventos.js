async function limpiarGlassdoorCoreTeam(){
  const btn=document.getElementById('btn-clean-reminders');
  btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> Limpiando...';

  // Traer todos los eventos Glassdoor y todas las personas
  const [dEventos, dPersonas] = await Promise.all([
    atGet('Eventos','&filterByFormula=FIND("glassdoor",LOWER({Evento}))').catch(()=>({records:[]})),
    atGet('Personas').catch(()=>({records:[]}))
  ]);

  // Construir set de nombres de Engineers
  const engineers=new Set(
    (dPersonas.records||[])
      .filter(p=>(p.fields['Rol en empresa']||'').trim()==='Engineer')
      .map(p=>(p.fields.Nombre||'').trim())
  );

  // Encontrar reminders de Glassdoor que NO son de Engineers
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

  // Confirmar antes de borrar
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
  await loadEventos();
}

async function sincronizarGlassdoor(){
  const btn=document.getElementById('btn-sync-reminders');
  btn.disabled=true;btn.innerHTML='<i class="ti ti-loader"></i> Sincronizando...';

  // Traer todas las personas y todos los eventos existentes
  const [personasData, eventosData] = await Promise.all([
    atGet('Personas','&sort[0][field]=Nombre&sort[0][direction]=asc').catch(()=>({records:[]})),
    atGet('Eventos').catch(()=>({records:[]}))
  ]);

  const personas = personasData.records||[];
  const eventosExistentes = eventosData.records||[];

  let creados=0, omitidos=0, sinFecha=0, noAplica=0;

  for(const p of personas){
    const f=p.fields;
    const nombre=(f.Nombre||'').trim();
    if(!nombre){omitidos++;continue;}

    // Solo Engineers
    const rol=(f['Rol en empresa']||'').trim();
    if(rol!=='Engineer'){noAplica++;continue;}

    const fechaIngreso=f['Fecha de ingreso']||'';
    const fechaCumple=f['Fecha de cumpleaños']||'';

    // Eventos ya existentes para esta persona
    const eventosPer=eventosExistentes.filter(e=>(e.fields.Evento||'').includes(nombre));
    const tieneGlass   =eventosPer.some(e=>(e.fields.Evento||'').toLowerCase().includes('glassdoor'));

    if(fechaIngreso){
      const ing=new Date(fechaIngreso+'T12:00:00');
      const hoy=new Date();

      // Glassdoor: crear si no existe y la fecha aún no pasó
      if(!tieneGlass){
        const gdDate=new Date(ing);gdDate.setMonth(gdDate.getMonth()+4);
        if(gdDate>=hoy){
          try{
            await atPost('Eventos',{Evento:`📝 Review Glassdoor — ${nombre}`,Tipo:'Glassdoor',Fecha:gdDate.toISOString().split('T')[0],Estado:'Pendiente'});
            creados++;
          }catch(e){console.error('GD error',nombre,e.message);}
        } else { omitidos++; }
      } else { omitidos++; }
    } else { sinFecha++; }
  }

  btn.disabled=false;btn.innerHTML='<i class="ti ti-refresh"></i> Sincronizar Glassdoor';
  const msg=`✅ Glassdoor sincronizado: ${creados} reminders creados, ${omitidos} ya existían o ya vencieron${sinFecha?' · '+sinFecha+' sin fecha de ingreso':''}${noAplica?' · '+noAplica+' omitidos (no son Engineers)':''}`;
  toast(msg);
  await loadEventos();
}

async function loadEventos(){
  const d=await atGet('Eventos','&sort[0][field]=Fecha&sort[0][direction]=asc');
  const allRecs=d.records||[];
  const hoy=new Date();hoy.setHours(0,0,0,0);
  const año=hoy.getFullYear();

  // Solo mostrar Glassdoor y eventos manuales (excluir cumpleaños y aniversarios)
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

  const pendientes=recs.filter(r=>r.fields.Estado!=='Completado');
  const glassdoorPend=recs.filter(r=>r.fields.Estado!=='Completado'&&(r.fields.Evento||'').toLowerCase().includes('glassdoor'));
  const completados=recs.filter(r=>r.fields.Estado==='Completado'&&r.fields.Fecha&&new Date(r.fields.Fecha+'T12:00:00').getFullYear()===año);

  document.getElementById('me-pendientes').textContent=pendientes.length;
  document.getElementById('me-glassdoor').textContent=glassdoorPend.length;
  document.getElementById('me-completados').textContent=completados.length;
  document.getElementById('me-total').textContent=recs.length;
  document.getElementById('badge-eventos-h').textContent=`${recs.length} reminders`;

  // Card inicio — solo pendientes
  document.getElementById('sc-reminders').textContent=pendientes.length;
  const listEl=document.getElementById('sc-list-reminders');
  const moreEl=document.getElementById('sc-more-reminders');
  listEl.innerHTML=pendientes.slice(0,5).map(r=>`<div class="sc-list-item">• ${r.fields.Evento||'—'}</div>`).join('');
  moreEl.style.display=pendientes.length>5?'block':'none';

  // Separar Glassdoor de otros
  const glassdoor=recs.filter(r=>(r.fields.Evento||'').toLowerCase().includes('glassdoor'));
  const otros=recs.filter(r=>!(r.fields.Evento||'').toLowerCase().includes('glassdoor'));

  function rowReminder(r, idx){
    const f=r.fields;
    const completado=f.Estado==='Completado';
    const bg=idx%2===0?'background:var(--bg2)':'background:var(--bg)';
    // Extraer solo el nombre de la persona del evento
    const nombre=(f.Evento||'').replace(/.*—\s*/,'').trim()||f.Evento||'—';
    return`<tr style="opacity:${completado?'0.5':'1'};${bg}">
      <td style="font-weight:500">${nombre}</td>
      <td style="font-size:12px;color:var(--text2)">${fmt(f.Fecha)}</td>
      <td>
        <button onclick="toggleEventoEstado('${r.id}','${f.Estado||'Pendiente'}')"
          style="border:none;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;background:${completado?'#D1FAE5':'#FEF3C7'};color:${completado?'#065F46':'#92400E'};">
          ${completado?'✓ Listo':'Pendiente'}
        </button>
      </td>
    </tr>`;
  }

  const container=document.getElementById('eventos-container');
  let html='';

  // Glassdoor primero — ordenado: pendientes arriba, completados abajo
  if(glassdoor.length){
    const ord=[...glassdoor].sort((a,b)=>(a.fields.Estado==='Completado'?1:0)-(b.fields.Estado==='Completado'?1:0));
    html+=`<div style="margin-bottom:28px;">
      <div style="font-size:11px;font-weight:700;color:var(--text3);padding:10px 18px 8px;letter-spacing:0.06em;text-transform:uppercase;">Glassdoor Reviews <span style="font-weight:500">(${glassdoor.length})</span></div>
      <table class="data-table"><thead><tr><th>Persona</th><th>Fecha</th><th>Estado</th></tr></thead>
      <tbody>${ord.map((r,i)=>rowReminder(r,i)).join('')}</tbody></table>
    </div>`;
  }

  // Otros reminders manuales
  if(otros.length){
    const ord=[...otros].sort((a,b)=>(a.fields.Estado==='Completado'?1:0)-(b.fields.Estado==='Completado'?1:0));
    html+=`<div style="margin-bottom:28px;">
      <div style="font-size:11px;font-weight:700;color:var(--text3);padding:10px 18px 8px;letter-spacing:0.06em;text-transform:uppercase;">Otros reminders <span style="font-weight:500">(${otros.length})</span></div>
      <table class="data-table"><thead><tr><th>Evento</th><th>Fecha</th><th>Estado</th></tr></thead>
      <tbody>${ord.map((r,i)=>rowReminder(r,i)).join('')}</tbody></table>
    </div>`;
  }

  container.innerHTML=html||'<div style="padding:32px;text-align:center;color:var(--text3);font-size:13px;">No hay reminders. Usá "Sincronizar Glassdoor" para cargar los pendientes, o agregá uno manualmente.</div>';
}

async function toggleEventoEstado(id, estadoActual){
  const nuevo=estadoActual==='Completado'?'Pendiente':'Completado';
  await atPatch(`Eventos/${id}`,{Estado:nuevo}).catch(()=>{});
  await loadEventos();
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
