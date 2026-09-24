// ─── BENEFICIOS con filtro por grupo ─────────────────────────────────────────
// ── CACHE BENEFICIOS COMPLETO ────────────────────────────────────────────────
async function loadBeneficios(){
  const [dBenef, dAsig, dPres] = await Promise.all([
    atGet('Beneficios','&sort[0][field]=Beneficio&sort[0][direction]=asc'),
    atGet('Beneficios Asignados'),
    atGet('Presupuesto Loyalty')
  ]);
  cacheBeneficiosRaw=dBenef.records||[];
  cachePresupuestoLoyalty=dPres.records||[];

  // Resolver linked records en Beneficios Asignados
  cacheBenefAsignados=(dAsig.records||[]).map(r=>{
    const f={...r.fields};
    // Persona: si es linked record (array de IDs), resolver a nombre
    if(Array.isArray(f.Persona)){
      const id=f.Persona[0];
      const match=cachePersonasRaw.find(p=>p.id===id);
      f.Persona=match?match.fields.Nombre:id;
    }
    // Beneficio: si es linked record (array de IDs), resolver a nombre
    if(Array.isArray(f.Beneficio)){
      const id=f.Beneficio[0];
      const match=cacheBeneficiosRaw.find(b=>b.id===id);
      f.Beneficio=match?match.fields.Beneficio:id;
    }
    return {...r, fields:f};
  });
  const tabCount=document.getElementById('benef-tab-count-catalogo');
  if(tabCount) tabCount.textContent=cacheBeneficiosRaw.length;
  poblarFiltroBeneficioNombre();
  poblarSelectorTEM('benef-persona-tem');
  renderBenefCatalogo();
  renderBenefPersonas();
  renderBenefMetricas();
}

function poblarFiltroBeneficioNombre(){
  const sel=document.getElementById('benef-nombre');
  if(!sel) return;
  const actual=sel.value;
  const nombres=[...new Set(cacheBeneficiosRaw.map(b=>b.fields.Beneficio).filter(Boolean))].sort();
  sel.innerHTML='<option value="">Todos los beneficios</option>'+nombres.map(n=>`<option value="${n}"${n===actual?' selected':''}>${n}</option>`).join('');
}

// El botón "+" de arriba abre un form distinto según el tab activo: alta de
// beneficio al catálogo en "Catálogo", o asignación de un beneficio a una
// persona puntual en "Por persona" (FORMS['beneficios-asignados'] ya existía
// pero no estaba conectado a ningún botón).
// HR y Manager no ven la pestaña de Métricas (cinturón de seguridad además
// de ocultar el botón — por si algo la dispara directamente).
const BENEF_ROLES_SIN_METRICAS=new Set(['hr','manager']);

// Se llama al arrancar (ver aplicarRestriccionesDeAcceso() en nav.js) —
// oculta/fija controles de Beneficios según el rol. Los elementos ya están
// en el DOM desde que carga index.html, así que no hace falta esperar a
// loadBeneficios() (que recién corre cuando el usuario entra a la sección).
function aplicarRestriccionesBeneficios(){
  const rol=rolUsuarioActual();
  if(BENEF_ROLES_SIN_METRICAS.has(rol)){
    document.querySelector('.benef-tab[onclick*="metricas"]')?.style.setProperty('display','none');
  }
  if(rol==='hr'){
    const sel=document.getElementById('benef-persona-grupo');
    if(sel){ sel.value='Core Team'; sel.disabled=true; }
  }
}

function switchBenefTab(tab, btn){
  if(tab==='metricas'&&BENEF_ROLES_SIN_METRICAS.has(rolUsuarioActual())){
    tab='catalogo';
    btn=document.querySelector('.benef-tab[onclick*="catalogo"]');
  }
  document.querySelectorAll('.benef-tab').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  document.getElementById('benef-tab-catalogo').style.display=tab==='catalogo'?'':'none';
  document.getElementById('benef-tab-personas').style.display=tab==='personas'?'':'none';
  const tabMetricas=document.getElementById('benef-tab-metricas');
  if(tabMetricas) tabMetricas.style.display=tab==='metricas'?'':'none';
  const ab=document.getElementById('btn-add');
  if(ab) ab.style.display=tab==='metricas'?'none':'flex';
  if(tab==='metricas'){
    poblarAnioBenefQ();
    if(!benefMetricasInicializado){
      const hoy=new Date();
      const selAnio=document.getElementById('benefq-anio');
      if(selAnio) selAnio.value=String(hoy.getFullYear());
      document.getElementById('benefq-trimestre').value=String(Math.floor(hoy.getMonth()/3)+1);
      benefMetricasInicializado=true;
    }
    renderBenefMetricasQ();
    return;
  }
  const formKey=tab==='personas'?'beneficios-asignados':'beneficios';
  currentForm=FORMS[formKey];
  const lbl=document.getElementById('btn-label');
  if(lbl) lbl.textContent=LABELS[formKey];
}

// ─── MÉTRICAS POR TRIMESTRE ───────────────────────────────────────────────────
// "Alta" = una asignación (Beneficios Asignados) cuya Fecha de activación cae
// dentro del trimestre elegido — mide cuánto se usó cada beneficio en ese
// período, más allá de si sigue activo hoy.
function poblarAnioBenefQ(){
  const sel=document.getElementById('benefq-anio');
  if(!sel) return;
  const anios=new Set([new Date().getFullYear()]);
  cacheBenefAsignados.forEach(r=>{
    const f=r.fields['Fecha activación'];
    if(f) anios.add(new Date(f+'T12:00:00').getFullYear());
  });
  const actual=sel.value;
  sel.innerHTML=[...anios].sort((a,b)=>b-a).map(a=>`<option value="${a}"${String(a)===actual?' selected':''}>${a}</option>`).join('');
}

function renderBenefMetricasQ(){
  const anio=Number(document.getElementById('benefq-anio')?.value)||new Date().getFullYear();
  const q=Number(document.getElementById('benefq-trimestre')?.value)||1;
  const mesInicio=(q-1)*3;
  const inicio=new Date(anio,mesInicio,1);
  const fin=new Date(anio,mesInicio+3,0); // último día del 3er mes del trimestre

  // El grupo sale de la persona que recibió el beneficio, no del campo Grupo
  // del catálogo: ese dice a quién le CORRESPONDE el beneficio (y "Ambos" no
  // dice nada), mientras que acá se está midiendo quién lo usó.
  const grupoFil=document.getElementById('benefq-grupo')?.value||'';
  const delGrupo=r=>!grupoFil||grupoDeAsignacion(r)===grupoFil;

  const conFecha=cacheBenefAsignados.filter(r=>r.fields['Fecha activación']&&delGrupo(r));
  document.getElementById('bq-sinfecha').textContent=cacheBenefAsignados.filter(r=>!r.fields['Fecha activación']&&delGrupo(r)).length;

  const altasQ=conFecha.filter(r=>{
    const f=new Date(r.fields['Fecha activación']+'T12:00:00');
    return f>=inicio&&f<=fin;
  });
  document.getElementById('bq-altas').textContent=altasQ.length;
  document.getElementById('bq-altas-sub').textContent=`Q${q} ${anio}${grupoFil?` · ${grupoFil}`:''}`;

  document.getElementById('bq-personas').textContent=personasUnicasQ(altasQ);

  const ranking=rankingBenefQ(altasQ);
  // "Más usado" por personas distintas y no por cantidad de filas: una fila no
  // significa lo mismo en cada beneficio (ver rankingBenefQ).
  const top=beneficioMasUsadoQ(ranking);
  document.getElementById('bq-top').textContent=top?top.nombre:'—';
  document.getElementById('bq-top-sub').textContent=top
    ?`${top.personas} persona${top.personas!==1?'s':''} · ${top.altas} alta${top.altas!==1?'s':''}`
    :'Sin altas en este período';

  const cont=document.getElementById('benefq-ranking-container');
  if(!cont) return;
  if(!ranking.length){
    cont.innerHTML='<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px;">Sin altas registradas en este trimestre.</div>';
    return;
  }
  const totalAltas=altasQ.length;
  const totalPersonas=personasUnicasQ(altasQ);
  cont.innerHTML=`${avisoCargasQ(altasQ)}
  <table class="data-table"><thead><tr><th>Beneficio</th><th>Altas en el Q</th><th title="Entre paréntesis, qué parte de la gente con alta en el Q recibió este beneficio">Personas</th><th title="Qué parte de las altas del trimestre es este beneficio">% de las altas</th></tr></thead><tbody>
    ${ranking.map(({nombre,altas,personas,retroactivas,porGrupo})=>{
      const pct=totalAltas?Math.round(altas/totalAltas*100):0;
      // Con un grupo elegido, desglosar sería repetir el mismo número.
      const desglose=grupoFil?'':desgloseGrupoTexto(porGrupo);
      const cobertura=coberturaBenefQ(personas,totalPersonas);
      return`<tr><td>${nombre}</td>
      <td style="font-weight:600">${altas}${retroactivas?`<span style="font-weight:400;font-size:11px;color:var(--text3)" title="Se cargaron más de ${DIAS_CARGA_RETROACTIVA} días después de la fecha que declaran"> · ${retroactivas} retro</span>`:''}</td>
      <td style="font-weight:600">${personas}${cobertura?`<span style="font-weight:400;font-size:11px;color:var(--text3)" title="De las ${totalPersonas} personas con alta en el Q"> · ${cobertura}%</span>`:''}${desglose?`<div style="font-weight:400;font-size:11px;color:var(--text3)">${desglose}</div>`:''}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;max-width:140px;height:6px;background:var(--border);border-radius:3px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--blue);border-radius:3px"></div></div>
          <span style="font-size:12px;color:var(--text2)">${pct}%</span>
        </div>
      </td></tr>`;
    }).join('')}
  </tbody></table>`;
}

