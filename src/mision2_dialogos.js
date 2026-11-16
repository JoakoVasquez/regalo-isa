// Capítulo 2: guiones. Formato igual que src/dialogues.js:
//   { who, text }  ·  *texto* = resaltado  ·  {w} = pausita
// 'yo' = Joaco (el jugador). 'vecino' = quien quedó al lado (si no es la Isa).

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Joaco saluda apenas se sienta
export const SALUDOS = [
  'Hola :)',
  'Hola...{w} ¿qué tal?',
  'Buenas...',
  'Hola, ¿cómo estái?',
];

// Respuestas chistosas y pesadas de quien NO es la Isa
export const PESADOS = [
  [
    { who: 'vecino', text: '...¿Te conozco?' },
    { who: 'vecino', text: 'No.{w} Y no me hables durante la clase.' },
  ],
  [
    { who: 'vecino', text: 'Ese asiento estaba reservado.' },
    { who: 'vecino', text: 'Para mi mochila.{w} Que ahora está en el suelo.{w} Por tu culpa.' },
  ],
  [
    { who: 'vecino', text: 'Hola.{w} Chao.' },
  ],
  [
    { who: 'vecino', text: '¿Me estás hablando a mí?' },
    { who: 'vecino', text: 'Tengo audífonos.{w} Bueno, no tengo,{w} pero hazte la idea.' },
  ],
  [
    { who: 'vecino', text: 'Uf.{w} Justo cuando pensé que me iba a tocar el puesto vacío al lado.' },
  ],
  [
    { who: 'vecino', text: 'Holi.{w} ¿Me prestas tu cuaderno?' },
    { who: 'vecino', text: 'Y tu lápiz.{w} Y tus apuntes de todo el semestre.{w} Y tu calculadora.' },
  ],
  [
    { who: 'vecino', text: '*Te mira de arriba a abajo.*' },
    { who: 'vecino', text: '...No.' },
  ],
  [
    { who: 'vecino', text: 'Ah, hola.{w} Te aviso altiro que ronco en clases.' },
    { who: 'vecino', text: 'Y hablo dormido.{w} De ti, probablemente.{w} Mal.' },
  ],
  [
    { who: 'vecino', text: '¿Te sentaste aquí a propósito?' },
    { who: 'vecino', text: 'Hay como quince puestos más.{w} Pero bueno, tu decisión.' },
  ],
  [
    { who: 'vecino', text: 'Hola.{w} Ojo que yo no hago trabajos en grupo.' },
    { who: 'vecino', text: 'Ni individuales, la verdad.' },
  ],
  [
    { who: 'vecino', text: '¿Tú no eres el que se equivocó de sala la semana pasada?' },
    { who: 'vecino', text: 'Sí, eras tú.{w} Todos nos acordamos.' },
  ],
  [
    { who: 'vecino', text: 'Shhh.{w} Estoy viendo un video.' },
    { who: 'vecino', text: '*Sube el volumen.*' },
  ],
];

export const REACCION = [
  '*(...Me equivoqué de puesto.)*',
  '*(Esto va a ser un semestre muy largo.)*',
  '*(¿Dónde está la Isa...?)*',
];

// Al lado de la Isa (ya se conocen del Capítulo 1). La primera línea la dice saludando con la mano.
export const ISA = [
  { who: 'isa', text: '¡Hola, Joaco! :)' },
  { who: 'isa', text: 'Te estaba guardando el puesto.' },
  { who: 'yo', text: '¿En serio?{w} Gracias :)' },
  { who: 'isa', text: 'Si quieres después te paso los apuntes.' },
  { who: 'yo', text: '*(...Me cae muy bien.)*' },
];

// Textos de pantalla del capítulo
export const OBJETIVO = '<small>Capítulo 2</small>Siéntate al lado de la <b>Isa</b>';
export const AYUDA = '<span><b>WASD</b> / flechas: moverse</span><span><b>Q</b> / <b>R</b> o arrastrar: girar cámara</span><span><b>E</b> / Espacio: sentarse</span><span><b>Esc</b>: pausa</span>';
export const CARTEL_SENTARSE = 'Sentarse';
export const NOMBRE_VECINO = '???';
export const GANAR = {
  title: '¡Capítulo 2 completado!',
  text: 'Te sentaste al lado de la Isa.\nY esta vez sí te saludaron de vuelta.',
};
export const PERDER = {
  title: 'Puesto equivocado',
  text: 'Te sentaste al lado de alguien que no era la Isa.\nAhora te toca aguantarlo todo el semestre.',
};

export const saludo = () => pick(SALUDOS);
export const pesado = () => pick(PESADOS);
export const reaccion = () => pick(REACCION);
