// Guiones de la zona de pruebas. Formato explicado en src/dialogue.js

export const DIALOGUES = {
  yo: [
    { who: 'yo', text: '¡Hola, Isa! Bienvenida a la *zona de pruebas*.' },
    { who: 'yo', text: 'Aquí revisamos que todo funcione antes de las misiones de verdad.' },
    {
      who: 'yo', text: '¿Qué te parece hasta ahora?',
      choices: [
        { text: '¡Está muy lindo!', then: [
          { who: 'yo', text: 'Je, je...{w} sabía que te iba a gustar.' },
        ] },
        { text: 'Falta harto todavía...', then: [
          { who: 'yo', text: '¡Oye! Recién va el menú.{w} Paciencia.{w} *Mucha* paciencia.' },
        ] },
      ],
    },
    { who: 'yo', text: 'Prueba a sentarte en el taburete libre, o habla con los demás.' },
  ],

  random1: [
    { who: 'random1', text: 'Yo solo estoy probando la animación de *sentado*.' },
    { who: 'random1', text: 'Llevo aquí desde que cargó el juego.{w} No me quejo.' },
    { who: 'isa', text: 'Se ve cómodo.' },
    { who: 'random1', text: 'Lo es.{w} El de al lado está libre, por si acaso.' },
  ],

  random2: [
    { who: 'random2', text: '¡Uf! A mí me tocó probar la animación de *caminar*.' },
    { who: 'random2', text: 'Voy y vuelvo, voy y vuelvo...' },
    {
      who: 'random2', text: '¿Necesitabas algo?',
      choices: [
        { text: '¿No te cansas?', then: [
          { who: 'random2', text: 'Soy un Mii.{w} No tengo rodillas de verdad.' },
        ] },
        { text: 'Nada, ¡sigue así!', then: [
          { who: 'random2', text: '¡Gracias! Eso haré.' },
        ] },
      ],
    },
  ],
};
