function renderPagina(grupo){
  const {page,data}=pagState[grupo];
  const tb=document.getElementById(`tbody-personas-${grupo}`);
  const bar=document.getElementById(`pag-bar-${grupo}`);
  const info=document.getElementById(`pag-info-${grupo}`);
  const btnPrev=document.getElementById(`pag-prev-${grupo}`);
  const btnNext=document.getElementById(`pag-next-${grupo}`);
  if(!tb) return;
  const colspan=7;
  if(!data.length){
    tb.innerHTML=`<tr class="empty-row"><td colspan="${colspan}">Sin resultados</td></tr>`;
    if(bar) bar.style.display='none';
    return;
  }
  const totalPags=Math.ceil(data.length/PAG_SIZE);
  const inicio=page*PAG_SIZE, fin=Math.min(inicio+PAG_SIZE,data.length);
  const slice=data.slice(inicio,fin);
  tb.innerHTML=grupo==='eng'?slice.map(rowHtmlEng).join(''):slice.map(rowHtml).join('');
  if(totalPags>1){
    if(bar) bar.style.display='flex';
    if(info) info.textContent=`${inicio+1}–${fin} de ${data.length} personas`;
    if(btnPrev) btnPrev.disabled=page===0;
    if(btnNext) btnNext.disabled=page>=totalPags-1;
  } else {
    if(bar) bar.style.display='none';
  }
}

function cambiarPaginaPersonas(grupo,dir){
  const totalPags=Math.ceil(pagState[grupo].data.length/PAG_SIZE);
  pagState[grupo].page=Math.max(0,Math.min(pagState[grupo].page+dir,totalPags-1));
  renderPagina(grupo);
  document.getElementById(`wrap-${grupo==='eng'?'engineers':'coreteam'}`)?.scrollIntoView({behavior:'smooth',block:'start'});
}
// ─── PERSONAS ────────────────────────────────────────────────────────────────
function calcAntiguedad(fechaStr){
  if(!fechaStr) return '—';
  const ing=new Date(fechaStr+'T12:00:00'), hoy=new Date();
  const anos=hoy.getFullYear()-ing.getFullYear()-((hoy.getMonth()<ing.getMonth()||(hoy.getMonth()===ing.getMonth()&&hoy.getDate()<ing.getDate()))?1:0);
  const meses=(hoy.getMonth()-ing.getMonth()+12)%12;
  if(anos===0) return meses===0?'< 1 mes':`${meses} mes${meses!==1?'es':''}`;
  if(meses===0) return `${anos} año${anos!==1?'s':''}`;
  return `${anos} año${anos!==1?'s':''} y ${meses} mes${meses!==1?'es':''}`;
}
function nivelBadgeHtml(recordId, nivelActual){
  const nivel=nivelActual||'Spark';
  return`<div class="nivel-select-wrap" id="nw-${recordId}">
    <button class="nivel-badge nivel-${nivel}" onclick="toggleNivelDropdown('${recordId}')">
      ${nivel}
    </button>
    <div class="nivel-dropdown" id="nd-${recordId}" style="display:none">
      ${NIVELES.map(n=>`<div class="nivel-option" onclick="cambiarNivel('${recordId}','${n}','${nivel}',event)">
        <span class="nivel-badge nivel-${n}" style="cursor:default">${n}</span>
      </div>`).join('')}
    </div>
  </div>`;
}

function nombreClickHtml(r){
  const nombre=r.fields.Nombre||'—';
  return`${avH(r.fields.Nombre)}<span class="persona-nombre-link" onclick="verFichaPersona('${r.id}')">${nombre}</span>`;
}

function rowHtmlEng(r){
  const f=r.fields, rol=f['Rol en empresa']||'';
  const nivel=f['Nivel Loyalty']||'Spark';
  return`<tr>
    <td>${nombreClickHtml(r)}</td>
    <td style="font-size:12px;color:var(--text2)">${f.Mail||'—'}</td>
    <td>${rol?`<span class="badge ${rolColor[rol]||'badge-gray'}">${rol}</span>`:'—'}</td>
    <td>${nivelBadgeHtml(r.id, nivel)}</td>
    <td style="font-size:12px">${f.Proyecto||'—'}</td>
    <td style="font-size:12px;color:var(--text2)">${calcAntiguedad(f['Fecha de ingreso'])}</td>
    <td style="font-size:12px;color:var(--text2)">${f.Manager||'—'}</td>
  </tr>`;
}

