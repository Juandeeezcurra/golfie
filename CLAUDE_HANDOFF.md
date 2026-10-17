# Golfie v2 — estado para retomar con Claude

Actualizado: 2026-10-16. Repo: `C:\Users\juand\OneDrive\Desktop\Golfie.ia`.
Lee este archivo y `pending.md` antes de cambiar código. La copia de trabajo tiene muchos cambios sin commit; no restaures archivos ni limpies el árbol.

## Pedido y decisiones vigentes

El objetivo es terminar Golfie v2 sobre Cloudflare Workers + D1, conservando el uso offline y los datos históricos. El usuario pidió avanzar de una sola vez todo lo que sea razonable, evitar bloqueos grandes y dejarle este contexto a Claude. Esta tanda no pidió publicación ni pruebas; por eso no se desplegó ni se corrió la suite.

Decisiones cerradas en el plan de Claude (`C:\Users\juand\.claude\plans\glimmering-foraging-whale.md`):

- Laguneada fuera del alcance.
- Formatos deseados: Match Play, Scramble, 4-2-0 y Stableford individual.
- Todo se calcula neto, distribuyendo golpes por stroke index.
- 4-2-0: 4/2/0; empatados comparten el promedio de los puestos (3/3 al empatar primero; 1/1 al empatar segundo; 2 cada uno con empate triple).
- Jugadores amigos con perfil liviano (nombre + Handicap Index), sin login propio.
- Canchas precargadas como JSON; campos de tarjeta dudosos se dejan advertidos, nunca se inventan.

## Cómo está armada la app

- `public/index.html`: markup; el comportamiento está en módulos ES sin build step.
- `public/js/main.js`: arranque, handlers globales para `onclick`, service worker y sync.
- `public/js/store.js` / `sync.js`: persistencia local y cola offline. Tocar sincronización requiere revisar `queueKey`, `reconcile`, `pruneQueue` y `tests/sync/` juntos.
- `public/js/core/`: reglas puras; `ui/`: pantallas. `public/data/courses.json`: tarjetas de referencia y sus fuentes.
- `src/schema.js` genera el esquema base; cambios a una D1 existente requieren una migración incremental en `migrations/`.
- `src/db.js` y `src/index.js`: repositorio D1 y API Worker.
- `public/sw.js` elevó la caché a v2.5 e incluye los módulos de tarjeta, formatos y posiciones.
- `legacy/`: respaldo de Apps Script/Sheets. Las pruebas antiguas fueron reemplazadas/movidas a `tests/` sobre el código actual.

## Avances ya realizados

### Base / fase 1

Refactor del HTML monolítico a módulos, fuentes locales, app instalable/offline, cliente sync inyectable y suite actual de Node. El score acumulado se puede ocultar con el botón del ojo. Cloudflare está desplegado en `https://golfie.shymie.workers.dev`; el último estado documentado tenía 14 rondas, 216 hoyos y 347 feedbacks.

### Fase 2: canchas

`public/data/courses.json` tiene nueve entradas: Jockey Azul/Colorada, Boulogne, San Patricio, San Isidro, Pilar, Newman, Pacheco y Cañuelas. Hay selector de tees, par/distancia/SI por hoyo y advertencias de confianza. Boulogne es 9 hoyos; Pilar está modelado con la combinación Azul + Blanca disponible. Quedan pendientes contrastes con tarjetas físicas, sobre todo Cañuelas rojos, los tees/SI alternativos y la combinación de Pilar. No corregir datos de baja confianza adivinando.

### Fase 3: handicap

`public/js/core/handicap.js` contiene Course Handicap, Playing Handicap, distribución por SI, neto, Stableford y cálculo de índice sobre hasta 20 diferenciales. El tracker ya anuncia golpes recibidos/devueltos cuando rating, slope y SI están disponibles. Se excluyen del índice las vueltas de 9 hoyos hasta implementar la combinación WHS de dos vueltas / score esperado. El algoritmo actual no debe presentarse como Handicap Index oficial: no maneja PCC, ajustes hole-by-hole/Net Double Bogey ni registros federados.

