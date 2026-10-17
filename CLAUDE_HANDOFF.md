# Golfie v2 — handoff para Claude

Actualizado: 2026-10-16 (America/Argentina/Buenos_Aires)
Repo: `C:\Users\juand\OneDrive\Desktop\Golfie.ia`
Producción: https://golfie.shymie.workers.dev

## Objetivo y decisiones

Terminar Golfie sobre Cloudflare Workers + D1, conservando modo offline y datos históricos. El usuario pidió avanzar autónomamente, resolver los pendientes y compartir este handoff con Claude. Ya autorizó tests, migraciones remotas, deploy y push.

- Laguneada queda fuera de alcance.
- Formatos: Medal, Stableford, Match Play, Scramble y 4-2-0; cálculos netos por stroke index.
- Amigos usan un perfil liviano (nombre + Handicap Index), sin login.
- Nunca inventar datos de tarjeta. Mantener advertencias para valores de baja confianza.
- No correr importación CSV sin export fresco: puede reemplazar datos de D1.

## Arquitectura

- `public/index.html`: pantallas; módulos ES en `public/js/`, sin build step.
- `public/js/main.js`: arranque, handlers globales, service worker y sync.
- `public/js/store.js` y `sync.js`: persistencia local, cola offline y reconciliación.
- `public/js/core/`: reglas puras; `public/js/ui/`: pantallas.
- `public/data/courses.json`: catálogo de canchas y fuentes.
- `src/index.js`, `src/db.js`, `src/schema.js`: API Worker y D1.
- Cambios a una D1 existente requieren una migración incremental en `migrations/`.
- `legacy/`: respaldo de Apps Script/Sheets.

## Funcionalidad entregada

- Tarjeta por hoyo con snapshot de stroke index y distancia, ida/vuelta/total y descarga CSV.
- Pausa/resumen al terminar la ida en rondas de 18 hoyos.
- Handicap casero, golpes por SI, Stableford y posiciones de los formatos soportados.
- Scramble de cuatro jugadores en dos parejas: un score por equipo/hoyo, réplica a sus integrantes, allowance 35%/15%, neto cuando los cuatro tienen handicap y standings. Excluido del handicap e insights individuales.
- Perfiles y participantes persisten por jugador; sync identifica cada tarjeta por `player_id`. Las escrituras offline quedan en cola y reconciliar de nuevo no duplica datos.
- Rondas parciales con score se muestran como “En curso”.
- Service worker v2.5. Una PWA que retenga assets viejos puede requerir recarga completa/cerrar y abrir de nuevo.

## Validación y despliegue

- `npm test`: **56/56 aprobados**; incluye cálculo/clasificación Scramble y reconciliación offline de cuatro jugadores.
- Edge headless, viewport 1440 px: setup Scramble muestra cuatro jugadores y dos parejas; cero errores JavaScript.
- D1 remota: migraciones `0001`–`0005` aplicadas; `npm run db:migrate` confirmó “No migrations to apply”.
- Worker + assets desplegados en versión `20bd2437-44f3-422c-a4c5-b57bc2319a05`.
- Endpoint público ping: HTTP 200, `v: 3`, capabilities `players`, `round_players`, `player_holes`, `formats`. Home público HTTP 200 con Scramble.
- El frontend y el Worker se publican juntos en el mismo deploy de Wrangler.

## Pendiente real

1. Aceptación manual con una ronda Scramble real: captura completa, standings, CSV y reintento tras recuperar conexión. La lógica sí tiene pruebas automatizadas; no se condujo la ronda completa dentro de un navegador.
2. Probar en móvil y hacer rondas de aceptación individuales/equipos, incluyendo cancha de 9 hoyos.
3. Contrastar tarjetas marcadas con baja confianza (especialmente Cañuelas, Pilar y tees alternativos). No cambiar los valores basándose en conjeturas.
4. El índice casero no es Handicap Index oficial: no incluye PCC, Net Double Bogey completo, ajustes federados ni combinación WHS para rondas de 9 hoyos.

## Estado del árbol

La base de funcionalidades ya está en `main` y desplegada. En esta tanda quedan cambios locales: este handoff, `pending.md`, pruebas nuevas y `package-lock.json`; revisar `git status --short`. Los cambios se deben commitear y pushear para dejar el repo alineado con producción.
