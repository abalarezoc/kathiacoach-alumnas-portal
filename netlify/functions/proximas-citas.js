// ============================================================
// Función serverless: próximas citas de Kathia (Google Calendar).
//
// Consulta el calendario desde el servidor (nunca desde el navegador)
// para no exponer las credenciales. El panel de admin la llama en
// /.netlify/functions/proximas-citas y recibe una lista simple, ya
// lista para mostrar.
//
// Requiere GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN
// en Netlify (Google Calendar reemplazó a Cal.com). Sin ellas, la
// función responde "configurado: false" sin error.
// ============================================================

const { listaEventosCalendar } = require('./_googlecalendar');

exports.handler = async function () {
  const configurado = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);

  if (!configurado) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configurado: false, citas: [] }),
    };
  }

  try {
    const eventos = await listaEventosCalendar({ desdeUTC: new Date(), maxResultados: 50 });

    const citas = eventos
      .map((e) => ({
        titulo: e.summary || 'Sesión',
        inicio: (e.start && (e.start.dateTime || e.start.date)) || null,
        fin: (e.end && (e.end.dateTime || e.end.date)) || null,
        estado: e.status || null,
        asistente: (e.attendees && e.attendees[0] && e.attendees[0].displayName) || null,
        email: (e.attendees && e.attendees[0] && e.attendees[0].email) || null,
        ubicacion: e.location || null,
      }))
      .filter((c) => c.inicio)
      .sort((x, y) => new Date(x.inicio) - new Date(y.inicio));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ configurado: true, error: false, citas }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configurado: true, error: true, mensaje: err.message, citas: [] }),
    };
  }
};
