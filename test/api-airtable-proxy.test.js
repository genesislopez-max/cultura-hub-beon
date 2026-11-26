'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

process.env.AIRTABLE_TOKEN='tok123';
process.env.AIRTABLE_BASE='appXXX';
process.env.SESSION_SECRET='test-secret';

const {signSession}=require('../api/_lib/session');
const handler=require('../api/airtable');

// Con rol de escritura: los tests de acá abajo verifican cómo se reconstruye la
// URL de Airtable, no los permisos. Un token sin rol cae en "equipo", que desde
// el modo solo lectura ya no puede escribir (ver ROLES_PUEDEN_ESCRIBIR en
// api/airtable.js) y haría fallar el PATCH por un motivo ajeno al test.
const TOKEN=signSession({email:'gustavo@beon.tech',name:'Gustavo',rol:'full'});

function fakeRes(){
  const res={statusCode:200,headers:{},body:null};
  res.status=function(c){this.statusCode=c;return this;};
  res.json=function(obj){this.body=obj;return this;};
  res.setHeader=function(k,v){this.headers[k]=v;};
  res.send=function(text){this.body=text;return this;};
  return res;
}

function fakeAirtable(airtableRespuesta){
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push({url,opts});
    return airtableRespuesta;
  };
  return {calls,fetchImpl};
}

test('api/airtable: reconstruye la URL de Airtable a partir del query param path (con record ID)', async()=>{
  const {calls,fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({ok:true})});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:`Bearer ${TOKEN}`},method:'PATCH',query:{path:'Personas/rec123'},body:{fields:{Mail:'x@beon.tech'}}};
    const res=fakeRes();
    await handler(req,res);
    assert.equal(res.statusCode,200);
    const airtableCall=calls.find(c=>String(c.url).includes('api.airtable.com'));
    assert.equal(airtableCall.url,'https://api.airtable.com/v0/appXXX/Personas/rec123');
    assert.equal(airtableCall.opts.method,'PATCH');
  }finally{
    global.fetch=original;
  }
});

test('api/airtable: reconstruye query params extra (ej. sort[0][field]) preservando corchetes', async()=>{
  const {calls,fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:[]})});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:`Bearer ${TOKEN}`},method:'GET',query:{path:'Personas',pageSize:'100','sort[0][field]':'Nombre','sort[0][direction]':'asc'}};
    const res=fakeRes();
    await handler(req,res);
    const airtableCall=calls.find(c=>String(c.url).includes('api.airtable.com'));
    assert.match(airtableCall.url,/^https:\/\/api\.airtable\.com\/v0\/appXXX\/Personas\?/);
    const qs=new URL(airtableCall.url).searchParams;
    assert.equal(qs.get('pageSize'),'100');
    assert.equal(qs.get('sort[0][field]'),'Nombre');
  }finally{
    global.fetch=original;
  }
});

test('api/airtable: sin sesión válida devuelve 401 sin llamar a Airtable', async()=>{
  const calls=[];
  const original=global.fetch;
  global.fetch=async(url)=>{calls.push(String(url));return {ok:false};};
  try{
    const req={headers:{},method:'GET',query:{path:'Personas'}};
    const res=fakeRes();
    await handler(req,res);
    assert.equal(res.statusCode,401);
    assert.ok(!calls.some(u=>u.includes('api.airtable.com')));
  }finally{
    global.fetch=original;
  }
});

test('api/airtable: un token de sesión vencido devuelve 401', async()=>{
  const vencido=signSession({email:'gustavo@beon.tech',name:'Gustavo'},-1000);
  const req={headers:{authorization:`Bearer ${vencido}`},method:'GET',query:{path:'Personas'}};
  const res=fakeRes();
  await handler(req,res);
  assert.equal(res.statusCode,401);
});

