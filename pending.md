# Pending — Golfie v2

Estado y plan de trabajo restante. Última actualización: 2026-10-21.

Plan original: `C:\Users\juand\.claude\plans\glimmering-foraging-whale.md`.
Contexto de arquitectura: [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md) (lo escribió
la sesión de Codex que trabajó mientras Claude no tenía tokens — sigue
vigente, no hizo falta reescribirlo).

---

## Sesión 2026-10-21 — ronda de prueba de ayer, nombres de amigos, finalizar siempre, tarjeta gráfica, yardas

Repasaste la app después de jugar y mandaste una lista larga de cosas rotas
o confusas. Todo esto ya está deployado y verificado:

1. **Bug real encontrado: "Jugador, Jugador" en la tarjeta de Pinte.** La
   tabla `round_players` nunca guardó el nombre ni el handicap (sólo
   `player_id`); el nombre vivía siempre en la tabla `players`. Mientras el
   mismo celular que creó la ronda la mostraba, no se notaba (tenía el
   nombre guardado localmente de antes); pero cualquier otro dispositivo —
   la compu vinculada por código, por ejemplo — pedía los jugadores al
   servidor y se quedaba sin nombre para nadie, así que el selector de
   tarjetas mostraba "Jugador" genérico para los dos y parecía que tocar uno
   te llevaba al otro. Arreglado en `src/db.js` (`getRoundPlayers` ahora
   cruza con `players` para traer nombre y handicap). Verificado contra
   producción: la ronda de Bulogne con Pinte ya devuelve "Yo" y "Pinte".

2. **Jockey Azul del 31/07 quedaba "en curso" para siempre.** Jugaste 9
   hoyos y tocaste "Finalizar ronda", pero el código comparaba contra el
   total original de la ronda (18) en vez de contra lo que realmente
   jugaste, así que nunca se marcaba terminada. Arreglado: "Finalizar
   ronda" ahora es una decisión explícita tuya — sea al hoyo 9, 14 o 18 — y
   cierra la ronda con lo que hayas cargado. Esa ronda vieja ya está
   corregida en producción (9 hoyos, terminada, score 49).

3. **Ya no se pregunta 9 o 18 hoyos al armar una ronda en una cancha de 9**
   (Bulogne, etc.). Se asume la vuelta completa y listo; el botón
   "Finalizar ronda" está disponible desde el primer hoyo cargado, así que
   podés cortar cuando quieras (9, 14, lo que sea) sin que quede mal
   marcada.

4. **Tarjeta rediseñada**, sacando la tabla vieja (Hoyo/Par/SI/Largo/Golpes/
   Neto/Putts, confusa y repetida con el bloque de abajo). Ahora es un solo
   bloque gráfico: Hoyo, Par, Largo y Golpes, con círculos para birdie/eagle
   y cuadrados para bogey/doble como en una tarjeta profesional (par sin
   marca, como corresponde). El SI no se muestra más (seguís recibiendo los
   golpes de handicap igual, sólo que no se explica el número en la
   tarjeta). Arriba quedan 2-3 tarjetitas con Ida/Vuelta/Total.

5. **Todo pasa a yardas.** Las 3 canchas que estaban en metros (Boulogne,
   San Patricio, Cañuelas) se convirtieron a yardas en el catálogo. "Cargar
   cancha a mano" ya no pregunta la unidad, asume yardas directo.

6. **Handicap sugerido de un amigo ya no espera 3 rondas.** Con 1 o 2
   rondas muestra una estimación (marcada con "~" y una nota explicando que
   es provisoria); con 3+ muestra el índice real como antes.

7. **Home más compacto.** Se sacó el subtítulo, el código de usuario y
   "reparar datos" de la vista principal — ahora viven detrás de un ícono
   de ajustes (⚙, arriba a la derecha). Las líneas de aviso (sync pendiente,
   rondas sin identificar, etc.) sólo ocupan espacio cuando hay algo de
   verdad. Se agregó un título "Resumen" arriba de las estadísticas para que
   quede alineado con "Últimas rondas" al lado (el desalineado era por eso:
   una columna arrancaba con título y la otra con la tarjeta de handicap
   directo).

