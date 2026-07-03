// Proxy hacia Airtable: valida la sesión de Google del navegador y recién ahí
// reenvía el pedido a Airtable usando el token que vive solo acá (variables de
// entorno de Vercel) — el token nunca se manda al cliente.
//
// La tabla/registro de Airtable viaja como query param ?path=... en vez de
// como parte de la URL (ej. antes /api/airtable/Tabla/recXXX, con una función
// catch-all anidada) porque ese ruteo dinámico no terminó de resolver bien en
// este proyecto — Vercel devolvía 404 propio (sin llegar a ejecutar la
// función) para cualquier pedido con más de un segmento de path. Con un
// endpoint fijo + query param no depende de esa resolución de rutas.
const {verifyGoogleIdToken}=require('./_lib/auth');

module.exports=async(req,res)=>{
  const idToken=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const verificado=await verifyGoogleIdToken(idToken);
  if(!verificado.ok){
    res.status(401).json({error:{message:verificado.error}});
    return;
  }

  const token=process.env.AIRTABLE_TOKEN;
  const base=process.env.AIRTABLE_BASE;
  if(!token||!base){
    res.status(500).json({error:{message:'El servidor no tiene configurado Airtable (faltan variables de entorno).'}});
    return;
  }

  const {path,...resto}=req.query;
  if(!path){
    res.status(400).json({error:{message:'Falta indicar la tabla de Airtable.'}});
    return;
  }

  const qs=new URLSearchParams();
  for(const [key,val] of Object.entries(resto)){
    if(Array.isArray(val)) val.forEach(v=>qs.append(key,v));
    else qs.append(key,val);
  }
  const qsStr=qs.toString();
  const airtableUrl=`https://api.airtable.com/v0/${base}/${path}${qsStr?`?${qsStr}`:''}`;

  let airtableRes;
  try{
    airtableRes=await fetch(airtableUrl,{
      method:req.method,
      headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
      body:(req.method!=='GET'&&req.method!=='DELETE')?JSON.stringify(req.body):undefined,
    });
  }catch(e){
    res.status(502).json({error:{message:'No se pudo conectar con Airtable.'}});
    return;
  }

  const text=await airtableRes.text();
  res.status(airtableRes.status);
  res.setHeader('Content-Type','application/json');
  res.send(text);
};
