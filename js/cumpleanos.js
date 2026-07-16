async function loadCumpleanos(personas){
  const now=new Date();now.setHours(0,0,0,0);
  const mesActual=now.getMonth(),mesProximo=(now.getMonth()+1)%12;
  const rows=(personas||[]).filter(r=>!yaEgreso(r)&&r.fields['Fecha de cumpleaños']).map(r=>{
    const f=r.fields;
    const rol=(f['Rol en empresa']||'').trim();
    const fecha=f['Fecha de cumpleaños'];
    const days=daysTo(fecha);
    const proximo=new Date(now.getTime()+days*86400000);
    return{nombre:f.Nombre,fecha,days,proximo,grupo:CORE_TEAM_ROLES.has(rol)?'core':'eng'};
  }).sort((a,b)=>a.days-b.days);
  cacheCumpleRows=rows;

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

  // Card inicio con lista
  document.getElementById('sc-cumple').textContent=esteM.length;
  document.getElementById('sc-cumple-sub').textContent=mesNombre;
  const listEl=document.getElementById('sc-list-cumple');
  const moreEl=document.getElementById('sc-more-cumple');
  listEl.innerHTML=esteM.slice(0,5).map(r=>`<div class="sc-list-item">• ${r.nombre} (${fmt(r.fecha)})</div>`).join('');
  moreEl.style.display=esteM.length>5?'block':'none';

  filtrarCumpleanos();

  return rows.filter(r=>r.days<=60).map(r=>({nombre:r.nombre,evento:'Cumpleaños 🎂',fecha:r.fecha,days:r.days}));
}

function filtrarCumpleanos(){
  const now=new Date();now.setHours(0,0,0,0);
  const q=(document.getElementById('cumple-search')?.value||'').trim().toLowerCase();
  const filtrados=q?cacheCumpleRows.filter(r=>r.nombre.toLowerCase().includes(q)):cacheCumpleRows;
  const engRows=filtrados.filter(r=>r.grupo==='eng');
  const coreRows=filtrados.filter(r=>r.grupo==='core');
  document.getElementById('badge-cumple-eng').textContent=`${engRows.length} persona${engRows.length!==1?'s':''}`;
  document.getElementById('badge-cumple-core').textContent=`${coreRows.length} persona${coreRows.length!==1?'s':''}`;
  renderCumpleGrupo('cumple-eng-container',engRows,now,'eng');
  renderCumpleGrupo('cumple-core-container',coreRows,now,'core');
}

function filaCumple(r,now){
  const dl=r.days===0?'¡Hoy! 🎉':r.days===1?'Mañana':`en ${r.days} días`;
  const b=r.days<=7?'badge-red':r.days<=30?'badge-amber':'badge-blue';
  const fechaBase=new Date(r.fecha+'T12:00:00');
  const proxStr=r.proximo.toLocaleDateString('es-AR',{day:'2-digit',month:'short',year:'numeric'});
  const diaMes=fechaBase.toLocaleDateString('es-AR',{day:'2-digit',month:'long'});
  return`<tr><td>${avH(r.nombre)}${r.nombre}</td><td>${diaMes}</td><td>${proxStr}</td><td><span class="badge ${b}">${dl}</span></td></tr>`;
}

// Agrupa por "meses de distancia" desde hoy (0 = el próximo cumpleaños cae este
// mes, 1 = el mes que sigue, etc.) en vez de por el mes calendario del
// cumpleaños en sí. Esto evita que alguien cuyo cumpleaños ya pasó este año
// (su próxima fecha real es el año que viene) quede mezclado y ordenado antes
// que alguien que cumple efectivamente esta semana, solo porque comparten
// nombre de mes. Los offsets más lejanos quedan colapsados atrás de "Ver más
// adelante" para que la lista no se sienta interminable.
// Colores por grupo — mismos que ya usan las cards "Engineers & Tech"/"Core
// Team" de arriba, para que el header de cada mes se lea como parte de ese
// mismo grupo en vez de mezclarse con el header de columnas de la tabla.
const CUMPLE_ACCENT={eng:{borde:'#3A69FF',tinte:'var(--tinte-eng)'},core:{borde:'#7432FF',tinte:'var(--tinte-core)'}};

function bloqueMesCumple(offset,rows,now,grupo){
  const delMes=rows.filter(r=>{
    const m=(r.proximo.getFullYear()-now.getFullYear())*12+(r.proximo.getMonth()-now.getMonth());
    return m===offset;
  }).sort((a,b)=>a.days-b.days);
  if(!delMes.length) return '';
  const nombreMes=new Date(now.getFullYear(),now.getMonth()+offset,1).toLocaleString('es-AR',{month:'long',year:'numeric'});
  const nombreCap=nombreMes.charAt(0).toUpperCase()+nombreMes.slice(1);
  const {borde,tinte}=CUMPLE_ACCENT[grupo]||CUMPLE_ACCENT.eng;
  return`<div class="cumple-grupo-mes" style="border-radius:10px;overflow:hidden;border:1px solid var(--border);margin:0 14px 22px;">
    <div style="font-size:13px;font-weight:700;color:var(--text);padding:10px 18px;background:linear-gradient(90deg,${tinte} 0%,var(--bg2) 100%);border-left:3px solid ${borde};">${nombreCap} <span style="font-weight:500;color:var(--text3);font-size:12px">(${delMes.length})</span></div>
    <table class="data-table" style="border-radius:0"><thead><tr><th>Persona</th><th>Fecha</th><th>Próximo</th><th>Días restantes</th></tr></thead>
    <tbody>${delMes.map(r=>filaCumple(r,now)).join('')}</tbody></table>
  </div>`;
}

function renderCumpleGrupo(containerId,rows,now,grupo){
  const container=document.getElementById(containerId);
  if(!container) return;
  if(!rows.length){
    container.innerHTML='<div style="padding:32px;text-align:center;color:var(--text3);font-size:13px;">Sin cumpleaños cargados.</div>';
    return;
  }
  const offsets=Array.from({length:13},(_,i)=>i); // 0..12: cubre el año completo, incluido "este mes pero ya pasó" (offset 12)
  const cercanos=offsets.slice(0,3).map(o=>bloqueMesCumple(o,rows,now,grupo)).join('');
  const lejanos=offsets.slice(3).map(o=>bloqueMesCumple(o,rows,now,grupo)).join('');
  container.innerHTML=cercanos+(lejanos?`
    <details style="margin:0 14px 18px;">
      <summary style="cursor:pointer;font-size:12px;font-weight:600;color:var(--blue);padding:10px 0;">Ver más adelante →</summary>
      ${lejanos}
    </details>`:'');
}