8. **Pantalla de Amigos rota en la compu, arreglada.** Le faltaba el mismo
   tratamiento de ancho/sidebar que tienen Home e Historial en desktop, por
   eso se solapaba con el menú y el botón "+ Agregar amigo" se veía gigante
   (ocupaba el viewport completo sin el límite de ancho). Ahora respeta el
   mismo layout.

9. **Score tapado con el ojito: ya no se filtraba por el costado.** El
   ojito tapaba el acumulado propio, pero el resultado en vivo entre
   jugadores (al lado, cuando jugás con alguien) mostraba el número igual.
   Ahora también se tapa ahí.

**Tests:** 68/68 en verde + pruebas manuales de humo para
`renderDashboard`, `finishRound` y la ficha de amigo (no cubiertas por los
tests automáticos porque dependen del DOM real). Deployado: Worker +
assets, `wrangler deploy` exitoso.

**Nota:** el borrado de la ronda fantasma de Bulogne de la sesión anterior
ya no aplica — confirmamos que sólo quedó una tarjeta correcta de 18 hoyos.

---

## Sesión 2026-10-20 — bug de canchas de 9, amigos, tarjetas de todos

**Contexto:** mientras Claude no tenía tokens, Codex siguió trabajando solo y
terminó de construir la Fase 2 (canchas), Fase 3 (handicaps) y buena parte de
la Fase 4 (jugadores/modalidades) — commiteado y desplegado. Esta sesión
arrancó leyendo todo ese trabajo a fondo antes de tocar nada (`CLAUDE_HANDOFF.md`,
`src/schema.js`, `src/db.js`, `core/formats.js`, `core/standings.js`,
`core/scorecard.js`, `ui/tracker.js`, `ui/clubs.js`, `ui/dashboard.js`,
`ui/setup.js`), y los 56 tests que ya estaban en verde.

Pediste tres cosas, jugando hoy en Bulogne con tu amigo Pinte:

**1. Bug real encontrado y arreglado: cancha de 9 hoyos jugada como 18.**
`core/courses.js` sólo sabía buscar hoyos 1-9 en el catálogo de Bulogne; el
hoyo 10 en adelante no existía para el código. Por eso `startRound()` te
forzaba a jugar de a 9 sin poder elegir 18, y terminaste cargando dos rondas
sueltas. Arreglado:
- `holeInfo()`/`coursePar()` ahora aceptan cuántos hoyos se juegan esta
  ronda; si son el doble de los que tiene el catálogo, el hoyo N>9 es
  físicamente el hoyo N-9, y el **stroke index se desdobla con la
  convención estándar de golf** (ida = 2×SI−1, vuelta = 2×SI) para que el
  reparto de golpes cubra los 18 en vez de duplicar los mismos 9.
- En "Nueva Ronda", al elegir una cancha de 9 del catálogo aparece un
  selector **9 hoyos / 18 hoyos (ida y vuelta)** — antes no existía esa
  opción, quedabas forzado a 9.
- Tests nuevos: `tests/core/courses.test.mjs` (7 casos, incluida la
  permutación completa 1-18 del SI desdoblado).

**2. Fusión de datos de hoy (producción).** Con el SI ya corregido, fusioné
tus dos rondas de Bulogne de hoy en una sola de 18 (round_id
`r-1792494977325-tqakhy`): vos 86, Pinte 106, stroke index 1-18 sin
repetidos. Backup previo en
`data-export/backup-antes-de-fusionar-bulogne-2026-10-20.sql`. Detalle de
qué toca el SQL en el historial de la sesión si hace falta auditarlo.

