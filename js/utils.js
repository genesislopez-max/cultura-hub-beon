// ─── UTILS ───────────────────────────────────────────────────────────────────
function setBanner(msg,type='info'){
  const b=document.getElementById('banner'),sp=document.getElementById('banner-spinner');
  document.getElementById('banner-msg').textContent=msg;
  b.className='banner banner-'+type;
  sp.style.display=type==='info'?'block':'none';
  if(type!=='info')setTimeout(()=>b.style.display='none',4000);
}
function toast(msg,err=false){
  const t=document.getElementById('toast');
  t.textContent=msg;t.style.background=err?'var(--red)':'var(--dark)';
  t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3500);
}
function fmt(d){if(!d)return'—';const dt=new Date(d+'T12:00:00');return dt.toLocaleDateString('es-AR',{day:'2-digit',month:'short',year:'numeric'});}

// ¿Esta persona ya había ingresado (y todavía no se había ido) en la fecha
// dada? Se usa para calcular "% de asistencia" sin tener que guardar una fila
// por cada persona que NO asistió a un evento — el universo de gente
// "disponible para asistir" se calcula al vuelo a partir de Personas.
function personaActivaEnFecha(persona,fechaStr){
  if(!fechaStr) return true;
  const f=persona.fields||{};
  const fecha=new Date(fechaStr+'T12:00:00');
  const ingreso=f['Fecha de ingreso']?new Date(f['Fecha de ingreso']+'T00:00:00'):null;
  const egreso=f['Fecha de egreso']?new Date(f['Fecha de egreso']+'T00:00:00'):null;
  if(ingreso&&fecha<ingreso) return false;
  if(egreso&&fecha>=egreso) return false;
  return true;
}
function daysTo(ds){
  if(!ds)return 9999;
  const now=new Date();now.setHours(0,0,0,0);
  let d=new Date(ds+'T12:00:00');d.setHours(0,0,0,0);d.setFullYear(now.getFullYear());
  if(d<now)d.setFullYear(now.getFullYear()+1);
  return Math.round((d-now)/86400000);
}
function safeStr(n){return Array.isArray(n)?n[0]||'':typeof n==='string'?n:String(n||'');}
function av(n){const s=safeStr(n);return AVS[s.split('').reduce((a,c)=>a+c.charCodeAt(0),0)%AVS.length];}
function ini(n){const s=safeStr(n)||'?';return s.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();}
function avH(n){const s=safeStr(n);return`<div class="avatar ${av(s)}">${ini(s)}</div>`;}

// ─── TEM (Manager a cargo) ───────────────────────────────────────────────────
// Lista de TEMs distintos sobre TODAS las personas (activas e históricas) —
// fuente única para poblar cualquier select de "Filtrar por TEM" en tablas
// que no tienen ya su propio dataset acotado (ver poblarFiltrosPersonas()
// en personas.js para las tablas que sí lo tienen).
function listaTEMs(){
  return[...new Set(cachePersonasRaw.map(p=>p.fields.Manager).filter(Boolean))].sort();
}
// Resuelve el TEM de una persona a partir de su nombre — para tablas cuyas
// filas ya no son el registro de Personas completo (ej. Off Sites, Get
// Together: ahí solo queda el nombre resuelto, hay que volver a buscarlo).
function managerDePersona(nombre){
  const p=cachePersonasRaw.find(x=>(x.fields.Nombre||'').trim()===String(nombre||'').trim());
  return p?.fields.Manager||'';
}
// Puebla un <select id="selectId"> con "Todos los TEMs" + la lista de
// listaTEMs(), preservando la selección vigente si sigue siendo válida.
function poblarSelectorTEM(selectId){
  const sel=document.getElementById(selectId);
  if(!sel) return;
  const actual=sel.value;
  const tems=listaTEMs();
  sel.innerHTML='<option value="">Todos los TEMs</option>'+tems.map(t=>`<option value="${t}">${t}</option>`).join('');
  if(tems.includes(actual)) sel.value=actual;
}

