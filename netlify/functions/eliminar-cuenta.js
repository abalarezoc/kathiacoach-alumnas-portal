// ============================================================
// Función serverless: elimina por completo el acceso de inicio de
// sesión de una alumna (además de su ficha y su historial, que ya
// se borran desde el navegador). Sin este paso, el correo queda
// "atrapado" y esa persona no puede volver a registrarse.
//
// Esto solo se puede hacer desde el servidor: requiere la
// "service_role key" de Supabase, que nunca debe estar en el
// navegador. Vive aquí como variable de entorno.
//
// Requiere la variable de entorno SUPABASE_SERVICE_ROLE_KEY,
// configurada en Netlify -> Site settings -> Environment variables
// (Supabase -> Project Settings -> API -> service_role key).
// Sin ella, la función responde con un aviso claro en vez de fallar
// en silencio; el resto del borrado (ficha e historial) ya se hizo
// igual desde el panel.
// ============================================================

const SUPABASE_URL = 'https://gvtsfvedfjgauyxnyixr.supabase.co';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, mensaje: 'Método no permitido.' }) };
  }

  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_ROLE_KEY) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        mensaje: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en Netlify.',
      }),
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, mensaje: 'Falta la sesión.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, mensaje: 'Solicitud inválida.' }) };
  }
  const idAEliminar = body.id;
  if (!idAEliminar) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, mensaje: 'Falta el id de la alumna.' }) };
  }

  try {
    // 1. Confirma quién llama, a partir de su propia sesión (su token).
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    const userData = await userResp.json();
    if (!userResp.ok || !userData || !userData.id) {
      return { statusCode: 401, body: JSON.stringify({ ok: false, mensaje: 'Sesión inválida.' }) };
    }

    // 2. Confirma que quien llama es administradora (con la service role,
    //    para no depender de las reglas normales de acceso aquí).
    const perfilResp = await fetch(
      `${SUPABASE_URL}/rest/v1/alumnas?id=eq.${userData.id}&select=es_admin`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const perfilData = await perfilResp.json();
    const esAdmin = Array.isArray(perfilData) && perfilData[0] && perfilData[0].es_admin;
    if (!esAdmin) {
      return { statusCode: 403, body: JSON.stringify({ ok: false, mensaje: 'Solo una cuenta administradora puede hacer esto.' }) };
    }

    // 3. Elimina de verdad el acceso de inicio de sesión.
    const delResp = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${idAEliminar}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
    });

    // 404 = ya no existía (por ejemplo, si se vuelve a intentar) — lo tratamos como éxito.
    if (!delResp.ok && delResp.status !== 404) {
      const errData = await delResp.json().catch(() => ({}));
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, mensaje: errData.msg || errData.message || 'No se pudo eliminar el acceso.' }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, mensaje: err.message }),
    };
  }
};