// ─── Cómo leer el ranking del trimestre ───────────────────────────────────────
// Una fila de Beneficios Asignados no significa lo mismo en cada beneficio:
// Blogposts genera una por publicación (una persona con 4 posts son 4 altas) y
// Udemy una por curso, mientras que Terapia o Clases de Inglés generan UNA sola
// por persona que dura todo el año. Contando filas, los beneficios que se
// registran por unidad encabezan el ranking por cómo se cargan y no por cuánta
// gente los usa. Por eso cada fila muestra también las personas distintas, que
// sí se puede comparar entre beneficios.
function personasUnicasQ(altasQ){
  const personas=new Set();
  (altasQ||[]).forEach(r=>{
    const nombre=normalizarNombre(valorVinculado(r.fields?.Persona));
    if(nombre) personas.add(nombre);
  });
  return personas.size;
}

// A qué grupo pertenece una asignación: el de la PERSONA que la recibió. El
// campo Grupo del catálogo dice a quién le corresponde el beneficio —y "Ambos"
// no distingue nada—, así que no sirve para medir quién lo usó.
// Devuelve '' si la persona no está en el caché: mejor no clasificarla que
// meterla en el grupo equivocado (getRolGroup manda todo lo que no reconoce a
// Engineers, y un nombre que no matchea caería ahí en silencio).
function grupoDeAsignacion(r){
  const nombre=normalizarNombre(valorVinculado(r?.fields?.Persona));
  if(!nombre) return '';
  const persona=(cachePersonasRaw||[]).find(p=>normalizarNombre(p.fields.Nombre)===nombre);
  return persona?getRolGroup(persona.fields['Rol en empresa']||''):'';
}

// "3 Eng · 1 Core" debajo de las personas, para ver la división sin tener que
// cambiar el selector y comparar de memoria. Vacío si todas son del mismo
// grupo: ahí el número de arriba ya lo dice.
function desgloseGrupoTexto(porGrupo){
  const eng=porGrupo?.Engineers||0;
  const core=porGrupo?.['Core Team']||0;
  if(!eng||!core) return '';
  return `${eng} Eng · ${core} Core`;
}

function rankingBenefQ(altasQ){
  const porBenef=new Map();
  (altasQ||[]).forEach(r=>{
    const nombre=valorVinculado(r.fields?.Beneficio);
    if(!nombre) return;
    if(!porBenef.has(nombre)){
      porBenef.set(nombre,{nombre,altas:0,personas:new Set(),retroactivas:0,porGrupo:{}});
    }
    const entrada=porBenef.get(nombre);
    entrada.altas++;
    const persona=normalizarNombre(valorVinculado(r.fields?.Persona));
    if(persona&&!entrada.personas.has(persona)){
      entrada.personas.add(persona);
      // Se cuenta una vez por persona, no por fila: si no, cuatro blogposts de
      // la misma persona darían "4 Eng" al lado de "1 persona".
      const grupo=grupoDeAsignacion(r);
      if(grupo) entrada.porGrupo[grupo]=(entrada.porGrupo[grupo]||0)+1;
    }
    if(esAltaRetroactiva(r)) entrada.retroactivas++;
  });
  return [...porBenef.values()]
    .map(e=>({nombre:e.nombre,altas:e.altas,personas:e.personas.size,retroactivas:e.retroactivas,porGrupo:e.porGrupo}))
    .sort((a,b)=>b.altas-a.altas||b.personas-a.personas||a.nombre.localeCompare(b.nombre));
}

// La tarjeta "Beneficio más usado" se resuelve por personas distintas: es la
// única de las dos cifras que compara peras con peras.
// Las dos cifras del ranking son porcentajes de cosas distintas y se estaban
// leyendo como la misma: "1 persona · 4%" hacía pensar que ese 4% era de gente,
// cuando el 4% es la porción de las ALTAS del trimestre (1 de 25). El de gente
// es otro: 1 de 21 personas con alta en el Q = 5%.
//
// La columna dice ahora "% de las altas" (suma 100%) y la cobertura va al lado
// de las personas: qué parte de la gente con alta en el Q recibió ese
// beneficio. Esta NO suma 100%, porque una persona puede recibir varios.
function coberturaBenefQ(personas,totalPersonas){
  if(!personas||!totalPersonas) return 0;
  return Math.round(personas/totalPersonas*100);
}

function beneficioMasUsadoQ(ranking){
  if(!(ranking||[]).length) return null;
  return [...ranking].sort((a,b)=>b.personas-a.personas||b.altas-a.altas||a.nombre.localeCompare(b.nombre))[0];
}

// ─── Altas cargadas retroactivamente ──────────────────────────────────────────
// El trimestre se calcula con la Fecha activación, que es la fecha del hecho.
// Pero subir histórico crea hoy registros que declaran fechas de antes, y si
// esa fecha cae en el trimestre que se está mirando, se mezclan con las altas
// reales del período sin ninguna marca.
//
// Airtable devuelve en cada registro cuándo se creó (createdTime) y el Hub lo
// venía ignorando. La distancia entre esa fecha y la que declara el registro
// separa una cosa de la otra: cargar un beneficio el día que se da deja días de
// diferencia; subir el histórico de dos años deja meses.
//
// No dice que el dato esté mal —un blogpost de julio cargado en septiembre es
// correcto y también sale marcado— dice que el registro no se cargó en el
// momento, que es justo lo que hay que saber antes de leer el ranking como uso
// del trimestre.
const DIAS_CARGA_RETROACTIVA=30;

function diasEntreActivacionYCarga(r){
  const activacion=r?.fields?.['Fecha activación'];
  const creado=r?.createdTime;
  if(!activacion||!creado) return null;
  const msActivacion=new Date(activacion+'T12:00:00').getTime();
  const msCreado=new Date(creado).getTime();
  if(isNaN(msActivacion)||isNaN(msCreado)) return null;
  const dias=Math.round((msCreado-msActivacion)/86400000);
  // La fecha de activación se ancla al mediodía, así que una carga hecha esa
  // misma mañana da una diferencia negativa chiquita que redondea a -0. Son
  // cero días, no "menos cero".
  return dias===0?0:dias;
}

function esAltaRetroactiva(r,dias=DIAS_CARGA_RETROACTIVA){
  const distancia=diasEntreActivacionYCarga(r);
  return distancia!=null&&distancia>dias;
}

// La distancia entre las dos fechas no alcanza sola: si la carga de histórico
// puso como Fecha activación el día en que se subió, el registro declara una
// fecha de este trimestre Y se creó ese mismo día, así que no se marca como
// retroactivo aunque el hecho sea viejo. Lo que delata esa carga es otra cosa:
// un montón de altas creadas todas el mismo día.
//
// Se pide un mínimo absoluto y además que sea una porción grande del trimestre,
// para no avisar por un martes en que People Ops cargó cinco beneficios.
const MIN_ALTAS_MISMO_DIA=5;
const PCT_ALTAS_MISMO_DIA=0.3;

function diaDeCarga(r){ return (r?.createdTime||'').slice(0,10); }

function mayorCargaEnBloqueQ(altasQ,minimo=MIN_ALTAS_MISMO_DIA,porcion=PCT_ALTAS_MISMO_DIA){
  const total=(altasQ||[]).length;
  if(!total) return null;
  const porDia=new Map();
  (altasQ||[]).forEach(r=>{
    const dia=diaDeCarga(r);
    if(dia) porDia.set(dia,(porDia.get(dia)||0)+1);
  });
  let mayor=null;
  porDia.forEach((cantidad,dia)=>{
    if(cantidad<minimo||cantidad<total*porcion) return;
    if(!mayor||cantidad>mayor.cantidad) mayor={dia,cantidad};
  });
  return mayor;
}

function avisoCargasQ(altasQ){
  const total=(altasQ||[]).length;
  const retro=(altasQ||[]).filter(r=>esAltaRetroactiva(r)).length;
  const bloque=mayorCargaEnBloqueQ(altasQ);
  if(!retro&&!bloque) return '';
  const frases=[];
  if(retro){
    frases.push(`<b>${retro} de ${total} altas</b> se cargaron retroactivamente: el registro se creó más de ${DIAS_CARGA_RETROACTIVA} días después de la fecha que declara.`);
  }
  if(bloque){
    frases.push(`<b>${bloque.cantidad} de ${total}</b> se cargaron todas el mismo día (${fmt(bloque.dia)}).`);
  }
  return `<div class="benefq-aviso-cargas" style="display:flex;gap:8px;align-items:flex-start;margin:0 0 10px;padding:10px 12px;border-radius:10px;background:var(--chip-amber-bg);color:var(--chip-amber-text);font-size:12px;line-height:1.5">
    <i class="ti ti-history" style="font-size:15px;flex-shrink:0;margin-top:1px"></i>
    <span>${frases.join(' ')} Suele pasar al subir histórico, y hace que el ranking no se lea como el uso real del período.</span>
  </div>`;
}

