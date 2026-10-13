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
  const nivel=normalizarNivel(nivelActual);
  const inner=n=>`<i class="ti ${iconoNivel(n)}"></i>${n}`;
  // En modo lectura el nivel se muestra igual, pero como badge y no como
  // desplegable: sin esto el menú se abría y el cambio moría en un 403.
  if(!puedeEscribir()){
    return `<span class="nivel-badge-et badge-nivel-${nivel}" style="cursor:default">${inner(nivel)}</span>`;
  }
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
// Qué hace cada persona técnicamente: MERN, iOS, QA, Data… Es un dato aparte
// de "Rol en empresa", que dice a qué grupo pertenece (Engineer, TEM, Lead,
// Core Team…) y define a qué pestaña va y quién puede ser su manager. Mezclar
// los dos rompería esa clasificación: un engineer MERN dejaría de ser Engineer.
// Lo llevan sobre todo los Engineers, pero también hay gente de Core Team con
// un rol técnico, así que el campo es de cualquiera y opcional.
// Hay gente con más de uno (alguien full stack que además hace QA), así que en
// Airtable es un Multiple Select y llega como array. Se acepta igual un string
// suelto: si el campo se hubiera creado como Single Select o como texto, los
// valores separados por coma se siguen leyendo bien en vez de romper.
// En qué equipo está la persona (People, Finance…). Se acepta la variante sin
// tilde porque el campo se creó a mano en Airtable y las dos formas existen.
function areaDe(r){
  return (r?.fields?.['Área']||r?.fields?.['Area']||'').trim();
}

