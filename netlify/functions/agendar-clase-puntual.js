// ============================================================
// Función serverless: agenda UNA sesión suelta ("puntual"), además
// del horario fijo de la alumna — no crea ninguna regla semanal, solo
// una cita individual en la fecha/hora que eligió del calendario.
//
// A diferencia de asignar-horario-fijo.js: no valida "un solo horario
// por día" (una sesión adicional puede caer el mismo día que su
// horario fijo, es justamente el caso de uso), no crea fila en
// horario_fijo, y solo agenda esa una vez. Sí valida el máximo de 3
// sesiones por semana en total (fijas + puntuales).
//
// Requiere SUPABASE_SERVICE_ROLE_KEY y GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/
// GOOGLE_REFRESH_TOKEN en Netlify (Google Calendar reemplazó a Cal.com).
//
// Nota: la cita se guarda en la columna calcom_booking_uid de Supabase por
// compatibilidad con el esquema existente, pero ahora contiene el eventId
// de Google Calendar, no un uid de Cal.com.
// ============================================================

const { crearEventoCalendar, partesLima, limitesSemana, DURACION_SESION_MIN } = require('./_googlecalendar');

const SUPABASE_URL = 'https://gvtsfvedfjgauyxnyixr.supabase.co';

// Cuenta contra el mismo tope semanal que las sesiones fijas — entre
// ambas no puede haber más de esto en una misma semana (domingo a
// sábado).
const MAX_CLASES_POR_SEMANA = 3;

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
      `${SUPABASE_URL}/rest/v1/alumnas?id=eq.${userData.id}&select=nombre,email,direccion,recibir_invites_calendario`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const perfilData = await perfilResp.json();
    const miPerfil = Array.isArray(perfilData) && perfilData[0];
    const nombreAlumna = miPerfil && (miPerfil.nombre || miPerfil.email);
    const emailAlumna = miPerfil && miPerfil.email;
    const direccionAlumna = miPerfil && miPerfil.direccion;
    const notificarAlumna = !!(miPerfil && miPerfil.recibir_invites_calendario);
    if (!nombreAlumna || !emailAlumna) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, mensaje: 'No se encontró tu perfil (nombre/correo).' }) };
    }

    // 2. Máximo 3 sesiones por semana en total (fijas + puntuales) — cuenta
    // todo lo que ya tenga programado esa semana (domingo a sábado).
    const { fecha: fechaElegida } = partesLima(inicio);
    const { inicio: semInicio, fin: semFin } = limitesSemana(fechaElegida);
    const conteoResp = await fetch(
      `${SUPABASE_URL}/rest/v1/citas_fijas?alumna_id=eq.${userData.id}&estado=eq.programada&fecha=gte.${semInicio}&fecha=lte.${semFin}&select=id`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const conteoData = await conteoResp.json();
    const totalEsaSemana = Array.isArray(conteoData) ? conteoData.length : 0;
    if (totalEsaSemana >= MAX_CLASES_POR_SEMANA) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, mensaje: `Esa semana ya tienes ${MAX_CLASES_POR_SEMANA} sesiones programadas, que es el máximo permitido. Elige otra semana o cancela una de las que ya tienes.` }) };
    }

    // 3. Crea el evento en Google Calendar — uno solo, sin regla semanal
    // detrás. sendUpdates depende de si la alumna activó
    // recibir_invites_calendario (por defecto no le llega ningún correo).
    let eventId;
    try {
      const creado = await crearEventoCalendar({
        inicioUTC: inicio,
        finUTC: new Date(inicio.getTime() + DURACION_SESION_MIN * 60000),
        nombreAlumna: nombreAlumna,
        emailAlumna: emailAlumna,
        descripcion: 'Sesión puntual agendada desde el portal.',
        direccion: direccionAlumna || null,
        notificar: notificarAlumna,
      });
      eventId = creado.eventId;
    } catch (e) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, mensaje: e.message }) };
    }

    // 4. Guarda la cita en Supabase — sin horario_fijo_id, porque es suelta.
    const { fecha, hora } = partesLima(inicio); // fecha === fechaElegida de arriba
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
        calcom_booking_uid: eventId,
        estado: 'programada',
      }),
    });
    if (!citaResp.ok) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, mensaje: 'La sesión se creó en el calendario pero no se pudo guardar aquí. Escríbele a Kathia para que lo revise.' }) };
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, fecha, hora }) };
  } catch (err) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, mensaje: err.message }) };
  }
};