// ─── MÉTRICAS POR TRIMESTRE (Beneficios / Off Sites / Get Together / AW) ──────
const MESES_ES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// Puebla un <select> de años con el año actual + los años detectados en los
// datos, preservando la selección vigente si sigue siendo una opción válida.
function poblarSelectorAnio(selectId,anios){
  const sel=document.getElementById(selectId);
  if(!sel) return;
  const actual=sel.value;
  const todos=new Set([new Date().getFullYear(),...anios]);
  sel.innerHTML=[...todos].sort((a,b)=>b-a).map(a=>`<option value="${a}"${String(a)===actual?' selected':''}>${a}</option>`).join('');
}

// Rango [inicio,fin] del trimestre calendario q (1-4) del año dado.
function rangoTrimestre(anio,q){
  const mesInicio=(q-1)*3;
  return {inicio:new Date(anio,mesInicio,1),fin:new Date(anio,mesInicio+3,0)};
}

// 'YYYY-MM-DD' -> 'Q1 2023' — usado donde se necesita mostrar/guardar el
// trimestre de una fecha en el mismo formato que se maneja fuera del Hub.
function quarterLabel(fechaStr){
  if(!fechaStr) return '';
  const d=new Date(fechaStr+'T12:00:00');
  return `Q${Math.floor(d.getMonth()/3)+1} ${d.getFullYear()}`;
}

// Ambassador Week no tiene un campo de fecha real, solo "Edición AW" a mano
// (ej. "diciembre 2021") — intenta interpretarlo como fecha para poder
// agruparlo por trimestre. Devuelve 'YYYY-MM-01' o null si no lo reconoce.
function parsearEdicionAW(texto){
  if(!texto) return null;
  const m=String(texto).toLowerCase().match(/([a-záéíóúñ]+)\D{0,3}(\d{4})/i);
  if(!m) return null;
  const palabra=m[1];
  const mesIdx=MESES_ES.findIndex(mes=>mes.startsWith(palabra)||palabra.startsWith(mes));
  if(mesIdx===-1) return null;
  return `${m[2]}-${String(mesIdx+1).padStart(2,'0')}-01`;
}
// ─── REPETICIÓN DE TAREAS ──────────────────────────────────────────────────────
// L M M J V S D → valores de Date.getDay() (0=domingo)
const DIAS_SEMANA_ES=['L','M','M','J','V','S','D'];
const DIAS_SEMANA_VALORES=[1,2,3,4,5,6,0];

// Ocurrencias ADICIONALES (sin incluir fechaInicioStr) para una tarea que se
// repite, acotadas a un horizonte fijo por frecuencia para no crear tareas
// indefinidamente hacia el futuro. diasSemana es un array de valores de
// Date.getDay() (solo se usa si frecuencia==='semanal'); si viene vacío se usa
// el día de la semana de la fecha de inicio.
function generarFechasRecurrentes(fechaInicioStr,frecuencia,diasSemana){
  const inicio=new Date(fechaInicioStr+'T12:00:00');
  const toStr=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const fechas=[];
  if(frecuencia==='diaria'){
    for(let i=1;i<=30;i++){
      const d=new Date(inicio);d.setDate(d.getDate()+i);
      fechas.push(toStr(d));
    }
  }else if(frecuencia==='semanal'){
    const dias=(diasSemana&&diasSemana.length)?diasSemana:[inicio.getDay()];
    const fin=new Date(inicio);fin.setDate(fin.getDate()+7*8);
    const cursor=new Date(inicio);cursor.setDate(cursor.getDate()+1);
    while(cursor<=fin){
      if(dias.includes(cursor.getDay())) fechas.push(toStr(cursor));
      cursor.setDate(cursor.getDate()+1);
    }
  }else if(frecuencia==='mensual'){
    for(let i=1;i<=12;i++){
      const d=new Date(inicio);d.setMonth(d.getMonth()+i);
      fechas.push(toStr(d));
    }
  }else if(frecuencia==='anual'){
    for(let i=1;i<=5;i++){
      const d=new Date(inicio);d.setFullYear(d.getFullYear()+i);
      fechas.push(toStr(d));
    }
  }
  return fechas;
}

