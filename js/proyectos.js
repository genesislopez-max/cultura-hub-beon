function filtrarProyectos(){
  const q=(document.getElementById('proyectos-search')?.value||'').toLowerCase();
  const estadoFil=document.getElementById('proyectos-estado')?.value||'';
  const tb=document.getElementById('tbody-proyectos');
  if(!tb) return;
  let count=0;
  tb.querySelectorAll('tr').forEach(tr=>{
    if(tr.classList.contains('empty-row')){tr.style.display='none';return;}
    const texto=tr.textContent.toLowerCase();
    const estado=tr.dataset.estado||'';
    const matchQ=!q||texto.includes(q);
    const matchEstado=!estadoFil?true:estadoFil==='activos'?estado!=='De Baja':estado===estadoFil;
    const visible=matchQ&&matchEstado;
    tr.style.display=visible?'':'none';
    if(visible) count++;
  });
  let emptyRow=tb.querySelector('.empty-row');
  if(count===0){
    if(!emptyRow){emptyRow=document.createElement('tr');emptyRow.className='empty-row';emptyRow.innerHTML='<td colspan="8">Sin resultados</td>';tb.appendChild(emptyRow);}
    emptyRow.style.display='';
  } else if(emptyRow){ emptyRow.style.display='none'; }
}
async function loadProyectos(){
  const d=await atGet('Proyectos','&sort[0][field]=Proyecto&sort[0][direction]=asc');
  const todosRecs=d.records||[];
  console.log('Proyectos cargados:', todosRecs.length, todosRecs.map(r=>r.fields.Proyecto+' ['+r.fields.Estado+']'));

  // Mostrar todos excepto los dados de baja
  const recs=todosRecs.filter(r=>(r.fields.Estado||'')!=='De Baja');

  // Cache para selects — mismos proyectos visibles
  cacheProyectos=recs.map(r=>r.fields.Proyecto||'').filter(Boolean);
  cacheProyectosRaw=todosRecs; // registros completos para resolver linked records

  document.getElementById('badge-proyectos-h').textContent=`${recs.length} proyectos activos`;

  // Cargar todas las publicaciones de Meet our Teams
  const meetData=await atGet('Meet our Teams','&sort[0][field]=Fecha&sort[0][direction]=asc').catch(()=>({records:[]}));
  cacheMeetByProyecto={};

  // Construir mapa de ID → nombre de proyecto
  const proyIdToNombre={};
  todosRecs.forEach(r=>{proyIdToNombre[r.id]=r.fields.Proyecto||'';});

  (meetData.records||[]).forEach(r=>{
    const f=r.fields;
    // Proyecto es linked record → array de IDs → resolver a nombre
    const proyIds=Array.isArray(f.Proyecto)?f.Proyecto:f.Proyecto?[f.Proyecto]:[];
    const proyNombre=proyIds.map(id=>proyIdToNombre[id]||id).filter(Boolean)[0]||'';
    if(!proyNombre) return;
    if(!cacheMeetByProyecto[proyNombre]) cacheMeetByProyecto[proyNombre]=[];
    cacheMeetByProyecto[proyNombre].push({
      id:    r.id,
      fecha: f.Fecha||'',
      link:  f.Link||f.URL||'',
      notas: f.Notas||f.Descripción||''
    });
  });

  const devs={};
  cachePersonasRaw.forEach(p=>{const pr=(p.fields.Proyecto||'').trim();if(pr)devs[pr]=(devs[pr]||0)+1;});

  const tb=document.getElementById('tbody-proyectos');
  tb.innerHTML=todosRecs.length?todosRecs.map(r=>{
    const f=r.fields;
    const nombre=f.Proyecto||'—';
    const estado=f.Estado||'';
    const estadoBadge=estado==='De Baja'?'<span class="badge badge-red">De Baja</span>':estado?`<span class="badge badge-green">${estado}</span>`:'<span style="color:var(--text3);font-size:12px">—</span>';
    const c=devs[nombre]||0;
    const devBadge=c>0
      ?`<span class="badge badge-blue"><i class="ti ti-users" style="font-size:11px"></i> ${c}</span>`
      :'<span style="color:var(--text3);font-size:12px">—</span>';

    const pubs=cacheMeetByProyecto[nombre]||[];
    const pubCount=pubs.length;
    const pubBadge=pubCount>0
      ?`<span class="pubs-badge" onclick="event.stopPropagation();openMeetModal('${r.id}','${nombre.replace(/'/g,"\\'")}')"><i class="ti ti-speakerphone" style="font-size:11px"></i> ${pubCount}</span>`
      :`<span style="color:var(--text3);font-size:12px;cursor:pointer" onclick="event.stopPropagation();openMeetModal('${r.id}','${nombre.replace(/'/g,"\\'")}')">Sin publicaciones</span>`;

    const ultimaPub=pubs.length?pubs[pubs.length-1]:null;
    const ultimaFecha=ultimaPub?fmt(ultimaPub.fecha):'—';

    let promDias='—';
    if(pubs.length>=2){
      const diffs=[];
      for(let i=1;i<pubs.length;i++){
        const d1=new Date(pubs[i-1].fecha+'T12:00:00');
        const d2=new Date(pubs[i].fecha+'T12:00:00');
        diffs.push(Math.round((d2-d1)/86400000));
      }
      promDias=Math.round(diffs.reduce((a,b)=>a+b,0)/diffs.length)+' días';
    }

    const fechaInicioVal=f['Fecha de Inicio']||f['Fecha de inicio']||'';
    return`<tr class="tr-clickable" data-estado="${estado}" onclick="openMeetModal('${r.id}','${nombre.replace(/'/g,"\\'")}')">
      <td><strong>${nombre}</strong></td>
      <td>${estadoBadge}</td>
      <td style="font-size:12px;color:var(--text2)">${fechaInicioVal?fmt(fechaInicioVal):'—'}</td>
      <td>${devBadge}</td>
      <td>${pubBadge}</td>
      <td style="font-size:12px;color:var(--text2)">${ultimaFecha}</td>
      <td style="font-size:12px;color:var(--text2)">${promDias}</td>
      <td><button onclick="event.stopPropagation();openMeetModal('${r.id}','${nombre.replace(/'/g,"\\'")}',true)" style="background:none;border:1px solid var(--border);border-radius:7px;padding:5px 10px;font-size:12px;font-weight:600;color:var(--blue);cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;">Ver →</button></td>
    </tr>`;
  }).join(''):'<tr class="empty-row"><td colspan="8">No hay proyectos cargados</td></tr>';
  filtrarProyectos();
}

