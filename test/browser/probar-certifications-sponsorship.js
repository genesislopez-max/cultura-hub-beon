// Una Certifications cargada como beneficio tiene que aparecer en el área
// "Certifications Sponsorship" de la persona, no solo arriba en la lista.
const {lanzar,urlDelHub}=require('./_comun');

const PERSONAS=[
  {id:'p1',fields:{Nombre:'Raphael Montani','Rol en empresa':'Engineer','Fecha de ingreso':'2022-01-01','Nivel Loyalty':'Storm'}},
];
const BENEFICIOS=[
  {id:'bAI',fields:{Beneficio:'AI Tools',Categoria:'Herramientas',Valor:10,Grupo:'Ambos',Estado:'Activo'}},
  {id:'bCe',fields:{Beneficio:'Certifications',Categoria:'Aprendizaje',Valor:150,Grupo:'Ambos',Estado:'Activo'}},
  {id:'bUd',fields:{Beneficio:'Udemy Courses',Categoria:'Formación',Valor:50,Grupo:'Ambos',Estado:'Activo'}},
];
const ASIGNADOS=[
  {id:'a1',fields:{Persona:'Raphael Montani',Beneficio:['bAI'],Monto:10,'Fecha activación':'2023-12-29',Estado:'Activo'}},
  {id:'a2',fields:{Persona:'Raphael Montani',Beneficio:['bCe'],Monto:150,'Fecha activación':'2023-06-02',
    Estado:'Activo',Comentarios:'Certificación AWS'}},
  {id:'a3',fields:{Persona:'Raphael Montani',Beneficio:['bUd'],Monto:0,'Fecha activación':'2025-01-01',
    Estado:'Activo',Curso:'Kubernetes Certified Application Developer (CKAD) with Tests',Link:'https://udemy.com/ckad'}},
];
const CAPACITACIONES=[{id:'c1',fields:{Persona:'Raphael Montani',Descripción:'CKA',Fecha:'2024-03-01',Monto:300,'URL del curso':'https://cncf.io/cka'}}];
const TOPES=[{id:'t1',fields:{Grupo:'Engineers',Nivel:'Storm','Tope anual capacitación':2000,'Tope anual beneficios':3000}}];
const TABLAS={
  Personas:PERSONAS,Beneficios:BENEFICIOS,'Beneficios Asignados':ASIGNADOS,'Presupuesto Loyalty':TOPES,
  Proyectos:[],Checklist:[],Eventos:[],Capacitaciones:CAPACITACIONES,
  'Ambassador Week':[],'Off Sites':[],'Get Together':[],'Asistencia a Actividades':[],
  'Meet our Teams':[],Tareas:[],'Eventos Feedback':[],'Historial Loyalty':[],
};

