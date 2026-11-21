// Capítulo 7: guiones. Formato igual que src/dialogues.js:
//   { who, text }  ·  *texto* = resaltado  ·  {w} = pausita
// 'yo' = Joaco. Picnic en el parque: se pintan el uno al otro. Se juega como Joaco, que tiene que
// mirar bien a la Isa y después armar su cara de memoria en el lienzo.

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const INTRO = [
  { who: 'isa', text: 'Ya,{w} las reglas:{w} yo te pinto a ti y tú me pintas a mí.' },
  { who: 'yo', text: '¿Y si me queda mal?' },
  { who: 'isa', text: 'Imposible.{w} Solo tienes que mirarme bien.' },
  { who: 'yo', text: '*(Facilito.)*' },
];

// ── 1 · Mirarla ──
export const MIRAR_ANTES = [
  { who: 'isa', text: 'Mírame bien ahora,{w} que después no vale copiar.' },
];
export const MIRAR_TITULO = 'Mírala bien';
export const MIRAR_TEXTO = 'Memoriza dónde van sus <b>cejas</b>, <b>ojos</b>, <b>nariz</b> y <b>boca</b>';
export const MIRAR_LISTO = '<span class="btn-a">A</span> ¡ya me la aprendí!';
export const POSANDO = ['¿Así está bien?', 'No me hagas reír...', '¿Ya?', 'Me pica la nariz.', 'Salgo linda, ¿ya?'];

// ── 2 · Pintarla de memoria ──
export const PINTAR_CARTEL = '¡A pintar de memoria!';
export const LIENZO_TITULO = 'Retrato de la Isa';
export const LIENZO_AYUDA = '<b>←</b> <b>→</b> mover<br><b>↓</b> bajar rápido<br><span class="btn-a">A</span> pintarlo ahí';
// nombres de las piezas: [a la izquierda del lienzo, a la derecha] o una sola
export const PIEZAS = {
  ceja: ['Ceja izquierda', 'Ceja derecha', 'Cejas'],
  ojo: ['Ojo izquierdo', 'Ojo derecho', 'Ojos'],
  nariz: 'Nariz',
  boca: 'Boca',
  rasgo: 'Rasgo',
};
export const PENSANDO = ['Ahí...{w} creo.', 'Seguro iba por ahí.', 'Mmm,{w} sí.', 'Confío.', 'Igualita.', 'Eso.'];
export const SE_CAYO = ['¡Se me cayó!', 'Ups...{w} muy abajo.', '¡Nooo!'];
export const LISTO = '¡Listo!';

// ── 3 · Mostrarse los cuadros ──
export const MOSTRAR_ANTES = [
  { who: 'isa', text: '¿Terminaste?{w} A la cuenta de tres los mostramos.' },
  { who: 'yo', text: 'Uno...{w} dos...' },
  { who: 'isa', text: '¡Tres!' },
];
export const TARJETA = { real: 'La Isa', mio: 'Tu retrato', parecido: 'Parecido', seguir: '<span class="btn-a">A</span> continuar' };

// según qué tan parecido quedó
export const REACCION_GENIAL = [
  { who: 'isa', text: '¡¿Qué?!{w} ¡Soy igualita!' },
  { who: 'yo', text: 'Es que te miro harto.' },
  { who: 'isa', text: '...Ya,{w} no me hagas sonrojar.' },
];
export const REACCION_BIEN = [
  { who: 'isa', text: '¡Oye,{w} sí me parezco!' },
  { who: 'isa', text: 'Aunque algo quedó medio chueco.' },
  { who: 'yo', text: 'Es mi estilo.' },
];
export const REACCION_RARO = [
  { who: 'isa', text: 'Mmm...{w} es...{w} abstracto.' },
  { who: 'yo', text: 'Picasso también partió así.' },
  { who: 'isa', text: 'Me gusta igual.{w} Lo voy a colgar.' },
];
export const REACCION_MAL = [
  { who: 'isa', text: '...{w}¿Esa soy yo?' },
  { who: 'yo', text: 'Es que te moviste.' },
  { who: 'isa', text: 'No me moví nada.{w} Otra vez,{w} y ahora mírame bien.' },
];
export const PERDER = {
  title: 'Retrato irreconocible',
  text: 'La Isa no se reconoció en el cuadro.\nNecesitas más de 80% de parecido: mírala bien y pinta cada rasgo donde va.',
};

// el cuadro de la Isa
export const SUYO_ANTES = [
  { who: 'yo', text: '¿Y el tuyo?' },
  { who: 'isa', text: 'Mira.' },
];
export const SUYO_TITULO = 'Joaco, por la Isa';
export const FIRMA_ISA = 'Isa ♥';
export const FIRMA_JOACO = 'Joaco';
export const FINAL = [
  { who: 'yo', text: '...Quedé mejor que en la vida real.' },
  { who: 'isa', text: 'Te pinté como te veo yo.' },
];

export const OBJETIVO = '<small>Capítulo 7</small>Pinta a la <b>Isa</b> de memoria';
export const AYUDA = '<span><b>←</b> <b>→</b>: mover el rasgo</span><span><b>↓</b>: bajar rápido</span><span><b>E</b> / Espacio: botón A</span><span><b>Esc</b>: pausa</span>';
export const ganar = (pct) => ({
  title: '¡Capítulo 7 completado!',
  text: `Un picnic, dos pinceles y un retrato hecho de memoria.\nParecido con la Isa: ${pct}% 🎨`,
});

export const posando = () => pick(POSANDO);
export const pensando = () => pick(PENSANDO);
export const seCayo = () => pick(SE_CAYO);