// Abre el modal de Meet our Teams para un proyecto
function openMeetModal(proyectoId, nombre, focusForm=false){
  meetProyectoActual={id:proyectoId, nombre};
  document.getElementById('meet-title').textContent=nombre;

  const devCount=(cachePersonasRaw.filter(p=>(p.fields.Proyecto||'').trim()===nombre)).length;
  document.getElementById('meet-devs-label').textContent=
    devCount>0?`${devCount} dev${devCount===1?'':'s'} asignado${devCount===1?'':'s'}`:'Sin devs asignados';

  const pubs=(cacheMeetByProyecto[nombre]||[]).slice().sort((a,b)=>new Date(a.fecha)-new Date(b.fecha));

  // Stats
  let promDias='—', diasDesdeUltima='—';
  if(pubs.length>=2){
    const diffs=[];
    for(let i=1;i<pubs.length;i++){
      diffs.push(Math.round((new Date(pubs[i].fecha+'T12:00:00')-new Date(pubs[i-1].fecha+'T12:00:00'))/86400000));
    }
    promDias=Math.round(diffs.reduce((a,b)=>a+b,0)/diffs.length);
  }
  if(pubs.length){
    diasDesdeUltima=Math.round((new Date()-new Date(pubs[pubs.length-1].fecha+'T12:00:00'))/86400000);
  }

  const diasSinPub=pubs.length?Math.round((new Date()-new Date(pubs[pubs.length-1].fecha+'T12:00:00'))/86400000)+'d':'—';
  document.getElementById('meet-stats').innerHTML=`
    <div class="meet-stat"><div class="meet-stat-val">${pubs.length}</div><div class="meet-stat-label">Publicaciones</div></div>
    <div class="meet-stat"><div class="meet-stat-val" style="color:var(--purple)">${promDias}</div><div class="meet-stat-label">Días promedio entre pubs.</div></div>
    <div class="meet-stat"><div class="meet-stat-val" style="color:var(--amber)">${diasDesdeUltima==='—'?'—':diasDesdeUltima+'d'}</div><div class="meet-stat-label">Desde última publicación</div></div>
    <div class="meet-stat"><div class="meet-stat-val" style="color:var(--critical)">${diasSinPub}</div><div class="meet-stat-label">Días sin publicar</div></div>`;

  // Lista de publicaciones
  const listEl=document.getElementById('meet-pub-list');
  if(!pubs.length){
    listEl.innerHTML='<div style="text-align:center;padding:28px;color:var(--text3);font-size:13px;">Todavía no hay publicaciones para este proyecto</div>';
  } else {
    listEl.innerHTML=pubs.map((p,i)=>{
      let gapHtml='';
      if(i>0){
        const dias=Math.round((new Date(p.fecha+'T12:00:00')-new Date(pubs[i-1].fecha+'T12:00:00'))/86400000);
        gapHtml=`<div class="meet-pub-gap">↑ ${dias} días desde la publicación anterior</div>`;
      }
      return`<div class="meet-pub-item">
        <div class="meet-pub-num">${i+1}</div>
        <div class="meet-pub-info">
          <div class="meet-pub-fecha">${fmt(p.fecha)}</div>
          ${p.notas?`<div class="meet-pub-notas">${p.notas}</div>`:''}
          ${gapHtml}
          ${p.link?`<a class="meet-pub-link" href="${p.link}" target="_blank"><i class="ti ti-external-link" style="font-size:12px"></i> Ver publicación en Slack</a>`:''}
        </div>
      </div>`;
    }).join('');
  }

  // Limpiar form
  document.getElementById('meet-fecha').value='';
  document.getElementById('meet-link').value='';
  document.getElementById('meet-notas').value='';

  document.getElementById('meet-overlay').classList.add('open');
  if(focusForm) setTimeout(()=>document.getElementById('meet-fecha').focus(),100);
}

function closeMeetModal(e){
  if(!e||e.target===document.getElementById('meet-overlay'))
    document.getElementById('meet-overlay').classList.remove('open');
}

async function saveMeetPublicacion(){
  if(!meetProyectoActual) return;
  const fecha=document.getElementById('meet-fecha').value;
  const link=document.getElementById('meet-link').value.trim();
  const notas=document.getElementById('meet-notas').value.trim();
  if(!fecha){toast('La fecha es obligatoria',true);return;}
  if(!link){toast('El link es obligatorio',true);return;}

  const btn=document.getElementById('meet-save-btn');
  btn.disabled=true;

  try{
    // Guardar en Airtable — Proyecto como linked record requiere el ID del registro
    await atPost('Meet our Teams',{
      Proyecto:[meetProyectoActual.id],
      Fecha:fecha,
      Link:link,
      Notas:notas||undefined
    });
    toast('Publicación guardada ✓');
    await loadProyectos();
    // Reabrir el modal con datos actualizados
    openMeetModal(meetProyectoActual.id, meetProyectoActual.nombre);
  }catch(e){
    toast('Error: '+e.message,true);
  }
  btn.disabled=false;
}