// ─── Control de acceso por rol ───────────────────────────────────────────────
// Niveles: full (People/COO/Founder) > hr (Recruiting, grupoBeneficios fijo
// "Core Team") > tem (fijo "Engineers": acompaña a los devs) > manager (sin
// restricción de grupo) > equipo (su propio grupo). Ver api/_lib/roles.js.
const TOKEN_FULL=signSession({email:'people@beon.tech',name:'People',rol:'full'});
const TOKEN_HR=signSession({email:'hr@beon.tech',name:'HR',rol:'hr',grupoBeneficios:'Core Team'});
const TOKEN_TEM=signSession({email:'vicky@beon.tech',name:'Vicky',rol:'tem',grupoBeneficios:'Engineers'});
// Sesión de TEM firmada ANTES de que el rol quedara restringido: trae
// grupoBeneficios en null y el proxy tiene que acotarla igual, sin esperar a
// que venza (36 h) ni a que la persona vuelva a loguearse.
const TOKEN_TEM_VIEJO=signSession({email:'vicky@beon.tech',name:'Vicky',rol:'tem'});
const TOKEN_MANAGER=signSession({email:'lead@beon.tech',name:'Lead',rol:'manager'});
const TOKEN_EQUIPO_ENG=signSession({email:'ana@beon.tech',name:'Ana',rol:'equipo',grupoBeneficios:'Engineers'});
const TOKEN_EQUIPO_CORE=signSession({email:'beto@beon.tech',name:'Beto',rol:'equipo',grupoBeneficios:'Core Team'});
// Sesión firmada antes de este cambio — sin rol/grupoBeneficios en el payload.
const TOKEN_SIN_ROL=signSession({email:'viejo@beon.tech',name:'Viejo'});
const TOKEN_BLOQUEADO=signSession({email:'sinacceso@beon.tech',name:'Sin Acceso',rol:'bloqueado'});

test('api/airtable: rol "bloqueado" (Acceso="No access") — bloqueo total para cualquier tabla, sin llamar a Airtable', async()=>{
  const {calls,fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:[{id:'rec1'}]})});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const reqGet={headers:{authorization:`Bearer ${TOKEN_BLOQUEADO}`},method:'GET',query:{path:'Personas'}};
    const resGet=fakeRes();
    await handler(reqGet,resGet);
    assert.equal(resGet.statusCode,200);
    assert.deepEqual(resGet.body,{records:[]});

    const reqPost={headers:{authorization:`Bearer ${TOKEN_BLOQUEADO}`},method:'POST',query:{path:'Personas'},body:{fields:{}}};
    const resPost=fakeRes();
    await handler(reqPost,resPost);
    assert.equal(resPost.statusCode,403);

    assert.equal(calls.length,0,'no debería haber llamado a Airtable en ningún caso');
  }finally{
    global.fetch=original;
  }
});

test('api/airtable: Checklist (Ingresos/Egresos) — 200 con records vacíos para tem/manager/equipo, sin llamar a Airtable', async()=>{
  for(const token of [TOKEN_TEM,TOKEN_MANAGER,TOKEN_EQUIPO_ENG,TOKEN_SIN_ROL]){
    const {calls,fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:[{id:'rec1'}]})});
    const original=global.fetch;
    global.fetch=fetchImpl;
    try{
      const req={headers:{authorization:`Bearer ${token}`},method:'GET',query:{path:'Checklist'}};
      const res=fakeRes();
      await handler(req,res);
      assert.equal(res.statusCode,200);
      assert.deepEqual(res.body,{records:[]});
      assert.equal(calls.length,0);
    }finally{
      global.fetch=original;
    }
  }
});

test('api/airtable: Checklist — full y hr ven los datos reales', async()=>{
  for(const token of [TOKEN_FULL,TOKEN_HR]){
    const {calls,fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:[{id:'rec1'}]})});
    const original=global.fetch;
    global.fetch=fetchImpl;
    try{
      const req={headers:{authorization:`Bearer ${token}`},method:'GET',query:{path:'Checklist'}};
      const res=fakeRes();
      await handler(req,res);
      assert.equal(res.statusCode,200);
      assert.deepEqual(JSON.parse(res.body),{records:[{id:'rec1'}]});
      assert.equal(calls.length,1);
    }finally{
      global.fetch=original;
    }
  }
});

test('api/airtable: escribir en Checklist sin ser full/hr devuelve 403 (no 200 silencioso)', async()=>{
  const {calls,fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:[]})});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:`Bearer ${TOKEN_EQUIPO_ENG}`},method:'PATCH',query:{path:'Checklist/rec1'},body:{fields:{}}};
    const res=fakeRes();
    await handler(req,res);
    assert.equal(res.statusCode,403);
    assert.equal(calls.length,0);
  }finally{
    global.fetch=original;
  }
});

