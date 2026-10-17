// Alta manual de canchas: para cuando jugás en una que no está precargada.
// Queda guardada en el dispositivo y aparece en el buscador como una más.
import { saveCustomCourse, slugify, findCourse } from '../catalog.js';
import { validateCourse } from '../core/courses.js';
import { showToast } from './toast.js';
import { goTo } from './router.js';

// Par por defecto razonable: una cancha típica es 4 pares 3, 10 pares 4 y
// 4 pares 5. Se arranca todo en par 4 y el usuario corrige lo que cambie.
export function renderCourseFormHoles() {
  const grid = document.getElementById('nc-holes-grid');
  if (!grid) return;
  const count = Number(document.getElementById('nc-holes').value) || 18;

  grid.innerHTML = `
    <div class="nc-row nc-head">
      <span>Hoyo</span><span>Par</span><span>Stroke index</span>
    </div>
    ${Array.from({ length: count }, (_, i) => {
      const n = i + 1;
      return `<div class="nc-row">
        <span class="nc-hole">${n}</span>
        <select class="input nc-par" data-hole="${n}" aria-label="Par del hoyo ${n}">
          <option value="3">3</option>
          <option value="4" selected>4</option>
          <option value="5">5</option>
        </select>
        <input class="input nc-si" data-hole="${n}" type="number" min="1" max="${count}" value="${n}" aria-label="Stroke index del hoyo ${n}">
      </div>`;
    }).join('')}`;
}

export function saveNewCourse() {
  const name = document.getElementById('nc-name').value.trim();
  if (!name) { showToast('Poné el nombre de la cancha'); return; }

  const count = Number(document.getElementById('nc-holes').value) || 18;
  const units = document.getElementById('nc-units').value;
  const slope = parseFloat(document.getElementById('nc-slope').value) || null;
  const rating = parseFloat(document.getElementById('nc-rating').value) || null;

  const holes = Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const par = Number(document.querySelector(`.nc-par[data-hole="${n}"]`).value);
    const siRaw = document.querySelector(`.nc-si[data-hole="${n}"]`).value;
    const si = siRaw === '' ? null : Number(siRaw);
    return { hole: n, par, si, lengths: {} };
  });

  const course = {
    course_id: slugify(name),
    name,
    club: name,
    city: '',
    holes_count: count,
    units,
    source: 'cargada a mano',
    verified_at: new Date().toISOString().slice(0, 10),
    confidence: 'high',          // la cargó el usuario con la tarjeta a la vista
    tees: [{ tee_id: 'blancos', label: 'Blancos', length: null, par: holes.reduce((a, h) => a + h.par, 0), rating, slope }],
    holes,
  };

  const problems = validateCourse(course);
  if (problems.length) {
    // El error más común es repetir un stroke index; se dice cuál.
    showToast(problems[0].replace(course.course_id + ': ', ''), 4000);
    return;
  }

  if (findCourse(course.course_id)) {
    showToast('Ya tenés una cancha con ese nombre', 3000);
    return;
  }

  saveCustomCourse(course);
  showToast('Cancha guardada ✓');
  goTo('new-round');
}
