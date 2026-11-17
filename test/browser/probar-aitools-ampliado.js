// A alguien le ampliaron el monto de AI Tools: $10/mes desde 2023 y +$10 más
// aprobados en 2026, cargados como dos asignaciones. ¿La card lo lee bien?
const {lanzar,urlDelHub}=require('./_comun');

const PERSONAS=[
  {id:'p1',fields:{Nombre:'Anthony Dugarte','Rol en empresa':'Engineer','Fecha de ingreso':'2022-01-01','Nivel Loyalty':'Thunder'}},
  {id:'p2',fields:{Nombre:'Otra Persona','Rol en empresa':'Engineer','Fecha de ingreso':'2022-01-01','Nivel Loyalty':'Ray'}},
];
const BENEFICIOS=[
  {id:'bAI',fields:{Beneficio:'AI Tools',Categoria:'Herramientas',Valor:10,Grupo:'Ambos'}},
  {id:'bOR',fields:{Beneficio:"O'Reilly",Categoria:'Formación',Valor:300,Grupo:'Ambos'}},
];
const ASIGNADOS=[
  {id:'a1',fields:{Persona:'Anthony Dugarte',Beneficio:['bAI'],Monto:10,'Fecha activación':'2023-04-19',Estado:'Activo'}},
  {id:'a2',fields:{Persona:'Anthony Dugarte',Beneficio:['bAI'],Monto:10,'Fecha activación':'2026-06-10',Estado:'Activo'}},
  // Credenciales recompartidas: dos asignaciones, un solo gasto
  {id:'a3',fields:{Persona:'Otra Persona',Beneficio:['bOR'],Monto:300,'Fecha activación':'2024-01-10',Estado:'Activo'}},
  {id:'a4',fields:{Persona:'Otra Persona',Beneficio:['bOR'],Monto:300,'Fecha activación':'2025-03-02',Estado:'Activo'}},
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
      const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
      records=records.filter(r=>norm(r.fields.Persona).includes(m[1]));
    }
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records})});
  });
  await page.goto(urlDelHub());

  const r=await page.evaluate(async()=>{
    window.getIdToken=()=>'x'; window.puedeEscribir=()=>true; window.rolUsuarioActual=()=>'full';
    document.getElementById('login-screen').style.display='none';
    await cargarSeccionesIniciales();
    const esperar=ms=>new Promise(r=>setTimeout(r,ms));
    const limpio=el=>el?el.textContent.replace(/\s+/g,' ').trim():'';

    const card=async(nombre,nivel)=>{
      await verBenefPersona(nombre,'Engineers & Tech',nivel);
      await esperar(450);
      const res={
        presupuesto:limpio([...document.querySelectorAll('#bpd-stats .bp-detalle-stat')]
          .find(e=>/Presupuesto/.test(e.textContent))).replace('Presupuesto',''),
        grupo:limpio(document.querySelector('#bpd-body details summary')),
        filas:[...document.querySelectorAll('#bpd-body .bp-detalle-row')].map(limpio),
      };
      document.getElementById('bp-detalle-overlay').classList.remove('open');
      return res;
    };

    // La card se abre SIN pasar por la sección Beneficios, que es como la
    // abriría alguien desde Ex BEONers: ahí el beneficio llega como id crudo.
    const sinCatalogoCargado=await card('Anthony Dugarte','Thunder');
    const credenciales=await card('Otra Persona','Ray');
    return {sinCatalogoCargado,credenciales};
  });

  console.log('── Anthony Dugarte: AI Tools ampliado de $10 a $20/mes ──');
  console.log('  Presupuesto:',r.sinCatalogoCargado.presupuesto);
  console.log('  Grupo      :',r.sinCatalogoCargado.grupo);
  r.sinCatalogoCargado.filas.forEach(f=>console.log('   •',f));
  console.log('\n── Otra Persona: credenciales recompartidas ──');
  console.log('  Presupuesto:',r.credenciales.presupuesto);
  console.log('  Grupo      :',r.credenciales.grupo);

  const fallas=[];
  const a=r.sinCatalogoCargado;
  if(!/\$20\/mes/.test(a.grupo)) fallas.push('el encabezado no dice que son $20 POR MES: '+a.grupo);
  if(/en total/.test(a.grupo)) fallas.push('sigue leyéndose como un pago único: '+a.grupo);
  // $10/mes × 12 × 2 asignaciones = $240 al año, igual que en la sección Beneficios
  if(!/\$240/.test(a.presupuesto)) fallas.push('el presupuesto no anualiza el mensual: '+a.presupuesto);
  if(!a.filas.some(f=>/19 de abr de 2023/.test(f))) fallas.push('no se ve la aprobación vieja');
  if(!a.filas.some(f=>/10 de jun de 2026/.test(f))) fallas.push('no se ve la aprobación nueva');

  // Recompartir credenciales no es otro gasto: $300, no $600
  if(!/\$300/.test(r.credenciales.presupuesto)) fallas.push('las credenciales recompartidas se cuentan dos veces: '+r.credenciales.presupuesto);

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ Una ampliación se lee como $X/mes, y el presupuesto da lo mismo que en Beneficios');
  await browser.close();
  process.exit(fallas.length?1:0);
})();
