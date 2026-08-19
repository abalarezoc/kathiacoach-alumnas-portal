// ============================================================
// Paso 2 del flujo de autorización única con Google Calendar.
//
// Google redirige aquí después de que Kathia acepta darle acceso a
// su calendario. Esta función cambia el "code" que manda Google por
// un refresh_token — el valor que necesitamos guardar UNA sola vez
// como variable de entorno (GOOGLE_REFRESH_TOKEN) para que las
// funciones de reservas puedan crear/cancelar/reagendar eventos en
// su calendario sin que ella tenga que volver a autorizar nunca más.
//
// Muestra el refresh_token en pantalla UNA sola vez (Google no lo
// vuelve a mostrar después) — hay que copiarlo de inmediato.
//
// Requiere GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Netlify.
// ============================================================

const REDIRECT_URI = 'https://kathiacoach-alumnas.netlify.app/.netlify/functions/google-oauth-callback';

function paginaError(mensaje) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!doctype html><html><body style="font-family:sans-serif;max-width:640px;margin:60px auto;">
      <h2>No se pudo completar la autorización</h2>
      <p>${mensaje}</p>
    </body></html>`,
  };
}

exports.handler = async function (event) {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return paginaError('Falta configurar GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET en Netlify.');
  }

  const params = (event.queryStringParameters) || {};
  if (params.error) {
    return paginaError(`Google devolvió un error: ${params.error}. Intenta de nuevo desde /.netlify/functions/google-oauth-start`);
  }
  if (!params.code) {
    return paginaError('Falta el código de autorización en la URL.');
  }

  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: params.code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });
    const data = await resp.json();
    if (!resp.ok) {
      return paginaError(`Google respondió con un error: ${data.error_description || data.error || 'desconocido'}.`);
    }
    if (!data.refresh_token) {
      return paginaError(
        'Google no devolvió un refresh_token. Esto pasa si esta cuenta ya había autorizado antes. ' +
        'Entra a <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a>, ' +
        'quita el acceso a "ACS - Agenda, Clientes y Seguimiento", y vuelve a intentar desde ' +
        '/.netlify/functions/google-oauth-start.'
      );
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: `<!doctype html><html><body style="font-family:sans-serif;max-width:640px;margin:60px auto;line-height:1.5;">
        <h2>✅ Autorización completada</h2>
        <p>Copia este valor ahora — Google no lo vuelve a mostrar después de cerrar esta página:</p>
        <textarea readonly style="width:100%;height:80px;font-family:monospace;font-size:14px;padding:8px;">${data.refresh_token}</textarea>
        <p>Pásaselo a Augusto (o pégalo donde te haya indicado) para terminar de configurar el sistema. No lo compartas por ningún otro medio.</p>
      </body></html>`,
    };
  } catch (err) {
    return paginaError(`Error inesperado: ${err.message}`);
  }
};
