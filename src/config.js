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
    { id: 'sandbox', slot: 11, title: 'Zona de Pruebas', subtitle: 'Miis, animaciones y diálogos' },
  ],

  // Botón de la carta en el menú
  letter: {
    title: 'Para Isa',
    body: 'Aquí va a ir un mensaje.\n(Se edita en src/config.js)',
  },

  // Sonidos: por defecto se sintetizan. Si quieres usar archivos propios, ponlos en assets/sfx/
  // y apúntalos aquí, p. ej. { hover: 'assets/sfx/hover.wav', select: 'assets/sfx/select.wav' }.
  // Nombres: hover, select, back, open, start, locked, advance, dlgOpen, step, sit, pause
  sfxFiles: {},

  // Música: igual, { menu: 'assets/music/menu.mp3', sandbox: '...' } reemplaza la generada.
  musicFiles: {},
};
