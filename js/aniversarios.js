async function loadAniversarios(personas){
  const now=new Date();now.setHours(0,0,0,0);
  const mesActual=now.getMonth(),mesProximo=(now.getMonth()+1)%12;
  const rows=(personas||[]).filter(r=>!yaEgreso(r)&&r.fields['Fecha de ingreso']).map(r=>{
    const f=r.fields;
    const ing=new Date(f['Fecha de ingreso']+'T12:00:00');
    const añosAct=now.getFullYear()-ing.getFullYear();
    const anivEsteAño=new Date(ing);anivEsteAño.setFullYear(now.getFullYear());
    const años=anivEsteAño<now?añosAct+1:añosAct;
    if(años===0)return null;
    const grupo=CORE_TEAM_ROLES.has((f['Rol en empresa']||'').trim())?'core':'eng';
    return{nombre:f.Nombre,fecha:f['Fecha de ingreso'],años,days:daysTo(f['Fecha de ingreso']),grupo};
  }).filter(Boolean).sort((a,b)=>a.days-b.days);
  const esteM=rows.filter(r=>new Date(r.fecha+'T12:00:00').getMonth()===mesActual);
  const proxM=rows.filter(r=>new Date(r.fecha+'T12:00:00').getMonth()===mesProximo).length;
  const mesNombre=new Date(now.getFullYear(),mesActual,1).toLocaleString('es-AR',{month:'long'});
  const mesProxNombre=new Date(now.getFullYear(),mesProximo,1).toLocaleString('es-AR',{month:'long'});
  document.getElementById('ma-este-mes').textContent=esteM.length;
  document.getElementById('ma-este-mes-sub').textContent=mesNombre;
  document.getElementById('ma-proximo-mes').textContent=proxM;
  document.getElementById('ma-proximo-mes-sub').textContent=mesProxNombre;
  document.getElementById('ma-proximos-7').textContent=rows.filter(r=>r.days<=7).length;
  document.getElementById('ma-total').textContent=rows.length;
  document.getElementById('badge-aniv-h').textContent=`${rows.length} personas`;
  // Card inicio con lista
  document.getElementById('sc-aniv').textContent=esteM.length;
  document.getElementById('sc-aniv-sub').textContent=mesNombre;
  const listEl=document.getElementById('sc-list-aniv');
  const moreEl=document.getElementById('sc-more-aniv');
  const e=r=>r.años>=5?'🏆':r.años>=3?'🎉':'⭐';
  listEl.innerHTML=esteM.slice(0,5).map(r=>`<div class="sc-list-item">• ${r.nombre} ${e(r)} ${r.años}a</div>`).join('');
  moreEl.style.display=esteM.length>5?'block':'none';
  const container=document.getElementById('aniv-container');
  if(!rows.length){
    container.innerHTML='<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px;">Se calculan desde la fecha de ingreso</div>';
  } else {
    // Ordenar por mes del próximo aniversario, luego por años desc
    const rowsOrdenados=[...rows].sort((a,b)=>{
      const fa=new Date(a.fecha+'T12:00:00'), fb=new Date(b.fecha+'T12:00:00');
      const pa=new Date(fa);pa.setFullYear(now.getFullYear());if(pa<now)pa.setFullYear(now.getFullYear()+1);
      const pb=new Date(fb);pb.setFullYear(now.getFullYear());if(pb<now)pb.setFullYear(now.getFullYear()+1);
      // Primero por mes
      if(pa.getMonth()!==pb.getMonth()||pa.getFullYear()!==pb.getFullYear()) return pa.getTime()-pb.getTime();
      // Dentro del mismo mes: más años primero
      return b.años-a.años;
    });

    // Agrupar por mes
    const grupos={};
    rowsOrdenados.forEach(r=>{
      const fa=new Date(r.fecha+'T12:00:00');
      const prox=new Date(fa);prox.setFullYear(now.getFullYear());
      if(prox<now) prox.setFullYear(now.getFullYear()+1);
      const key=`${prox.getFullYear()}-${String(prox.getMonth()).padStart(2,'0')}`;
      const mesLabel=prox.toLocaleDateString('es-AR',{month:'long',year:'numeric'});
      if(!grupos[key]) grupos[key]={label:mesLabel,items:[],esActual:prox.getMonth()===now.getMonth()&&prox.getFullYear()===now.getFullYear()};
      grupos[key].items.push(r);
    });

    let html='';
    Object.entries(grupos).sort(([a],[b])=>a.localeCompare(b)).forEach(([,{label,items,esActual}])=>{
      html+=`<div class="aniv-grupo-mes" style="border-radius:10px;overflow:hidden;border:1px solid var(--border);margin:0 14px 22px;">
        <div style="padding:12px 18px;background:linear-gradient(90deg,var(--tinte-eng) 0%,var(--bg2) 100%);border-left:3px solid var(--blue);display:flex;align-items:center;gap:10px;">
          <span style="font-size:13px;font-weight:700;color:var(--blue)">${label.charAt(0).toUpperCase()+label.slice(1)}</span>
          ${esActual?'<span style="font-size:11px;font-weight:600;color:var(--blue);background:var(--chip-eng);padding:2px 8px;border-radius:20px">Este mes</span>':''}
          <span style="font-size:12px;color:var(--text3);margin-left:auto">${items.length} aniversario${items.length!==1?'s':''}</span>
        </div>
        <table class="data-table" style="border-radius:0">
          <thead><tr><th>Persona</th><th>Fecha de ingreso</th><th>Próximo aniversario</th><th>Años</th></tr></thead>
          <tbody>${items.map((r,idx)=>{
            const dl=r.days===0?'¡Hoy! 🎉':r.days===1?'Mañana':`en ${r.days} días`;
            const em=r.años>=5?'🏆':r.años>=3?'🎉':'⭐';
            const ingDate=new Date(r.fecha+'T12:00:00');
            const proxAniv=new Date(ingDate);proxAniv.setFullYear(now.getFullYear());
            if(proxAniv<now) proxAniv.setFullYear(now.getFullYear()+1);
            const proxAnivStr=proxAniv.toLocaleDateString('es-AR',{day:'2-digit',month:'short',year:'numeric'});
            const bg=idx%2===0?'background:var(--bg2)':'';
            return`<tr data-nombre="${r.nombre.toLowerCase()}" data-años="${r.años}" data-grupo="${r.grupo}" style="${bg}"><td>${avH(r.nombre)}${r.nombre}</td><td style="font-size:12px;color:var(--text2)">${fmt(r.fecha)}</td><td style="font-size:12px;color:var(--text2)">${proxAnivStr}</td><td><span class="badge badge-purple">${r.años} ${r.años===1?'año':'años'} ${em} · ${dl}</span></td></tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
    });
    container.innerHTML=html;
  }
  // Poblar filtro por año de aniversario
  const añosDisponibles=[...new Set(rows.map(r=>r.años))].sort((a,b)=>a-b);
  const selAño=document.getElementById('aniv-año');
  if(selAño){
    selAño.innerHTML='<option value="">Todos los años</option>'+añosDisponibles.map(a=>`<option value="${a}">${a} ${a===1?'año':'años'}</option>`).join('');
  }
  return rows.filter(r=>r.days<=60).map(r=>({nombre:r.nombre,evento:`Aniversario ${r.años} ${r.años===1?'año':'años'} ${r.años>=5?'🏆':r.años>=3?'🎉':'⭐'}`,fecha:r.fecha,days:r.days}));
}
function filtrarAniversarios(){
  const q=(document.getElementById('aniv-search')?.value||'').toLowerCase();
  const año=document.getElementById('aniv-año')?.value||'';
  const grupo=document.getElementById('aniv-grupo')?.value||'';
  const container=document.getElementById('aniv-container');
  if(!container) return;
  let total=0;
  // Filtrar filas y ocultar secciones vacías
  container.querySelectorAll('.aniv-grupo-mes').forEach(seccion=>{
    const filas=seccion.querySelectorAll('tr[data-nombre]');
    let visibles=0;
    filas.forEach(tr=>{
      const nombre=tr.dataset.nombre||'';
      const años=tr.dataset.años||'';
      const g=tr.dataset.grupo||'';
      const matchQ=!q||nombre.includes(q);
      const matchAño=!año||años===año;
      const matchGrupo=!grupo||g===grupo;
      tr.style.display=matchQ&&matchAño&&matchGrupo?'':'none';
      if(matchQ&&matchAño&&matchGrupo) visibles++;
    });
    seccion.style.display=visibles>0?'':'none';
    total+=visibles;
  });
}