function renderBenefMetricas(){
  const activos=cacheBeneficiosRaw.filter(r=>(r.fields.Estado||'Activo')==='Activo').length;
  document.getElementById('mb-activos').textContent=activos;

  // Presupuesto total usado = suma de valores de beneficios asignados activos
  const totalUsado=sumarMontosAsignados(
    cacheBenefAsignados.filter(a=>(a.fields.Estado||'Activo')==='Activo'));
  // "Resto del equipo", HR y Manager ven el catálogo/asignaciones de su
  // grupo, pero no el agregado de gasto total — se oculta la tarjeta entera
  // (no solo el número) para no dejar la etiqueta sin nada al lado. TEM y
  // Full sí lo ven.
  const presupuestoEl=document.getElementById('mb-presupuesto');
  const presupuestoCard=presupuestoEl?.closest('.metric');
  if(['equipo','hr','manager'].includes(rolUsuarioActual())){
    if(presupuestoCard) presupuestoCard.style.display='none';
  } else {
    if(presupuestoCard) presupuestoCard.style.display='';
    if(presupuestoEl) presupuestoEl.textContent=totalUsado>0?`$${totalUsado.toLocaleString('es-AR')}`:'—';
  }

  // Personas con/sin beneficios — solo sobre el equipo activo hoy, igual
  // criterio (yaEgreso) que el resto de las vistas de Beneficios.
  const nombresActivos=new Set(cachePersonasRaw.filter(p=>!yaEgreso(p)).map(p=>(p.fields.Nombre||'').trim()));
  const personasConBenef=new Set(cacheBenefAsignados.filter(a=>(a.fields.Estado||'Activo')==='Activo').map(a=>{
    const nombre=Array.isArray(a.fields.Persona)?a.fields.Persona[0]:a.fields.Persona;
    return (nombre||'').trim();
  }).filter(nombre=>nombresActivos.has(nombre)));
  const totalPersonas=nombresActivos.size;
  document.getElementById('mb-personas').textContent=personasConBenef.size;
  document.getElementById('mb-personas-sub').textContent=`de ${totalPersonas} en el equipo`;
  document.getElementById('mb-sinbenef').textContent=Math.max(0,totalPersonas-personasConBenef.size);
}


// Niveles Loyalty en orden
function tieneAccesoBeneficio(nivelPersona, nivelBeneficio){
  if(!nivelBeneficio||nivelBeneficio==='Todos') return true;
  const idxPersona=LOYALTY_ORDER.indexOf(nivelPersona);
  const idxBenef=LOYALTY_ORDER.indexOf(nivelBeneficio);
  return idxPersona>=idxBenef;
}
// Color + ícono por categoría, para que las tarjetas del catálogo se
// distingan de un vistazo (ver diseño "Catálogo de beneficios" en
// claude.ai/design). "Otro" usa un tinte neutro fijo porque no tiene un par
// de variables temáticas propio como el resto.
const CATEGORIA_ESTILO={
  'Salud':{tinte:'var(--tinte-eng)',accent:'var(--blue)',icon:'ti-heart'},
  'Bienestar':{tinte:'var(--tinte-core)',accent:'var(--purple)',icon:'ti-brain'},
  'Aprendizaje':{tinte:'var(--tinte-teal)',accent:'var(--text-teal-accent)',icon:'ti-school'},
  'Tiempo':{tinte:'var(--tinte-pink)',accent:'var(--text-pink-accent)',icon:'ti-beach'},
};
const CATEGORIA_OTRO={tinte:'rgba(139,147,167,0.14)',accent:'var(--text3)',icon:'ti-package'};
function estiloCategoria(cat){ return CATEGORIA_ESTILO[cat]||CATEGORIA_OTRO; }

function filtrarBeneficios(){
  renderBenefCatalogo();
}

// Limpiar un filtro puntual desde su chip, o todos de una con "Limpiar todo"
// (no toca el buscador de texto libre ni el filtro de "Beneficio" puntual,
// que ya dejan el catálogo reducido por su cuenta).
function limpiarFiltroBenefCatalogo(campo){
  const el=document.getElementById(`benef-${campo}`);
  if(el) el.value='';
  renderBenefCatalogo();
}
function limpiarTodosFiltrosBenefCatalogo(){
  ['grupo','cat','loyalty','estado'].forEach(campo=>{
    const el=document.getElementById(`benef-${campo}`);
    if(el) el.value='';
  });
  renderBenefCatalogo();
}

function renderBenefCatalogo(){
  const q=(document.getElementById('benef-search')?.value||'').toLowerCase();
  const nombreFil=document.getElementById('benef-nombre')?.value||'';
  const grupo=document.getElementById('benef-grupo')?.value||'';
  const cat=document.getElementById('benef-cat')?.value||'';
  const loyalty=document.getElementById('benef-loyalty')?.value||'';
  const estado=document.getElementById('benef-estado')?.value||'';

  let recs=cacheBeneficiosRaw.filter(r=>{
    const f=r.fields;
    const g=f.Grupo||'Ambos';
    const matchQ=!q||(f.Beneficio||'').toLowerCase().includes(q)||(f.Descripción||'').toLowerCase().includes(q);
    const matchNombre=!nombreFil||f.Beneficio===nombreFil;
    const matchG=!grupo||g===grupo||g==='Ambos';
    const matchC=!cat||(f.Categoría||'')=== cat;
    // Filtro loyalty: mostrar beneficios accesibles desde ese nivel o superiores
    const matchL=!loyalty||tieneAccesoBeneficio(loyalty, f['Nivel Loyalty']||'Todos');
    const matchE=!estado||(f.Estado||'Activo')===estado;
    return matchQ&&matchNombre&&matchG&&matchC&&matchL&&matchE;
  });

  document.getElementById('badge-beneficios-h').textContent=`${recs.length} beneficios`;

  const chipsCont=document.getElementById('benef-chips-container');
  if(chipsCont){
    const chips=[];
    if(grupo) chips.push({campo:'grupo',label:grupo});
    if(cat) chips.push({campo:'cat',label:cat});
    if(loyalty) chips.push({campo:'loyalty',label:`Nivel: ${loyalty}`});
    if(estado) chips.push({campo:'estado',label:estado});
    if(chips.length){
      chipsCont.style.display='flex';
      chipsCont.innerHTML=`<span style="font-size:12px;color:var(--text3);font-weight:500">Filtros activos:</span>`
        +chips.map(c=>`<button onclick="limpiarFiltroBenefCatalogo('${c.campo}')" style="display:flex;align-items:center;gap:6px;padding:5px 8px 5px 12px;border-radius:999px;border:1px solid var(--chip-eng);background:var(--tinte-eng);color:var(--text-eng-accent);font-family:'Plus Jakarta Sans',sans-serif;font-size:12px;font-weight:600;cursor:pointer;">${c.label}<i class="ti ti-x" style="font-size:12px"></i></button>`).join('')
        +`<button onclick="limpiarTodosFiltrosBenefCatalogo()" style="background:none;border:none;color:var(--text3);font-size:12px;font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:2px;">Limpiar todo</button>`;
    } else {
      chipsCont.style.display='none';
      chipsCont.innerHTML='';
    }
  }

  // Agrupar por grupo para render dividido
  const engineers=recs.filter(r=>{const g=r.fields.Grupo||'Ambos';return g==='Engineers'||g==='Ambos';});
  const coreTeam=recs.filter(r=>{const g=r.fields.Grupo||'Ambos';return g==='Core Team'||g==='Ambos';});

  // seccionGrupo es el grupo de la sección donde se está pintando esta
  // tarjeta (Engineers o Core Team) — un beneficio "Ambos" aparece en las
  // dos secciones, así que el modal de "quién lo tiene" de cada una se
  // acota a su propio grupo (si no, mostraría los dos grupos mezclados).
  function benefCard(r,seccionGrupo){
    const f=r.fields;
    const g=f.Grupo||'Ambos';
    const nivel=f['Nivel Loyalty']||'';
    const valor=montoCatalogoBenef(f);
    const activo=(f.Estado||'Activo')==='Activo';
    const est=estiloCategoria(f.Categoría);
    const statusBg=activo?'var(--chip-green-bg)':'var(--chip-amber-bg)';
    const statusFg=activo?'var(--chip-green-text)':'var(--chip-amber-text)';
    const statusDot=activo?'var(--green)':'var(--amber)';
    return`<div class="tr-clickable" onclick="abrirBenefDetalleModal('${r.id}','${seccionGrupo}')" style="position:relative;background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:16px;overflow:hidden;">
      <div style="position:absolute;inset:0 auto 0 0;width:3px;background:${est.accent}"></div>
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px">
        <div style="width:40px;height:40px;border-radius:11px;display:flex;align-items:center;justify-content:center;background:${est.tinte}">
          <i class="ti ${est.icon}" style="font-size:19px;color:${est.accent}"></i>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:999px;font-size:11px;font-weight:600;background:${statusBg};color:${statusFg}">
            <span style="width:6px;height:6px;border-radius:999px;background:${statusDot}"></span>${activo?'Activo':'Inactivo'}
          </span>
          <button onclick="event.stopPropagation();editarBeneficio('${r.id}')" title="Editar beneficio" style="background:none;border:none;cursor:pointer;color:var(--text3);padding:2px;line-height:1;flex-shrink:0;"><i class="ti ti-pencil" style="font-size:15px"></i></button>
        </div>
      </div>
      <div style="font-size:14.5px;font-weight:700;color:var(--text);margin-bottom:4px">${f.Beneficio||'—'}</div>
      <div style="font-size:12px;line-height:1.5;color:var(--text3);margin-bottom:12px;min-height:32px">${f.Descripción||''}</div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-top:12px;border-top:1px solid var(--border)">
        <span style="font-size:11px;font-weight:600;color:${est.accent};padding:3px 8px;border-radius:6px;background:${est.tinte}">${f.Categoría||'—'}</span>
        <span style="font-size:11px;font-weight:500;color:var(--text2);padding:3px 8px;border-radius:6px;background:var(--bg)">${(!nivel||nivel==='Todos')?'Todos los niveles':`desde ${nivel}`}</span>
        <span style="font-size:11px;font-weight:500;color:var(--text2);padding:3px 8px;border-radius:6px;background:var(--bg)">${g}</span>
        ${valor?`<span style="margin-left:auto;font-size:12px;font-weight:600;color:var(--text2)">${valor}</span>`:''}
      </div>
    </div>`;
  }

  const container=document.getElementById('benef-catalogo-container');
  if(!recs.length){
    container.innerHTML='<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px;">Sin resultados</div>';
    return;
  }

  const gridOpen='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;padding:16px 18px">';

  // Mismo tratamiento visual (tarjeta redondeada + header en degradado) que
  // ya usan los grupos de mes en Cumpleaños/Aniversarios — adentro, en vez de
  // una tabla, ahora va una grilla de tarjetas de beneficio.
  let html='';
  if(engineers.length){
    html+=`<div style="border-radius:10px;overflow:hidden;border:1px solid var(--border);margin:14px 14px 22px;">
      <div style="padding:14px 18px;background:linear-gradient(90deg,var(--tinte-eng) 0%,var(--bg2) 100%);border-left:3px solid var(--blue);display:flex;align-items:center;gap:12px;">
        <span style="font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--blue)">Engineers & Tech</span>
        <span style="flex:1;height:1px;background:var(--border)"></span>
        <span class="badge badge-blue">${engineers.length} beneficio${engineers.length!==1?'s':''}</span>
      </div>
      ${gridOpen}${engineers.map(r=>benefCard(r,'Engineers')).join('')}</div>
    </div>`;
  }
  if(coreTeam.length){
    html+=`<div style="border-radius:10px;overflow:hidden;border:1px solid var(--border);margin:0 14px 14px;">
      <div style="padding:14px 18px;background:linear-gradient(90deg,var(--tinte-core) 0%,var(--bg2) 100%);border-left:3px solid var(--purple);display:flex;align-items:center;gap:12px;">
        <span style="font-size:11px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--purple)">Core Team</span>
        <span style="flex:1;height:1px;background:var(--border)"></span>
        <span class="badge badge-purple">${coreTeam.length} beneficio${coreTeam.length!==1?'s':''}</span>
      </div>
      ${gridOpen}${coreTeam.map(r=>benefCard(r,'Core Team')).join('')}</div>
    </div>`;
  }
  container.innerHTML=html;
}

