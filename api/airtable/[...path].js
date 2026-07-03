// Proxy hacia Airtable: valida la sesión de Google del navegador y recién ahí
// reenvía el pedido a Airtable usando el token que vive solo acá (variables de
// entorno de Vercel) — el token nunca se manda al cliente.
const {verifyGoogleIdToken}=require('../_lib/auth');

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

  const prefix='/api/airtable/';
  const idx=req.url.indexOf(prefix);
  const resto=idx>=0?req.url.slice(idx+prefix.length):'';
  const airtableUrl=`https://api.airtable.com/v0/${base}/${resto}`;

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
