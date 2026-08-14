// ============================================================
// Utilidades compartidas para hablar con Cal.com desde las
// funciones de horario fijo. Nada de esto se usa desde el
// navegador — solo desde otras funciones de Netlify.
// ============================================================

const CALCOM_API_VERSION = '2024-08-13';
const CALCOM_USERNAME = 'kathiacoach';
const HORARIO_FIJO_SLUG = 'horario-fijo';

// Lima (Perú) está siempre en UTC-5, sin horario de verano.
const LIMA_OFFSET_HOURS = 5;

function calcomHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'cal-api-version': CALCOM_API_VERSION,
  };
}

// Dada una hora de pared en Lima (ej. día=2 martes, "18:00"), calcula la
// próxima fecha/hora en UTC en que ocurre esa combinación día+hora.
// Si hoy mismo es ese día pero la hora ya pasó, salta a la semana siguiente.
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

// Suma N semanas (en milisegundos) a una fecha UTC.
function masSemanas(fechaUTC, n) {
  return new Date(fechaUTC.getTime() + n * 7 * 24 * 3600000);
}

// Lo inverso de partesLima: dada una fecha+hora de pared en Lima
// ('YYYY-MM-DD', 'HH:MM'), calcula el instante UTC correspondiente.
function limaAUTC(fecha, horaStr) {
  const [hh, mm] = horaStr.split(':').map(Number);
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm, 0, 0) + LIMA_OFFSET_HOURS * 3600000);
}

// Separa una fecha UTC en { fecha: 'YYYY-MM-DD', hora: 'HH:MM' } tal como
// se ve en la hora de pared de Lima (para guardar en Supabase).
function partesLima(fechaUTC) {
  const limaMs = fechaUTC.getTime() - LIMA_OFFSET_HOURS * 3600000;
  const d = new Date(limaMs);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    fecha: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    hora: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

// Suma N días (calendario, sin horas) a una fecha 'YYYY-MM-DD'.
function sumarDiasFecha(fecha, dias) {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + dias);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// Dada una fecha 'YYYY-MM-DD', calcula el domingo y el sábado de esa
// misma semana (0=domingo, como en dia_semana) — para contar cuántas
// clases tiene una alumna en la semana de una fecha dada.
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
  CALCOM_API_VERSION,
  CALCOM_USERNAME,
  HORARIO_FIJO_SLUG,
  LIMA_OFFSET_HOURS,
  calcomHeaders,
  proximaOcurrenciaUTC,
  masSemanas,
  partesLima,
  limaAUTC,
  sumarDiasFecha,
  limitesSemana,
};
