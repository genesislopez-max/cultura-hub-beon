// Helper para leer campo Edición AW con o sin acento
function getEdicionAW(fields){
  // Intentar todas las variantes posibles del nombre del campo
  const val=fields['Edición AW']||fields['Édición AW']||fields['Edicion AW']||fields['edición AW']||fields['Edición/Destino']||'';
  // Si es array (single select puede venir así), tomar el primer elemento
  if(Array.isArray(val)) return val[0]||'';
  return val;
}

// Calcular % de vuelo cubierto según historial
function calcPctVuelo(nombre, nivel, historial){
  const regla=AW_RULES[nivel]||AW_RULES.Spark;
  if(nivel==='Storm') return 50;
  // Contar cuántas veces anteriores fue con 50%
  const vecesPrevias=historial.filter(r=>{
    const p=typeof r.fields.Persona==='string'?r.fields.Persona:(Array.isArray(r.fields.Persona)?r.fields.Persona[0]:'');
    return p.trim()===nombre.trim();
  }).length;
  return vecesPrevias<regla.asistenciasConVuelo?50:0;
}

async function loadAmbassadors(){
  const d=await atGet('Ambassador Week').catch(()=>({records:[]}));
  cacheAWRaw=(d.records||[]).map(r=>{
    const f={...r.fields};
    if(Array.isArray(f.Persona)){
      const id=f.Persona[0];
      const match=cachePersonasRaw.find(p=>p.id===id);
      f.Persona=match?match.fields.Nombre:id;
    }
    return {...r, fields:f};
  });
  renderAWMetricas();
  renderAWPersonas();
  renderAWHistorial();
}

function switchAWTab(tab,btn){
  document.querySelectorAll('#page-ambassadors .tab-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  document.getElementById('aw-tab-resumen').style.display=tab==='resumen'?'':'none';
  document.getElementById('aw-tab-historial').style.display=tab==='historial'?'':'none';
  const tabMetricas=document.getElementById('aw-tab-metricas');
  if(tabMetricas) tabMetricas.style.display=tab==='metricas'?'':'none';
  if(tab==='metricas'){
    const anios=cacheAWRaw.map(r=>parsearEdicionAW(getEdicionAW(r.fields))).filter(Boolean).map(f=>new Date(f+'T12:00:00').getFullYear());
    poblarSelectorAnio('awq-anio',anios);
    if(!awqInicializado){
      const hoy=new Date();
      document.getElementById('awq-anio').value=String(hoy.getFullYear());
      document.getElementById('awq-trimestre').value=String(Math.floor(hoy.getMonth()/3)+1);
      awqInicializado=true;
    }
    renderAWMetricasQ();
  }
}

// Ambassador Week no tiene un campo de fecha real — se infiere del texto de
// "Edición AW" (ver parsearEdicionAW en utils.js). Las asistencias cuya
// edición no se puede interpretar quedan afuera de cualquier Q.
function renderAWMetricasQ(){
  const anio=Number(document.getElementById('awq-anio')?.value)||new Date().getFullYear();
  const q=Number(document.getElementById('awq-trimestre')?.value)||1;
  const {inicio,fin}=rangoTrimestre(anio,q);

  let sinReconocer=0;
  const conFecha=cacheAWRaw.map(r=>{
    const fecha=parsearEdicionAW(getEdicionAW(r.fields));
    if(!fecha) sinReconocer++;
    return {r,fecha};
  }).filter(x=>x.fecha);
  document.getElementById('awq-sinfecha').textContent=sinReconocer;

  const enQ=conFecha.filter(({fecha})=>{
    const d=new Date(fecha+'T12:00:00');
    return d>=inicio&&d<=fin;
  }).map(({r})=>r);
  document.getElementById('awq-total').textContent=enQ.length;
  document.getElementById('awq-total-sub').textContent=`Q${q} ${anio}`;

  const personas=new Set(enQ.map(r=>Array.isArray(r.fields.Persona)?r.fields.Persona[0]:r.fields.Persona).filter(Boolean));
  document.getElementById('awq-personas').textContent=personas.size;

  const conteo={};
  enQ.forEach(r=>{
    const ed=getEdicionAW(r.fields);
    if(!ed) return;
    conteo[ed]=(conteo[ed]||0)+1;
  });
  const ranking=Object.entries(conteo).sort((a,b)=>b[1]-a[1]);
  const top=ranking[0];
  document.getElementById('awq-top').textContent=top?top[0]:'—';
  document.getElementById('awq-top-sub').textContent=top?`${top[1]} asistencia${top[1]!==1?'s':''} en el Q`:'Sin asistencias en este período';

  const cont=document.getElementById('awq-ranking-container');
  if(!cont) return;
  if(!ranking.length){
    cont.innerHTML='<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px;">Sin asistencias registradas en este trimestre.</div>';
    return;
  }
  const total=enQ.length;
  cont.innerHTML=`<table class="data-table"><thead><tr><th>Edición AW</th><th>Asistencias en el Q</th><th>% del total</th></tr></thead><tbody>
    ${ranking.map(([ed,cant])=>{
      const pct=total?Math.round(cant/total*100):0;
      return`<tr><td>${ed}</td><td style="font-weight:600">${cant}</td><td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;max-width:140px;height:6px;background:var(--border);border-radius:3px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--blue);border-radius:3px"></div></div>
          <span style="font-size:12px;color:var(--text2)">${pct}%</span>
        </div>
      </td></tr>`;
    }).join('')}
  </tbody></table>`;
}

