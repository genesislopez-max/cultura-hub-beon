// Rediseño (claude.ai/design "Aniversarios.dc.html"): hero con el próximo
// aniversario, KPIs, tira de "hitos de retención" (1/3/5/10 años en los
// próximos 90 días) y tabla agrupada por mes. El filtro por grupo (Engineers
// & Tech / Core Team) que tenía la versión anterior no está en el diseño —
// se reemplaza por el rango rápido (Todos/30 días/7 días) + un filtro de
// años por umbral ("3+ años", "Solo hitos", etc.) en vez de año exacto.
let cacheAnivRows=[];
let anivRango='all';

const ANIV_MILE=[1,3,5,10];
const ANIV_MILE_DEFS=[
  {y:1,label:'1 año',color:'#3A69FF',tint:'rgba(58,105,255,.08)',border:'rgba(58,105,255,.18)'},
  {y:3,label:'3 años',color:'#7432FF',tint:'rgba(116,50,255,.08)',border:'rgba(116,50,255,.18)'},
  {y:5,label:'5 años',color:'#E0508A',tint:'rgba(224,80,138,.08)',border:'rgba(224,80,138,.2)'},
  {y:10,label:'10 años',color:'#B7791F',tint:'rgba(183,121,31,.09)',border:'rgba(183,121,31,.22)'},
];

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
    return{nombre:f.Nombre,fecha:f['Fecha de ingreso'],años,days:daysTo(f['Fecha de ingreso']),manager:f.Manager||'',isMile:ANIV_MILE.includes(años)};
  }).filter(Boolean).sort((a,b)=>a.days-b.days);
  cacheAnivRows=rows;
  poblarSelectorTEM('aniv-tem');

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

  renderAnivHero(rows);
  renderAnivHitos(rows);

  // Card inicio con lista
  document.getElementById('sc-aniv').textContent=esteM.length;
  document.getElementById('sc-aniv-sub').textContent=mesNombre;
  const listEl=document.getElementById('sc-list-aniv');
  const moreEl=document.getElementById('sc-more-aniv');
  const e=r=>r.años>=5?'🏆':r.años>=3?'🎉':'⭐';
  listEl.innerHTML=esteM.slice(0,5).map(r=>`<div class="sc-list-item">${avH(r.nombre)}<span class="sc-list-item-name">${r.nombre}</span><span class="sc-list-item-badge" style="background:var(--tinte-pink);color:var(--text-pink-accent)">${e(r)} ${r.años}a</span></div>`).join('');
  moreEl.style.display=esteM.length>5?'flex':'none';

  filtrarAniversarios();

  return rows.filter(r=>r.days<=60).map(r=>({nombre:r.nombre,evento:`Aniversario ${r.años} ${r.años===1?'año':'años'} ${r.años>=5?'🏆':r.años>=3?'🎉':'⭐'}`,fecha:r.fecha,days:r.days}));
}

// Hero "Próximo aniversario" — siempre el más próximo de TODOS (no depende
// de los filtros de la tabla), igual que renderCumpleHero() en cumpleanos.js.
function renderAnivHero(rows){
  const avatarEl=document.getElementById('aniv-hero-avatar');
  const nombreEl=document.getElementById('aniv-hero-nombre');
  const subEl=document.getElementById('aniv-hero-sub');
  const chipsEl=document.getElementById('aniv-hero-chips');
  const next=rows[0];
  if(!next){
    avatarEl.textContent='🏆';
    nombreEl.textContent='Sin aniversarios cargados';
    subEl.textContent='';
    chipsEl.innerHTML='';
    return;
  }
  avatarEl.textContent=ini(next.nombre);
  nombreEl.textContent=next.nombre;
  subEl.textContent=`Ingresó el ${fmt(next.fecha)}${next.manager?' · '+next.manager:''}`;
  const cuando=next.days===0?'Es hoy':next.days===1?'Mañana':`En ${next.days} días`;
  chipsEl.innerHTML=`
    <span class="aniv-hero-chip"><i class="ti ti-award"></i>${next.años} ${next.años===1?'año':'años'} en BEON</span>
    <span class="aniv-hero-chip"><i class="ti ti-clock"></i>${cuando}</span>`;
}