// grupoFiltro acota la lista de personas a Engineers/Core Team — clave para
// un beneficio "Ambos" (ej. clase de inglés), donde el catálogo tiene una
// sola tarjeta por grupo pero conviene poder ver solo quiénes de cada uno
// lo usan.
function personasActivasBeneficio(nombreBeneficio,grupoFiltro,temFiltro){
  return cacheBenefAsignados.filter(a=>{
    const bNombre=typeof a.fields.Beneficio==='string'?a.fields.Beneficio:(Array.isArray(a.fields.Beneficio)?a.fields.Beneficio[0]:'');
    if(bNombre!==nombreBeneficio||(a.fields.Estado||'Activo')!=='Activo') return false;
    const nombrePersona=typeof a.fields.Persona==='string'?a.fields.Persona:(Array.isArray(a.fields.Persona)?a.fields.Persona[0]:'');
    if(!personaActiva(nombrePersona)) return false;
    if(grupoFiltro==='Engineers'||grupoFiltro==='Core Team'){
      const persona=(cachePersonasRaw||[]).find(p=>(p.fields.Nombre||'').trim()===(nombrePersona||'').trim());
      if(!persona||getRolGroup(persona.fields['Rol en empresa']||'')!==grupoFiltro) return false;
    }
    if(temFiltro&&managerDePersona(nombrePersona)!==temFiltro) return false;
    return true;
  });
}

// Clickear una tarjeta del catálogo abre este modal con la lista de personas
// que tienen ese beneficio activo (Beneficios Asignados) — reemplaza el
// expand-inline que tenía la vista de tabla, que no tiene dónde "empujar"
// contenido en una grilla de tarjetas.
function abrirBenefDetalleModal(id,seccionGrupo){
  const r=cacheBeneficiosRaw.find(b=>b.id===id);
  if(!r) return;
  benefDetalleActual={r,grupoFiltro:seccionGrupo};
  document.getElementById('benef-detalle-titulo').textContent=r.fields.Beneficio||'—';
  poblarSelectorTEM('benef-detalle-tem');
  document.getElementById('benef-detalle-tem').value='';
  document.getElementById('benef-detalle-body').innerHTML=contenidoBenefDetalle(r,seccionGrupo,'');
  document.getElementById('benef-detalle-overlay').style.display='flex';
}
function cerrarBenefDetalleModal(){
  document.getElementById('benef-detalle-overlay').style.display='none';
  benefDetalleActual=null;
}
// Re-renderiza el detalle abierto cuando se cambia el select de TEM, sin
// volver a abrir el modal (benefDetalleActual guarda el beneficio/grupo vigente).
function filtrarBenefDetalle(){
  if(!benefDetalleActual) return;
  const temFiltro=document.getElementById('benef-detalle-tem')?.value||'';
  document.getElementById('benef-detalle-body').innerHTML=
    contenidoBenefDetalle(benefDetalleActual.r,benefDetalleActual.grupoFiltro,temFiltro);
}
function contenidoBenefDetalle(r,grupoFiltro,temFiltro){
  const activos=personasActivasBeneficio(r.fields.Beneficio,grupoFiltro,temFiltro);
  if(!activos.length){
    const sufijoGrupo=(grupoFiltro==='Engineers'||grupoFiltro==='Core Team')?` de ${grupoFiltro}`:'';
    return `<div style="color:var(--text3);font-size:12px;">Nadie${sufijoGrupo} tiene este beneficio activo en este momento.</div>`;
  }
  const items=activos.map(a=>{
    const nombre=typeof a.fields.Persona==='string'?a.fields.Persona:(Array.isArray(a.fields.Persona)?a.fields.Persona[0]:'—');
    const monto=a.fields.Monto?`$${Number(a.fields.Monto).toLocaleString('es-AR')}`:'';
    const extra=[a.fields.Frecuencia,a.fields['Profesional Asignado'],a.fields.Curso,a.fields.Quarter].filter(Boolean).join(' · ');
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">${avH(nombre)}<span style="font-size:13px">${nombre}</span>${extra?`<span style="font-size:11px;color:var(--text3)">(${extra})</span>`:''}${monto?`<span style="margin-left:auto;font-size:12px;color:var(--text3)">${monto}</span>`:''}</div>`;
  }).join('');
  return `<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text3);margin-bottom:8px;">${activos.length} persona${activos.length!==1?'s':''} usando este beneficio</div>${items}`;
}

// Editar un beneficio ya existente en el catálogo (no una asignación puntual
// a una persona — para eso está editarBenefAsignado en side-panel.js). Mismos
// campos que "Nuevo beneficio" (FORMS['beneficios']) más el Estado, que ahí
// se fuerza a "Activo" al crear y acá sí se puede pasar a "Inactivo".
// ─── UNIFICAR DOS BENEFICIOS DEL CATÁLOGO ─────────────────────────────────────
// El catálogo es un espejo de la tabla Beneficios: si hay cinco tarjetas de AI
// Tools es porque hay cinco registros. Borrarlos a mano en Airtable deja sin
// vínculo a las asignaciones que les apuntaban (en el Hub pasan a verse como
// "—" y dejan de contar como mensuales), así que el borrado no es el problema:
// el problema es mover primero lo que cuelga de ellos.
//
// Esto hace las dos cosas en orden: repunta cada asignación al beneficio que
// queda y recién entonces elimina el registro. Si alguna no se puede mover, no
// borra nada.
//
// Solo para el rol full, y no por prolijidad: HR lee "Beneficios Asignados"
// filtrado a Core Team (ver api/airtable.js), así que al unificar un beneficio
// de Engineers vería cero asignaciones que mover y borraría el registro
// dejándolas huérfanas. Full ve las dos.
function puedeUnificarBeneficios(){ return rolUsuarioActual()==='full'; }

