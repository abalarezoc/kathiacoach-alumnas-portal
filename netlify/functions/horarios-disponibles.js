// ============================================================
// Función serverless: horarios libres de Kathia (Google Calendar), para
// que una alumna elija cuándo agendar o reagendar una sesión.
//
// Se le pasa ?dias=14 (opcional, por defecto 14) y devuelve los
// horarios libres dentro del horario de atención configurado abajo,
// en los próximos N días — descontando lo que ya está ocupado en el
// calendario real de Kathia (freebusy de Google).
//
// A diferencia de Cal.com (que ya devolvía "slots" armados desde la
// configuración del tipo de evento), Google Calendar solo dice
// ocupado/libre — el horario de atención hay que definirlo acá.
//
// Horario real de Kathia (según su disponibilidad ya cargada en Cal.com,
// confirmada en Notion — Cronograma de Trabajo, semana 1): son los huecos
// libres entre sus clases presenciales fijas (AquaGym/domicilio), con
// buffer de traslado ya restado. El sábado se ajustó a 10:30am-12pm para
// no trabajar después del mediodía. Si Kathia cambia sus horarios
// presenciales, este horario hay que actualizarlo a mano.
//
// Requiere GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN
// en Netlify (Google Calendar reemplazó al embed de Cal.com).
// ============================================================

const { freebusyCalendar, DURACION_SESION_MIN, LIMA_OFFSET_HOURS } = require('./_googlecalendar');

// dia_semana: 0=domingo, 1=lunes, ..., 6=sábado — igual que en horario_fijo.
// Cada día puede tener una o más franjas [desde, hasta) en hora de pared
// de Lima. Un día sin franjas (o ausente) significa que no atiende ese día.
const HORARIO_ATENCION = {
  0: [], // domingo: cerrado
  1: [{ desde: '09:00', hasta: '11:00' }, { desde: '13:00', hasta: '18:30' }], // lunes
  2: [{ desde: '09:00', hasta: '16:00' }], // martes
  3: [{ desde: '09:00', hasta: '11:00' }, { desde: '13:00', hasta: '18:30' }], // miércoles
  4: [{ desde: '09:00', hasta: '16:00' }], // jueves
  5: [{ desde: '09:00', hasta: '11:00' }, { desde: '13:00', hasta: '19:00' }], // viernes
  6: [{ desde: '10:30', hasta: '12:00' }], // sábado
};

// Cada cuánto se ofrece un horario nuevo dentro de una franja — usamos la
// misma duración que una sesión, para no ofrecer horarios que se pisen.
const SLOT_INTERVALO_MIN = DURACION_SESION_MIN;

function limaAUTC(fecha, horaStr) {
  const [hh, mm] = horaStr.split(':').map(Number);
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0) + LIMA_OFFSET_HOURS * 3600000);
}

function sumarDiasFecha(fecha, dias) {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + dias);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

exports.handler = async function (event) {
  const configurado = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
  if (!configurado) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, mensaje: 'Falta configurar la integración con Google Calendar en Netlify.', slots: {} }) };
  }

  const params = (event.queryStringParameters) || {};
  const dias = Math.min(Math.max(parseInt(params.dias, 10) || 14, 1), 30);

  const ahora = new Date();
  const hoyLima = new Date(ahora.getTime() - LIMA_OFFSET_HOURS * 3600000).toISOString().slice(0, 10);
  const hastaUTC = new Date(ahora.getTime() + dias * 24 * 3600000);

  try {
    // 1. Trae de una sola vez todo lo ocupado en el rango completo —
    // más eficiente que una consulta de freebusy por cada franja.
    const ocupados = await freebusyCalendar(ahora, hastaUTC);
    const ocupadosMs = ocupados.map(o => ({ inicio: new Date(o.start).getTime(), fin: new Date(o.end).getTime() }));

    const seChoca = (inicioMs, finMs) =>
      ocupadosMs.some(o => inicioMs < o.fin && finMs > o.inicio);

    // 2. Genera candidatos día por día según HORARIO_ATENCION.
    const slots = {};
    for (let i = 0; i < dias; i++) {
      const fecha = sumarDiasFecha(hoyLima, i);
      const [y, m, d] = fecha.split('-').map(Number);
      const diaSemana = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      const franjas = HORARIO_ATENCION[diaSemana] || [];
      if (!franjas.length) continue;

      const candidatos = [];
      for (const franja of franjas) {
        let cursor = limaAUTC(fecha, franja.desde);
        const finFranjaUTC = limaAUTC(fecha, franja.hasta);
        while (cursor.getTime() + SLOT_INTERVALO_MIN * 60000 <= finFranjaUTC.getTime()) {
          const inicioMs = cursor.getTime();
          const finMs = inicioMs + DURACION_SESION_MIN * 60000;
          if (inicioMs > ahora.getTime() && !seChoca(inicioMs, finMs)) {
            candidatos.push({ start: new Date(inicioMs).toISOString() });
          }
          cursor = new Date(cursor.getTime() + SLOT_INTERVALO_MIN * 60000);
        }
      }
      if (candidatos.length) slots[fecha] = candidatos;
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ ok: true, slots }) };
  } catch (err) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, mensaje: err.message, slots: {} }) };
  }
};
