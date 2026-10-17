# Golfie — Setup & Deploy

Hay dos backends posibles. **Cloudflare (Workers + D1) es el que se usa hoy**;
Apps Script/Sheets queda documentado más abajo como backend legado y contexto
para la migración histórica.

## Estructura
```
golfie/
├── public/
│   ├── index.html        ← App completa (frontend), la sirve el Worker
│   ├── manifest.json
│   ├── icon.png
│   └── favicon-transparent.svg
├── src/
│   ├── index.js           ← Worker: reemplaza doGet/doPost
│   ├── db.js               ← Lógica de negocio sobre D1 (upserts, scoping por user_id)
│   └── schema.js            ← Modelo de datos: de acá sale el DDL de D1
├── migrations/
│   ├── 0001_init.sql
│   └── 0002–0005_*.sql       ← Migraciones incrementales para D1 existente
├── tools/
│   ├── export-from-sheets.gs  ← Paso único: dump del Sheet viejo a JSON
│   ├── import-sheets.mjs       ← Carga ese JSON a D1
│   ├── fake-d1.mjs              ← D1 en memoria, para tests
│   └── gen-schema.mjs            ← Regenera migrations/0001_init.sql desde schema.js
├── tests/
│   ├── sync/, core/, worker/ ← Tests del stack actual (cliente + Worker + D1 falso)
│   └── README.md
├── wrangler.toml
├── legacy/                  ← Copia original de Apps Script/Sheets, para referencia
└── README.md
```

---

## Cloudflare — deploy

Requiere una cuenta de Cloudflare y `wrangler` autenticado (`npx wrangler login`).

### 1. Instalar dependencias
```
npm install
```

### 2. Crear la base D1
```
npm run db:create
```
Copiá el `database_id` que imprime y pegalo en `wrangler.toml`
(reemplazá `REPLACE_WITH_REAL_DATABASE_ID`).

### 3. Aplicar el esquema
```
npm run db:migrate:local    # para probar con `wrangler dev`
npm run db:migrate          # contra la base real, antes de deployar
```

Este comando aplica todas las migraciones pendientes. Revisá el estado de D1
antes de usar `--remote`; el frontend actual necesita Worker v3 y migración `0005`.

### 4. Probar local
```
npm run dev
```
Abre `http://localhost:8787` — el Worker sirve `public/index.html` y la API
en `/api`, mismo origen (no hace falta configurar nada en el frontend).

### 5. Deploy
```
npm run deploy
```

### 6. Migrar los datos del Google Sheet

**Opción A — CSV (recomendada, no toca el Apps Script en producción):**

1. En el Sheet, abrí la pestaña `Rounds` → **Archivo → Descargar → Valores
   separados por comas (.csv)**. Repetí con `Holes` y `ClubFeedback`.
2. Importalo a D1:
   ```
   node tools/import-csv.mjs --local \
     --rounds "ruta/Rounds.csv" --holes "ruta/Holes.csv" --club-feedback "ruta/ClubFeedback.csv"

   node tools/import-csv.mjs --remote \
     --rounds "ruta/Rounds.csv" --holes "ruta/Holes.csv" --club-feedback "ruta/ClubFeedback.csv"
   ```
   Cualquiera de las 3 rutas se puede omitir si esa hoja está vacía.

**Opción B — export vía Apps Script:**

1. Pegá al final de tu `appsscript.gs` el contenido de
   `tools/export-from-sheets.gs`. Agregá el case que indica ese archivo
   dentro de `doGet`, guardá, y redeployá tu Web App existente
   (Implementar → Administrar implementaciones → Editar → Nueva versión).
2. Pedí el export:
   ```
   curl -s "<TU_APPS_SCRIPT_URL>?action=exportAll" > golfie-export.json
   ```
3. Importalo a D1:
   ```
   node tools/import-sheets.mjs --local     # probar primero
   node tools/import-sheets.mjs --remote    # a la base real
   ```

Ambas opciones reemplazan las tablas históricas que importan, así
que no las repitas sin export fresco. Filas sin `user_id`
(huérfanas, de antes de que existiera el código de usuario) se importan
igual de huérfanas: la pantalla de "Reparar datos" de la app las sigue
encontrando y dejando reclamar una por una, exactamente como con Sheets.

### Tests

`npm test` corre la suite del cliente, Worker y D1 simulado. Requiere Node 22.5+
por `node:sqlite`. La cobertura y los invariantes están documentados en
[`tests/README.md`](tests/README.md).

---

## Google Sheets / Apps Script (legado)

Esta es la versión original, anterior a Cloudflare. Se conserva bajo `legacy/`
como referencia y para entender el origen de los datos históricos. Para un
deploy nuevo, usá Cloudflare.

### Estructura
```
golfie/
├── legacy/golfie.html       ← App completa (frontend)
├── legacy/appsscript.gs    ← Backend (Google Apps Script)
└── README.md
```

---

## Paso 1 — Google Sheets

1. Abrí [sheets.google.com](https://sheets.google.com) y creá un nuevo Sheet llamado **Golfie**
2. No necesitás crear las hojas manualmente — el script las crea solo al primer uso

---

## Paso 2 — Apps Script

1. En el Sheet: **Extensiones → Apps Script**
2. Borrá el código que viene por defecto
3. Pegá todo el contenido de `appsscript.gs`
4. Guardá (Ctrl+S)

---

## Paso 3 — Publicar como Web App

1. Click en **Implementar → Nueva implementación**
2. Tipo: **Aplicación web**
3. Configuración:
   - Descripción: `Golfie v1`
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquiera**
4. Click **Implementar**
5. Copiá la URL que aparece (empieza con `https://script.google.com/macros/s/...`)

---

## Paso 4 — Conectar Frontend

1. Abrí `golfie.html` en VS Code
2. Buscá esta línea (aprox. línea 10 del script):
   ```js
   const APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL_HERE';
   ```
3. Reemplazá `YOUR_APPS_SCRIPT_URL_HERE` con la URL del paso anterior

---

## Paso 5 — Probar

1. Abrí `legacy/golfie.html` directamente en el browser (doble click)
2. Creá una nueva ronda
3. Verificá que aparezcan las hojas en el Sheet:
   - `Rounds`
   - `Holes`
   - `ClubFeedback`

---

## Sheets que se crean automáticamente

| Sheet | Descripción |
|-------|-------------|
| `Rounds` | Una fila por ronda completa |
| `Holes` | Una fila por hoyo jugado |
| `ClubFeedback` | Semáforo + tags por palo por ronda |

---

## Notas

- **Sin señal:** los datos se guardan localmente (localStorage) y se sincronizan cuando volvés a tener conexión
- **Sin URL configurada:** la app funciona igual, solo no sincroniza con Sheets
- **Privacidad:** la Web App solo acepta requests, no tiene autenticación. Para uso personal está perfecto.

---

## Próximos pasos (v2)

- [ ] Dashboard histórico con tendencias
- [ ] Cálculo automático de Handicap Index
- [ ] Análisis por tipo de hoyo (par 3/4/5)
- [ ] Export a CSV

## Tests

`npm test` corre la suite del stack activo (cliente, Worker y D1 simulado).
Requiere Node 22.5+ por `node:sqlite`; ver [tests/README.md](tests/README.md)
para invariantes y cobertura.
