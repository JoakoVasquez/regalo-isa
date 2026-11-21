// Capítulo 1: guiones. Formato igual que src/dialogues.js:
//   { who, text }  ·  *texto* = resaltado  ·  {w} = pausita  ·  choices: [{ text, then: [...] }]
// 'grupo' es quien te responde en cada grupo. {n} se cambia por el número de ese grupo.

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const NUMERO_CORRECTO = 68;

// Isa preguntando (se elige una al azar cada vez)
export const PREGUNTAS = [
  'Hola...{w} ¿ustedes son el *grupo 68*?',
  'Disculpen...{w} ¿este es el *grupo 68*?',
  'Hola, eh...{w} ¿acá es el *68*?',
  'Perdón...{w} ¿ustedes son del *grupo 68*?',
];

// Respuestas de los grupos equivocados. Cada una es una función que recibe el número del grupo.
export const EQUIVOCADOS = [
  (n) => [
    { who: 'grupo', text: `No, somos el grupo *${n}*.` },
    { who: 'grupo', text: 'Pero si quieres te puedes quedar...{w} no, mentira.' },
  ],
  (n) => [
    { who: 'grupo', text: `¿El 68? No, aquí es el *${n}*.` },
    { who: 'grupo', text: 'Creo que el 68 se fue a almorzar.{w} O no existe.{w} No sé.' },
  ],
  (n) => [
    { who: 'grupo', text: '...' },
    { who: 'grupo', text: '......' },
    { who: 'grupo', text: `(Nadie te responde.{w} Todos te miran.{w} Es el grupo *${n}*.)` },
  ],
  (n) => [
    { who: 'grupo', text: 'Shhh, estamos presentandonos.' },
    {
      who: 'grupo', text: 'Di tu nombre y un animal que te represente.',
      choices: [
        { text: 'Isa... ¿un pingüino?', then: [
          { who: 'grupo', text: `Bienvenida al grupo *${n}*, Isa Pingüino.` },
          { who: 'grupo', text: '...Espera.{w} Tú no estás en la lista.' },
        ] },
        { text: 'Mejor me voy.', then: [
          { who: 'grupo', text: `Sí, mejor.{w} Esto es el grupo *${n}*.` },
        ] },
      ],
    },
  ],
  (n) => [
    { who: 'grupo', text: `No.{w} Grupo *${n}*.` },
    { who: 'grupo', text: 'Y ya tenemos a alguien que llega tarde, gracias.' },
  ],
  (n) => [
    { who: 'grupo', text: '¿68? No, esto es la fila para el casino.' },
    { who: 'grupo', text: `Bueno, también somos el grupo *${n}*.{w} Hacemos las dos cosas.` },
  ],
  (n) => [
    { who: 'grupo', text: '¡Sí! ¡Bienven...' },
    { who: 'grupo', text: `Ah, no, perdón.{w} Entendí "grupo *${n}*".{w} Somos el *${n}*.` },
  ],
  (n) => [
    { who: 'grupo', text: '¿Eres la tutora?' },
    { who: 'isa', text: 'No...' },
    { who: 'grupo', text: `Ah.{w} Entonces no.{w} Somos el *${n}*.` },
  ],
  (n) => [
    { who: 'grupo', text: `Grupo *${n}*, mucho gusto.` },
    { who: 'grupo', text: '¿Te ayudamos en algo más?{w} ¿No?{w} Ya.' },
  ],
  (n) => [
    { who: 'grupo', text: '¡Hola! ¿Vienes a vendernos algo?' },
    { who: 'grupo', text: `Porque somos el grupo *${n}* y no tenemos plata.` },
  ],
  (n) => [
    { who: 'grupo', text: 'Uy, no.{w} Nosotros somos de otra carrera.' },
    { who: 'grupo', text: `Grupo *${n}*.{w} Ni sabíamos que había tantos grupos.` },
  ],
  (n) => [
    { who: 'grupo', text: `¿68?{w} Mmm...{w} no, el *${n}*.` },
    { who: 'grupo', text: 'Casi le achuntas.{w} Bueno, no tanto.' },
  ],
];

// Lo que dice Isa después de equivocarse (según cuánta vergüenza lleva)
export const DISCULPAS = [
  ['Ah...{w} perdón.', 'Ok, ok...{w} perdón.', 'Jaja...{w} sí...{w} perdón.'],
  ['Ay, no...{w} perdón otra vez.', 'Perdón...{w} ya me voy.'],
  ['(Que mala suerte tengo.)'],
];

// Si vuelves a preguntarle a un grupo que ya te dijo que no
export const REPETIDO = (n) => [
  { who: 'grupo', text: `¿Otra vez?{w} Seguimos siendo el *${n}*.` },
];

// Grupo correcto
export const CORRECTO = [
  { who: 'grupo', text: '¿El 68?{w} ¡Sí! Somos nosotros.' },
  { who: 'isa', text: '¡Por fin!' },
];
export const SALUDO_ISA = [{ who: 'isa', text: '¡Holaaaa!' }];
export const SALUDO_YO = [
  { who: 'yo', text: '¡Hola! :)' },
  { who: 'isa', text: '*(Bueno...{w} por lo menos alguien me saludó.)*' },
];

// Textos de pantalla del capítulo
export const OBJETIVO = '<small>Capítulo 1</small>Encuentra al <b>grupo 68</b>';
export const AYUDA = '<span><b>WASD</b> / flechas: moverse</span><span><b>Q</b> / <b>R</b> o arrastrar: girar cámara</span><span><b>E</b> / Espacio: preguntar</span><span><b>Esc</b>: pausa</span>';
export const CARTEL_PREGUNTAR = 'Preguntar';
export const CARTEL_YA_PREGUNTADO = (n) => `Grupo ${n}`; // sobre un grupo al que ya le preguntaste
export const NOMBRE_GRUPO = 'Alguien del grupo';
export const GANAR = {
  title: '¡Capítulo completado!',
  text: 'Encontraste al grupo 68.',
};
export const PERDER = {
  title: 'Te moriste de vergüenza',
  text: 'Tres grupos equivocados fueron demasiado.\nIsa no aguanto tanta incomodidad.',
};

export function respuestaEquivocada(n) {
  return pick(EQUIVOCADOS)(n);
}
export function disculpa(nivel) {
  return pick(DISCULPAS[Math.min(nivel, DISCULPAS.length) - 1]);
}
export function pregunta() {
  return pick(PREGUNTAS);
}
