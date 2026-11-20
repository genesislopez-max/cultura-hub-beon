// Al asignar una Certifications tiene que haber dónde poner el NOMBRE de la
// certificación. Sin ese campo el nombre terminaba anotado en Comentarios —que
// es el texto libre del pedido— y la fila de Certifications Sponsorship quedaba
// diciendo "Certificación sin nombre cargado".
//
// Se elige el beneficio disparando el change real del select, no llamando a los
// toggles a mano: lo que hay que probar es justamente que ese camino los llame.
const {lanzar,urlDelHub}=require('./_comun');

const PERSONAS=[{id:'p1',fields:{Nombre:'Raphael Montani','Rol en empresa':'Engineer',
  'Fecha de ingreso':'2022-01-01','Nivel Loyalty':'Storm'}}];
const BENEFICIOS=[
  {id:'bCe',fields:{Beneficio:'Certifications',Categoria:'Aprendizaje',Valor:150,Grupo:'Ambos',Estado:'Activo','Nivel Loyalty':'Todos'}},
  {id:'bUd',fields:{Beneficio:'Udemy Courses',Categoria:'Formación',Valor:50,Grupo:'Ambos',Estado:'Activo','Nivel Loyalty':'Todos'}},
  {id:'bAI',fields:{Beneficio:'AI Tools',Categoria:'Herramientas',Valor:10,Grupo:'Ambos',Estado:'Activo','Nivel Loyalty':'Todos'}},
];
const TABLAS={Personas:PERSONAS,Beneficios:BENEFICIOS,'Beneficios Asignados':[],'Presupuesto Loyalty':[],
  Proyectos:[],Checklist:[],Eventos:[],Capacitaciones:[],'Ambassador Week':[],'Off Sites':[],'Get Together':[],
  'Asistencia a Actividades':[],'Meet our Teams':[],Tareas:[],'Eventos Feedback':[],'Historial Loyalty':[]};

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
      creados.push(fields);
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:[{id:'n',fields}]})});
    }
    if(req.method()!=='GET') return route.fulfill({status:200,contentType:'application/json',body:'{"records":[]}'});
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records:TABLAS[tabla]||[]})});
  });
  await page.goto(urlDelHub());

  const r=await page.evaluate(async()=>{
    window.getIdToken=()=>'x'; window.puedeEscribir=()=>true; window.rolUsuarioActual=()=>'full';
    document.getElementById('login-screen').style.display='none';
    await cargarSeccionesIniciales(); await cargarSeccionLazy('beneficios');
    const esperar=ms=>new Promise(r=>setTimeout(r,ms));
    await esperar(400);

    const mirar=async(beneficio)=>{
      document.getElementById('f-ba-persona').value='Raphael Montani';
      actualizarBeneficiosPorPersona();
      await esperar(250);
      const sel=document.getElementById('f-ba-beneficio');
      sel.value=beneficio;
      sel.dispatchEvent(new Event('change'));
      await esperar(120);
      const vis=id=>{const e=document.getElementById(id);return e&&e.style.display!=='none';};
      const fg=document.getElementById('fg-ba-curso');
      return {beneficio,
        campoNombre:vis('fg-ba-curso'),
        label:fg?.querySelector('.field-label')?.textContent||'—',
        // El hint se oculta solo (display:none), así que hay que mirar eso y
        // no solo su texto: leerlo sin chequear visibilidad daba un falso
        // positivo en los tres beneficios.
        hint:vis('f-ba-curso-hint')
          ?(document.getElementById('f-ba-curso-hint').textContent||'').replace(/\s+/g,' ').trim():'',
        comentarios:vis('fg-ba-comentarios')};
    };
    _openFormModal(FORMS['beneficios-asignados']);
    await esperar(300);
    const cert=await mirar('Certifications');
    const udemy=await mirar('Udemy Courses');
    const ai=await mirar('AI Tools');

    // Y si igual se escribiera un nombre, ¿se guardaría?
    await mirar('Certifications');
    const campo=document.getElementById('f-ba-curso-nombre');
    if(campo) campo.value='AWS Solutions Architect Associate';
    document.getElementById('f-ba-comentarios').value='aprobada por el TEM';
    document.getElementById('f-ba-fecha').value='2026-03-01';
    await saveRecord();
    await esperar(400);
    return {cert,udemy,ai};
  });

  const mostrar=v=>console.log(`  ${v.beneficio.padEnd(16)} campo nombre: ${v.campoNombre?'sí  label="'+v.label+'"':'NO '}  · comentarios: ${v.comentarios?'sí':'no'}${v.hint?'  · hint: '+v.hint.slice(0,40)+'…':''}`);
  console.log('Formulario "Asignar beneficio":');
  [r.cert,r.udemy,r.ai].forEach(mostrar);
  console.log('\nLo que se guardó al asignar la certificación:');
  console.log('  ',JSON.stringify(creados[0]));
  await browser.close();

  const fallas=[];
  // Certifications: el campo aparece, con su etiqueta
  if(!r.cert.campoNombre) fallas.push('al asignar una Certifications no hay dónde poner el nombre');
  if(r.cert.label!=='Certificación') fallas.push('la etiqueta no dice qué va en el campo: "'+r.cert.label+'"');
  if(!r.cert.comentarios) fallas.push('se perdió el campo de comentarios de Certifications');
  // El Quarter se calcula solo en Udemy/credenciales: la aclaración no aplica acá
  if(r.cert.hint) fallas.push('muestra una aclaración que no aplica a Certifications: '+r.cert.hint);

  // Udemy sigue igual que siempre
  if(!r.udemy.campoNombre||r.udemy.label!=='Curso') fallas.push('se rompió el campo Curso de Udemy: '+r.udemy.label);
  if(!r.udemy.hint) fallas.push('Udemy perdió la aclaración del Quarter');

  // Y un beneficio sin nombre propio no lo muestra
  if(r.ai.campoNombre) fallas.push('aparece un campo de nombre en AI Tools, que no lo tiene');

  // Lo escrito se guarda: mostrarlo y no guardarlo es peor que no mostrarlo
  const g=creados[0]||{};
  if(g.Curso!=='AWS Solutions Architect Associate') fallas.push('no guarda el nombre de la certificación: '+JSON.stringify(g));
  if(g.Comentarios!=='aprobada por el TEM') fallas.push('no guarda el comentario: '+JSON.stringify(g));

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ Al asignar una certificación se puede cargar su nombre, y se guarda');
  process.exit(fallas.length?1:0);
})();
