// ============================================================
// Función serverless: una alumna cancela una de sus sesiones de
// horario fijo (cancelación de emergencia).
//
// A diferencia de reagendar, esto SIEMPRE se permite, sin importar
// cuán cerca esté la sesión — pero si es el mismo día, el portal ya
// le avisó antes de llamar aquí que la sesión se cobra igual.
//
// Requiere SUPABASE_SERVICE_ROLE_KEY y GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/
// GOOGLE_REFRESH_TOKEN en Netlify (Google Calendar reemplazó a Cal.com).
// ============================================================

const { cancelarEventoCalendar } = require('./_googlecalendar');

const SUPABASE_URL = 'https://gvtsfvedfjgauyxnyixr.supabase.co';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, mensaje: 'Método no permitido.' }) };
  }

  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_ROLE_KEY) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, mensaje: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en Netlify.' }) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, mensaje: 'Falta la sesión.' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, mensaje: 'Solicitud inválida.' }) };
  }
  const { citaId } = body;
  if (!citaId) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, mensaje: 'Falta la cita a cancelar.' }) };
  }

  try {
    // 1. Confirma quién llama.
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    const userData = await userResp.json();
    if (!userResp.ok || !userData || !userData.id) {
      return { statusCode: 401, body: JSON.stringify({ ok: false, mensaje: 'Sesión inválida.' }) };
    }

    // 2. Busca la cita y confirma que es SUYA.
    const citaResp = await fetch(
      `${SUPABASE_URL}/rest/v1/citas_fijas?id=eq.${citaId}&select=*`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const citaRows = await citaResp.json();
    const cita = Array.isArray(citaRows) && citaRows[0];
    if (!cita) {
      return { statusCode: 404, body: JSON.stringify({ ok: false, mensaje: 'No se encontró esa sesión.' }) };
    }
    if (cita.alumna_id !== userData.id) {
      return { statusCode: 403, body: JSON.stringify({ ok: false, mensaje: 'Esa sesión no es tuya.' }) };
    }
    if (cita.estado !== 'programada') {
      return { statusCode: 200, body: JSON.stringify({ ok: false, mensaje: 'Esta sesión ya no está activa.' }) };
    }

    // 3. Detecta si es el mismo día (hora de Lima), solo informativo.
    const hoyLima = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const esMismoDia = cita.fecha === hoyLima;

    // 4. Cancela (borra) el evento en Google Calendar.
    const perfilResp = await fetch(
      `${SUPABASE_URL}/rest/v1/alumnas?id=eq.${userData.id}&select=recibir_invites_calendario`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const perfilData = await perfilResp.json();
    const notificarAlumna = !!(Array.isArray(perfilData) && perfilData[0] && perfilData[0].recibir_invites_calendario);
    try {
      await cancelarEventoCalendar(cita.calcom_booking_uid, notificarAlumna);
    } catch (e) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, mensaje: e.message }) };
    }

    // 5. Marca la cita como cancelada en Supabase.
    await fetch(`${SUPABASE_URL}/rest/v1/citas_fijas?id=eq.${citaId}`, {
      method: 'PATCH',
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'cancelada' }),
    });

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, mismoDia: esMismoDia }) };
  } catch (err) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, mensaje: err.message }) };
  }
};
