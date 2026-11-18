// Alguien que se fue de BEON y volvió: los beneficios de su etapa anterior no
// se le cubren más. Tienen que figurar cerrados a la fecha en que se fue, no
// activos hoy, y no pueden sumar al presupuesto de lo que hoy se le cubre.
const {lanzar,urlDelHub}=require('./_comun');

const PERSONAS=[
  // Se fue el 28/02/2025 y volvió el 01/09/2025
  {id:'p1',fields:{Nombre:'Oscar Ortiz','Rol en empresa':'Engineer','Fecha de ingreso':'2022-05-01',
    'Fecha de egreso':'2025-02-28','Fecha de reingreso':'2025-09-01','Nivel Loyalty':'Ray'}},
  // Se fue el 17/09/2026 y volvió el 01/10/2026, ahora con $100 que cubre el Partner
  {id:'p2',fields:{Nombre:'Henry Gomez Lofiero','Rol en empresa':'Engineer','Fecha de ingreso':'2021-03-01',
    'Fecha de egreso':'2026-09-17','Fecha de reingreso':'2026-10-01','Nivel Loyalty':'Lightning'}},
];
const BENEFICIOS=[{id:'bAI',fields:{Beneficio:'AI Tools',Categoria:'Herramientas',Valor:20,Grupo:'Ambos',Estado:'Activo'}}];
const ASIGNADOS=[
  // De la etapa VIEJA — no se le cubre más
  {id:'a1',fields:{Persona:'Oscar Ortiz',Beneficio:['bAI'],Monto:10,'Fecha activación':'2023-10-18',Estado:'Activo'}},
  {id:'a2',fields:{Persona:'Henry Gomez Lofiero',Beneficio:['bAI'],Monto:20,'Fecha activación':'2024-01-15',Estado:'Activo'}},
  // De la etapa NUEVA — esta sí corre
  {id:'a3',fields:{Persona:'Henry Gomez Lofiero',Beneficio:['bAI'],Monto:100,'Fecha activación':'2026-10-05',Estado:'Activo'}},
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
      const res={
        pills:limpio(document.getElementById('bpd-pills')),
        badge:limpio(document.querySelector('.bp-detalle-section-badge')),
        presupuesto:limpio([...document.querySelectorAll('#bpd-stats .bp-detalle-stat')]
          .find(e=>/Presupuesto/.test(e.textContent))),
        filas:[...document.querySelectorAll('#bpd-body .bp-detalle-row')].map(limpio),
        grupo:limpio(document.querySelector('#bpd-body .bp-grupo-sum')),
      };
      document.getElementById('bp-detalle-overlay').classList.remove('open');
      return res;
    };
    return {
      oscar:await card('Oscar Ortiz','Ray'),
      henry:await card('Henry Gomez Lofiero','Lightning'),
      // Lo que el Hub cree sobre su situación
      finOscar:finEnBeonDe('Oscar Ortiz'),
      finHenry:finEnBeonDe('Henry Gomez Lofiero'),
    };
  });

  const mostrar=(k,v)=>{
    console.log(`\n── ${k} ──`);
    console.log('  Chips      :',v.pills);
    console.log('  Encabezado :',v.badge,'·',v.presupuesto);
    if(v.grupo) console.log('  Grupo      :',v.grupo);
    v.filas.forEach(f=>console.log('   •',f));
  };
  mostrar('Oscar Ortiz — se fue el 28/02/2025, volvió el 01/09/2025',r.oscar);
  mostrar('Henry Gomez Lofiero — se fue el 17/09/2026, volvió el 01/10/2026',r.henry);
  await browser.close();

  const fallas=[];
  const fila=(v,re)=>v.filas.find(f=>re.test(f))||'';

  // Oscar: su único AI Tools es de la etapa vieja — no se le cubre nada hoy
  const oscarVieja=fila(r.oscar,/18 de oct de 2023/);
  if(!oscarVieja) fallas.push('no figura el registro viejo de Oscar');
  if(/Activo desde/.test(oscarVieja)) fallas.push('el beneficio de la etapa anterior figura "Activo desde": '+oscarVieja);
  if(!/hasta su salida \(28 de feb de 2025\)/.test(oscarVieja)) fallas.push('no dice que cerró cuando se fue: '+oscarVieja);
  if(!/Cerrado/.test(oscarVieja)) fallas.push('el badge no dice Cerrado: '+oscarVieja);
  if(!/^0 /.test(r.oscar.badge)) fallas.push('cuenta como activos beneficios de la etapa anterior: '+r.oscar.badge);
  if(!/\$0/.test(r.oscar.presupuesto)) fallas.push('le suma presupuesto por un beneficio que ya no tiene: '+r.oscar.presupuesto);
  if(!/Reingres/.test(r.oscar.pills)) fallas.push('la card no dice que volvió: '+r.oscar.pills);

  // Henry: lo viejo cierra, los $100 del Partner siguen corriendo
  const henryVieja=fila(r.henry,/15 de ene de 2024/),henryNueva=fila(r.henry,/05 de oct de 2026/);
  if(!/hasta su salida \(17 de sept de 2026\)/.test(henryVieja)) fallas.push('los $20 viejos de Henry no cierran en su fecha fin: '+henryVieja);
  if(!/Activo desde/.test(henryNueva)||!/\$100/.test(henryNueva)) fallas.push('los $100 del Partner tendrían que seguir activos: '+henryNueva);
  if(!/^1 /.test(r.henry.badge)) fallas.push('cuenta mal los beneficios vigentes de Henry: '+r.henry.badge);
  if(!/\$1\.200/.test(r.henry.presupuesto)) fallas.push('el presupuesto suma las dos etapas: '+r.henry.presupuesto);
  if(!/\$100\/mes/.test(r.henry.grupo)||/\$120/.test(r.henry.grupo)) fallas.push('el encabezado del grupo suma las dos etapas: '+r.henry.grupo);
  if(!/1 vigente/.test(r.henry.grupo)) fallas.push('el encabezado no separa lo vigente de lo cerrado: '+r.henry.grupo);

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ Los beneficios de una etapa anterior figuran cerrados y no suman al presupuesto de hoy');
  process.exit(fallas.length?1:0);
})();
