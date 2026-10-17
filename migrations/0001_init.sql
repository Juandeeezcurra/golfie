CREATE TABLE IF NOT EXISTS rounds (
  _seq INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id TEXT,
  date TEXT,
  course_name TEXT,
  tees TEXT,
  slope_rating REAL,
  course_rating REAL,
  hcp_index REAL,
  weather TEXT,
  total_score REAL,
  par_total REAL,
  total_putts REAL,
  fairways_hit REAL,
  greens_in_regulation REAL,
  holes_played REAL,
  completed INTEGER,
  user_id TEXT
);

CREATE TABLE IF NOT EXISTS holes (
  _seq INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id TEXT,
  hole_number REAL,
  par REAL,
  score REAL,
  putts REAL,
  fairway_hit INTEGER,
  green_in_regulation INTEGER,
  penalties REAL,
  up_and_down INTEGER,
  sand_save INTEGER,
  user_id TEXT
);

CREATE TABLE IF NOT EXISTS club_feedback (
  _seq INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id TEXT,
  club TEXT,
  rating TEXT,
  tags TEXT,
  timestamp TEXT,
  user_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_rounds_round_id ON rounds (round_id);

CREATE INDEX IF NOT EXISTS idx_rounds_user ON rounds (user_id);

CREATE INDEX IF NOT EXISTS idx_holes_round ON holes (round_id);

CREATE INDEX IF NOT EXISTS idx_holes_user ON holes (user_id);

CREATE INDEX IF NOT EXISTS idx_club_feedback_round ON club_feedback (round_id);

CREATE INDEX IF NOT EXISTS idx_club_feedback_user ON club_feedback (user_id);