test('api/airtable: Eventos — Glassdoor es exclusivo de "full", el resto de los roles lo pierde pero conserva otros Tipo', async()=>{
  const eventos=[
    {id:'e1',fields:{Tipo:'Glassdoor',Evento:'Glassdoor — Fulano'}},
    {id:'e2',fields:{Tipo:'Cumpleaños',Evento:'Cumple de Fulano'}},
  ];
  for(const token of [TOKEN_HR,TOKEN_TEM,TOKEN_MANAGER,TOKEN_EQUIPO_ENG]){
    const {fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:eventos})});
    const original=global.fetch;
    global.fetch=fetchImpl;
    try{
      const req={headers:{authorization:`Bearer ${token}`},method:'GET',query:{path:'Eventos'}};
      const res=fakeRes();
      await handler(req,res);
      assert.deepEqual(res.body.records.map(r=>r.id),['e2']);
    }finally{
      global.fetch=original;
    }
  }
});

test('api/airtable: Eventos — "full" ve todo, incluido Glassdoor', async()=>{
  const eventos=[
    {id:'e1',fields:{Tipo:'Glassdoor',Evento:'Glassdoor — Fulano'}},
    {id:'e2',fields:{Tipo:'Cumpleaños',Evento:'Cumple de Fulano'}},
  ];
  const {fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:eventos})});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:`Bearer ${TOKEN_FULL}`},method:'GET',query:{path:'Eventos'}};
    const res=fakeRes();
    await handler(req,res);
    const body=typeof res.body==='string'?JSON.parse(res.body):res.body;
    assert.equal(body.records.length,2);
  }finally{
    global.fetch=original;
  }
});

test('api/airtable: Beneficios — full y manager ven los 2 grupos; hr, tem y equipo solo el suyo (+ "Ambos")', async()=>{
  const registros=[
    {id:'b1',fields:{Beneficio:'Gimnasio Core',Grupo:'Core Team'}},
    {id:'b2',fields:{Beneficio:'Curso técnico',Grupo:'Engineers'}},
    {id:'b3',fields:{Beneficio:'Día libre cumpleaños',Grupo:'Ambos'}},
  ];
  const casos=[
    [TOKEN_FULL,['b1','b2','b3']],
    [TOKEN_MANAGER,['b1','b2','b3']],
    // El TEM acompaña a los devs: no ve los de Core Team, que es donde caen
    // Manager, Lead, Supervisor, COO y Founder.
    [TOKEN_TEM,['b2','b3']],
    [TOKEN_TEM_VIEJO,['b2','b3']],
    [TOKEN_HR,['b1','b3']],
    [TOKEN_EQUIPO_CORE,['b1','b3']],
    [TOKEN_EQUIPO_ENG,['b2','b3']],
  ];
  for(const [token,idsEsperados] of casos){
    const {fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:registros})});
    const original=global.fetch;
    global.fetch=fetchImpl;
    try{
      const req={headers:{authorization:`Bearer ${token}`},method:'GET',query:{path:'Beneficios'}};
      const res=fakeRes();
      await handler(req,res);
      const body=typeof res.body==='string'?JSON.parse(res.body):res.body;
      assert.deepEqual(body.records.map(r=>r.id).sort(),idsEsperados.sort());
    }finally{
      global.fetch=original;
    }
  }
});

test('api/airtable: Presupuesto Loyalty — mismo filtro por grupo que Beneficios', async()=>{
  const registros=[
    {id:'p1',fields:{Grupo:'Core Team',Nivel:'Spark'}},
    {id:'p2',fields:{Grupo:'Engineers',Nivel:'Spark'}},
  ];
  const {fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:registros})});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:`Bearer ${TOKEN_EQUIPO_ENG}`},method:'GET',query:{path:'Presupuesto Loyalty'}};
    const res=fakeRes();
    await handler(req,res);
    const body=typeof res.body==='string'?JSON.parse(res.body):res.body;
    assert.deepEqual(body.records.map(r=>r.id),['p2']);
  }finally{
    global.fetch=original;
  }
});

// Beneficios Asignados no tiene su propio campo Grupo — se resuelve por el
// Beneficio vinculado, que implica una segunda llamada interna a Airtable
// (GET Beneficios) para armar el mapa id→Grupo. Mock que distingue por tabla.
function fakeAirtableDual(porTabla){
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push({url,opts});
    const urlStr=String(url);
    for(const [tabla,respuesta] of Object.entries(porTabla)){
      if(urlStr.includes(encodeURIComponent(tabla))||urlStr.includes(tabla.replace(/ /g,'%20'))||urlStr.includes(tabla)){
        return respuesta;
      }
    }
    return {ok:false,status:404,text:async()=>'not found'};
  };
  return {calls,fetchImpl};
}

