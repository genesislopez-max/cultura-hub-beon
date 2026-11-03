// Alguien que hace años trabaja en BEON y nunca se fue, pero no tiene tarjeta
// en el Kanban de Ingresos: ¿el Hub le inventa un "ingreso"? ¿Y qué pasa si se
// borra esa tarjeta?
const {lanzar,urlDelHub}=require('./_comun');

const hace=dias=>{const d=new Date();d.setDate(d.getDate()-dias);return d.toISOString().slice(0,10);};
const enDias=dias=>{const d=new Date();d.setDate(d.getDate()+dias);return d.toISOString().slice(0,10);};

const PERSONAS=[
  // El caso del bug: hace años en la empresa, sin tarjeta de ingreso
  {id:'p1',fields:{Nombre:'Alejandro Fabrega','Rol en empresa':'Engineer','Fecha de ingreso':hace(900),'Nivel Loyalty':'Lightning',Mail:'ale@beon.tech',Proyecto:'Atlas'}},
  // Un ingreso de verdad, que SÍ tiene que seguir generando tarjeta
  {id:'p2',fields:{Nombre:'Nueva Persona','Rol en empresa':'Engineer','Fecha de ingreso':enDias(10),'Nivel Loyalty':'Spark',Mail:'nueva@beon.tech'}},
  // Cargada tarde: entró hace tres semanas y todavía está onboardeando
  {id:'p3',fields:{Nombre:'Entro Reciente','Rol en empresa':'Core Team','Fecha de ingreso':hace(21),'Nivel Loyalty':'Spark'}},
];
const TABLAS={
  Personas:PERSONAS,Checklist:[],Beneficios:[],'Beneficios Asignados':[],
  Proyectos:[{id:'pr1',fields:{Proyecto:'Atlas',Estado:'Activo'}}],'Presupuesto Loyalty':[],
  Eventos:[{id:'ev1',fields:{Evento:'Cumple de Alejandro Fabrega'}}],Capacitaciones:[],
  'Ambassador Week':[],'Off Sites':[],'Get Together':[],'Asistencia a Actividades':[],
  'Meet our Teams':[],Tareas:[],'Eventos Feedback':[],'Historial Loyalty':[],
};

(async()=>{
  const browser=await lanzar();
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  const creados=[],slacks=[];
  await page.route('**/api/**',route=>{
    const req=route.request();
    const url=decodeURIComponent(req.url());
    if(url.includes('/api/slack')){
      slacks.push(JSON.parse(req.postData()||'{}').text||'');
      return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    }
    const path=(url.match(/path=([^&]+)/)||[])[1]||'';
    const [tabla,recId]=path.split('/');
    if(req.method()==='DELETE') return route.fulfill({status:200,contentType:'application/json',body:'{"records":[]}'});
    if(req.method()==='PATCH') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:recId,fields:{}})});
    if(req.method()==='POST'){
      const body=JSON.parse(req.postData()||'{}');
      const fields=body.records?.[0]?.fields||body.fields||{};
      creados.push({tabla,fields});
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:[{id:'nuevo',fields}]})});
    }
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:TABLAS[tabla]||[]})});
  });
  await page.goto(urlDelHub());

  const r=await page.evaluate(async()=>{
    window.getIdToken=()=>'x'; window.puedeEscribir=()=>true; window.rolUsuarioActual=()=>'full';
    document.getElementById('login-screen').style.display='none';
    await cargarSeccionesIniciales();
    // Lo que decide el borrado: ¿el Hub considera que esta persona ya estuvo acá?
    const persona=cachePersonasRaw.find(p=>p.fields.Nombre==='Alejandro Fabrega');
    return {protegido:await tieneHistorialEnBeon('Alejandro Fabrega',persona)};
  });

  const tarjetas=creados.filter(c=>c.tabla==='Checklist').map(c=>c.fields.Persona);
  console.log('── Tarjetas de ingreso que creó el Hub solo ──');
  console.log('  ',tarjetas.join(', ')||'(ninguna)');
  console.log('── Avisos a Slack ──');
  slacks.forEach(s=>console.log('  ',s.replace(/\n/g,' | ')));
  console.log('── Al borrar esa tarjeta desde el Hub ──');
  console.log('   ¿se le respeta el registro de Personas?:',r.protegido?'sí':'NO, lo borra');

  const fallas=[];
  if(tarjetas.includes('Alejandro Fabrega')) fallas.push('le creó una tarjeta de ingreso a alguien que hace años trabaja acá');
  if(slacks.some(s=>s.includes('Alejandro Fabrega'))) fallas.push('y lo anunció por Slack como un ingreso nuevo');
  if(!tarjetas.includes('Nueva Persona')) fallas.push('dejó de crear la tarjeta de un ingreso real (fecha futura)');
  if(!tarjetas.includes('Entro Reciente')) fallas.push('dejó de crear la tarjeta de alguien que entró hace 3 semanas');
  if(!r.protegido) fallas.push('borrar la tarjeta borraría su registro de Personas y sus eventos');

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ Solo se le crea tarjeta a quien está entrando de verdad, y borrarla no toca a la persona');
  await browser.close();
  process.exit(fallas.length?1:0);
})();