// Ocurrencias ADICIONALES para la repetición "Personalizado": cada `intervalo`
// unidades (día/semana/mes/año), hasta `cantidad` ocurrencias. Para
// unidad==='semana' respeta los días elegidos (diasSemana) en lugar de
// repetir siempre el mismo día de la semana de inicio.
function generarFechasPersonalizadas(fechaInicioStr,intervalo,unidad,diasSemana,cantidad){
  const inicio=new Date(fechaInicioStr+'T12:00:00');
  const toStr=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const n=Math.max(1,Math.min(cantidad||1,104));
  const paso=Math.max(1,intervalo||1);
  const fechas=[];
  if(unidad==='semana'){
    const dias=[...(diasSemana&&diasSemana.length?diasSemana:[inicio.getDay()])].sort((a,b)=>((a+6)%7)-((b+6)%7));
    const dowLunes=(inicio.getDay()+6)%7;
    const lunesBase=new Date(inicio);lunesBase.setDate(lunesBase.getDate()-dowLunes);
    let semana=0,tope=0;
    while(fechas.length<n&&tope<1000){
      if(semana%paso===0){
        for(const dv of dias){
          const offset=(dv+6)%7;
          const d=new Date(lunesBase);d.setDate(d.getDate()+semana*7+offset);
          if(d>inicio&&fechas.length<n) fechas.push(toStr(d));
        }
      }
      semana++;tope++;
    }
  }else{
    for(let i=1;i<=n;i++){
      const d=new Date(inicio);
      if(unidad==='dia') d.setDate(d.getDate()+paso*i);
      else if(unidad==='mes') d.setMonth(d.getMonth()+paso*i);
      else if(unidad==='anio') d.setFullYear(d.getFullYear()+paso*i);
      fechas.push(toStr(d));
    }
  }
  return fechas.sort();
}

// Próxima ocurrencia (una sola fecha) a partir de la fecha de la tarea que se
// acaba de completar y su config de repetición guardada — usado para crear
// la siguiente tarea recién cuando se marca "Hecho" la actual (en vez de
// generar todo el lote por adelantado). Devuelve null si no repite más
// (personalizada con restantes agotado).
function proximaFechaRepeticion(fechaBaseStr,config){
  if(!config||!config.frecuencia) return null;
  if(config.frecuencia==='personalizada'){
    if(config.restantes!=null&&config.restantes<=0) return null;
    const fechas=generarFechasPersonalizadas(fechaBaseStr,config.intervalo||1,config.unidad||'dia',config.dias||[],1);
    return fechas[0]||null;
  }
  const fechas=generarFechasRecurrentes(fechaBaseStr,config.frecuencia,config.dias||[]);
  return fechas[0]||null;
}

// ─── CONFIRM DIALOG ──────────────────────────────────────────────────────────
function showConfirm(title, msg, onOk){
  document.getElementById('confirm-title').textContent=title;
  document.getElementById('confirm-msg').textContent=msg;
  const btn=document.getElementById('confirm-ok');
  // Clonar para limpiar listeners previos
  const newBtn=btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn,btn);
  newBtn.onclick=async()=>{
    newBtn.disabled=true;
    newBtn.innerHTML='<i class="ti ti-loader" style="animation:spin 0.8s linear infinite"></i> Eliminando...';
    try{ await onOk(); }finally{ closeConfirm(); }
  };
  document.getElementById('confirm-overlay').classList.add('open');
}
function closeConfirm(){
  document.getElementById('confirm-overlay').classList.remove('open');
  document.getElementById('confirm-ok').disabled=false;
  document.getElementById('confirm-ok').innerHTML='<i class="ti ti-trash"></i>Eliminar';
}
function getRolGroup(rol){
  const core=['Core Team','Supervisor','TEM','Lead','Manager','COO','Founder'];
  return core.includes(rol)?'Core Team':'Engineers';
}