function rowHtml(r){
  const f=r.fields, rol=f['Rol en empresa']||'';
  const nivel=f['Nivel Loyalty']||'Spark';
  return`<tr>
    <td>${nombreClickHtml(r)}</td>
    <td style="font-size:12px;color:var(--text2)">${f.Mail||'—'}</td>
    <td>${rol?`<span class="badge ${rolColor[rol]||'badge-gray'}">${rol}</span>`:'—'}</td>
    <td>${nivelBadgeHtml(r.id, nivel)}</td>
    <td style="font-size:12px">${f.Proyecto||'—'}</td>
    <td style="font-size:12px;color:var(--text2)">${calcAntiguedad(f['Fecha de ingreso'])}</td>
    <td style="font-size:12px;color:var(--text2)">${f.Manager||'—'}</td>
  </tr>`;
}

// Ficha completa de la persona — se abre al clickear el nombre en la tabla,
// para no perder la info que se sacó de la vista principal (Mail, Proyecto,
// Antigüedad y Manager siguen en la tabla; el resto queda acá).
function verFichaPersona(id){
  const p=cachePersonasRaw.find(x=>x.id===id);
  if(!p){toast('No se encontró la persona',true);return;}
  const f=p.fields;
  const rol=f['Rol en empresa']||'';
  const nivel=f['Nivel Loyalty']||'Spark';
  const area=f['Área']||f['Area']||'';

  document.getElementById('pf-nombre').innerHTML=`${avH(f.Nombre)}<span>${f.Nombre||'—'}</span>`;
  document.getElementById('pf-subtitle').innerHTML=
    (rol?`<span class="badge ${rolColor[rol]||'badge-gray'}">${rol}</span>`:'')+
    `<span class="nivel-badge nivel-${nivel}" style="cursor:default">${nivel}</span>`;

  const row=(label,val)=>`<div class="side-panel-row"><span style="color:var(--text2)">${label}</span><span style="font-weight:600;text-align:right">${val||'—'}</span></div>`;
  document.getElementById('pf-body').innerHTML=
    row('Correo',f.Mail)+
    (area?row('Área',area):'')+
    row('Proyecto',f.Proyecto)+
    row('Manager',f.Manager)+
    row('País',f['País'])+
    row('Ciudad',f.Ciudad)+
    row('Fecha de ingreso',fmt(f['Fecha de ingreso']))+
    row('Antigüedad',calcAntiguedad(f['Fecha de ingreso']))+
    row('Fecha de cumpleaños',fmt(f['Fecha de cumpleaños']))+
    (f['Fecha de egreso']?row('Fecha de egreso',fmt(f['Fecha de egreso'])):'')+
    row('Comentarios',f.Comentarios);

  document.getElementById('pf-overlay').style.display='flex';
}

function closeFichaPersona(){
  document.getElementById('pf-overlay').style.display='none';
}

// Ya cumplió su último día de trabajo (Fecha de egreso vencida) — deja de
// contar como activo en Personas, aunque el registro se mantiene en Airtable.
function yaEgreso(r){
  const fe=r.fields['Fecha de egreso'];
  if(!fe) return false;
  const hoy=new Date();hoy.setHours(0,0,0,0);
  return new Date(fe+'T00:00:00')<=hoy;
}

