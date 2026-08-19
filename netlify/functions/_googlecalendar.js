// ============================================================
// Utilidades compartidas para hablar con Google Calendar desde las
// funciones de horario fijo — reemplaza al embed de Cal.com.
//
// PENDIENTE DE CONFIGURAR (ver instrucciones entregadas por separado):
// Kathia tiene que entrar UNA SOLA VEZ a
// /.netlify/functions/google-oauth-start logueada con la cuenta de
// Google que quiere usar para su calendario de sesiones, aceptar el
// acceso, y copiar el refresh_token que le muestra
// google-oauth-callback.js — ese valor va en la variable de entorno
// GOOGLE_REFRESH_TOKEN de Netlify (junto con GOOGLE_CLIENT_ID y
// GOOGLE_CLIENT_SECRET, que puede ser el mismo proyecto de Google Cloud
// ya creado para Flor — solo hay que agregar la URL de callback de
// este sitio como "Authorized redirect URI" adicional). Con ese
// refresh_token pedimos un access_token nuevo en cada invocación (los
// access_token de Google duran ~1 hora, más simple pedir uno fresco
// que cachearlo entre invocaciones sin estado de una función
// serverless).
//
// CALENDAR_ID: por defecto usa 'primary' (el calendario principal de
// la cuenta de Google que autorice) para no depender de crear nada
// extra. Si Kathia prefiere usar un calendario secundario dedicado
// solo a sesiones (como se hizo con Flor, para no mezclar con su
// calendario personal), créalo en Google Calendar, y reemplaza este
// valor por su Calendar ID (Configuración del calendario -> Integrar
// calendario -> ID de calendario).
//
// Nada de esto se usa desde el navegador — solo desde otras
// funciones de Netlify.
// ============================================================

const CALENDAR_ID = 'primary';

// Duración por defecto de una sesión, en minutos. Confirmado por
// Augusto: las sesiones de Kathia duran 60 minutos.
const DURACION_SESION_MIN = 60;

// Lima (Perú) está siempre en UTC-5, sin horario de verano.
const LIMA_OFFSET_HOURS = 5;
const LIMA_TZ = 'America/Lima';

// ---- Autenticación: cambia el refresh_token por un access_token ----
async function googleAccessToken() {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    const err = new Error('Falta configurar GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_REFRESH_TOKEN en Netlify.');
    err.esConfiguracion = true;
    throw err;
  }
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }).toString(),
  });
  const data = await resp.json();
  if (!resp.ok || !data.access_token) {
    const msj = data.error_description || data.error || 'Google no devolvió un access_token.';
    throw new Error(`No se pudo renovar el acceso a Google Calendar: ${msj}`);
  }
  return data.access_token;
}

function googleHeaders(accessToken) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };
}

// ---- Crear un evento. Por defecto sendUpdates:'none' evita que Google
// le mande correo de confirmación a Kathia o a la alumna — cada alumna
// puede optar por recibir esos correos (alumnas.recibir_invites_calendario),
// en cuyo caso el llamador pasa notificar:true y usamos sendUpdates:'all'. ----
async function crearEventoCalendar({ inicioUTC, finUTC, nombreAlumna, emailAlumna, descripcion, direccion, notificar }) {
  const accessToken = await googleAccessToken();
  const fin = finUTC || new Date(inicioUTC.getTime() + DURACION_SESION_MIN * 60000);
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?sendUpdates=${notificar ? 'all' : 'none'}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: googleHeaders(accessToken),
    body: JSON.stringify({
      summary: `Sesión — ${nombreAlumna}`,
      description: descripcion || 'Sesión de entrenamiento agendada desde el portal de Kathia.',
      // Si la alumna tiene dirección registrada (por ejemplo, si Kathia
      // da sesiones a domicilio), queda como ubicación del evento (se ve
      // en Google Calendar y en Maps con un tap). Si no aplica a cómo
      // trabaja Kathia, simplemente queda sin ubicación.
      location: direccion || undefined,
      start: { dateTime: inicioUTC.toISOString(), timeZone: LIMA_TZ },
      end: { dateTime: fin.toISOString(), timeZone: LIMA_TZ },
      attendees: emailAlumna ? [{ email: emailAlumna, displayName: nombreAlumna }] : [],
      // guestsCanModify/InviteOthers en false porque esto lo administra
      // el sistema, no las alumnas desde Google directamente.
      guestsCanModify: false,
      guestsCanInviteOthers: false,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    const msj = (data && data.error && data.error.message) || 'No se pudo crear el evento en Google Calendar.';
    throw new Error(msj);
  }
  return { eventId: data.id };
}

// ---- Cancelar (borrar) un evento. `notificar` (opcional) controla si
// Google le manda a la alumna el correo de cancelación. ----
async function cancelarEventoCalendar(eventId, notificar) {
  const accessToken = await googleAccessToken();
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(eventId)}?sendUpdates=${notificar ? 'all' : 'none'}`;
  const resp = await fetch(url, { method: 'DELETE', headers: googleHeaders(accessToken) });
  // Google responde 204 sin cuerpo si sale bien. 410 ("Gone") significa que
  // ya no existe — lo tratamos como éxito, porque el resultado que
  // queríamos (que no exista) ya se cumple.
  if (!resp.ok && resp.status !== 410) {
    let msj = 'No se pudo cancelar el evento en Google Calendar.';
    try { const data = await resp.json(); msj = (data && data.error && data.error.message) || msj; } catch (e) {}
    throw new Error(msj);
  }
}

// ---- Reagendar: mueve el mismo evento a otro horario (a diferencia
// de Cal.com, el eventId NO cambia — mucho más simple de rastrear). ----
async function reagendarEventoCalendar(eventId, { inicioUTC, finUTC, notificar }) {
  const accessToken = await googleAccessToken();
  const fin = finUTC || new Date(inicioUTC.getTime() + DURACION_SESION_MIN * 60000);
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(eventId)}?sendUpdates=${notificar ? 'all' : 'none'}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: googleHeaders(accessToken),
    body: JSON.stringify({
      start: { dateTime: inicioUTC.toISOString(), timeZone: LIMA_TZ },
      end: { dateTime: fin.toISOString(), timeZone: LIMA_TZ },
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    const msj = (data && data.error && data.error.message) || 'No se pudo reagendar el evento en Google Calendar.';
    throw new Error(msj);
  }
  return { eventId: data.id };
}

// ---- Listar eventos futuros — equivalente a GET /v2/bookings de
// Cal.com (lo usa proximas-citas.js para el panel de Kathia). ----
async function listaEventosCalendar({ desdeUTC, hastaUTC, maxResultados } = {}) {
  const accessToken = await googleAccessToken();
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: (desdeUTC || new Date()).toISOString(),
    maxResults: String(maxResultados || 50),
  });
  if (hastaUTC) params.set('timeMax', hastaUTC.toISOString());
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${params.toString()}`;
  const resp = await fetch(url, { headers: googleHeaders(accessToken) });
  const data = await resp.json();
  if (!resp.ok) {
    const msj = (data && data.error && data.error.message) || 'No se pudieron listar los eventos de Google Calendar.';
    throw new Error(msj);
  }
  return Array.isArray(data.items) ? data.items : [];
}

