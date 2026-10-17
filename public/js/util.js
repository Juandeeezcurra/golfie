// Utilidades sin dependencias.

export function uuid() {
  return 'r-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
}

export function formatDate(d) {
  return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function teeColor(tees) {
  const m = { 'Negros': '#666', 'Azules': '#3b82f6', 'Blancos': '#e5e5e5', 'Amarillos': '#fbbf24', 'Rojos': '#f87171' };
  return m[tees] || '#737373';
}

// Texto que va dentro de un atributo HTML (data-*, title, etc.).
export function attrText(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Texto que va dentro de un string JS de comillas simples, a su vez dentro de
// un atributo HTML: onclick="fn('...')". Primero se escapa para JS y recién
// después para HTML — al revés, una cancha con apóstrofe rompe el handler.
export function jsStr(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
