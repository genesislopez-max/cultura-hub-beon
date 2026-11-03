// Renombrar un proyecto desde el Hub: ¿su gente se queda con el nombre viejo?
const {lanzar,urlDelHub}=require('./_comun');

const PERSONAS=[
  {id:'t1',fields:{Nombre:'Tina TEM','Rol en empresa':'TEM','Fecha de ingreso':'2019-01-01'}},
  {id:'p1',fields:{Nombre:'Ana Dev','Rol en empresa':'Engineer',Proyecto:'Atlas',Manager:'Tina TEM','Fecha de ingreso':'2021-01-01','Nivel Loyalty':'Ray'}},
  {id:'p2',fields:{Nombre:'Beto Dev','Rol en empresa':'Engineer',Proyecto:'Atlas',Manager:'Tina TEM','Fecha de ingreso':'2021-01-01','Nivel Loyalty':'Ray'}},
  // Ya no está, pero su ficha histórica tiene que seguir apuntando al proyecto
  {id:'p3',fields:{Nombre:'Ex Dev','Rol en empresa':'Engineer',Proyecto:'Atlas',Manager:'Tina TEM','Fecha de ingreso':'2020-01-01','Fecha de egreso':'2024-01-01','Nivel Loyalty':'Ray'}},
  {id:'p4',fields:{Nombre:'Dani Dev','Rol en empresa':'Engineer',Proyecto:'Evvnt',Manager:'Tina TEM','Fecha de ingreso':'2021-01-01','Nivel Loyalty':'Ray'}},
];
const CHECKLIST=[
  {id:'c1',fields:{Persona:'Ana Dev',Tipo:'Ingreso',Proyecto:'Atlas',Fecha:'2026-10-01',EstadoKanban:'Pre-ingreso'}},
];
const PROYECTOS=[
  {id:'pr1',fields:{Proyecto:'Atlas',Estado:'Activo','Fecha de Inicio':'2021-01-01'}},
  {id:'pr2',fields:{Proyecto:'Evvnt',Estado:'Activo'}},
];
const TABLAS={
  Personas:PERSONAS,Proyectos:PROYECTOS,Checklist:CHECKLIST,Beneficios:[],'Beneficios Asignados':[],
  'Presupuesto Loyalty':[],Eventos:[],Capacitaciones:[],'Ambassador Week':[],'Off Sites':[],
  'Get Together':[],'Meet our Teams':[],'Asistencia a Actividades':[],Tareas:[],
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
      const fields=JSON.parse(req.postData()||'{}').fields||{};
      patches.push({tabla,recId,fields});
      // Reflejar el cambio, como haría Airtable, para poder mirar el estado después
      const rec=(TABLAS[tabla]||[]).find(r=>r.id===recId);
      if(rec) Object.assign(rec.fields,fields);
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:recId,fields:{}})});
    }
    if(req.method()==='POST') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:[{id:'x',fields:{}}]})});
    let records=TABLAS[tabla]||[];
    const form=(url.match(/filterByFormula=([^&]*)/)||[])[1]||'';
    if(tabla==='Checklist'&&/\{Proyecto\}="([^"]+)"/.test(form)){
      const b=form.match(/\{Proyecto\}="([^"]+)"/)[1];
      records=CHECKLIST.filter(r=>r.fields.Proyecto===b);
    }
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records})});
  });
  await page.goto(urlDelHub());

  const r=await page.evaluate(async()=>{
    window.getIdToken=()=>'x'; window.puedeEscribir=()=>true; window.rolUsuarioActual=()=>'full';
    document.getElementById('login-screen').style.display='none';
    await cargarSeccionesIniciales();
    const esperar=ms=>new Promise(r=>setTimeout(r,ms));
    showSection('proyectos',document.querySelector('.sb-item[onclick*="proyectos"]'));
    await esperar(150);

    const devsEnLaTabla=nombre=>{
      const fila=[...document.querySelectorAll('#tbody-proyectos tr')]
        .find(tr=>tr.querySelector('td')?.textContent.trim()===nombre);
      return fila?fila.querySelectorAll('td')[3].textContent.trim():'(no está la fila)';
    };
    const antes={devs:devsEnLaTabla('Atlas'),tem:(openMeetModal('pr1','Atlas'),document.getElementById('meet-tem-label').textContent)};
    closeMeetModal();

    editarProyecto('pr1');
    await esperar(200);
    document.getElementById('f-ep-nombre').value='Atlas Reloaded';
    // Tolerante al código viejo, donde nada de esto existía, para poder correr
    // el mismo escenario contra antes y después del fix.
    if(typeof actualizarAvisoRenombreProyecto==='function') actualizarAvisoRenombreProyecto();
    const aviso=document.getElementById('f-ep-nombre-aviso')?.textContent||'';
    await saveRecord();   // el botón Guardar de verdad: guarda Y recarga la vista
    await esperar(800);

    openMeetModal('pr1','Atlas Reloaded');
    await esperar(100);
    const tem=document.getElementById('meet-tem-label').textContent;
    const devsLabel=document.getElementById('meet-devs-label').textContent;
    closeMeetModal();
    return {antes,aviso,despues:{devs:devsEnLaTabla('Atlas Reloaded'),tem,devsLabel}};
  });

  const proy=id=>patches.filter(p=>p.tabla==='Personas'&&p.recId===id).map(p=>p.fields.Proyecto).pop();

  console.log('── Antes de renombrar ──');
  console.log('  Devs en la tabla:',r.antes.devs,'·',r.antes.tem);
  console.log('\n── Aviso en el form ──\n ',r.aviso||'(ninguno)');
  console.log('\n── Después de renombrar a "Atlas Reloaded" ──');
  console.log('  Devs en la tabla:',r.despues.devs,'·',r.despues.tem,'·',r.despues.devsLabel);
  console.log('\n── Lo que se guardó ──');
  ['p1','p2','p3','p4'].forEach(id=>{
    const nom=PERSONAS.find(p=>p.id===id).fields.Nombre;
    console.log(`  ${nom.padEnd(9)}→ Proyecto:`,proy(id)||'(sin cambios)');
  });
  console.log('  Tarjeta de Ingreso →',patches.filter(p=>p.tabla==='Checklist').map(p=>p.fields.Proyecto).join(', ')||'(sin cambios)');

  const fallas=[];
  if(!/3 personas/.test(r.aviso)) fallas.push('el aviso no dice a cuántas personas les cambia: '+r.aviso);
  if(r.despues.tem!==r.antes.tem) fallas.push(`el proyecto se quedó sin TEM: "${r.antes.tem}" → "${r.despues.tem}"`);
  if(r.despues.devs!==r.antes.devs) fallas.push(`el proyecto se quedó sin devs: ${r.antes.devs} → ${r.despues.devs}`);
  if(proy('p1')!=='Atlas Reloaded'||proy('p2')!=='Atlas Reloaded') fallas.push('no actualizó a la gente activa del proyecto');
  if(proy('p3')!=='Atlas Reloaded') fallas.push('dejó al ex-BEONer apuntando a un proyecto que ya no existe');
  if(proy('p4')) fallas.push('tocó a alguien de otro proyecto');
  if(!patches.some(p=>p.tabla==='Checklist'&&p.fields.Proyecto==='Atlas Reloaded')) fallas.push('la tarjeta del Kanban quedó con el nombre viejo');

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ Renombrar un proyecto se lleva con él a su gente');
  await browser.close();
  process.exit(fallas.length?1:0);
})();
