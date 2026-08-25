# Tests

```
node tests/run.js
```

Sin dependencias: sólo Node. Corren solos en cada push vía `.github/workflows/tests.yml`.

## Cómo funcionan

No son tests unitarios. `harness.js` levanta **el cliente y el backend reales**:

- `sheets-mock.js` implementa Google Sheets en memoria (`getRange`, `appendRow`,
  `deleteRow`, …), lo justo para que `appsscript.gs` corra tal cual está.
- `harness.js` extrae el `<script>` de `golfie.html`, le da stubs de `document`,
  `localStorage` y `fetch`, y conecta ese `fetch` al `doGet`/`doPost` del backend.

O sea que un test ejercita el camino completo: guardar un hoyo → cola → POST →
Apps Script → planilla → sync de vuelta. Si alguno de los dos archivos se rompe,
el test se entera. Editar `golfie.html` o `appsscript.gs` no requiere tocar nada acá.

El `fetch` simulado puede fallar a propósito: sin red (`online: false`), con
respuestas que el navegador no deja leer (`readable: false`), o descartando un
porcentaje de requests. Así se reproducen las fallas que originaron cada suite.

## Qué cubre cada suite

| Suite | Regresión que protege |
|---|---|
| `01-sync` | Escrituras perdidas en silencio, la carrera al vaciar la cola, juego sin señal, POST no confirmable, aislamiento entre usuarios, borrado |
| `02-legacy` | Filas viejas sin dueño: se adoptan a mano, **nunca solas** |
| `03-cleanup` | Rondas ajenas ya guardadas en el celular: no se adoptan, la cola envenenada se purga, se borran de los dos lados |
| `04-repair` | Rondas ajenas ya firmadas con tu código; borrar a mano en el Sheet y la resurrección por `reconcile` |
| `05-guardrail` | `reconcile` no sube más de `RECONCILE_LIMIT` registros sin que lo apruebes |

## Invariantes que no se pueden romper

1. **Nada sale de la cola sin confirmación del servidor.** Una respuesta opaca
   (`no-cors`) no es confirmación: fue exactamente lo que borró una ronda entera.
2. **Toda escritura es idempotente.** `addRound`, `addHole` y `addClubFeedback`
   son upserts; `updateRound` crea la fila si falta. Reenviar nunca duplica, y eso
   es lo que permite reintentar sin miedo.
3. **"Sin `user_id`" no es "mío".** Las rondas ajenas también están sin dueño en
   el celular. Adoptar por ausencia de dueño fue un bug real, con daño real.
4. **`doGet` nunca devuelve filas sin dueño.** La planilla es compartida.
5. **Nada masivo en silencio.** Por encima de `RECONCILE_LIMIT` se pide permiso.
6. **El celular es la fuente de verdad de qué rondas existen.** Borrar a mano en
   el Sheet no alcanza: `reconcile` lo vuelve a subir. Se borra desde la app.
