-- Perfiles públicos y amistades entre usuarios. Es opt-in: sin perfil nadie
-- aparece en búsquedas ni puede recibir solicitudes. El código de usuario
-- (user_id) nunca sale del servidor; lo público es el `username`.
CREATE TABLE IF NOT EXISTS profiles (
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
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships (addressee_id);