**3. De paso encontré y borré una ronda de prueba** ("Jockey Club -
Cancha Colorada", 17/10, 0 hoyos, sin score) que había quedado en tu cuenta
real de cuando se verificó el deploy anterior. No era tuya, no tenía datos,
la saqué.

**4. Sección de Amigos — nueva.** Antes "amigos" sólo existían como
jugadores sueltos dentro del formulario de nueva ronda; no había forma de
ver qué habían jugado. Ahora:
- Ícono nuevo en la barra inferior ("Amigos"), pantalla con la lista.
- Ficha de cada amigo: handicap guardado, **handicap sugerido** calculado
  con sus propias rondas (mismo cálculo WHS que el tuyo, reutilizado tal
  cual — `public/js/friends.js` arma "rondas" con sus totales a partir de
  sus propios hoyos y se lo pasa a las funciones de siempre), un botón para
  adoptar el sugerido, las mismas estadísticas que tenés vos (tendencia,
  cómo anota, por tipo de hoyo, por cancha, juego corto) y la lista de
  rondas jugadas con vos — tocando una vas directo a su tarjeta.
- `tests/friends.test.mjs` (5 casos) cubre que los totales de un amigo se
  recalculan de SUS hoyos y no se confunden con los tuyos.

**5. El dashboard de una ronda ahora muestra la tarjeta de cualquiera.** Este
era el reclamo central: jugaste con Pinte y no había forma de ver cuánto
hizo en ningún lado. Ahora, en cualquier ronda con más de un jugador (no
Scramble, que ya mostraba el resultado por equipos), aparece:
- Un **selector de jugador** (pestañas con el nombre) arriba de la tarjeta,
  para saltar entre "Yo" y cada participante sin salir de la pantalla.
- Un bloque de **resultado combinado** (quién va ganando) calculado con la
  misma lógica de posiciones que ya se usaba para Scramble/live standings,
  ahora generalizada a Medal/Stableford/Match/4-2-0.

No alcancé a rediseñar la tabla de la tarjeta en sí (seguís viendo la misma
tabla, más prolija por el selector arriba) — "más gráfico" queda abierto,
ver abajo.

**Tests:** 68/68 en verde (`npm test`) — 56 que ya estaban + 7 de canchas de
9 hoyos + 5 de amigos. Deployado y verificado contra producción real.

---

## Lo que sigue

| Fase | Estado |
|---|---|
| 1. Base + primeras mejoras | ✅ completa |
| 2. Canchas precargadas | ✅ completa (9 canchas, confianza media, revisar contra tarjetas físicas cuando se pueda) |
| 3. Handicaps | ✅ completa (Course/Playing Handicap WHS, golpes por SI, neto, Stableford) |
| 4. Amigos y modalidades | Modalidades (Medal/Stableford/Match/4-2-0/Scramble) y amigos con historial — completos. Falta: jugar una ronda Scramble real de punta a punta para aceptación manual (sólo probada con tests + un navegador headless) |
| 5. Experiencia en cancha | Pausa en el hoyo 9 ✅. Falta: mapas de hoyo (pendiente de datos, ver sesión anterior), afinar taps |
| 6. Home y dashboard | Home con tendencia/distribución/por cancha ✅. Tarjeta rediseñada (gráfica, círculos/cuadrados, sin SI) ✅ — sesión 2026-10-21 |

Decisiones cerradas (sesiones anteriores): laguneada fuera; 4-2-0 es 4/2/0
con empates promediados; todo neto con handicap por hoyo; amigos con perfil
liviano sin login.

---

## Riesgos / cosas a tener en cuenta

- **El índice de handicap casero no es oficial**: no incluye PCC, Net Double
  Bogey completo, ajustes federados, ni combina diferenciales de 9 hoyos con
  los de 18 (las rondas de 9 "puras" — jugadas así a propósito, no como las
  de Bulogne que ahora son 18 — quedan afuera del cálculo del índice).
- Varias tarjetas de cancha tienen confianza "media" (sacadas de
  agregadores, no de la tarjeta oficial del club): Cañuelas (distancias
  rojas de los hoyos 4 y 12 sospechosas), Pilar (es en realidad de 27 hoyos,
  se combinó Azul+Blanca y se descartó Colorada por falta de datos
  confiables). No cambiar esos números sin contrastarlos con una tarjeta
  real.
- `tools/import-csv.mjs` borra las 3 tablas de rondas antes de insertar. No
  volver a correrlo salvo con un export fresco — y ahora además hay que
  tener en cuenta que NO toca `players`/`round_players`, así que no
  pisaría amigos existentes, pero tampoco los pobla desde un CSV viejo.
- Dos backups de producción en `data-export/` (de esta sesión y la
  anterior) por si hace falta revertir algo.
- Seguís sin tener Git commiteado nada de esto — Codex sí commiteó su parte
  (`git log` tiene 3 commits suyos), pero los cambios de esta sesión están
  sin commitear. Avisame si querés que lo haga.
