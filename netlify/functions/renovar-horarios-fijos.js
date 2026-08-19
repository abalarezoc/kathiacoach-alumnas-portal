// ============================================================
// Función PROGRAMADA (no la llama nadie desde el navegador): corre
// sola todos los días y le va agregando semanas nuevas a cada
// horario fijo activo, para que a las alumnas nunca se les acabe
// el calendario sin avisar.
//
// Cada horario fijo se creó originalmente con unas pocas sesiones ya
// reservadas en Google Calendar. Cada vez que corre esta función,
// revisa cuántas sesiones "programada" le quedan por delante a cada
// horario; si le quedan menos de UMBRAL_SEMANAS, crea las que falten
// para volver a tener OBJETIVO_SEMANAS por delante — continuando la
// cadena semanal desde la última sesión que ya existe (así nunca hay
// huecos ni choques de fecha).
//
// Se programa sola desde netlify.toml (schedule = "@daily"), no
// hace falta que nadie la ejecute a mano.
//
// Requiere SUPABASE_SERVICE_ROLE_KEY y GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/
// GOOGLE_REFRESH_TOKEN en Netlify (Google Calendar reemplazó a Cal.com).
// ============================================================

const {
  crearEventoCalendar,
  proximaOcurrenciaUTC, masSemanas, partesLima, limaAUTC, DURACION_SESION_MIN,
} = require('./_googlecalendar');

const SUPABASE_URL = 'https://gvtsfvedfjgauyxnyixr.supabase.co';
const UMBRAL_SEMANAS = 4;
const OBJETIVO_SEMANAS = 12;

exports.handler = async function () {
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_ROLE_KEY) {
    console.log('renovar-horarios-fijos: falta SUPABASE_SERVICE_ROLE_KEY, no se hizo nada.');
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
      // 2. Cuántas sesiones "programada" le quedan por delante.
      const futurasResp = await fetch(
        `${SUPABASE_URL}/rest/v1/citas_fijas?horario_fijo_id=eq.${horario.id}&estado=eq.programada&fecha=gte.${hoyLima}&select=id`,
        { headers: sbHeaders }
      );
      const futuras = await futurasResp.json();
      const cantFuturas = Array.isArray(futuras) ? futuras.length : 0;
      if (cantFuturas >= UMBRAL_SEMANAS) continue; // todavía tiene suficiente colchón

      const faltan = OBJETIVO_SEMANAS - cantFuturas;
      if (faltan <= 0) continue;

      // 3. Última sesión que ya existe para este horario (cualquier estado),
      // para seguir la cadena semanal justo después, sin huecos ni choques.
      const ultimaResp = await fetch(
        `${SUPABASE_URL}/rest/v1/citas_fijas?horario_fijo_id=eq.${horario.id}&select=fecha,hora&order=fecha.desc,hora.desc&limit=1`,
        { headers: sbHeaders }
      );
      const ultimaRows = await ultimaResp.json();
      const ultima = Array.isArray(ultimaRows) && ultimaRows[0];
      const baseUTC = ultima ? limaAUTC(ultima.fecha, ultima.hora) : proximaOcurrenciaUTC(horario.dia_semana, horario.hora);
      const primeraNuevaUTC = ultima ? masSemanas(baseUTC, 1) : baseUTC;

      // 4. Datos de la alumna, para el nombre/correo del asistente del evento.
      const alumnaResp = await fetch(
        `${SUPABASE_URL}/rest/v1/alumnas?id=eq.${horario.alumna_id}&select=nombre,email,direccion,recibir_invites_calendario`,
        { headers: sbHeaders }
      );
      const alumnaRows = await alumnaResp.json();
      const alumna = Array.isArray(alumnaRows) && alumnaRows[0];
      if (!alumna || !alumna.email) { console.log(`renovar-horarios-fijos: sin datos de alumna para horario ${horario.id}, se salta.`); continue; }

      // 5. Crea, una por una, las sesiones que faltan.
      const creadas = [];
      for (let i = 0; i < faltan; i++) {
        const inicioUTC = masSemanas(primeraNuevaUTC, i);
        try {
          const { eventId } = await crearEventoCalendar({
            inicioUTC,
            finUTC: new Date(inicioUTC.getTime() + DURACION_SESION_MIN * 60000),
            nombreAlumna: alumna.nombre || alumna.email,
            emailAlumna: alumna.email,
            descripcion: 'Sesión de horario fijo (renovación automática).',
            direccion: alumna.direccion || null,
            notificar: !!alumna.recibir_invites_calendario,
          });
          const { fecha, hora } = partesLima(inicioUTC);
          creadas.push({ fecha, hora, calcom_booking_uid: eventId });
        } catch (e) { /* seguimos con la siguiente semana */ }
      }

      if (creadas.length === 0) { console.log(`renovar-horarios-fijos: no se pudo crear ninguna sesión nueva para horario ${horario.id}.`); continue; }

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
      console.log(`renovar-horarios-fijos: horario ${horario.id} renovado con ${creadas.length} sesión(s) nueva(s).`);
    }

    console.log(`renovar-horarios-fijos: listo, ${renovados} horario(s) renovado(s) de ${horarios.length} activo(s).`);
    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    console.log('renovar-horarios-fijos: error — ' + err.message);
    return { statusCode: 200, body: 'error' };
  }
};
