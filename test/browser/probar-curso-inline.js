// Completar el nombre del curso de Udemy desde la propia fila, sin abrir el
// modal de edición.
const {lanzar,urlDelHub}=require('./_comun');

const PERSONAS=[
  {id:'p1',fields:{Nombre:'Guilherme Gervasio','Rol en empresa':'Engineer','Fecha de ingreso':'2021-01-01','Nivel Loyalty':'Ray'}},
];
const BENEFICIOS=[{id:'bUdemy',fields:{Beneficio:'Udemy Courses',Categoria:'Formación',Valor:50}}];
const ASIGNADOS=[
  {id:'a1',fields:{Persona:'Guilherme Gervasio',Beneficio:['bUdemy'],Monto:35,'Fecha activación':'2026-04-02',Estado:'Activo',Link:'https://udemy.com/curso-react'}},
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
  const patches=[];
  let fallarPatch=false;
  await page.exposeFunction('_fallarPatch',v=>{fallarPatch=v;});
  await page.exposeFunction('_patches',()=>patches.slice());
  await page.route('**/api/**',route=>{
    const req=route.request();
    const url=decodeURIComponent(req.url());
    if(url.includes('/api/slack')) return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    const path=(url.match(/path=([^&]+)/)||[])[1]||'';
    const [tabla,recId]=path.split('/');
    if(req.method()==='PATCH'){
      const fields=JSON.parse(req.postData()||'{}').fields||{};
      if(fallarPatch) return route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({error:{message:'Unknown field name'}})});
      patches.push({tabla,recId,fields});
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:recId,fields})});
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
    const esperar=ms=>new Promise(r=>setTimeout(r,ms));
    const linea=()=>document.getElementById('curso-linea-a1');
    const txt=()=>linea()?.textContent.replace(/\s+/g,' ').trim()||'';

    await verBenefPersona('Guilherme Gervasio','Engineers & Tech','Ray');
    await esperar(400);
    const inicial={texto:txt(),hayBoton:!!linea()?.querySelector('.benef-curso-cargar')};

    // Un click y se escribe ahí mismo
    linea().querySelector('.benef-curso-cargar').click();
    await esperar(80);
    const editando={hayInput:!!document.getElementById('curso-input-a1'),
      enfocado:document.activeElement?.id==='curso-input-a1'};

    // Cancelar deja todo como estaba
    cancelarCursoInline('a1');
    await esperar(60);
    const trasCancelar=txt();

    // Guardar vacío no hace nada
    linea().querySelector('.benef-curso-cargar').click();
    await esperar(60);
    document.getElementById('curso-input-a1').value='   ';
    await guardarCursoInline('a1');
    await esperar(200);
    const patchesTrasVacio=(await window._patches()).length;

    // Si Airtable rechaza, lo escrito no se pierde
    await window._fallarPatch(true);
    document.getElementById('curso-input-a1').value='React desde cero';
    await guardarCursoInline('a1');
    await esperar(300);
    const trasFallar={sigueElInput:!!document.getElementById('curso-input-a1'),
      valor:document.getElementById('curso-input-a1')?.value};

    // Y con la tabla OK, se guarda y la fila queda con el nombre
    await window._fallarPatch(false);
    await guardarCursoInline('a1');
    await esperar(300);
    const final={texto:txt(),hayBoton:!!linea()?.querySelector('.benef-curso-cargar'),
      enMemoria:spBenefAsigActual.find(x=>x.id==='a1')?.fields?.Curso};

    // Sin permiso de escritura, la línea no invita a nada
    window.puedeEscribir=()=>false;
    pintarCursoLinea('a1','');
    const soloLectura={texto:txt(),hayBoton:!!linea()?.querySelector('.benef-curso-cargar')};

    return {inicial,editando,trasCancelar,patchesTrasVacio,trasFallar,final,soloLectura};
  });

  console.log('── La fila sin curso cargado ──');
  console.log('  Dice:',r.inicial.texto,'· es clickeable:',r.inicial.hayBoton);
  console.log('── Al clickear ──');
  console.log('  Input:',r.editando.hayInput,'· con el foco puesto:',r.editando.enfocado);
  console.log('  Al cancelar vuelve a:',r.trasCancelar);
  console.log('── Guardar vacío ──');
  console.log('  PATCHes mandados:',r.patchesTrasVacio);
  console.log('── Si Airtable lo rechaza ──');
  console.log('  Sigue el input:',r.trasFallar.sigueElInput,'· con lo escrito:',JSON.stringify(r.trasFallar.valor));
  console.log('── Al guardar bien ──');
  console.log('  La fila dice:',r.final.texto,'· en memoria:',JSON.stringify(r.final.enMemoria));
  console.log('── Con rol de solo lectura ──');
  console.log('  Dice:',r.soloLectura.texto,'· es clickeable:',r.soloLectura.hayBoton);

  const guardados=patches.filter(p=>p.tabla==='Beneficios Asignados');
  const fallas=[];
  if(!r.inicial.hayBoton||!/cargalo/.test(r.inicial.texto)) fallas.push('la fila sin curso no invita a cargarlo: '+r.inicial.texto);
  if(!r.editando.hayInput) fallas.push('un click no abre el campo para escribir');
  if(!r.editando.enfocado) fallas.push('hay que clickear de nuevo para escribir');
  if(!/Curso sin cargar/.test(r.trasCancelar)) fallas.push('cancelar no deja la fila como estaba: '+r.trasCancelar);
  if(r.patchesTrasVacio!==0) fallas.push('guarda un curso vacío');
  if(!r.trasFallar.sigueElInput||r.trasFallar.valor!=='React desde cero') fallas.push('si falla el guardado se pierde lo escrito');
  if(!/React desde cero/.test(r.final.texto)||r.final.hayBoton) fallas.push('la fila no quedó con el nombre del curso: '+r.final.texto);
  if(r.final.enMemoria!=='React desde cero') fallas.push('el registro en memoria quedó desactualizado');
  if(guardados.length!==1||guardados[0].fields.Curso!=='React desde cero') fallas.push('lo que se mandó a Airtable no es el curso: '+JSON.stringify(guardados));
  if(r.soloLectura.hayBoton) fallas.push('con rol de solo lectura igual ofrece cargarlo');
  if(!/Curso sin cargar/.test(r.soloLectura.texto)) fallas.push('con rol de solo lectura deja de avisar que falta el dato');

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ El curso se completa desde la fila, con un click');
  await browser.close();
  process.exit(fallas.length?1:0);
})();
