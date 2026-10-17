// Contenedor de las instancias que arma main.js (store y sync).
// Los módulos de UI lo importan para no recibir todo por parámetro.
// Los tests pueden poblarlo con sus propias instancias.
export const app = {
  store: null,
  sync: null,
};
