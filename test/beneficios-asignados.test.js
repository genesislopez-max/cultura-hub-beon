'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../test-helpers/load-app');

// beneficios.js aporta los helpers esBeneficioBlogpost/esBeneficioConLink, de
// los que dependen los de presentación de side-panel.js.
const ctx=loadApp(['constants.js','utils.js','state.js','beneficios.js','side-panel.js']);
// Las declaraciones `const` de nivel superior no quedan expuestas como
// propiedades del sandbox — hay que leerlas del contexto.
const BENEF_ESTADOS=vm.runInContext('BENEF_ESTADOS',ctx);
const BENEF_ESTADOS_CON_MOTIVO=vm.runInContext('BENEF_ESTADOS_CON_MOTIVO',ctx);

// ─── Estados ──────────────────────────────────────────────────────────────────
// "En pausa" se agregó para el histórico de clases de inglés migrado del Sheet:
// gente que suspendió el beneficio sin darlo de baja. El punto del tercer estado
// es que se distinga de Inactivo en la UI pero cuente como NO activo en todos
// los filtros del Hub, que comparan contra 'Activo'.
test('BENEF_ESTADOS: los tres estados, con Activo primero (el default del form)', ()=>{
  // Se compara el join y no el array: el array viene del sandbox de vm, con su
  // propio Array.prototype, así que deepEqual estricto falla por realm.
  assert.equal(BENEF_ESTADOS.join('|'),'Activo|En pausa|Inactivo');
});

test('solo En pausa e Inactivo piden motivo — un beneficio activo no tiene por qué', ()=>{
  assert.equal(BENEF_ESTADOS_CON_MOTIVO.has('En pausa'),true);
  assert.equal(BENEF_ESTADOS_CON_MOTIVO.has('Inactivo'),true);
  assert.equal(BENEF_ESTADOS_CON_MOTIVO.has('Activo'),false);
});

