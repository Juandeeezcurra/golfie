-- Marca los hoyos donde la pelota cayó en un búnker. El sand save se sigue
-- guardando (ahora lo calcula la app: búnker + par o mejor).
ALTER TABLE holes ADD COLUMN bunker INTEGER;