function renderAWMetricas(){
  const total=cacheAWRaw.length;
  const personas=new Set();
  const ediciones=new Set();
  cacheAWRaw.forEach(r=>{
    const p=Array.isArray(r.fields.Persona)?r.fields.Persona[0]:r.fields.Persona;
    if(p) personas.add(p);
    const ed=getEdicionAW(r.fields);
    if(ed) ediciones.add(ed);
  });
  document.getElementById('aw-total').textContent=total;
  document.getElementById('aw-vuelos').textContent=ediciones.size||'—';
  document.getElementById('aw-aloja').textContent=personas.size;
  document.getElementById('aw-personas').textContent=personas.size;
  document.getElementById('aw-personas-sub').textContent=`de ${cachePersonasRaw.length} en el equipo`;
}

function previewAWPct(){
  const nombre=document.getElementById('f-aw-persona')?.value||'';
  const preview=document.getElementById('aw-pct-preview');
  if(!preview||!nombre) return;
  const persona=cachePersonasRaw.find(p=>p.fields.Nombre===nombre);
  const nivel=persona?.fields['Nivel Loyalty']||'Spark';
  const vecesPrev=cacheAWRaw.filter(r=>{
    const p=typeof r.fields.Persona==='string'?r.fields.Persona:(Array.isArray(r.fields.Persona)?r.fields.Persona[0]:'');
    return p.trim()===nombre.trim();
  }).length;
  const pct=calcPctVuelo(nombre,nivel,cacheAWRaw);
  const txt=pct===50
    ?`✅ Le corresponde <strong>50% del vuelo</strong> cubierto por BEON (${vecesPrev} asistencia${vecesPrev!==1?'s':''} previas · nivel ${nivel})`
    :`ℹ️ Ya no tiene cobertura de vuelo disponible (${vecesPrev} asistencia${vecesPrev!==1?'s':''} previas · nivel ${nivel}). BEON cubre solo el alojamiento.`;
  preview.innerHTML=txt;
  preview.style.color=pct===50?'var(--green)':'var(--amber)';
}

