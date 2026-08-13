// ============================================================
// Función serverless: la alumna confirma "todo sigue igual" cuando
// le aparece el recordatorio suave en su portal. De paso, puede
// elegir cada cuánto quiere que se le vuelva a preguntar (o nunca).
//
// No toca nada en Cal.com — las clases se siguen reservando solas
// de fondo (eso lo hace renovar-horarios-fijos.js). Esto solo
// actualiza cuándo (y si) se le vuelve a mostrar el aviso.
//
// Requiere SUPABASE_SERVICE_ROLE_KEY en Netlify.
// ============================================================

const { sumarDiasFecha, partesLima } = require('./_calcom');

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
    return { statusCode: 400, body: JSON.stringify({ ok: false, mensaje: 'Falta el horario a confirmar.' }) };
  }
  const INTERVALOS_VALIDOS = [0, 30, 60, 90];
  const intervalo = INTERVALOS_VALIDOS.includes(Number(body.intervaloDias)) ? Number(body.intervaloDias) : 30;

  try {
    // 1. Confirma quién llama.
    const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    const userData = await userResp.json();
    if (!userResp.ok || !userData || !userData.id) {
      return { statusCode: 401, body: JSON.stringify({ ok: false, mensaje: 'Sesión inválida.' }) };
    }

    // 2. Confirma que el horario es SUYO.
    const horarioResp = await fetch(
      `${SUPABASE_URL}/rest/v1/horario_fijo?id=eq.${horarioFijoId}&select=id,alumna_id`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const horarioRows = await horarioResp.json();
    const horario = Array.isArray(horarioRows) && horarioRows[0];
    if (!horario) {
      return { statusCode: 404, body: JSON.stringify({ ok: false, mensaje: 'No se encontró ese horario.' }) };
    }
    if (horario.alumna_id !== userData.id) {
      return { statusCode: 403, body: JSON.stringify({ ok: false, mensaje: 'Ese horario no es tuyo.' }) };
    }

    // 3. Guarda su preferencia de frecuencia y empuja la fecha del próximo
    // aviso. Si eligió "nunca" (0), igual le ponemos una fecha bien lejana
    // de respaldo — pero lo que realmente apaga el aviso es el intervalo.
    const hoyLima = partesLima(new Date()).fecha;
    const nuevaFecha = sumarDiasFecha(hoyLima, intervalo > 0 ? intervalo : 3650);
    await fetch(`${SUPABASE_URL}/rest/v1/horario_fijo?id=eq.${horarioFijoId}`, {
      method: 'PATCH',
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ proxima_confirmacion: nuevaFecha, recordatorio_intervalo_dias: intervalo }),
    });

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, proximaConfirmacion: nuevaFecha, intervaloDias: intervalo }) };
  } catch (err) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, mensaje: err.message }) };
  }
};
