// Al guardar una edición, ¿se pierde la búsqueda / los filtros / la página en
// la que estabas? ¿Y cuántas tablas vuelve a pedir el Hub?
const {lanzar,urlDelHub}=require('./_comun');

const NOMBRES=['Ana','Beto','Caro','Dani','Eli','Fran','Gise','Hugo','Ivan','Juli',
  'Kari','Lalo','Mara','Nico','Ona','Pablo','Queta','Rita','Sol','Tito',
  'Uma','Vale','Wally','Xime','Yago','Zoe'];
const PERSONAS=[
  {id:'t1',fields:{Nombre:'Tina TEM','Rol en empresa':'TEM','Fecha de ingreso':'2019-01-01','Nivel Loyalty':'Storm'}},
  ...NOMBRES.map((n,i)=>({id:'e'+i,fields:{
    Nombre:`${n} Engineer`,'Rol en empresa':'Engineer','Fecha de ingreso':'2021-01-01',
    'Nivel Loyalty':'Ray',Proyecto:i%2?'Atlas':'Evvnt',Manager:'Tina TEM',
    Mail:`${n.toLowerCase()}@beon.tech`}})),
];
const TABLAS={
  Personas:PERSONAS,Beneficios:[],'Beneficios Asignados':[],Checklist:[],
  Proyectos:[{id:'pr1',fields:{Proyecto:'Atlas',Estado:'Activo'}},{id:'pr2',fields:{Proyecto:'Evvnt',Estado:'Activo'}}],
  'Presupuesto Loyalty':[],Eventos:[],Capacitaciones:[],'Ambassador Week':[],'Off Sites':[],
  'Get Together':[],'Asistencia a Actividades':[],'Meet our Teams':[],Tareas:[],
  'Eventos Feedback':[],'Historial Loyalty':[],
};

(async()=>{
  const browser=await lanzar();
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  let pedidos=[];
  await page.exposeFunction('_pedidosReset',()=>{pedidos=[];});
  await page.route('**/api/**',route=>{
    const req=route.request();
    const url=decodeURIComponent(req.url());
    if(url.includes('/api/slack')) return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    const path=(url.match(/path=([^&]+)/)||[])[1]||'';
    const [tabla,recId]=path.split('/');
    if(req.method()==='PATCH') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:recId,fields:{}})});
    if(req.method()==='POST') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:[{id:'x',fields:{}}]})});
    pedidos.push(tabla);
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:TABLAS[tabla]||[]})});
  });
  await page.goto(urlDelHub());

  const r=await page.evaluate(async()=>{
    window.getIdToken=()=>'x'; window.puedeEscribir=()=>true; window.rolUsuarioActual=()=>'full';
    document.getElementById('login-screen').style.display='none';
    await cargarSeccionesIniciales();
    // Marcar como ya visitadas las secciones lazy, como después de un rato de uso
    ['beneficios','checklist','tareas'].forEach(s=>seccionesCargadas.add(s));
    showSection('engineers',document.querySelector('.sb-item[onclick*="engineers"]'));
    await new Promise(r=>setTimeout(r,150));

    // Me paro donde trabajaría de verdad: filtro por proyecto y busco
    document.getElementById('personas-proyecto-eng').value='Atlas';
    filtrarPersonas('eng');
    const visiblesAntes=document.querySelectorAll('#tbody-personas-eng .et-row').length;
    const totalAntes=document.getElementById('badge-personas-eng').textContent;

    // Edito a alguien de esa lista filtrada
    verFichaPersona('e1');
    await new Promise(r=>setTimeout(r,120));
    document.getElementById('pf-editar').click();
    await new Promise(r=>setTimeout(r,250));
    document.getElementById('f-per-ciudad').value='Córdoba';
    await window._pedidosReset(); // de acá en adelante, solo lo que cuesta guardar
    await saveRecord();
    await new Promise(r=>setTimeout(r,400));

    return {
      visiblesAntes, totalAntes,
      filtroProyecto:document.getElementById('personas-proyecto-eng').value,
      filtroManager:document.getElementById('personas-manager-eng').value,
      visiblesDespues:document.querySelectorAll('#tbody-personas-eng .et-row').length,
      totalDespues:document.getElementById('badge-personas-eng').textContent,
    };
  });

  console.log('── Antes de guardar (filtrado por proyecto Atlas) ──');
  console.log('  Filas visibles:',r.visiblesAntes,'· badge:',r.totalAntes);
  console.log('\n── Después de guardar ──');
  console.log('  Filtro Proyecto quedó en:',JSON.stringify(r.filtroProyecto));
  console.log('  Filas visibles:',r.visiblesDespues,'· badge:',r.totalDespues);
  console.log('\n── Tablas pedidas al guardar ──');
  const cuenta={}; pedidos.forEach(t=>cuenta[t]=(cuenta[t]||0)+1);
  console.log('  ',pedidos.length,'pedidos:',Object.entries(cuenta).map(([t,n])=>`${t}×${n}`).join(', '));

  const fallas=[];
  if(r.filtroProyecto!=='Atlas') fallas.push('se perdió el filtro de Proyecto: '+JSON.stringify(r.filtroProyecto));
  if(r.visiblesDespues!==r.visiblesAntes) fallas.push(`la lista dejó de estar filtrada: ${r.visiblesAntes} → ${r.visiblesDespues} filas`);
  if(r.totalDespues!==r.totalAntes) fallas.push(`el contador volvió al total: ${r.totalAntes} → ${r.totalDespues}`);
  if(pedidos.length>9) fallas.push(`guardar vuelve a pedir ${pedidos.length} tablas`);

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ Guardar no te mueve de donde estabas');
  await browser.close();
  process.exit(fallas.length?1:0);
})();
