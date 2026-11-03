// El historial de Ambassador Week: el registro cuyo nombre no coincide con
// nadie no se esconde, queda marcado, y el filtro los junta y los cuenta.
const {lanzar,urlDelHub}=require('./_comun');

const PERSONAS=[
  {id:'t1',fields:{Nombre:'Tina TEM','Rol en empresa':'TEM','Fecha de ingreso':'2019-01-01','Nivel Loyalty':'Storm'}},
  {id:'p1',fields:{Nombre:'Ana Dev','Rol en empresa':'Engineer',Manager:'Tina TEM','Fecha de ingreso':'2021-01-01','Nivel Loyalty':'Ray'}},
  {id:'p2',fields:{Nombre:'Ex Dev','Rol en empresa':'Engineer',Manager:'Tina TEM','Fecha de ingreso':'2020-01-01','Fecha de egreso':'2024-01-01','Nivel Loyalty':'Ray'}},
];
const AW=[
  {id:'aw1',fields:{Persona:'Ana Dev','Edición AW':'AW 2025','Porcentaje cubierto':50}},
  {id:'aw2',fields:{Persona:'Ex Dev','Edición AW':'AW 2024','Porcentaje cubierto':50}},
  // Nombres que no existen en Personas: mal tipeados, o gente que nunca se cargó
  {id:'aw3',fields:{Persona:'Fulano Inexistente','Edición AW':'AW 2023','Porcentaje cubierto':0}},
  {id:'aw4',fields:{Persona:'Mengana Perdida','Edición AW':'AW 2023','Porcentaje cubierto':50}},
];
const TABLAS={
  Personas:PERSONAS,'Ambassador Week':AW,Proyectos:[],Checklist:[],Beneficios:[],
  'Beneficios Asignados':[],'Presupuesto Loyalty':[],Eventos:[],Capacitaciones:[],
  'Off Sites':[],'Get Together':[],'Asistencia a Actividades':[],'Meet our Teams':[],
  Tareas:[],'Eventos Feedback':[],'Historial Loyalty':[],
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
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:TABLAS[tabla]||[]})});
  });
  await page.goto(urlDelHub());

  const r=await page.evaluate(async()=>{
    window.getIdToken=()=>'x'; window.puedeEscribir=()=>true; window.rolUsuarioActual=()=>'full';
    document.getElementById('login-screen').style.display='none';
    await cargarSeccionesIniciales();
    showSection('ambassadors',document.querySelector('.sb-item[onclick*="ambassadors"]'));
    await cargarSeccionLazy('ambassadors');
    await new Promise(r=>setTimeout(r,400));
    const leer=()=>({
      badge:document.getElementById('aw-badge-historial').textContent,
      filas:[...document.querySelectorAll('#aw-tbody-historial tr')]
        .map(tr=>tr.textContent.replace(/\s+/g,' ').trim()),
    });
    const sinFiltro=leer();

    // El filtro: la etiqueta ya dice cuántos hay, sin abrir nada
    const sel=document.getElementById('aw-hist-ficha');
    const etiqueta=[...sel.options].find(o=>o.value==='sin-ficha').textContent;
    sel.value='sin-ficha';
    filtrarAWHistorial();
    await new Promise(r=>setTimeout(r,120));
    const filtrado=leer();

    // Y si se corrigen todos, el filtro no puede quedar activo mostrando nada
    cacheAWRaw=cacheAWRaw.filter(r=>r.fields.Persona==='Ana Dev');
    actualizarFiltroFichaAW();
    const etiquetaSinNada=[...sel.options].find(o=>o.value==='sin-ficha').textContent;
    const quedoActivo=sel.value==='sin-ficha';
    const deshabilitada=[...sel.options].find(o=>o.value==='sin-ficha').disabled;

    return {sinFiltro,etiqueta,filtrado,etiquetaSinNada,quedoActivo,deshabilitada};
  });

  console.log('── Historial de Ambassador Week (sin filtrar) ──');
  console.log('  Badge:',r.sinFiltro.badge);
  r.sinFiltro.filas.forEach(f=>console.log('   •',f));
  console.log('\n── Filtro "sin ficha" ──');
  console.log('  Etiqueta de la opción:',r.etiqueta);
  console.log('  Badge al aplicarlo   :',r.filtrado.badge);
  r.filtrado.filas.forEach(f=>console.log('   •',f));
  console.log('\n── Cuando ya no queda ninguno ──');
  console.log('  Etiqueta:',r.etiquetaSinNada,'· opción deshabilitada:',r.deshabilitada,'· filtro quedó activo:',r.quedoActivo);

  const todas=r.sinFiltro.filas.join(' | ');
  const fallas=[];
  if(!/Ana Dev/.test(todas)) fallas.push('no muestra a quien sigue en BEON');
  if(/Ex Dev/.test(todas)) fallas.push('muestra a quien ya se fue de BEON');
  if(!/Fulano Inexistente/.test(todas)) fallas.push('esconde en silencio un registro cuyo nombre no coincide con nadie');
  if(!/sin ficha/.test(todas)) fallas.push('no avisa que ese nombre no coincide con ninguna persona');
  if(/Fulano Inexistente ?sin ficha Spark/.test(todas)) fallas.push('le inventa nivel Spark a alguien sin ficha');

  const filtradas=r.filtrado.filas.join(' | ');
  if(!/\(2\)/.test(r.etiqueta)) fallas.push('la etiqueta del filtro no dice cuántos hay: '+r.etiqueta);
  if(!/Fulano Inexistente/.test(filtradas)||!/Mengana Perdida/.test(filtradas)) fallas.push('el filtro no deja a los dos sin ficha: '+filtradas);
  if(/Ana Dev/.test(filtradas)) fallas.push('el filtro deja pasar a alguien que sí tiene ficha');
  if(!/2 registros/.test(r.filtrado.badge)) fallas.push('el contador no sigue al filtro: '+r.filtrado.badge);
  if(!r.deshabilitada) fallas.push('sin ninguno sin ficha, la opción sigue clickeable');
  if(r.quedoActivo) fallas.push('el filtro quedó activo cuando ya no hay nada que mostrar');

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ El filtro junta los "sin ficha" y dice cuántos son');
  await browser.close();
  process.exit(fallas.length?1:0);
})();
