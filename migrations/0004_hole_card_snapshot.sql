-- Guarda el stroke index y el largo tal como estaban al jugar cada hoyo.
ALTER TABLE holes ADD COLUMN stroke_index REAL;
ALTER TABLE holes ADD COLUMN hole_length REAL;