// Hitos de retención — cuántas personas llegan a un aniversario "redondo"
// (1/3/5/10 años) en los próximos 90 días. Es una foto general del equipo,
// no depende de los filtros de búsqueda/rango/manager de la tabla de abajo.
function renderAnivHitos(rows){
  const q90=rows.filter(r=>r.days<=90);
  const el=document.getElementById('aniv-mile-list');
  el.innerHTML=ANIV_MILE_DEFS.map(m=>{
    const count=q90.filter(r=>r.años===m.y).length;
    return`<div class="aniv-mile-chip" style="background:${m.tint};border:1px solid ${m.border}"><span class="aniv-mile-count" style="color:${m.color}">${count}</span><span class="aniv-mile-label">${m.label}</span></div>`;
  }).join('');
}

function setAnivRango(rango,btn){
  anivRango=rango;
  document.querySelectorAll('.aniv-seg').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  filtrarAniversarios();
}

// Único lugar donde vive el criterio de filtrado — lo usan tanto
// filtrarAniversarios() (para pintar la tabla) como exportarAniversariosExcel()
// (para exportar exactamente lo que se está viendo), así no hay dos copias
// del mismo criterio que puedan irse desalineando.
function aniversariosFiltrados(){
  const q=(document.getElementById('aniv-search')?.value||'').trim().toLowerCase();
  const añosFil=document.getElementById('aniv-años')?.value||'';
  const temFil=document.getElementById('aniv-tem')?.value||'';
  return cacheAnivRows.filter(r=>
    (!q||r.nombre.toLowerCase().includes(q))&&
    (!temFil||r.manager===temFil)&&
    (!añosFil||(añosFil==='mile'?r.isMile:r.años>=Number(añosFil)))&&
    (anivRango==='all'||(anivRango==='30'&&r.days<=30)||(anivRango==='7'&&r.days<=7))
  );
}

function filtrarAniversarios(){
  const filtrados=aniversariosFiltrados();
  document.getElementById('badge-aniv-h').textContent=`${filtrados.length} persona${filtrados.length!==1?'s':''}`;
  renderAnivLista(filtrados);
}

// Escala de color/ícono: hoy → rosa, mañana → rojo, hito (1/3/5/10 años) →
// morado, ≤30d → azul, resto → gris. Mismo criterio que el mockup.
function badgeAnivClase(r){
  if(r.days===0) return 'badge-pink';
  if(r.days===1) return 'badge-red';
  if(r.isMile) return 'badge-purple';
  if(r.days<=30) return 'badge-blue';
  return 'badge-gray';
}
function badgeAnivIcono(r){
  if(r.days===0) return 'ti-confetti';
  if(r.days===1) return 'ti-sunrise';
  if(r.isMile) return 'ti-trophy';
  if(r.days<=30) return 'ti-calendar-clock';
  return 'ti-calendar';
}

function proximoAnivDe(r,now){
  const ing=new Date(r.fecha+'T12:00:00');
  const prox=new Date(ing);prox.setFullYear(now.getFullYear());
  if(prox<now) prox.setFullYear(now.getFullYear()+1);
  return prox;
}

function filaAnivRow(r,now){
  const proxAniv=proximoAnivDe(r,now);
  const proxAnivStr=proxAniv.toLocaleDateString('es-AR',{day:'2-digit',month:'short',year:'numeric'});
  const dl=r.days===0?'¡Hoy!':r.days===1?'Mañana':`en ${r.days} días`;
  return`<div class="aniv-row">
    <div class="aniv-row-persona">
      ${avH(r.nombre)}
      <div class="aniv-row-info">
        <div class="aniv-row-name">${r.nombre}</div>
        ${r.manager?`<div class="aniv-row-manager">${r.manager}</div>`:''}
      </div>
    </div>
    <div style="font-size:13px;color:var(--text2)">${fmt(r.fecha)}</div>
    <div style="font-size:13px;color:var(--text);font-weight:600">${proxAnivStr}</div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span class="badge ${badgeAnivClase(r)}"><i class="ti ${badgeAnivIcono(r)}"></i> ${r.años} ${r.años===1?'año':'años'} · ${dl}</span>
      ${r.isMile?'<span class="aniv-hito-tag">Hito</span>':''}
    </div>
  </div>`;
}

