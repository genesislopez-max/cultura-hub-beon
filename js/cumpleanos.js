let cumpleSegmento='todos';

async function loadCumpleanos(personas){
  const now=new Date();now.setHours(0,0,0,0);
  const mesActual=now.getMonth(),mesProximo=(now.getMonth()+1)%12;
  // egresoRegistrado y no yaEgreso: quien ya tiene fecha de offboarding cargada
  // sale de la lista desde ese momento, sin esperar a su último día.
  const rows=(personas||[]).filter(r=>!egresoRegistrado(r)&&r.fields['Fecha de cumpleaños']).map(r=>{
    const f=r.fields;
    const rol=(f['Rol en empresa']||'').trim();
    const fecha=f['Fecha de cumpleaños'];
    const days=daysTo(fecha);
    const proximo=new Date(now.getTime()+days*86400000);
    return{nombre:f.Nombre,fecha,days,proximo,grupo:CORE_TEAM_ROLES.has(rol)?'core':'eng',manager:f.Manager||''};
  }).sort((a,b)=>a.days-b.days);
  cacheCumpleRows=rows;
  poblarSelectorTEM('cumple-tem');

  const esteM=rows.filter(r=>new Date(r.fecha+'T12:00:00').getMonth()===mesActual);
  const proxM=rows.filter(r=>new Date(r.fecha+'T12:00:00').getMonth()===mesProximo).length;
  const mesNombre=new Date(now.getFullYear(),mesActual,1).toLocaleString('es-AR',{month:'long'});
  const mesProxNombre=new Date(now.getFullYear(),mesProximo,1).toLocaleString('es-AR',{month:'long'});
  document.getElementById('mc-este-mes').textContent=esteM.length;
  document.getElementById('mc-este-mes-sub').textContent=mesNombre;
  document.getElementById('mc-proximo-mes').textContent=proxM;
  document.getElementById('mc-proximo-mes-sub').textContent=mesProxNombre;
  document.getElementById('mc-proximos-7').textContent=rows.filter(r=>r.days<=7).length;
  document.getElementById('mc-total').textContent=rows.length;

  renderCumpleHero(rows);

  // Card inicio con lista
  document.getElementById('sc-cumple').textContent=esteM.length;
  document.getElementById('sc-cumple-sub').textContent=mesNombre;
  const listEl=document.getElementById('sc-list-cumple');
  const moreEl=document.getElementById('sc-more-cumple');
  listEl.innerHTML=esteM.slice(0,5).map(r=>`<div class="sc-list-item">${avH(r.nombre)}<span class="sc-list-item-name">${r.nombre}</span><span class="sc-list-item-meta">${fmt(r.fecha)}</span></div>`).join('');
  moreEl.style.display=esteM.length>5?'flex':'none';

  filtrarCumpleanos();

  return rows.filter(r=>r.days<=60).map(r=>({nombre:r.nombre,evento:'Cumpleaños 🎂',fecha:r.fecha,days:r.days}));
}

// Hero "Cumple hoy" — muestra a quien(es) cumplan hoy (days===0); si nadie
// cumple, cae a un mensaje amistoso con el próximo cumpleaños en camino.
function renderCumpleHero(rows){
  const avatarEl=document.getElementById('cumple-hero-avatar');
  const nombreEl=document.getElementById('cumple-hero-nombre');
  const subEl=document.getElementById('cumple-hero-sub');
  const otrosEl=document.getElementById('cumple-hero-otros');
  const hoy=rows.filter(r=>r.days===0);
  if(!hoy.length){
    avatarEl.textContent='🎂';
    nombreEl.textContent='Nadie cumple hoy';
    const prox=rows[0];
    subEl.textContent=prox?`El próximo es ${prox.nombre}, en ${prox.days===1?'1 día':prox.days+' días'}`:'Sin cumpleaños cargados';
    otrosEl.innerHTML='';
    return;
  }
  const [primero,...resto]=hoy;
  const fechaLarga=primero.proximo.toLocaleDateString('es-AR',{day:'numeric',month:'long'});
  avatarEl.textContent=ini(primero.nombre);
  nombreEl.textContent=primero.nombre;
  subEl.textContent=`Cumple ${fechaLarga}`;
  // Si más de una persona cumple hoy, el resto se lista aparte (uno por
  // línea) en vez de amontonarlos en la misma línea que la fecha.
  otrosEl.innerHTML=resto.map(r=>`<div class="cumple-hero-otro">🎉 ${r.nombre}</div>`).join('');
}

function setCumpleSegmento(seg,btn){
  cumpleSegmento=seg;
  document.querySelectorAll('.cumple-seg').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  filtrarCumpleanos();
}

