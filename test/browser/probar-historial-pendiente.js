// Si el cambio de nivel no se puede registrar en "Historial Loyalty":
// ¿queda a la vista qué cargar a mano, y se puede reintentar?
const {lanzar,urlDelHub}=require('./_comun');

const PERSONAS=[
  {id:'p1',fields:{Nombre:'Ana Dev','Rol en empresa':'Engineer','Fecha de ingreso':'2021-01-01','Nivel Loyalty':'Spark'}},
];
const TABLAS={
  Personas:PERSONAS,'Historial Loyalty':[],Proyectos:[],Checklist:[],Beneficios:[],
  'Beneficios Asignados':[],'Presupuesto Loyalty':[],Eventos:[],Capacitaciones:[],
  'Ambassador Week':[],'Off Sites':[],'Get Together':[],'Asistencia a Actividades':[],
  'Meet our Teams':[],Tareas:[],'Eventos Feedback':[],
};

(async()=>{
  const browser=await lanzar();
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  let fallarHistorial=true;
  const posts=[];
  await page.exposeFunction('_dejarDeFallar',()=>{fallarHistorial=false;});
  await page.exposeFunction('_posts',()=>posts.slice());
  await page.route('**/api/**',route=>{
    const req=route.request();
    const url=decodeURIComponent(req.url());
    if(url.includes('/api/slack')) return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    const tabla=((url.match(/path=([^&]+)/)||[])[1]||'').split('/')[0];
    if(req.method()==='POST'){
      posts.push(tabla);
      if(tabla==='Historial Loyalty'&&fallarHistorial){
        return route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({error:{message:'Unknown field name'}})});
      }
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:[{id:'recNUEVO',fields:{}}]})});
    }
    if(req.method()==='PATCH') return route.fulfill({status:200,contentType:'application/json',body:'{"id":"p1","fields":{}}'});
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:TABLAS[tabla]||[]})});
  });
  await page.goto(urlDelHub());

  const r=await page.evaluate(async()=>{
    window.getIdToken=()=>'x'; window.puedeEscribir=()=>true; window.rolUsuarioActual=()=>'full';
    document.getElementById('login-screen').style.display='none';
    await cargarSeccionesIniciales();
    showSection('engineers',document.querySelector('.sb-item[onclick*="engineers"]'));
    const esperar=ms=>new Promise(r=>setTimeout(r,ms));
    await esperar(200);

    // Subirle el nivel a Ana, con el registro del historial fallando
    await cambiarNivel('p1','Ray','Spark',{stopPropagation(){}});
    await esperar(400);
    const banner=document.getElementById('historial-pendiente-banner');
    const conFallo={
      hayBanner:!!banner,
      texto:banner?banner.textContent.replace(/\s+/g,' ').trim():'',
      postsHastaAca:(await window._posts()).filter(t=>t==='Historial Loyalty').length,
      cardInicio:document.getElementById('sc-loyalty').textContent.trim(),
    };

    // Ahora que la tabla responde bien, reintentar desde el banner
    await window._dejarDeFallar();
    await reintentarHistorialPendiente();
    await esperar(300);
    return {conFallo,trasReintento:{
      sigueElBanner:!!document.getElementById('historial-pendiente-banner'),
      cardInicio:document.getElementById('sc-loyalty').textContent.trim(),
      listaInicio:document.getElementById('sc-list-loyalty').textContent.replace(/\s+/g,' ').trim(),
    }};
  });

  console.log('── Con el registro fallando ──');
  console.log('  ¿Hay banner?:',r.conFallo.hayBanner);
  console.log('  Dice:',r.conFallo.texto.slice(0,200));
  console.log('  Intentos de registro:',r.conFallo.postsHastaAca);
  console.log('  Card de Inicio:',r.conFallo.cardInicio);
  console.log('\n── Tras reintentar, ya con la tabla OK ──');
  console.log('  ¿Sigue el banner?:',r.trasReintento.sigueElBanner);
  console.log('  Card de Inicio:',r.trasReintento.cardInicio,'·',r.trasReintento.listaInicio);

  const fallas=[];
  if(!r.conFallo.hayBanner) fallas.push('no avisa que el cambio quedó sin registrar');
  if(!/no quedó registrado/.test(r.conFallo.texto)) fallas.push('el banner no dice qué pasó');
  if(!/Ana Dev · Spark → Ray/.test(r.conFallo.texto)) fallas.push('el banner no dice qué cargar a mano: '+r.conFallo.texto);
  if(!/Reintentar/.test(r.conFallo.texto)) fallas.push('el banner no ofrece reintentar');
  if(r.conFallo.postsHastaAca!==2) fallas.push(`tendría que haber reintentado una vez (intentos: ${r.conFallo.postsHastaAca})`);
  if(r.trasReintento.sigueElBanner) fallas.push('el banner no se va cuando el reintento funciona');
  if(r.trasReintento.cardInicio!=='1') fallas.push('la card de Inicio no refleja el cambio recién registrado: '+r.trasReintento.cardInicio);
  if(!/Spark → Ray/.test(r.trasReintento.listaInicio)) fallas.push('la card no muestra el cambio: '+r.trasReintento.listaInicio);

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ Un cambio que no se pudo registrar queda a la vista y se puede reintentar');
  await browser.close();
  process.exit(fallas.length?1:0);
})();
