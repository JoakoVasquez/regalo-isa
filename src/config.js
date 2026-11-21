// Ajustes generales del juego. Casi todo lo que quieras cambiar rápido está aquí.

export const CONFIG = {
  // Resolución interna (alto en píxeles). 480 = look de consola retro. Súbelo para más nitidez.
  internalHeight: 480,

  // Personaje que controla el jugador
  player: 'isa',

  // Los 4 Miis. `voice` es el tono de los "blips" al hablar, `color` el de la etiqueta del nombre.
  characters: {
    isa:     { name: 'Isa',      file: 'assets/miis/isa.glb',     voice: 1.30, color: '#ef6aa7' },
    yo:      { name: 'Joaco',    file: 'assets/miis/yo.glb',      voice: 0.80, color: '#e2463a' },
    random1: { name: 'Random 1', file: 'assets/miis/random1.glb', voice: 1.00, color: '#e3a70e' },
    random2: { name: 'Random 2', file: 'assets/miis/random2.glb', voice: 1.50, color: '#f08a24' },
  },

  // Misiones del menú (12 casillas, cada capítulo es una). `slot` = casilla (0-11); sin slot, en orden.
  channels: [
    { id: 'm1', title: 'Capítulo 1', subtitle: 'El grupo 68' },
    { id: 'm2', title: 'Capítulo 2', subtitle: 'El puesto de al lado' },
    { id: 'm3', title: 'Capítulo 3', subtitle: 'La pista de baile' },
    { id: 'm4', title: 'Capítulo 4', subtitle: 'Bromita' },
    { id: 'm5', title: 'Capítulo 5', subtitle: 'Los puentes' },
    { id: 'm6', title: 'Capítulo 6', subtitle: 'El pie de limón' },
    { id: 'm7', title: 'Capítulo 7', subtitle: 'El retrato' },
    // needsEggs: además del capítulo anterior, pide todos los corazones escondidos.
    // givesLetter: al completarlo se abre la carta del menú.
    { id: 'm8', title: 'Capítulo 8', subtitle: '¿Quién quiere ser millonaria?', needsEggs: true, givesLetter: true },
    // extra: minijuego de la última fila; se abre al completar toda la historia.
    // record: nombre del récord que se muestra al abrir la casilla.
    { id: 'duelo', slot: 8, title: 'Duelo en la cocina', subtitle: 'Isa contra Joaco, a 3 puntos', extra: true, record: 'Mejor racha' },
    { id: 'trencito', slot: 9, title: 'El trencito', subtitle: 'Suma gente a la fila sin chocar', extra: true, record: 'Trencito más largo' },
    { id: 'limones', slot: 10, title: 'Lluvia de limones', subtitle: 'Atrapa limones, esquiva piñas', extra: true, record: 'Mejor puntaje' },
  ],

  // Corazones escondidos (easter eggs), uno por capítulo. pos = [x, y, z] en las coordenadas de ese
  // escenario; size = tamaño; player = Mii que también lo recoge si pasa caminando por encima.
  // Siempre se pueden recoger con un clic.
  eggs: {
    m1: { pos: [-15.5, 1.1, -21.3], size: 0.6, player: 'isa' },  // junto a la escultura del pasto, lejos del camino
    m2: { pos: [8.9, 3.75, 26.3], size: 0.5, player: 'yo' },     // al fondo de la sala, arriba a la derecha
    m3: { pos: [-16.6, 1.1, 30.5], size: 0.6, player: 'yo' },    // rincón del fondo, del lado de la barra
    m4: { pos: [1.25, 1.95, -3.2], size: 0.3 },                  // en la pared de la pieza, a la derecha del celular
    m5: { pos: [9.7, 5.1, -1.2], size: 0.55, player: 'yo' },     // punta del puente de la derecha
    m6: { pos: [-2.0, 2.05, -3.05], size: 0.16 },                // colgando en la ventana de la cocina
    m7: { pos: [5.2, 0.95, -7.6], size: 0.4 },                   // en la banca junto a la laguna
  },

  // La carta: se abre al ganar el capítulo 8 y queda en el botón del menú
  letter: {
    title: 'Para Isa',
    body: 'Gracias por completar todo el regalito. Te queria aprovechar de decir que te amo demasiado y pienso en ti cada minuto de mi dia. Eres una increible mujer y me encanta hacer cosas asi por ti. Gracias por siempre apoyarme y por quedarte, ya es medio año juntos y espero que sean muchos mas. Eres lo mejor que me paso ❤️',
  },

  // Sonidos: por defecto se sintetizan. Si quieres usar archivos propios, ponlos en assets/sfx/
  // y apúntalos aquí, p. ej. { hover: 'assets/sfx/hover.wav', select: 'assets/sfx/select.wav' }.
  // Nombres: hover, select, back, open, start, locked, advance, dlgOpen, step, sit, pause
  sfxFiles: {},

  // Música: igual, { menu: 'assets/music/menu.mp3', sandbox: '...' } reemplaza la generada.
  musicFiles: {},
};
