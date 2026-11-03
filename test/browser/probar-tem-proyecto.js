// Cambiar el TEM de un proyecto desde el Hub.
const {lanzar,urlDelHub}=require('./_comun');

const PERSONAS=[
  {id:'t1',fields:{Nombre:'Tina TEM','Rol en empresa':'TEM','Fecha de ingreso':'2019-01-01','Nivel Loyalty':'Storm'}},
  {id:'t2',fields:{Nombre:'Tito TEM','Rol en empresa':'TEM','Fecha de ingreso':'2019-01-01','Nivel Loyalty':'Storm'}},
  // Atlas: tres devs, dos TEMs distintos
  {id:'p1',fields:{Nombre:'Ana Dev','Rol en empresa':'Engineer',Proyecto:'Atlas',Manager:'Tina TEM','Fecha de ingreso':'2021-01-01','Nivel Loyalty':'Ray'}},
  {id:'p2',fields:{Nombre:'Beto Dev','Rol en empresa':'Engineer',Proyecto:'Atlas',Manager:'Tina TEM','Fecha de ingreso':'2021-01-01','Nivel Loyalty':'Ray'}},
  {id:'p3',fields:{Nombre:'Caro Dev','Rol en empresa':'Engineer',Proyecto:'Atlas',Manager:'Tito TEM','Fecha de ingreso':'2021-01-01','Nivel Loyalty':'Ray'}},
  // Ya no está: no tiene que contar ni aparecer en la lista
  {id:'p4',fields:{Nombre:'Ex Dev','Rol en empresa':'Engineer',Proyecto:'Atlas',Manager:'Tina TEM','Fecha de ingreso':'2020-01-01','Fecha de egreso':'2024-01-01','Nivel Loyalty':'Ray'}},
  // Otro proyecto: no se tiene que tocar
  {id:'p5',fields:{Nombre:'Dani Dev','Rol en empresa':'Engineer',Proyecto:'Evvnt',Manager:'Tina TEM','Fecha de ingreso':'2021-01-01','Nivel Loyalty':'Ray'}},
];
const PROYECTOS=[
  {id:'pr1',fields:{Proyecto:'Atlas',Estado:'Activo','Fecha de Inicio':'2021-01-01'}},
  {id:'pr2',fields:{Proyecto:'Evvnt',Estado:'Activo'}},
  {id:'pr3',fields:{Proyecto:'Vacio',Estado:'Activo'}},
];
const TABLAS={
  Personas:PERSONAS,Proyectos:PROYECTOS,Checklist:[],Beneficios:[],'Beneficios Asignados':[],
  'Presupuesto Loyalty':[],Eventos:[],Capacitaciones:[],'Ambassador Week':[],'Off Sites':[],
  'Get Together':[],'Asistencia a Actividades':[],'Meet our Teams':[],Tareas:[],
  'Eventos Feedback':[],'Historial Loyalty':[],
};

