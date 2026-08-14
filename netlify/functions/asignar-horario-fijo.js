// ============================================================
// Función serverless: crea un horario fijo semanal permanente.
//
// La llama la propia alumna desde su portal, después de elegir uno
// de los horarios que le mostró horarios-disponibles.js (es decir,
// sobre la base de lo que Kathia realmente tiene libre). Crea, una
// por una, las próximas clases en Cal.com (por defecto 12 — unas 3
// meses) en el día y hora elegidos, y las guarda en "citas_fijas"
// para poder reagendar o cancelar cada sesión después.
//
// Si quien llama es una cuenta administradora y manda un alumnaId
// distinto al suyo (junto con nombreAlumna/emailAlumna), se asigna
// para esa alumna en su lugar — un modo de respaldo para Kathia,
// pero el camino normal es que cada alumna elija el suyo.
//
// Requiere las variables de entorno SUPABASE_SERVICE_ROLE_KEY y
// CALCOM_API_KEY, configuradas en Netlify -> Site settings ->
// Environment variables. Sin ellas, responde con un aviso claro.
// ============================================================

const {
  CALCOM_USERNAME, HORARIO_FIJO_SLUG,
  calcomHeaders, proximaOcurrenciaUTC, masSemanas, partesLima, sumarDiasFecha,
} = require('./_calcom');

const SUPABASE_URL = 'https://gvtsfvedfjgauyxnyixr.supabase.co';

