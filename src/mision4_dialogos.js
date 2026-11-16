// Capítulo 4: guiones y textos. Formato igual que src/dialogues.js:
//   { who, text }  ·  *texto* = resaltado  ·  {w} = pausita
// Aquí juegas como la Isa: todo lo que dice son pensamientos.

// Al empezar: la Isa está acostada mirando reels
export const INTRO = [
  { who: 'isa', text: '*(Ya es tardísimo...{w} un reel más y me duermo.)*' },
  { who: 'isa', text: '*(...)*' },
  { who: 'isa', text: '*(...Espera.)*{w} *(Este reel.)*' },
  { who: 'isa', text: '*(Se lo tengo que mandar al Joaco.)*{w} *(Como broma,{w} obvio.)*' },
  { who: 'isa', text: '*(Ya.{w} Tranquila.{w} Es solo un reel...)*{w} *(¿Por qué me tiembla la mano?)*' },
];

// Las 3 barras de tiempo. `tip` es lo que sale en la tarjeta de la derecha.
export const BARRAS = [
  { tip: 'Toca <b>compartir</b>' },
  { tip: 'Elige a <b>Joaco</b> y envía' },
  { tip: 'Escríbele <b>"bromita"</b>' },
];

// Lo que piensa la Isa cuando falla (uno por error, en orden). Cada barra tiene los suyos.
export const FALLOS = [
  ['*(¡No! ¡Le di like!)*', '*(¡Se me pasó el reel! Volver, volver...)*', '*(¡Ay, abrí los comentarios!)*'],
  ['*(¡¿A mi MAMÁ?!)* Desmarcar, desmarcar...', '*(¡Al grupo 68 no!)*', '*(¿Quién es "Tía Gladys"?)*'],
  ['*(¡¿"besito"?!)* ¡Borrar, borrar!', '*(¿"bromota"? ...no.)*', '*(¡Autocorrector traidor!)*'],
];
// Lo que queda escrito en el cuadro de mensaje en cada fallo de la tercera barra
export const TYPOS = ['besito', 'bromota', 'brpmits'];
// Contactos del menú de compartir (Joaco va abajo al medio, entre los demás)
export const CONTACTOS = [
  { name: 'Mamá', color: '#f0a14a' },
  { name: 'Grupo 68', color: '#5aa9e6' },
  { name: 'Tía Gladys', color: '#9b7ad8' },
  { name: 'Profe Cálculo', color: '#6cbf7a' },
  { name: 'Joaco', color: '#e2463a', joaco: true },
  { name: 'Papá', color: '#4f7fd1' },
];
export const MENSAJE = 'bromita';

// Cuando ya mandó todo
export const ENVIADO = [
  { who: 'isa', text: '*(Listo.{w} Enviado.)*' },
  { who: 'isa', text: '*(Es una broma.{w} Él sabe que es una broma.)*' },
];
export const ESCRIBIENDO = [
  { who: 'isa', text: '*(...¿Por qué está escribiendo tanto?)*' },
  { who: 'isa', text: '*(Ya,{w} me voy a dormir.{w} No voy a mirar.)*' },
  { who: 'isa', text: '*(...)*{w} *(Bueno,{w} solo un ratito más.)*' },
];

// Textos de pantalla del capítulo
export const OBJETIVO = '<small>Capítulo 4</small>Mándale el reel a <b>Joaco</b>';
export const AYUDA = '<span><b>E</b> / Espacio: tocar la pantalla</span><span><b>Esc</b>: pausa</span>';
export const ERRORES = 'Nervios';
export const GANAR = {
  title: '¡Capítulo 4 completado!',
  text: 'Reel enviado. Mensaje: "bromita".\nObvio que era broma... ¿no?',
};
export const PERDER = {
  title: '¡Paf!',
  text: 'Se te cayó el celular en la cara.\nEl Joaco nunca supo de este reel.',
};
