// Capítulo 6: guiones. Formato igual que src/dialogues.js:
//   { who, text }  ·  *texto* = resaltado  ·  {w} = pausita
// 'yo' = Joaco. Los dos cocinan un pie de limón en la cocina; cada etapa la hace uno (y la última, los dos).

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const TITULO_RECETA = 'Pie de limón';

// Las etapas, en orden. `who` = quién cocina ('yo', 'isa' o 'ambos').
export const ETAPAS = [
  { id: 'galletas', who: 'yo',    nombre: 'La base',     paso: 'Moler las galletas' },
  { id: 'limones',  who: 'isa',   nombre: 'Los limones', paso: 'Exprimir los limones' },
  { id: 'relleno',  who: 'yo',    nombre: 'El relleno',  paso: 'Revolver el relleno' },
  { id: 'merengue', who: 'isa',   nombre: 'El merengue', paso: 'Batir a punto nieve' },
  { id: 'horno',    who: 'ambos', nombre: 'El horno',    paso: 'Sacarlo dorado' },
];
export const TURNO = { yo: 'Turno de Joaco', isa: 'Turno de la Isa', ambos: '¡Los dos juntos!' };

export const INTRO = [
  { who: 'isa', text: 'Ya,{w} tenemos todo:{w} galletas, mantequilla, leche condensada, limones y huevos.' },
  { who: 'yo', text: '¿Y quién hace qué?' },
  { who: 'isa', text: 'Por turnos.{w} Tú partes con la base.' },
  { who: 'yo', text: '*(Un pie de limón entre los dos.{w})*' },
];

// ── 1 · La base (Joaco muele las galletas) ──
export const GALLETAS_ANTES = [
  { who: 'isa', text: 'Muele las galletas hasta que queden como arena.' },
];
export const GALLETAS_AYUDA = 'Aprieta <span class="btn-a">A</span> rápido para moler';
export const GALLETAS_FIN = [
  { who: 'yo', text: 'Listo.{w} Arena de galleta.' },
  { who: 'isa', text: 'Ahora la mantequilla derretida...{w} y al molde.' },
];
export const PERDER_GALLETAS = {
  title: 'Galletas enteras',
  text: 'Quedaron demasiado gruesas para la base.\nMuele más rápido (aprieta A sin parar).',
};

// ── 2 · Los limones (la Isa exprime) ──
export const LIMONES_ANTES = [
  { who: 'yo', text: '¿Cuántos limones?' },
  { who: 'isa', text: 'Hartos.{w} Y ojo con las pepas,{w} que no caigan al jugo.' },
];
export const LIMONES_AYUDA = 'Alterna <b>←</b> <b>→</b> para exprimir · <span class="btn-a">A</span> o clic para sacar las pepas';
export const PEPA = '¡Una pepa!';
export const PEPA_AVISO = '¡Una pepa! Aprieta <span class="btn-a">A</span> o haz clic';
export const PEPA_FUERA = ['¡Fuera!', '¡Atrapada!', 'Pepa fuera.'];
export const PEPA_DENTRO = ['Se coló una pepa...', 'Ups, pepa al jugo.'];
export const LIMONES_FIN = [
  { who: 'isa', text: 'Jugo de limón:{w} listo.{w} Y sin pepas.' },
  { who: 'yo', text: 'Bueno...{w} casi sin pepas.' },
];
export const PERDER_LIMONES_TIEMPO = {
  title: 'Faltó jugo',
  text: 'No alcanzó el jugo de limón.\nAlterna ← y → más rápido.',
};
export const PERDER_LIMONES_PEPAS = {
  title: 'Jugo con pepas',
  text: 'Se colaron demasiadas pepas.\nCuando aparezca una, aprieta A.',
};

// ── 3 · El relleno (Joaco revuelve, la Isa va echando) ──
export const RELLENO_ANTES = [
  { who: 'isa', text: 'Yo echo la leche condensada, las yemas y el jugo.{w} Tú revuelves.' },
  { who: 'isa', text: 'En círculos,{w} parejito.{w} Si te equivocas, te manchas.' },
];
export const RELLENO_AYUDA = 'Gira: <b>↑</b> <b>→</b> <b>↓</b> <b>←</b> (o WASD) siguiendo la flecha';
export const ECHA = ['*(echa la leche condensada)*', '*(echa las yemas)*', '*(echa el jugo de limón)*'];
export const SALPICA = ['¡Salpicó!', '¡Uy, la mesa!', '¡Cuidado!'];
export const RELLENO_FIN = [
  { who: 'isa', text: 'Mira cómo se espesa con el limón.{w} ¡Magia!' },
  { who: 'yo', text: 'Química,{w} en verdad.' },
  { who: 'isa', text: '...Magia.' },
];
export const PERDER_RELLENO_TIEMPO = {
  title: 'Relleno con grumos',
  text: 'No alcanzaste a revolverlo todo.\nSigue la flecha sin parar.',
};
export const PERDER_RELLENO_SALPICA = {
  title: 'Cocina manchada',
  text: 'Quedó más relleno en la mesa que en el bol.\nSigue el orden de las flechas.',
};

