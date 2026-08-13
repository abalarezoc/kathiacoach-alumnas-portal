// ============================================================
// Función serverless: una alumna cancela una de sus clases de
// horario fijo (cancelación de emergencia).
//
// A diferencia de reagendar, esto SIEMPRE se permite, sin importar
// cuán cerca esté la clase — pero si es el mismo día, el portal ya
// le avisó antes de llamar aquí que la sesión se cobra igual. Este
// aviso queda también anotado en el motivo de cancelación en Cal.com.
//
// Requiere SUPABASE_SERVICE_ROLE_KEY y CALCOM_API_KEY en Netlify.
// ============================================================

const { calcomHeaders } = require('./_calcom');

const SUPABASE_URL = 'https://gvtsfvedfjgauyxnyixr.supabase.co';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, mensaje: 'Método no permitido.' }) };
  }

  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const CALCOM_API_KEY = process.env.CALCOM_API_KEY;
  if (!SERVICE_ROLE_KEY || !CALCOM_API_KEY) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, mensaje: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY o CALCOM_API_KEY en Netlify.' }) };
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
      return { statusCode: 404, body: JSON.stringify({ ok: false, mensaje: 'No se encontró esa clase.' }) };
    }
    if (cita.alumna_id !== userData.id) {
      return { statusCode: 403, body: JSON.stringify({ ok: false, mensaje: 'Esa clase no es tuya.' }) };
    }
    if (cita.estado !== 'programada') {
      return { statusCode: 200, body: JSON.stringify({ ok: false, mensaje: 'Esta clase ya no está activa.' }) };
    }

    // 3. Detecta si es el mismo día (hora de Lima), solo para anotarlo en Cal.com.
    const hoyLima = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const esMismoDia = cita.fecha === hoyLima;
    const motivo = esMismoDia
      ? 'Cancelación de emergencia el mismo día de la clase (se cobra la sesión según política).'
      : 'Cancelación de emergencia desde el portal de la alumna.';

    // 4. Cancela en Cal.com.
    const cancelResp = await fetch(`https://api.cal.com/v2/bookings/${cita.calcom_booking_uid}/cancel`, {
      method: 'POST',
      headers: calcomHeaders(CALCOM_API_KEY),
      body: JSON.stringify({ cancellationReason: motivo }),
    });
    const cancelData = await cancelResp.json();
    if (!cancelResp.ok) {
      const msj = (cancelData && cancelData.error && cancelData.error.message) || cancelData.message || 'No se pudo cancelar en Cal.com.';
      return { statusCode: 200, body: JSON.stringify({ ok: false, mensaje: msj }) };
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