// Dos registros se pueden llamar igual — es justamente el caso que motivó
// esto. El nombre solo no alcanza para elegir a cuál unificar, así que la
// opción agrega grupo y valor para distinguirlos.
function opcionUnificarLabel(b){
  const f=b.fields||{};
  const partes=[f.Grupo||'Ambos'];
  if(f.Valor) partes.push(`$${Number(f.Valor).toLocaleString('es-AR')}`);
  if((f.Estado||'Activo')!=='Activo') partes.push('Inactivo');
  return `${f.Beneficio||'—'} · ${partes.join(' · ')}`;
}

function bloqueUnificarHtml(r){
  if(!puedeUnificarBeneficios()) return '';
  const otros=(cacheBeneficiosRaw||[]).filter(b=>b.id!==r.id)
    .sort((a,b)=>(a.fields.Beneficio||'').localeCompare(b.fields.Beneficio||''));
  if(!otros.length) return '';
  return `
<div style="border-top:1px solid var(--border);margin-top:16px;padding-top:14px">
  <label class="field-label">Unificar con otro beneficio</label>
  <div class="field-hint" style="font-size:11px;color:var(--text3);padding:0 0 8px">
    Mueve las asignaciones de este beneficio al que elijas y después elimina esta tarjeta del catálogo. Sirve para dejar una sola card cuando quedaron variantes del mismo beneficio.
  </div>
  <select class="field-input" id="f-eb-unificar-destino">
    <option value="">Elegí el beneficio que queda…</option>
    ${otros.map(b=>`<option value="${b.id}">${opcionUnificarLabel(b)}</option>`).join('')}
  </select>
  <button type="button" onclick="unificarBeneficio('${r.id}')" style="margin-top:8px;width:100%;padding:8px;border-radius:9px;border:1px solid var(--critical);background:none;color:var(--critical);font-family:'Plus Jakarta Sans',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer">
    <i class="ti ti-arrow-merge"></i> Unificar y eliminar esta tarjeta
  </button>
</div>`;
}

// Las asignaciones que cuelgan de un beneficio, por ID y no por nombre:
// cacheBenefAsignados ya resolvió el campo Beneficio a texto, y con dos
// registros que se llaman igual el nombre no distingue cuál es cuál.
function asignacionesDeBeneficio(records,benefId){
  return (records||[]).filter(r=>{
    const campo=r.fields?.Beneficio;
    const ids=Array.isArray(campo)?campo:(campo?[campo]:[]);
    return ids.includes(benefId);
  });
}

// Qué se le escribe a una asignación que cambia de beneficio. Si el nombre
// viejo decía algo que el nuevo no dice —"AI Tools – Claude" contra "AI
// Tools"— ese dato se pierde al repuntar, así que se guarda en Comentarios.
// Un comentario ya cargado no se pisa: lo escribió alguien a propósito.
function camposUnificarAsignacion(asignacion,destinoId,nombreOrigen,nombreDestino){
  const fields={Beneficio:[destinoId]};
  const comentario=(asignacion.fields?.Comentarios||'').trim();
  if(!comentario&&nombreOrigen&&nombreOrigen!==nombreDestino) fields.Comentarios=nombreOrigen;
  return fields;
}

async function unificarBeneficio(id){
  if(!puedeUnificarBeneficios()){ toast('Solo People Ops puede unificar beneficios',true); return; }
  const destinoId=document.getElementById('f-eb-unificar-destino')?.value||'';
  if(!destinoId){ toast('Elegí con qué beneficio unificar',true); return; }
  if(destinoId===id){ toast('Elegí un beneficio distinto',true); return; }
  const origen=(cacheBeneficiosRaw||[]).find(b=>b.id===id);
  const destino=(cacheBeneficiosRaw||[]).find(b=>b.id===destinoId);
  if(!origen||!destino){ toast('No se encontró el beneficio',true); return; }
  const nombreOrigen=(origen.fields.Beneficio||'').trim();
  const nombreDestino=(destino.fields.Beneficio||'').trim();

  let asignaciones=[];
  try{
    // Crudo de Airtable y no del cache: acá el campo Beneficio llega como
    // array de IDs, que es lo único que distingue dos registros homónimos.
    const d=await atGet('Beneficios Asignados');
    asignaciones=asignacionesDeBeneficio(d.records,id);
  }catch(e){
    toast('No se pudieron leer las asignaciones: '+e.message,true);
    return;
  }

  // "asignación" pierde la tilde en plural: sumarle "es" da "asignaciónes".
  const n=asignaciones.length;
  const detalle=n
    ? `${n} ${n===1?'asignación pasa':'asignaciones pasan'} a "${nombreDestino}"`
    : 'No tiene asignaciones cargadas';
  const nota=asignaciones.length&&nombreOrigen!==nombreDestino
    ? ` Las que no tengan comentario van a guardar "${nombreOrigen}" ahí, para no perder el dato.`
    : '';
  showConfirm(
    'Unificar beneficio',
    `${detalle}, y después "${nombreOrigen}" se elimina del catálogo.${nota} No se puede deshacer.`,
    async()=>{
      const fallidas=[];
      for(const a of asignaciones){
        try{
          await atPatch(`Beneficios Asignados/${a.id}`,camposUnificarAsignacion(a,destinoId,nombreOrigen,nombreDestino));
        }catch(e){
          fallidas.push(a.id);
        }
      }
      // Si quedó alguna sin mover, no se borra nada: borrar acá dejaría esas
      // asignaciones colgando de un registro que ya no existe, que es
      // exactamente lo que este flujo evita.
      if(fallidas.length){
        toast(`Se movieron ${asignaciones.length-fallidas.length} de ${asignaciones.length}. No se eliminó nada — reintentá.`,true);
        await loadBeneficios();
        return;
      }
      try{
        await atDelete('Beneficios',id);
      }catch(e){
        toast('Las asignaciones se movieron, pero no se pudo eliminar la tarjeta: '+e.message,true);
        await loadBeneficios();
        return;
      }
      closeModal();
      toast(`"${nombreOrigen}" unificado con "${nombreDestino}" ✓`);
      await loadBeneficios();
    }
  );
}

function editarBeneficio(id){
  const r=cacheBeneficiosRaw.find(b=>b.id===id);
  if(!r) return;
  const f=r.fields;
  _openFormModal({
    title:`Editar — ${f.Beneficio||'beneficio'}`,
    html:()=>`
<div class="field-group"><label class="field-label">Nombre *</label><input class="field-input" id="f-eb-nombre" value="${(f.Beneficio||'').replace(/"/g,'&quot;')}"></div>
<div class="field-group"><label class="field-label">Grupo</label>
  <select class="field-input" id="f-eb-grupo">
    <option value="Ambos"${(f.Grupo||'Ambos')==='Ambos'?' selected':''}>Ambos grupos</option>
    <option value="Engineers"${f.Grupo==='Engineers'?' selected':''}>Engineers</option>
    <option value="Core Team"${f.Grupo==='Core Team'?' selected':''}>Core Team</option>
  </select>
</div>
<div class="field-group"><label class="field-label">Categoría</label>
  <select class="field-input" id="f-eb-cat">
    ${['Salud','Bienestar','Aprendizaje','Tiempo','Equipamiento','Otro'].map(c=>`<option${f.Categoría===c?' selected':''}>${c}</option>`).join('')}
  </select>
</div>
<div class="field-group"><label class="field-label">Nivel mínimo Loyalty</label>
  <select class="field-input" id="f-eb-loyalty">
    <option value=""${!f['Nivel Loyalty']||f['Nivel Loyalty']==='Todos'?' selected':''}>Todos los niveles</option>
    <option value="Spark"${f['Nivel Loyalty']==='Spark'?' selected':''}>⚡ Spark</option>
    <option value="Ray"${f['Nivel Loyalty']==='Ray'?' selected':''}>☀️ Ray</option>
    <option value="Lightning"${f['Nivel Loyalty']==='Lightning'?' selected':''}>🌩 Lightning</option>
    <option value="Thunder"${f['Nivel Loyalty']==='Thunder'?' selected':''}>🌪 Thunder</option>
    <option value="Storm"${f['Nivel Loyalty']==='Storm'?' selected':''}>🌊 Storm</option>
  </select>
</div>
<div class="field-group"><label class="field-label">Valor mensual ($)</label><input class="field-input" id="f-eb-valor" type="number" min="0" value="${f.Valor||''}" placeholder="Dejá vacío si no tiene valor fijo"></div>
<div class="field-group"><label class="field-label">Descripción</label><textarea class="field-input" id="f-eb-desc" placeholder="Breve descripción del beneficio">${f.Descripción||''}</textarea></div>
<div class="field-group"><label class="field-label">Estado</label>
  <select class="field-input" id="f-eb-estado">
    <option value="Activo"${(f.Estado||'Activo')==='Activo'?' selected':''}>Activo</option>
    <option value="Inactivo"${f.Estado==='Inactivo'?' selected':''}>Inactivo</option>
  </select>
</div>
${bloqueUnificarHtml(r)}`,
    save:async()=>{
      const v=id2=>document.getElementById(id2)?.value||'';
      if(!v('f-eb-nombre')){toast('El nombre es obligatorio',true);return false;}
      const fields={
        Beneficio:v('f-eb-nombre'),
        Grupo:v('f-eb-grupo'),
        Categoría:v('f-eb-cat'),
        Descripción:v('f-eb-desc'),
        Estado:v('f-eb-estado')||'Activo',
        'Nivel Loyalty':v('f-eb-loyalty')||null,
        Valor:v('f-eb-valor')?Number(v('f-eb-valor')):null,
      };
      await atPatch(`Beneficios/${id}`,fields);
      return true;
    },
  });
}

