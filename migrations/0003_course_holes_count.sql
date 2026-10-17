-- Cantidad de hoyos de la tarjeta elegida para la ronda (por ejemplo,
-- Boulogne tiene 9). Las rondas antiguas quedan vacías y usan 18 por defecto.
ALTER TABLE rounds ADD COLUMN course_holes_count REAL;
