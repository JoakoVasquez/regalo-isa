// Capítulo 3: guiones. Formato igual que src/dialogues.js:
//   { who, text }  ·  *texto* = resaltado  ·  {w} = pausita
// 'yo' = Joaco (el jugador). 'disco' = el señor que se sienta al lado. 'ambos' = Joaco e Isa a la vez.

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Nombre y voz del señor de la disco (assets/miis/hombre_disco.glb)
export const SENOR = { name: 'Señor de la disco', color: '#8a5cd6', voice: 0.65 };
export const AMBOS = { name: 'Joaco e Isa', color: '#e2568a', voice: 1.05 };

// Al empezar: están bailando en medio de la pista y a Joaco le baja el mareo
export const INTRO = [
  { who: 'isa', text: '¡Esta canción me encanta!' },
  { who: 'yo', text: '*(Uf...{w} todo da vueltas...)*' },
  { who: 'isa', text: '¿Joaco?{w} Estás medio verde...{w} ¿te sientes bien?' },
  { who: 'yo', text: 'Creo que...{w} necesito sentarme un rato.' },
  { who: 'isa', text: '¡Vamos a los sillones del fondo!{w} Yo voy detrás de ti.' },
];

// Lo que dice Joaco (pensando) al chocar con alguien en la pista
export const CHOQUES = [
  '*(¡Perdón!)*', '*(Uy...)*', '*(Permiso, permiso...)*', '*(Ay, mi guata...)*', '*(¡No me empujen!)*',
];

// Cuando el mareo llega al máximo
export const DESMAYO = [
  { who: 'yo', text: '*(Ya no...{w} puedo más...)*' },
  { who: 'isa', text: '¡¿Joaco?!' },
];

// Escena final en el sillón
export const SILLON = [
  { who: 'isa', text: 'Ya,{w} aquí estamos.{w} ¿Mejor?' },
  { who: 'yo', text: 'Un poquito...{w} gracias por acompañarme.' },
];
export const SENOR_LLEGA = [
  { who: 'disco', text: '¿Les molesta si me siento?{w} Estos pies ya no bailan como antes.' },
  { who: 'yo', text: 'Eh...{w} no, tranquilo.' },
  { who: 'disco', text: 'Oigan, una pregunta...' },
  { who: 'disco', text: '¿Ustedes son *pareja*?' },
];
export const RESPUESTA = [{ who: 'ambos', text: '¡No!' }];
export const SENOR_FINAL = [
  { who: 'disco', text: 'Ah, ¿no?{w} ...Qué raro.' },
  { who: 'disco', text: 'Porque hacen *bonita pareja*.' },
];
export const FINAL = [
  { who: 'isa', text: '...' },
  { who: 'yo', text: '*(...Ya no sé si estoy mareado por la pista o por otra cosa.)*' },
];

// Textos de pantalla del capítulo
export const OBJETIVO = '<small>Capítulo 3</small>Sal de la pista y llega al <b>sillón</b>';
export const AYUDA = '<span><b>WASD</b> / flechas: moverse</span><span><b>Q</b> / <b>R</b> o arrastrar: girar cámara</span><span><b>E</b> / Espacio: sentarse</span><span><b>Esc</b>: pausa</span>';
export const CARTEL_SENTARSE = 'Sentarse';
export const MAREO = 'Mareo';
export const GANAR = {
  title: '¡Capítulo 3 completado!',
  text: 'Saliste de la pista sin desmayarte.\nY un desconocido dijo lo que nadie se atrevía a decir.',
};
export const PERDER = {
  title: 'Demasiado mareo',
  text: 'Joaco no alcanzó a llegar al sillón.\nLa pista de baile ganó esta vez.',
};

export const choque = () => pick(CHOQUES);
