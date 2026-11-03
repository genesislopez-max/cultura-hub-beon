// El chequeo de nombres huérfanos en Off Sites y Get Together: ¿se marcan las
// filas, y el filtro los junta y los cuenta?
const {lanzar,urlDelHub}=require('./_comun');

const PERSONAS=[
  {id:'t1',fields:{Nombre:'Tina TEM','Rol en empresa':'TEM','Fecha de ingreso':'2019-01-01','Nivel Loyalty':'Storm'}},
  {id:'p1',fields:{Nombre:'Ana Dev','Rol en empresa':'Engineer',Manager:'Tina TEM','Fecha de ingreso':'2021-01-01','Nivel Loyalty':'Ray'}},
  {id:'p2',fields:{Nombre:'Jesús Figueroa','Rol en empresa':'Engineer',Manager:'Tina TEM','Fecha de ingreso':'2021-01-01','Nivel Loyalty':'Ray'}},
  {id:'p3',fields:{Nombre:'Ex Dev','Rol en empresa':'Engineer',Manager:'Tina TEM','Fecha de ingreso':'2020-01-01','Fecha de egreso':'2024-01-01','Nivel Loyalty':'Ray'}},
];
const OS=[
  {id:'o1',fields:{Persona:'Ana Dev',Destino:'Madrid','Fecha inicio':'2025-03-01','Fecha fin':'2025-03-10','Días':10}},
  {id:'o2',fields:{Persona:'Jesus Figueroa',Destino:'Lisboa','Fecha inicio':'2025-04-01','Fecha fin':'2025-04-05','Días':5}}, // sin acento: SÍ tiene ficha
  {id:'o3',fields:{Persona:'Ex Dev',Destino:'Roma','Fecha inicio':'2023-05-01','Fecha fin':'2023-05-04','Días':4}},           // se fue, pero tiene ficha
  {id:'o4',fields:{Persona:'Fulano Inexistente',Destino:'Berlín','Fecha inicio':'2025-06-01','Fecha fin':'2025-06-03','Días':3}},
  {id:'o5',fields:{Persona:'',Destino:'Sin nadie','Fecha inicio':'2025-07-01','Fecha fin':'2025-07-02','Días':2}},            // vínculo nunca cargado
];
const GT=[
  {id:'g1',fields:{BEONer:'Ana Dev',Ciudad:'Córdoba','País':'Argentina',Fecha:'2025-03-15'}},
  {id:'g2',fields:{BEONer:'Mengana Perdida',Ciudad:'Lima','País':'Perú',Fecha:'2025-04-20'}},
  {id:'g3',fields:{BEONer:'Zutano Tampoco',Ciudad:'Bogotá','País':'Colombia',Fecha:'2025-05-20'}},
];
const TABLAS={
  Personas:PERSONAS,'Off Sites':OS,'Get Together':GT,Proyectos:[],Checklist:[],
  Beneficios:[],'Beneficios Asignados':[],'Presupuesto Loyalty':[],Eventos:[],
  Capacitaciones:[],'Ambassador Week':[],'Asistencia a Actividades':[],
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
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:TABLAS[tabla]||[]})});
  });
  await page.goto(urlDelHub());

  const r=await page.evaluate(async()=>{
    window.getIdToken=()=>'x'; window.puedeEscribir=()=>true; window.rolUsuarioActual=()=>'full';
    document.getElementById('login-screen').style.display='none';
    await cargarSeccionesIniciales();
    const esperar=ms=>new Promise(r=>setTimeout(r,ms));

    const inspeccionar=async(seccion,selectId,badgeId,tbodyId,filtrar)=>{
      showSection(seccion,null);
      await cargarSeccionLazy(seccion);
      await esperar(400);
      const leer=()=>({
        badge:document.getElementById(badgeId).textContent,
        filas:[...document.querySelectorAll(`#${tbodyId} tr`)].map(tr=>tr.textContent.replace(/\s+/g,' ').trim()),
      });
      const sel=document.getElementById(selectId);
      const sinFiltro=leer();
      const etiqueta=[...sel.options].find(o=>o.value==='sin-ficha').textContent;
      sel.value='sin-ficha';
      filtrar();
      await esperar(120);
      return {sinFiltro,etiqueta,filtrado:leer()};
    };

    return {
      os:await inspeccionar('offsites','os-hist-ficha','os-badge-historial','os-tbody-historial',filtrarOSHistorial),
      gt:await inspeccionar('gettogether','gt-hist-ficha','gt-badge-hist','gt-tbody-hist',filtrarGTHistorial),
    };
  });

  const mostrar=(k,v)=>{
    console.log(`\n── ${k} ──`);
    console.log('  Sin filtrar (',v.sinFiltro.badge,'):');
    v.sinFiltro.filas.forEach(f=>console.log('   •',f.slice(0,78)));
    console.log('  Etiqueta del filtro:',v.etiqueta);
    console.log('  Filtrado (',v.filtrado.badge,'):');
    v.filtrado.filas.forEach(f=>console.log('   •',f.slice(0,78)));
  };
  mostrar('Off Sites — Historial',r.os);
  mostrar('Get Together — Historial',r.gt);

  // textContent pega el nombre y el chip sin espacio: " ?" en los patrones
  const fallas=[];
  const osTodas=r.os.sinFiltro.filas.join(' | '), osFil=r.os.filtrado.filas.join(' | ');
  if(!/Fulano Inexistente ?sin ficha/.test(osTodas)) fallas.push('Off Sites no marca el nombre que no coincide con nadie');
  if(/Jesus Figueroa ?sin ficha/.test(osTodas)) fallas.push('Off Sites marca como huérfano un nombre que solo difiere en el acento');
  if(/Ex Dev ?sin ficha/.test(osTodas)) fallas.push('Off Sites marca como huérfano a alguien que sí tiene ficha y se fue');
  if(!/\(1\)/.test(r.os.etiqueta)) fallas.push('Off Sites no cuenta bien en la etiqueta: '+r.os.etiqueta);
  if(!/Fulano Inexistente/.test(osFil)||/Ana Dev/.test(osFil)) fallas.push('el filtro de Off Sites no deja solo a los huérfanos: '+osFil);
  if(/Sin nadie/.test(osFil)) fallas.push('el filtro de Off Sites mezcla los que no tienen persona asignada (ya se explican solos)');

  const gtTodas=r.gt.sinFiltro.filas.join(' | '), gtFil=r.gt.filtrado.filas.join(' | ');
  if(!/Mengana Perdida ?sin ficha/.test(gtTodas)) fallas.push('Get Together no marca el nombre huérfano');
  if(!/\(2\)/.test(r.gt.etiqueta)) fallas.push('Get Together no cuenta bien en la etiqueta: '+r.gt.etiqueta);
  if(!/Mengana Perdida/.test(gtFil)||!/Zutano Tampoco/.test(gtFil)||/Ana Dev/.test(gtFil)) fallas.push('el filtro de Get Together no deja solo a los huérfanos: '+gtFil);
  if(!/2 registros/.test(r.gt.filtrado.badge)) fallas.push('el contador de Get Together no sigue al filtro: '+r.gt.filtrado.badge);

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ Off Sites y Get Together marcan y juntan los nombres huérfanos');
  await browser.close();
  process.exit(fallas.length?1:0);
})();
