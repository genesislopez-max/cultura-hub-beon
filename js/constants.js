const PAG_SIZE=50;
// ─── CHECKLIST MAP ────────────────────────────────────────────────────────────
const ITEMS_INGRESO_MAP=[
  {t:'Agregar al doc de Rewards Program',                                                                                              e:'Pre-ingreso',    r:['todos'],         l:'https://docs.google.com/spreadsheets/d/1VzmvwzYDnBwEOfaai40kzZEbY_M311rpRI-YHndTOWc/edit?gid=304848196#gid=304848196'},
  {t:'Registrar fecha de ingreso en Hub para bienvenida por #general',                                                                 e:'Pre-ingreso',    r:['todos']},
  {t:'Registrar aniversario en Hub (reminder automático)',                                                                              e:'Pre-ingreso',    r:['todos']},
  {t:'Registrar 4 meses de ingreso para pedir review Glassdoor',                                                                       e:'Pre-ingreso',    r:['todos']},
  {t:'Agendar cumpleaños en Hub (reminder automático)',                                                                                 e:'Pre-ingreso',    r:['todos']},
  {t:'Agendar cumpleaños en Google Calendar',                                                                                          e:'Pre-ingreso',    r:['todos']},
  {t:'Sumar a lista "Todos los BEONers" en Brevo',                                                                                     e:'Pre-ingreso',    r:['todos']},
  {t:'Sumar a lista latam / core team / brasil en Brevo',                                                                              e:'Pre-ingreso',    r:['todos']},
  {t:'Sumar a lista por país en Brevo',                                                                                                e:'Pre-ingreso',    r:['todos']},
  {t:'Sumar a la lista de mails del sheet accounting',                                                                                 e:'Pre-ingreso',    r:['todos'],         l:'https://docs.google.com/spreadsheets/d/1fjbGd0j52S8JHqB9YNYh2OzChwL3A5TzuK_YPIlFNTY/edit?gid=1841043249#gid=1841043249', activo:false},
  {t:'Agregar a planilla de Beneficios — Engineers',                                                                                   e:'Pre-ingreso',    r:['Engineer','Ambos','todos'], l:'https://docs.google.com/spreadsheets/d/1On6cf5i41qnln4DCBbgXjMj23XJhr4xx0X7cnP4LTQ0/edit?gid=2125161103#gid=2125161103'},
  {t:'Agregar a planilla de Beneficios — Core Team',                                                                                   e:'Pre-ingreso',    r:['Core Team','Ambos'],       l:'https://docs.google.com/spreadsheets/d/1jJSbyxWeZ4IlVyxId-cLK39waQfprhQknEJ0HGxSojA/edit?gid=2125161103#gid=2125161103'},
  {t:'Enviar mensaje de presentación y pedido de info al nuevo BEONer (CC Culture Leader)',                                            e:'Primer día',     r:['todos'],         l:'https://www.notion.so/beon-tech/Ingreso-y-presentaci-n-2d8e4b56540b80cf9cfdf10e2af7cb85'},
  {t:'Enviar mensaje de bienvenida por #general',                                                                                      e:'Primer día',     r:['todos'],         l:'https://www.notion.so/beon-tech/Ingreso-y-presentaci-n-2d8e4b56540b80cf9cfdf10e2af7cb85'},
  {t:'Enviar mail de bienvenida nivel 1 Loyalty Program en Brevo',                                                                     e:'Primer día',     r:['todos'],         l:'https://www.notion.so/beon-tech/Mail-Bienvenida-Loyalty-Program-2d8e4b56540b800b93d1fdfe22566c67'},
  {t:'Pedirle a Julian Fuks agregar a coreteam@beon.tech',                                                                             e:'Primer día',     r:['Core Team','Ambos']},
  {t:'Agregar al Notion de Core Team',                                                                                                 e:'Primer día',     r:['Core Team','Ambos'], l:'https://www.notion.so/beon-tech/Core-Team-2ca8838de13e4cd38406066d73963f19'},
  {t:'Enviar 14 Lecciones Esenciales a la semana de ingresar',                                                                         e:'Primera semana', r:['Core Team','Ambos']},
  {t:'Revisar LinkedIn del BEONer — si no está actualizado, solicitar actualización por Slack y dejar registro en Trello',              e:'Primera semana', r:['Engineer','Ambos'], l:'https://www.notion.so/beon-tech/Cambio-de-empleo-en-LinkedIn-2d8e4b56540b80eb9d77d6c2b3d03c4f'},
];
// Los "activo:false" se dejan en el array (no se borran) para no correr el
// índice de los que ya estaban guardados en ItemsCompletados de checklists
// existentes — mismo patrón que ya usa ITEMS_INGRESO_MAP más arriba.
const ITEMS_EGRESO_MAP=[
  // Ya lo dice el título de la tarjeta/etapa — no hace falta un paso aparte.
  {t:'Fecha de offboarding registrada',                   e:'Aviso dado', activo:false},
  {t:'Avisar a Billy',                                    e:'Aviso dado', l:'https://slack.com/app_redirect?channel=D04RDKVQGNR'},
  {t:'Avisar a terapeutas',                               e:'Aviso dado'},
  {t:'Avisar a Viviana (portugués)',                      e:'Aviso dado'},
  {t:'Sacar del doc de Rewards Program',                  e:'En proceso', l:'https://docs.google.com/spreadsheets/d/1VzmvwzYDnBwEOfaai40kzZEbY_M311rpRI-YHndTOWc/edit?gid=304848196#gid=304848196'},
  // Ya automático: Cumpleaños/Aniversarios se calculan en vivo desde Personas
  // y excluyen a quien tiene Fecha de egreso — no hay nada que borrar a mano.
  {t:'Eliminar aniversario en Hub',                       e:'En proceso', activo:false},
  {t:'Eliminar cumpleaños en Hub',                        e:'En proceso', activo:false},
  {t:'Sacar cumpleaños del Calendar of Events',           e:'En proceso'},
  // Ya automático: la lista de Glassdoor (js/glassdoor.js) ahora excluye a
  // quien ya egresó, no queda pendiente para siempre.
  {t:'Eliminar reminder de review Glassdoor (si aplica)', e:'En proceso', activo:false},
  // No se usan más.
  {t:'Sacar de la lista de mails del sheet accounting',   e:'En proceso', activo:false},
  {t:'Eliminar de Brevo',                                 e:'En proceso', l:'https://app.brevo.com/contact/list'},
  {t:'Eliminar del Hall of Fame',                         e:'En proceso', l:'https://sites.google.com/beon.studio/internalsite/loyalty-program/hall-of-fame?authuser=0'},
  {t:'Completar sheet métricas offboarding',              e:'En proceso', activo:false},
  {t:'Sacar de AI Tools',                                 e:'En proceso', activo:false},
  {t:'Eliminar de la planilla de Beneficios',             e:'En proceso', activo:false},
];
const ETAPAS_INGRESO=['Pre-ingreso','Primer día','Primera semana','Onboarding completo'];
const ETAPAS_EGRESO=['Aviso dado','En proceso','Offboarding completo'];

