// ─── GET TOGETHER ─────────────────────────────────────────────────────────────
async function loadGetTogether(){
  const d=await atGet('Get Together','&sort[0][field]=Fecha&sort[0][direction]=desc').catch(()=>({records:[]}));
  cacheGetTogetherRaw=(d.records||[]).map(r=>{
    const f={...r.fields};
    // BEONer: linked record → resolver ID a nombre
    if(Array.isArray(f.BEONer)){
      const id=f.BEONer[0]||'';
      const match=cachePersonasRaw.find(p=>p.id===id);
      f.BEONer=match?match.fields.Nombre:id;
    }
    // Proyecto: linked record → resolver ID a nombre
    if(Array.isArray(f.Proyecto)){
      const id=f.Proyecto[0]||'';
      const match=(cacheProyectosRaw||[]).find(p=>p.id===id);
      f.Proyecto=match?match.fields.Proyecto:id;
    }
    // País y Ciudad: normalizar arrays
    if(Array.isArray(f['País'])) f['País']=f['País'][0]||'';
    if(Array.isArray(f.Ciudad)) f.Ciudad=f.Ciudad[0]||'';
    return {...r, fields:f};
  });
  renderGTMetricas();
  renderGTPersona();
  renderGTCiudad();
  renderGTHistorial();
  poblarGTFiltros();
}