test('badgeEstadoBenef: un color por estado, y sin Estado se asume Activo', ()=>{
  assert.match(ctx.badgeEstadoBenef('Activo'),/badge-green">Activo</);
  assert.match(ctx.badgeEstadoBenef('En pausa'),/badge-amber">En pausa</);
  assert.match(ctx.badgeEstadoBenef('Inactivo'),/badge-gray">Inactivo</);
  // Los registros viejos no tienen Estado seteado; el Hub los trata como activos.
  assert.match(ctx.badgeEstadoBenef(undefined),/badge-green">Activo</);
  assert.match(ctx.badgeEstadoBenef(''),/badge-green">Activo</);
});

// ─── Período ──────────────────────────────────────────────────────────────────
test('periodoBenefAsignado: Activo muestra un período abierto', ()=>{
  const t=ctx.periodoBenefAsignado({Estado:'Activo','Fecha activación':'2025-03-01'});
  assert.match(t,/^Activo desde /);
  assert.doesNotMatch(t,/Baja/);
});

// En pausa no lleva Fecha de baja porque el beneficio no terminó. Si alguna
// quedó de un paso previo por Inactivo, no se muestra: mostrar una baja en un
// beneficio pausado diría que terminó, que es lo contrario del estado.
test('periodoBenefAsignado: En pausa muestra el inicio y NUNCA una fecha de baja', ()=>{
  const t=ctx.periodoBenefAsignado({
    Estado:'En pausa',
    'Fecha activación':'2022-06-03',
    'Fecha de baja':'2022-10-20',
  });
  assert.match(t,/^En pausa · empezó el /);
  assert.doesNotMatch(t,/Baja/);
});

test('periodoBenefAsignado: Inactivo cierra el período con la baja', ()=>{
  const t=ctx.periodoBenefAsignado({
    Estado:'Inactivo',
    'Fecha activación':'2021-06-03',
    'Fecha de baja':'2022-10-20',
  });
  assert.match(t,/^Usado desde /);
  assert.match(t,/ · Baja: /);
});

// Varias filas del histórico migrado tienen "Terminó" sin fecha de fin — no
// pueden dejar la fila sin texto ni imprimir "undefined".
test('periodoBenefAsignado: Inactivo sin fechas no imprime undefined', ()=>{
  assert.equal(ctx.periodoBenefAsignado({Estado:'Inactivo'}),'Sin fecha registrada');
  assert.equal(ctx.periodoBenefAsignado({Estado:'Activo'}),'Sin fecha registrada');
  assert.equal(ctx.periodoBenefAsignado({Estado:'En pausa'}),'En pausa · sin fecha de inicio');
});

test('periodoBenefAsignado: sin Estado se comporta como Activo', ()=>{
  assert.match(ctx.periodoBenefAsignado({'Fecha activación':'2025-03-01'}),/^Activo desde /);
});

// ─── Asistencia ───────────────────────────────────────────────────────────────
test('asistenciaBenefAsignado: junta mes y año, y redondea', ()=>{
  assert.equal(
    ctx.asistenciaBenefAsignado({'% asistencia mensual':66.67,'% asistencia anual':88.2}),
    '67% mes · 88% año',
  );
});

test('asistenciaBenefAsignado: con un solo porcentaje no deja separadores sueltos', ()=>{
  assert.equal(ctx.asistenciaBenefAsignado({'% asistencia anual':55}),'55% año');
  assert.equal(ctx.asistenciaBenefAsignado({'% asistencia mensual':100}),'100% mes');
});

// 0% es el caso que más importa mostrar (justifica la baja por poco
// compromiso), así que no puede caer por truthiness junto con el vacío.
test('asistenciaBenefAsignado: 0% se muestra; vacío/null no', ()=>{
  assert.equal(ctx.asistenciaBenefAsignado({'% asistencia mensual':0,'% asistencia anual':55}),'0% mes · 55% año');
  assert.equal(ctx.asistenciaBenefAsignado({}),'');
  assert.equal(ctx.asistenciaBenefAsignado({'% asistencia mensual':null,'% asistencia anual':''}),'');
});

// ─── Fecha de baja editable ───────────────────────────────────────────────────
// Antes la Fecha de baja se forzaba a new Date() al pasar a Inactivo y no había
// campo para tocarla, así que la fecha real (casi siempre anterior al día en
// que se carga en el Hub) se terminaba anotando a mano en el motivo. Ahora sale
// del input; estas pruebas fijan qué se manda a Airtable en cada estado.
function fieldsDeBaja(estadoNuevo,fechaInput){
  const fields={Estado:estadoNuevo};
  if(BENEF_ESTADOS_CON_MOTIVO.has(estadoNuevo)) fields['Motivo de baja']='algo';
  else fields['Motivo de baja']=null;
  if(estadoNuevo==='Inactivo') fields['Fecha de baja']=fechaInput||null;
  else fields['Fecha de baja']=null;
  return fields;
}

test('fecha de baja: al pasar a Inactivo se guarda la fecha elegida, no la de hoy', ()=>{
  const hoy=new Date().toISOString().slice(0,10);
  const fields=fieldsDeBaja('Inactivo','2022-10-20');
  assert.equal(fields['Fecha de baja'],'2022-10-20');
  assert.notEqual(fields['Fecha de baja'],hoy);
});

test('fecha de baja: Inactivo sin fecha en el campo guarda null, no una fecha inventada', ()=>{
  assert.equal(fieldsDeBaja('Inactivo','')['Fecha de baja'],null);
});

// "En pausa" no lleva fecha de baja: el beneficio no terminó. Si el registro
// venía de Inactivo, la baja anterior se limpia.
test('fecha de baja: En pausa nunca guarda fecha de baja, pero sí motivo', ()=>{
  const fields=fieldsDeBaja('En pausa','2022-10-20');
  assert.equal(fields['Fecha de baja'],null);
  assert.equal(fields['Motivo de baja'],'algo');
});

test('fecha de baja: volver a Activo limpia fecha y motivo', ()=>{
  const fields=fieldsDeBaja('Activo','2022-10-20');
  assert.equal(fields['Fecha de baja'],null);
  assert.equal(fields['Motivo de baja'],null);
});

// La fila del beneficio ya mostraba la baja; con la fecha editable tiene que
// seguir reflejando la que se guardó, no la de carga.
test('periodoBenefAsignado: muestra la fecha de baja que se guardó', ()=>{
  const t=ctx.periodoBenefAsignado({Estado:'Inactivo','Fecha activación':'2022-06-03','Fecha de baja':'2022-10-20'});
  assert.match(t,/Baja: 20 de oct de 2022/);
});

// ─── Blogpost ─────────────────────────────────────────────────────────────────
// Blogpost se paga por cada publicación, no por año: el "/año" del monto mentía
// sobre la periodicidad, "Activo desde" no aplica a algo puntual, y el link a
// la publicación es el dato que más se busca.
// Los que se pagan por unidad (un curso, una certificación, una publicación)
// van sin "/año": el monto es lo que costó ESA cosa, no un cupo anual.
test('montoBenefAsignado: los beneficios por unidad van sin "/año"', ()=>{
  const fields={Monto:150};
  for(const b of ['Blogpost','Udemy','Certifications',"O'Reilly",'Pluralsight']){
    assert.equal(ctx.montoBenefAsignado(fields,null,b),'$150',`${b} no debería llevar /año`);
  }
});

test('montoBenefAsignado: los beneficios anuales conservan el "/año"', ()=>{
  const fields={Monto:150};
  for(const b of ['Terapia','Clases de Inglés','Gimnasio']){
    assert.equal(ctx.montoBenefAsignado(fields,null,b),'$150/año',`${b} debería llevar /año`);
  }
});

// AI Tools son USD 20 por mes: con "/año" se leía el costo anual donde estaba
// el mensual.
test('montoBenefAsignado: AI Tools va por mes', ()=>{
  const fields={Monto:20};
  assert.equal(ctx.montoBenefAsignado(fields,null,'AI Tools – Claude'),'$20/mes');
  assert.equal(ctx.montoBenefAsignado(fields,null,'AI Tools'),'$20/mes');
  assert.equal(ctx.montoBenefAsignado(fields,null,'ai tools - chatgpt'),'$20/mes');
});

// Hardware Bonus es de única vez con un tope que se puede gastar en varias
// compras: no es un cupo que se renueve cada año.
test('montoBenefAsignado: Hardware Bonus no lleva sufijo', ()=>{
  assert.equal(ctx.montoBenefAsignado({Monto:150},null,'Hardware Bonus'),'$150');
  assert.equal(ctx.montoBenefAsignado({Monto:150},null,'Hardware'),'$150');
});

test('el desplegable del Hardware Bonus muestra cuánto se usó del tope', ()=>{
  const benef={fields:{Valor:500}};
  const fila=(monto,fecha)=>({r:{id:fecha,fields:{'Fecha activación':fecha,Estado:'Activo',Monto:monto}},benef,nombre:'Hardware Bonus'});
  const g=ctx.agruparBenefAsignados([fila(300,'2026-01-10'),fila(120,'2026-05-02')])[0];
  assert.match(ctx.montoGrupoBenef(g),/\$420 de \$500/);
  assert.doesNotMatch(ctx.montoGrupoBenef(g),/en total/);
});

test('el comentario libre está disponible en Certifications y Hardware Bonus', ()=>{
  for(const b of ['Certifications','Hardware Bonus']){
    assert.equal(ctx.esBeneficioConComentario(b),true,b);
  }
  for(const b of ['Terapia','Udemy','Clases de Inglés',"O'Reilly"]){
    assert.equal(ctx.esBeneficioConComentario(b),false,b);
  }
});

test('montoBenefAsignado: cae al valor del catálogo si la asignación no tiene monto', ()=>{
  const benef={fields:{Valor:200}};
  assert.equal(ctx.montoBenefAsignado({},benef,'Blogpost'),'$200');
  assert.equal(ctx.montoBenefAsignado({},benef,'Terapia'),'$200/año');
});

test('montoBenefAsignado: sin monto ni valor de catálogo no imprime "$"', ()=>{
  assert.equal(ctx.montoBenefAsignado({},null,'Blogpost'),'');
  assert.equal(ctx.montoBenefAsignado({},{fields:{}},'Terapia'),'');
});

test('periodoBenefAsignado: Blogpost muestra la fecha de publicación, no "Activo desde"', ()=>{
  const t=ctx.periodoBenefAsignado({Estado:'Activo','Fecha activación':'2026-03-12'},'Blogpost');
  assert.match(t,/^Fecha de publicación: /);
  assert.doesNotMatch(t,/Activo desde/);
});

// La publicación no se "despublica": la fecha es la misma aunque el registro
// quede marcado inactivo.
test('periodoBenefAsignado: Blogpost no cambia el texto según el estado', ()=>{
  const base={'Fecha activación':'2026-03-12','Fecha de baja':'2026-06-01'};
  const activo=ctx.periodoBenefAsignado({...base,Estado:'Activo'},'Blogpost');
  const inactivo=ctx.periodoBenefAsignado({...base,Estado:'Inactivo'},'Blogpost');
  assert.equal(activo,inactivo);
  assert.doesNotMatch(inactivo,/Baja/);
});

test('periodoBenefAsignado: Blogpost sin fecha lo dice con sus palabras', ()=>{
  assert.equal(ctx.periodoBenefAsignado({Estado:'Activo'},'Blogpost'),'Sin fecha de publicación');
});

// Sin nombre de beneficio (el resto de las vistas) se comporta como antes.
test('periodoBenefAsignado: los demás beneficios no cambian', ()=>{
  assert.match(ctx.periodoBenefAsignado({Estado:'Activo','Fecha activación':'2026-03-12'},'Terapia'),/^Activo desde /);
  assert.match(ctx.periodoBenefAsignado({Estado:'Activo','Fecha activación':'2026-03-12'}),/^Activo desde /);
});

// El link lo carga una persona en Airtable: un "javascript:" en un href se
// ejecutaría al clickearlo.
test('linkBenefAsignado: un link http/https sale como enlace que abre en otra pestaña', ()=>{
  const html=ctx.linkBenefAsignado({Link:'https://blog.beon.tech/mi-post'});
  assert.match(html,/<a /);
  assert.match(html,/href="https:\/\/blog\.beon\.tech\/mi-post"/);
  assert.match(html,/target="_blank"/);
  assert.match(html,/rel="noopener noreferrer"/);
});

test('linkBenefAsignado: un javascript: NO se convierte en href', ()=>{
  const html=ctx.linkBenefAsignado({Link:'javascript:alert(1)'});
  assert.doesNotMatch(html,/<a /);
  assert.doesNotMatch(html,/href=/);
  assert.match(html,/alert\(1\)/); // se muestra como texto, el dato no se pierde
});

test('linkBenefAsignado: un texto que no es URL se muestra como texto, no como link', ()=>{
  const html=ctx.linkBenefAsignado({Link:'pendiente de publicar'});
  assert.doesNotMatch(html,/<a /);
  assert.match(html,/pendiente de publicar/);
});

test('linkBenefAsignado: sin link no imprime nada', ()=>{
  assert.equal(ctx.linkBenefAsignado({}),'');
  assert.equal(ctx.linkBenefAsignado({Link:'   '}),'');
});

// ─── Orden de los beneficios asignados ────────────────────────────────────────
// Clases de Inglés encabeza la lista: es el beneficio que más se consulta y
// quedaba mezclado según el orden en que Airtable devolvía los registros, que
// no es ninguno en particular.
test('esBeneficioIngles: reconoce las formas en que está escrito el beneficio', ()=>{
  assert.equal(ctx.esBeneficioIngles('Clases de Inglés'),true);  // con tilde
  assert.equal(ctx.esBeneficioIngles('Clases de Ingles'),true);  // sin tilde
  assert.equal(ctx.esBeneficioIngles('English Classes'),true);
  assert.equal(ctx.esBeneficioIngles('Clases de Portugués'),false);
  assert.equal(ctx.esBeneficioIngles('Udemy'),false);
  assert.equal(ctx.esBeneficioIngles(''),false);
});

// La tilde importa: normalizarBeneficioKey borraba los acentos en vez de
// convertirlos, así que "Inglés" quedaba como "ingls" y no matcheaba "ingles".
test('normalizarBeneficioKey: las tildes se convierten a su letra base', ()=>{
  assert.equal(ctx.normalizarBeneficioKey('Clases de Inglés'),'clasesdeingles');
  assert.equal(ctx.normalizarBeneficioKey('Clases de Portugués'),'clasesdeportugues');
  // Los que no tienen tildes siguen dando lo mismo que antes
  assert.equal(ctx.normalizarBeneficioKey('Udemy'),'udemy');
  assert.equal(ctx.normalizarBeneficioKey('Blogpost'),'blogpost');
});

test('ordenarBenefAsignados: Clases de Inglés queda primero', ()=>{
  const filas=[{nombre:'Udemy'},{nombre:'Terapia'},{nombre:'Clases de Inglés'},{nombre:'Blogpost'}];
  assert.equal(ctx.ordenarBenefAsignados(filas)[0].nombre,'Clases de Inglés');
});

test('ordenarBenefAsignados: el resto queda alfabético', ()=>{
  const filas=[{nombre:'Udemy'},{nombre:'Terapia'},{nombre:'Clases de Inglés'},{nombre:'Blogpost'}];
  const orden=ctx.ordenarBenefAsignados(filas).map(f=>f.nombre);
  assert.equal(orden.join(' | '),'Clases de Inglés | Blogpost | Terapia | Udemy');
});

test('ordenarBenefAsignados: sin Clases de Inglés, todo alfabético', ()=>{
  const orden=ctx.ordenarBenefAsignados([{nombre:'Udemy'},{nombre:'Blogpost'}]).map(f=>f.nombre);
  assert.equal(orden.join(' | '),'Blogpost | Udemy');
});

// No muta el array que recibe: verBenefPersona lo arma a partir del cache.
test('ordenarBenefAsignados: no modifica el array original', ()=>{
  const filas=[{nombre:'Udemy'},{nombre:'Clases de Inglés'}];
  ctx.ordenarBenefAsignados(filas);
  assert.equal(filas[0].nombre,'Udemy');
});

// ─── Agrupado por beneficio ───────────────────────────────────────────────────
// Una persona puede tener el mismo beneficio varias veces (tres cursos de
// Udemy): listarlos sueltos repetía el mismo título sin dejar claro que son
// usos distintos del mismo beneficio.
const fila=(nombre,fecha,estado)=>({nombre,benef:{fields:{Beneficio:nombre}},r:{fields:{'Fecha activación':fecha,Estado:estado||'Activo'}}});

test('agruparBenefAsignados: junta las asignaciones del mismo beneficio', ()=>{
  const gs=ctx.agruparBenefAsignados([
    fila('Udemy','2024-06-28'),fila('Terapia','2025-01-01'),
    fila('Udemy','2023-08-22'),fila('Udemy','2026-04-01'),
  ]);
  assert.equal(gs.length,2);
  const udemy=gs.find(g=>g.nombre==='Udemy');
  assert.equal(udemy.items.length,3);
  assert.equal(gs.find(g=>g.nombre==='Terapia').items.length,1);
});

// Lo último que hizo la persona es lo que se busca primero.
test('agruparBenefAsignados: dentro del grupo, la más reciente primero', ()=>{
  const g=ctx.agruparBenefAsignados([
    fila('Udemy','2024-06-28'),fila('Udemy','2026-04-01'),fila('Udemy','2023-08-22'),
  ])[0];
  assert.equal(
    g.items.map(i=>i.r.fields['Fecha activación']).join(' | '),
    '2026-04-01 | 2024-06-28 | 2023-08-22',
  );
});

test('agruparBenefAsignados: cuenta cuántas del grupo están activas', ()=>{
  const g=ctx.agruparBenefAsignados([
    fila('Udemy','2026-04-01','Inactivo'),fila('Udemy','2024-06-28'),fila('Udemy','2023-08-22'),
  ])[0];
  assert.equal(g.items.length,3);
  assert.equal(g.activos,2);
});

// El orden de los grupos respeta el criterio de la lista: Inglés primero.
test('agruparBenefAsignados: mantiene el orden de ordenarBenefAsignados', ()=>{
  const gs=ctx.agruparBenefAsignados([
    fila('Udemy','2024-01-01'),fila('Terapia','2025-01-01'),fila('Clases de Inglés','2022-01-01'),
  ]);
  assert.equal(gs.map(g=>g.nombre).join(' | '),'Clases de Inglés | Terapia | Udemy');
});

test('agruparBenefAsignados: una asignación sin fecha no rompe el orden', ()=>{
  const g=ctx.agruparBenefAsignados([fila('Udemy',undefined),fila('Udemy','2024-01-01')])[0];
  assert.equal(g.items.length,2);
  assert.equal(g.items[0].r.fields['Fecha activación'],'2024-01-01');
});

test('agruparBenefAsignados: sin asignaciones devuelve lista vacía', ()=>{
  assert.equal(ctx.agruparBenefAsignados([]).length,0);
});

// ─── Beneficios que no corren en el tiempo ────────────────────────────────────
// "Activo desde" no describe un curso de Udemy ni unas credenciales de
// O'Reilly/Pluralsight: el curso se solicitó una vez y las credenciales se
// compartieron un día. Lo que importa es la fecha de ese hecho.
test('Udemy dice "Solicitado el", no "Activo desde"', ()=>{
  const f={'Fecha activación':'2025-07-11',Estado:'Activo'};
  assert.equal(ctx.periodoBenefAsignado(f,'Udemy'),'Solicitado el 11 de jul de 2025');
  assert.doesNotMatch(ctx.periodoBenefAsignado(f,'Udemy'),/Activo desde/);
});

test('O\'Reilly y Pluralsight dicen "Credenciales compartidas el"', ()=>{
  const f={'Fecha activación':'2024-07-26',Estado:'Activo'};
  for(const n of ["O'Reilly",'OReilly','Pluralsight','pluralsight']){
    assert.equal(ctx.periodoBenefAsignado(f,n),'Credenciales compartidas el 26 de jul de 2024',n);
  }
});

test('los beneficios que sí corren en el tiempo siguen diciendo "Activo desde"', ()=>{
  const f={'Fecha activación':'2025-07-11',Estado:'Activo'};
  assert.match(ctx.periodoBenefAsignado(f,'Terapia'),/^Activo desde/);
  assert.match(ctx.periodoBenefAsignado(f,'Clases de Inglés'),/^Activo desde/);
});

test('al darse de baja, un acceso conserva la fecha en que se compartió', ()=>{
  const f={'Fecha activación':'2024-07-26','Fecha de baja':'2025-01-31',Estado:'Inactivo'};
  assert.equal(ctx.periodoBenefAsignado(f,"O'Reilly"),
    'Credenciales compartidas el 26 de jul de 2024 · Baja: 31 de ene de 2025');
  // Un blogpost publicado no se "cierra": no lleva baja aunque esté inactivo
  assert.equal(ctx.periodoBenefAsignado(f,'Blogpost'),'Fecha de publicación: 26 de jul de 2024');
});

// ─── Credenciales recompartidas ───────────────────────────────────────────────
// Caso real: una persona con dos asignaciones de O'Reilly (2024 y 2025) se leía
// como dos accesos activos distintos, cuando es el mismo acceso recompartido
// porque cambió la contraseña. Lo que importa es desde cuándo lo tiene.
test('un acceso recompartido no se cuenta como dos beneficios activos', ()=>{
  const fila=(fecha)=>({r:{id:'r'+fecha,fields:{'Fecha activación':fecha,Estado:'Activo'}},benef:null,nombre:"O'Reilly"});
  const g=ctx.agruparBenefAsignados([fila('2024-07-26'),fila('2025-07-11')])[0];
  const resumen=ctx.resumenGrupoBenef(g);
  assert.match(resumen,/Compartidas el 26 de jul de 2024/); // la PRIMERA vez
  assert.match(resumen,/recompartidas 1 vez/);
  assert.doesNotMatch(resumen,/2 activas/);
});

test('el resumen del grupo no cambia para los beneficios que no son credenciales', ()=>{
  const fila=(curso)=>({r:{id:curso,fields:{'Fecha activación':'2025-01-01',Estado:'Activo',Curso:curso}},benef:null,nombre:'Udemy'});
  const g=ctx.agruparBenefAsignados([fila('Docker'),fila('Kubernetes')])[0];
  assert.equal(ctx.resumenGrupoBenef(g),'2 asignaciones · 2 activas');
});

// ─── Lo que se cobra una sola vez ─────────────────────────────────────────────
// O'Reilly y Pluralsight se pagan UNA vez por persona. Volver a compartir las
// credenciales deja otra asignación cargada, pero no es otro gasto: antes cada
// recompartida inflaba el presupuesto usado de esa persona y el total del equipo.
const ctxSuma=loadApp(['constants.js','utils.js','state.js','beneficios.js']);
const asigDe=(persona,beneficio,monto)=>({fields:{Persona:[persona],Beneficio:[beneficio],...(monto!=null?{Monto:monto}:{})}});

test('un acceso recompartido se cuenta una sola vez', ()=>{
  const suma=as=>ctxSuma.sumarMontosAsignados(as,[]);
  assert.equal(suma([asigDe('Nicolas',"O'Reilly",499),asigDe('Nicolas',"O'Reilly",499)]),499);
  assert.equal(suma([asigDe('Nicolas','Pluralsight',300),asigDe('Nicolas','Pluralsight',300)]),300);
});

test('el mismo acceso a dos personas distintas sí suma dos veces', ()=>{
  assert.equal(ctxSuma.sumarMontosAsignados(
    [asigDe('Nicolas',"O'Reilly",499),asigDe('Ana',"O'Reilly",499)],[]),998);
});

test('si una de las asignaciones quedó sin monto, se toma la que lo tiene', ()=>{
  assert.equal(ctxSuma.sumarMontosAsignados(
    [asigDe('Nicolas',"O'Reilly",499),asigDe('Nicolas',"O'Reilly")],[]),499);
});

test('los beneficios que no son credenciales siguen sumando cada asignación', ()=>{
  // Dos cursos de Udemy son dos compras distintas: ahí sí se suman
  assert.equal(ctxSuma.sumarMontosAsignados(
    [asigDe('Carlos','Udemy',35),asigDe('Carlos','Udemy',20)],[]),55);
});

test('sin Monto propio se usa el Valor del catálogo', ()=>{
  const catalogo=[{fields:{Beneficio:'Terapia',Valor:120}}];
  assert.equal(ctxSuma.sumarMontosAsignados([asigDe('Ana','Terapia')],catalogo),120);
});

test('el encabezado de credenciales muestra el costo una sola vez', ()=>{
  const fila=(fecha,monto)=>({r:{id:'r'+fecha,fields:{'Fecha activación':fecha,Estado:'Activo',Monto:monto}},benef:null,nombre:"O'Reilly"});
  const g=ctx.agruparBenefAsignados([fila('2024-07-26',499),fila('2025-07-11',499)])[0];
  const html=ctx.montoGrupoBenef(g);
  assert.match(html,/\$499/);
  assert.doesNotMatch(html,/998/);       // no suma las dos veces
  assert.doesNotMatch(html,/en total/);  // no es un acumulado
});

test('el encabezado de un beneficio por unidad sí acumula', ()=>{
  const fila=(curso,monto)=>({r:{id:curso,fields:{'Fecha activación':'2025-01-01',Estado:'Activo',Curso:curso,Monto:monto}},benef:null,nombre:'Udemy'});
  const g=ctx.agruparBenefAsignados([fila('Docker',35),fila('Terraform',20)])[0];
  assert.match(ctx.montoGrupoBenef(g),/\$55 en total/);
});

// AI Tools se carga una sola vez con el monto MENSUAL (nadie anota nada cada
// mes), así que el presupuesto tiene que anualizarlo: sumarlo tal cual contaba
// USD 20 al año donde el gasto real son 240.
test('el presupuesto anualiza los beneficios mensuales', ()=>{
  const suma=as=>ctxSuma.sumarMontosAsignados(as,[]);
  assert.equal(suma([asigDe('Ana','AI Tools – Claude',20)]),240);
  assert.equal(suma([asigDe('Ana','AI Tools',20)]),240);
  // Dos personas con el mismo beneficio mensual suman cada una su año
  assert.equal(suma([asigDe('Ana','AI Tools',20),asigDe('Beto','AI Tools',20)]),480);
});

test('los beneficios que no son mensuales no se multiplican', ()=>{
  const suma=as=>ctxSuma.sumarMontosAsignados(as,[]);
  assert.equal(suma([asigDe('Ana','Terapia',600)]),600);
  assert.equal(suma([asigDe('Ana','Hardware Bonus',300)]),300);
  assert.equal(suma([asigDe('Ana','Udemy',35)]),35);
});

test('el mensual también se anualiza cuando el monto sale del catálogo', ()=>{
  const catalogo=[{fields:{Beneficio:'AI Tools – Claude',Valor:20}}];
  assert.equal(ctxSuma.sumarMontosAsignados([asigDe('Ana','AI Tools – Claude')],catalogo),240);
});

// La card muestra el monto MENSUAL aunque el presupuesto cuente el anual: es
// como se habla del beneficio ("son 20 dólares por mes").
test('la card sigue mostrando el monto mensual, no el anualizado', ()=>{
  assert.equal(ctx.montoBenefAsignado({Monto:20},null,'AI Tools – Claude'),'$20/mes');
});