function getItemsMap(tipo,rol){
  if(tipo==='Egreso') return ITEMS_EGRESO_MAP;
  const seen=new Set();
  return ITEMS_INGRESO_MAP.filter(it=>{
    const aplica=it.r.includes('todos')||it.r.includes(rol);
    if(!aplica||seen.has(it.t)) return false;
    seen.add(it.t); return true;
  });
}
function getItems(tipo,rol){return getItemsMap(tipo,rol).map(it=>it.t);}

// Posiciones (dentro del array que devuelve getItemsMap) de los ítems vigentes.
// Los ítems dados de baja (activo:false) se dejan en el array para no correr el
// índice de los que ya estaban guardados en ItemsCompletados — simplemente se
// excluyen de lo que se muestra y de lo que cuenta para el progreso.
function getActiveIndexes(tipo,rol){
  return getItemsMap(tipo,rol).reduce((a,it,idx)=>{if(it.activo!==false)a.push(idx);return a;},[]);
}
function contarProgreso(tipo,rol,chk){
  const idxs=getActiveIndexes(tipo,rol);
  const comp=idxs.filter(i=>chk&&chk[i]).length;
  return {comp,total:idxs.length,pct:idxs.length?Math.round(comp/idxs.length*100):0};
}

function calcularEtapa(tipo,rol,chk,fechaIngreso){
  const items=getItemsMap(tipo,rol);
  const etapas=tipo==='Egreso'?ETAPAS_EGRESO:ETAPAS_INGRESO;
  if(tipo==='Ingreso'&&fechaIngreso){
    const dias=Math.floor((new Date()-new Date(fechaIngreso+'T12:00:00'))/86400000);
    if(dias>=14) return 'Onboarding completo';
  }
  for(let i=0;i<etapas.length-1;i++){
    const idxs=items.reduce((a,it,idx)=>{if(it.e===etapas[i]&&it.activo!==false)a.push(idx);return a;},[]);
    if(!idxs.length) continue;
    if(!idxs.every(idx=>chk[idx])) return etapas[i];
  }
  return etapas[etapas.length-1];
}
const AVS=['av-blue','av-purple','av-pink','av-green','av-amber'];
const COL_ID_INGRESO={
  'Pre-ingreso':        'cards-Pre-ingreso',
  'Primer día':         'cards-Primer-día',
  'Primera semana':     'cards-Primera-semana',
  'Onboarding completo':'cards-Onboarding-completo',
};
const COL_CNT_INGRESO={
  'Pre-ingreso':        'kc-Pre-ingreso',
  'Primer día':         'kc-Primer-día',
  'Primera semana':     'kc-Primera-semana',
  'Onboarding completo':'kc-Onboarding-completo',
};
const COL_ID_EGRESO={
  'Aviso dado':          'cards-Aviso-dado',
  'En proceso':          'cards-En-proceso',
  'Offboarding completo':'cards-Offboarding-completo',
};
const COL_CNT_EGRESO={
  'Aviso dado':          'kc-Aviso-dado',
  'En proceso':          'kc-En-proceso',
  'Offboarding completo':'kc-Offboarding-completo',
};
const rolColor={Engineer:'badge-blue',TEM:'badge-purple',Manager:'badge-amber',Lead:'badge-green','Core Team':'badge-purple',Otro:'badge-gray',Supervisor:'badge-amber',COO:'badge-amber',Founder:'badge-amber'};
// Roles que pertenecen a Core Team — usado en Personas y Cumpleaños para
// clasificar a alguien en un grupo u otro.
const CORE_TEAM_ROLES=new Set(['Core Team','Supervisor','TEM','Lead','Manager','COO','Founder']);
// Roles que califican como líder/manager de alguien — usado para poblar el
// selector de "Filtrar por TEM": no se limita al rol "TEM" en sí, porque
// Core Team puede reportarle a un Lead, Manager, Supervisor, COO o Founder.
const LIDER_ROLES=new Set(['TEM','Manager','Lead','Supervisor','COO','Founder']);
const NIVELES=['Spark','Ray','Lightning','Thunder','Storm'];
const nivelEmoji={Spark:'⚡',Ray:'☀️',Lightning:'🌩',Thunder:'🌪',Storm:'🌊'};
const NIVEL_ICONS={Spark:'ti-sparkles',Ray:'ti-sun',Lightning:'ti-bolt',Thunder:'ti-wind',Storm:'ti-cloud-storm'};
const LOYALTY_ORDER=['Spark','Ray','Lightning','Thunder','Storm'];
const AW_RULES={
  Spark:  {asistenciasConVuelo:1, limitadoConVuelo:true},
  Ray:    {asistenciasConVuelo:1, limitadoConVuelo:true},
  Lightning:{asistenciasConVuelo:1, limitadoConVuelo:true},
  Thunder:{asistenciasConVuelo:2, limitadoConVuelo:true},
  Storm:  {asistenciasConVuelo:Infinity, limitadoConVuelo:false},
};
const ADD=['ingresos','egresos','engineers','coreteam','reviews','proyectos','tareas','checklist','beneficios','beneficios-asignados','ambassadors','offsites','gettogether','actividades'];
const ADD_FULL_SECTIONS=['ingresos'];
const LABELS={ingresos:'Nuevo ingreso',egresos:'Nuevo offboarding',engineers:'Nueva persona',coreteam:'Nueva persona',reviews:'Nuevo reminder',proyectos:'Nuevo proyecto',tareas:'Nueva tarea',checklist:'Nuevo checklist',beneficios:'Nuevo beneficio','beneficios-asignados':'Asignar beneficio',ambassadors:'Registrar asistencia AW',offsites:'Registrar Off Site',gettogether:'Registrar Get Together',actividades:'Registrar actividad'};
const TITLES={inicio:'Inicio',engineers:'Engineers & Tech',coreteam:'Core Team',cumpleanos:'Cumpleaños',aniversarios:'Aniversarios',ingresos:'Ingresos — Kanban',egresos:'Offboarding — Kanban',reviews:'Glassdoor Reviews',proyectos:'Proyectos',tareas:'Tareas',checklist:'Checklist Ingreso / Egreso',beneficios:'Beneficios',ambassadors:'Ambassador Week',offsites:'Off Sites',gettogether:'Get Together',actividades:'Asistencia a Actividades'};
// Texto del "eyebrow" arriba del título en el topbar — solo las secciones listadas lo muestran.
const EYEBROWS={inicio:'Panel del equipo',gettogether:'Comunidad BEON',offsites:'Comunidad BEON',engineers:'Directorio del equipo',egresos:'Offboarding',reviews:'People Ops'};
// Grupo del menú lateral (dropdown) al que pertenece cada sección — usado
// para expandir el grupo automáticamente si showSection() navega a una
// sección que está dentro de un grupo colapsado.
const SECCION_GRUPO={inicio:'principal',engineers:'principal',coreteam:'principal',cumpleanos:'eventos',aniversarios:'eventos',ingresos:'gestion',egresos:'gestion',reviews:'gestion',proyectos:'gestion',tareas:'gestion',beneficios:'beneficios',ambassadors:'beneficios',offsites:'beneficios',gettogether:'beneficios',actividades:'beneficios'};
// Secciones con acceso restringido por rol — el bloqueo real ya pasa en el
// servidor (api/airtable.js); esto es solo para ocultar la navegación del
// lado del cliente. Una sección que no aparece acá no tiene restricción
// (la ve cualquier rol). Ver js/nav.js: aplicarRestriccionesDeAcceso()/showSection().
const SECCION_ROLES_PERMITIDOS={
  ingresos:new Set(['full','hr']),
  egresos:new Set(['full','hr']),
  reviews:new Set(['full']), // Glassdoor
};
