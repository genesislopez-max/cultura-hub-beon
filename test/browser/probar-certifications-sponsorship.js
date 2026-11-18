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
    return {
      seccion:nodos.slice(i,j<0?undefined:j).map(limpio),
      benefs:[...document.querySelectorAll('#bpd-body .bp-detalle-row')].map(limpio).slice(0,3),
      presupuesto:limpio([...document.querySelectorAll('#bpd-stats .bp-detalle-stat')]
        .find(e=>/Presupuesto/.test(e.textContent))),
    };
  });
  console.log('── Beneficios asignados ──');
  r.benefs.forEach(f=>console.log('   •',f));
  console.log('  Presupuesto de beneficios:',r.presupuesto);
  console.log('\n── Certifications Sponsorship ──');
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
  const filaCert=r.benefs.find(f=>/Certifications/.test(f))||'';
  if(!/cuenta en Certifications Sponsorship/.test(filaCert)) fallas.push('la fila no aclara dónde cuenta el monto, así que la resta del encabezado no cierra: '+filaCert);

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ Las certificaciones cargadas como beneficio aparecen en Certifications Sponsorship');
  process.exit(fallas.length?1:0);
})();
