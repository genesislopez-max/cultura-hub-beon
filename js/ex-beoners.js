// ─── EX BEONERS ───────────────────────────────────────────────────────────────
// El histórico de quienes ya no están en BEON está cargado en Airtable, pero
// no tenía dónde verse: el directorio (Engineers & Tech / Core Team), los
// filtros de Beneficios y las métricas excluyen a quien tiene Fecha de egreso
// vencida — con razón, porque hablan del equipo de hoy.
//
// Esta sección es ese lugar. No cambia ninguna vista existente: lee el mismo
// cachePersonasRaw que ya carga el Hub al arrancar y arma su propia lista con
// los que el resto deja afuera. Al clickear una persona se abre la card de
// siempre (verBenefPersona), que trae de Airtable todo su historial:
// beneficios, Off Sites, Ambassador Week, Get Togethers y actividades.

// La lista se pagina igual que el resto de las tablas largas del Hub.
let pagExBeoners={page:0};

// Quiénes son. Orden: salida más reciente primero, que es como se los busca
// ("el que se fue el mes pasado"), y no alfabético.
function exBeoners(){
  return (cachePersonasRaw||[]).filter(p=>yaEgreso(p))
    .sort((a,b)=>(b.fields['Fecha de egreso']||'').localeCompare(a.fields['Fecha de egreso']||''));
}

// Cuánto duró el paso por BEON: la antigüedad se calcula hasta la salida y no
// hasta hoy, que es lo que haría calcAntiguedad() con su valor por defecto y
// seguiría creciendo para siempre.
function tiempoEnBeon(f){
  const desde=f['Fecha de ingreso'];
  const hasta=f['Fecha de egreso'];
  if(!desde) return '—';
  return calcAntiguedad(desde,new Date(hasta+'T12:00:00'));
}

function anioDeSalida(f){
  return (f['Fecha de egreso']||'').slice(0,4);
}