// Filtra en vivo el select de Persona del form de asignación a medida que se
// tipea en el buscador — evita tener que scrollear una lista larga.
function filtrarPersonaAsignacion(){
  const q=(document.getElementById('f-ba-persona-buscar')?.value||'').toLowerCase();
  const sel=document.getElementById('f-ba-persona');
  if(!sel) return;
  const actual=sel.value;
  const nombres=[...new Set((cachePersonasRaw||[]).map(p=>p.fields.Nombre||'').filter(Boolean))].sort();
  const filtrados=q?nombres.filter(n=>n.toLowerCase().includes(q)):nombres;
  sel.innerHTML='<option value="">Seleccioná una persona…</option>'+filtrados.map(n=>`<option value="${n}"${n===actual?' selected':''}>${n}</option>`).join('');
  if(!filtrados.includes(actual)) actualizarBeneficiosPorPersona();
}

// Filtra el select de Beneficio según el grupo (Engineers/Core Team) de la
// persona elegida en el form de asignación — así no se ofrecen beneficios
// que no le corresponden a su grupo.
function actualizarBeneficiosPorPersona(){
  const nombrePersona=document.getElementById('f-ba-persona')?.value||'';
  const persona=cachePersonasRaw.find(p=>(p.fields.Nombre||'').trim()===nombrePersona.trim());
  const grupo=persona?getRolGroup(persona.fields['Rol en empresa']||''):null;
  const activos=cacheBeneficiosRaw.filter(b=>(b.fields.Estado||'Activo')==='Activo');
  const filtrados=grupo?activos.filter(b=>{const g=b.fields.Grupo||'Ambos';return g==='Ambos'||g===grupo;}):activos;
  const nombres=filtrados.map(b=>b.fields.Beneficio||'').filter(Boolean).sort();
  const sel=document.getElementById('f-ba-beneficio');
  if(!sel) return;
  const actual=sel.value;
  sel.innerHTML='<option value="">Seleccioná un beneficio…</option>'+nombres.map(n=>`<option value="${n}"${n===actual?' selected':''}>${n}</option>`).join('');
  const hint=document.getElementById('f-ba-beneficio-hint');
  if(hint) hint.textContent=grupo?`Mostrando beneficios de ${grupo}`:'Elegí una persona para filtrar por su grupo';
  if(!nombres.includes(actual)){ actualizarMontoBenef(); toggleCamposTerapia(); toggleCamposLink(); toggleCamposComentarios(); }
}