(async()=>{
  const browser=await lanzar();
  const page=await browser.newPage({viewport:{width:1500,height:1100}});
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
    await new Promise(r=>setTimeout(r,400));
    await verBenefPersona('Raphael Montani','Engineers','Storm');
    await new Promise(r=>setTimeout(r,500));
    const limpio=el=>el?el.textContent.replace(/\s+/g,' ').trim():'';
    // La sección arranca en el head "Certifications Sponsorship" y termina en el siguiente head
    const nodos=[...document.getElementById('bpd-body').children];
    // El encabezado de sección, no cualquier nodo que mencione el texto: la
    // fila del beneficio ahora también dice "cuenta en Certifications Sponsorship".
    const i=nodos.findIndex(n=>n.classList.contains('bp-detalle-section-head')
      &&/Certifications Sponsorship/.test(n.textContent||''));
    const j=nodos.findIndex((n,k)=>k>i&&n.classList.contains('bp-detalle-section-head'));
    const filaCert=nodos.slice(i).flatMap(n=>[...n.querySelectorAll('.bp-detalle-row')])
      .find(e=>/Certificación AWS/.test(e.textContent));
    const botonesCert=filaCert?[...filaCert.querySelectorAll('.bp-detalle-action-btn')]:[];

    // Que el botón esté no alcanza: tiene que abrir el registro correcto. El
    // lápiz abre el modal de edición con el monto y la fecha de ESA
    // certificación; el tacho, el cartel nombrándola.
    let editaMonto='',editaFecha='',cartel='';
    if(botonesCert[0]){
      botonesCert[0].click();
      await new Promise(r=>setTimeout(r,250));
      editaMonto=document.getElementById('f-eba-monto')?.value||'';
      editaFecha=document.getElementById('f-eba-fecha')?.value||'';
      closeModal();
      await new Promise(r=>setTimeout(r,150));
    }
    if(botonesCert[1]){
      botonesCert[1].click();
      await new Promise(r=>setTimeout(r,250));
      cartel=(document.getElementById('confirm-overlay')?.textContent||'').replace(/\s+/g,' ').trim();
      document.getElementById('confirm-overlay')?.classList.remove('open');
    }

    return {
      editaMonto,editaFecha,cartel,
      seccion:nodos.slice(i,j<0?undefined:j).map(limpio),
      // Solo las filas que están antes del head de Certifications Sponsorship:
      // las de la sección también son .bp-detalle-row.
      benefs:nodos.slice(0,i).flatMap(n=>[...n.querySelectorAll('.bp-detalle-row')]).map(limpio),
      presupuesto:limpio([...document.querySelectorAll('#bpd-stats .bp-detalle-stat')]
        .find(e=>/Presupuesto/.test(e.textContent))),
      badge:limpio(document.querySelector('.bp-detalle-section-badge')),
      accionesCert:botonesCert.length,
    };
  });
  console.log('── Beneficios asignados ──');
  r.benefs.forEach(f=>console.log('   •',f));
  console.log('  Presupuesto de beneficios:',r.presupuesto,'· badge:',r.badge);
  console.log('\n── Certifications Sponsorship ──');
  console.log('   (botones:',r.accionesCert,'· el lápiz abre $'+r.editaMonto,'del',r.editaFecha+')');
  console.log('   (el tacho dice:',r.cartel+')');
  r.seccion.forEach(f=>console.log('   ',f));
  await browser.close();

  const texto=r.seccion.join(' ⏎ ');
  const fallas=[];
  if(/Sin certificaciones registradas/.test(texto)) fallas.push('la sección sigue vacía teniendo una Certifications cargada como beneficio');
  if(!/Certificación AWS/.test(texto)) fallas.push('no aparece la certificación cargada como beneficio');
  if(!/02 de jun de 2023/.test(texto)) fallas.push('no aparece su fecha');
  if(!/desde Beneficios/.test(texto)) fallas.push('no dice de dónde sale, así que no se sabe dónde corregirla');
  // La de Capacitaciones no se perdió, y van ordenadas de la más nueva a la más vieja
  if(!/CKA/.test(texto)) fallas.push('se perdió la certificación que venía de Capacitaciones');
  if(texto.indexOf('CKA')>texto.indexOf('Certificación AWS')) fallas.push('no están ordenadas de la más reciente a la más vieja');
  // La barra tiene que contar las dos: 300 + 150
  if(!/\$450 \/ \$2\.000/.test(texto)) fallas.push('la barra no suma lo cargado como beneficio: '+texto);
  // Y Udemy, que no es una certificación, no se cuela
  if(/CKAD with Tests|Kubernetes Certified/.test(texto)) fallas.push('se coló un beneficio que no es una certificación');

  // Una certificación pesa contra el tope de capacitación, no contra el de
  // beneficios: quedan AI Tools ($10/mes ×12 = $120) + Udemy ($50 del catálogo,
  // porque la asignación no trae monto propio) = $170. Con la certificación
  // adentro serían $320, y el mismo monto estaría restando dos topes distintos.
  if(!/\$170/.test(r.presupuesto)) fallas.push('la certificación sigue pesando en el presupuesto de beneficios: '+r.presupuesto);
  // Una certificación se ve en UN solo lugar: su sección. Repetirla arriba
  // mostraba el mismo registro dos veces en la misma card.
  const arriba=r.benefs.join(' ⏎ ');
  if(/Certifications|Certificación AWS/.test(arriba)) fallas.push('la certificación sigue duplicada en la lista de beneficios: '+arriba);
  if(!/AI Tools/.test(arriba)||!/Udemy/.test(arriba)) fallas.push('se llevó puesto algún beneficio que sí va arriba: '+arriba);
  if(!/^2 activos/.test(r.badge)) fallas.push('el conteo sigue incluyendo la certificación: '+r.badge);
  // Y desde su sección se la tiene que poder editar y borrar: al salir de la
  // lista de beneficios, esa fila es la única que la representa en la card.
  if(r.accionesCert!==2) fallas.push('la certificación quedó sin botones para editarla o borrarla: '+r.accionesCert);
  if(r.editaMonto!=='150'||r.editaFecha!=='2023-06-02') fallas.push(`el lápiz no abre esa certificación: monto="${r.editaMonto}" fecha="${r.editaFecha}"`);
  if(!/Certifications/.test(r.cartel)||!/Raphael Montani/.test(r.cartel)) fallas.push('el cartel de borrar no nombra el registro: '+r.cartel);

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ Las certificaciones cargadas como beneficio aparecen en Certifications Sponsorship');
  process.exit(fallas.length?1:0);
})();
