// Capítulo 8: el concurso. Formato igual que src/dialogues.js:
//   { who, text }  ·  *texto* = resaltado  ·  {w} = pausita
// 'yo' = Joaco, que hace de animador. La Isa concursa: 5 preguntas, y si las responde todas
// se gana la carta. Una sola respuesta mala y hay que empezar de nuevo.

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const PROGRAMA = '¿Quién quiere ser millonaria?';

export const INTRO = [
  { who: 'yo', text: '¡Buenas noches y bienvenidos a *¿Quién quiere ser millonaria?*!' },
  { who: 'yo', text: 'Esta noche concursa alguien muy especial.{w} ¡Un aplauso para *la Isa*!' },
  { who: 'isa', text: '¿Hola?{w} ¿Desde cuándo eres animador?' },
  { who: 'yo', text: 'Desde hoy.{w} Son *5 preguntas*.{w} Si las respondes todas, te llevas el gran premio.' },
  { who: 'isa', text: '¿Y cuál es el gran premio?' },
  { who: 'yo', text: 'Sorpresa.{w} ¿Lista?' },
];

// ── Las 5 preguntas ──
// texto: la pregunta · opciones: siempre 4 · ok: cuál es la correcta (0 = A, 1 = B, 2 = C, 3 = D)
// premio: lo que se lleva al acertarla · antes / bien: lo que dice Joaco antes y después (opcional)
export const PREGUNTAS = [
  {
    premio: '1 abrazo',
    antes: [{ who: 'yo', text: 'Primera pregunta,{w} por *un abrazo*.' }],
    texto: '¿Cuál fue la primera película que vimos juntos?',
    opciones: ['Toy Story', 'Cómo entrenar a tu dragón', 'Cómo perder a un hombre en 10 días', 'Spiderman'],
    ok: 1,
    bien: [{ who: 'yo', text: '¡Correcto!{w} Nuestro primer *dragón*.' }],
  },
  {
    premio: '1 beso',
    antes: [{ who: 'yo', text: 'Segunda pregunta,{w} por *un beso*.' }],
    texto: '¿Cuál es la comida favorita de Joaco?',
    opciones: ['Pizza', 'Sushi', 'Papas fritas', 'Pie de limón'],
    ok: 2,
    bien: [{ who: 'yo', text: '¡Sí!{w} Las *papas fritas* nunca fallan.' }],
  },
  {
    premio: '1 helado',
    antes: [{ who: 'yo', text: 'Tercera pregunta,{w} por *un helado*.{w} Se pone difícil.' }],
    texto: '¿Qué canción dijo Joaco que le recordaba a ti?',
    opciones: ['Stop the World I Wanna Get Off With You', 'Best Friend', 'Spend a Lifetime', 'Classic'],
    ok: 3,
    bien: [{ who: 'yo', text: '¡Exacto!{w} *Classic*.{w} Qué memoria.' }],
  },
  {
    premio: '1 cita sorpresa',
    antes: [{ who: 'yo', text: 'Cuarta pregunta,{w} por *una cita sorpresa*.' }],
    texto: '¿Cuántas horas duerme la Isa en vacaciones?',
    opciones: ['4 horas', '6 horas', '7 horas', '13,5 horas'],
    ok: 3,
    bien: [{ who: 'yo', text: '¡Correcto!{w} *13,5 horas*.{w} Una profesional.' }],
  },
  {
    premio: 'El gran premio',
    antes: [
      { who: 'yo', text: 'Última pregunta.{w} La del *gran premio*.' },
      { who: 'isa', text: 'Estoy nerviosa.' },
      { who: 'yo', text: 'Tranquila.{w} Esta te la sabes.' },
    ],
    texto: '¿Cuánto te ama Joaco?',
    opciones: ['Mucho', 'Muchísimo', 'Demasiado', 'Todas las anteriores'],
    ok: 3,
    bien: [{ who: 'yo', text: '¡¡CORRECTO!!{w} Y me quedé corto con las opciones.' }],
  },
];

export const PANEL = {
  pregunta: (n, total) => `Pregunta ${n} de ${total}`,
  elegir: '<b>← ↑ ↓ →</b> elegir · <span class="btn-a">A</span> marcar',
  confirmar: '¿Respuesta definitiva? · <span class="btn-a">A</span> sí · mover para cambiar',
  escalera: 'Premios',
};

export const SUSPENSO = ['Mmm...', 'A ver, a ver...', 'Qué nervios...', 'La respuesta es...'];
export const MAL = [
  { who: 'yo', text: 'Uy...{w} esa no era.' },
  { who: 'isa', text: '¡Noooo!' },
  { who: 'yo', text: 'Pero tranquila,{w} en este programa se puede volver a concursar.' },
];
export const PERDER = {
  title: 'Respuesta incorrecta',
  text: 'Esa no era la respuesta.\nVuelve a intentarlo: hay que responder bien las 5 preguntas.',
};

export const FINAL = [
  { who: 'yo', text: '¡Señoras y señores,{w} tenemos *ganadora*!' },
  { who: 'isa', text: '¡Gané!{w} ¿Y mi premio?' },
  { who: 'yo', text: 'El gran premio no es plata.{w} Es algo que escribí para ti.' },
];
export const SOBRE = { titulo: '¡Ganaste el gran premio!', abrir: '<span class="btn-a">A</span> abrir la carta', cerrar: '<span class="btn-a">A</span> guardar la carta' };
export const DESPUES = [
  { who: 'isa', text: '...' },
  { who: 'isa', text: 'Ya,{w} este premio es mejor que ser millonaria.' },
];

export const OBJETIVO = '<small>Capítulo 8</small>Responde bien las <b>5 preguntas</b>';
export const AYUDA = '<span><b>WASD</b> / flechas: elegir respuesta</span><span><b>E</b> / Espacio: botón A</span><span>También puedes usar el mouse</span><span><b>Esc</b>: pausa</span>';
export const GANAR = {
  title: '¡Capítulo 8 completado!',
  text: 'Cinco de cinco: tenemos ganadora.\nLa carta quedó guardada en el botón ✉ del menú principal.',
};

export const suspenso = () => pick(SUSPENSO);