(async()=>{
  const browser=await lanzar();
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  const patches=[];
  await page.route('**/api/**',route=>{
    const req=route.request();
    const url=decodeURIComponent(req.url());
    if(url.includes('/api/slack')) return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    const path=(url.match(/path=([^&]+)/)||[])[1]||'';
    const [tabla,recId]=path.split('/');
    if(req.method()==='PATCH'){
      patches.push({tabla,recId,fields:JSON.parse(req.postData()||'{}').fields||{}});
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:recId,fields:{}})});
    }
    if(req.method()==='POST') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:[{id:'x',fields:{}}]})});
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:TABLAS[tabla]||[]})});
  });
  await page.goto(urlDelHub());

  const r=await page.evaluate(async()=>{
    window.getIdToken=()=>'x'; window.puedeEscribir=()=>true; window.rolUsuarioActual=()=>'full';
    document.getElementById('login-screen').style.display='none';
    await cargarSeccionesIniciales();
    const esperar=ms=>new Promise(r=>setTimeout(r,ms));
    showSection('proyectos',document.querySelector('.sb-item[onclick*="proyectos"]'));
    await esperar(150);

    // Entro al proyecto como se entra de verdad: click en la fila
    openMeetModal('pr1','Atlas');
    await esperar(120);
    const enElModal={
      label:document.getElementById('meet-tem-label').textContent,
      botonVisible:document.getElementById('meet-tem-editar').style.display!=='none',
    };
    // Y desde ahí, "Cambiar TEM"
    editarTemDesdeMeet();
    await esperar(200);
    const meetSigueAbierto=document.getElementById('meet-overlay').classList.contains('open');
    const titulo=document.getElementById('modal-title').textContent;
    const listados=[...document.querySelectorAll('.ep-tem-chk')].map(c=>c.value);
    const opciones=[...document.getElementById('f-ep-tem').options].map(o=>o.value);
    const preseleccion=document.getElementById('f-ep-tem').value;

    // Paso todo Atlas a Tito TEM, menos Beto
    document.getElementById('f-ep-tem').value='Tito TEM';
    actualizarAvisoTemProyecto();
    const avisoAntes=document.getElementById('f-ep-tem-aviso').textContent;
    [...document.querySelectorAll('.ep-tem-chk')].find(c=>c.value==='Beto Dev').checked=false;
    actualizarAvisoTemProyecto();
    const aviso=document.getElementById('f-ep-tem-aviso').textContent;
    await window._activeForm.save();
    closeModal();
    await esperar(200);

    // Un proyecto sin gente asignada no ofrece el selector, lo explica
    editarProyecto('pr3');
    await esperar(200);
    const vacio={
      haySelect:!!document.getElementById('f-ep-tem'),
      texto:document.getElementById('modal-body').textContent,
    };
    closeModal();
    return {enElModal,meetSigueAbierto,titulo,listados,opciones,preseleccion,avisoAntes,aviso,vacio};
  });

  const porPersona=id=>patches.filter(p=>p.tabla==='Personas'&&p.recId===id).map(p=>p.fields.Manager);

  console.log('── En el modal del proyecto ──');
  console.log('  Label:',r.enElModal.label,'· botón "Cambiar TEM":',r.enElModal.botonVisible?'visible':'OCULTO');
  console.log('  Al apretarlo abre:',r.titulo,'· el modal del proyecto quedó',r.meetSigueAbierto?'ABIERTO (tapa el form)':'cerrado');
  console.log('\n── El bloque de TEM ──');
  console.log('  Gente listada:',r.listados.join(', '));
  console.log('  Opciones     :',r.opciones.map(o=>o||'(dejar como está)').join(' / '));
  console.log('  Preselección :',JSON.stringify(r.preseleccion));
  console.log('  Aviso con todos tildados:',r.avisoAntes);
  console.log('  Aviso destildando a Beto:',r.aviso);
  console.log('\n── Lo que se guardó ──');
  ['p1','p2','p3','p5'].forEach(id=>{
    const nom=PERSONAS.find(p=>p.id===id).fields.Nombre;
    console.log(`  ${nom.padEnd(10)}→`,porPersona(id).join(', ')||'(sin cambios)');
  });
  console.log('\n── Proyecto sin gente asignada ──');
  console.log('  ¿Ofrece el selector?:',r.vacio.haySelect?'sí (mal)':'no');

  const fallas=[];
  if(!r.enElModal.botonVisible) fallas.push('el modal del proyecto no ofrece cambiar el TEM');
  if(r.meetSigueAbierto) fallas.push('el modal del proyecto quedó abierto por encima del form');
  if(!/Atlas/.test(r.titulo)) fallas.push('no abrió la edición de ese proyecto: '+r.titulo);
  if(r.listados.join('|')!=='Ana Dev|Beto Dev|Caro Dev') fallas.push('la lista de gente no es la del proyecto activo: '+r.listados.join(', '));
  if(r.preseleccion!=='') fallas.push('preseleccionó un TEM habiendo dos distintos: '+r.preseleccion);
  // Caro ya tiene a Tito TEM, así que de los 3 tildados cambian 2
  if(!/2 personas: Ana Dev, Beto Dev/.test(r.avisoAntes)) fallas.push('el aviso no dice a quiénes les cambia: '+r.avisoAntes);
  if(!/1 persona: Ana Dev/.test(r.aviso)||/Beto/.test(r.aviso)) fallas.push('destildar a Beto no lo saca del aviso: '+r.aviso);
  if(porPersona('p1').join()!=='Tito TEM') fallas.push('no le cambió el TEM a Ana: '+porPersona('p1'));
  if(porPersona('p2').length) fallas.push('le cambió el TEM a Beto, que estaba destildado');
  if(porPersona('p3').length) fallas.push('tocó a Caro, que ya tenía Tito TEM');
  if(porPersona('p5').length) fallas.push('tocó a alguien de otro proyecto');
  if(patches.some(p=>p.tabla==='Personas'&&p.recId==='p4')) fallas.push('tocó a alguien que ya no está en BEON');
  if(r.vacio.haySelect) fallas.push('ofrece cambiar el TEM de un proyecto sin gente');
  if(!/se define al asignarle devs/.test(r.vacio.texto)) fallas.push('no explica por qué no se puede');

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ El TEM del proyecto se edita desde el Hub, y solo cambia a quien corresponde');
  await browser.close();
  process.exit(fallas.length?1:0);
})();