// Terapia es el único beneficio que hoy necesita datos extra al asignarlo
// (Frecuencia y Profesional asignado) — se identifica por nombre en vez de
// por un campo aparte en el catálogo, ya que es un caso puntual.
function esBeneficioTerapia(nombreBeneficio){
  return (nombreBeneficio||'').trim().toLowerCase()==='terapia';
}
function toggleCamposTerapia(){
  const nombre=document.getElementById('f-ba-beneficio')?.value||'';
  const fg=document.getElementById('fg-ba-terapia');
  if(fg) fg.style.display=esBeneficioTerapia(nombre)?'block':'none';
}
// Udemy necesita Curso y Link al asignarlo — O'Reilly y Pluralsight en la
// práctica nunca cargan un link, así que no se les pide (piden Enterprise:
// no hay nada individual que enlazar). El Quarter de los tres se calcula
// solo a partir de la Fecha activación (ver quarterLabel en utils.js), sin
// tipearlo, aunque no tengan campos propios en el formulario.
// Las tildes se convierten a su letra base (normalize NFD + quitar los signos
// diacríticos) en vez de borrarse: con el replace a secas, "Inglés" quedaba
// como "ingls" y no matcheaba contra "ingles". Para los beneficios sin tildes
// (Udemy, Blogpost) el resultado es el mismo que antes.
function normalizarBeneficioKey(nombreBeneficio){
  return (nombreBeneficio||'').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]/g,'');
}
// startsWith y no igualdad exacta: en el catálogo el beneficio figura como
// "Udemy" en unos registros y como "Udemy Courses" en otros (y el histórico de
// ex BEONers trae las dos formas). Con la comparación exacta, la variante con
// sufijo se quedaba sin el trato de compra puntual y volvía a mostrar
// "Activo desde" y "/año".
function esBeneficioUdemy(nombreBeneficio){
  return normalizarBeneficioKey(nombreBeneficio).startsWith('udemy');
}
function esBeneficioConQuarterAuto(nombreBeneficio){
  return esBeneficioUdemy(nombreBeneficio)||esBeneficioCredenciales(nombreBeneficio);
}
// Blogpost no es un beneficio anual como el resto: se paga por cada publicación.
// Por eso el monto va sin "/año", la fecha es la de publicación (y no un
// "activo desde"), y lleva el link al post — ver los helpers de presentación en
// js/side-panel.js.
function esBeneficioBlogpost(nombreBeneficio){
  const k=normalizarBeneficioKey(nombreBeneficio);
  return k==='blogpost'||k==='blogposts';
}
// O'Reilly y Pluralsight no son un beneficio que "esté activo": lo que se hace
// es compartir las credenciales de una licencia. Por eso la fecha dice cuándo
// se compartieron, y volver a compartirlas (porque cambió la contraseña) es
// una renovación del mismo acceso, no un segundo beneficio activo.
// Los campos Persona/Beneficio de una asignación son linked records: llegan
// como array de un elemento, salvo cuando loadBeneficios ya los resolvió a
// texto. El patrón estaba repetido en media docena de lugares.
function valorVinculado(campo){
  return typeof campo==='string'?campo:(Array.isArray(campo)?campo[0]||'':'');
}
// Lo que aporta una asignación al gasto ANUAL: su Monto propio si está cargado,
// si no el Valor del catálogo.
//
// Los mensuales (AI Tools) van por 12: el monto cargado es lo que sale por mes
// —se carga una sola vez, nadie anota nada cada mes— así que sumarlo tal cual
// contaba USD 20 al año donde el gasto real son 240. La card sigue mostrando el
// monto mensual, que es como se habla del beneficio; acá se anualiza solo para
// el presupuesto.
function montoDeAsignacion(a,catalogo){
  const bNombre=valorVinculado(a.fields.Beneficio);
  const propio=a.fields.Monto
    ?Number(a.fields.Monto)||0
    :Number((catalogo||cacheBeneficiosRaw||[]).find(b=>b.fields.Beneficio===bNombre)?.fields?.Valor)||0;
  return esBeneficioMensual(bNombre)?propio*12:propio;
}
// Total usado. O'Reilly/Pluralsight se pagan UNA sola vez por persona: volver
// a compartirle las credenciales (porque cambió la contraseña) deja otra
// asignación cargada, pero no es otro gasto. Sin esta deduplicación, cada
// recompartida inflaba el presupuesto usado de esa persona y el total del
// equipo. Entre las asignaciones del mismo acceso se toma el monto más alto,
// que es el que tiene el dato cuando las otras quedaron en blanco.
function sumarMontosAsignados(asignaciones,catalogo){
  let total=0;
  const credenciales=new Map();
  (asignaciones||[]).forEach(a=>{
    const monto=montoDeAsignacion(a,catalogo);
    const bNombre=valorVinculado(a.fields.Beneficio);
    if(!esBeneficioCredenciales(bNombre)){ total+=monto; return; }
    const clave=`${normalizarNombre(valorVinculado(a.fields.Persona))}|${normalizarBeneficioKey(bNombre)}`;
    credenciales.set(clave,Math.max(credenciales.get(clave)||0,monto));
  });
  credenciales.forEach(m=>{ total+=m; });
  return total;
}
// Valor de una tarjeta del catálogo. La tarjeta escribía "/mes" para todos, así
// que Terapia ($600 al año) se leía como $600 por mes y el Hardware Bonus
// ($500 de tope por única vez) como un gasto mensual — el mismo problema que ya
// se había arreglado en la card de cada persona, pero del lado del catálogo.
// Cada beneficio dice en qué unidad está su Valor:
//   AI Tools → por mes · Hardware Bonus → tope de única vez
//   por unidad (Udemy, Certifications, credenciales) → lo que sale cada uno
//   el resto (Terapia, Clases de Inglés…) → cupo anual
function montoCatalogoBenef(f){
  const valor=Number(f?.Valor||0);
  if(!valor) return '';
  const nombre=f.Beneficio||'';
  const cifra=`$${valor.toLocaleString('es-AR')}`;
  if(esBeneficioMensual(nombre)) return `${cifra}/mes`;
  if(esBeneficioOneTime(nombre)) return `${cifra} de tope`;
  return esBeneficioPorUnidad(nombre)?`${cifra} c/u`:`${cifra}/año`;
}
function esBeneficioCredenciales(nombreBeneficio){
  const k=normalizarBeneficioKey(nombreBeneficio);
  return k==='oreilly'||k==='pluralsight';
}
// Clases de Inglés: el beneficio más consultado, así que encabeza la lista del
// detalle de cada persona (ver ordenarBenefAsignados en js/side-panel.js).
function esBeneficioIngles(nombreBeneficio){
  const k=normalizarBeneficioKey(nombreBeneficio);
  return k.includes('ingles')||k.includes('english');
}
// El campo Link lo comparten Udemy (link al curso) y Blogpost (link al post).
// "Curso" en cambio es solo de Udemy.
function esBeneficioConLink(nombreBeneficio){
  return esBeneficioUdemy(nombreBeneficio)||esBeneficioBlogpost(nombreBeneficio);
}
function toggleCamposLink(){
  const nombre=document.getElementById('f-ba-beneficio')?.value||'';
  const fgLink=document.getElementById('fg-ba-link');
  if(fgLink) fgLink.style.display=esBeneficioConLink(nombre)?'block':'none';
  const fgCurso=document.getElementById('fg-ba-curso');
  if(fgCurso) fgCurso.style.display=esBeneficioUdemy(nombre)?'block':'none';
}
// Certifications necesita un espacio libre al asignarlo: qué certificación es,
// si la rinde en una fecha puntual, si el monto es estimado… No entra en un
// campo estructurado como los de Terapia o Udemy, porque cada certificación es
// un caso distinto. normalizarBeneficioKey saca espacios, tildes y mayúsculas,
// así que matchea "Certifications", "certifications" o "Certification".
// AI Tools se cobra POR MES, no por año: son USD 20 mensuales. Mostrarlo con
// "/año" hacía leer el costo anual donde está el mensual.
function esBeneficioMensual(nombreBeneficio){
  return normalizarBeneficioKey(nombreBeneficio).startsWith('aitools');
}
// Hardware Bonus es de única vez, con un tope que se puede ir gastando en
// varias compras hasta agotarlo (una silla hoy, un monitor en dos meses). No es
// un cupo que se renueve cada año, así que no lleva "/año"; y como las compras
// suman contra el mismo tope, se agrupan igual que los beneficios por unidad.
function esBeneficioOneTime(nombreBeneficio){
  return normalizarBeneficioKey(nombreBeneficio).startsWith('hardware');
}
// Beneficios que se pagan por unidad y no por año: el monto es lo que costó
// ESA cosa concreta —un curso de Udemy, una certificación, una publicación, una
// compra del Hardware Bonus— y no un cupo anual. Mostrarlos con "/año" dice
// algo que no es cierto, y encima engaña al leer varias asignaciones juntas
// (tres cursos de Udemy no son tres montos anuales, son tres compras).
//
// El resto (Terapia, Clases de Inglés…) sí son anuales y conservan el sufijo.
// Ver montoBenefAsignado() en js/side-panel.js.
function esBeneficioPorUnidad(nombreBeneficio){
  // esBeneficioConQuarterAuto ya agrupa a Udemy, O'Reilly y Pluralsight, y por
  // el mismo motivo: son compras puntuales que se imputan al trimestre en que
  // se hicieron. Reusarlo evita mantener dos listas con los mismos tres
  // nombres que después se desincronizan.
  return esBeneficioConQuarterAuto(nombreBeneficio)
    ||esBeneficioBlogpost(nombreBeneficio)
    ||esBeneficioCertifications(nombreBeneficio)
    ||esBeneficioOneTime(nombreBeneficio);
}
// En Airtable este beneficio aparece con varios nombres según quién lo cargó
// ("Certifications", "Courses/Certifications", "Cursos y Certificaciones"), y
// el histórico de ex BEONers suma las variantes viejas. Se matchea por la raíz
// "certific" en vez de una lista cerrada de nombres, más "Courses"/"Cursos"
// sueltos. La comparación exacta con "courses" deja afuera a "Udemy Courses",
// que es otro beneficio.
function esBeneficioCertifications(nombreBeneficio){
  const k=normalizarBeneficioKey(nombreBeneficio);
  return k.includes('certific')||k==='courses'||k==='cursos';
}
// El comentario libre lo necesitan los beneficios donde cada asignación es un
// caso distinto: qué certificación es, qué se compró con el Hardware Bonus y
// cuánto queda del tope, o qué herramienta usa cada uno ahora que AI Tools es
// una sola card del catálogo y no una por herramienta. No entra en un campo
// estructurado como los de Terapia o Udemy.
function esBeneficioConComentario(nombreBeneficio){
  return esBeneficioCertifications(nombreBeneficio)
    ||esBeneficioOneTime(nombreBeneficio)
    ||esBeneficioMensual(nombreBeneficio);
}
function toggleCamposComentarios(){
  const nombre=document.getElementById('f-ba-beneficio')?.value||'';
  const fg=document.getElementById('fg-ba-comentarios');
  if(fg) fg.style.display=esBeneficioConComentario(nombre)?'block':'none';
}
function actualizarMontoBenef(){
  const sel=document.getElementById('f-ba-beneficio');
  if(!sel) return;
  const nombre=sel.value;
  const benef=cacheBeneficiosRaw.find(b=>b.fields.Beneficio===nombre);
  const montoInput=document.getElementById('f-ba-monto');
  if(montoInput&&benef?.fields.Valor){
    montoInput.value=Number(benef.fields.Valor);
    montoInput.placeholder='Valor del catálogo (podés modificarlo)';
  } else if(montoInput){
    montoInput.value='';
    montoInput.placeholder='Ingresá el monto para esta persona';
  }
}

// Atajo desde la tabla "Por persona" — abre el mismo form de "Asignar
// beneficio" pero con la persona ya elegida (y el select de Beneficio ya
// filtrado por su grupo), para no tener que volver a buscarla ahí.
function abrirAsignarBeneficioPara(nombre){
  _openFormModal({
    ...FORMS['beneficios-asignados'],
    onMount:()=>{
      filtrarPersonaAsignacion();
      const sel=document.getElementById('f-ba-persona');
      if(sel) sel.value=nombre;
      actualizarBeneficiosPorPersona();
    },
  });
}

// Mismos atajos que abrirAsignarBeneficioPara — se usan desde los estados
// vacíos de la tarjeta de detalle de persona (ver verBenefPersona() en
// side-panel.js) para no tener que volver a buscar a la persona ahí.
function abrirRegistrarAWPara(nombre){
  _openFormModal({...FORMS['ambassadors'], onMount:()=>{
    const sel=document.getElementById('f-aw-persona');
    if(sel) sel.value=nombre;
  }});
}
function abrirRegistrarOffSitePara(nombre){
  _openFormModal({...FORMS['offsites'], onMount:()=>{
    const sel=document.getElementById('f-os-persona');
    if(sel) sel.value=nombre;
  }});
}
function abrirRegistrarGetTogetherPara(nombre){
  _openFormModal({...FORMS['gettogether'], onMount:()=>{
    const sel=document.getElementById('f-gt-persona');
    if(sel) sel.value=nombre;
  }});
}

function filtrarBenefPersonas(){ pagBenefPersonas.page=0; renderBenefPersonas(); }

function cambiarPaginaBenefPersonas(dir){
  pagBenefPersonas.page=Math.max(0,pagBenefPersonas.page+dir);
  renderBenefPersonas();
  document.getElementById('benef-tab-personas')?.scrollIntoView({behavior:'smooth',block:'start'});
}

// Filtro de permanencia de la tabla "Por persona":
//   ''      → el equipo de hoy (lo de siempre, y lo que ve quien no toca nada)
//   'ex'    → solo quienes ya no están en BEON
//   'todos' → el histórico completo
// Es solo de visualización: las métricas y el presupuesto del equipo siguen
// contando únicamente a la gente activa (ver renderBenefMetricas), así que
// mirar el histórico no mueve ningún número.
function coincideEstadoBenefPersona(p,estadoFil){
  if(estadoFil==='todos') return true;
  return estadoFil==='ex'?yaEgreso(p):!yaEgreso(p);
}

// Chip "Ex BEONer" con la fecha de fin, para que al ver el histórico se
// distinga de un vistazo a quién sigue en el equipo. Vacío para quien está
// activo: en la vista por defecto no aparece nada nuevo.
function badgeExBeonerHtml(p){
  if(!yaEgreso(p)) return '';
  const hasta=p.fields['Fecha de egreso'];
  return `<span class="badge badge-gray" style="margin-left:6px;font-size:10px" title="Ya no trabaja en BEON">Ex BEONer${hasta?` · hasta ${fmt(hasta)}`:''}</span>`;
}

