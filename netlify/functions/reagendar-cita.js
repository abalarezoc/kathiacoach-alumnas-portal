// ============================================================
// Función serverless: una alumna reagenda una de sus clases de
// horario fijo.
//
// Solo se permite si faltan al menos 24 horas para esa clase (la
// política de "reagendar con 1 día de anticipación"). Si falta
// menos, responde con un mensaje claro en vez de reagendar.
//
// Requiere SUPABASE_SERVICE_ROLE_KEY y CALCOM_API_KEY en Netlify.
// ============================================================

const { calcomHeaders, partesLima } = require('./_calcom');

const SUPABASE_URL = 'https://gvtsfvedfjgauyxnyixr.supabase.co';
const HORAS_MINIMAS_ANTICIPACION = 24;

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
      return { statusCode: 200, body: JSON.stringify({ ok: false, mensaje: 'Esta clase ya no está activa (fue reagendada, cancelada o ya pasó).' }) };
    }

    // 3. Valida la anticipación: al menos 24 horas antes del inicio actual.
    const inicioActualUTC = new Date(`${cita.fecha}T${cita.hora}:00.000-05:00`);
    const horasFaltantes = (inicioActualUTC.getTime() - Date.now()) / 3600000;
    if (horasFaltantes < HORAS_MINIMAS_ANTICIPACION) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, mensaje: 'Ya no se puede reagendar esta clase: se necesita al menos 1 día de anticipación. Escríbele a Kathia directamente por WhatsApp.' }),
      };
    }

    // 4. Reagenda en Cal.com.
    const reschedResp = await fetch(`https://api.cal.com/v2/bookings/${cita.calcom_booking_uid}/reschedule`, {
      method: 'POST',
      headers: calcomHeaders(CALCOM_API_KEY),
      body: JSON.stringify({ start: nuevoInicioUTC, reschedulingReason: 'Reagendado por la alumna desde su portal.' }),
    });
    const reschedData = await reschedResp.json();
    if (!reschedResp.ok) {
      const msj = (reschedData && reschedData.error && reschedData.error.message) || reschedData.message || 'No se pudo reagendar en Cal.com.';
      return { statusCode: 200, body: JSON.stringify({ ok: false, mensaje: msj }) };
    }
    const nuevoBooking = (reschedData && reschedData.data) || reschedData;
    const nuevoUid = (nuevoBooking && nuevoBooking.uid) || cita.calcom_booking_uid;
    const { fecha, hora } = partesLima(new Date(nuevoInicioUTC));

    // 5. Actualiza el registro en Supabase.
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
