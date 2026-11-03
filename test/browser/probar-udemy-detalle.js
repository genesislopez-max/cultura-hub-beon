// La card de beneficios de una persona: ¿cómo se ve una asignación de Udemy?
// Se prueban las dos puertas de entrada, porque una tiene el catálogo cargado
// y la otra no.
const {lanzar,urlDelHub}=require('./_comun');

const PERSONAS=[
  {id:'p1',fields:{Nombre:'Carlos Varela','Rol en empresa':'Engineer','Fecha de ingreso':'2021-01-01','Nivel Loyalty':'Ray',Mail:'carlos@beon.tech'}},
  {id:'p2',fields:{Nombre:'Guilherme Gervasio','Rol en empresa':'Engineer','Fecha de ingreso':'2021-01-01','Nivel Loyalty':'Ray',Mail:'gui@beon.tech'}},
];
const BENEFICIOS=[
  {id:'bUdemy',fields:{Beneficio:'Udemy Courses',Categoria:'Formación',Valor:50}},
];
const ASIGNADOS=[
  // Con el curso cargado
  {id:'a1',fields:{Persona:'Carlos Varela',Beneficio:['bUdemy'],Monto:40,'Fecha activación':'2026-03-10',Estado:'Activo',Curso:'Node.js avanzado',Link:'https://udemy.com/curso-node'}},
  // Sin el curso cargado: la misma fila, pero se ve distinta
  {id:'a2',fields:{Persona:'Guilherme Gervasio',Beneficio:['bUdemy'],Monto:35,'Fecha activación':'2026-04-02',Estado:'Activo',Link:'https://udemy.com/curso-react'}},
];
const TABLAS={
  Personas:PERSONAS,Beneficios:BENEFICIOS,'Beneficios Asignados':ASIGNADOS,
  Proyectos:[],Checklist:[],'Presupuesto Loyalty':[],Eventos:[],Capacitaciones:[],
  'Ambassador Week':[],'Off Sites':[],'Get Together':[],'Asistencia a Actividades':[],
  'Meet our Teams':[],Tareas:[],'Eventos Feedback':[],'Historial Loyalty':[],
};

(async()=>{
  const browser=await lanzar();
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  await page.route('**/api/**',route=>{
    const req=route.request();
    const url=decodeURIComponent(req.url());
    if(url.includes('/api/slack')) return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    const tabla=((url.match(/path=([^&]+)/)||[])[1]||'').split('/')[0];
    if(req.method()!=='GET') return route.fulfill({status:200,contentType:'application/json',body:'{"records":[]}'});
    let records=TABLAS[tabla]||[];
    const form=(url.match(/filterByFormula=(.*?)(?:&sort|$)/)||[])[1]||'';
    const m=form.match(/FIND\("([^"]*)"/);
    if(m){
      const buscado=m[1];
      const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
      records=records.filter(r=>norm(r.fields.Persona).includes(buscado));
    }
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records})});
  });
  await page.goto(urlDelHub());

  const r=await page.evaluate(async()=>{
    window.getIdToken=()=>'x'; window.puedeEscribir=()=>true; window.rolUsuarioActual=()=>'full';
    document.getElementById('login-screen').style.display='none';
    await cargarSeccionesIniciales();
    const esperar=ms=>new Promise(r=>setTimeout(r,ms));

    const leerFila=async(nombre)=>{
      await verBenefPersona(nombre,'Engineers & Tech','Ray');
      await esperar(400);
      const fila=document.querySelector('#bpd-body .bp-detalle-row');
      const txt=el=>el?el.textContent.replace(/\s+/g,' ').trim():'';
      const res={
        titulo:txt(fila?.querySelector('.bp-detalle-row-title')),
        sub:txt(fila?.querySelector('.bp-detalle-row-sub')),
        extras:[...(fila?.querySelectorAll('.bp-detalle-row-coment')||[])].map(txt),
        link:txt(fila?.querySelector('.bp-detalle-row-link')),
      };
      document.getElementById('bp-detalle-overlay').classList.remove('open');
      return res;
    };

    // (a) Como se entra desde Beneficios → Por persona: el catálogo ya cargado
    await cargarSeccionLazy('beneficios');
    await esperar(400);
    const conCatalogo={
      carlos:await leerFila('Carlos Varela'),
      gui:await leerFila('Guilherme Gervasio'),
    };

    // (b) Con el catálogo todavía vacío (la card se abre antes de visitar
    //     Beneficios — p. ej. desde Ex BEONers)
    cacheBeneficiosRaw=[];
    const sinCatalogo=await leerFila('Carlos Varela');

    return {conCatalogo,sinCatalogo};
  });

  const mostrar=(k,v)=>{
    console.log(`\n── ${k} ──`);
    console.log('  Título :',v.titulo);
    console.log('  Fecha  :',v.sub);
    console.log('  Extras :',v.extras.join(' | ')||'(ninguno)');
    console.log('  Link   :',v.link||'(ninguno)');
  };
  mostrar('Carlos Varela — con Curso cargado',r.conCatalogo.carlos);
  mostrar('Guilherme Gervasio — sin Curso cargado',r.conCatalogo.gui);
  mostrar('Carlos, con el catálogo todavía sin cargar',r.sinCatalogo);

  const fallas=[];
  if(/Ver publicación/.test(r.conCatalogo.carlos.link)) fallas.push('un curso de Udemy ofrece "Ver publicación" en vez de "Ver curso"');
  if(!r.conCatalogo.gui.extras.length&&r.conCatalogo.carlos.extras.length){
    fallas.push('dos filas del mismo beneficio se ven distintas: una muestra el curso y la otra no lo menciona');
  }
  if(/Activo desde/.test(r.sinCatalogo.sub)) fallas.push('con el catálogo sin cargar, Udemy vuelve a decir "Activo desde": '+r.sinCatalogo.sub);
  if(/\/año/.test(r.sinCatalogo.titulo)) fallas.push('con el catálogo sin cargar, el monto vuelve a salir "/año": '+r.sinCatalogo.titulo);

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ Las filas de Udemy se leen igual y dicen lo que corresponde');
  await browser.close();
  process.exit(fallas.length?1:0);
})();
