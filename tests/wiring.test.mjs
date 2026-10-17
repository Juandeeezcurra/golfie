// ============================================================
// CABLEADO DE LA APP
// ============================================================
// La app no tiene build step: nadie verifica que un import apunte a algo que
// exista, ni que un onclick="foo()" del HTML tenga su función expuesta en
// window. Los dos errores rompen la app entera en runtime y no se ven hasta
// abrirla. Estos tests los agarran en el commit.
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = path.join(ROOT, 'public', 'js');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : full.endsWith('.js') ? [full] : [];
  });
}

const jsFiles = walk(JS_DIR);

function exportsOf(file) {
  const src = fs.readFileSync(file, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  return names;
}

test('todos los imports apuntan a un archivo y a exports que existen', () => {
  const problems = [];

  for (const file of jsFiles) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
      const target = path.resolve(path.dirname(file), m[2]);
      const rel = path.relative(ROOT, file);
      if (!fs.existsSync(target)) {
        problems.push(`${rel}: importa "${m[2]}" y ese archivo no existe`);
        continue;
      }
      const available = exportsOf(target);
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name && !available.has(name)) {
          problems.push(`${rel}: importa "${name}" de ${m[2]}, que no lo exporta`);
        }
      }
    }
  }

  assert.deepEqual(problems, [], '\n' + problems.join('\n'));
});

// Las funciones que usan los onclick/oninput del markup tienen que estar en
// window, porque el HTML no puede ver el scope de un módulo ES.
test('todo handler inline del HTML está expuesto en window', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(JS_DIR, 'main.js'), 'utf8');

  // Lo que main.js mete en window (el bloque Object.assign(window, {...})).
  const assignBlock = main.match(/Object\.assign\(window,\s*\{([\s\S]*?)\n\}\);/);
  assert.ok(assignBlock, 'no se encontró el Object.assign(window, {...}) en main.js');
  const exposed = new Set(
    assignBlock[1]
      .split(',')
      .map(s => s.split(':')[0].trim())
      .filter(s => s && !s.startsWith('//'))
  );

  // Handlers inline: en el HTML y también en los template strings de los
  // módulos (las tarjetas de ronda, el feedback de palos, los modales).
  //
  // Se escanea el código fuente, así que antes hay que sacar lo que no llega
  // al HTML renderizado: los comentarios (pueden traer ejemplos) y las
  // interpolaciones ${...} (la función que interpola no es un handler).
  const strip = src => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, 'X');

  const sources = [html, ...jsFiles.map(f => fs.readFileSync(f, 'utf8'))].map(strip);
  const used = new Set();
  for (const src of sources) {
    for (const attr of src.matchAll(/\son[a-z]+\s*=\s*"([^"]*)"/g)) {
      for (const call of attr[1].matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
        used.add(call[1]);
      }
    }
  }

  // Globales del navegador que pueden aparecer en un handler inline.
  const BUILTINS = new Set(['event', 'alert', 'confirm', 'setTimeout', 'parseInt', 'parseFloat', 'String', 'Number', 'Boolean']);

  const missing = [...used].filter(name => !exposed.has(name) && !BUILTINS.has(name)).sort();
  assert.deepEqual(missing, [], 'handlers usados en el markup que no están en window: ' + missing.join(', '));
});

test('el service worker precachea todos los archivos que existen', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8');
  const listed = [...sw.matchAll(/^\s*'(\/[^']*)',/gm)].map(m => m[1]);

  const missingFromDisk = listed
    .filter(p => p !== '/')
    .filter(p => !fs.existsSync(path.join(ROOT, 'public', p)));
  assert.deepEqual(missingFromDisk, [], 'el SW precachea archivos que no existen: ' + missingFromDisk.join(', '));

  // Y al revés: un módulo nuevo que no entre al precache rompe el modo offline.
  const notPrecached = jsFiles
    .map(f => '/' + path.relative(path.join(ROOT, 'public'), f).split(path.sep).join('/'))
    .filter(p => !listed.includes(p));
  assert.deepEqual(notPrecached, [], 'módulos que faltan en el precache del SW: ' + notPrecached.join(', '));
});
