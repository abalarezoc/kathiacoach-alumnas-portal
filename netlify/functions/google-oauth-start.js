// ============================================================
// Paso 1 del flujo de autorización única con Google Calendar.
//
// Kathia (o quien tenga la cuenta de Google del consultorio) entra
// a esta URL UNA SOLA VEZ:
//
//   https://kathiacoach-alumnas.netlify.app/.netlify/functions/google-oauth-start
//
// Esto la redirige a la pantalla de Google donde acepta darle acceso
// a su calendario a la app "ACS - Agenda, Clientes y Seguimiento".
// Google la manda de vuelta a google-oauth-callback.js, que le
// muestra el refresh token UNA sola vez para copiarlo.
//
// Requiere GOOGLE_CLIENT_ID en las variables de entorno de Netlify.
// ============================================================

const REDIRECT_URI = 'https://kathiacoach-alumnas.netlify.app/.netlify/functions/google-oauth-callback';
const SCOPE = 'https://www.googleapis.com/auth/calendar';

exports.handler = async function () {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  if (!CLIENT_ID) {
    return { statusCode: 200, headers: { 'Content-Type': 'text/plain' }, body: 'Falta configurar GOOGLE_CLIENT_ID en Netlify.' };
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    // "consent" fuerza a Google a devolver un refresh_token incluso si
    // esta cuenta ya había autorizado antes (si no, en la segunda vez
    // Google no lo vuelve a mandar).
    prompt: 'consent',
    include_granted_scopes: 'true',
  });

  return {
    statusCode: 302,
    headers: { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` },
    body: '',
  };
};
