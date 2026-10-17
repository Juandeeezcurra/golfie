// Escribe el esquema COMPLETO actual (según src/schema.js) en
// schema-current.sql, como referencia legible.
//
// OJO: ya no genera migrations/0001_init.sql. Una vez que una migración se
// aplicó a la base real, su contenido no se puede cambiar: si 0001 pasara a
// incluir una columna que 0002 agrega con ALTER TABLE, una base nueva
// fallaría con "duplicate column name". Las migraciones se escriben a mano
// de acá en adelante; tests/schema.test.mjs verifica que la suma de las
// migraciones dé exactamente este esquema.
//
// Uso: node tools/gen-schema.mjs
import fs from 'node:fs';
import { buildSchemaSql } from '../src/schema.js';

const header = `-- Generado por tools/gen-schema.mjs desde src/schema.js.
-- Es el esquema completo actual, para leerlo de una. NO es una migración:
-- las migraciones viven en migrations/ y se escriben a mano.

`;

fs.writeFileSync('schema-current.sql', header + buildSchemaSql());
console.log('escrito: schema-current.sql');
