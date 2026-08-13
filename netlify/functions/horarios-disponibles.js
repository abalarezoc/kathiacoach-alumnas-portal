// ============================================================
// Función serverless: horarios libres de Kathia (Cal.com), para
// que una alumna elija cuándo reagendar su clase.
//
// Se le pasa ?dias=14 (opcional, por defecto 14) y devuelve los
// horarios libres del evento "horario-fijo" en los próximos N días
// — es decir, lo que de verdad está libre en su calendario real,
// ya descontando sus otras alumnas con horario fijo y cualquier
// otra cosa que tenga agendada.
//
// Requiere CALCOM_API_KEY en Netlify.
// ============================================================

const { CALCOM_USERNAME, HORARIO_FIJO_SLUG, calcomHeaders } = require('./_calcom');

exports.handler = async function (event) {
  const CALCOM_API_KEY = process.env.CALCOM_API_KEY;
  if (!CALCOM_API_KEY) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, mensaje: 'Falta configurar CALCOM_API_KEY en Netlify.', slots: {} }) };
  }

  const params = (event.queryStringParameters) || {};
  const dias = Math.min(Math.max(parseInt(params.dias, 10) || 14, 1), 30);

  const ahora = new Date();
  const hasta = new Date(ahora.getTime() + dias * 24 * 3600000);

  try {
    const url = `https://api.cal.com/v2/slots?username=${CALCOM_USERNAME}&eventTypeSlug=${HORARIO_FIJO_SLUG}` +
      `&startTime=${encodeURIComponent(ahora.toISOString())}&endTime=${encodeURIComponent(hasta.toISOString())}`;
    const resp = await fetch(url, { headers: calcomHeaders(CALCOM_API_KEY) });
    const data = await resp.json();
    if (!resp.ok) {
      const msj = (data && data.error && data.error.message) || data.message || 'No se pudieron cargar los horarios.';
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, mensaje: msj, slots: {} }) };
    }
    const slots = (data && data.data && data.data.slots) || {};
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ ok: true, slots }) };
  } catch (err) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, mensaje: err.message, slots: {} }) };
  }
};