function filtrarCumpleanos(){
  const q=(document.getElementById('cumple-search')?.value||'').trim().toLowerCase();
  const temFil=document.getElementById('cumple-tem')?.value||'';
  const filtrados=cacheCumpleRows.filter(r=>
    (!q||r.nombre.toLowerCase().includes(q))&&
    (!temFil||r.manager===temFil)&&
    (cumpleSegmento==='todos'||(cumpleSegmento==='30'&&r.days<=30)||(cumpleSegmento==='7'&&r.days<=7))
  );
  const engRows=filtrados.filter(r=>r.grupo==='eng');
  const coreRows=filtrados.filter(r=>r.grupo==='core');
  document.getElementById('badge-cumple-eng').textContent=`${engRows.length} persona${engRows.length!==1?'s':''}`;
  document.getElementById('badge-cumple-core').textContent=`${coreRows.length} persona${coreRows.length!==1?'s':''}`;
  renderCumpleLista('cumple-eng-container',engRows);
  renderCumpleLista('cumple-core-container',coreRows);
}

// Escala de color/ícono pedida: hoy → rosa, mañana → rojo, ≤7d → ámbar,
// ≤30d → azul, resto → gris.
function badgeCumpleClase(days){
  if(days===0) return 'badge-pink';
  if(days===1) return 'badge-red';
  if(days<=7) return 'badge-amber';
  if(days<=30) return 'badge-blue';
  return 'badge-gray';
}
function badgeCumpleIcono(days){
  if(days===0) return 'ti-confetti';
  if(days===1) return 'ti-sunrise';
  if(days<=7) return 'ti-clock';
  if(days<=30) return 'ti-calendar';
  return 'ti-calendar-event';
}

function filaCumpleRow(r){
  const dl=r.days===0?'¡Hoy!':r.days===1?'Mañana':`en ${r.days} días`;
  const mesAbrev=r.proximo.toLocaleDateString('es-AR',{month:'short'}).replace('.','');
  const dia=String(r.proximo.getDate()).padStart(2,'0');
  const mesLargo=r.proximo.toLocaleDateString('es-AR',{month:'long'});
  const fechaCompleta=`${r.proximo.getDate()} de ${mesLargo} de ${r.proximo.getFullYear()}`;
  return`<div class="cumple-row">
    <div class="cumple-row-persona">
      ${avH(r.nombre)}
      <div class="cumple-row-info">
        <div class="cumple-row-name">${r.nombre}</div>
        ${r.manager?`<div class="cumple-row-manager">${r.manager}</div>`:''}
      </div>
    </div>
    <div class="cumple-row-fecha">
      <div class="cumple-date-tile"><span class="cumple-date-mes">${mesAbrev}</span><span class="cumple-date-dia">${dia}</span></div>
      <span>${fechaCompleta}</span>
    </div>
    <span class="badge ${badgeCumpleClase(r.days)}"><i class="ti ${badgeCumpleIcono(r.days)}"></i> ${dl}</span>
  </div>`;
}

// Agrupa por "meses de distancia" desde hoy (0 = el próximo cumpleaños cae
// este mes, 1 = el mes que sigue, etc.) en vez de por el mes calendario del
// cumpleaños en sí — así alguien cuyo cumpleaños ya pasó este año (su
// próxima fecha real es el año que viene) no queda mezclado antes que
// alguien que cumple efectivamente esta semana solo por compartir nombre de
// mes. Enero aparece después de diciembre automáticamente.
function bloqueMesCumple(offset,rows,now){
  const delMes=rows.filter(r=>{
    const m=(r.proximo.getFullYear()-now.getFullYear())*12+(r.proximo.getMonth()-now.getMonth());
    return m===offset;
  }).sort((a,b)=>a.days-b.days);
  if(!delMes.length) return '';
  const nombreMes=new Date(now.getFullYear(),now.getMonth()+offset,1).toLocaleString('es-AR',{month:'long',year:'numeric'});
  const nombreCap=nombreMes.charAt(0).toUpperCase()+nombreMes.slice(1);
  // El header (sticky) y sus filas van envueltos juntos en su propio bloque
  // — si quedaran como hermanos sueltos dentro de .cumple-rows, todos
  // comparten el mismo "contenedor de anclaje" para el sticky (el panel
  // entero) y el navegador los va apilando a todos arriba a medida que se
  // scrollea, en vez de soltar cada uno cuando termina su propio mes.
  return`<div class="cumple-mes-bloque">
    <div class="cumple-mes-header">${nombreCap} <span class="cumple-mes-count">(${delMes.length})</span></div>
    ${delMes.map(filaCumpleRow).join('')}
  </div>`;
}

function renderCumpleLista(containerId,rows){
  const container=document.getElementById(containerId);
  if(!container) return;
  if(!rows.length){
    container.innerHTML='<div class="cumple-empty">Sin cumpleaños para este filtro.</div>';
    return;
  }
  const now=new Date();now.setHours(0,0,0,0);
  const offsets=Array.from({length:13},(_,i)=>i); // 0..12: cubre el año completo, incluido "este mes pero ya pasó" (offset 12)
  const cercanos=offsets.slice(0,3).map(o=>bloqueMesCumple(o,rows,now)).join('');
  const lejanos=offsets.slice(3).map(o=>bloqueMesCumple(o,rows,now)).join('');
  container.innerHTML=cercanos+(lejanos?`
    <details class="cumple-ver-mas">
      <summary>Ver más adelante →</summary>
      ${lejanos}
    </details>`:'');
}
