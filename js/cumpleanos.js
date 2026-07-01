async function loadCumpleanos(personas){
  const now=new Date();now.setHours(0,0,0,0);
  const mesActual=now.getMonth(),mesProximo=(now.getMonth()+1)%12;
  const rows=(personas||[]).filter(r=>r.fields['Fecha de cumpleaños']).map(r=>{
    const f=r.fields;return{nombre:f.Nombre,fecha:f['Fecha de cumpleaños'],days:daysTo(f['Fecha de cumpleaños'])};
  }).sort((a,b)=>a.days-b.days);
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
  document.getElementById('badge-cumple-h').textContent=`${rows.length} personas`;
  // Card inicio con lista
  document.getElementById('sc-cumple').textContent=esteM.length;
  document.getElementById('sc-cumple-sub').textContent=mesNombre;
  const listEl=document.getElementById('sc-list-cumple');
  const moreEl=document.getElementById('sc-more-cumple');
  listEl.innerHTML=esteM.slice(0,5).map(r=>`<div class="sc-list-item">• ${r.nombre} (${fmt(r.fecha)})</div>`).join('');
  moreEl.style.display=esteM.length>5?'block':'none';
  const tb=document.getElementById('tbody-cumple');
  tb.innerHTML=rows.length?rows.map(r=>{
    const dl=r.days===0?'¡Hoy! 🎉':r.days===1?'Mañana':`en ${r.days} días`;
    const b=r.days<=7?'badge-red':r.days<=30?'badge-amber':'badge-blue';
    const fechaBase=new Date(r.fecha+'T12:00:00');
    const proxCumple=new Date(now.getFullYear(),fechaBase.getMonth(),fechaBase.getDate());
    if(proxCumple<now) proxCumple.setFullYear(now.getFullYear()+1);
    const proxStr=proxCumple.toLocaleDateString('es-AR',{day:'2-digit',month:'short',year:'numeric'});
    const diaMes=fechaBase.toLocaleDateString('es-AR',{day:'2-digit',month:'long'});
    return`<tr><td>${avH(r.nombre)}${r.nombre}</td><td>${diaMes}</td><td>${proxStr}</td><td><span class="badge ${b}">${dl}</span></td></tr>`;
  }).join(''):'<tr class="empty-row"><td colspan="4">Sin cumpleaños cargados</td></tr>';
  return rows.filter(r=>r.days<=60).map(r=>({nombre:r.nombre,evento:'Cumpleaños 🎂',fecha:r.fecha,days:r.days}));
}