test('api/airtable: Beneficios Asignados — se filtra por el Grupo del Beneficio vinculado', async()=>{
  const asignados=[
    {id:'a1',fields:{Persona:'Beto',Beneficio:['b1']}}, // b1 = Core Team
    {id:'a2',fields:{Persona:'Ana',Beneficio:['b2']}},  // b2 = Engineers
    {id:'a3',fields:{Persona:'Cami',Beneficio:['b3']}}, // b3 = Ambos
  ];
  const catalogo=[
    {id:'b1',fields:{Beneficio:'Gimnasio Core',Grupo:'Core Team'}},
    {id:'b2',fields:{Beneficio:'Curso técnico',Grupo:'Engineers'}},
    {id:'b3',fields:{Beneficio:'Día libre cumpleaños',Grupo:'Ambos'}},
  ];
  const {fetchImpl}=fakeAirtableDual({
    'Beneficios Asignados':{ok:true,status:200,text:async()=>JSON.stringify({records:asignados})},
    'Beneficios':{ok:true,status:200,json:async()=>({records:catalogo}),text:async()=>JSON.stringify({records:catalogo})},
  });
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:`Bearer ${TOKEN_EQUIPO_ENG}`},method:'GET',query:{path:'Beneficios Asignados'}};
    const res=fakeRes();
    await handler(req,res);
    const body=typeof res.body==='string'?JSON.parse(res.body):res.body;
    assert.deepEqual(body.records.map(r=>r.id).sort(),['a2','a3']);
  }finally{
    global.fetch=original;
  }
});

test('api/airtable: Beneficios Asignados — full y manager no filtran (ven todo, sin la llamada extra a Beneficios)', async()=>{
  const asignados=[
    {id:'a1',fields:{Persona:'Beto',Beneficio:['b1']}},
    {id:'a2',fields:{Persona:'Ana',Beneficio:['b2']}},
  ];
  const {calls,fetchImpl}=fakeAirtable({ok:true,status:200,text:async()=>JSON.stringify({records:asignados})});
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:`Bearer ${TOKEN_MANAGER}`},method:'GET',query:{path:'Beneficios Asignados'}};
    const res=fakeRes();
    await handler(req,res);
    const body=typeof res.body==='string'?JSON.parse(res.body):res.body;
    assert.equal(body.records.length,2);
    assert.equal(calls.length,1); // ninguna llamada extra a Beneficios
  }finally{
    global.fetch=original;
  }
});

test('api/airtable: Beneficios Asignados — el TEM solo recibe las de beneficios de Engineers', async()=>{
  // Es la tabla que importa: acá está lo que se le cubrió a cada persona, y
  // las de Core Team incluyen a Manager, Lead, Supervisor, COO y Founder.
  const asignados=[
    {id:'aCore',fields:{Persona:'Un Manager',Beneficio:['b1']}},   // b1 = Core Team
    {id:'aEng',fields:{Persona:'Una Dev',Beneficio:['b2']}},       // b2 = Engineers
  ];
  const catalogo=[
    {id:'b1',fields:{Beneficio:'Gimnasio Core',Grupo:'Core Team'}},
    {id:'b2',fields:{Beneficio:'Curso técnico',Grupo:'Engineers'}},
  ];
  for(const token of [TOKEN_TEM,TOKEN_TEM_VIEJO]){
    const original=global.fetch;
    global.fetch=async(url)=>String(url).endsWith('/Beneficios')
      ?{ok:true,status:200,json:async()=>({records:catalogo}),text:async()=>JSON.stringify({records:catalogo})}
      :{ok:true,status:200,text:async()=>JSON.stringify({records:asignados})};
    try{
      const res=fakeRes();
      await handler({headers:{authorization:`Bearer ${token}`},method:'GET',query:{path:'Beneficios Asignados'}},res);
      const body=typeof res.body==='string'?JSON.parse(res.body):res.body;
      assert.equal(body.records.map(r=>r.id).join('|'),'aEng');
    }finally{
      global.fetch=original;
    }
  }
});