// ---- Averiguar qué está ocupado en un rango — para calcular horarios
// libres (equivalente al GET /v2/slots de Cal.com, pero acá Google solo
// da ocupado/libre; el cálculo de "slots" concretos según el horario
// de atención de Kathia hay que armarlo en horarios-disponibles.js). ----
async function freebusyCalendar(desdeUTC, hastaUTC) {
  const accessToken = await googleAccessToken();
  const resp = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: googleHeaders(accessToken),
    body: JSON.stringify({
      timeMin: desdeUTC.toISOString(),
      timeMax: hastaUTC.toISOString(),
      timeZone: LIMA_TZ,
      items: [{ id: CALENDAR_ID }],
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    const msj = (data && data.error && data.error.message) || 'No se pudo consultar la disponibilidad en Google Calendar.';
    throw new Error(msj);
  }
  const calInfo = data.calendars && data.calendars[CALENDAR_ID];
  // Lista de intervalos ocupados: [{ start: ISOString, end: ISOString }, ...]
  return (calInfo && calInfo.busy) || [];
}

// ---- Helpers de fecha (idénticos a los de _calcom.js — son
// independientes del proveedor de calendario, así que se reusan tal
// cual para no duplicar lógica ni arriesgar inconsistencias). ----
function proximaOcurrenciaUTC(diaSemana, horaStr, desdeUTC) {
  const [hh, mm] = horaStr.split(':').map(Number);
  const base = desdeUTC || new Date();
  const limaMs = base.getTime() - LIMA_OFFSET_HOURS * 3600000;
  const limaAhora = new Date(limaMs);
  const diaActual = limaAhora.getUTCDay();
  let diff = (diaSemana - diaActual + 7) % 7;
  let candidata = new Date(Date.UTC(
    limaAhora.getUTCFullYear(), limaAhora.getUTCMonth(), limaAhora.getUTCDate() + diff,
    hh, mm, 0, 0
  ));
  if (diff === 0 && candidata.getTime() <= limaMs) {
    candidata = new Date(candidata.getTime() + 7 * 24 * 3600000);
  }
  return new Date(candidata.getTime() + LIMA_OFFSET_HOURS * 3600000);
}

function masSemanas(fechaUTC, n) {
  return new Date(fechaUTC.getTime() + n * 7 * 24 * 3600000);
}

function limaAUTC(fecha, horaStr) {
  const [hh, mm] = horaStr.split(':').map(Number);
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0) + LIMA_OFFSET_HOURS * 3600000);
}

function partesLima(fechaUTC) {
  const limaMs = fechaUTC.getTime() - LIMA_OFFSET_HOURS * 3600000;
  const d = new Date(limaMs);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    fecha: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    hora: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

function sumarDiasFecha(fecha, dias) {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + dias);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function limitesSemana(fecha) {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const inicio = new Date(dt.getTime() - dow * 86400000);
  const fin = new Date(inicio.getTime() + 6 * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (x) => `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
  return { inicio: fmt(inicio), fin: fmt(fin) };
}

module.exports = {
  CALENDAR_ID,
  DURACION_SESION_MIN,
  LIMA_OFFSET_HOURS,
  googleAccessToken,
  crearEventoCalendar,
  cancelarEventoCalendar,
  reagendarEventoCalendar,
  listaEventosCalendar,
  freebusyCalendar,
  proximaOcurrenciaUTC,
  masSemanas,
  partesLima,
  limaAUTC,
  sumarDiasFecha,
  limitesSemana,
};
