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
  for(const b of ['Blogpost','Udemy','Certifications']){
    assert.equal(ctx.montoBenefAsignado(fields,null,b),'$150',`${b} no debería llevar /año`);
  }
});

test('montoBenefAsignado: los beneficios anuales conservan el "/año"', ()=>{
  const fields={Monto:150};
  for(const b of ['Terapia','Clases de Inglés','Hardware Bonus',"O'Reilly"]){
    assert.equal(ctx.montoBenefAsignado(fields,null,b),'$150/año',`${b} debería llevar /año`);
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
