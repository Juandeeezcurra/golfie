# Tests

```
npm test
```

Sin dependencias: sólo Node (22.5+, por `node:sqlite`). Corren solos en cada
push vía `.github/workflows/tests.yml`.

## Cómo funcionan

No son tests unitarios. `sync/harness.mjs` levanta **el cliente y el backend
reales**:

- `tools/fake-d1.mjs` implementa D1 en memoria sobre el SQLite de Node, con el
  esquema real generado por `src/schema.js`.
- El harness crea un `store` y un `sync` de verdad (`public/js/store.js`,
  `public/js/sync.js`) sobre un `localStorage` simulado, y conecta su `fetch`
  al Worker real (`src/index.js`).

O sea que un test ejercita el camino completo: guardar un hoyo → cola → POST →
Worker → D1 → sync de vuelta. Si se rompe el cliente o el backend, el test se
entera.

El `fetch` simulado puede fallar a propósito: sin red (`online: false`), con
respuestas que el navegador no deja leer (`readable: false`), o descartando un
porcentaje de requests (`dropRate`). Así se reproducen las fallas que
originaron cada suite.

## Qué cubre cada archivo

| Archivo | Qué protege |
|---|---|
| `sync/01-sync.test.mjs` | Escrituras perdidas, la carrera al vaciar la cola, juego sin señal, POST no confirmable, aislamiento entre usuarios, borrado |
| `sync/02-legacy.test.mjs` | Filas viejas sin dueño: se adoptan a mano, **nunca solas** |
| `sync/03-cleanup.test.mjs` | Rondas ajenas ya guardadas en el celular: no se adoptan, la cola envenenada se purga, se borran de los dos lados |
| `sync/04-repair.test.mjs` | Rondas ajenas ya firmadas con tu código; borrado a mano en el servidor y la resurrección por `reconcile` |
| `sync/05-guardrail.test.mjs` | `reconcile` no sube más de `RECONCILE_LIMIT` registros sin que lo apruebes |
| `worker/api.test.mjs` | El Worker aislado: upserts, scoping por `user_id`, acciones desconocidas |
| `wiring.test.mjs` | Que los imports resuelvan, que todo `onclick` del HTML exista en `window`, y que el service worker precachee todos los módulos |

`wiring.test.mjs` existe porque la app no tiene build step: nadie más verifica
que un import apunte a algo que exista o que un handler inline esté expuesto.
Los dos errores rompen la app entera y sólo se ven al abrirla.

## Invariantes que no se pueden romper

1. **Nada sale de la cola sin confirmación del servidor.** Una respuesta opaca
   (`no-cors`) no es confirmación: fue exactamente lo que borró una ronda entera.
2. **Toda escritura es idempotente.** `addRound`, `addHole` y `addClubFeedback`
   son upserts; `updateRound` crea la fila si falta. Reenviar nunca duplica, y eso
   es lo que permite reintentar sin miedo.
3. **"Sin `user_id`" no es "mío".** Las rondas ajenas también están sin dueño en
   el celular. Adoptar por ausencia de dueño fue un bug real, con daño real.
4. **El servidor nunca devuelve filas sin dueño.** La base es compartida.
5. **Nada masivo en silencio.** Por encima de `RECONCILE_LIMIT` se pide permiso.
6. **El celular es la fuente de verdad de qué rondas existen.** Borrar a mano en
   la base no alcanza: `reconcile` lo vuelve a subir. Se borra desde la app.

## Historia

Hasta octubre de 2026 esta suite corría el `<script>` de `golfie.html` contra un
Google Sheets simulado. Al migrar a Cloudflare, esos archivos quedaron
congelados en `legacy/` y la suite se reescribió contra el stack actual: los
mismos invariantes, ahora verificados sobre el código que de verdad se
despliega.
