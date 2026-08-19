// ============================================================
// Función serverless: quita (desactiva) un horario fijo por completo —
// no una sesión suelta, sino toda la serie semanal.
//
// La puede llamar la propia alumna dueña de ese horario (para dejar de
// tener sesión fija de cada semana), o Kathia desde su panel para
// cualquier alumna. Cancela en Google Calendar todas las sesiones
// futuras todavía "programada" de esa regla, y marca el horario como
// inactivo (no se borra nada — el historial de sesiones pasadas queda
// intacto).
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
  const { horarioFijoId } = body;
  if (!horarioFijoId) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, mensaje: 'Falta el horario a quitar.' }) };
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
      `${SUPABASE_URL}/rest/v1/alumnas?id=eq.${userData.id}&select=es_admin`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const perfilData = await perfilResp.json();
    const esAdmin = Array.isArray(perfilData) && perfilData[0] && perfilData[0].es_admin;

    // 1b. Averigua de quién es el horario (se necesita siempre, admin o no,
    // para saber si esa alumna quiere el correo de Google Calendar).
    const horarioResp = await fetch(
      `${SUPABASE_URL}/rest/v1/horario_fijo?id=eq.${horarioFijoId}&select=alumna_id`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const horarioData = await horarioResp.json();
    const horario = Array.isArray(horarioData) && horarioData[0];
    if (!esAdmin && (!horario || horario.alumna_id !== userData.id)) {
      return { statusCode: 403, body: JSON.stringify({ ok: false, mensaje: 'Ese horario no es tuyo.' }) };
    }
    let notificarAlumna = false;
    if (horario) {
      const alumnaResp = await fetch(
        `${SUPABASE_URL}/rest/v1/alumnas?id=eq.${horario.alumna_id}&select=recibir_invites_calendario`,
        { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
      );
      const alumnaData = await alumnaResp.json();
      notificarAlumna = !!(Array.isArray(alumnaData) && alumnaData[0] && alumnaData[0].recibir_invites_calendario);
    }

    // 2. Busca las citas futuras aún programadas de ese horario.
    const citasResp = await fetch(
      `${SUPABASE_URL}/rest/v1/citas_fijas?horario_fijo_id=eq.${horarioFijoId}&estado=eq.programada&select=id,calcom_booking_uid`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const citas = await citasResp.json();

    // 3. Cancela cada una en Google Calendar (mejor esfuerzo — seguimos
    // aunque una falle).
    for (const cita of (citas || [])) {
      try {
        await cancelarEventoCalendar(cita.calcom_booking_uid, notificarAlumna);
      } catch (e) { /* seguimos con las demás */ }
    }

    // 4. Marca esas citas como canceladas y el horario como inactivo.
    if (citas && citas.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/citas_fijas?horario_fijo_id=eq.${horarioFijoId}&estado=eq.programada`, {
        method: 'PATCH',
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'cancelada' }),
      });
    }
    await fetch(`${SUPABASE_URL}/rest/v1/horario_fijo?id=eq.${horarioFijoId}`, {
      method: 'PATCH',
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: false }),
    });

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, mensaje: err.message }) };
  }
};