### Cambios de esta tanda (aún sin probar)

- Las rondas guardan `course_holes_count` (migración `0003`).
- Los hoyos nuevos guardan foto de `stroke_index` y `hole_length`; agregado al esquema canónico y migración `0004_hole_card_snapshot.sql`.
- `public/js/core/scorecard.js` arma ida/vuelta/total y neto; el dashboard muestra la tarjeta y ofrece descarga CSV.
- Al guardar el hoyo 9 de una ronda de 18, aparece una pausa con el resumen de la ida; cerrar o continuar deja listo el hoyo 10.
- `public/js/core/formats.js` contiene las reglas de Stableford, 4-2-0, Match y allowance Scramble; esta tanda conectó Scramble por parejas con la selección de equipos, marcador y tarjeta local.
- El Dashboard por hoyo usa el SI/distancia snapshot; rondas viejas hacen fallback al catálogo actual.
- `public/sw.js` elevó la caché a v2.5 e incluye los módulos de tarjeta, formatos y posiciones.
- Las vueltas de 9 hoyos no se usan como diferencial de 18 hoyos.

## Fase 4: avance local y partes pendientes

La base integral ya está en el árbol local, sin publicar: migración `0005_players_and_formats.sql`; perfiles y participantes de ronda; `player_id` por hoyo; endpoints `savePlayer` / `addRoundPlayer`; lectura de perfiles; ping Worker v3 con capacidades; cola/reconcile/prune identifican jugador y comparan valores antes de borrar escrituras; importar el histórico no borra perfiles. La pantalla permite agregar amigos, elegir jugadores y jugar Medal neto, Stableford, Match de dos, 4-2-0 de tres y Scramble de cuatro en dos equipos. Scramble registra un score por equipo/hoyo, lo replica a sus dos jugadores, calcula handicap neto 35%/15% y muestra posiciones en vivo.

Pendiente: revisión de una ronda multi-jugador de punta a punta, pruebas de pérdida de paquetes y revisión visual en navegador. También falta aplicar migraciones y desplegar Worker v3 antes que frontend. Un frontend v2 antiguo continúa funcionando contra el Worker v3. El frontend nuevo no manda escrituras de amigos si detecta un Worker v2; las conserva localmente para reconciliar cuando haya v3.

No desplegar v3 antes de aplicar la migración `0005`; el Worker lee `holes.player_id`, `rounds.format`, `players` y `round_players` al arrancar. Esta tanda no se probó ni se desplegó.

## Próximos pasos de mayor valor

1. Cuando el usuario pida verificar, correr `npm test` y arreglar los fallos; sumar casos de sincronización multi-jugador con pérdida/recuperación de red.
2. Probar una ronda Scramble completa, incluidos netos, guardado offline/reintento, tarjeta CSV y clasificación.
3. Hacer revisión visual y una ronda de aceptación local con uno, dos y tres jugadores, incluyendo canchas de 9 y 18 hoyos.
4. Contrastar tarjetas físicas antes de retirar avisos de baja confianza; revisar insights con cantidades mínimas y datos reales.
5. Confirmar estado real de migraciones remotas; aplicar `0002`–`0005`, desplegar Worker v3 y después frontend. No ejecutar importaciones destructivas sin export fresco.

## Estado Git / cautelas

El árbol tiene muchos cambios pendientes desde antes de esta tanda: refactor de frontend, Worker/D1, archivos nuevos, cambios/retiros en tests y renombre de los archivos de legado. Nada debe suponerse como cambio exclusivo de la última sesión. Revisar `git status --short` y `git diff` al retomar. `tools/import-csv.mjs` puede vaciar tablas: no ejecutarlo sin un export fresco.

Migraciones locales por confirmar/aplicar en producción: `0002_course_ref.sql` a `0005_players_and_formats.sql` (confirmar estado real con Wrangler antes de aplicar; no inferirlo del repositorio).