async function loadPersonas(){
  const d=await atGet('Personas','&sort[0][field]=Nombre&sort[0][direction]=asc');
  const recs=d.records||[];
  cachePersonasRaw=recs;
  cachePersonasPorRol={TEM:[],Manager:[],Lead:[]};

  const activos=recs.filter(r=>!yaEgreso(r));
  const engineers=[], coreTeam=[];

  activos.forEach(r=>{
    const rol=(r.fields['Rol en empresa']||'').trim(),nom=r.fields.Nombre||'';
    if(!nom)return;
    if(rol==='TEM') cachePersonasPorRol.TEM.push(nom);
    if(rol==='Manager') cachePersonasPorRol.Manager.push(nom);
    if(rol==='Lead') cachePersonasPorRol.Lead.push(nom);
    if(CORE_TEAM_ROLES.has(rol)) coreTeam.push(r);
    else engineers.push(r); // Engineer y cualquier rol no clasificado va a Engineers
  });

  const allEng=[...engineers];

  document.getElementById('bc-engineers').textContent=allEng.length;
  document.getElementById('bc-coreteam').textContent=coreTeam.length;
  document.getElementById('m-personas').textContent=activos.length;
  document.getElementById('m-coreteam').textContent=coreTeam.length;
  document.getElementById('m-engineers').textContent=engineers.length;

  // Tabla Engineers & Tech
  document.getElementById('badge-personas-eng').textContent=`${allEng.length} personas`;
  pagState.eng={page:0,data:allEng,all:allEng};
  renderPagina('eng');

  // Tabla Core Team
  document.getElementById('badge-personas-core').textContent=`${coreTeam.length} personas`;
  pagState.core={page:0,data:coreTeam,all:coreTeam};
  renderPagina('core');

  poblarFiltrosPersonas();
  return recs;
}

// Cierra todos los dropdowns de nivel abiertos al hacer click fuera
document.addEventListener('click',()=>{
  document.querySelectorAll('.nivel-dropdown').forEach(d=>d.style.display='none');
});

function toggleNivelDropdown(recordId){
  event.stopPropagation();
  const dd=document.getElementById('nd-'+recordId);
  if(!dd) return;
  const wasOpen=dd.style.display==='block';
  document.querySelectorAll('.nivel-dropdown').forEach(d=>d.style.display='none');
  dd.style.display=wasOpen?'none':'block';
}

async function cambiarNivel(recordId, nuevoNivel, nivelAnterior, e){
  e.stopPropagation();
  // Cerrar dropdown
  document.getElementById('nd-'+recordId).style.display='none';
  if(nuevoNivel===nivelAnterior) return;

  // Actualizar badge visualmente de inmediato
  const nivelEmoji={Spark:'⚡',Ray:'☀️',Lightning:'🌩',Thunder:'🌪',Storm:'🌊'};
  const btn=document.querySelector(`#nw-${recordId} .nivel-badge`);
  if(btn){
    btn.className=`nivel-badge nivel-${nuevoNivel}`;
    btn.innerHTML=`${nuevoNivel}`;
    // Actualizar onclick del dropdown para reflejar nuevo nivel actual
    document.querySelector(`#nw-${recordId} .nivel-badge`).setAttribute('onclick',`toggleNivelDropdown('${recordId}')`);
  }

  // Guardar en Airtable
  try{
    await atPatch(`Personas/${recordId}`,{'Nivel Loyalty':nuevoNivel});
  }catch(err){
    toast('Error al guardar nivel: '+err.message,true);
    return;
  }

  // Obtener nombre de la persona para el recordatorio
  const persona=cachePersonasRaw.find(p=>p.id===recordId);
  const nombre=persona?.fields?.Nombre||'esta persona';

  // Notificar Slack
  const nivelEmojisSlack={Spark:'⚡',Ray:'☀️',Lightning:'🌩',Thunder:'🌪',Storm:'🌊'};
  await sendSlack(`${nivelEmojisSlack[nuevoNivel]||'⭐'} *Cambio de nivel Loyalty*\n*${nombre}* pasó de *${nivelAnterior}* a *${nuevoNivel}* 💪`);

  // Mostrar banner recordatorio en la pestaña donde vive esta persona
  // (Engineers & Tech y Core Team son pestañas separadas)
  const grupo=(pagState.core.all||[]).some(p=>p.id===recordId)?'core':'eng';
  mostrarRecordatorioBrevo(nombre, nuevoNivel, nivelAnterior, grupo);
}

