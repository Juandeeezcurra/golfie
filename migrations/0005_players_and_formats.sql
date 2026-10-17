-- Base para rondas con amigos. Las filas existentes quedan como tarjeta propia.
ALTER TABLE rounds ADD COLUMN format TEXT;
ALTER TABLE holes ADD COLUMN player_id TEXT NOT NULL DEFAULT 'me';

CREATE TABLE IF NOT EXISTS players (
  _seq INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT,
  name TEXT,
  handicap_index REAL,
  user_id TEXT
);

CREATE TABLE IF NOT EXISTS round_players (
  _seq INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id TEXT,
  player_id TEXT,
  team_id TEXT,
  playing_handicap REAL,
  user_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_players_user ON players (user_id);
CREATE INDEX IF NOT EXISTS idx_round_players_round ON round_players (round_id);
CREATE INDEX IF NOT EXISTS idx_round_players_user ON round_players (user_id);
