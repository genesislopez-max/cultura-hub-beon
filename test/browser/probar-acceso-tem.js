// Qué ve un TEM al entrar al Hub. Acompaña a los devs: Inicio, Engineers &
// Tech, Cumpleaños, Aniversarios, Ex BEONers y todo el grupo "Beneficios" del
// menú —Beneficios, Ambassador Week, Off Sites, Get Together y Asistencia a
// Actividades— pero siempre solo lo de Engineers.
//
// El menú es lo que la persona VE; lo que protege los datos es que el proxy no
// los mande (test/api-airtable-proxy.test.js). Acá se verifica además que ni
// navegando a mano se pueda entrar a una sección restringida.
const {lanzar,urlDelHub}=require('./_comun');

const PERSONAS=[
  {id:'p1',fields:{Nombre:'Una Dev','Rol en empresa':'Engineer','Fecha de ingreso':'2022-01-01','Nivel Loyalty':'Ray'}},
  {id:'p2',fields:{Nombre:'Un Manager','Rol en empresa':'Manager','Fecha de ingreso':'2021-01-01','Nivel Loyalty':'Storm'}},
];
const TABLAS={Personas:PERSONAS,Beneficios:[],'Beneficios Asignados':[],'Presupuesto Loyalty':[],
  Proyectos:[],Checklist:[],Eventos:[],Capacitaciones:[],'Ambassador Week':[],'Off Sites':[],
  'Get Together':[],'Asistencia a Actividades':[],'Meet our Teams':[],Tareas:[],
  'Eventos Feedback':[],'Historial Loyalty':[]};

const ESPERADAS=['inicio','engineers','cumpleanos','aniversarios','exbeoners',
  'beneficios','ambassadors','offsites','gettogether','actividades'];

(async()=>{
  const browser=await lanzar();
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  await page.route('**/api/**',route=>{
    const req=route.request();
    const url=decodeURIComponent(req.url());
    if(url.includes('/api/slack')) return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    const tabla=((url.match(/path=([^&]+)/)||[])[1]||'').split('/')[0];
    if(req.method()!=='GET') return route.fulfill({status:200,contentType:'application/json',body:'{"records":[]}'});
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:TABLAS[tabla]||[]})});
  });
  await page.goto(urlDelHub());

  const r=await page.evaluate(async()=>{
    // Se entra COMO TEM: es lo que decide todo lo de abajo.
    window.getIdToken=()=>'x';
    window.rolUsuarioActual=()=>'tem';
    window.grupoBeneficiosActual=()=>'Engineers';
    document.getElementById('login-screen').style.display='none';
    await cargarSeccionesIniciales();
    aplicarRestriccionesDeAcceso();
    await new Promise(r=>setTimeout(r,300));

    const seccionDe=el=>(el.getAttribute('onclick')||'').match(/showSection\('([a-z]+)'/)?.[1]||'';
    const visibles=[...document.querySelectorAll('.sb-item')]
      .filter(el=>el.style.display!=='none'&&el.offsetParent!==null)
      .map(seccionDe).filter(Boolean);

    // Navegar a mano a una restringida tiene que rebotar a Inicio
    showSection('coreteam',null);
    const trasCoreteam=document.querySelector('.section-page.active')?.id||'';
    showSection('eventoshist',null);
    const trasEventos=document.querySelector('.section-page.active')?.id||'';
    // Ex BEONers SÍ la tiene: navegar ahí tiene que entrar, no rebotar.
    showSection('exbeoners',null);
    const trasExbeoners=document.querySelector('.section-page.active')?.id||'';
    showSection('proyectos',null);
    const trasProyectos=document.querySelector('.section-page.active')?.id||'';
    showSection('offsites',null);
    const trasOffsites=document.querySelector('.section-page.active')?.id||'';

    // Y en Beneficios, el grupo queda fijo en Engineers
    await cargarSeccionLazy('beneficios');
    aplicarRestriccionesBeneficios();
    await new Promise(r=>setTimeout(r,250));
    const sel=document.getElementById('benef-persona-grupo');
    return {visibles,trasCoreteam,trasEventos,trasProyectos,trasExbeoners,trasOffsites,
      grupo:sel?.value||'', grupoBloqueado:!!sel?.disabled};
  });

  console.log('Entrando como TEM:');
  console.log('   secciones en el menú :',r.visibles.join(', ')||'(ninguna)');
  console.log('   navegar a coreteam   →',r.trasCoreteam);
  console.log('   navegar a eventoshist →',r.trasEventos);
  console.log('   navegar a proyectos  →',r.trasProyectos);
  console.log('   navegar a offsites   →',r.trasOffsites,'(esta sí la tiene)');
  console.log('   navegar a exbeoners  →',r.trasExbeoners,'(esta sí la tiene)');
  console.log('   filtro de grupo      :',r.grupo,r.grupoBloqueado?'(bloqueado)':'(EDITABLE)');
  await browser.close();

  const fallas=[];
  const sobran=r.visibles.filter(s=>!ESPERADAS.includes(s));
  const faltan=ESPERADAS.filter(s=>!r.visibles.includes(s));
  if(sobran.length) fallas.push('ve secciones que no le corresponden: '+sobran.join(', '));
  if(faltan.length) fallas.push('le faltan secciones que sí le corresponden: '+faltan.join(', '));

  // Esconder el ítem del menú no alcanza: entrar por otro camino tiene que rebotar
  [['coreteam',r.trasCoreteam],['eventoshist',r.trasEventos],['proyectos',r.trasProyectos]]
    .forEach(([s,destino])=>{ if(destino!=='page-inicio') fallas.push(`navegando a ${s} queda en ${destino}, no rebota a Inicio`); });
  // Y las que sí tiene no pueden rebotar
  if(r.trasExbeoners!=='page-exbeoners') fallas.push('no puede entrar a Ex BEONers, que sí le corresponde: '+r.trasExbeoners);
  if(r.trasOffsites!=='page-offsites') fallas.push('no puede entrar a Off Sites, que sí le corresponde: '+r.trasOffsites);

  if(r.grupo!=='Engineers') fallas.push('el filtro de grupo de Beneficios no queda en Engineers: '+r.grupo);
  if(!r.grupoBloqueado) fallas.push('el filtro de grupo se puede cambiar a Core Team, que llegaría vacío');

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ El TEM ve sus secciones (con el grupo Beneficios entero) y el filtro queda fijo en Engineers');
  process.exit(fallas.length?1:0);
})();