// ── 4 · El merengue (la Isa bate) ──
export const MERENGUE_ANTES = [
  { who: 'yo', text: 'Ahora las claras.{w} Yo te voy echando el azúcar.' },
  { who: 'isa', text: 'Ni muy lento ni muy rápido,{w} o salta por todos lados.' },
];
export const MERENGUE_AYUDA = 'Aprieta <span class="btn-a">A</span> a ritmo parejo: mantén la aguja en la <b>zona verde</b>';
export const VELOCIDAD = 'Velocidad';
export const PUNTO_NIEVE = 'Punto nieve';
export const MUY_LENTO = '*(Muy lento...)*';
export const MUY_RAPIDO = ['¡Saltó merengue!', '¡Me llegó a la cara!', '¡Más despacio!'];
export const MERENGUE_FIN = [
  { who: 'isa', text: '¡Mira!{w} Si lo doy vuelta arriba tuyo no se cae.' },
  { who: 'yo', text: '¡No lo des vuelta!' },
];
export const PERDER_MERENGUE_TIEMPO = {
  title: 'Merengue aguado',
  text: 'Las claras no llegaron a punto nieve.\nMantén la aguja en la zona verde.',
};
export const PERDER_MERENGUE_SALPICA = {
  title: 'Merengue en el techo',
  text: 'Batiste tan rápido que voló por toda la cocina.\nUn poquito más despacio.',
};

// ── 5 · El horno (los dos) ──
export const HORNO_ANTES = [
  { who: 'yo', text: 'Al horno.{w} Solo hay que dorar el merengue.' },
  { who: 'isa', text: 'Lo miramos juntos.{w} Si se quema, es culpa tuya.' },
  { who: 'yo', text: '¿Por qué mía?' },
  { who: 'isa', text: 'Porque yo digo.' },
];
export const HORNO_AYUDA = 'Aprieta <span class="btn-a">A</span> cuando el merengue esté <b>dorado</b>';
export const DORADO = 'Dorado';
export const TODAVIA = ['¡Todavía no!', 'Está blanquito aún...', 'Espera un poquito.'];
export const HORNO_FIN = [
  { who: 'isa', text: '¡Quedó perfecto!' },
  { who: 'yo', text: 'Lo hicimos los dos.' },
];
export const PERDER_HORNO_QUEMADO = {
  title: 'Pie carbonizado',
  text: 'El merengue pasó de dorado a negro.\nSácalo cuando esté doradito.',
};
export const PERDER_HORNO_APURADO = {
  title: 'Demasiado apurados',
  text: 'Abrieron el horno tantas veces que se enfrió.\nEspera a que esté dorado.',
};

// ── Final: se lo comen ──
export const FINAL = [
  { who: 'yo', text: 'Ya,{w} el primer pedazo es tuyo.' },
  { who: 'isa', text: 'Mmm...' },
  { who: 'isa', text: '¡Está buenísimo!{w} Somos tan buenos.' },

];

export const STRIKE = 'Fallos';
export const TIEMPO = 'Tiempo';
export const OBJETIVO = '<small>Capítulo 6</small>Cocinen juntos un <b>pie de limón</b>';
export const AYUDA = '<span><b>E</b> / Espacio: botón A</span><span><b>WASD</b> / flechas: direcciones</span><span><b>Esc</b>: pausa</span>';
export const GANAR = {
  title: '¡Capítulo 6 completado!',
  text: 'Base, limones, relleno, merengue y horno:\nun pie de limón hecho entre los dos. 🍋',
};

export const pepaFuera = () => pick(PEPA_FUERA);
export const pepaDentro = () => pick(PEPA_DENTRO);
export const salpica = () => pick(SALPICA);
export const muyRapido = () => pick(MUY_RAPIDO);
export const todavia = () => pick(TODAVIA);
