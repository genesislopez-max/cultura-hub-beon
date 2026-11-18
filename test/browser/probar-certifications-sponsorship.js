// Una Certifications cargada como beneficio tiene que aparecer en el área
// "Certifications Sponsorship" de la persona — ahí y SOLO ahí, no repetida
// arriba— con su nombre de título (no el comentario del pedido), su monto
// contra el tope de capacitación, y pudiéndose editar y borrar desde su fila.
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
    Estado:'Activo',Comentarios:'Compro un curso de Rails específicamente para diversas necesidades del proyecto. Ya lo inicio.'}},
  {id:'a5',fields:{Persona:'Raphael Montani',Beneficio:['bCe'],Monto:300,'Fecha activación':'2026-02-10',
    Estado:'Activo',Curso:'AWS Solutions Architect Associate',Comentarios:'aprobada por el TEM'}},
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
  const escrituras=[];
  await page.route('**/api/**',route=>{
    const req=route.request();
    const url=decodeURIComponent(req.url());
    if(url.includes('/api/slack')) return route.fulfill({status:200,contentType:'application/json',body:'{}'});
    const tabla=((url.match(/path=([^&]+)/)||[])[1]||'').split('/')[0];
    if(req.method()==='PATCH'){
      escrituras.push(JSON.parse(req.postData()||'{}').fields||{});
      return route.fulfill({status:200,contentType:'application/json',body:'{"id":"a2","fields":{}}'});
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
    await verBenefPersona('Raphael Montani','Engineers','Storm');
    await esperar(500);

    const limpio=el=>el?el.textContent.replace(/\s+/g,' ').trim():'';
    const nodos=[...document.getElementById('bpd-body').children];
    // El encabezado de sección, no cualquier nodo que mencione el texto.
    const i=nodos.findIndex(n=>n.classList.contains('bp-detalle-section-head')
      &&/Certifications Sponsorship/.test(n.textContent||''));
    const filasDe=lista=>lista.flatMap(n=>[...n.querySelectorAll('.bp-detalle-row')]);
    // Cada fila se lee por partes y no como un texto pegado: el punto de este
    // check es justamente qué va en el título y qué va en el comentario.
    const leer=el=>({
      titulo:limpio(el.querySelector('.bp-detalle-row-title')),
      sub:limpio(el.querySelector('.bp-detalle-row-sub')),
      coment:limpio(el.querySelector('.bp-detalle-row-coment')),
      monto:limpio(el.querySelector('.bp-detalle-row-meta')),
      botones:el.querySelectorAll('.bp-detalle-action-btn').length,
    });
    const arriba=filasDe(nodos.slice(0,i)).map(leer);
    const certs=filasDe(nodos.slice(i)).map(leer);

    // Cargar el nombre desde el lápiz de la fila que no lo tiene
    const sinNombre=filasDe(nodos.slice(i)).find(e=>/sin nombre cargado/.test(e.textContent));
    const botones=sinNombre?[...sinNombre.querySelectorAll('.bp-detalle-action-btn')]:[];
    let editaMonto='',editaFecha='',hayCampoNombre=false,cartel='';
    if(botones[0]){
      botones[0].click(); await esperar(250);
      editaMonto=document.getElementById('f-eba-monto')?.value||'';
      editaFecha=document.getElementById('f-eba-fecha')?.value||'';
      const campo=document.getElementById('f-eba-curso');
      hayCampoNombre=!!campo;
      if(campo){ campo.value='AWS Certified Developer'; await window._activeForm.save(); }
      closeModal(); await esperar(200);
    }
    if(botones[1]){
      botones[1].click(); await esperar(250);
      cartel=limpio(document.getElementById('confirm-overlay'));
      document.getElementById('confirm-overlay')?.classList.remove('open');
    }

    return {arriba,certs,editaMonto,editaFecha,hayCampoNombre,cartel,
      badge:limpio(document.querySelector('.bp-detalle-section-badge')),
      presupuesto:limpio([...document.querySelectorAll('#bpd-stats .bp-detalle-stat')]
        .find(e=>/Presupuesto/.test(e.textContent))),
      barra:limpio(nodos.slice(i).find(n=>/Presupuesto usado/.test(n.textContent||''))),
    };
  });

  const mostrar=(t,filas)=>{
    console.log(`\n── ${t} ──`);
    filas.forEach(f=>{
      console.log(`   • ${f.titulo}  ${f.monto}${f.botones?'  [✏️ 🗑]':''}`);
      console.log(`     ${f.sub}`);
      if(f.coment) console.log(`     💬 ${f.coment}`);
    });
  };
  mostrar('Beneficios asignados — '+r.badge+' · '+r.presupuesto,r.arriba);
  mostrar('Certifications Sponsorship — '+r.barra,r.certs);
  console.log('\n── Cargar el nombre desde el lápiz ──');
  console.log('   abre: $'+r.editaMonto,'del',r.editaFecha,'· ¿hay campo?',r.hayCampoNombre);
  console.log('   guarda:',JSON.stringify(escrituras));
  console.log('   el tacho dice:',r.cartel);
  await browser.close();

  const fallas=[];
  const txtArriba=r.arriba.map(f=>f.titulo).join(' | ');
  const porTitulo=t=>r.certs.find(f=>new RegExp(t).test(f.titulo));

  // 1 · La certificación va en su sección, y no repetida arriba
  if(/Certifications|AWS|Rails/.test(txtArriba)) fallas.push('la certificación sigue duplicada arriba: '+txtArriba);
  if(!/AI Tools/.test(txtArriba)||!/Udemy/.test(txtArriba)) fallas.push('se llevó puesto un beneficio que sí va arriba: '+txtArriba);
  if(!/^2 activos/.test(r.badge)) fallas.push('el conteo incluye la certificación: '+r.badge);
  if(!/\$170/.test(r.presupuesto)) fallas.push('la certificación pesa en el presupuesto de beneficios: '+r.presupuesto);

  // 2 · El comentario NO es el título
  const rails=porTitulo('sin nombre cargado');
  if(!rails) fallas.push('no se dice que falta cargar el nombre: '+r.certs.map(f=>f.titulo).join(' | '));
  if(rails&&/Compro un curso de Rails/.test(rails.titulo)) fallas.push('el comentario se usa de título: '+rails.titulo);
  if(rails&&!/Compro un curso de Rails/.test(rails.coment)) fallas.push('se perdió el comentario, que es el único contexto: '+rails.coment);

  // 3 · La que sí tiene nombre lo muestra, con su comentario debajo
  const aws=porTitulo('AWS Solutions Architect Associate');
  if(!aws) fallas.push('la que tiene nombre cargado no lo muestra como título');
  if(aws&&!/aprobada por el TEM/.test(aws.coment)) fallas.push('no muestra su comentario debajo: '+aws?.coment);

  // 4 · Conviven los dos orígenes, de la más nueva a la más vieja
  if(!porTitulo('^CKA$')) fallas.push('se perdió la certificación que viene de Capacitaciones');
  const orden=r.certs.map(f=>f.titulo).join(' | ');
  if(!/AWS Solutions.*CKA.*sin nombre/.test(orden)) fallas.push('no van de la más reciente a la más vieja: '+orden);
  if(aws&&!/desde Beneficios/.test(aws.sub)) fallas.push('no dice de dónde sale, así que no se sabe dónde corregirla');
  if(!/\$750 \/ \$2\.000/.test(r.barra)) fallas.push('la barra no suma las tres (300+300+150): '+r.barra);

  // 5 · Y se puede editar, borrar y completar el nombre desde su propia fila
  if(!rails||rails.botones!==2) fallas.push('la certificación quedó sin botones para editarla o borrarla');
  if(r.editaMonto!=='150'||r.editaFecha!=='2023-06-02') fallas.push(`el lápiz no abre esa certificación: $${r.editaMonto} del ${r.editaFecha}`);
  if(!r.hayCampoNombre) fallas.push('el título promete cargar el nombre pero el modal no tiene dónde');
  if(escrituras.find(f=>'Curso' in f)?.Curso!=='AWS Certified Developer') fallas.push('no guarda el nombre cargado: '+JSON.stringify(escrituras));
  if(!/Certifications/.test(r.cartel)||!/Raphael Montani/.test(r.cartel)) fallas.push('el cartel de borrar no nombra el registro: '+r.cartel);

  console.log(fallas.length?'\n❌ '+fallas.join('\n❌ '):'\n✅ La certificación vive solo en su sección, con su nombre de título y editable desde ahí');
  process.exit(fallas.length?1:0);
})();
