// ============================================================
// GOLFIE — SCHEMA CANÓNICO
// ============================================================
// Única fuente de verdad del modelo de datos: de acá sale el SQL de D1 y la
// conversión de tipos que usa src/db.js.
//
// Regla de oro heredada de Sheets: una celda vacía es '' (string vacío), no
// null. golfie.html hace chequeos como `h.fairway_hit === true` en varios
// lugares (ver golfie.html líneas ~1034-1437): con null en vez de '' esos
// chequeos siguen dando false, pero se prefiere no cambiar el contrato.
// ============================================================

export const T = {
  TEXT: 'text',  // '' cuando está vacía
  NUM: 'num',    // number nativo, '' cuando está vacía
  BOOL: 'bool',  // true/false nativo, '' cuando está sin definir (hoyos par 3)
};

export const SHEETS = {
  ROUNDS: 'Rounds',
  HOLES: 'Holes',
  CLUB_FEEDBACK: 'ClubFeedback',
  PLAYERS: 'Players',
  ROUND_PLAYERS: 'RoundPlayers',
};

// Nombre lógico (el que usa appsscript.gs) -> tabla física en D1.
export const TABLE_OF = {
  [SHEETS.ROUNDS]: 'rounds',
  [SHEETS.HOLES]: 'holes',
  [SHEETS.CLUB_FEEDBACK]: 'club_feedback',
  [SHEETS.PLAYERS]: 'players',
  [SHEETS.ROUND_PLAYERS]: 'round_players',
};

// Columnas en el mismo orden que ROUND_HEADERS / HOLES / CLUB_FEEDBACK en
// appsscript.gs.
export const COLUMNS = {
  [SHEETS.ROUNDS]: {
    round_id: T.TEXT,
    date: T.TEXT,
    course_name: T.TEXT,
    tees: T.TEXT,
    // Referencia a la cancha del catálogo (public/data/courses.json) y al tee
    // elegido. course_name/tees se siguen guardando como texto: si una cancha
    // del catálogo cambia o se borra, la ronda vieja conserva qué jugó.
    course_id: T.TEXT,
    tee_id: T.TEXT,
    course_holes_count: T.NUM,
    format: T.TEXT,
    slope_rating: T.NUM,
    course_rating: T.NUM,
    hcp_index: T.NUM,
    weather: T.TEXT,
    total_score: T.NUM,
    par_total: T.NUM,
    total_putts: T.NUM,
    fairways_hit: T.NUM,
    greens_in_regulation: T.NUM,
    holes_played: T.NUM,
    completed: T.BOOL,
    user_id: T.TEXT,
  },
  [SHEETS.HOLES]: {
    round_id: T.TEXT,
    hole_number: T.NUM,
    player_id: T.TEXT,
    par: T.NUM,
    // Foto de la tarjeta al jugar: una corrección futura del catálogo no
    // cambia el handicap ni la distancia de rondas ya guardadas.
    stroke_index: T.NUM,
    hole_length: T.NUM,
    score: T.NUM,
    putts: T.NUM,
    fairway_hit: T.BOOL,
    green_in_regulation: T.BOOL,
    penalties: T.NUM,
    up_and_down: T.BOOL,
    sand_save: T.BOOL,
    bunker: T.BOOL,
    user_id: T.TEXT,
  },
  [SHEETS.CLUB_FEEDBACK]: {
    round_id: T.TEXT,
    club: T.TEXT,
    rating: T.TEXT,
    tags: T.TEXT,
    timestamp: T.TEXT,
    user_id: T.TEXT,
  },
  [SHEETS.PLAYERS]: {
    player_id: T.TEXT,
    name: T.TEXT,
    handicap_index: T.NUM,
    user_id: T.TEXT,
  },
  [SHEETS.ROUND_PLAYERS]: {
    round_id: T.TEXT,
    player_id: T.TEXT,
    team_id: T.TEXT,
    playing_handicap: T.NUM,
    user_id: T.TEXT,
  },
};

export const SHEET_NAMES = Object.keys(COLUMNS);

export const HEADERS = Object.fromEntries(
  Object.entries(COLUMNS).map(([name, cols]) => [name, Object.keys(cols)])
);

// Perfiles y amistades (ver migrations/0007_social.sql). A propósito fuera de
// COLUMNS/SHEETS: no vienen de Sheets, y así las herramientas de importación,
// que vacían las tablas de COLUMNS antes de cargar, nunca las tocan.
const SOCIAL_SQL = `CREATE TABLE IF NOT EXISTS profiles (
  _seq INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  username TEXT,
  display_name TEXT,
  avatar TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS friendships (
  _seq INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id TEXT,
  addressee_id TEXT,
  status TEXT,
  created_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_user ON profiles (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username ON profiles (username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_friendships_pair ON friendships (requester_id, addressee_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships (addressee_id);`;

const SQL_TYPE = { [T.TEXT]: 'TEXT', [T.NUM]: 'REAL', [T.BOOL]: 'INTEGER' };

// Genera el DDL de las 3 tablas + índices de los filtros calientes
// (round_id, user_id). `_seq` preserva el orden de inserción, que en Sheets
// era implícito (el orden de las filas).
export function buildSchemaSql() {
  const out = [];
  for (const sheetName of SHEET_NAMES) {
    const table = TABLE_OF[sheetName];
    const cols = COLUMNS[sheetName];
    const lines = ['  _seq INTEGER PRIMARY KEY AUTOINCREMENT'];
    for (const [col, type] of Object.entries(cols)) {
      lines.push(`  ${col} ${SQL_TYPE[type]}`);
    }
    out.push(`CREATE TABLE IF NOT EXISTS ${table} (\n${lines.join(',\n')}\n);`);
  }
  out.push('CREATE INDEX IF NOT EXISTS idx_rounds_round_id ON rounds (round_id);');
  out.push('CREATE INDEX IF NOT EXISTS idx_rounds_user ON rounds (user_id);');
  out.push('CREATE INDEX IF NOT EXISTS idx_holes_round ON holes (round_id);');
  out.push('CREATE INDEX IF NOT EXISTS idx_holes_user ON holes (user_id);');
  out.push('CREATE INDEX IF NOT EXISTS idx_club_feedback_round ON club_feedback (round_id);');
  out.push('CREATE INDEX IF NOT EXISTS idx_club_feedback_user ON club_feedback (user_id);');
  out.push('CREATE INDEX IF NOT EXISTS idx_players_user ON players (user_id);');
  out.push('CREATE INDEX IF NOT EXISTS idx_round_players_round ON round_players (round_id);');
  out.push('CREATE INDEX IF NOT EXISTS idx_round_players_user ON round_players (user_id);');
  out.push(SOCIAL_SQL);
  return out.join('\n\n') + '\n';
}
