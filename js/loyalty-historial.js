// Quiénes cambiaron de Nivel Loyalty, y cuándo.
//
// La tabla "Historial Loyalty" la escribe cambiarNivel() (js/personas.js) en
// cada cambio, pero hasta acá el único que la LEÍA era el resumen mensual de
// Slack (api/cron-loyalty-mensual.js). Si ese mensaje no llegaba —porque el
// cron no corrió, porque falló la consulta, o porque el webhook no está
// configurado— no quedaba ningún lugar donde ver los cambios del mes: el dato
// estaba cargado y era invisible. Ahora vive en el Hub y no depende de Slack.

function mesDeFecha(fecha){
  return String(fecha||'').slice(0,7); // YYYY-MM
}
function mesActualLoyalty(){
  // Getters locales, igual que cambiarNivel() al guardar la fecha: con
  // toISOString() un cambio hecho de noche en Argentina cae en el día
  // siguiente en UTC y puede quedar contado en el mes equivocado.
  const hoy=new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
}
function etiquetaMesLoyalty(mes){
  const [a,m]=String(mes||'').split('-');
  const idx=Number(m)-1;
  return MESES_ES[idx]?`${MESES_ES[idx]} de ${a}`:'—';
}
function cambiosLoyaltyDelMes(mes){
  return (cacheHistorialLoyaltyRaw||[]).filter(r=>mesDeFecha(r.fields?.Fecha)===mes);
}
// Los meses que tienen algún cambio, del más nuevo al más viejo — es lo que
// ofrece el selector, para no listar meses vacíos.
function mesesConCambiosLoyalty(){
  return [...new Set((cacheHistorialLoyaltyRaw||[])
    .map(r=>mesDeFecha(r.fields?.Fecha)).filter(Boolean))].sort().reverse();
}
// "Spark → Ray". Los niveles se normalizan porque en Airtable conviven con
// espacios de más y distinta capitalización (ver normalizarNivel).
function textoCambioLoyalty(fields){
  const de=fields?.['Nivel anterior'], a=fields?.['Nivel nuevo'];
  return `${de?normalizarNivel(de):'—'} → ${a?normalizarNivel(a):'—'}`;
}

async function loadHistorialLoyalty(){
  historialLoyaltyError='';
  try{
    const d=await atGet('Historial Loyalty','&sort[0][field]=Fecha&sort[0][direction]=desc');
    cacheHistorialLoyaltyRaw=d.records||[];
  }catch(e){
    // No se tapa con una lista vacía: "no hubo cambios" y "no se pudo leer el
    // historial" se ven igual, y esa confusión es justamente la que hizo
    // invisible este dato hasta ahora.
    cacheHistorialLoyaltyRaw=[];
    historialLoyaltyError=e.message||'No se pudo leer el historial';
    console.error('No se pudo leer "Historial Loyalty":',historialLoyaltyError);
  }
  renderCardLoyalty();
  return cacheHistorialLoyaltyRaw;
}

function renderCardLoyalty(){
  const val=document.getElementById('sc-loyalty');
  if(!val) return;
  const sub=document.getElementById('sc-loyalty-sub');
  const lista=document.getElementById('sc-list-loyalty');
  const mas=document.getElementById('sc-more-loyalty');
  if(historialLoyaltyError){
    val.textContent='—';
    if(sub) sub.textContent='no se pudo leer el historial';
    if(lista) lista.innerHTML=`<div class="sc-list-item" style="color:var(--text3)">Revisá que exista la tabla "Historial Loyalty" en Airtable.</div>`;
    if(mas) mas.style.display='none';
    return;
  }
  const mes=mesActualLoyalty();
  const delMes=cambiosLoyaltyDelMes(mes);
  val.textContent=delMes.length;
  if(sub) sub.textContent=etiquetaMesLoyalty(mes);
  if(lista){
    lista.innerHTML=delMes.slice(0,5).map(r=>{
      const nombre=nombreDePersonaRef(r.fields?.Persona)||'—';
      return`<div class="sc-list-item">${avH(nombre)}<span class="sc-list-item-name">${nombrePersonaHistorico(nombre)}${badgeSinFicha(nombre)}</span><span class="sc-list-item-meta">${textoCambioLoyalty(r.fields)}</span></div>`;
    }).join('');
  }
  // El botón abre el detalle también cuando el mes no tiene cambios: ahí está
  // el selector para mirar los meses anteriores, que es media gracia de esto.
  if(mas){
    mas.style.display=(cacheHistorialLoyaltyRaw||[]).length?'flex':'none';
    mas.innerHTML=`${delMes.length>5?'Ver todos':'Ver otros meses'} <i class="ti ti-arrow-right"></i>`;
  }
}

// ─── Detalle, con selector de mes ─────────────────────────────────────────────
function abrirHistorialLoyalty(){
  const sel=document.getElementById('loyalty-mes');
  if(sel){
    const meses=mesesConCambiosLoyalty();
    const actual=mesActualLoyalty();
    // El mes en curso va siempre, aunque todavía no tenga cambios: abrir el
    // detalle y no encontrar el mes de hoy se lee como un error.
    const opciones=[...new Set([actual,...meses])].sort().reverse();
    sel.innerHTML=opciones.map(m=>`<option value="${m}"${m===actual?' selected':''}>${etiquetaMesLoyalty(m)}</option>`).join('');
  }
  renderHistorialLoyalty();
  document.getElementById('loyalty-overlay').classList.add('open');
  document.body.style.overflow='hidden';
}
function cerrarHistorialLoyalty(e){
  if(e&&e.target!==document.getElementById('loyalty-overlay')) return;
  document.getElementById('loyalty-overlay').classList.remove('open');
  document.body.style.overflow='';
}
function renderHistorialLoyalty(){
  const cont=document.getElementById('loyalty-lista');
  if(!cont) return;
  const mes=document.getElementById('loyalty-mes')?.value||mesActualLoyalty();
  const cambios=cambiosLoyaltyDelMes(mes);
  const badge=document.getElementById('loyalty-badge');
  if(badge) badge.textContent=`${cambios.length} ${cambios.length===1?'cambio':'cambios'}`;
  if(!cambios.length){
    cont.innerHTML=`<div class="et-empty">Sin cambios de nivel en ${etiquetaMesLoyalty(mes)}</div>`;
    return;
  }
  cont.innerHTML=cambios.map(r=>{
    const f=r.fields||{};
    const nombre=nombreDePersonaRef(f.Persona)||'—';
    const nuevo=f['Nivel nuevo']?normalizarNivel(f['Nivel nuevo']):'';
    return`<div class="bp-detalle-row">
      <div class="bp-detalle-row-icon" style="background:var(--tinte-pink);color:var(--text-pink-accent)"><i class="ti ${nuevo?iconoNivel(nuevo):'ti-award'}"></i></div>
      <div class="bp-detalle-row-mid">
        <div class="bp-detalle-row-title">${nombrePersonaHistorico(nombre)}${badgeSinFicha(nombre)}</div>
        <div class="bp-detalle-row-sub">${textoCambioLoyalty(f)}${f.Fecha?` · ${fmt(f.Fecha)}`:''}</div>
      </div>
    </div>`;
  }).join('');
}
