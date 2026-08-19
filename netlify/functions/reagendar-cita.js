// ============================================================
// Función serverless: una alumna reagenda una de sus sesiones de
// horario fijo.
//
// Solo se permite si faltan al menos 24 horas para esa sesión (la
// política de "reagendar con 1 día de anticipación"). Si falta
// menos, responde con un mensaje claro en vez de reagendar.
//
// Requiere SUPABASE_SERVICE_ROLE_KEY y GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/
// GOOGLE_REFRESH_TOKEN en Netlify (Google Calendar reemplazó a Cal.com).
//
// Nota: a diferencia de Cal.com, reagendar en Google Calendar mueve el
// MISMO evento (mismo eventId) — no hace falta guardar un uid nuevo.
// ============================================================

const { reagendarEventoCalendar, partesLima, DURACION_SESION_MIN } = require('./_googlecalendar');

const SUPABASE_URL = 'https://gvtsfvedfjgauyxnyixr.supabase.co';
const HORAS_MINIMAS_ANTICIPACION = 24;

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
      return { statusCode: 404, body: JSON.stringify({ ok: false, mensaje: 'No se encontró esa sesión.' }) };
    }
    if (cita.alumna_id !== userData.id) {
      return { statusCode: 403, body: JSON.stringify({ ok: false, mensaje: 'Esa sesión no es tuya.' }) };
    }
    if (cita.estado !== 'programada') {
      return { statusCode: 200, body: JSON.stringify({ ok: false, mensaje: 'Esta sesión ya no está activa (fue reagendada, cancelada o ya pasó).' }) };
    }

    // 3. Valida la anticipación: al menos 24 horas antes del inicio actual.
    const inicioActualUTC = new Date(`${cita.fecha}T${cita.hora}:00.000-05:00`);
    const horasFaltantes = (inicioActualUTC.getTime() - Date.now()) / 3600000;
    if (horasFaltantes < HORAS_MINIMAS_ANTICIPACION) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, mensaje: 'Ya no se puede reagendar esta sesión: se necesita al menos 1 día de anticipación. Escríbele a Kathia directamente por WhatsApp.' }),
      };
    }

    // 4. Reagenda en Google Calendar (mismo eventId, nuevo horario).
    const perfilResp = await fetch(
      `${SUPABASE_URL}/rest/v1/alumnas?id=eq.${userData.id}&select=recibir_invites_calendario`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const perfilData = await perfilResp.json();
    const notificarAlumna = !!(Array.isArray(perfilData) && perfilData[0] && perfilData[0].recibir_invites_calendario);

    const nuevoInicio = new Date(nuevoInicioUTC);
    try {
      await reagendarEventoCalendar(cita.calcom_booking_uid, {
        inicioUTC: nuevoInicio,
        finUTC: new Date(nuevoInicio.getTime() + DURACION_SESION_MIN * 60000),
        notificar: notificarAlumna,
      });
    } catch (e) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, mensaje: e.message }) };
    }
    const { fecha, hora } = partesLima(nuevoInicio);

    // 5. Actualiza el registro en Supabase (el eventId no cambia).
    await fetch(`${SUPABASE_URL}/rest/v1/citas_fijas?id=eq.${citaId}`, {
      method: 'PATCH',
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha, hora }),
    });

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, fecha, hora }) };
  } catch (err) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, mensaje: err.message }) };
  }
};