// Agrupa por mes calendario del próximo aniversario (no por mes de ingreso)
// — mismo criterio que ya usaba esta tabla antes del rediseño.
function renderAnivLista(rows){
  const container=document.getElementById('aniv-container');
  if(!rows.length){
    container.innerHTML=`<div class="aniv-empty">
      <div class="aniv-empty-icon"><i class="ti ti-search-off"></i></div>
      <div class="aniv-empty-title">Sin aniversarios en este rango</div>
      <div class="aniv-empty-sub">Ajustá la búsqueda o los filtros</div>
    </div>`;
    return;
  }
  const now=new Date();now.setHours(0,0,0,0);
  const rowsOrdenados=[...rows].sort((a,b)=>{
    const pa=proximoAnivDe(a,now),pb=proximoAnivDe(b,now);
    if(pa.getMonth()!==pb.getMonth()||pa.getFullYear()!==pb.getFullYear()) return pa.getTime()-pb.getTime();
    return b.años-a.años;
  });

  const grupos={};
  rowsOrdenados.forEach(r=>{
    const prox=proximoAnivDe(r,now);
    const key=`${prox.getFullYear()}-${String(prox.getMonth()).padStart(2,'0')}`;
    if(!grupos[key]){
      const mesLabel=prox.toLocaleDateString('es-AR',{month:'long',year:'numeric'});
      grupos[key]={label:mesLabel.charAt(0).toUpperCase()+mesLabel.slice(1),items:[],esActual:prox.getMonth()===now.getMonth()&&prox.getFullYear()===now.getFullYear()};
    }
    grupos[key].items.push(r);
  });

  let html='';
  Object.entries(grupos).sort(([a],[b])=>a.localeCompare(b)).forEach(([,{label,items,esActual}])=>{
    html+=`<div class="aniv-mes-header">
      <span>${label}</span>
      ${esActual?'<span class="badge badge-blue">Este mes</span>':''}
      <span class="aniv-mes-count">${items.length} aniversario${items.length!==1?'s':''}</span>
    </div>`;
    html+=items.map(r=>filaAnivRow(r,now)).join('');
  });
  container.innerHTML=html;
}

// Exporta a Excel exactamente lo que se está viendo (mismo criterio de
// filtrado que la tabla) — mismo mecanismo que exportarRosterExcel() /
// exportarAVPersonaExcel().
function exportarAniversariosExcel(){
  if(typeof XLSX==='undefined'){ toast('No se pudo cargar el generador de Excel',true); return; }
  const filtrados=aniversariosFiltrados();
  if(!filtrados.length){ toast('No hay aniversarios para exportar con este filtro',true); return; }
  const now=new Date();now.setHours(0,0,0,0);
  const filas=filtrados.slice().sort((a,b)=>a.days-b.days).map(r=>({
    Persona:r.nombre,
    Manager:r.manager||'',
    'Fecha de ingreso':fmt(r.fecha),
    'Próximo aniversario':proximoAnivDe(r,now).toLocaleDateString('es-AR',{day:'2-digit',month:'short',year:'numeric'}),
    Años:r.años,
    Hito:r.isMile?'Sí':'No',
  }));
  const ws=XLSX.utils.json_to_sheet(filas);
  ws['!cols']=[{wch:26},{wch:22},{wch:16},{wch:18},{wch:8},{wch:8}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Aniversarios');
  XLSX.writeFile(wb,'Aniversarios.xlsx');
}
