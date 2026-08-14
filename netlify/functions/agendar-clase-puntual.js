// ============================================================
// Función serverless: agenda UNA clase suelta ("puntual"), además
// del horario fijo de la alumna — no crea ninguna regla semanal, solo
// una cita individual en la fecha/hora que eligió del calendario.
//
// A diferencia de asignar-horario-fijo.js: no valida "un solo horario
// por día" (una clase adicional puede caer el mismo día que su
// horario fijo, es justamente el caso de uso), no crea fila en
// horario_fijo, y solo agenda esa una vez en Cal.com.
//
// Requiere SUPABASE_SERVICE_ROLE_KEY y CALCOM_API_KEY en Netlify.
// ============================================================

const { CALCOM_USERNAME, HORARIO_FIJO_SLUG, calcomHeaders, partesLima } = require('./_calcom');

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
  const { inicioISO } = body;
  if (!inicioISO) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, mensaje: 'Falta la fecha y hora elegidas.' }) };
  }
  const inicio = new Date(inicioISO);
  if (isNaN(inicio.getTime()) || inicio.getTime() < Date.now()) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, mensaje: 'Esa fecha y hora ya no son válidas. Elige otro horario.' }) };
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

    const perfilResp = await fetch(
      `${SUPABASE_URL}/rest/v1/alumnas?id=eq.${userData.id}&select=nombre,email`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const perfilData = await perfilResp.json();
    const miPerfil = Array.isArray(perfilData) && perfilData[0];
    const nombreAlumna = miPerfil && (miPerfil.nombre || miPerfil.email);
    const emailAlumna = miPerfil && miPerfil.email;
    if (!nombreAlumna || !emailAlumna) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, mensaje: 'No se encontró tu perfil (nombre/correo).' }) };
    }

    // 2. Crea la reserva en Cal.com — una sola, sin regla semanal detrás.
    const bookingResp = await fetch('https://api.cal.com/v2/bookings', {
      method: 'POST',
      headers: calcomHeaders(CALCOM_API_KEY),
      body: JSON.stringify({
        eventTypeSlug: HORARIO_FIJO_SLUG,
        username: CALCOM_USERNAME,
        start: inicio.toISOString(),
        attendee: { name: nombreAlumna, email: emailAlumna, timeZone: 'America/Lima' },
      }),
    });
    const bookingData = await bookingResp.json();
    if (!bookingResp.ok) {
      const msj = (bookingData && bookingData.error && bookingData.error.message) || bookingData.message || 'No se pudo agendar en Cal.com.';
      return { statusCode: 200, body: JSON.stringify({ ok: false, mensaje: msj }) };
    }
    const booking = (bookingData && bookingData.data) || bookingData;
    const uid = booking && (booking.uid || (Array.isArray(booking) && booking[0] && booking[0].uid));
    if (!uid) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, mensaje: 'Cal.com no devolvió la reserva creada.' }) };
    }

    // 3. Guarda la cita en Supabase — sin horario_fijo_id, porque es suelta.
    const { fecha, hora } = partesLima(inicio);
    const citaResp = await fetch(`${SUPABASE_URL}/rest/v1/citas_fijas`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        alumna_id: userData.id,
        horario_fijo_id: null,
        fecha,
        hora,
        calcom_booking_uid: uid,
        estado: 'programada',
      }),
    });
    if (!citaResp.ok) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, mensaje: 'La clase se creó en Cal.com pero no se pudo guardar aquí. Escríbele a Kathia para que lo revise.' }) };
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, fecha, hora }) };
  } catch (err) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, mensaje: err.message }) };
  }
};
