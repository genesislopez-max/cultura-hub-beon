// Beneficios con fecha de activación ANTERIOR a la fecha de ingreso de la
// persona: no pueden estar corriendo, porque todavía no trabajaba acá.
const {lanzar,urlDelHub}=require('./_comun');

const PERSONAS=[
  // Caso Wilfredo (lista #23): la fecha quedó 4 años antes de su ingreso
  {id:'p1',fields:{Nombre:'Wilfredo Machado','Rol en empresa':'Engineer','Fecha de ingreso':'2026-06-01','Nivel Loyalty':'Spark'}},
  // Caso borde: hardware entregado 3 días antes del primer día
  {id:'p2',fields:{Nombre:'Vispera Hardware','Rol en empresa':'Engineer','Fecha de ingreso':'2025-03-10','Nivel Loyalty':'Ray'}},
];
const BENEFICIOS=[
  {id:'bAI',fields:{Beneficio:'AI Tools',Categoria:'Herramientas',Valor:20,Grupo:'Ambos',Estado:'Activo'}},
  {id:'bHw',fields:{Beneficio:'Hardware Bonus',Categoria:'Equipamiento',Valor:1000,Grupo:'Ambos',Estado:'Activo'}},
];
const ASIGNADOS=[
  {id:'a1',fields:{Persona:'Wilfredo Machado',Beneficio:['bAI'],Monto:20,'Fecha activación':'2022-05-20',Estado:'Activo'}},
  {id:'a2',fields:{Persona:'Wilfredo Machado',Beneficio:['bAI'],Monto:20,'Fecha activación':'2026-06-02',Estado:'Activo'}},
  {id:'a3',fields:{Persona:'Vispera Hardware',Beneficio:['bHw'],Monto:800,'Fecha activación':'2025-03-07',Estado:'Activo'}},
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
    await cargarSeccionLazy('beneficios');
    const esperar=ms=>new Promise(r=>setTimeout(r,ms));
    await esperar(400);
    const limpio=el=>el?el.textContent.replace(/\s+/g,' ').trim():'';
    const card=async(nombre,nivel)=>{
      await verBenefPersona(nombre,'Engineers & Tech',nivel);
      await esperar(450);
      const res={badge:limpio(document.querySelector('.bp-detalle-section-badge')),
        presupuesto:limpio([...document.querySelectorAll('#bpd-stats .bp-detalle-stat')].find(e=>/Presupuesto/.test(e.textContent))),
        grupo:limpio(document.querySelector('#bpd-body .bp-grupo-sum')),
        filas:[...document.querySelectorAll('#bpd-body .bp-detalle-row')].map(limpio)};
      document.getElementById('bp-detalle-overlay').classList.remove('open');
      return res;
    };
    const res={wil:await card('Wilfredo Machado','Spark'),vis:await card('Vispera Hardware','Ray')};
    renderBenefPersonas();
    res.aviso=limpio(document.getElementById('benef-aviso-pre-ingreso'));
    return res;
  });
  const mostrar=(k,v)=>{console.log(`\n── ${k} ──`);console.log('  Encabezado :',v.badge,'·',v.presupuesto);
    if(v.grupo)console.log('  Grupo      :',v.grupo); v.filas.forEach(f=>console.log('   •',f));};
  mostrar('Wilfredo Machado — ingresó el 01/06/2026',r.wil);
  mostrar('Vispera Hardware — ingresó el 10/03/2025, hardware 3 días antes',r.vis);
  console.log('\n── Aviso de la sección Beneficios ──\n  ',r.aviso);
  await browser.close();

  const fallas=[];
  const fila=(v,re)=>v.filas.find(f=>re.test(f))||'';

  // El error de años: no corre, y se ve por qué
  const mala=fila(r.wil,/20 de may de 2022/);
  if(/Activo desde/.test(mala)) fallas.push('un beneficio anterior al ingreso figura "Activo desde": '+mala);
  if(!/anterior a su ingreso \(01 de jun de 2026\)/.test(mala)) fallas.push('no dice contra qué fecha de ingreso se compara: '+mala);
  if(!/Fuera de período/.test(mala)) fallas.push('el badge no marca la fila: '+mala);

  // Lo posterior al ingreso sigue intacto
  const buena=fila(r.wil,/02 de jun de 2026/);
  if(!/Activo desde/.test(buena)||!/Activo$/.test(buena)) fallas.push('se tocó un beneficio válido: '+buena);

  if(!/^1 /.test(r.wil.badge)) fallas.push('cuenta como activo un beneficio anterior al ingreso: '+r.wil.badge);
  if(!/\$240/.test(r.wil.presupuesto)) fallas.push('el presupuesto suma el registro mal fechado: '+r.wil.presupuesto);
  if(!/\$20\/mes/.test(r.wil.grupo)||/\$40/.test(r.wil.grupo)) fallas.push('el monto vigente suma los dos registros: '+r.wil.grupo);
  if(!/1 anterior a su ingreso/.test(r.wil.grupo)) fallas.push('el encabezado no separa el registro mal fechado: '+r.wil.grupo);

  // Caso borde: la víspera del primer día sigue la misma regla
  const vispera=fila(r.vis,/07 de mar de 2025/);
  if(!/Fuera de período/.test(vispera)) fallas.push('la víspera del ingreso no sigue la regla: '+vispera);

  // Y se pueden encontrar sin abrir card por card
  if(!/2 beneficios/.test(r.aviso)) fallas.push('el aviso no cuenta los registros a corregir: '+r.aviso);
  if(!/Wilfredo Machado/.test(r.aviso)) fallas.push('el aviso no dice de quién son: '+r.aviso);

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ Lo anterior al ingreso no corre, se ve por qué, y se puede encontrar para corregirlo');
  process.exit(fallas.length?1:0);
})();