// Netlify corta las funciones normales a los 10 segundos. Crear muchas
// clases en Cal.com una por una (esperando cada respuesta) tarda más que
// eso, y el navegador recibe una página de error en vez de una respuesta
// — por eso al elegir horario fallaba con "Unexpected token '<'".
//
// Por eso acá solo se crean unas pocas clases de entrada (rápido, bien
// dentro del límite) y dejamos que renovar-horarios-fijos.js (que corre
// sola todos los días) le añada el resto hasta llegar a las 12 semanas
// de colchón — para que el cron la note hay que dejarla por debajo de su
// UMBRAL_SEMANAS (4), si no se queda estancada en este número para siempre.
const SEMANAS_POR_DEFECTO = 3;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, mensaje: 'Método no permitido.' }) };
  }

  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const CALCOM_API_KEY = process.env.CALCOM_API_KEY;
  if (!SERVICE_ROLE_KEY || !CALCOM_API_KEY) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        mensaje: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY o CALCOM_API_KEY en Netlify.',
      }),
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, mensaje: 'Falta la sesión.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, mensaje: 'Solicitud inválida.' }) };
  }

  const { diaSemana, hora } = body;
  const semanas = Number(body.semanas) > 0 ? Math.min(Number(body.semanas), 26) : SEMANAS_POR_DEFECTO;

  if (diaSemana == null || !hora) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, mensaje: 'Faltan datos: día u hora.' }) };
  }
  if (diaSemana < 0 || diaSemana > 6 || !/^\d{2}:\d{2}$/.test(hora)) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, mensaje: 'Día u hora inválidos.' }) };
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
      `${SUPABASE_URL}/rest/v1/alumnas?id=eq.${userData.id}&select=es_admin,nombre,email`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const perfilData = await perfilResp.json();
    const miPerfil = Array.isArray(perfilData) && perfilData[0];
    const esAdmin = miPerfil && miPerfil.es_admin;

    // 2. Determina para quién es el horario: normalmente para quien llama
    // (la propia alumna). Solo si es admin y manda un alumnaId distinto al
    // suyo, se asigna para esa otra alumna (modo de respaldo).
    let alumnaId = userData.id;
    let nombreAlumna = miPerfil && (miPerfil.nombre || miPerfil.email);
    let emailAlumna = miPerfil && miPerfil.email;

    if (esAdmin && body.alumnaId && body.alumnaId !== userData.id) {
      if (!body.nombreAlumna || !body.emailAlumna) {
        return { statusCode: 400, body: JSON.stringify({ ok: false, mensaje: 'Faltan datos de la alumna.' }) };
      }
      alumnaId = body.alumnaId;
      nombreAlumna = body.nombreAlumna;
      emailAlumna = body.emailAlumna;
    }

    if (!nombreAlumna || !emailAlumna) {
      return { statusCode: 400, body: JSON.stringify({ ok: false, mensaje: 'No se encontró tu perfil (nombre/correo).' }) };
    }

    // 3. Una alumna puede tener más de un horario fijo a la vez (por
    // ejemplo, lunes y viernes). Si viene reemplazar:true con un
    // horarioFijoId puntual, se cancela SOLO ese horario viejo antes de
    // crear el nuevo (lo usa el aviso del portal cuando decide cambiar
    // uno de sus horarios). Si no, simplemente se agrega uno más — salvo
    // que ya tenga exactamente ese mismo día y hora activos.
    if (body.reemplazar && body.horarioFijoId) {
      const viejoResp = await fetch(
        `${SUPABASE_URL}/rest/v1/horario_fijo?id=eq.${body.horarioFijoId}&alumna_id=eq.${alumnaId}&activo=eq.true&select=id`,
        { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
      );
      const viejoData = await viejoResp.json();
      const viejo = Array.isArray(viejoData) && viejoData[0];
      if (viejo) {
        const citasViejasResp = await fetch(
          `${SUPABASE_URL}/rest/v1/citas_fijas?horario_fijo_id=eq.${viejo.id}&estado=eq.programada&select=id,calcom_booking_uid`,
          { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
        );
        const citasViejas = await citasViejasResp.json();
        // En paralelo (no una por una) para no acercarnos al límite de
        // tiempo de la función cuando hay varias clases viejas por cancelar.
        await Promise.all((citasViejas || []).map(cv =>
          fetch(`https://api.cal.com/v2/bookings/${cv.calcom_booking_uid}/cancel`, {
            method: 'POST',
            headers: calcomHeaders(CALCOM_API_KEY),
            body: JSON.stringify({ cancellationReason: 'La alumna cambió este horario fijo desde el portal.' }),
          }).catch(() => {})
        ));
        if (citasViejas && citasViejas.length) {
          await fetch(`${SUPABASE_URL}/rest/v1/citas_fijas?horario_fijo_id=eq.${viejo.id}&estado=eq.programada`, {
            method: 'PATCH',
            headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ estado: 'cancelada' }),
          });
        }
        await fetch(`${SUPABASE_URL}/rest/v1/horario_fijo?id=eq.${viejo.id}`, {
          method: 'PATCH',
          headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ activo: false }),
        });
      }
    } else {
      const dupResp = await fetch(
        `${SUPABASE_URL}/rest/v1/horario_fijo?alumna_id=eq.${alumnaId}&activo=eq.true&dia_semana=eq.${diaSemana}&hora=eq.${hora}&select=id`,
        { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
      );
      const dupData = await dupResp.json();
      if (Array.isArray(dupData) && dupData.length > 0) {
        return { statusCode: 200, body: JSON.stringify({ ok: false, mensaje: 'Ya tienes un horario fijo justo en ese día y hora.' }) };
      }
    }

    // 4. Crea, una por una, las próximas clases en Cal.com.
    const primeraFecha = proximaOcurrenciaUTC(diaSemana, hora);
    const creadas = [];
    const fallidas = [];

    for (let i = 0; i < semanas; i++) {
      const inicioUTC = masSemanas(primeraFecha, i);
      try {
        const bookingResp = await fetch('https://api.cal.com/v2/bookings', {
          method: 'POST',
          headers: calcomHeaders(CALCOM_API_KEY),
          body: JSON.stringify({
            eventTypeSlug: HORARIO_FIJO_SLUG,
            username: CALCOM_USERNAME,
            start: inicioUTC.toISOString(),
            attendee: { name: nombreAlumna, email: emailAlumna, timeZone: 'America/Lima' },
          }),
        });
        const bookingData = await bookingResp.json();
        if (!bookingResp.ok) {
          fallidas.push(i + 1);
          continue;
        }
        const booking = (bookingData && bookingData.data) || bookingData;
        const uid = booking && (booking.uid || (Array.isArray(booking) && booking[0] && booking[0].uid));
        if (!uid) { fallidas.push(i + 1); continue; }
        const { fecha, hora: horaGuardada } = partesLima(inicioUTC);
        creadas.push({ fecha, hora: horaGuardada, calcom_booking_uid: uid });
      } catch (e) {
        fallidas.push(i + 1);
      }
    }

    if (creadas.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, mensaje: 'No se pudo crear ninguna clase en Cal.com. Revisa que el evento "horario-fijo" exista.' }),
      };
    }

    // 5. Guarda la regla y cada ocurrencia en Supabase (con la service role).
    const horarioResp = await fetch(`${SUPABASE_URL}/rest/v1/horario_fijo`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        alumna_id: alumnaId,
        dia_semana: diaSemana,
        hora,
        calcom_recurring_uid: creadas[0].calcom_booking_uid,
        activo: true,
        proxima_confirmacion: sumarDiasFecha(partesLima(new Date()).fecha, 30),
      }),
    });
    const horarioData = await horarioResp.json();
    if (!horarioResp.ok || !Array.isArray(horarioData) || !horarioData[0]) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, mensaje: 'Las clases se crearon en Cal.com pero no se pudo guardar el horario en la base de datos.' }) };
    }
    const horarioFijoId = horarioData[0].id;

    const citasBody = creadas.map(c => ({
      alumna_id: alumnaId,
      horario_fijo_id: horarioFijoId,
      fecha: c.fecha,
      hora: c.hora,
      calcom_booking_uid: c.calcom_booking_uid,
      estado: 'programada',
    }));
    await fetch(`${SUPABASE_URL}/rest/v1/citas_fijas`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(citasBody),
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, creadas: creadas.length, fallidas: fallidas.length }),
    };
  } catch (err) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, mensaje: err.message }) };
  }
};
