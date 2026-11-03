// Una persona cuyo nombre está cargado con acento en Personas y sin acento en
// Ambassador Week (o al revés): ¿se le ve su AW en el Hub?
const {lanzar,urlDelHub}=require('./_comun');

const PERSONAS=[
  {id:'t1',fields:{Nombre:'Tina TEM','Rol en empresa':'TEM','Fecha de ingreso':'2019-01-01','Nivel Loyalty':'Storm'}},
  // En Personas va con acento, como está en Airtable
  {id:'p1',fields:{Nombre:'Jesús Figueroa','Rol en empresa':'Engineer',Proyecto:'Atlas',Manager:'Tina TEM','Fecha de ingreso':'2021-01-01','Nivel Loyalty':'Thunder',Mail:'jesus@beon.tech'}},
  {id:'p2',fields:{Nombre:'Ana Dev','Rol en empresa':'Engineer',Proyecto:'Atlas',Manager:'Tina TEM','Fecha de ingreso':'2021-01-01','Nivel Loyalty':'Ray'}},
];
// En Ambassador Week quedó tipeado sin acento
const AW=[
  {id:'aw1',fields:{Persona:'Jesus Figueroa','Edición AW':'AW Buenos Aires 2025','Porcentaje cubierto':50}},
  {id:'aw2',fields:{Persona:'Ana Dev','Edición AW':'AW Buenos Aires 2025','Porcentaje cubierto':50}},
];
const TABLAS={
  Personas:PERSONAS,'Ambassador Week':AW,Proyectos:[{id:'pr1',fields:{Proyecto:'Atlas',Estado:'Activo'}}],
  Checklist:[],Beneficios:[],'Beneficios Asignados':[],'Presupuesto Loyalty':[],Eventos:[],
  Capacitaciones:[],'Off Sites':[],'Get Together':[],'Asistencia a Actividades':[],
  'Meet our Teams':[],Tareas:[],'Eventos Feedback':[],'Historial Loyalty':[],
};

// Imita a Airtable: FIND() es sensible a mayúsculas y acentos; LOWER/SUBSTITUTE
// se aplican solo si la fórmula los usa.
function filtrarComoAirtable(records,formula,campo){
  const m=formula.match(/FIND\("([^"]*)"/);
  if(!m) return records;
  const buscado=m[1];
  const usaLower=/LOWER\(/.test(formula);
  const subs=/SUBSTITUTE\(/.test(formula);
  const aplicar=s=>{
    let v=String(s||'');
    if(usaLower) v=v.toLowerCase();
    if(subs) v=v.normalize('NFD').replace(/[̀-ͯ]/g,'');
    return v;
  };
  return records.filter(r=>{
    const val=r.fields[campo];
    const txt=Array.isArray(val)?val.join(', '):String(val||'');
    return aplicar(txt).includes(buscado);
  });
}

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
    if(form){
      const campo=(form.match(/\{([^}]+)\}/)||[])[1]||'Persona';
      records=filtrarComoAirtable(records,form,campo);
    }
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records})});
  });
  await page.goto(urlDelHub());

  const r=await page.evaluate(async()=>{
    window.getIdToken=()=>'x'; window.puedeEscribir=()=>true; window.rolUsuarioActual=()=>'full';
    document.getElementById('login-screen').style.display='none';
    await cargarSeccionesIniciales();
    const esperar=ms=>new Promise(r=>setTimeout(r,ms));

    // 1) Su ficha, desde Engineers
    verFichaPersona('p1');
    await esperar(700);
    const seccionAW=[...document.querySelectorAll('#pf-extra details')]
      .find(d=>d.textContent.includes('Ambassador Week'));
    const ficha={
      resumen:seccionAW?seccionAW.querySelector('summary').textContent.replace(/\s+/g,' ').trim():'(no está la sección)',
      detalle:(()=>{ if(seccionAW) seccionAW.open=true; return seccionAW?seccionAW.textContent.replace(/\s+/g,' ').trim():''; })(),
    };
    closeFichaPersona();

    // 2) La sección Ambassador Week
    showSection('ambassadors',document.querySelector('.sb-item[onclick*="ambassadors"]'));
    await cargarSeccionLazy('ambassadors');
    await esperar(400);
    const filaDe=(tbody,nombre)=>[...document.querySelectorAll(`#${tbody} tr`)]
      .map(tr=>tr.textContent.replace(/\s+/g,' ').trim())
      .find(t=>t.includes(nombre))||'(no está)';
    return {
      ficha,
      historial:filaDe('aw-tbody-historial','Figueroa'),
      badgeHistorial:document.getElementById('aw-badge-historial').textContent,
      personas:filaDe('aw-tbody-personas','Figueroa'),
    };
  });

  console.log('── Su ficha (Engineers → ver persona) ──');
  console.log('  Sección AW:',r.ficha.resumen);
  console.log('  Contenido :',r.ficha.detalle.slice(0,120));
  console.log('\n── Sección Ambassador Week ──');
  console.log('  Historial (',r.badgeHistorial,'):',r.historial);
  console.log('  Por persona:',r.personas);

  const fallas=[];
  if(!/\b1\b/.test(r.ficha.resumen)) fallas.push('la ficha no le muestra su AW: '+r.ficha.resumen);
  if(r.historial==='(no está)') fallas.push('su registro desapareció del historial de AW');
  if(/sin ficha/.test(r.historial)) fallas.push('lo marca como huérfano cuando el nombre solo difiere en el acento');
  if(/(^|\s)0(\s|$)/.test(r.personas.replace(/\d+%/g,''))) fallas.push('en "Por persona" le figuran 0 asistencias: '+r.personas);

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ Se le ve su Ambassador Week en todos lados');
  await browser.close();
  process.exit(fallas.length?1:0);
})();