test('api/airtable: grupoBeneficiosEfectivo — el rol manda sobre lo que traiga el token', ()=>{
  const ef=handler.grupoBeneficiosEfectivo;
  // Una sesión vieja (null) queda acotada igual por su rol…
  assert.equal(ef('tem',null),'Engineers');
  assert.equal(ef('hr',null),'Core Team');
  // …y un token que dijera otra cosa no puede ampliar el acceso.
  assert.equal(ef('tem','Core Team'),'Engineers');
  // Los roles sin grupo fijo siguen dependiendo del token (equipo) o sin tope.
  assert.equal(ef('equipo','Engineers'),'Engineers');
  assert.equal(ef('full',null),null);
  assert.equal(ef('manager',null),null);
});

test('api/airtable: Beneficios Asignados — si falla la resolución del catálogo, falla cerrado (records vacíos)', async()=>{
  const asignados=[{id:'a1',fields:{Persona:'Beto',Beneficio:['b1']}}];
  const {fetchImpl}=fakeAirtableDual({
    'Beneficios Asignados':{ok:true,status:200,text:async()=>JSON.stringify({records:asignados})},
    'Beneficios':{ok:false,status:500,json:async()=>({}),text:async()=>'error'},
  });
  const original=global.fetch;
  global.fetch=fetchImpl;
  try{
    const req={headers:{authorization:`Bearer ${TOKEN_EQUIPO_ENG}`},method:'GET',query:{path:'Beneficios Asignados'}};
    const res=fakeRes();
    await handler(req,res);
    const body=typeof res.body==='string'?JSON.parse(res.body):res.body;
    assert.deepEqual(body.records,[]);
  }finally{
    global.fetch=original;
  }
});

// ─── Secciones del grupo "Beneficios" que hablan de UNA persona ──────────────
// Ambassador Week, Off Sites, Get Together y Asistencia a Actividades. El TEM
// las ve, pero solo con gente de Engineers. Se filtra por grupo en vez de
// bloquear la tabla porque la card de beneficios de cada persona lee estas
// mismas tablas: bloquearlas rompería la pantalla que el TEM sí tiene.
const PERSONAS_GRUPOS=[
  {id:'p1',fields:{Nombre:'Una Dev','Rol en empresa':'Engineer'}},
  {id:'p2',fields:{Nombre:'Un Manager','Rol en empresa':'Manager'}},
  {id:'p3',fields:{Nombre:'Jesús Figueroa','Rol en empresa':'Engineer'}},
  {id:'p4',fields:{Nombre:'La Founder','Rol en empresa':'Founder'}},
];
function conPersonas(registros){
  return async(url)=>String(url).endsWith('/Personas')
    ?{ok:true,status:200,json:async()=>({records:PERSONAS_GRUPOS}),text:async()=>JSON.stringify({records:PERSONAS_GRUPOS})}
    :{ok:true,status:200,text:async()=>JSON.stringify({records:registros})};
}
async function idsPara(token,tabla,registros){
  const original=global.fetch;
  global.fetch=conPersonas(registros);
  try{
    const res=fakeRes();
    await handler({headers:{authorization:`Bearer ${token}`},method:'GET',query:{path:tabla}},res);
    const body=typeof res.body==='string'?JSON.parse(res.body):res.body;
    return (body.records||[]).map(r=>r.id).join('|');
  }finally{ global.fetch=original; }
}

test('api/airtable: Ambassador Week / Off Sites / Asistencia — el TEM solo ve gente de Engineers', async()=>{
  const casos=[
    ['Ambassador Week',[{id:'dev',fields:{Persona:'Una Dev'}},{id:'mgr',fields:{Persona:'Un Manager'}}]],
    ['Off Sites',[{id:'dev',fields:{Persona:'Una Dev'}},{id:'founder',fields:{Persona:'La Founder'}}]],
    ['Asistencia a Actividades',[{id:'dev',fields:{Persona:'Una Dev'}},{id:'mgr',fields:{Persona:'Un Manager'}}]],
  ];
  for(const [tabla,registros] of casos){
    assert.equal(await idsPara(TOKEN_TEM,tabla,registros),'dev',tabla);
    assert.equal(await idsPara(TOKEN_TEM_VIEJO,tabla,registros),'dev',`${tabla} (sesión vieja)`);
  }
});

test('api/airtable: Get Together usa el campo BEONer, no Persona', async()=>{
  // Cada tabla identifica a la persona con un campo distinto. Con el nombre
  // equivocado no matchearía nadie y, al fallar cerrado, la sección entera
  // llegaría vacía en vez de filtrada.
  const registros=[{id:'dev',fields:{BEONer:'Una Dev'}},{id:'mgr',fields:{BEONer:'Un Manager'}}];
  assert.equal(await idsPara(TOKEN_TEM,'Get Together',registros),'dev');
  assert.equal(await idsPara(TOKEN_FULL,'Get Together',registros),'dev|mgr');
});