// Las áreas ya cargadas, para ofrecerlas en el form sin mantener una lista
// fija: el catálogo lo define quien completa el campo.
function areasCargadas(){
  return [...new Set((cachePersonasRaw||[]).map(areaDe).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
}

function rolesTecnicos(r){
  const valor=r?.fields?.['Rol técnico']??r?.fields?.['Rol tecnico'];
  const lista=Array.isArray(valor)?valor:String(valor||'').split(',');
  return lista.map(x=>String(x||'').trim()).filter(Boolean);
}
function rolTecnicoTexto(r){ return rolesTecnicos(r).join(' · '); }
function rolesTecnicosCargados(){
  return [...new Set((cachePersonasRaw||[]).flatMap(rolesTecnicos))].sort((a,b)=>a.localeCompare(b,'es'));
}

// Fila en grid compartida por Engineers & Tech y Core Team — solo cambia
// cómo arma cada uno el badge de rol (rolBadgeHtml), el resto de las columnas
// es idéntico.
// celdaExtra: una columna más, después del badge de rol. Hoy la usa solo Core
// Team, para el Área (en qué equipo está la persona). Engineers no la manda y
// su tabla queda igual que antes.
function personaRowHtml(r, rolBadgeHtml, celdaExtra){
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
    ${celdaExtra||''}
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
// En Engineers & Tech esa columna decía "Engineer" en todas las filas: no
// distinguía a nadie. Ahí va el rol técnico, y si todavía no está cargado se
// cae al rol en empresa para no dejar la celda vacía.
function rowHtmlEng(r){
  const tec=rolesTecnicos(r);
  if(!tec.length){
    const rol=r.fields['Rol en empresa']||'Engineer';
    return personaRowHtml(r, `<span class="badge badge-gray" title="Sin rol técnico cargado"><i class="ti ti-code"></i>${rol}</span>`);
  }
  // Uno por badge: con dos o tres roles, un solo chip con todo adentro se
  // vuelve ilegible y además no se distingue de un rol que se llame así.
  return personaRowHtml(r, tec.map(t=>`<span class="badge badge-blue" style="margin-right:3px" title="Rol técnico"><i class="ti ti-code"></i>${t}</span>`).join(''));
}
// En Core Team el rol en empresa sí distingue (Manager, Lead, TEM…), así que
// se queda, y el rol técnico se suma al lado cuando la persona tiene uno.
function rowHtmlCore(r){
  const rol=r.fields['Rol en empresa']||'';
  const tec=rolesTecnicos(r);
  const badgeRol=rol?`<span class="badge ${rolColor[rol]||'badge-gray'}"><i class="ti ti-briefcase"></i>${rol}</span>`:'—';
  const area=areaDe(r);
  const celdaArea=`<div class="et-area-cell">${area
    ?`<span class="badge badge-gray"><i class="ti ti-users-group"></i>${area}</span>`
    :'<span style="color:var(--text3);font-size:12px">—</span>'}</div>`;
  return personaRowHtml(r, badgeRol+tec.map(t=>`<span class="badge badge-blue" style="margin-left:4px" title="Rol técnico"><i class="ti ti-code"></i>${t}</span>`).join(''), celdaArea);
}

// Ficha completa de la persona — se abre al clickear el nombre en la tabla,
// para no perder la info que se sacó de la vista principal (Mail, Proyecto,
// Antigüedad y Manager siguen en la tabla; el resto queda acá).
function verFichaPersona(id){
  const p=cachePersonasRaw.find(x=>x.id===id);
  if(!p){toast('No se encontró la persona',true);return;}
  const f=p.fields;
  const rol=f['Rol en empresa']||'';
  const nivel=normalizarNivel(f['Nivel Loyalty']);
  const area=areaDe({fields:f});

  document.getElementById('pf-nombre').innerHTML=`${avH(f.Nombre)}<span>${f.Nombre||'—'}</span>`;
  // Tercera variante del badge que había en el Hub: sin ícono y con la clase
  // de color vieja (nivel-X en vez de badge-nivel-X, mismos colores). Pasa por
  // el helper para que se vea igual que en Engineers y Beneficios.
  document.getElementById('pf-subtitle').innerHTML=
    (rol?`<span class="badge ${rolColor[rol]||'badge-gray'}">${rol}</span>`:'')+
    badgeNivelHtml(nivel,'nivel-badge');

  const row=(label,val)=>`<div class="side-panel-row"><span style="color:var(--text2)">${label}</span><span style="font-weight:600;text-align:right">${val||'—'}</span></div>`;
  document.getElementById('pf-body').innerHTML=
    row('Correo',f.Mail)+
    (area?row('Área',area):'')+
    (rolTecnicoTexto({fields:f})?row('Rol técnico',rolTecnicoTexto({fields:f})):'')+
    row('Proyecto',f.Proyecto)+
    row('Manager',f.Manager)+
    row('País',f['País'])+
    row('Ciudad',f.Ciudad)+
    row('Fecha de ingreso',fmt(f['Fecha de ingreso']))+
    row('Antigüedad',calcAntiguedad(f['Fecha de ingreso']))+
    row('Fecha de cumpleaños',fmt(f['Fecha de cumpleaños']))+
    (f['Fecha de egreso']?row(reingresoVigente({fields:f})?'Paso anterior por BEON':'Fecha de egreso',periodosEnBeonTexto(f)):'')+
    row('Comentarios',f.Comentarios)+
    `<div id="pf-extra" class="pf-extra" data-persona="${(f.Nombre||'').replace(/"/g,'&quot;')}"><div class="pf-extra-cargando">Cargando el resto de la info…</div></div>`;

  // Hasta ahora la ficha era solo de lectura y la edición vivía únicamente en
  // las tarjetas de los Kanban: para corregirle el área o el rol técnico a
  // alguien del directorio había que buscarlo en Ingresos/Egresos. El botón
  // abre el mismo formulario de siempre.
  const btnEditar=document.getElementById('pf-editar');
  if(btnEditar){
    btnEditar.style.display=puedeEscribir()?'inline-flex':'none';
    btnEditar.onclick=()=>{ closeFichaPersona(); abrirEdicionPersona(f.Nombre||''); };
  }
  document.getElementById('pf-overlay').style.display='flex';
  // Los datos personales se pintan ya; el resto llega después. Sin await: que
  // seis consultas a Airtable retrasen la apertura del panel sería peor que
  // verlo completarse.
  renderResumenPersona(f.Nombre||'');
}

// ─── Resumen de actividad de la persona ───────────────────────────────────────
// Todo lo que el Hub sabe de alguien vivía repartido: los datos personales acá
// y beneficios/certificaciones/actividades/viajes en otra card (Beneficios →
// Por persona). Para verlo junto sin que abrume, va en secciones plegadas, cada
// una con su contador: de un vistazo se ve CUÁNTO hay de cada cosa, y se abre
// solo lo que interesa.
//
// Es un resumen, no un reemplazo: una línea por registro. El detalle completo
// (montos, estados, links, edición) sigue en la card de Beneficios.
const PF_SECCIONES=[
  {clave:'beneficios', titulo:'Beneficios',                icono:'ti-gift'},
  {clave:'certifs',    titulo:'Certifications Sponsorship',icono:'ti-certificate'},
  {clave:'actividades',titulo:'Actividades',               icono:'ti-presentation'},
  {clave:'aw',         titulo:'Ambassador Week',           icono:'ti-star'},
  {clave:'offsites',   titulo:'Off Sites',                 icono:'ti-plane'},
  {clave:'gt',         titulo:'Get Togethers',             icono:'ti-users-group'},
];

async function renderResumenPersona(nombre){
  const cont=document.getElementById('pf-extra');
  if(!cont||!nombre) return;
  const esc=nombre.replace(/"/g,'\\"');
  const pedir=(tabla,qs)=>atGet(tabla,qs).catch(()=>({records:[]}));
  // El catálogo de beneficios (cacheBeneficiosRaw) lo llena loadBeneficios(),
  // que es LAZY: corre recién al entrar a la sección Beneficios. Esta ficha se
  // abre desde Engineers & Tech, así que muchas veces el cache está vacío y sin
  // él los beneficios salían con el id crudo de Airtable (recIIgV8A2X5Wheyk…)
  // en vez del nombre. Se pide solo si hace falta.
  const faltaCatalogo=!(cacheBeneficiosRaw&&cacheBeneficiosRaw.length);
  const [dBen,dCap,dAV,dAW,dOS,dGT,dCat]=await Promise.all([
    pedir('Beneficios Asignados',`&filterByFormula=FIND("${esc}",{Persona})`),
    pedir('Capacitaciones',`&filterByFormula=FIND("${esc}",{Persona})`),
    pedir('Asistencia a Actividades',`&filterByFormula=FIND("${esc}",{Persona})&sort[0][field]=Fecha&sort[0][direction]=desc`),
    // Ambassador Week no tiene campo Fecha — pedir sort por Fecha hace que
    // Airtable rechace el pedido entero (ver verBenefPersona en side-panel.js).
    pedir('Ambassador Week',`&filterByFormula=FIND("${esc}",{Persona})`),
    pedir('Off Sites',`&filterByFormula=FIND("${esc}",{Persona})&sort[0][field]=Fecha inicio&sort[0][direction]=desc`),
    pedir('Get Together',`&filterByFormula=FIND("${esc}",{BEONer})&sort[0][field]=Fecha&sort[0][direction]=desc`),
    faltaCatalogo?pedir('Beneficios',''):Promise.resolve(null),
  ]);

  // El panel puede haberse cerrado (o abierto sobre otra persona) mientras
  // llegaban las consultas: sin este chequeo, el resumen de una persona podría
  // pintarse dentro de la ficha de otra. Se compara contra data-persona y no
  // contra el título visible, que incluye las iniciales del avatar.
  const contAhora=document.getElementById('pf-extra');
  if(!contAhora||contAhora.dataset.persona!==nombre) return;
  if(document.getElementById('pf-overlay')?.style.display==='none') return;

  const catalogo=faltaCatalogo?(dCat?.records||[]):cacheBeneficiosRaw;
  // Por id O por nombre, igual que verBenefPersona: el campo Beneficio puede
  // venir como linked record (id) o ya resuelto a texto según de dónde salga.
  const nombreBenef=r=>{
    const ref=Array.isArray(r.fields.Beneficio)?r.fields.Beneficio[0]:r.fields.Beneficio;
    return catalogo.find(b=>b.id===ref||b.fields.Beneficio===ref)?.fields.Beneficio||ref||'—';
  };
  const items={
    beneficios:ordenarBenefAsignados((dBen.records||[]).map(r=>({r,nombre:nombreBenef(r)})))
      .map(({r,nombre:n})=>({txt:n,meta:r.fields.Estado||'Activo'})),
    certifs:(dCap.records||[]).map(r=>({txt:r.fields['Descripción']||'—',meta:r.fields.Fecha?fmt(r.fields.Fecha):''})),
    // Deduplicadas por evento+fecha, igual que agruparAVPorEvento: con carga
    // manual es normal que quede más de una fila por la misma actividad.
    actividades:[...new Map((dAV.records||[]).map(r=>[`${r.fields.Evento||''}|${r.fields.Fecha||''}`,r])).values()]
      .map(r=>({txt:r.fields.Evento||'—',meta:r.fields.Fecha?fmt(r.fields.Fecha):''})),
    aw:(dAW.records||[]).map(r=>({txt:getEdicionAW(r.fields)||'Edición sin cargar',meta:''})),
    offsites:(dOS.records||[]).map(r=>({txt:r.fields.Destino||'—',meta:r.fields['Fecha inicio']?fmt(r.fields['Fecha inicio']):''})),
    gt:(dGT.records||[]).map(r=>({txt:r.fields.Ciudad||'—',meta:r.fields.Fecha?fmt(r.fields.Fecha):''})),
  };

  contAhora.innerHTML=PF_SECCIONES.map(s=>{
    const lista=items[s.clave]||[];
    // Las secciones vacías se muestran igual, deshabilitadas: "0" es
    // información (no tiene beneficios cargados), y esconderlas haría que el
    // panel cambiara de forma según la persona.
    const vacia=!lista.length;
    return`<details class="pf-sec"${vacia?'':''}>
      <summary class="pf-sec-sum${vacia?' pf-sec-vacia':''}">
        <i class="ti ${s.icono}"></i>
        <span class="pf-sec-titulo">${s.titulo}</span>
        <span class="pf-sec-count">${lista.length}</span>
        <i class="ti ti-chevron-down pf-sec-chev"></i>
      </summary>
      ${vacia
        ?`<div class="pf-sec-empty">Sin registros</div>`
        :`<div class="pf-sec-body">${lista.map(i=>
            `<div class="pf-sec-item"><span class="pf-sec-item-txt">${i.txt}</span>${i.meta?`<span class="pf-sec-item-meta">${i.meta}</span>`:''}</div>`
          ).join('')}</div>`}
    </details>`;
  }).join('');
}

// Qué decir en la ficha de alguien que tiene una fecha de egreso cargada. Si
// volvió, la fecha sola mentiría ("Fecha de egreso: 30/06/2025" en la ficha de
// alguien que está trabajando hoy): se muestran los dos hitos.
function periodosEnBeonTexto(f){
  const egreso=f?.['Fecha de egreso'];
  if(!egreso) return '';
  const reingreso=f?.['Fecha de reingreso'];
  if(!reingresoVigente({fields:f})) {
    // Reingreso ya acordado pero que todavía no empezó: se avisa igual, es el
    // dato más importante de esa ficha.
    return reingreso&&reingreso>egreso
      ? `${fmt(egreso)} · vuelve el ${fmt(reingreso)}`
      : fmt(egreso);
  }
  return `Hasta ${fmt(egreso)} · reingresó el ${fmt(reingreso)}`;
}

function closeFichaPersona(){
  document.getElementById('pf-overlay').style.display='none';
}

// Alguien se puede ir y volver, y cuando vuelve no empieza de cero: conserva
// sus beneficios, su nivel Loyalty y su antigüedad, porque todo cuelga de este
// mismo registro.
//
// Para eso NO se borra la "Fecha de egreso": que haya trabajado antes en BEON
// es parte de su historia y se sigue viendo en su ficha. Lo que decide si está
// activa hoy es si hay una "Fecha de reingreso" posterior a ese egreso y ya
// cumplida. Un reingreso a futuro (ya acordado pero que todavía no empezó) no
// la reactiva: hasta ese día sigue afuera.
//
// Si más adelante se le registra un nuevo offboarding, la Fecha de egreso pasa
// a ser posterior al reingreso y la persona vuelve a contar como egresada sola,
// sin tocar nada más.
function reingresoVigente(r){
  const egreso=r?.fields?.['Fecha de egreso'];
  const reingreso=r?.fields?.['Fecha de reingreso'];
  if(!egreso||!reingreso||reingreso<=egreso) return false;
  const hoy=new Date();hoy.setHours(0,0,0,0);
  return new Date(reingreso+'T00:00:00')<=hoy;
}

// Ya cumplió su último día de trabajo (Fecha de egreso vencida) y no volvió —
// deja de contar como activo en Personas, aunque el registro se mantiene en
// Airtable.
function yaEgreso(r){
  const fe=r.fields['Fecha de egreso'];
  if(!fe) return false;
  if(reingresoVigente(r)) return false;
  const hoy=new Date();hoy.setHours(0,0,0,0);
  return new Date(fe+'T00:00:00')<=hoy;
}

// Alguien con Fecha de ingreso futura todavía no es parte del equipo: ya está
// cargado y aparece en el Kanban de Ingresos (en Pre-ingreso, que es donde
// tiene que estar), pero contarlo en Engineers & Tech infla el tamaño del
// equipo días o semanas antes de que la persona empiece.
// Un registro sin fecha de ingreso cuenta como que ya está: son cargas viejas
// a las que nunca se les completó el campo, y esconderlas sería peor.
function todaviaNoIngreso(r){
  const fi=r?.fields?.['Fecha de ingreso'];
  if(!fi) return false;
  const hoy=new Date();hoy.setHours(0,0,0,0);
  return new Date(fi+'T00:00:00')>hoy;
}

// "Está en el equipo hoy": ya empezó y no se fue (o se fue y volvió). Es el
// criterio del directorio, de los contadores y de los "N en el equipo" de
// Beneficios, para que todos esos números digan lo mismo.
function estaEnElEquipo(r){
  return !todaviaNoIngreso(r)&&!yaEgreso(r);
}

// Distinto de yaEgreso(): alcanza con que el offboarding esté REGISTRADO,
// aunque el último día todavía no haya llegado. Registrar un offboarding
// escribe "Fecha de egreso" con el último día (ver forms.js), que casi siempre
// es futuro — así que para yaEgreso() la persona sigue activa durante todo ese
// período, que es lo correcto para el directorio, el presupuesto de beneficios
// y el Kanban de Offboarding, donde tiene que seguir apareciendo.
//
// No lo es para Cumpleaños y Aniversarios: son listas para saludar, y saludar
// a alguien que está en pleno offboarding es exactamente lo que hay que evitar.
// Esas dos usan este criterio.
function egresoRegistrado(r){
  return !!r.fields['Fecha de egreso']&&!reingresoVigente(r);
}

async function loadPersonas(){
  const d=await atGet('Personas','&sort[0][field]=Nombre&sort[0][direction]=asc');
  const recs=d.records||[];
  cachePersonasRaw=recs;
  cachePersonasPorRol={TEM:[],Manager:[],Lead:[]};

  // Ya empezaron y no se fueron: quien ingresa la semana que viene todavía
  // no suma al equipo (ver estaEnElEquipo).
  const activos=recs.filter(estaEnElEquipo);
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

  // En qué página de cada tabla estaba el usuario antes de esta recarga —
  // se restaura al final, en restaurarVistaPersonas().
  const pagPrevia={eng:pagState.eng?.page||0,core:pagState.core?.page||0};

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
  restaurarVistaPersonas(pagPrevia);
  return recs;
}

// Cada recarga de datos (guardar una edición, cambiarle el nivel a alguien)
// volvía a dibujar las tablas con el roster entero: la búsqueda y los filtros
// seguían escritos en pantalla pero ya no se aplicaban, y la lista saltaba a la
// página 1. Había que volver a buscar a la persona para seguir trabajando.
// Acá se vuelve a aplicar lo que el usuario tenía puesto y se lo deja en la
// misma página (o en la última, si al filtrar quedaron menos).
function restaurarVistaPersonas(pagPrevia){
  ['eng','core'].forEach(grupo=>{
    filtrarPersonas(grupo);
    const paginas=Math.max(1,Math.ceil(pagState[grupo].data.length/PAG_SIZE));
    const pagina=Math.min(pagPrevia?.[grupo]||0,paginas-1);
    if(pagina!==pagState[grupo].page){
      pagState[grupo].page=pagina;
      renderPagina(grupo);
    }
  });
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
    btn.innerHTML=`<i class="ti ${iconoNivel(nuevoNivel)}"></i>${nuevoNivel}`;
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
  const rolTec=document.getElementById(`personas-roltec-${grupo}`)?.value||'';
  // El de área existe solo en Core Team: en Engineers el select no está y el
  // filtro queda en vacío, sin afectar nada.
  const areaFil=document.getElementById(`personas-area-${grupo}`)?.value||'';
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
    // "(sin cargar)" es un valor propio del filtro, para encontrar a quién le
    // falta el dato — que al principio van a ser casi todos.
    const matchRolTec=!rolTec||(rolTec==='(sin cargar)'?!rolesTecnicos(r).length:rolesTecnicos(r).includes(rolTec));
    const matchArea=!areaFil||(areaFil==='(sin cargar)'?!areaDe(r):areaDe(r)===areaFil);
    const matchPais=!pais||valorUbicacion(f['País']).toLowerCase()===pais;
    const matchCiudad=!ciudadFil||ciudad===ciudadFil;
    return matchQ&&matchRol&&matchLoyalty&&matchProyecto&&matchManager&&matchPais&&matchCiudad&&matchRolTec&&matchArea;
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
    // Se preserva lo elegido: estos selects se vuelven a armar en cada recarga
    // de datos (ej. después de guardar una edición), y si no, el filtro que
    // tenías puesto se perdía — mismo criterio que poblarFiltroPais().
    if(selProy){
      const previo=selProy.value;
      selProy.innerHTML='<option value="">Todos los proyectos</option>'+proyectos.map(p=>`<option value="${p}">${p}</option>`).join('');
      if(proyectos.includes(previo)) selProy.value=previo;
    }
    if(selMgr){
      const previo=selMgr.value;
      // "TEM" es específico de Engineers & Tech — Core Team puede reportarle
      // a cualquier líder (Lead, Manager, Supervisor, etc.), así que ahí el
      // copy dice "managers" en vez de "TEMs".
      const placeholder=grupo==='eng'?'Todos los TEMs':'Todos los managers';
      selMgr.innerHTML=`<option value="">${placeholder}</option>`+managers.map(m=>`<option value="${m}">${m}</option>`).join('');
      if(managers.includes(previo)) selMgr.value=previo;
    }
    poblarFiltroRolTecnico(grupo);
    poblarFiltroArea(grupo);
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

// Las opciones salen de lo que hay cargado, no de una lista fija: el catálogo
// de roles técnicos lo define la gente al completar el campo en Airtable.
// "(sin cargar)" va al final y sirve para la etapa de carga: encontrar a quién
// le falta el dato.
function poblarFiltroRolTecnico(grupo){
  const sel=document.getElementById(`personas-roltec-${grupo}`);
  if(!sel) return;
  const actual=sel.value;
  const datos=pagState[grupo].all||[];
  const roles=opcionesUnicas(datos.flatMap(rolesTecnicos));
  const faltan=datos.some(p=>!rolesTecnicos(p).length);
  sel.innerHTML='<option value="">Todos los roles técnicos</option>'
    +roles.map(r=>`<option value="${r}"${r===actual?' selected':''}>${r}</option>`).join('')
    +(faltan?`<option value="(sin cargar)"${actual==='(sin cargar)'?' selected':''}>Sin rol técnico cargado</option>`:'');
}

// Mismo criterio que el de rol técnico: las opciones salen de lo que hay
// cargado, y "(sin cargar)" sirve para encontrar a quién le falta el dato.
function poblarFiltroArea(grupo){
  const sel=document.getElementById(`personas-area-${grupo}`);
  if(!sel) return;
  const actual=sel.value;
  const datos=pagState[grupo].all||[];
  const areas=opcionesUnicas(datos.map(areaDe));
  const faltan=datos.some(p=>!areaDe(p));
  sel.innerHTML='<option value="">Todas las áreas</option>'
    +areas.map(a=>`<option value="${a}"${a===actual?' selected':''}>${a}</option>`).join('')
    +(faltan?`<option value="(sin cargar)"${actual==='(sin cargar)'?' selected':''}>Sin área cargada</option>`:'');
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

// ─── Badge de nivel Loyalty ───────────────────────────────────────────────────
// Único lugar donde se arma el badge. Cada vista repetía por su cuenta
// `NIVEL_ICONS[nivel]||'ti-award'` + un mapa de clases de color, pasándole el
// valor CRUDO de Airtable: un "Thunder " con un espacio de más no matcheaba
// ninguno de los dos mapas, así que en Beneficios salía gris con ícono de
// medalla mientras en Engineers (que sí normaliza) salía morado con el de
// viento. El mismo nivel se veía de dos formas distintas según la pestaña.
//
// Estas dos funciones normalizan siempre, así que el fallback 'ti-award' ya no
// hace falta: normalizarNivel() nunca devuelve algo fuera de NIVELES.
function iconoNivel(nivel){
  return NIVEL_ICONS[normalizarNivel(nivel)];
}

// `clases` son las clases de contenedor de cada vista (ej. 'badge' o
// 'nivel-badge-et'); el color (badge-nivel-X) y el ícono los pone el helper.
function badgeNivelHtml(nivel,clases){
  const n=normalizarNivel(nivel);
  return `<span class="${clases||'badge'} badge-nivel-${n}"><i class="ti ${NIVEL_ICONS[n]}"></i>${n}</span>`;
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
      <div class="et-kpi-icon badge-nivel-${n}"><i class="ti ${iconoNivel(n)}"></i></div>
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
