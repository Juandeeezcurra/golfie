# Pending — Golfie v2

Estado y plan de trabajo restante. Última actualización: 2026-10-16.

Plan completo y aprobado: `C:\Users\juand\.claude\plans\glimmering-foraging-whale.md`

---

## Migración a Cloudflare — COMPLETA ✅

- Worker + D1 en **https://golfie.shymie.workers.dev**, con los datos reales
  migrados (14 rondas, 216 hoyos, 347 feedbacks de palo).
- El Sheet y el Apps Script viejos quedaron congelados en `legacy/`. No se
  usan más; se mantienen como respaldo histórico.

---

## v2 — Fase 1 de 6: COMPLETA ✅

**Qué cambió (invisible pero necesario):**
- `public/index.html` pasó de 2128 líneas a 266: ahora es sólo el markup.
  El CSS vive en `public/css/` (tokens, base, components, responsive, fonts) y
  el JS en módulos ES bajo `public/js/` (`core/` puro, `ui/` por pantalla,
  `store.js` y `sync.js` como factories inyectables).
- **Service worker** (`public/sw.js`): la app ahora abre sin señal de verdad.
  Antes dependía de la suerte de la caché del navegador. Escotilla de
  emergencia si algo sale mal: abrir con `?nosw=1` desregistra el SW y borra
  sus cachés.
- **Fuentes self-hosteadas** en `public/fonts/`: Google Fonts era una
  dependencia de red justo en el peor momento (sin señal en la cancha).
- `wrangler.toml`: `not_found_handling` pasó de `single-page-application` a
  `none`. Con el fallback anterior, un módulo mal escrito devolvía el index y
  el error era un MIME type incomprensible en vez de un 404.

**Tests (39, todos verdes con `npm test`):**
- Las 5 suites de sincronización se **portaron** del harness viejo (que
  probaba la copia congelada contra un Sheets simulado) al stack actual:
  cliente real + Worker real + D1 simulado. Mismos invariantes, ahora sobre
  el código que de verdad se despliega.
- Nuevos: `tests/core/stats.test.mjs` (lógica pura), `tests/boot.test.mjs`
  (la app arranca sin explotar) y `tests/wiring.test.mjs`, que verifica que
  los imports resuelvan, que todo `onclick` del HTML exista en `window` y que
  el SW precachee todos los módulos. Sin build step, nadie más chequea eso.

**Lo visible:** el **score acumulado con el ojito** en la pantalla del hoyo.
Muestra cuánto llevás y contra qué par, y se tapa con un toque; la preferencia
se recuerda entre rondas.

---

## Lo que sigue

| Fase | Qué entrega |
|---|---|
| **2. Canchas precargadas** | En curso: catálogo JSON y recorrido de 9 hoyos implementados; falta revisión final de tarjetas y ajuste visual |
| **3. Handicaps bien hechos** | En curso: funciones WHS y aviso de golpes recibidos por hoyo; faltan formatos, ajustes visuales y pruebas |
| **4. Amigos y modalidades** | `players`/`round_players`, migración `player_id`, Match / Scramble / 4-2-0 / Stableford, tabla de posiciones en vivo |
| **5. Experiencia en cancha** | Descanso en el hoyo 9, scorecard visual, menos taps, vista de hoyo |
| **6. Home y dashboard** | Analítica por cancha, rediseño visual |

Decisiones ya cerradas: laguneada **fuera**; 4-2-0 es 4/2/0 con empates
promediados (3/3, 1/1); todo **neto** (con handicap por hoyo); amigos con
perfil liviano (nombre + hcp, sin login).

Avance fase 2 (2026-10-16): hay 9 entradas iniciales en
`public/data/courses.json`, con fuente y confianza por cancha. Boulogne queda
como tarjeta de 9 hoyos; Pilar está representado como combinación Azul +
Blanca de 18 hoyos; las métricas no publicadas quedan vacías. Las tarjetas
con datos dudosos muestran una advertencia. Se agregó `course_holes_count` a
la ronda para cerrar correctamente una vuelta de 9 hoyos. Pendiente: validar
las tarjetas con las del club, especialmente las distancias rojas de Cañuelas,
la vuelta/color de Pilar y el stroke index de cada tee alternativo. La Fase 3
ya tiene funciones puras para Course Handicap (18/9 hoyos), Playing Handicap,
distribución por SI, score neto y Stableford; el tracker muestra los golpes que
recibís o devolvés cuando el tee tiene rating y slope disponibles.

---

## Para vos, cuando puedas

1. **Abrí https://golfie.shymie.workers.dev y confirmá que se ve bien.** Yo
   verifiqué que arranca, que los 39 tests pasan y que los datos están, pero
   no tengo navegador: no puedo *ver* la pantalla. Mirá sobre todo la pantalla
   de un hoyo (el ojito nuevo) y que el historial siga completo.
2. Vas a ver rondas duplicadas (Cañuelas, Jockey Azul, Newman 26/07, San
   Patricio 21/06): son la misma ronda cargada con tus dos códigos de usuario.
   Ya venía así del Sheet. Se resuelven desde "Reparar datos".

## Riesgos / cosas a tener en cuenta

- **Nada está commiteado todavía.** Es un refactor grande sin commit; conviene
  hacerlo antes de seguir con la fase 2.
- Si algo se ve roto en el celular: `?nosw=1` desactiva el service worker, y
  Cloudflare permite volver a la versión anterior desde el dashboard
  (Workers → golfie → Deployments).
- `tools/import-csv.mjs` borra las 3 tablas antes de insertar. No volver a
  correrlo salvo con un export más nuevo.

## Actualización adicional — 2026-10-16

Para pasar el contexto a Claude, leer también [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md): resume arquitectura, decisiones, avances y límites de esta sesión.

- La tarjeta por hoyo ahora snapshottea stroke index y distancia (`migrations/0004_hole_card_snapshot.sql`). El dashboard muestra la tarjeta tabular con ida/vuelta y permite descargar CSV.
- `public/js/core/scorecard.js` arma la tarjeta; `public/js/core/formats.js` contiene reglas de Stableford, 4-2-0, Match y Scramble. La fase 4 conectó jugadores, modalidades y marcador; la última actualización completa Scramble por parejas.
- El índice casero omite vueltas de 9 hoyos hasta implementar el cálculo WHS de combinación correctamente.
- Esta tanda no se probó ni se desplegó. Las migraciones 0002–0004 todavía deben confirmarse/aplicarse en D1 de producción antes de depender de sus columnas.
- Al guardar el hoyo 9 de una ronda de 18, aparece una pausa con el resumen de la ida; al cerrarla queda listo el hoyo 10.

## Actualización fase 4 — 2026-10-16

Se agregó la migración 0005, tablas de perfiles y participantes, `player_id` en hoyos, endpoints Worker v3 y sincronización que separa tarjetas por jugador. La pantalla permite Medal, Stableford, Match, 4-2-0 y Scramble de cuatro jugadores en dos equipos. Scramble registra una tarjeta por equipo/hoyo, replica el score a sus dos integrantes y calcula el handicap de equipo 35%/15%; su resultado no alimenta el handicap individual ni los insights personales. Importar histórico limpia asociaciones de ronda sin borrar perfiles. Service worker en v2.5.

Además, las rondas parciales con score acumulado se mantienen marcadas como “En curso” en el historial.

Pendiente todavía: pruebas multi-jugador con fallos de red; inspección visual; migraciones remotas confirmadas y despliegue ordenado (Worker antes que frontend). Scramble ya está conectado localmente, pero falta validación de aceptación. No se ejecutaron pruebas ni deploy.
