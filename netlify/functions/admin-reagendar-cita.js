// ============================================================
// Función serverless: Kathia reagenda la clase de horario fijo de
// CUALQUIER alumna, desde su panel (admin.html).
//
// A diferencia de reagendar-cita.js (que usa la alumna desde su
// portal), aquí no hay límite de 24 horas de anticipación — Kathia
// puede reagendar cuando lo necesite, incluso el mismo día.
//
// Requiere SUPABASE_SERVICE_ROLE_KEY y CALCOM_API_KEY en Netlify.
// ============================================================

const { calcomHeaders, partesLima } = require('./_calcom');

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
  const { citaId, nuevoInicioUTC } = body;
  if (!citaId || !nuevoInicioUTC) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, mensaje: 'Falta la cita o el nuevo horario.' }) };
  }

  try {
    // 1. Confirma que quien llama es administradora.
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    const userData = await userResp.json();
    if (!userResp.ok || !userData || !userData.id) {
      return { statusCode: 401, body: JSON.stringify({ ok: false, mensaje: 'Sesión inválida.' }) };
    }
    const perfilResp = await fetch(
      `${SUPABASE_URL}/rest/v1/alumnas?id=eq.${userData.id}&select=es_admin`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const perfilData = await perfilResp.json();
    const esAdmin = Array.isArray(perfilData) && perfilData[0] && perfilData[0].es_admin;
    if (!esAdmin) {
      return { statusCode: 403, body: JSON.stringify({ ok: false, mensaje: 'Solo una cuenta administradora puede hacer esto.' }) };
    }

    // 2. Busca la cita (sin exigir dueña — Kathia puede reagendar cualquiera).
    const citaResp = await fetch(
      `${SUPABASE_URL}/rest/v1/citas_fijas?id=eq.${citaId}&select=*`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const citaRows = await citaResp.json();
    const cita = Array.isArray(citaRows) && citaRows[0];
    if (!cita) {
      return { statusCode: 404, body: JSON.stringify({ ok: false, mensaje: 'No se encontró esa clase.' }) };
    }
    if (cita.estado !== 'programada') {
      return { statusCode: 200, body: JSON.stringify({ ok: false, mensaje: 'Esta clase ya no está activa (fue reagendada, cancelada o ya pasó).' }) };
    }

    // 3. Reagenda en Cal.com — sin restricción de anticipación.
    const reschedResp = await fetch(`https://api.cal.com/v2/bookings/${cita.calcom_booking_uid}/reschedule`, {
      method: 'POST',
      headers: calcomHeaders(CALCOM_API_KEY),
      body: JSON.stringify({ start: nuevoInicioUTC, reschedulingReason: 'Reagendado por Kathia desde el panel.' }),
    });
    const reschedData = await reschedResp.json();
    if (!reschedResp.ok) {
      const msj = (reschedData && reschedData.error && reschedData.error.message) || reschedData.message || 'No se pudo reagendar en Cal.com.';
      return { statusCode: 200, body: JSON.stringify({ ok: false, mensaje: msj }) };
    }
    const nuevoBooking = (reschedData && reschedData.data) || reschedData;
    const nuevoUid = (nuevoBooking && nuevoBooking.uid) || cita.calcom_booking_uid;
    const { fecha, hora } = partesLima(new Date(nuevoInicioUTC));

    // 4. Actualiza el registro en Supabase.
    await fetch(`${SUPABASE_URL}/rest/v1/citas_fijas?id=eq.${citaId}`, {
      method: 'PATCH',
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha, hora, calcom_booking_uid: nuevoUid }),
    });

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, fecha, hora }) };
  } catch (err) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, mensaje: err.message }) };
  }
};
