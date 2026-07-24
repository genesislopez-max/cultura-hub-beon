// Intercambia un ID token de Google (dura ~1 hora) por un token de sesión
// propio de mayor duración — ver api/_lib/session.js. Se llama una sola vez,
// justo después del login con Google.
const {verifyGoogleIdToken}=require('./_lib/auth');
const {signSession}=require('./_lib/session');
const {resolverAccesoPorEmail}=require('./_lib/roles');

module.exports=async(req,res)=>{
  if(req.method!=='POST'){
    res.status(405).json({error:{message:'Método no permitido.'}});
    return;
  }

  const idToken=req.body?.idToken||'';
  const verificado=await verifyGoogleIdToken(idToken);
  if(!verificado.ok){
    res.status(401).json({error:{message:verificado.error}});
    return;
  }

  // Se resuelve acá (una sola vez, al loguear) y queda embebido en el token
  // firmado — así el resto de los pedidos no necesita volver a consultar
  // Airtable para saber el rol de acceso (ver api/_lib/roles.js).
  const {rol,grupoBeneficios}=await resolverAccesoPorEmail(verificado.email);

  let token;
  try{
    token=signSession({email:verificado.email,name:verificado.name,rol,grupoBeneficios});
  }catch(e){
    res.status(500).json({error:{message:e.message}});
    return;
  }

  res.status(200).json({token,email:verificado.email,name:verificado.name,rol,grupoBeneficios});
};