test('api/airtable: el nombre matchea sin importar acentos, mayúsculas ni espacios', async()=>{
  // Estos registros guardan el nombre escrito a mano: "Jesús" y "jesus  " son
  // la misma persona, y si no matchean el registro desaparece de su sección.
  const registros=[
    {id:'acento',fields:{Persona:'jesus  figueroa'}},
    {id:'exacto',fields:{Persona:'Jesús Figueroa'}},
  ];
  assert.equal(await idsPara(TOKEN_TEM,'Ambassador Week',registros),'acento|exacto');
});

test('api/airtable: un nombre que no matchea con nadie no pasa el filtro', async()=>{
  // No se puede afirmar de qué grupo es, y en una restricción de acceso la
  // duda se resuelve del lado seguro. Para full no cambia nada: lo sigue
  // viendo, que es lo que hace falta para corregirlo.
  const registros=[{id:'dev',fields:{Persona:'Una Dev'}},{id:'sinFicha',fields:{Persona:'Alguien Que No Existe'}}];
  assert.equal(await idsPara(TOKEN_TEM,'Ambassador Week',registros),'dev');
  assert.equal(await idsPara(TOKEN_FULL,'Ambassador Week',registros),'dev|sinFicha');
});

test('api/airtable: solo al TEM se le filtran estas tablas, a nadie más', async()=>{
  // Tener grupoBeneficios no alcanza: lo tienen también "equipo" y "hr".
  // - "equipo": su grupo acota BENEFICIOS, no la vida en común. Off Sites y
  //   Get Together son de toda la empresa.
  // - "hr": sigue viendo todo en Asistencia a Actividades, que es la única de
  //   estas cuatro que tiene en el menú.
  const registros=[{id:'dev',fields:{Persona:'Una Dev'}},{id:'mgr',fields:{Persona:'Un Manager'}}];
  assert.equal(await idsPara(TOKEN_EQUIPO_ENG,'Off Sites',registros),'dev|mgr');
  assert.equal(await idsPara(TOKEN_EQUIPO_CORE,'Ambassador Week',registros),'dev|mgr');
  assert.equal(await idsPara(TOKEN_HR,'Asistencia a Actividades',registros),'dev|mgr');
  assert.equal(await idsPara(TOKEN_HR,'Ambassador Week',registros),'dev|mgr');
  // Y el TEM sí
  assert.equal(await idsPara(TOKEN_TEM,'Off Sites',registros),'dev');
});

test('api/airtable: acotar las tablas de personas no toca los Beneficios de HR', async()=>{
  // Son dos restricciones distintas y conviven: HR sigue viendo solo los
  // beneficios de Core Team aunque vea todo en Asistencia a Actividades.
  const registros=[
    {id:'b1',fields:{Beneficio:'Gimnasio Core',Grupo:'Core Team'}},
    {id:'b2',fields:{Beneficio:'Curso técnico',Grupo:'Engineers'}},
  ];
  const original=global.fetch;
  global.fetch=async()=>({ok:true,status:200,text:async()=>JSON.stringify({records:registros})});
  try{
    const res=fakeRes();
    await handler({headers:{authorization:`Bearer ${TOKEN_HR}`},method:'GET',query:{path:'Beneficios'}},res);
    const body=typeof res.body==='string'?JSON.parse(res.body):res.body;
    assert.equal(body.records.map(r=>r.id).join('|'),'b1');
  }finally{ global.fetch=original; }
});

test('api/airtable: si no se puede resolver quién es quién, falla cerrado', async()=>{
  const registros=[{id:'dev',fields:{Persona:'Una Dev'}}];
  const original=global.fetch;
  global.fetch=async(url)=>String(url).endsWith('/Personas')
    ?{ok:false,status:500,json:async()=>({}),text:async()=>'boom'}
    :{ok:true,status:200,text:async()=>JSON.stringify({records:registros})};
  try{
    const res=fakeRes();
    await handler({headers:{authorization:`Bearer ${TOKEN_TEM}`},method:'GET',query:{path:'Off Sites'}},res);
    const body=typeof res.body==='string'?JSON.parse(res.body):res.body;
    assert.equal(body.records.length,0,'sin poder resolver el grupo, no se manda nada');
  }finally{ global.fetch=original; }
});