function openAWPerModal(nombre){
  const overlay=document.getElementById('aw-per-overlay');
  overlay.style.display='flex';

  // Info de la persona desde cachePersonasRaw
  const persona=cachePersonasRaw.find(p=>(p.fields.Nombre||'').trim()===nombre.trim());
  const pf=persona?.fields||{};
  const nivel=pf['Nivel Loyalty']||'Spark';
  const nivelColors2={'Spark':'badge-nivel-Spark','Ray':'badge-nivel-Ray','Lightning':'badge-nivel-Lightning','Thunder':'badge-nivel-Thunder','Storm':'badge-nivel-Storm'};

  document.getElementById('aw-per-nombre').textContent=nombre;
  document.getElementById('aw-per-subtitle').innerHTML=`<span class="badge ${nivelColors2[nivel]||'badge-gray'}">${nivel}</span>`;

  // Info grid
  const infoItems=[
    {label:'Mail',val:pf.Mail?`<a href="mailto:${pf.Mail}" style="color:var(--blue)">${pf.Mail}</a>`:'—'},
    {label:'TEM / Manager',val:pf.Manager||'—'},
    {label:'Proyecto',val:pf.Proyecto||'—'},
    {label:'Ingreso',val:fmt(pf['Fecha de ingreso'])||'—'},
  ];
  document.getElementById('aw-per-info').innerHTML=infoItems.map(({label,val})=>`
    <div>
      <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:3px">${label}</div>
      <div style="font-size:13px">${val}</div>
    </div>`).join('');

  // Historial de AW
  const asistencias=cacheAWRaw.filter(r=>{
    const p=Array.isArray(r.fields.Persona)?r.fields.Persona[0]:(r.fields.Persona||'');
    return p.trim()===nombre.trim();
  }).sort((a,b)=>(b.fields['Edición AW']||'').localeCompare(a.fields['Edición AW']||''));

  const regla=AW_RULES[nivel]||AW_RULES.Spark;
  const cobertura=nivel==='Storm'?'Ilimitadas · 50% vuelo':
    asistencias.length<regla.asistenciasConVuelo?
    `${regla.asistenciasConVuelo-asistencias.length} restante${regla.asistenciasConVuelo-asistencias.length!==1?'s':''} con 50% vuelo`:
    'Sin cobertura de vuelo disponible';

  let histHtml=`<div style="font-size:12px;font-weight:600;color:var(--text2);margin-bottom:10px;display:flex;justify-content:space-between">
    <span>Asistencias (${asistencias.length})</span>
    <span style="color:${nivel==='Storm'?'var(--green)':asistencias.length<regla.asistenciasConVuelo?'var(--blue)':'var(--amber)'}">${cobertura}</span>
  </div>`;

  if(asistencias.length){
    histHtml+=asistencias.map((r,idx)=>{
      const f=r.fields;
      const ed=f['Edición AW']||'—';
      const acomp=f['Acompañantes'];
      let pctRaw=f['Porcentaje cubierto'];
      const pct=pctRaw!=null?(pctRaw<=1?Math.round(pctRaw*100):Number(pctRaw)):null;
      const bg=idx%2===0?'background:var(--bg2)':'';
      return`<div style="padding:10px 0;border-bottom:0.5px solid var(--border);${bg}display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:13px;font-weight:500">${ed}</div>
          ${acomp?`<div style="font-size:11px;color:var(--text3)">${acomp} acompañante${acomp!==1?'s':''}</div>`:''}
        </div>
        <div style="font-size:12px;font-weight:600;color:${pct===50?'var(--blue)':pct===0?'var(--text3)':'var(--text2)'}">${pct!=null?pct+'% vuelo':'—'}</div>
      </div>`;
    }).join('');
  } else {
    histHtml+='<div style="color:var(--text3);font-size:13px">Sin asistencias registradas</div>';
  }

  document.getElementById('aw-per-historial').innerHTML=histHtml;
}

function closeAWPerModal(){
  document.getElementById('aw-per-overlay').style.display='none';
}

function filtrarAW(){ renderAWPersonas(); }
function filtrarAWHistorial(){ renderAWHistorial(); }

