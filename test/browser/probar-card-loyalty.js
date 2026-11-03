// La card "Cambios de nivel" de Inicio y su detalle con selector de mes.
const {lanzar,urlDelHub}=require('./_comun');

const hoy=new Date();
const mesActual=`${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
const anterior=new Date(hoy.getFullYear(),hoy.getMonth()-1,15);
const mesAnterior=`${anterior.getFullYear()}-${String(anterior.getMonth()+1).padStart(2,'0')}`;

const PERSONAS=[
  {id:'p1',fields:{Nombre:'Jesús Figueroa','Rol en empresa':'Engineer','Fecha de ingreso':'2021-01-01','Nivel Loyalty':'Thunder'}},
  {id:'p2',fields:{Nombre:'Ana Dev','Rol en empresa':'Engineer','Fecha de ingreso':'2021-01-01','Nivel Loyalty':'Ray'}},
];
const HISTORIAL=[
  {id:'h1',fields:{Persona:'Ana Dev','Nivel anterior':'Spark','Nivel nuevo':'Ray',Fecha:`${mesActual}-05`}},
  // Sin acento, como se tipea en otras tablas: tiene que reconocerse igual
  {id:'h2',fields:{Persona:'Jesus Figueroa','Nivel anterior':'Lightning ','Nivel nuevo':'thunder',Fecha:`${mesActual}-12`}},
  {id:'h3',fields:{Persona:'Fulano Inexistente','Nivel anterior':'Spark','Nivel nuevo':'Ray',Fecha:`${mesAnterior}-20`}},
];
const TABLAS={
  Personas:PERSONAS,'Historial Loyalty':HISTORIAL,Proyectos:[],Checklist:[],
  Beneficios:[],'Beneficios Asignados':[],'Presupuesto Loyalty':[],Eventos:[],
  Capacitaciones:[],'Ambassador Week':[],'Off Sites':[],'Get Together':[],
  'Asistencia a Actividades':[],'Meet our Teams':[],Tareas:[],'Eventos Feedback':[],
};

function montar(page,{fallaHistorial=false}={}){
  return page.route('**/api/**',route=>{
    const req=route.request();
    const url=decodeURIComponent(req.url());
    if(url.includes('/api/slack')) return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    const tabla=((url.match(/path=([^&]+)/)||[])[1]||'').split('/')[0];
    if(req.method()!=='GET') return route.fulfill({status:200,contentType:'application/json',body:'{"records":[]}'});
    if(tabla==='Historial Loyalty'&&fallaHistorial){
      return route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({error:{message:'Table not found'}})});
    }
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:TABLAS[tabla]||[]})});
  });
}

async function abrirHub(page){
  await page.goto(urlDelHub());
  return page.evaluate(async()=>{
    window.getIdToken=()=>'x'; window.puedeEscribir=()=>true; window.rolUsuarioActual=()=>'full';
    document.getElementById('login-screen').style.display='none';
    await cargarSeccionesIniciales();
    await new Promise(r=>setTimeout(r,250));
  });
}

(async()=>{
  const browser=await lanzar();

  // ── Caso normal ──
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  await montar(page);
  await abrirHub(page);
  const r=await page.evaluate(async()=>{
    const txt=id=>document.getElementById(id)?.textContent.replace(/\s+/g,' ').trim()||'';
    const card={
      valor:txt('sc-loyalty'),
      sub:txt('sc-loyalty-sub'),
      lista:[...document.querySelectorAll('#sc-list-loyalty .sc-list-item')].map(e=>e.textContent.replace(/\s+/g,' ').trim()),
      boton:txt('sc-more-loyalty'),
      botonVisible:document.getElementById('sc-more-loyalty').style.display!=='none',
    };
    abrirHistorialLoyalty();
    await new Promise(r=>setTimeout(r,150));
    const sel=document.getElementById('loyalty-mes');
    const detalleActual={
      abierto:document.getElementById('loyalty-overlay').classList.contains('open'),
      meses:[...sel.options].map(o=>o.textContent),
      mesElegido:[...sel.options].find(o=>o.selected)?.textContent,
      badge:txt('loyalty-badge'),
      filas:[...document.querySelectorAll('#loyalty-lista .bp-detalle-row')].map(e=>e.textContent.replace(/\s+/g,' ').trim()),
    };
    // Cambiar de mes
    sel.value=sel.options[sel.options.length-1].value;
    renderHistorialLoyalty();
    await new Promise(r=>setTimeout(r,120));
    const detalleViejo={
      badge:txt('loyalty-badge'),
      filas:[...document.querySelectorAll('#loyalty-lista .bp-detalle-row')].map(e=>e.textContent.replace(/\s+/g,' ').trim()),
    };
    cerrarHistorialLoyalty();
    return {card,detalleActual,detalleViejo};
  });
  await page.close();

  // ── Si no se puede leer la tabla ──
  const page2=await browser.newPage({viewport:{width:1500,height:1000}});
  await montar(page2,{fallaHistorial:true});
  await abrirHub(page2);
  const err=await page2.evaluate(()=>({
    valor:document.getElementById('sc-loyalty').textContent.trim(),
    sub:document.getElementById('sc-loyalty-sub').textContent.trim(),
    lista:document.getElementById('sc-list-loyalty').textContent.replace(/\s+/g,' ').trim(),
  }));
  await page2.close();

  console.log('── Card en Inicio ──');
  console.log('  Valor:',r.card.valor,'·',r.card.sub,'· botón:',r.card.boton,r.card.botonVisible?'(visible)':'(OCULTO)');
  r.card.lista.forEach(l=>console.log('   •',l));
  console.log('\n── Detalle, mes en curso ──');
  console.log('  Meses ofrecidos:',r.detalleActual.meses.join(' / '),'· elegido:',r.detalleActual.mesElegido);
  console.log('  ',r.detalleActual.badge);
  r.detalleActual.filas.forEach(f=>console.log('   •',f));
  console.log('\n── Detalle, mes anterior ──');
  console.log('  ',r.detalleViejo.badge);
  r.detalleViejo.filas.forEach(f=>console.log('   •',f));
  console.log('\n── Si no se puede leer "Historial Loyalty" ──');
  console.log('  Valor:',err.valor,'·',err.sub);
  console.log('  ',err.lista);

  const fallas=[];
  if(r.card.valor!=='2') fallas.push('la card no cuenta los cambios del mes: '+r.card.valor);
  if(!r.card.lista.join(' | ').includes('Spark → Ray')) fallas.push('la card no muestra de qué nivel a cuál');
  // El nivel llega con espacios y en minúscula desde Airtable: se normaliza
  if(!r.card.lista.join(' | ').includes('Lightning → Thunder')) fallas.push('no normaliza los niveles: '+r.card.lista.join(' | '));
  if(/sin ficha/.test(r.card.lista.join(' | '))) fallas.push('marca como huérfano un nombre que solo difiere en el acento');
  if(!r.card.botonVisible) fallas.push('no se puede abrir el detalle');
  if(!r.detalleActual.abierto) fallas.push('el detalle no se abre');
  if(r.detalleActual.meses.length!==2) fallas.push('el selector no ofrece los meses con cambios: '+r.detalleActual.meses.join(' / '));
  if(!/2 cambios/.test(r.detalleActual.badge)) fallas.push('el contador del detalle no sigue al mes: '+r.detalleActual.badge);
  if(!/1 cambio\b/.test(r.detalleViejo.badge)) fallas.push('cambiar de mes no cambia la lista: '+r.detalleViejo.badge);
  if(!/Fulano Inexistente/.test(r.detalleViejo.filas.join(' | '))) fallas.push('el mes anterior no muestra su cambio');
  if(!/sin ficha/.test(r.detalleViejo.filas.join(' | '))) fallas.push('no marca el nombre que no coincide con nadie');
  if(err.valor!=='—'||!/no se pudo leer/i.test(err.sub)) fallas.push('un fallo al leer la tabla se ve igual que "sin cambios": '+err.valor+' / '+err.sub);

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ Los cambios de nivel se ven en el Hub, sin depender de Slack');
  await browser.close();
  process.exit(fallas.length?1:0);
})();
