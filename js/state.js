// ─── STATE ───────────────────────────────────────────────────────────────────
// Estado global compartido entre módulos (mismo scope global que el resto de los <script>).

// El token de Airtable y el webhook de Slack ya no viven en el navegador —
// quedan como variables de entorno del servidor (ver api/_lib/auth.js y
// api/airtable.js). El login de Google (js/auth.js) es lo único que se
// guarda del lado del cliente.

let cachePersonasPorRol={};
let cacheProyectos=[], cacheProyectosRaw=[];
let cachePersonasRaw=[];
let pagState={eng:{page:0,data:[]},core:{page:0,data:[]}};
let pagBenefPersonas={page:0};

let cacheBeneficiosRaw=[];
let beneficiosFiltro='Todos';

// Checklist Ingresos/Egresos (Kanban)
const clState={};
const recMeta={};
const cacheChecklistFields={}; // {checklistId: fields del registro} — para mostrar Proyecto/Mail/País en el panel abierto
let dragId=null;

// Glassdoor
let cacheGDRecs=[];
let gdModalId=null;

// Proyectos / Meet our Teams
let cacheMeetByProyecto={};  // { 'NombreProyecto': [{id, fecha, link, notas}] }
let meetProyectoActual=null; // {id: recordId, nombre: string}
let sugerenciaProyectoActual=null; // proyecto recomendado para el próximo Meet our Teams (o null)
let sugerenciaProyectosCandidatos=[]; // lista completa de candidatos elegibles, ordenados por prioridad
let sugerenciaProyectoIndex=0; // índice del candidato mostrado actualmente en sugerenciaProyectosCandidatos

// Beneficios
let cacheBenefAsignados=[], cachePresupuestoLoyalty=[];
let benefMetricasInicializado=false; // si ya se seteó el Q/año actual por defecto en la pestaña Métricas
let benefDetalleActual=null; // {r, grupoFiltro} del beneficio abierto en #benef-detalle-overlay — para poder re-filtrar por TEM sin volver a abrir el modal

// Off Sites
let cacheOSRaw=[];
let cacheOSProyMap = {};
let osqInicializado=false;

// Ambassador Week
let cacheAWRaw=[];
let awqInicializado=false;

// Get Together
let gtqInicializado=false;

// Actividades Virtuales (webinars/workshops/townhalls/etc.)
let cacheAVRaw=[];
let avqInicializado=false;
let avEventoExpandido=null;
let avPanelPersona=null;
let avAsistentesPreseleccionados=new Set();

// Panel lateral persona
let cacheCapacitaciones=[], cacheGetTogetherRaw=[];
let cacheCumpleRows=[]; // filas ya calculadas (nombre/fecha/días/manager) — para filtrar sin recalcular
let spBenefAsigActual=[]; // Beneficios Asignados de la persona con el panel abierto — para editar/eliminar sin recargar

// Tareas (Kanban + Calendario)
let cacheTareasRaw=[];
let tareasCalMes=null; // Date del primer día del mes mostrado en el calendario; null = mes actual

// Nav / modal de alta de registros
let currentForm=null;
let currentFormFull=null;

// Lazy loading — secciones que ya se cargaron en esta sesión (ver nav.js)
let seccionesCargadas=new Set();