function renderAWPersonas(){
  const q=(document.getElementById('aw-search')?.value||'').toLowerCase();
  const loyaltyFil=document.getElementById('aw-loyalty')?.value||'';

  // Contar asistencias por persona
  const asistMap={};
  cacheAWRaw.forEach(r=>{
    const p=Array.isArray(r.fields.Persona)?r.fields.Persona[0]:r.fields.Persona;
    if(!p) return;
    if(!asistMap[p]) asistMap[p]={count:0,ediciones:[]};
    asistMap[p].count++;
    const ed=getEdicionAW(r.fields);
    if(ed) asistMap[p].ediciones.push(ed);
  });

  const personas=cachePersonasRaw.filter(p=>{
    const nombre=(p.fields.Nombre||'').toLowerCase();
    const nivel=p.fields['Nivel Loyalty']||'Spark';
    const matchQ=!q||nombre.includes(q);
    const matchL=!loyaltyFil||nivel===loyaltyFil;
    return !yaEgreso(p)&&matchQ&&matchL;
  });

  document.getElementById('aw-badge-personas').textContent=`${personas.length} personas`;
  const tb=document.getElementById('aw-tbody-personas');

  const nivelEmoji={'Spark':'⚡','Ray':'☀️','Lightning':'🌩','Thunder':'🌪','Storm':'🌊'};
  const nivelColors={'Spark':'badge-nivel-Spark','Ray':'badge-nivel-Ray','Lightning':'badge-nivel-Lightning','Thunder':'badge-nivel-Thunder','Storm':'badge-nivel-Storm'};

  tb.innerHTML=personas.map((p,idx)=>{
    const nombre=p.fields.Nombre||'—';
    const nivel=p.fields['Nivel Loyalty']||'Spark';
    const regla=AW_RULES[nivel]||AW_RULES.Spark;
    const data=asistMap[nombre]||{count:0,ediciones:[]};
    const veces=data.count;
    const edicionesStr=data.ediciones.slice(-2).join(', ')+(data.ediciones.length>2?` +${data.ediciones.length-2}`:'');

    // Calcular cobertura próxima vez
    let cobertura='', disponibles='';
    if(nivel==='Storm'){
      cobertura='50% vuelo + 100% alojamiento';
      disponibles='<span style="color:var(--green);font-weight:600">Ilimitadas</span>';
    } else {
      const maxConVuelo=regla.asistenciasConVuelo;
      if(veces<maxConVuelo){
        cobertura='50% vuelo + 100% alojamiento';
        const restantes=maxConVuelo-veces;
        disponibles=`<span style="color:var(--blue);font-weight:600">${restantes} con vuelo</span>`;
      } else {
        cobertura='100% alojamiento únicamente';
        disponibles='<span style="color:var(--amber)">Sin cobertura de vuelo</span>';
      }
    }

    const bg=idx%2===0?'background:var(--bg2)':'';
    return`<tr class="tr-clickable" style="${bg}" onclick="openAWPerModal(this.dataset.nombre)" data-nombre="${nombre.replace(/"/g,'&quot;')}">
      <td>${avH(nombre)}${nombre}</td>
      <td><span class="badge ${nivelColors[nivel]||'badge-gray'}">${nivel}</span></td>
      <td style="font-weight:600;font-size:15px">${veces}</td>
      <td style="font-size:12px;color:var(--text2)">${cobertura}</td>
      <td>${disponibles}</td>
      <td style="font-size:12px;color:var(--text2)">${edicionesStr||'—'}</td>
    </tr>`;
  }).join('') || '<tr class="empty-row"><td colspan="6">Sin resultados</td></tr>';
}

function renderAWHistorial(){
  const q=(document.getElementById('aw-hist-search')?.value||'').toLowerCase();

  const recs=cacheAWRaw.filter(r=>{
    const p=Array.isArray(r.fields.Persona)?r.fields.Persona[0]:(r.fields.Persona||'');
    const dest=getEdicionAW(r.fields);
    return !q||(p+dest).toLowerCase().includes(q);
  });

  document.getElementById('aw-badge-historial').textContent=`${recs.length} registros`;
  const tb=document.getElementById('aw-tbody-historial');
  const nivelEmoji={'Spark':'⚡','Ray':'☀️','Lightning':'🌩','Thunder':'🌪','Storm':'🌊'};
  const nivelColors={'Spark':'badge-nivel-Spark','Ray':'badge-nivel-Ray','Lightning':'badge-nivel-Lightning','Thunder':'badge-nivel-Thunder','Storm':'badge-nivel-Storm'};

  tb.innerHTML=recs.map((r,idx)=>{
    const f=r.fields;
    const nombre=Array.isArray(f.Persona)?f.Persona[0]:(f.Persona||'—');
    const persona=cachePersonasRaw.find(p=>p.fields.Nombre===nombre);
    const nivel=persona?.fields['Nivel Loyalty']||'Spark';
    const edicion=getEdicionAW(f)||'—';
    const acomp=f['Acompañantes'];
    // Normalizar porcentaje: puede venir como 0.5/1 (decimal) o 50/100 (entero)
    let pctRaw=f['Porcentaje cubierto'];
    let pct=pctRaw!=null?(pctRaw<=1?Math.round(pctRaw*100):Number(pctRaw)):null;
    const bg=idx%2===0?'background:var(--bg2)':'';
    return`<tr style="${bg}">
      <td>${avH(nombre)}${nombre}</td>
      <td><span class="badge ${nivelColors[nivel]||'badge-gray'}">${nivel}</span></td>
      <td style="font-size:12px">${edicion}</td>
      <td style="font-size:12px;color:var(--text2)">${acomp!=null?acomp+' acomp.':'—'}</td>
      <td style="font-weight:600;color:${pct===50?'var(--blue)':pct===0?'var(--text3)':'var(--text2)'}">${pct!=null?pct+'%':'—'}</td>
    </tr>`;
  }).join('') || '<tr class="empty-row"><td colspan="5">Sin registros</td></tr>';
}
