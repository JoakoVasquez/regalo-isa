// Capítulo 5: guiones. Formato igual que src/dialogues.js:
//   { who, text }  ·  *texto* = resaltado  ·  {w} = pausita
// 'yo' = Joaco. La Isa llegó primero y está en el mirador del puente, mirando hacia la Costanera.

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ── Fase 1: llegar sin que vea las flores ──
export const INTRO = [
  { who: 'yo', text: '*(Ya está aquí...{w} llegó primero.)*' },
  { who: 'yo', text: '*(Tengo que llegar hasta ella sin que vea las flores.)*' },
  { who: 'yo', text: '*(Si se da vuelta...{w} me quedo quieto y las escondo atrás.)*' },
];

// Lo que piensa Joaco cuando la Isa se da vuelta y no lo pilla
export const SALVADO = ['*(Uf...)*', '*(Casi...)*', '*(No vio nada...)*', '*(Pasa piola...)*'];
// Cuando está a punto de pillarlo
export const CASI = ['*(¡Me está mirando!)*', '*(¡Quieto!)*', '*(¡Las flores!)*'];

// La Isa lo pilla con las flores (pierdes)
export const PILLADO = [
  { who: 'isa', text: '¿Joaco?{w} ¿Qué tienes ahí atrás?' },
  { who: 'yo', text: '¡Nada!{w} Son...{w} eh...{w} para mi mamá.' },
  { who: 'isa', text: '...¿Y le compraste flores a tu mamá para traerlas aquí?' },
];

// ── Fase 2: los nervios ──
export const LLEGA = [
  { who: 'yo', text: 'Hola.' },
  { who: 'isa', text: '¡Joaco!{w} Me asustaste.' },
  { who: 'yo', text: '*(Ya...{w} es ahora.{w} Calmao.)*' },
];
// La frase se va armando con cada latido acertado (un pedazo por acierto).
export const FRASE = ['Isa...', 'te traje', 'estas flores', 'porque...', '¿quieres', 'pololear', 'conmigo?'];
// Lo que se le sale cuando falla un latido
export const TARTAMUDEO = ['eh...', 'em...', 'o sea...', 'ehh...', 'mm...', 'este...'];
export const NERVIOS = 'Nervios';
export const RITMO_AYUDA = 'Aprieta <span class="btn-a">A</span> cuando el corazón llegue al centro';
// Si los nervios llegan al máximo (pierdes)
export const BLOQUEO = [
  { who: 'yo', text: '¿Quieres...{w} quieres...' },
  { who: 'yo', text: '...¿ir por un *helado*?' },
  { who: 'isa', text: '...¿Ah?{w} Bueno, ya.' },
];

// ── Fase 3: la Isa responde (juegas como ella) ──
export const PREGUNTA = '¿Quieres pololear conmigo?';
export const BOTON_SI = 'Sí';
export const BOTON_NO = 'No';
// Lo que dice el botón "No" cada vez que se arranca (se escapa siempre; la lista se repite)
export const NO_ESCAPA = ['No', '¿Segura?', 'Piénsalo', 'Mira las flores', 'Nica', 'Nunca'];
export const RESPUESTA_AYUDA = 'Responde con el mouse o con <b>←</b> <b>→</b> y <span class="btn-a">A</span>';

// Final (edítalo con lo que le dijiste y lo que ella respondió de verdad)
export const FINAL = [
  { who: 'isa', text: '¡Sí!{w} Obvio que sí.' },
  { who: 'yo', text: 'Por suerte jajajaja' },
  { who: 'isa', text: 'Las flores estan muy bonitas.' },
  { who: 'yo', text: 'Te traje gomitas tambien :)' },
];

// Textos de pantalla del capítulo
export const OBJETIVO = '<small>Capítulo 5</small>Llega hasta la Isa <b>sin que vea las flores</b>';
export const OBJETIVO2 = '<small>Capítulo 5</small>Calma los <b>nervios</b> y díselo';
export const AYUDA = '<span><b>WASD</b> / flechas: moverse</span><span>Mantén <b>E</b> / Espacio: esconder el ramo</span><span><b>Q</b> / <b>R</b>: girar cámara</span><span><b>Esc</b>: pausa</span>';
export const SOSPECHA = 'Sospecha';
export const GANAR = {
  title: '¡Capítulo 5 completado!',
  text: 'Llegaste sin que viera las flores, le ganaste a los nervios\ny ella dijo que sí. 💐',
};
export const PERDER_PILLADO = {
  title: 'Sorpresa arruinada',
  text: 'La Isa vio las flores antes de tiempo.\nEscóndelas cuando se dé vuelta.',
};
export const PERDER_NERVIOS = {
  title: 'Los nervios ganaron',
  text: 'Joaco terminó invitándola a un helado.\nRico, pero no era la idea.',
};

export const salvado = () => pick(SALVADO);
export const casi = () => pick(CASI);
export const tartamudeo = () => pick(TARTAMUDEO);
