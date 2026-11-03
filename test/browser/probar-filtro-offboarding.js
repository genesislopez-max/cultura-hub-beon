// El board de Offboarding: si tengo puesto un filtro y se recargan los datos,
// ¿siguen ocultas las tarjetas que no matchean?
const {lanzar,urlDelHub}=require('./_comun');

const PERSONAS=[
  {id:'t1',fields:{Nombre:'Tina TEM','Rol en empresa':'TEM','Fecha de ingreso':'2019-01-01'}},
  {id:'p1',fields:{Nombre:'Ana Dev','Rol en empresa':'Engineer','Fecha de ingreso':'2021-01-01',Manager:'Tina TEM','Fecha de egreso':'2030-01-31'}},
  {id:'p2',fields:{Nombre:'Beto Dev','Rol en empresa':'Engineer','Fecha de ingreso':'2021-01-01',Manager:'Tina TEM','Fecha de egreso':'2030-02-28'}},
  {id:'p3',fields:{Nombre:'Caro Dev','Rol en empresa':'Engineer','Fecha de ingreso':'2021-01-01',Manager:'Tina TEM','Fecha de egreso':'2030-03-31'}},
];
const CHECKLIST=[
  {id:'c1',fields:{Persona:'Ana Dev',Tipo:'Egreso',Fecha:'2030-01-02',EstadoKanban:'Aviso dado'}},
  {id:'c2',fields:{Persona:'Beto Dev',Tipo:'Egreso',Fecha:'2030-02-02',EstadoKanban:'Aviso dado'}},
  {id:'c3',fields:{Persona:'Caro Dev',Tipo:'Egreso',Fecha:'2030-03-02',EstadoKanban:'Aviso dado'}},
];
const TABLAS={
  Personas:PERSONAS,Checklist:CHECKLIST,Beneficios:[],'Beneficios Asignados':[],
  Proyectos:[{id:'pr1',fields:{Proyecto:'Atlas',Estado:'Activo'}}],'Presupuesto Loyalty':[],
  Eventos:[],Capacitaciones:[],'Ambassador Week':[],'Off Sites':[],'Get Together':[],
  'Asistencia a Actividades':[],'Meet our Teams':[],Tareas:[],'Eventos Feedback':[],'Historial Loyalty':[],
};

(async()=>{
  const browser=await lanzar();
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  await page.route('**/api/**',route=>{
    const req=route.request();
    const url=decodeURIComponent(req.url());
    if(url.includes('/api/slack')) return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    const path=(url.match(/path=([^&]+)/)||[])[1]||'';
    const [tabla,recId]=path.split('/');
    if(req.method()==='PATCH') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:recId,fields:{}})});
    if(req.method()==='POST') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:[{id:'x',fields:{}}]})});
    let records=TABLAS[tabla]||[];
    const form=(url.match(/filterByFormula=([^&]*)/)||[])[1]||'';
    if(tabla==='Checklist'&&/\{Tipo\}="Egreso"/.test(form)) records=CHECKLIST;
    if(tabla==='Checklist'&&/\{Tipo\}="Ingreso"/.test(form)) records=[];
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records})});
  });
  await page.goto(urlDelHub());

  const r=await page.evaluate(async()=>{
    window.getIdToken=()=>'x'; window.puedeEscribir=()=>true; window.rolUsuarioActual=()=>'full';
    document.getElementById('login-screen').style.display='none';
    await cargarSeccionesIniciales();
    const esperar=ms=>new Promise(r=>setTimeout(r,ms));
    const visibles=()=>[...document.querySelectorAll('#kb-egresos .eg-card')]
      .filter(c=>c.style.display!=='none').length;

    document.getElementById('egresos-search').value='Beto';
    filtrarEgresos();
    const antes=visibles();

    await loadKanbanEgresos();   // lo que pasa cada vez que se guarda algo
    await esperar(200);
    return {antes,despues:visibles(),busqueda:document.getElementById('egresos-search').value};
  });

  console.log('── Offboarding, buscando "Beto" ──');
  console.log('  Tarjetas visibles antes de recargar:',r.antes);
  console.log('  Después de recargar:',r.despues,'· el texto buscado sigue siendo',JSON.stringify(r.busqueda));

  const fallas=[];
  if(r.antes!==1) fallas.push('el filtro no funciona ni antes de recargar: '+r.antes+' tarjetas');
  if(r.despues!==r.antes) fallas.push(`volvieron a aparecer todas: ${r.antes} → ${r.despues} tarjetas`);

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ El filtro del board de Offboarding sobrevive a la recarga');
  await browser.close();
  process.exit(fallas.length?1:0);
})();
