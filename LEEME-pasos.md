# Portal de Alumnas — Kathia Coach — Guía v3

Costo mensual: **$0**. Novedades en esta versión: medidas (cintura/cadera) además del peso, fotos de progreso, meta de peso, y una línea de tiempo visual en vez de tabla.

## Archivos de esta carpeta

| Archivo | Para qué es |
|---|---|
| `schema.sql` | Esquema base (ya lo corriste) |
| `schema-v2-admin.sql` | Rol de administradora (ya lo corriste) |
| `schema-v3-progreso-visual.sql` | **Nuevo** — medidas, fotos y meta de peso |
| `index.html` | Login |
| `signup.html` | Para que cada alumna cree su propia cuenta |
| `olvide-password.html` | Pedir link de recuperación |
| `nueva-password.html` | Página donde se define la nueva contraseña |
| `portal.html` | Vista de la alumna: línea de tiempo, gráficos, meta, agenda |
| `admin.html` | Panel de Kathia: alumnas, medidas, fotos, meta de peso |
| `styles.css` / `config.js` | Estilos y configuración |

## Pasos en Supabase (una sola vez)

### 1. Correr el nuevo esquema
SQL Editor → New query → pega el contenido completo de **`schema-v3-progreso-visual.sql`** → Run.

Esto agrega las columnas de cintura/cadera/foto, la meta de peso, y crea el "bucket" de Storage privado (`progreso-fotos`) donde se guardan las fotos, con las políticas de seguridad para que cada alumna solo pueda ver las suyas.

Si te sale la misma advertencia de "Potential issue detected" que la primera vez (por los `drop policy if exists`), es normal — dale "Run query" igual.

### 2. Confirmar que el bucket quedó creado
En el menú de la izquierda de Supabase → **Storage** → deberías ver un bucket llamado `progreso-fotos`. Si no aparece, vuelve a correr el paso 1.

## Subir la nueva versión a Netlify

1. Descarga el zip nuevo que te comparto en el chat.
2. Proyecto `endearing-mooncake-c4af33` en Netlify → Deploys → arrastra el zip.
3. Espera "Published".

## Qué cambió para Kathia (panel admin)

Al abrir el detalle de una alumna, ahora hay tres bloques:

- **Meta de peso** — un campo simple para fijar el objetivo (ej. "65"). Se guarda aparte, la alumna la ve en su portal.
- **Agregar registro** — igual que antes (fecha, peso, notas) más **cintura**, **cadera**, y una **foto de progreso** opcional (selecciona una imagen desde el celular o la compu, igual que adjuntar una foto en WhatsApp).
- **Historial** — ahora con columnas de cintura/cadera y un link "Ver foto" cuando hay una foto guardada en ese registro.

## Qué ve la alumna ahora

- **Meta**: si Kathia le fijó una, ve una franja arriba tipo "Te faltan 2.3 kg para tu meta de 65 kg".
- **Gráficos**: uno por cada métrica con al menos 2 datos — peso, cintura, cadera (los que no tengan suficientes datos simplemente no aparecen).
- **Línea de tiempo**: en vez de una tabla, cada sesión es una tarjeta con fecha, las medidas de ese día como etiquetas, la nota de Kathia, y el link a la foto si hay una (se abre en una ventana grande sobre la pantalla).

## Cómo funciona de principio a fin (sin cambios respecto a v2)

**Alta de alumna nueva:** le compartes por WhatsApp el link directo a `signup.html` + el código de acceso (`KATHIA2026`, editable en `config.js`). El botón de registro ya no aparece en el login público, solo funciona si llegan al link directo.

**Si olvida su contraseña:** ella misma la recupera desde el login, sin depender de Kathia.

**Indicador de estado en el panel:** 🟢 Al día (registró en los últimos 14 días) · 🟠 Pendiente · ✨ Nueva sin registros.

## El plan B (roll back)

Sigue sin tocar nada del sitio principal kathiacoach.com — todo esto vive aparte. Si algo no convence, simplemente dejamos de compartir el link del portal.