function mostrarRecordatorioBrevo(nombre, nuevoNivel, nivelAnterior, grupo){
  // Remover banner anterior si existe
  const existing=document.getElementById('brevo-reminder-banner');
  if(existing) existing.remove();

  const nivelEmoji={Spark:'⚡',Ray:'☀️',Lightning:'🌩',Thunder:'🌪',Storm:'🌊'};
  const banner=document.createElement('div');
  banner.id='brevo-reminder-banner';
  banner.className='nivel-pending-banner';
  banner.innerHTML=`
    <i class="ti ti-mail"></i>
    <div style="flex:1">
      <strong>${nombre}</strong> subió al nivel <strong>${nuevoNivel}</strong>
      ${nivelAnterior&&nivelAnterior!=='Spark'?`<span style="color:var(--text3);font-weight:400"> (antes: ${nivelAnterior})</span>`:''}
      — Recordá enviar el mail de bienvenida desde Brevo
    </div>
    <button onclick="this.closest('.nivel-pending-banner').remove()" style="background:none;border:none;cursor:pointer;color:#9a6700;font-size:18px;padding:2px;line-height:1;">×</button>`;

  // Insertar arriba de la tabla correspondiente
  const wrap=document.getElementById(grupo==='core'?'wrap-coreteam':'wrap-engineers');
  if(wrap) wrap.parentNode.insertBefore(banner,wrap);

  // Auto-ocultar después de 20 segundos
  setTimeout(()=>banner.remove?.(), 20000);
  toast(`Nivel de ${nombre} actualizado a ${nuevoNivel} ✓`);
}
// Filtra sobre los datos completos (pagState[grupo].all), no sobre las filas
// ya renderizadas — así busca en TODAS las personas, no solo en la página actual.
// Engineers & Tech y Core Team viven en pestañas separadas, cada una con sus
// propios inputs (sufijo -eng / -core), así que se filtran de forma independiente.
function filtrarPersonas(grupo){
  const q=(document.getElementById(`personas-search-${grupo}`)?.value||'').trim().toLowerCase();
  const rol=document.getElementById(`personas-rol-${grupo}`)?.value||'';
  const loyalty=document.getElementById(`personas-loyalty-${grupo}`)?.value||'';
  const proyecto=document.getElementById(`personas-proyecto-${grupo}`)?.value||'';
  const manager=document.getElementById(`personas-manager-${grupo}`)?.value||'';

  const matchPersona=r=>{
    const f=r.fields;
    const nombre=(f.Nombre||'').toLowerCase(), mail=(f.Mail||'').toLowerCase(),
          proy=(f.Proyecto||'').toLowerCase(), ciudad=(f.Ciudad||'').toLowerCase();
    const matchQ=!q||nombre.includes(q)||mail.includes(q)||proy.includes(q)||ciudad.includes(q);
    const matchRol=!rol||(f['Rol en empresa']||'')===rol;
    const matchLoyalty=!loyalty||(f['Nivel Loyalty']||'Spark')===loyalty;
    const matchProyecto=!proyecto||(f.Proyecto||'')===proyecto;
    const matchManager=!manager||(f.Manager||'')===manager;
    return matchQ&&matchRol&&matchLoyalty&&matchProyecto&&matchManager;
  };

  const all=pagState[grupo].all||pagState[grupo].data;
  pagState[grupo].all=all;
  pagState[grupo].data=all.filter(matchPersona);
  pagState[grupo].page=0;
  renderPagina(grupo);

  const badge=document.getElementById(`badge-personas-${grupo}`);
  if(badge) badge.textContent=`${pagState[grupo].data.length} personas`;
}

function poblarFiltrosPersonas(){
  ['eng','core'].forEach(grupo=>{
    const datos=pagState[grupo].all||[];
    const proyectos=[...new Set(datos.map(p=>p.fields.Proyecto||'').filter(Boolean))].sort();
    const managers=[...new Set(datos.map(p=>p.fields.Manager||'').filter(Boolean))].sort();
    const selProy=document.getElementById(`personas-proyecto-${grupo}`);
    const selMgr=document.getElementById(`personas-manager-${grupo}`);
    if(selProy){
      selProy.innerHTML='<option value="">Todos los proyectos</option>'+proyectos.map(p=>`<option value="${p}">${p}</option>`).join('');
    }
    if(selMgr){
      selMgr.innerHTML='<option value="">Todos los managers</option>'+managers.map(m=>`<option value="${m}">${m}</option>`).join('');
    }
  });
}
