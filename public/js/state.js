// Estado en memoria de la ronda en curso + constantes de la app.
// No se persiste: lo persistido vive en store.js.

export const CLUBS = ['Driver', 'Madera', 'Híbrido', 'Hierro 3', 'Hierro 4', 'Hierro 5', 'Hierro 6', 'Hierro 7', 'Hierro 8', 'Hierro 9', 'Wedge 52', 'Wedge 56', 'Wedge 60', 'Putter'];
export const TAGS = ['Corto', 'Largo', 'Perfecto', 'Slice', 'Hook', 'Recto', 'Filazo', 'Inconsistente', 'Sólido'];

export const state = {
  currentRound: null,
  currentHole: 1,
  holes: {},
  currentPlayerId: 'me',
  roundPlayers: [],
  clubFeedback: {},
  editing: false,   // true mientras se corrige un hoyo de una ronda ya terminada
  courses: [],
};
