import test from 'node:test';
import assert from 'node:assert/strict';
import { holeInfo, coursePar, validateCourse } from '../../public/js/core/courses.js';

// Cancha de 9 hoyos como Bulogne: SI 1..9, par conocido.
const nineHoleCourse = {
  course_id: 'test-nine', name: 'Test Nine', units: 'meters', confidence: 'high',
  tees: [{ tee_id: 'medio', label: 'Medio', length: 2840, par: 35 }],
  holes: [
    { hole: 1, par: 4, si: 1, lengths: { medio: 402 } },
    { hole: 2, par: 3, si: 9, lengths: { medio: 111 } },
    { hole: 3, par: 4, si: 2, lengths: { medio: 338 } },
    { hole: 4, par: 4, si: 7, lengths: { medio: 305 } },
    { hole: 5, par: 4, si: 3, lengths: { medio: 343 } },
    { hole: 6, par: 4, si: 6, lengths: { medio: 375 } },
    { hole: 7, par: 4, si: 5, lengths: { medio: 314 } },
    { hole: 8, par: 3, si: 8, lengths: { medio: 177 } },
    { hole: 9, par: 5, si: 4, lengths: { medio: 475 } },
  ],
};

test('una cancha de 9 jugada como 9 no desdobla el stroke index', () => {
  const h1 = holeInfo(nineHoleCourse, 1, 'medio', 9);
  assert.equal(h1.si, 1);
  const h9 = holeInfo(nineHoleCourse, 9, 'medio', 9);
  assert.equal(h9.si, 4);
});

test('la misma cancha jugada como 18 desdobla el SI: ida = 2×SI−1, vuelta = 2×SI', () => {
  // Hoyo 1 (SI 1) en la ida es el SI más difícil de los 18: 2*1-1 = 1.
  assert.equal(holeInfo(nineHoleCourse, 1, 'medio', 18).si, 1);
  // El mismo hoyo físico en la vuelta (hoyo 10) es 2*1 = 2.
  assert.equal(holeInfo(nineHoleCourse, 10, 'medio', 18).si, 2);

  // Hoyo 2 (SI 9, el más fácil del loop): ida 2*9-1=17, vuelta 2*9=18.
  assert.equal(holeInfo(nineHoleCourse, 2, 'medio', 18).si, 17);
  assert.equal(holeInfo(nineHoleCourse, 11, 'medio', 18).si, 18);
});

test('el SI desdoblado es una permutación completa de 1..18, sin repetidos', () => {
  const sis = Array.from({ length: 18 }, (_, i) => holeInfo(nineHoleCourse, i + 1, 'medio', 18).si);
  assert.deepEqual([...sis].sort((a, b) => a - b), Array.from({ length: 18 }, (_, i) => i + 1));
});

test('el hoyo 10 jugado como 18 es el mismo par y largo que el hoyo 1 (misma cancha física)', () => {
  const h1 = holeInfo(nineHoleCourse, 1, 'medio', 18);
  const h10 = holeInfo(nineHoleCourse, 10, 'medio', 18);
  assert.equal(h10.par, h1.par);
  assert.equal(h10.length, h1.length);
  assert.equal(h10.hole, 10, 'el número de hoyo que se muestra es el de la ronda, no el físico');
});

test('coursePar duplica el par de la vuelta cuando se juega x2', () => {
  assert.equal(coursePar(nineHoleCourse, 'medio', 9), 35);
  assert.equal(coursePar(nineHoleCourse, 'medio', 18), 70);
});

test('una cancha de 18 hoyos no se ve afectada por la lógica de desdoblamiento', () => {
  const eighteen = {
    course_id: 'test-18', name: 'Test 18', units: 'yards', confidence: 'high',
    tees: [{ tee_id: 'blancos', label: 'Blancos', par: 72 }],
    holes: Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, par: 4, si: i + 1, lengths: {} })),
  };
  assert.equal(holeInfo(eighteen, 5, 'blancos', 18).si, 5);
  assert.equal(coursePar(eighteen, 'blancos', 18), 72);
});

test('validateCourse sigue aceptando el catálogo de 9 hoyos sin cambios', () => {
  const withHolesCount = { ...nineHoleCourse, holes_count: 9 };
  assert.deepEqual(validateCourse(withHolesCount), []);
});
