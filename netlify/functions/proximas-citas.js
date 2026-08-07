// ============================================================
// Función serverless: próximas citas de Kathia (Cal.com)
//
// Consulta la API de Cal.com desde el servidor (nunca desde el
// navegador) para no exponer la API key. El panel de admin la
// llama en /.netlify/functions/proximas-citas y recibe una lista
// simple, ya lista para mostrar.
//
// Requiere la variable de entorno CALCOM_API_KEY, configurada en
// Netlify → Site settings → Environment variables. Sin esa
// variable, la función responde "configurado: false" sin error.
// ============================================================

exports.handler = async function () {
  const apiKey = process.env.CALCOM_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configurado: false, citas: [] }),
    };
  }

  try {
    const resp = await fetch('https://api.cal.com/v2/bookings?status=upcoming&take=50', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'cal-api-version': '2024-08-13',
      },
    });

    const data = await resp.json();

    if (!resp.ok) {
      const mensaje = (data && data.error && data.error.message) || data.message || 'No se pudo consultar Cal.com.';
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configurado: true, error: true, mensaje, citas: [] }),
      };
    }

    const lista = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];

    const citas = lista
      .map((b) => ({
        titulo: b.title || 'Sesión',
        inicio: b.start || b.startTime || null,
        fin: b.end || b.endTime || null,
        estado: b.status || null,
        asistente: (b.attendees && b.attendees[0] && b.attendees[0].name) || null,
        email: (b.attendees && b.attendees[0] && b.attendees[0].email) || null,
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
