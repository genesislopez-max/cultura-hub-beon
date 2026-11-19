// Cuántos beneficios tiene una persona se cuenta por beneficio, no por
// asignación: 12 cursos de Udemy son UN beneficio con 12 usos. Contarlos
// sueltos daba "15 asignados / 6 disponibles" —dos unidades distintas— con la
// barra al 250%, y en la card un "15" arriba de una lista de tres filas.
const {lanzar,urlDelHub}=require('./_comun');

const PERSONAS=[{id:'p1',fields:{Nombre:'Raphael Montani','Rol en empresa':'Engineer',
  'Fecha de ingreso':'2022-01-01','Nivel Loyalty':'Storm'}}];
const BENEFICIOS=[
  {id:'bAI',fields:{Beneficio:'AI Tools',Categoria:'Herramientas',Valor:10,Grupo:'Ambos',Estado:'Activo','Nivel Loyalty':'Todos'}},
  {id:'bUd',fields:{Beneficio:'Udemy Courses',Categoria:'Formación',Valor:50,Grupo:'Ambos',Estado:'Activo','Nivel Loyalty':'Todos'}},
  {id:'bOR',fields:{Beneficio:"O'Reilly",Categoria:'Formación',Valor:200,Grupo:'Ambos',Estado:'Activo','Nivel Loyalty':'Todos'}},
  {id:'bCe',fields:{Beneficio:'Certifications',Categoria:'Aprendizaje',Valor:150,Grupo:'Ambos',Estado:'Activo','Nivel Loyalty':'Todos'}},
  {id:'bTe',fields:{Beneficio:'Terapia',Categoria:'Bienestar',Valor:600,Grupo:'Ambos',Estado:'Activo','Nivel Loyalty':'Todos'}},
  {id:'bHw',fields:{Beneficio:'Hardware Bonus',Categoria:'Equipamiento',Valor:1000,Grupo:'Ambos',Estado:'Activo','Nivel Loyalty':'Todos'}},
];
// 3 beneficios distintos, pero 15 asignaciones: 12 cursos de Udemy,
// 2 veces compartidas las credenciales de O'Reilly, 1 AI Tools.
const ASIGNADOS=[
  {id:'ai',fields:{Persona:'Raphael Montani',Beneficio:['bAI'],Monto:10,'Fecha activación':'2023-01-01',Estado:'Activo'}},
  ...Array.from({length:12},(_,i)=>({id:'u'+i,fields:{Persona:'Raphael Montani',Beneficio:['bUd'],
    Monto:40,'Fecha activación':`2024-0${(i%9)+1}-10`,Estado:'Activo',Curso:'Curso '+(i+1)}})),
  {id:'or1',fields:{Persona:'Raphael Montani',Beneficio:['bOR'],Monto:200,'Fecha activación':'2023-05-01',Estado:'Activo'}},
  {id:'or2',fields:{Persona:'Raphael Montani',Beneficio:['bOR'],Monto:200,'Fecha activación':'2025-05-01',Estado:'Activo'}},
];
const TOPES=[{id:'t1',fields:{Grupo:'Engineers',Nivel:'Storm','Tope anual capacitación':2000,'Tope anual beneficios':3000}}];
const TABLAS={Personas:PERSONAS,Beneficios:BENEFICIOS,'Beneficios Asignados':ASIGNADOS,'Presupuesto Loyalty':TOPES,
  Proyectos:[],Checklist:[],Eventos:[],Capacitaciones:[],'Ambassador Week':[],'Off Sites':[],'Get Together':[],
  'Asistencia a Actividades':[],'Meet our Teams':[],Tareas:[],'Eventos Feedback':[],'Historial Loyalty':[]};

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
    if(m){const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
      records=records.filter(r=>norm(r.fields.Persona).includes(m[1]));}
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records})});
  });
  await page.goto(urlDelHub());
  const r=await page.evaluate(async()=>{
    window.getIdToken=()=>'x'; window.puedeEscribir=()=>true; window.rolUsuarioActual=()=>'full';
    document.getElementById('login-screen').style.display='none';
    await cargarSeccionesIniciales(); await cargarSeccionLazy('beneficios');
    await new Promise(r=>setTimeout(r,500));
    await verBenefPersona('Raphael Montani','Engineers','Storm');
    await new Promise(r=>setTimeout(r,500));
    const card={stat:document.querySelector('#bpd-stats .bp-detalle-stat')?.textContent.replace(/\s+/g,' ').trim(),
      badge:document.querySelector('.bp-detalle-section-badge')?.textContent.trim(),
      grupos:document.querySelectorAll('#bpd-body .bp-grupo').length,
      sueltas:document.querySelectorAll('#bpd-body > .bp-detalle-rows > .bp-detalle-row').length,
      tituloStat:document.querySelector('#bpd-stats .bp-detalle-stat')?.getAttribute('title')||''};
    document.getElementById('bp-detalle-overlay').classList.remove('open');
    const tr=document.querySelector('#tbody-benef-personas tr');
    const celda=tr?.children[3];
    return {card,texto:celda?.textContent.replace(/\s+/g,' ').trim()||'(sin fila)',
      barra:celda?.querySelector('.benef-per-bar-fill')?.style.width||'—',
      tituloNumero:celda?.querySelector('span[title]')?.getAttribute('title')||''};
  });
  console.log('Tabla "Por persona", columna "Beneficios activos":');
  console.log('  ',r.texto,'· barra:',r.barra);
  console.log('   title del número:',r.tituloNumero||'(ninguno)');
  console.log('\nCard de la persona:');
  console.log('   stat  :',r.card.stat,'· title:',r.card.tituloStat||'(ninguno)');
  console.log('   badge :',r.card.badge);
  console.log('   la lista muestra',r.card.grupos,'grupos plegados +',r.card.sueltas,'filas sueltas');
  console.log('\nLo cargado: 15 asignaciones de 3 beneficios distintos (1 AI Tools, 12 Udemy, 2 O\'Reilly)');
  await browser.close();

  const fallas=[];
  const filasCard=r.card.grupos+r.card.sueltas;

  // Tabla: la misma unidad a los dos lados de la barra
  if(!/^3 asignados \/ 6 disponibles/.test(r.texto)) fallas.push('la tabla no cuenta por beneficio: '+r.texto);
  if(parseInt(r.barra)>100) fallas.push('la barra se pasa de su propia escala: '+r.barra);
  if(r.barra!=='50%') fallas.push('la barra no refleja 3 de 6: '+r.barra);
  if(!/15 asignaciones/.test(r.tituloNumero)) fallas.push('se perdió el total de asignaciones, que es dato útil: '+r.tituloNumero);

  // Card: el número tiene que coincidir con las filas que muestra abajo
  if(!/^3Beneficios/.test(r.card.stat)) fallas.push('el stat de la card no cuenta por beneficio: '+r.card.stat);
  if(r.card.badge!=='3 activos') fallas.push('el badge no cuenta por beneficio: '+r.card.badge);
  if(filasCard!==3) fallas.push('la lista no muestra tres filas: '+filasCard);
  if(parseInt(r.card.stat)!==filasCard) fallas.push(`el número (${parseInt(r.card.stat)}) no coincide con las filas que muestra (${filasCard})`);
  if(!/15 asignaciones/.test(r.card.tituloStat)) fallas.push('la card no aclara el total de asignaciones: '+r.card.tituloStat);

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ Los beneficios se cuentan por beneficio y el número coincide con lo que se muestra');
  process.exit(fallas.length?1:0);
})();