// Qué decir cuando no hay filas. "Sin resultados" a secas hacía pensar que la
// persona no estaba cargada, cuando lo que pasaba es que el filtro de
// permanencia la dejaba afuera — el caso típico es buscar a alguien que ya no
// está en BEON con la vista por defecto.
function textoVacioBenefPersonas(estadoFil,coincideFiltros){
  if(estadoFil==='todos') return 'Sin resultados';
  const ocultos=(cachePersonasRaw||[]).filter(p=>!coincideEstadoBenefPersona(p,estadoFil)&&coincideFiltros(p)).length;
  if(!ocultos) return 'Sin resultados';
  return `Sin resultados. Hay ${ocultos} ${ocultos===1?'persona que coincide':'personas que coinciden'} en «Todos (histórico)».`;
}

function renderBenefPersonas(){
  const q=(document.getElementById('benef-persona-search')?.value||'').toLowerCase();
  // HR solo puede ver Core Team acá — se fuerza el filtro sin importar lo
  // que diga el selector (que además queda deshabilitado, ver
  // aplicarRestriccionesBeneficios()).
  const grupoFil=rolUsuarioActual()==='hr'?'Core Team':(document.getElementById('benef-persona-grupo')?.value||'');
  const loyaltyFil=document.getElementById('benef-persona-loyalty')?.value||'';
  const temFil=document.getElementById('benef-persona-tem')?.value||'';
  // Quién entra en la lista. Por defecto ('') solo el equipo de hoy, que es
  // como venía funcionando: las métricas, el presupuesto y esta tabla hablan
  // del equipo activo. El histórico de quienes ya no están sigue cargado en
  // Airtable y ahora se puede ver acá, pero hay que pedirlo — así no se mezcla
  // con el día a día ni infla los números de nadie.
  const estadoFil=document.getElementById('benef-persona-estado')?.value||'';

  // Construir mapa de topes por grupo+nivel desde cachePresupuestoLoyalty
  const topeMap={};
  cachePresupuestoLoyalty.forEach(r=>{
    const g=r.fields.Grupo||'', n=r.fields.Nivel||'', t=Number(r.fields['Tope anual beneficios']||0);
    topeMap[`${g}|${n}`]=t;
  });

  // Los filtros de siempre, aparte del de permanencia: así se puede contar a
  // quién quedó afuera SOLO por ese último y avisarlo cuando la lista queda
  // vacía — buscar a alguien que ya no está en BEON devolvía "Sin resultados"
  // a secas, que se lee como "no está cargado" cuando en realidad está.
  const coincideFiltros=p=>{
    const nombre=(p.fields.Nombre||'').toLowerCase();
    const grupo=getRolGroup(p.fields['Rol en empresa']||'');
    // normalizarNivel y no el valor crudo: con un "Thunder " cargado con un
    // espacio de más, el filtro por nivel nunca matcheaba a esa persona.
    const nivel=normalizarNivel(p.fields['Nivel Loyalty']);
    return (!q||nombre.includes(q))
      &&(!grupoFil||grupo===grupoFil)
      &&(!loyaltyFil||nivel===loyaltyFil)
      &&(!temFil||(p.fields.Manager||'')===temFil);
  };
  const personas=cachePersonasRaw.filter(p=>coincideEstadoBenefPersona(p,estadoFil)&&coincideFiltros(p));

  document.getElementById('badge-benef-personas').textContent=
    `${personas.length} ${estadoFil==='ex'?'ex BEONers':'personas'}`;

  const bar=document.getElementById('pag-bar-benef-personas');
  const tb=document.getElementById('tbody-benef-personas');
  if(!personas.length){
    tb.innerHTML=`<tr class="empty-row"><td colspan="6">${textoVacioBenefPersonas(estadoFil,coincideFiltros)}</td></tr>`;
    if(bar) bar.style.display='none';
    return;
  }

  // Con el historial cargado, "Por persona" puede tener cientos de filas —
  // se pagina de a PAG_SIZE, mismo criterio que Engineers & Tech/Core Team.
  const totalPags=Math.ceil(personas.length/PAG_SIZE);
  if(pagBenefPersonas.page>=totalPags) pagBenefPersonas.page=totalPags-1;
  const inicio=pagBenefPersonas.page*PAG_SIZE, fin=Math.min(inicio+PAG_SIZE,personas.length);
  const personasPagina=personas.slice(inicio,fin);

  if(totalPags>1){
    if(bar) bar.style.display='flex';
    const info=document.getElementById('pag-info-benef-personas');
    if(info) info.textContent=`${inicio+1}–${fin} de ${personas.length} personas`;
    const btnPrev=document.getElementById('pag-prev-benef-personas');
    const btnNext=document.getElementById('pag-next-benef-personas');
    if(btnPrev) btnPrev.disabled=pagBenefPersonas.page===0;
    if(btnNext) btnNext.disabled=pagBenefPersonas.page>=totalPags-1;
  } else {
    if(bar) bar.style.display='none';
  }

  tb.innerHTML=personasPagina.map((p,idx)=>{
    const f=p.fields;
    const nombre=f.Nombre||'—';
    const grupo=getRolGroup(f['Rol en empresa']||'');
    // Crudo, un nivel con espacios rompía tres cosas a la vez: la clave del
    // topeMap no matcheaba (tope 0 → "Sin tope"), tieneAccesoBeneficio() no
    // reconocía el nivel, y el badge caía a gris con ícono de medalla.
    const nivel=normalizarNivel(f['Nivel Loyalty']);
    const tope=topeMap[`${grupo}|${nivel}`]||0;

    // Beneficios accesibles según nivel + asignados activos
    const beneficiosAccesibles=cacheBeneficiosRaw.filter(b=>{
      const g=b.fields.Grupo||'Ambos';
      const grupoOk=g===grupo||g==='Ambos';
      const nivelOk=tieneAccesoBeneficio(nivel, b.fields['Nivel Loyalty']||'Todos');
      return grupoOk&&nivelOk&&(b.fields.Estado||'Activo')==='Activo';
    });
    // Beneficios asignados activos para esta persona
    const asignados=cacheBenefAsignados.filter(a=>{
      const pNombre=typeof a.fields.Persona==='string'?a.fields.Persona:(Array.isArray(a.fields.Persona)?a.fields.Persona[0]:'');
      return pNombre.trim()===nombre.trim()&&(a.fields.Estado||'Activo')==='Activo';
    });

    const usado=sumarMontosAsignados(asignados);

    const pct=tope>0?Math.min(100,Math.round((usado/tope)*100)):0;
    const barColor=pct>=90?'var(--critical)':pct>=70?'var(--warning)':'var(--blue)';
    const usadoStr=usado>0?`$${usado.toLocaleString('es-AR')}`:'$0';
    const topeStr=tope>0?`$${tope.toLocaleString('es-AR')}`:'Sin tope';

    const grupoBadge=grupo==='Engineers'?'badge-blue':'badge-purple';
    const bg=idx%2===0?'background:var(--bg2)':'';
    const activeW=beneficiosAccesibles.length?Math.round(asignados.length/beneficiosAccesibles.length*100):0;

    return`<tr class="tr-clickable benef-per-tr" style="${bg}" onclick="verBenefPersona('${nombre.replace(/'/g,"\\'")}','${grupo}','${nivel}')">
      <td>${avH(nombre)}${nombre}${badgeExBeonerHtml(p)}</td>
      <td><span class="badge ${grupoBadge}">${grupo}</span></td>
      <td>${badgeNivelHtml(nivel,'badge benef-per-nivel-badge')}</td>
      <td style="font-size:13px">
        <span style="font-weight:600">${asignados.length}</span>
        <span style="color:var(--text3);font-size:11px"> asignados / ${beneficiosAccesibles.length} disponibles</span>
        <div class="benef-per-bar-track"><div class="benef-per-bar-fill" style="width:${activeW}%"></div></div>
      </td>
      <td style="min-width:180px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:5px;background:var(--border);border-radius:3px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${barColor};border-radius:3px;transition:width 0.3s"></div>
          </div>
          <span style="font-size:12px;color:${pct>=90?'var(--critical)':pct>=70?'var(--warning)':'var(--text2)'};font-weight:${pct>=70?'600':'400'};white-space:nowrap">${usadoStr} / ${topeStr}</span>
        </div>
      </td>
      <td style="white-space:nowrap">
        <div class="benef-per-actions">
          <button class="benef-per-ver-btn" onclick="event.stopPropagation();verBenefPersona('${nombre.replace(/'/g,"\'")}','${grupo}','${nivel}')">Ver<i class="ti ti-arrow-right"></i></button>
          <button class="benef-per-asignar-btn" onclick="event.stopPropagation();abrirAsignarBeneficioPara('${nombre.replace(/'/g,"\'")}')"><i class="ti ti-plus"></i>Asignar</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}
