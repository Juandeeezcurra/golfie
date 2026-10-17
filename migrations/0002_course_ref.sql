-- Referencia de cada ronda a la cancha del catálogo y al tee jugado.
-- course_name y tees siguen guardándose como texto libre: si una cancha del
-- catálogo cambia, la ronda vieja conserva lo que se jugó ese día.
ALTER TABLE rounds ADD COLUMN course_id TEXT;
ALTER TABLE rounds ADD COLUMN tee_id TEXT;
