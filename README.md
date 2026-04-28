# Golfie — Setup & Deploy

## Estructura
```
golfie/
├── index.html       ← App completa (frontend)
├── appsscript.gs    ← Backend (Google Apps Script)
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

1. Abrí `index.html` en VS Code
2. Buscá esta línea (aprox. línea 10 del script):
   ```js
   const APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL_HERE';
   ```
3. Reemplazá `YOUR_APPS_SCRIPT_URL_HERE` con la URL del paso anterior

---

## Paso 5 — Probar

1. Abrí `index.html` directamente en el browser (doble click)
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