// Los años que aparecen en el filtro salen de los datos: no tiene sentido
// ofrecer años sin nadie.
function poblarAnioExBeoners(){
  const sel=document.getElementById('exb-anio');
  if(!sel) return;
  const actual=sel.value;
  const anios=[...new Set(exBeoners().map(p=>anioDeSalida(p.fields)).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  sel.innerHTML='<option value="">Todos los años</option>'+
    anios.map(a=>`<option value="${a}"${a===actual?' selected':''}>${a}</option>`).join('');
}

// Cuántos registros de beneficios tiene cargados. Sale del cache de Beneficios,
// que es lazy: si el usuario todavía no entró a esa sección, loadExBeoners() lo
// pide. Si esa carga falló, la columna queda en "—" en vez de mentir un 0.
function beneficiosDeExBeoner(nombre){
  if(!(cacheBenefAsignados||[]).length) return null;
  const buscado=normalizarNombre(nombre);
  return cacheBenefAsignados.filter(a=>normalizarNombre(valorVinculado(a.fields.Persona))===buscado).length;
}

function filtrarExBeoners(){ pagExBeoners.page=0; renderExBeoners(); }

function cambiarPaginaExBeoners(dir){
  pagExBeoners.page=Math.max(0,pagExBeoners.page+dir);
  renderExBeoners();
  document.getElementById('page-exbeoners')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function renderExBeoners(){
  const q=(document.getElementById('exb-search')?.value||'').toLowerCase();
  // Mismo criterio que en Beneficios: HR ve Core Team y nada más, sin importar
  // lo que diga el selector (que además queda deshabilitado).
  const grupoFil=rolUsuarioActual()==='hr'?'Core Team':(document.getElementById('exb-grupo')?.value||'');
  const anioFil=document.getElementById('exb-anio')?.value||'';

  const lista=exBeoners().filter(p=>{
    const f=p.fields;
    const texto=`${f.Nombre||''} ${f.Proyecto||''} ${f['Rol en empresa']||''}`.toLowerCase();
    return (!q||texto.includes(q))
      &&(!grupoFil||getRolGroup(f['Rol en empresa']||'')===grupoFil)
      &&(!anioFil||anioDeSalida(f)===anioFil);
  });

  const badge=document.getElementById('badge-exbeoners');
  if(badge) badge.textContent=`${lista.length} ${lista.length===1?'persona':'personas'}`;

  const tb=document.getElementById('tbody-exbeoners');
  const bar=document.getElementById('pag-bar-exbeoners');
  if(!tb) return;
  if(!lista.length){
    tb.innerHTML='<tr class="empty-row"><td colspan="7">Sin resultados</td></tr>';
    if(bar) bar.style.display='none';
    return;
  }

  const totalPags=Math.ceil(lista.length/PAG_SIZE);
  if(pagExBeoners.page>=totalPags) pagExBeoners.page=totalPags-1;
  const inicio=pagExBeoners.page*PAG_SIZE, fin=Math.min(inicio+PAG_SIZE,lista.length);
  if(totalPags>1){
    if(bar) bar.style.display='flex';
    const info=document.getElementById('pag-info-exbeoners');
    if(info) info.textContent=`${inicio+1}–${fin} de ${lista.length} personas`;
    const prev=document.getElementById('pag-prev-exbeoners');
    const next=document.getElementById('pag-next-exbeoners');
    if(prev) prev.disabled=pagExBeoners.page===0;
    if(next) next.disabled=pagExBeoners.page>=totalPags-1;
  } else if(bar) bar.style.display='none';

  tb.innerHTML=lista.slice(inicio,fin).map((p,idx)=>{
    const f=p.fields;
    const nombre=f.Nombre||'—';
    const grupo=getRolGroup(f['Rol en empresa']||'');
    const nivel=normalizarNivel(f['Nivel Loyalty']);
    const nBenef=beneficiosDeExBeoner(nombre);
    const bg=idx%2===0?'background:var(--bg2)':'';
    const nombreEsc=nombre.replace(/'/g,"\\'");
    return`<tr class="tr-clickable" style="${bg}" onclick="verBenefPersona('${nombreEsc}','${grupo}','${nivel}')">
      <td>${avH(nombre)}${nombre}</td>
      <td><span class="badge ${grupo==='Engineers'?'badge-blue':'badge-purple'}">${grupo}</span></td>
      <td>${badgeNivelHtml(nivel,'badge')}</td>
      <td>${f.Proyecto||'—'}</td>
      <td style="font-size:13px">${fmt(f['Fecha de ingreso'])} → ${fmt(f['Fecha de egreso'])}
        <div style="color:var(--text3);font-size:11px">${tiempoEnBeon(f)} en BEON</div></td>
      <td style="font-size:13px">${nBenef==null?'—':`${nBenef} ${nBenef===1?'registro':'registros'}`}</td>
      <td><button class="benef-per-ver-btn" onclick="event.stopPropagation();verBenefPersona('${nombreEsc}','${grupo}','${nivel}')">Ver histórico<i class="ti ti-arrow-right"></i></button></td>
    </tr>`;
  }).join('');
}

function renderMetricasExBeoners(){
  const lista=exBeoners();
  const anioActual=String(new Date().getFullYear());
  const esteAnio=lista.filter(p=>anioDeSalida(p.fields)===anioActual).length;
  // Promedio de meses en BEON, sobre los que tienen las dos fechas cargadas.
  const meses=lista.map(p=>mesesEnBeon(p.fields)).filter(m=>m!=null);
  const prom=meses.length?Math.round(meses.reduce((s,m)=>s+m,0)/meses.length):0;
  const set=(id,val)=>{const el=document.getElementById(id);if(el) el.textContent=val;};
  set('mx-total',lista.length);
  set('mx-anio',esteAnio);
  set('mx-anio-sub',`salidas en ${anioActual}`);
  set('mx-prom',meses.length?textoMeses(prom):'—');
}

// Meses entre ingreso y egreso, null si falta alguna de las dos fechas.
function mesesEnBeon(f){
  const desde=f['Fecha de ingreso'], hasta=f['Fecha de egreso'];
  if(!desde||!hasta) return null;
  const a=new Date(desde+'T12:00:00'), b=new Date(hasta+'T12:00:00');
  let m=(b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth());
  if(b.getDate()<a.getDate()) m--;
  return Math.max(0,m);
}
function textoMeses(m){
  const anos=Math.floor(m/12), meses=m%12;
  if(anos===0) return `${meses} ${meses===1?'mes':'meses'}`;
  if(meses===0) return `${anos} ${anos===1?'año':'años'}`;
  // Sin abreviar: "5 a 10 m" se lee como un rango de 5 a 10, no como
  // 5 años y 10 meses.
  return `${anos} ${anos===1?'año':'años'} ${meses} ${meses===1?'mes':'meses'}`;
}

// HR ve solo Core Team acá, igual que en Beneficios.
function aplicarRestriccionesExBeoners(){
  if(rolUsuarioActual()!=='hr') return;
  const sel=document.getElementById('exb-grupo');
  if(sel){ sel.value='Core Team'; sel.disabled=true; }
}

async function loadExBeoners(){
  aplicarRestriccionesExBeoners();
  // La lista sale de cachePersonasRaw, que ya está cargado al arrancar. La
  // columna de beneficios necesita el cache de Beneficios, que es lazy: si
  // todavía está vacío se pide acá y se marca la sección como cargada, así
  // entrar después a Beneficios no vuelve a pedir las mismas tablas. Se mira
  // el cache y no solo la marca porque loadAll() dispara todos los loaders en
  // paralelo: con la marca sola, esta sección pedía Beneficios de nuevo cada
  // vez que se guardaba algo. Si falla, la sección se muestra igual — lo
  // importante es la lista, no esa columna.
  if(!(cacheBenefAsignados||[]).length&&!seccionesCargadas.has('beneficios')){
    try{
      seccionesCargadas.add('beneficios');
      await loadBeneficios();
    }catch(e){
      seccionesCargadas.delete('beneficios');
      console.error('Ex BEONers: no se pudo traer el histórico de beneficios:',e);
    }
  }
  poblarAnioExBeoners();
  renderMetricasExBeoners();
  renderExBeoners();
}
