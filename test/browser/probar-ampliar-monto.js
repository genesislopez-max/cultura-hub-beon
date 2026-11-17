// Asignar un beneficio que la persona YA tiene: ¿el form lo dice y deja
// ampliar el monto en vez de parecer que se duplica?
const {lanzar,urlDelHub}=require('./_comun');

const PERSONAS=[
  {id:'p1',fields:{Nombre:'Anthony Dugarte','Rol en empresa':'Engineer','Fecha de ingreso':'2022-01-01','Nivel Loyalty':'Thunder'}},
  {id:'p2',fields:{Nombre:'Sin Nada','Rol en empresa':'Engineer','Fecha de ingreso':'2022-01-01','Nivel Loyalty':'Ray'}},
];
const BENEFICIOS=[
  {id:'bAI',fields:{Beneficio:'AI Tools',Categoria:'Herramientas',Valor:10,Grupo:'Ambos',Estado:'Activo'}},
  {id:'bUd',fields:{Beneficio:'Udemy Courses',Categoria:'Formación',Valor:50,Grupo:'Ambos',Estado:'Activo'}},
];
const ASIGNADOS=[
  {id:'a1',fields:{Persona:'Anthony Dugarte',Beneficio:['bAI'],Monto:10,'Fecha activación':'2023-04-19',Estado:'Activo'}},
  {id:'a2',fields:{Persona:'Anthony Dugarte',Beneficio:['bUd'],Monto:40,'Fecha activación':'2025-02-01',Estado:'Activo'}},
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
  const creados=[];
  await page.route('**/api/**',route=>{
    const req=route.request();
    const url=decodeURIComponent(req.url());
    if(url.includes('/api/slack')) return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    const tabla=((url.match(/path=([^&]+)/)||[])[1]||'').split('/')[0];
    if(req.method()==='POST'){
      const fields=JSON.parse(req.postData()||'{}').records?.[0]?.fields||{};
      creados.push({tabla,fields});
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:[{id:'nuevo',fields}]})});
    }
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
    const limpio=id=>document.getElementById(id)?.textContent.replace(/\s+/g,' ').trim()||'';

    const elegir=async(persona,beneficio)=>{
      document.getElementById('f-ba-persona').value=persona;
      actualizarBeneficiosPorPersona();
      await cargarAsignacionesPersonaForm();
      document.getElementById('f-ba-beneficio').value=beneficio;
      actualizarMontoBenef(); actualizarAvisoAmpliacion();
      await esperar(80);
      return {
        avisoVisible:document.getElementById('f-ba-ya-tiene').style.display!=='none',
        aviso:limpio('f-ba-ya-tiene'),
        hayCheckbox:!!document.getElementById('f-ba-ampliar'),
        labelMonto:limpio('f-ba-monto-label'),
        hint:limpio('f-ba-ampliar-hint'),
      };
    };

    _openFormModal(FORMS['beneficios-asignados']);
    await esperar(250);

    // 1) Un beneficio que no tiene: nada de esto aparece
    const nuevo=await elegir('Sin Nada','AI Tools');

    // 2) AI Tools, que ya tiene: ofrece ampliar
    const mensual=await elegir('Anthony Dugarte','AI Tools');
    document.getElementById('f-ba-monto').value='10';
    actualizarLabelMontoBenef();
    await esperar(60);
    const conMonto=limpio('f-ba-ampliar-hint');

    // Destildar vuelve a "Monto ($)"
    document.getElementById('f-ba-ampliar').checked=false;
    actualizarLabelMontoBenef();
    const destildado=limpio('f-ba-monto-label');
    document.getElementById('f-ba-ampliar').checked=true;
    actualizarLabelMontoBenef();

    // 3) Udemy, que también tiene: avisa, pero NO ofrece ampliar (cada curso
    //    es una compra distinta, no una ampliación de la anterior)
    const porUnidad=await elegir('Anthony Dugarte','Udemy Courses');

    // Guardar la ampliación de AI Tools
    await elegir('Anthony Dugarte','AI Tools');
    document.getElementById('f-ba-monto').value='10';
    document.getElementById('f-ba-fecha').value='2026-06-10';
    await saveRecord();
    await esperar(400);

    return {nuevo,mensual,conMonto,destildado,porUnidad};
  });

  console.log('── Beneficio que la persona NO tiene ──');
  console.log('  Aviso:',r.nuevo.avisoVisible?'visible (mal)':'oculto','· label:',r.nuevo.labelMonto);
  console.log('\n── AI Tools, que ya tiene ($10/mes desde 2023) ──');
  console.log('  Aviso :',r.mensual.aviso);
  console.log('  Label :',r.mensual.labelMonto);
  console.log('  Hint  :',r.mensual.hint);
  console.log('  Con $10 escrito:',r.conMonto);
  console.log('  Destildando la ampliación, el label vuelve a:',r.destildado);
  console.log('\n── Udemy, que también tiene ──');
  console.log('  Aviso:',r.porUnidad.aviso);
  console.log('  ¿Ofrece ampliar?:',r.porUnidad.hayCheckbox?'sí (mal)':'no');
  console.log('\n── Lo que se guardó ──');
  creados.forEach(c=>console.log('  ',c.tabla,JSON.stringify(c.fields)));

  const fallas=[];
  if(r.nuevo.avisoVisible) fallas.push('avisa "ya tiene" sobre un beneficio que no tiene');
  if(r.nuevo.labelMonto!=='Monto ($)') fallas.push('cambia el label sin que haya nada que ampliar: '+r.nuevo.labelMonto);

  if(!r.mensual.avisoVisible) fallas.push('no avisa que ya tiene AI Tools');
  if(!/\$10\/mes/.test(r.mensual.aviso)||!/19 de abr de 2023/.test(r.mensual.aviso)) fallas.push('el aviso no dice cuánto tiene ni desde cuándo: '+r.mensual.aviso);
  if(!r.mensual.hayCheckbox) fallas.push('no ofrece ampliar un beneficio mensual');
  if(r.mensual.labelMonto!=='Monto adicional ($)') fallas.push('el label no aclara que el monto se SUMA: '+r.mensual.labelMonto);
  if(!/Queda en \$20\/mes/.test(r.conMonto)) fallas.push('no dice en cuánto queda: '+r.conMonto);
  if(r.destildado!=='Monto ($)') fallas.push('destildar la ampliación no devuelve el label: '+r.destildado);

  if(!r.porUnidad.avisoVisible) fallas.push('no avisa que ya tiene Udemy');
  if(r.porUnidad.hayCheckbox) fallas.push('ofrece "ampliar" en un beneficio que se compra por unidad');

  const asignado=creados.filter(c=>c.tabla==='Beneficios Asignados');
  if(asignado.length!==1) fallas.push('no guardó una sola asignación nueva: '+asignado.length);
  if(asignado[0]?.fields?.Monto!==10) fallas.push('no guardó el monto adicional: '+JSON.stringify(asignado[0]?.fields));
  if(asignado[0]?.fields?.['Fecha activación']!=='2026-06-10') fallas.push('no guardó la fecha de la ampliación');

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ El form avisa que ya lo tiene y deja ampliarlo, diciendo en cuánto queda');
  await browser.close();
  process.exit(fallas.length?1:0);
})();
