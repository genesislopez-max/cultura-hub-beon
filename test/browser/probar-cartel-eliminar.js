// El cartel de confirmación al borrar una tarjeta de ingreso: ¿dice qué va a
// pasar con ESA persona, y coincide con lo que después realmente hace?
const {lanzar,urlDelHub}=require('./_comun');

const hace=dias=>{const d=new Date();d.setDate(d.getDate()-dias);return d.toISOString().slice(0,10);};
const enDias=dias=>{const d=new Date();d.setDate(d.getDate()+dias);return d.toISOString().slice(0,10);};

const PERSONAS=[
  {id:'p1',fields:{Nombre:'Alejandro Fabrega','Rol en empresa':'Engineer','Fecha de ingreso':hace(900),'Nivel Loyalty':'Lightning'}},
  {id:'p2',fields:{Nombre:'Alta Erronea','Rol en empresa':'Engineer','Fecha de ingreso':enDias(10),'Nivel Loyalty':'Spark'}},
  {id:'p3',fields:{Nombre:'Ya Se Va','Rol en empresa':'Engineer','Fecha de ingreso':hace(900),'Fecha de egreso':enDias(20),'Nivel Loyalty':'Ray'}},
];
const CHECKLIST=[
  {id:'c1',fields:{Persona:'Alejandro Fabrega',Tipo:'Ingreso',Fecha:hace(900),EstadoKanban:'Pre-ingreso'}},
  {id:'c2',fields:{Persona:'Alta Erronea',Tipo:'Ingreso',Fecha:enDias(10),EstadoKanban:'Pre-ingreso'}},
];
const TABLAS={
  Personas:PERSONAS,Checklist:CHECKLIST,Beneficios:[],'Beneficios Asignados':[],
  Proyectos:[{id:'pr1',fields:{Proyecto:'Atlas',Estado:'Activo'}}],'Presupuesto Loyalty':[],
  Eventos:[{id:'ev1',fields:{Evento:'Cumple de Alejandro Fabrega'}},{id:'ev2',fields:{Evento:'Reminder de Alta Erronea'}}],
  Capacitaciones:[],'Ambassador Week':[],'Off Sites':[],'Get Together':[],
  'Asistencia a Actividades':[],'Meet our Teams':[],Tareas:[],'Eventos Feedback':[],'Historial Loyalty':[],
};

(async()=>{
  const browser=await lanzar();
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  let borrados=[];
  await page.exposeFunction('_borradosReset',()=>{borrados=[];});
  await page.exposeFunction('_borrados',()=>borrados.slice());
  await page.route('**/api/**',route=>{
    const req=route.request();
    const url=decodeURIComponent(req.url());
    if(url.includes('/api/slack')) return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    const path=(url.match(/path=([^&]+)/)||[])[1]||'';
    const [tabla,recId]=path.split('/');
    if(req.method()==='DELETE'){
      borrados.push(tabla);
      return route.fulfill({status:200,contentType:'application/json',body:'{"records":[]}'});
    }
    if(req.method()==='PATCH') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:recId,fields:{}})});
    if(req.method()==='POST'){
      const body=JSON.parse(req.postData()||'{}');
      const fields=body.records?.[0]?.fields||body.fields||{};
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:[{id:'nuevo',fields}]})});
    }
    let records=TABLAS[tabla]||[];
    const form=(url.match(/filterByFormula=([^&]*)/)||[])[1]||'';
    if(tabla==='Checklist'&&/\{Tipo\}="Egreso"/.test(form)) records=[];
    if(tabla==='Checklist'&&/\{Tipo\}="Ingreso"/.test(form)) records=CHECKLIST;
    if(tabla==='Personas'&&/\{Nombre\}="([^"]+)"/.test(form)){
      const b=form.match(/\{Nombre\}="([^"]+)"/)[1];
      records=PERSONAS.filter(p=>p.fields.Nombre===b);
    }
    if(tabla==='Eventos'&&/FIND\("([^"]+)"/.test(form)){
      const b=form.match(/FIND\("([^"]+)"/)[1];
      records=TABLAS.Eventos.filter(e=>(e.fields.Evento||'').includes(b));
    }
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records})});
  });
  await page.goto(urlDelHub());

  const r=await page.evaluate(async()=>{
    window.getIdToken=()=>'x'; window.puedeEscribir=()=>true; window.rolUsuarioActual=()=>'full';
    document.getElementById('login-screen').style.display='none';
    await cargarSeccionesIniciales();
    const esperar=ms=>new Promise(r=>setTimeout(r,ms));

    const probar=async(checklistId,nombre)=>{
      await window._borradosReset();
      await confirmarEliminar(checklistId,nombre);
      await esperar(80);
      const cartel={
        titulo:document.getElementById('confirm-title').textContent,
        texto:document.getElementById('confirm-msg').textContent,
      };
      document.getElementById('confirm-ok').click();   // confirmar de verdad
      await esperar(500);
      return {...cartel,borrado:await window._borrados()};
    };

    return {
      veterano:await probar('c1','Alejandro Fabrega'),
      altaErronea:await probar('c2','Alta Erronea'),
    };
  });

  const mostrar=(k,v)=>{
    console.log(`\n── ${k} ──`);
    console.log('  Título:',v.titulo);
    console.log('  Texto :',v.texto.replace(/\n+/g,' ⏎ '));
    console.log('  Borró :',v.borrado.join(', ')||'(nada)');
  };
  mostrar('Alejandro Fabrega (900 días en BEON)',r.veterano);
  mostrar('Alta Erronea (ingresa en 10 días)',r.altaErronea);

  const fallas=[];
  const v=r.veterano;
  if(!/tarjeta de ingreso/i.test(v.titulo)) fallas.push('el título no aclara que se borra la tarjeta: '+v.titulo);
  if(!/quedan intactos/i.test(v.texto)) fallas.push('el cartel no dice que el registro queda intacto');
  if(!/Trabaja en BEON desde/i.test(v.texto)) fallas.push('el cartel no dice por qué está protegido');
  if(/TAMBIÉN el registro/i.test(v.texto)) fallas.push('el cartel sigue amenazando con borrar su registro');
  if(v.borrado.includes('Personas')||v.borrado.includes('Eventos')) fallas.push('¡borró su registro igual! → '+v.borrado.join(', '));
  if(!v.borrado.includes('Checklist')) fallas.push('no borró la tarjeta');

  const a=r.altaErronea;
  if(!/TAMBIÉN el registro/i.test(a.texto)) fallas.push('el cartel del alta cancelada no avisa que borra todo');
  if(!a.borrado.includes('Personas')) fallas.push('dejó de poder cancelar un alta cargada por error');

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ El cartel dice qué va a pasar con esa persona, y es lo que después hace');
  await browser.close();
  process.exit(fallas.length?1:0);
})();
