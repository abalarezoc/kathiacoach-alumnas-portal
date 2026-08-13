// ============================================================
// Función PROGRAMADA (no la llama nadie desde el navegador): corre
// sola todos los días y le va agregando semanas nuevas a cada
// horario fijo activo, para que a las alumnas nunca se les acabe
// el calendario sin avisar.
//
// Cada horario fijo se creó originalmente con 12 semanas (unos 3
// meses) de clases ya reservadas en Cal.com. Cada vez que corre
// esta función, revisa cuántas clases "programada" le quedan por
// delante a cada horario; si le quedan menos de UMBRAL_SEMANAS,
// crea las que falten para volver a tener OBJETIVO_SEMANAS por
// delante — continuando la cadena semanal desde la última clase
// que ya existe (así nunca hay huecos ni choques de fecha).
//
// Se programa sola desde netlify.toml (schedule = "@daily"), no
// hace falta que nadie la ejecute a mano.
//
// Requiere SUPABASE_SERVICE_ROLE_KEY y CALCOM_API_KEY en Netlify.
// ============================================================

const {
  CALCOM_USERNAME, HORARIO_FIJO_SLUG,
  calcomHeaders, proximaOcurrenciaUTC, masSemanas, partesLima, limaAUTC,
} = require('./_calcom');

const SUPABASE_URL = 'https://gvtsfvedfjgauyxnyixr.supabase.co';
const UMBRAL_SEMANAS = 4;
const OBJETIVO_SEMANAS = 12;

exports.handler = async function () {
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const CALCOM_API_KEY = process.env.CALCOM_API_KEY;
  if (!SERVICE_ROLE_KEY || !CALCOM_API_KEY) {
    console.log('renovar-horarios-fijos: falta SUPABASE_SERVICE_ROLE_KEY o CALCOM_API_KEY, no se hizo nada.');
    return { statusCode: 200, body: 'ok' };
  }

  const sbHeaders = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
  const sbHeadersJSON = { ...sbHeaders, 'Content-Type': 'application/json' };
  const hoyLima = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);

  try {
    // 1. Todos los horarios fijos activos.
    const horariosResp = await fetch(
      `${SUPABASE_URL}/rest/v1/horario_fijo?activo=eq.true&select=id,alumna_id,dia_semana,hora`,
      { headers: sbHeaders }
    );
    const horarios = await horariosResp.json();
    if (!Array.isArray(horarios) || horarios.length === 0) {
      console.log('renovar-horarios-fijos: no hay horarios fijos activos.');
      return { statusCode: 200, body: 'ok' };
    }

    let renovados = 0;

    for (const horario of horarios) {
      // 2. Cuántas clases "programada" le quedan por delante.
      const futurasResp = await fetch(
        `${SUPABASE_URL}/rest/v1/citas_fijas?horario_fijo_id=eq.${horario.id}&estado=eq.programada&fecha=gte.${hoyLima}&select=id`,
        { headers: sbHeaders }
      );
      const futuras = await futurasResp.json();
      const cantFuturas = Array.isArray(futuras) ? futuras.length : 0;
      if (cantFuturas >= UMBRAL_SEMANAS) continue; // todavía tiene suficiente colchón

      const faltan = OBJETIVO_SEMANAS - cantFuturas;
      if (faltan <= 0) continue;

      // 3. Última clase que ya existe para este horario (cualquier estado),
      // para seguir la cadena semanal justo después, sin huecos ni choques.
      const ultimaResp = await fetch(
        `${SUPABASE_URL}/rest/v1/citas_fijas?horario_fijo_id=eq.${horario.id}&select=fecha,hora&order=fecha.desc,hora.desc&limit=1`,
        { headers: sbHeaders }
      );
      const ultimaRows = await ultimaResp.json();
      const ultima = Array.isArray(ultimaRows) && ultimaRows[0];
      const baseUTC = ultima ? limaAUTC(ultima.fecha, ultima.hora) : proximaOcurrenciaUTC(horario.dia_semana, horario.hora);
      const primeraNuevaUTC = ultima ? masSemanas(baseUTC, 1) : baseUTC;

      // 4. Datos de la alumna, para el nombre/correo del asistente en Cal.com.
      const alumnaResp = await fetch(
        `${SUPABASE_URL}/rest/v1/alumnas?id=eq.${horario.alumna_id}&select=nombre,email`,
        { headers: sbHeaders }
      );
      const alumnaRows = await alumnaResp.json();
      const alumna = Array.isArray(alumnaRows) && alumnaRows[0];
      if (!alumna || !alumna.email) { console.log(`renovar-horarios-fijos: sin datos de alumna para horario ${horario.id}, se salta.`); continue; }

      // 5. Crea, una por una, las clases que faltan.
      const creadas = [];
      for (let i = 0; i < faltan; i++) {
        const inicioUTC = masSemanas(primeraNuevaUTC, i);
        try {
          const bookingResp = await fetch('https://api.cal.com/v2/bookings', {
            method: 'POST',
            headers: calcomHeaders(CALCOM_API_KEY),
            body: JSON.stringify({
              eventTypeSlug: HORARIO_FIJO_SLUG,
              username: CALCOM_USERNAME,
              start: inicioUTC.toISOString(),
              attendee: { name: alumna.nombre || alumna.email, email: alumna.email, timeZone: 'America/Lima' },
            }),
          });
          const bookingData = await bookingResp.json();
          if (!bookingResp.ok) continue;
          const booking = (bookingData && bookingData.data) || bookingData;
          const uid = booking && (booking.uid || (Array.isArray(booking) && booking[0] && booking[0].uid));
          if (!uid) continue;
          const { fecha, hora } = partesLima(inicioUTC);
          creadas.push({ fecha, hora, calcom_booking_uid: uid });
        } catch (e) { /* seguimos con la siguiente semana */ }
      }

      if (creadas.length === 0) { console.log(`renovar-horarios-fijos: no se pudo crear ninguna clase nueva para horario ${horario.id}.`); continue; }

      await fetch(`${SUPABASE_URL}/rest/v1/citas_fijas`, {
        method: 'POST',
        headers: sbHeadersJSON,
        body: JSON.stringify(creadas.map(c => ({
          alumna_id: horario.alumna_id,
          horario_fijo_id: horario.id,
          fecha: c.fecha,
          hora: c.hora,
          calcom_booking_uid: c.calcom_booking_uid,
          estado: 'programada',
        }))),
      });

      renovados++;
      console.log(`renovar-horarios-fijos: horario ${horario.id} renovado con ${creadas.length} clase(s) nueva(s).`);
    }

    console.log(`renovar-horarios-fijos: listo, ${renovados} horario(s) renovado(s) de ${horarios.length} activo(s).`);
    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.log('renovar-horarios-fijos: error — ' + err.message);
    return { statusCode: 200, body: 'error' };
  }
};
