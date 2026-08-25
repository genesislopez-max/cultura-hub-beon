function renderPagina(grupo){
  const {page,data}=pagState[grupo];
  const tb=document.getElementById(`tbody-personas-${grupo}`);
  const bar=document.getElementById(`pag-bar-${grupo}`);
  const info=document.getElementById(`pag-info-${grupo}`);
  const btnPrev=document.getElementById(`pag-prev-${grupo}`);
  const btnNext=document.getElementById(`pag-next-${grupo}`);
  if(!tb) return;
  if(!data.length){
    tb.innerHTML=`<div class="et-empty">Sin resultados</div>`;
    if(bar) bar.style.display='none';
    return;
  }
  const totalPags=Math.ceil(data.length/PAG_SIZE);
  const inicio=page*PAG_SIZE, fin=Math.min(inicio+PAG_SIZE,data.length);
  const slice=data.slice(inicio,fin);
  tb.innerHTML=slice.map(grupo==='eng'?rowHtmlEng:rowHtmlCore).join('');
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
// Meses completos entre dos fechas, sin perder el día del mes: antes se
// calculaba el año completo restando 1 si todavía no llegó el aniversario
// (correcto), pero los meses salían de (hoy.mes - ingreso.mes), que ignora
// por completo el día — a pocos días de un aniversario, esa cuenta de meses
// daba 0 aunque casi se hubiera cumplido el año siguiente entero, mostrando
// por ejemplo "1 año" en vez de "1 año y 11 meses" (ver Engineers & Tech /
// Core Team, que mostraban una antigüedad muy por debajo de la real justo
// antes del aniversario, mientras que Aniversarios sí calculaba bien).
function calcAntiguedad(fechaStr,hoy=new Date()){
  if(!fechaStr) return '—';
  const ing=new Date(fechaStr+'T12:00:00');
  let mesesTotales=(hoy.getFullYear()-ing.getFullYear())*12+(hoy.getMonth()-ing.getMonth());
  if(hoy.getDate()<ing.getDate()) mesesTotales--;
  mesesTotales=Math.max(0,mesesTotales);
  const anos=Math.floor(mesesTotales/12), meses=mesesTotales%12;
  if(anos===0) return meses===0?'< 1 mes':`${meses} mes${meses!==1?'es':''}`;
  if(meses===0) return `${anos} año${anos!==1?'s':''}`;
  return `${anos} año${anos!==1?'s':''} y ${meses} mes${meses!==1?'es':''}`;
}

// Diseño "Engineers y Tech.dc.html" (claude.ai/design) — layout en grid en vez
// de <table>, reutilizado también en Core Team (mismas clases .et-*, misma
// estructura; solo cambia cómo se arma el badge de rol de cada uno).
const ET_PROJ_COLORS=['var(--blue)','var(--purple)','var(--green)','var(--amber)','var(--text-pink-accent)','var(--text-teal-accent)'];
function projColorEng(nombre){
  let sum=0; for(let i=0;i<nombre.length;i++) sum+=nombre.charCodeAt(i);
  return ET_PROJ_COLORS[sum%ET_PROJ_COLORS.length];
}
function projInitialEng(nombre){
  const m=(nombre||'').match(/[A-Za-z0-9]/);
  return m?m[0].toUpperCase():'·';
}
function nivelBadgeHtmlEng(recordId, nivelActual){
  const nivel=nivelActual||'Spark';
  const inner=n=>`<i class="ti ${NIVEL_ICONS[n]||'ti-award'}"></i>${n}`;
  return`<div class="nivel-select-wrap" id="nw-${recordId}">
    <button class="nivel-badge-et badge-nivel-${nivel}" onclick="toggleNivelDropdown('${recordId}')">
      ${inner(nivel)}
    </button>
    <div class="nivel-dropdown" id="nd-${recordId}" style="display:none">
      ${NIVELES.map(n=>`<div class="nivel-option" onclick="cambiarNivel('${recordId}','${n}','${nivel}',event)">
        <span class="nivel-badge-et badge-nivel-${n}" style="cursor:default">${inner(n)}</span>
      </div>`).join('')}
    </div>
  </div>`;
}
// Fila en grid compartida por Engineers & Tech y Core Team — solo cambia
// cómo arma cada uno el badge de rol (rolBadgeHtml), el resto de las columnas
// es idéntico.
function personaRowHtml(r, rolBadgeHtml){
  const f=r.fields;
  const nivel=normalizarNivel(f['Nivel Loyalty']);
  const nombre=f.Nombre||'—', manager=f.Manager||'', proyecto=f.Proyecto||'';
  const tenure=calcAntiguedad(f['Fecha de ingreso']);
  const newish=/mes|<\s*1/.test(tenure)&&!/año/.test(tenure);
  return`<div class="et-row">
    <div class="et-name-cell">
      ${avH(nombre)}
      <div class="et-name-info">
        <div class="et-name" onclick="verFichaPersona('${r.id}')">${nombre}</div>
        <div class="et-email">${f.Mail||'—'}</div>
      </div>
    </div>
    <div>${rolBadgeHtml}</div>
    <div>${nivelBadgeHtmlEng(r.id, nivel)}</div>
    <div class="et-proj-cell">${proyecto
      ?`<span class="et-proj-chip" style="background:${projColorEng(proyecto)}">${projInitialEng(proyecto)}</span><span class="et-proj-name">${proyecto}</span>`
      :'<span style="color:var(--text3);font-size:12px">—</span>'}</div>
    <div class="et-ten-cell"><i class="ti ti-clock" style="color:${newish?'var(--green)':'var(--text3)'}"></i><span>${tenure}</span></div>
    <div class="et-mgr-cell">${manager
      ?`<span class="et-mgr-avatar">${ini(manager)}</span><span class="et-mgr-name">${manager}</span>`
      :'<span style="color:var(--text3);font-size:12px">—</span>'}</div>
    <div class="et-open"><button onclick="event.stopPropagation();verFichaPersona('${r.id}')"><i class="ti ti-chevron-right"></i></button></div>
  </div>`;
}
function rowHtmlEng(r){
  const rol=r.fields['Rol en empresa']||'Engineer';
  return personaRowHtml(r, rol?`<span class="badge badge-blue"><i class="ti ti-code"></i>${rol}</span>`:'—');
}
function rowHtmlCore(r){
  const rol=r.fields['Rol en empresa']||'';
  return personaRowHtml(r, rol?`<span class="badge ${rolColor[rol]||'badge-gray'}"><i class="ti ti-briefcase"></i>${rol}</span>`:'—');
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

  // Tendencia del hero "Total equipo": activos hoy vs. activos hace un mes
  // (personaActivaEnFecha ya existe para esto — mismo criterio que usan
  // Off Sites/Asistencia a Actividades para "quién estaba activo" en una
  // fecha dada).
  const haceUnMes=new Date();haceUnMes.setMonth(haceUnMes.getMonth()-1);
  const haceUnMesStr=`${haceUnMes.getFullYear()}-${String(haceUnMes.getMonth()+1).padStart(2,'0')}-${String(haceUnMes.getDate()).padStart(2,'0')}`;
  const activosHaceUnMes=recs.filter(r=>personaActivaEnFecha(r,haceUnMesStr)).length;
  const delta=activos.length-activosHaceUnMes;
  const trendEl=document.getElementById('m-personas-trend');
  const trendTxt=document.getElementById('m-personas-trend-txt');
  if(trendEl&&trendTxt){
    if(delta!==0){
      trendEl.style.display='flex';
      trendEl.querySelector('i').className=delta>0?'ti ti-trending-up':'ti ti-trending-down';
      trendTxt.textContent=`${delta>0?'+':''}${delta} vs. mes anterior`;
    } else {
      trendEl.style.display='none';
    }
  }
  const barCoreteam=document.getElementById('m-coreteam-bar'), barEng=document.getElementById('m-engineers-bar');
  const lblCoreteam=document.getElementById('m-coreteam-barlabel'), lblEng=document.getElementById('m-engineers-barlabel');
  if(activos.length){
    const pctCore=Math.round(coreTeam.length/activos.length*100), pctEng=Math.round(engineers.length/activos.length*100);
    if(barCoreteam) barCoreteam.style.width=`${pctCore}%`;
    if(lblCoreteam) lblCoreteam.textContent=`${pctCore}% del total del equipo`;
    if(barEng) barEng.style.width=`${pctEng}%`;
    if(lblEng) lblEng.textContent=`${pctEng}% del total del equipo`;
  }

  // Tabla Engineers & Tech
  document.getElementById('badge-personas-eng').textContent=`${allEng.length} personas`;
  pagState.eng={page:0,data:allEng,all:allEng};
  renderPagina('eng');
  renderETKpi(allEng,'et-kpi-strip');

  // Tabla Core Team
  document.getElementById('badge-personas-core').textContent=`${coreTeam.length} personas`;
  pagState.core={page:0,data:coreTeam,all:coreTeam};
  renderPagina('core');
  renderETKpi(coreTeam,'ct-kpi-strip');

  poblarFiltrosPersonas();
  return recs;
}

// Descarga el roster completo del equipo activo hoy — botón "Exportar" del
// header de Inicio. Mismo mecanismo que exportarAVPersonaExcel() en
// actividades-virtuales.js (SheetJS por CDN, se arma todo en el navegador).
function exportarRosterExcel(){
  if(typeof XLSX==='undefined'){ toast('No se pudo cargar el generador de Excel',true); return; }
  const activos=(cachePersonasRaw||[]).filter(p=>!yaEgreso(p));
  if(!activos.length){ toast('No hay personas activas para exportar',true); return; }

  const filas=activos
    .slice()
    .sort((a,b)=>(a.fields.Nombre||'').localeCompare(b.fields.Nombre||''))
    .map(p=>{
      const f=p.fields;
      return {
        Nombre:f.Nombre||'—',
        Rol:f['Rol en empresa']||'—',
        Grupo:getRolGroup(f['Rol en empresa']||''),
        Proyecto:f.Proyecto||'—',
        Manager:f.Manager||'—',
        Antigüedad:calcAntiguedad(f['Fecha de ingreso']),
        'Nivel Loyalty':f['Nivel Loyalty']||'Spark',
      };
    });

  const ws=XLSX.utils.json_to_sheet(filas);
  ws['!cols']=[{wch:28},{wch:16},{wch:12},{wch:20},{wch:20},{wch:16},{wch:14}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Roster');
  XLSX.writeFile(wb,'Roster del equipo.xlsx');
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
  if(wasOpen) return;
  // El dropdown vive dentro de .et-panel, que tiene overflow:hidden para
  // recortar sus bordes redondeados — con position:absolute (el default de
  // .nivel-dropdown) eso lo recorta apenas la fila queda última visible
  // (ej. al filtrar/buscar y quedar una sola persona). position:fixed con
  // coordenadas calculadas desde el botón escapa de ese recorte sin tocar el
  // overflow:hidden del panel.
  const btn=dd.parentElement.querySelector('.nivel-badge-et');
  const rect=btn.getBoundingClientRect();
  dd.style.position='fixed';
  dd.style.left=rect.left+'px';
  dd.style.top=(rect.bottom+4)+'px';
  dd.style.display='block';
  // Si no entra hacia abajo dentro del viewport, abrir hacia arriba.
  const ddRect=dd.getBoundingClientRect();
  if(ddRect.bottom>window.innerHeight){
    dd.style.top=(rect.top-ddRect.height-4)+'px';
  }
}

async function cambiarNivel(recordId, nuevoNivel, nivelAnterior, e){
  e.stopPropagation();
  // Cerrar dropdown
  document.getElementById('nd-'+recordId).style.display='none';
  if(nuevoNivel===nivelAnterior) return;

  // Actualizar badge visualmente de inmediato — Engineers & Tech y Core Team
  // comparten el mismo badge con ícono (nivel-badge-et, diseño
  // "Engineers y Tech.dc.html").
  const btn=document.querySelector(`#nw-${recordId} .nivel-badge-et`);
  if(btn){
    btn.className=`nivel-badge-et badge-nivel-${nuevoNivel}`;
    btn.innerHTML=`<i class="ti ${NIVEL_ICONS[nuevoNivel]||'ti-award'}"></i>${nuevoNivel}`;
    // Actualizar onclick del dropdown para reflejar nuevo nivel actual
    btn.setAttribute('onclick',`toggleNivelDropdown('${recordId}')`);
  }

  // Actualizar el registro en cache (mismo objeto referenciado por
  // pagState.eng/core .all/.data, ya que vienen de filter()/spread sobre
  // cachePersonasRaw, no de una copia profunda) — si no, el filtro por nivel
  // y el KPI de Engineers & Tech / Core Team siguen viendo el nivel viejo
  // hasta recargar.
  const persona=cachePersonasRaw.find(p=>p.id===recordId);
  if(persona) persona.fields['Nivel Loyalty']=nuevoNivel;
  if(pagState.eng?.all?.some(p=>p.id===recordId)) renderETKpi(pagState.eng.all,'et-kpi-strip');
  if(pagState.core?.all?.some(p=>p.id===recordId)) renderETKpi(pagState.core.all,'ct-kpi-strip');

  // Guardar en Airtable
  try{
    await atPatch(`Personas/${recordId}`,{'Nivel Loyalty':nuevoNivel});
  }catch(err){
    toast('Error al guardar nivel: '+err.message,true);
    return;
  }

  // Nombre de la persona para el recordatorio
  const nombre=persona?.fields?.Nombre||'esta persona';

  // Registrar el cambio para el resumen mensual de Slack del último día hábil
  // (ver api/cron-loyalty-mensual.js) — best-effort: no bloquea el cambio de
  // nivel, que ya quedó guardado arriba.
  // Fecha con los getters LOCALES (no toISOString, que pasa a UTC): un
  // cambio hecho entre las 21:00 y medianoche en Argentina cae en el día
  // siguiente en UTC, y podía quedar en el mes equivocado para el cron.
  const hoyLocal=new Date();
  const fechaHistorial=`${hoyLocal.getFullYear()}-${String(hoyLocal.getMonth()+1).padStart(2,'0')}-${String(hoyLocal.getDate()).padStart(2,'0')}`;
  let falloHistorial=false;
  try{
    await atPost('Historial Loyalty',{
      Persona:nombre,
      'Nivel anterior':nivelAnterior,
      'Nivel nuevo':nuevoNivel,
      Fecha:fechaHistorial,
    });
  }catch(err){
    // Antes esto era un .catch(()=>{}) mudo, y era el peor lugar para el
    // silencio: si la tabla no existe o le falta un campo, el cambio de nivel
    // se guarda igual pero NUNCA entra al resumen mensual, y no había forma de
    // notarlo hasta preguntarse por qué el resumen llega vacío.
    console.error('No se pudo registrar el cambio en "Historial Loyalty":',err.message);
    falloHistorial=true;
  }

  // Notificar Slack
  const nivelEmojisSlack={Spark:'⚡',Ray:'☀️',Lightning:'🌩',Thunder:'🌪',Storm:'🌊'};
  await sendSlack(`${nivelEmojisSlack[nuevoNivel]||'⭐'} *Cambio de nivel Loyalty*\n*${nombre}* pasó de *${nivelAnterior}* a *${nuevoNivel}* 💪`);

  // Mostrar banner recordatorio en la pestaña donde vive esta persona
  // (Engineers & Tech y Core Team son pestañas separadas)
  const grupo=(pagState.core.all||[]).some(p=>p.id===recordId)?'core':'eng';
  mostrarRecordatorioBrevo(nombre, nuevoNivel, nivelAnterior, grupo);

  // Va último a propósito: mostrarRecordatorioBrevo() termina con el toast de
  // "Nivel actualizado ✓", y si el aviso saliera antes ese toast lo tapaba.
  if(falloHistorial){
    toast('⚠️ El nivel se guardó, pero el cambio no quedó registrado para el resumen mensual de Slack (revisá la tabla "Historial Loyalty").',true);
  }
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
    <button onclick="this.closest('.nivel-pending-banner').remove()" style="background:none;border:none;cursor:pointer;color:var(--amber);font-size:18px;padding:2px;line-height:1;">×</button>`;

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
// País/Ciudad se cargan a mano en Airtable, así que llegan con espacios de más
// y mayúsculas inconsistentes ("Buenos Aires" / "buenos aires ") — y en algunas
// bases el campo es un linked record, que llega como array. Se normaliza acá
// una sola vez para que el <select> no muestre la misma ciudad dos veces y el
// filtro matchee igual sin importar cómo se escribió.
function valorUbicacion(valor){
  if(Array.isArray(valor)) valor=valor[0];
  return (valor||'').toString().trim();
}
function filtrarPersonas(grupo){
  const q=(document.getElementById(`personas-search-${grupo}`)?.value||'').trim().toLowerCase();
  const rol=document.getElementById(`personas-rol-${grupo}`)?.value||'';
  const loyalty=document.getElementById(`personas-loyalty-${grupo}`)?.value||'';
  const proyecto=document.getElementById(`personas-proyecto-${grupo}`)?.value||'';
  const manager=document.getElementById(`personas-manager-${grupo}`)?.value||'';
  const pais=(document.getElementById(`personas-pais-${grupo}`)?.value||'').toLowerCase();
  const ciudadFil=(document.getElementById(`personas-ciudad-${grupo}`)?.value||'').toLowerCase();

  const matchPersona=r=>{
    const f=r.fields;
    const nombre=(f.Nombre||'').toLowerCase(), mail=(f.Mail||'').toLowerCase(),
          proy=(f.Proyecto||'').toLowerCase(), ciudad=valorUbicacion(f.Ciudad).toLowerCase();
    const matchQ=!q||nombre.includes(q)||mail.includes(q)||proy.includes(q)||ciudad.includes(q);
    const matchRol=!rol||(f['Rol en empresa']||'')===rol;
    const matchLoyalty=!loyalty||normalizarNivel(f['Nivel Loyalty'])===loyalty;
    const matchProyecto=!proyecto||(f.Proyecto||'')===proyecto;
    const matchManager=!manager||(f.Manager||'')===manager;
    const matchPais=!pais||valorUbicacion(f['País']).toLowerCase()===pais;
    const matchCiudad=!ciudadFil||ciudad===ciudadFil;
    return matchQ&&matchRol&&matchLoyalty&&matchProyecto&&matchManager&&matchPais&&matchCiudad;
  };

  const all=pagState[grupo].all||pagState[grupo].data;
  pagState[grupo].all=all;
  pagState[grupo].data=all.filter(matchPersona);
  pagState[grupo].page=0;
  renderPagina(grupo);

  const badge=document.getElementById(`badge-personas-${grupo}`);
  if(badge) badge.textContent=`${pagState[grupo].data.length} personas`;
  actualizarEstiloFiltrosET();
}

// TEM real (Rol en empresa==='TEM') + Valentina Poblet — caso puntual: hace
// de TEM de Engineers aunque su rol en Airtable no está tageado como tal.
// A diferencia de listaTEMs() (usada en Core Team y el resto de la app, que
// acepta cualquier LIDER_ROLES), acá el filtro de Engineers & Tech es
// estricto: solo TEMs de verdad, más esta excepción.
function listaTEMsEngineers(){
  const nombres=new Set(cachePersonasRaw
    .filter(p=>!yaEgreso(p)&&(p.fields['Rol en empresa']||'').trim()==='TEM')
    .map(p=>p.fields.Nombre));
  if(cachePersonasRaw.some(p=>!yaEgreso(p)&&(p.fields.Nombre||'').trim()==='Valentina Poblet')){
    nombres.add('Valentina Poblet');
  }
  return[...nombres].sort();
}
function poblarFiltrosPersonas(){
  ['eng','core'].forEach(grupo=>{
    const datos=pagState[grupo].all||[];
    const proyectos=[...new Set(datos.map(p=>p.fields.Proyecto||'').filter(Boolean))].sort();
    // Engineers & Tech es estricto (solo TEM + Valentina Poblet); Core Team
    // usa listaTEMs() (cualquier LIDER_ROLES), porque ahí se puede reportar
    // a un Lead/Manager/Supervisor/etc., no solo a un TEM.
    const managers=grupo==='eng'?listaTEMsEngineers():listaTEMs();
    const selProy=document.getElementById(`personas-proyecto-${grupo}`);
    const selMgr=document.getElementById(`personas-manager-${grupo}`);
    if(selProy){
      selProy.innerHTML='<option value="">Todos los proyectos</option>'+proyectos.map(p=>`<option value="${p}">${p}</option>`).join('');
    }
    if(selMgr){
      // "TEM" es específico de Engineers & Tech — Core Team puede reportarle
      // a cualquier líder (Lead, Manager, Supervisor, etc.), así que ahí el
      // copy dice "managers" en vez de "TEMs".
      const placeholder=grupo==='eng'?'Todos los TEMs':'Todos los managers';
      selMgr.innerHTML=`<option value="">${placeholder}</option>`+managers.map(m=>`<option value="${m}">${m}</option>`).join('');
    }
    poblarFiltroPais(grupo);
    poblarFiltroCiudad(grupo);
  });
  actualizarEstiloFiltrosET();
}

// Dedup case-insensitive preservando la primera forma vista, para que
// "Buenos Aires" y "buenos aires " no aparezcan como dos opciones distintas.
function opcionesUnicas(valores){
  const vistos=new Map();
  valores.filter(Boolean).forEach(v=>{
    const clave=v.toLowerCase();
    if(!vistos.has(clave)) vistos.set(clave,v);
  });
  return [...vistos.values()].sort((a,b)=>a.localeCompare(b,'es'));
}

function poblarFiltroPais(grupo){
  const sel=document.getElementById(`personas-pais-${grupo}`);
  if(!sel) return;
  const previo=sel.value;
  const paises=opcionesUnicas((pagState[grupo].all||[]).map(p=>valorUbicacion(p.fields['País'])));
  sel.innerHTML='<option value="">Todos los países</option>'+paises.map(p=>`<option value="${p}">${p}</option>`).join('');
  // Preservar la selección si sigue existiendo (poblarFiltrosPersonas() se
  // vuelve a llamar en cada recarga de datos).
  if(previo&&paises.some(p=>p.toLowerCase()===previo.toLowerCase())) sel.value=previo;
}

// La ciudad se acota al país elegido: sin esto se puede combinar
// País=Argentina con Ciudad=Bogotá y la lista queda vacía sin motivo claro.
function poblarFiltroCiudad(grupo){
  const sel=document.getElementById(`personas-ciudad-${grupo}`);
  if(!sel) return;
  const previo=sel.value;
  const pais=(document.getElementById(`personas-pais-${grupo}`)?.value||'').toLowerCase();
  const ciudades=opcionesUnicas((pagState[grupo].all||[])
    .filter(p=>!pais||valorUbicacion(p.fields['País']).toLowerCase()===pais)
    .map(p=>valorUbicacion(p.fields.Ciudad)));
  sel.innerHTML='<option value="">Todas las ciudades</option>'+ciudades.map(c=>`<option value="${c}">${c}</option>`).join('');
  if(previo&&ciudades.some(c=>c.toLowerCase()===previo.toLowerCase())) sel.value=previo;
}

// Al cambiar el país hay que reconstruir las ciudades antes de filtrar — si la
// ciudad que estaba elegida no existe en el país nuevo, queda deseleccionada.
function cambiarPaisPersonas(grupo){
  poblarFiltroCiudad(grupo);
  filtrarPersonas(grupo);
}

// KPI strip por nivel Loyalty de Engineers & Tech (diseño "Engineers y Tech.dc.html").
// Cualquier valor de "Nivel Loyalty" que no matchee exactamente uno de los 5
// niveles (typo, mayúsculas distintas, espacios) antes se perdía en silencio:
// en el KPI quedaba sumado bajo una clave que el strip nunca renderiza (el
// total de las 5 tarjetas terminaba siendo menor a la cantidad real de
// Engineers), y en el filtro por nivel esa persona nunca matcheaba ninguna
// opción. Se normaliza acá una sola vez para que ambos usen el mismo criterio.
function normalizarNivel(valor){
  const crudo=(valor||'').trim();
  return NIVELES.find(niv=>niv.toLowerCase()===crudo.toLowerCase())||'Spark';
}
function renderETKpi(lista,containerId){
  const cont=document.getElementById(containerId||'et-kpi-strip');
  if(!cont) return;
  const conteo={};
  NIVELES.forEach(n=>conteo[n]=0);
  lista.forEach(p=>{
    conteo[normalizarNivel(p.fields['Nivel Loyalty'])]++;
  });
  cont.innerHTML=[...NIVELES].reverse().map(n=>`
    <div class="et-kpi-card">
      <div class="et-kpi-icon badge-nivel-${n}"><i class="ti ${NIVEL_ICONS[n]||'ti-award'}"></i></div>
      <div>
        <div class="et-kpi-val">${conteo[n]}</div>
        <div class="et-kpi-label">${n}</div>
      </div>
    </div>`).join('');
}

// Resalta en azul los selects de Engineers & Tech / Core Team que tienen un
// filtro activo (diseño "Engineers y Tech.dc.html").
function actualizarEstiloFiltrosET(){
  ['personas-loyalty-eng','personas-proyecto-eng','personas-manager-eng','personas-pais-eng','personas-ciudad-eng',
   'personas-rol-core','personas-loyalty-core','personas-proyecto-core','personas-manager-core','personas-pais-core','personas-ciudad-core'].forEach(id=>{
    const sel=document.getElementById(id);
    if(sel) sel.classList.toggle('et-active',!!sel.value);
  });
}