function openGTCityModal(pais, ciudad){
  const overlay=document.getElementById('gt-city-overlay');
  overlay.style.display='flex';
  overlay.style.opacity='1';
  overlay.style.pointerEvents='all';
  document.getElementById('gt-city-title').textContent=ciudad;
  document.getElementById('gt-city-subtitle').textContent=pais;

  // Filtrar registros de esta ciudad+país
  const recs=cacheGetTogetherRaw.filter(r=>
    (r.fields['País']||'')=== pais && (r.fields.Ciudad||'')=== ciudad
  ).sort((a,b)=>(b.fields.Fecha||'').localeCompare(a.fields.Fecha||''));

  // Agrupar por fecha (encuentros distintos)
  const encuentros={};
  recs.forEach(r=>{
    const fecha=r.fields.Fecha||'sin fecha';
    if(!encuentros[fecha]) encuentros[fecha]=[];
    encuentros[fecha].push(r);
  });

  const totalPersonas=new Set(recs.map(r=>r.fields.BEONer||'')).size;

  let html=`<div style="font-size:13px;color:var(--text2);margin-bottom:20px;padding-bottom:12px;border-bottom:1px solid var(--border)">
    ${Object.keys(encuentros).length} encuentro${Object.keys(encuentros).length!==1?'s':''} · ${totalPersonas} BEONer${totalPersonas!==1?'s':''} distintos
  </div>`;

  Object.entries(encuentros).sort((a,b)=>b[0].localeCompare(a[0])).forEach(([fecha,gente])=>{
    html+=`<div style="margin-bottom:24px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:0.06em;text-transform:uppercase;padding:8px 0 8px;border-bottom:2px solid var(--border);margin-bottom:12px">
        ${fmt(fecha)} · ${gente.length} persona${gente.length!==1?'s':''}
      </div>
      ${gente.map(r=>{
        const nombre=r.fields.BEONer||'—';
        const proyecto=r.fields.Proyecto||'';
        return`<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
          ${avH(nombre)}
          <div style="display:flex;flex-direction:column;gap:2px">
            <div style="font-size:13px;font-weight:500;line-height:1.3">${nombre}</div>
            ${proyecto?`<div style="font-size:12px;color:var(--text3);line-height:1.3">${proyecto}</div>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
  });

  document.getElementById('gt-city-body').innerHTML=html;
}

function closeGTCityModal(){
  document.getElementById('gt-city-overlay').style.display='none';
}

function switchGTTab(tab,btn){
  document.querySelectorAll('#page-gettogether .tab-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  document.getElementById('gt-tab-persona').style.display=tab==='persona'?'':'none';
  document.getElementById('gt-tab-ciudad').style.display=tab==='ciudad'?'':'none';
  document.getElementById('gt-tab-historial').style.display=tab==='historial'?'':'none';
}

function renderGTMetricas(){
  const personas=new Set(), paises=new Set(), encuentros=new Set();
  cacheGetTogetherRaw.forEach(r=>{
    const f=r.fields;
    if(f.BEONer) personas.add(f.BEONer);
    if(f.País) paises.add(f.País);
    const key=`${f.Ciudad||''}|${f.Fecha||''}`;
    if(key!=='|') encuentros.add(key);
  });
  document.getElementById('gt-total').textContent=cacheGetTogetherRaw.length;
  document.getElementById('gt-personas').textContent=personas.size;
  document.getElementById('gt-encuentros').textContent=encuentros.size;
  document.getElementById('gt-paises').textContent=paises.size;
}

function poblarGTFiltros(){
  const paises=[...new Set(cacheGetTogetherRaw.map(r=>r.fields.País||'').filter(Boolean))].sort();
  const proyectos=[...new Set(cacheGetTogetherRaw.map(r=>r.fields.Proyecto||'').filter(Boolean))].sort();
  const paisOpts='<option value="">Todos los países</option>'+paises.map(p=>`<option value="${p}">${p}</option>`).join('');
  ['gt-filter-pais-per','gt-filter-pais-ciu','gt-filter-pais'].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.innerHTML=paisOpts;
  });
  const selProy=document.getElementById('gt-filter-proyecto');
  if(selProy) selProy.innerHTML='<option value="">Todos los proyectos</option>'+proyectos.map(p=>`<option value="${p}">${p}</option>`).join('');
}

function filtrarGTPersona(){ renderGTPersona(); }
function filtrarGTCiudad(){ renderGTCiudad(); }
function filtrarGTHistorial(){ renderGTHistorial(); }

function renderGTPersona(){
  const q=(document.getElementById('gt-search-persona')?.value||'').toLowerCase();
  const paisFil=document.getElementById('gt-filter-pais-per')?.value||'';
  const mapa={};
  cacheGetTogetherRaw.forEach(r=>{
    const f=r.fields;
    const nombre=f.BEONer||'';
    if(!nombre) return;
    if(paisFil&&(f.País||'')!==paisFil) return;
    if(!mapa[nombre]) mapa[nombre]={count:0,paises:new Set(),ciudades:new Set(),ultFecha:'',primerFecha:'9999'};
    mapa[nombre].count++;
    if(f['País']) mapa[nombre].paises.add(f['País']);
    if(f.Ciudad) mapa[nombre].ciudades.add(f.Ciudad);
    if(f.Fecha&&f.Fecha>mapa[nombre].ultFecha) mapa[nombre].ultFecha=f.Fecha;
    if(f.Fecha&&f.Fecha<mapa[nombre].primerFecha) mapa[nombre].primerFecha=f.Fecha;
  });
  const filas=Object.entries(mapa)
    .filter(([n])=>!q||n.toLowerCase().includes(q))
    .sort((a,b)=>b[1].count-a[1].count); // Ordenar por más encuentros
  document.getElementById('gt-badge-persona').textContent=`${filas.length} BEONers`;
  const tb=document.getElementById('gt-tbody-persona');
  tb.innerHTML=filas.map(([nombre,d],i)=>{
    const bg=i%2===0?'background:var(--bg2)':'';
    const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
    const paisesStr=[...d.paises].join(', ')||'—';
    return`<tr style="${bg}">
      <td style="font-size:16px;text-align:center;width:40px">${medal||`<span style="font-size:12px;color:var(--text3)">${i+1}</span>`}</td>
      <td>${avH(nombre)}${nombre}</td>
      <td><span style="font-weight:700;font-size:18px;color:var(--blue)">${d.count}</span></td>
      <td style="font-size:12px;color:var(--text2)">${paisesStr}</td>
      <td style="font-size:12px;color:var(--text3)">${fmt(d.primerFecha)}</td>
      <td style="font-size:12px;color:var(--text2)">${fmt(d.ultFecha)}</td>
    </tr>`;
  }).join('')||'<tr class="empty-row"><td colspan="6">Sin resultados</td></tr>';
}

function renderGTCiudad(){
  const q=(document.getElementById('gt-search-ciudad')?.value||'').toLowerCase();
  const paisFil=document.getElementById('gt-filter-pais-ciu')?.value||'';
  const mapa={};
  cacheGetTogetherRaw.forEach(r=>{
    const f=r.fields;
    const pais=f.País||'Sin país', ciudad=f.Ciudad||'Sin ciudad';
    const key=`${pais}||${ciudad}`;
    if(paisFil&&pais!==paisFil) return;
    if(!mapa[key]) mapa[key]={pais,ciudad,encuentros:new Set(),personas:new Set(),ultFecha:''};
    const enc=f.Fecha||'';
    if(enc) mapa[key].encuentros.add(enc);
    if(f.BEONer) mapa[key].personas.add(f.BEONer);
    if(f.Fecha&&f.Fecha>mapa[key].ultFecha) mapa[key].ultFecha=f.Fecha;
  });
  const filas=Object.values(mapa)
    .filter(d=>!q||(d.pais+d.ciudad).toLowerCase().includes(q))
    .sort((a,b)=>b.ultFecha.localeCompare(a.ultFecha));
  document.getElementById('gt-badge-ciudad').textContent=`${filas.length} ciudades`;
  const tb=document.getElementById('gt-tbody-ciudad');
  tb.innerHTML=filas.map((d,idx)=>{
    const bg=idx%2===0?'background:var(--bg2)':'';
    return`<tr class="tr-clickable" style="${bg}" onclick="openGTCityModal(this.dataset.pais,this.dataset.ciudad)" data-pais="${d.pais}" data-ciudad="${d.ciudad}">
      <td style="font-size:12px"><span class="badge badge-blue">${d.pais}</span></td>
      <td><strong>${d.ciudad}</strong></td>
      <td style="font-weight:600;color:var(--blue)">${d.encuentros.size}</td>
      <td style="font-size:12px;color:var(--text2)">${d.personas.size} BEONers</td>
      <td style="font-size:12px;color:var(--text2)">${fmt(d.ultFecha)}</td>
    </tr>`;
  }).join('')||'<tr class="empty-row"><td colspan="5">Sin resultados</td></tr>';
}

function renderGTHistorial(){
  const q=(document.getElementById('gt-search-hist')?.value||'').toLowerCase();
  const paisFil=document.getElementById('gt-filter-pais')?.value||'';
  const proyFil=document.getElementById('gt-filter-proyecto')?.value||'';
  const recs=cacheGetTogetherRaw.filter(r=>{
    const f=r.fields;
    const txt=`${f.BEONer||''} ${f.Ciudad||''} ${f.País||''} ${f.Proyecto||''}`.toLowerCase();
    return(!q||txt.includes(q))&&(!paisFil||(f.País||'')===paisFil)&&(!proyFil||(f.Proyecto||'')===proyFil);
  });
  document.getElementById('gt-badge-hist').textContent=`${recs.length} registros`;
  const tb=document.getElementById('gt-tbody-hist');
  tb.innerHTML=recs.map((r,idx)=>{
    const f=r.fields;
    const bg=idx%2===0?'background:var(--bg2)':'';
    return`<tr style="${bg}">
      <td>${avH(f.BEONer||'')}${f.BEONer||'—'}</td>
      <td style="font-size:12px"><span class="badge badge-blue">${f.País||'—'}</span></td>
      <td style="font-size:12px">${f.Ciudad||'—'}</td>
      <td style="font-size:12px;color:var(--text2)">${f.Proyecto||'—'}</td>
      <td style="font-size:12px;color:var(--text2)">${fmt(f.Fecha)}</td>
    </tr>`;
  }).join('')||'<tr class="empty-row"><td colspan="5">Sin registros</td></tr>';
}
