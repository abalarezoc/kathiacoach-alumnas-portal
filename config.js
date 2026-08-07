// ============================================================
// Kathia Coach — Portal de Alumnas — Configuración
//
// Reemplaza estos dos valores con los de TU proyecto de Supabase:
// Project Settings -> API -> Project URL / anon public key
//
// La "anon key" es pública y segura de exponer en el navegador
// (la seguridad real la da Row Level Security, configurada en schema.sql).
// NUNCA pongas aquí la "service_role key" — esa sí es secreta.
// ============================================================

const SUPABASE_URL = "https://gvtsfvedfjgauyxnyixr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_1-9P5oq3FK6wixabJcAk8g_pSqLFTja";

// Link de Cal.com donde las alumnas agendan su sesión.
// Puedes usar el mismo que ya tienes, o crear un evento específico
// para alumnas actuales en Cal.com y poner ese link aquí.
const CALCOM_LINK = "https://cal.com/kathiacoach/sesion-1-1-online";

// Código de acceso para el registro (signup.html).
// No es una contraseña real de seguridad — es solo un filtro simple
// para que no cualquiera que encuentre el link cree una cuenta.
// Kathia lo comparte junto con el link de registro por WhatsApp.
// Cámbialo cuando quieras, es un texto libre.
const ACCESS_CODE = "KATHIA2026";
