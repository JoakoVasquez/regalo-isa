// Audio: efectos y música sintetizados con WebAudio (sin archivos).
// Si CONFIG.sfxFiles / CONFIG.musicFiles apuntan a archivos, se usan esos en su lugar.
import { CONFIG } from './config.js';

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Canciones generadas. Cada compás tiene un acorde y 8 corcheas de melodía (0 = silencio).
const SONGS = {
  menu: {
    bpm: 76, style: 'calm',
    chords: [
      [53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [55, 59, 62, 65],
      [53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [55, 57, 62, 64],
    ],
    melody: [
      [76, 0, 72, 0, 69, 0, 72, 0], [74, 0, 71, 0, 67, 0, 0, 71],
      [72, 0, 69, 0, 65, 0, 69, 0], [71, 0, 67, 0, 74, 0, 0, 0],
      [76, 0, 72, 0, 81, 0, 79, 0], [74, 0, 0, 71, 67, 0, 71, 0],
      [72, 0, 77, 0, 76, 0, 72, 0], [74, 0, 71, 0, 69, 0, 0, 0],
    ],
  },
  sandbox: {
    bpm: 104, style: 'bounce',
    chords: [[60, 64, 67, 69], [57, 60, 64, 67], [62, 65, 69, 72], [55, 59, 62, 65]],
    melody: [
      [79, 0, 76, 79, 0, 76, 72, 0], [76, 0, 72, 76, 0, 72, 69, 0],
      [77, 0, 74, 77, 0, 81, 77, 0], [74, 0, 71, 74, 79, 0, 0, 0],
    ],
  },
  sala: {
    bpm: 88, style: 'calm',
    chords: [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [60, 64, 67, 71]],
    melody: [
      [76, 0, 72, 0, 74, 0, 76, 0], [77, 0, 76, 0, 72, 0, 69, 0],
      [74, 0, 71, 0, 72, 0, 74, 0], [76, 0, 0, 0, 79, 0, 0, 0],
    ],
  },
  disco: {
    bpm: 120, style: 'disco',
    chords: [[57, 60, 64, 67], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65],
             [57, 60, 64, 67], [57, 60, 64, 67], [50, 53, 57, 60], [52, 56, 59, 62]],
    melody: [
      [76, 0, 76, 0, 79, 76, 0, 74], [72, 0, 74, 0, 76, 0, 0, 0],
      [77, 0, 77, 0, 76, 0, 74, 72], [74, 0, 0, 71, 74, 0, 79, 0],
      [76, 0, 76, 0, 79, 76, 0, 74], [72, 0, 74, 0, 76, 0, 81, 0],
      [77, 0, 76, 0, 74, 0, 72, 0], [71, 0, 74, 0, 76, 0, 0, 0],
    ],
  },
  // Capítulo 5: mañana soleada en los puentes
  puentes: {
    bpm: 100, style: 'bounce',
    chords: [[62, 66, 69, 73], [59, 62, 66, 69], [55, 59, 62, 66], [57, 61, 64, 67]],
    melody: [
      [78, 0, 76, 74, 0, 76, 78, 0], [81, 0, 78, 0, 74, 0, 0, 76],
      [79, 0, 78, 76, 0, 74, 71, 0], [73, 0, 76, 0, 81, 0, 0, 0],
    ],
  },
  // Capítulo 5: después del sí
  amor: {
    bpm: 72, style: 'calm',
    chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 67],
             [60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 62, 65], [55, 59, 62, 65]],
    melody: [
      [79, 0, 76, 0, 72, 0, 76, 0], [79, 0, 0, 81, 79, 0, 76, 0],
      [77, 0, 76, 0, 72, 0, 69, 0], [71, 0, 74, 0, 79, 0, 0, 0],
      [79, 0, 76, 0, 72, 0, 76, 0], [84, 0, 0, 83, 81, 0, 79, 0],
      [77, 0, 81, 0, 79, 0, 77, 0], [76, 0, 74, 0, 72, 0, 0, 0],
    ],
  },
  // Capítulo 6: cocinando el pie de limón, tarde tranquila y alegre
  cocina: {
    bpm: 108, style: 'bounce',
    chords: [[65, 69, 72, 76], [62, 65, 69, 72], [70, 74, 77, 81], [72, 76, 79, 82],
             [65, 69, 72, 76], [62, 65, 69, 72], [70, 74, 77, 79], [72, 76, 79, 82]],
    melody: [
      [81, 0, 77, 79, 81, 0, 84, 0], [81, 0, 77, 0, 74, 0, 0, 77],
      [79, 0, 77, 74, 0, 77, 82, 0], [79, 0, 76, 0, 72, 0, 0, 0],
      [81, 0, 77, 79, 81, 0, 84, 0], [86, 0, 84, 0, 81, 0, 0, 77],
      [79, 0, 82, 0, 81, 0, 79, 77], [76, 0, 79, 0, 77, 0, 0, 0],
    ],
  },
  // Capítulo 7: picnic en el parque, pintando al sol
  parque: {
    bpm: 92, style: 'bounce',
    chords: [[67, 71, 74, 78], [64, 67, 71, 74], [60, 64, 67, 71], [62, 66, 69, 72],
             [67, 71, 74, 78], [64, 67, 71, 74], [60, 64, 69, 72], [62, 66, 69, 74]],
    melody: [
      [83, 0, 79, 0, 81, 83, 0, 86], [83, 0, 79, 0, 76, 0, 0, 0],
      [84, 0, 83, 79, 0, 76, 79, 0], [81, 0, 78, 0, 74, 0, 0, 78],
      [83, 0, 79, 0, 81, 83, 0, 86], [88, 0, 86, 0, 83, 0, 0, 79],
      [84, 0, 81, 0, 79, 0, 76, 0], [78, 0, 81, 0, 79, 0, 0, 0],
    ],
  },
  // Capítulo 8: el concurso, con algo de suspenso
  concurso: {
    bpm: 84, style: 'calm',
    chords: [[57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67], [52, 56, 59, 64],
             [57, 60, 64, 69], [53, 57, 60, 65], [50, 53, 57, 62], [52, 56, 59, 62]],
    melody: [
      [69, 0, 72, 0, 76, 0, 72, 0], [69, 0, 72, 0, 77, 0, 0, 76],
      [67, 0, 71, 0, 74, 0, 71, 0], [68, 0, 71, 0, 76, 0, 0, 0],
      [69, 0, 72, 0, 76, 0, 81, 0], [77, 0, 76, 0, 72, 0, 0, 69],
      [65, 0, 69, 0, 74, 0, 72, 0], [71, 0, 68, 0, 64, 0, 0, 0],
    ],
  },
  plaza: {
    bpm: 112, style: 'bounce',
    chords: [[60, 64, 67, 71], [57, 60, 64, 67], [65, 69, 72, 76], [67, 71, 74, 77],
             [60, 64, 67, 71], [57, 60, 64, 67], [62, 65, 69, 72], [67, 71, 74, 77]],
    melody: [
      [76, 0, 79, 0, 76, 74, 72, 0], [72, 0, 76, 0, 0, 74, 72, 69],
      [69, 0, 72, 0, 76, 0, 77, 76], [74, 0, 0, 71, 74, 0, 79, 0],
      [76, 0, 79, 0, 76, 74, 72, 0], [72, 0, 76, 0, 0, 74, 72, 69],
      [74, 0, 77, 0, 76, 0, 74, 72], [71, 0, 74, 0, 72, 0, 0, 0],
    ],
  },
};

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.buffers = {};
    this.song = null;
    this.wantSong = null;
  }

  // Los navegadores exigen un gesto del usuario antes de sonar: se llama en el primer clic/tecla.
  unlock() {
    if (!this.ctx) {
      const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.gain.value = 0.42; this.music.connect(this.master);
      // eco suave para dar ese aire "de menú"
      this.echoIn = c.createGain();
      const delay = c.createDelay(1); delay.delayTime.value = 0.21;
      const fb = c.createGain(); fb.gain.value = 0.3;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      this.echoIn.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay);
      lp.connect(this.master);
      // ruido blanco reutilizable
      const nb = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = nb.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = nb;
      this._loadFiles();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.wantSong && !this.song) this.startMusic(this.wantSong);
  }

  async _loadFiles() {
    const all = { ...CONFIG.sfxFiles };
    for (const [k, v] of Object.entries(CONFIG.musicFiles || {})) all['music:' + k] = v;
    for (const [name, url] of Object.entries(all)) {
      try {
        const buf = await (await fetch(url)).arrayBuffer();
        this.buffers[name] = await this.ctx.decodeAudioData(buf);
        if (name === 'music:' + this.wantSong) this.startMusic(this.wantSong);
      } catch (e) { console.warn('No se pudo cargar el sonido', url, e); }
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.03);
  }

  // ── primitivas ──
  _tone({ f, f2, type = 'sine', t = 0, at, dur = 0.15, vol = 0.2, a = 0.005, echo = 0, out }) {
    const c = this.ctx, t0 = at ?? (c.currentTime + t);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(out || this.sfx);
    if (echo) { const s = c.createGain(); s.gain.value = echo; g.connect(s); s.connect(this.echoIn); }
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  _noise({ t = 0, at, dur = 0.1, vol = 0.2, freq = 1000, f2, q = 1, type = 'bandpass', out }) {
    const c = this.ctx, t0 = at ?? (c.currentTime + t);
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(freq, t0);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl); fl.connect(g); g.connect(out || this.sfx);
    s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }

  _bell(n, t, vol = 0.16, dur = 0.5, echo = 0.5) {
    this._tone({ f: midi(n), t, dur, vol, echo });
    this._tone({ f: midi(n) * 2, t, dur: dur * 0.5, vol: vol * 0.3, type: 'triangle' });
  }

  // ── efectos ──
  play(name) {
    if (!this.ctx) return;
    const buf = this.buffers[name];
    if (buf) {
      const s = this.ctx.createBufferSource(); s.buffer = buf; s.connect(this.sfx); s.start();
      return;
    }
    switch (name) {
      case 'hover':
        this._tone({ f: 1320, f2: 1100, dur: 0.06, vol: 0.10 });
        this._tone({ f: 2640, dur: 0.03, vol: 0.03, type: 'triangle' });
        break;
      case 'select':
        this._bell(88, 0, 0.16, 0.25); this._bell(93, 0.07, 0.16, 0.45);
        break;
      case 'back':
        this._bell(84, 0, 0.14, 0.2); this._bell(77, 0.08, 0.14, 0.35);
        break;
      case 'open':
        this._noise({ dur: 0.45, vol: 0.10, freq: 500, f2: 5000, q: 0.8 });
        [76, 81, 84, 88].forEach((n, i) => this._bell(n, 0.05 + i * 0.07, 0.11, 0.5));
        break;
      case 'start':
        [72, 76, 79, 84, 88, 91].forEach((n, i) => this._bell(n, i * 0.085, 0.14, 0.9, 0.7));
        this._noise({ t: 0.1, dur: 0.9, vol: 0.05, freq: 3000, f2: 9000, q: 0.5 });
        break;
      case 'locked':
        this._tone({ f: 196, dur: 0.1, vol: 0.2, type: 'triangle' });
        this._tone({ f: 185, t: 0.12, dur: 0.16, vol: 0.2, type: 'triangle' });
        break;
      case 'advance':
        this._tone({ f: 980, f2: 1400, dur: 0.07, vol: 0.12 });
        break;
      case 'dlgOpen':
        this._tone({ f: 660, f2: 990, dur: 0.1, vol: 0.12, echo: 0.3 });
        this._tone({ f: 1320, t: 0.07, dur: 0.14, vol: 0.09, echo: 0.3 });
        break;
      case 'step':
        this._noise({ dur: 0.06, vol: 0.10, freq: 700 + Math.random() * 300, q: 1.2 });
        this._tone({ f: 150, f2: 90, dur: 0.05, vol: 0.06 });
        break;
      case 'sit':
        this._tone({ f: 420, f2: 210, dur: 0.16, vol: 0.16 });
        this._noise({ dur: 0.1, vol: 0.06, freq: 500, q: 0.8 });
        break;
      case 'pause':
        this._bell(79, 0, 0.14, 0.25); this._bell(79, 0.1, 0.1, 0.4);
        break;
      case 'shame': // "uuuh" que baja
        this._tone({ f: 392, f2: 330, dur: 0.22, vol: 0.16, type: 'triangle' });
        this._tone({ f: 330, f2: 262, t: 0.22, dur: 0.45, vol: 0.16, type: 'triangle' });
        this._noise({ t: 0.05, dur: 0.3, vol: 0.04, freq: 900, q: 0.7 });
        break;
      case 'cricket': // cri-cri
        for (let k = 0; k < 2; k++) for (let j = 0; j < 3; j++) {
          this._tone({ f: 4300, f2: 4500, t: k * 0.32 + j * 0.045, dur: 0.03, vol: 0.035 });
        }
        break;
      case 'bump': // choque con alguien en la pista
        this._tone({ f: 210, f2: 120, dur: 0.12, vol: 0.2, type: 'square' });
        this._noise({ dur: 0.08, vol: 0.12, freq: 400, q: 0.9 });
        this._tone({ f: 520, f2: 380, t: 0.08, dur: 0.18, vol: 0.07, type: 'triangle' });
        break;
      case 'dizzy': // "uuuuh" que da vueltas
        for (let k = 0; k < 4; k++) this._tone({ f: 440 - k * 30, f2: 520 - k * 30, t: k * 0.13, dur: 0.12, vol: 0.06, type: 'triangle', echo: 0.4 });
        break;
      case 'wave':
        this._tone({ f: 784, f2: 1047, dur: 0.12, vol: 0.12 });
        this._tone({ f: 1047, f2: 1319, t: 0.12, dur: 0.16, vol: 0.12, echo: 0.3 });
        break;
      case 'alert': // la Isa está por darse vuelta
        this._tone({ f: 880, f2: 990, dur: 0.08, vol: 0.12, type: 'triangle' });
        this._tone({ f: 1320, t: 0.1, dur: 0.12, vol: 0.12, type: 'triangle', echo: 0.3 });
        break;
      case 'gasp':
        this._tone({ f: 520, f2: 880, dur: 0.14, vol: 0.12, type: 'triangle' });
        this._noise({ dur: 0.12, vol: 0.05, freq: 2500, q: 0.8 });
        break;
      case 'heart': // lub-dub
        this._tone({ f: 95, f2: 55, dur: 0.13, vol: 0.38, a: 0.003 });
        this._tone({ f: 85, f2: 50, t: 0.16, dur: 0.11, vol: 0.26, a: 0.003 });
        break;
      case 'hit':
        this._bell(84, 0, 0.13, 0.35); this._bell(91, 0.05, 0.1, 0.45);
        break;
      case 'miss':
        this._tone({ f: 180, f2: 140, dur: 0.18, vol: 0.16, type: 'square' });
        this._tone({ f: 170, f2: 130, t: 0.05, dur: 0.18, vol: 0.08, type: 'sawtooth' });
        break;
      case 'whoosh': // el botón "No" se arranca
        this._noise({ dur: 0.22, vol: 0.09, freq: 900, f2: 4000, q: 1.2 });
        this._tone({ f: 600, f2: 1400, dur: 0.12, vol: 0.06, type: 'triangle' });
        break;
      case 'crunch': // galletas molidas
        this._noise({ dur: 0.09, vol: 0.16, freq: 1800 + Math.random() * 900, q: 0.9 });
        this._noise({ t: 0.04, dur: 0.07, vol: 0.1, freq: 3200, q: 1.4 });
        this._tone({ f: 140, f2: 80, dur: 0.06, vol: 0.08 });
        break;
      case 'squeeze': // limón estrujado
        this._noise({ dur: 0.16, vol: 0.08, freq: 1200, f2: 600, q: 2.5 });
        this._tone({ f: 700 + Math.random() * 120, f2: 380, dur: 0.1, vol: 0.05, type: 'triangle' });
        break;
      case 'drip': // gota de jugo / ingrediente que cae
        this._tone({ f: 900, f2: 1700, dur: 0.07, vol: 0.1 });
        break;
      case 'splash': // se sale de la fuente
        this._noise({ dur: 0.3, vol: 0.16, freq: 900, f2: 300, q: 0.7 });
        this._tone({ f: 330, f2: 160, dur: 0.22, vol: 0.1, type: 'triangle' });
        break;
      case 'whisk': // batidor contra el bol
        this._noise({ dur: 0.05, vol: 0.07, freq: 4200, q: 3 });
        this._tone({ f: 2400, dur: 0.03, vol: 0.025, type: 'triangle' });
        break;
      case 'ding': // timer del horno
        this._bell(96, 0, 0.18, 1.2, 0.6); this._bell(96, 0.35, 0.14, 1.4, 0.6);
        break;
      case 'stamp': // un rasgo queda pintado en el lienzo
        this._noise({ dur: 0.12, vol: 0.14, freq: 700, f2: 250, q: 0.8 });
        this._tone({ f: 300, f2: 150, dur: 0.1, vol: 0.16 });
        this._tone({ f: 1200, f2: 1700, t: 0.05, dur: 0.08, vol: 0.05, type: 'triangle' });
        break;
      case 'brush': // pincelada
        this._noise({ dur: 0.2, vol: 0.06, freq: 2600, f2: 1200, q: 1.5 });
        break;
      case 'canvas': // el lienzo se levanta y tapa la vista
        this._noise({ dur: 0.35, vol: 0.1, freq: 400, f2: 1800, q: 0.9 });
        this._tone({ f: 220, f2: 330, dur: 0.25, vol: 0.08, type: 'triangle' });
        this._tone({ f: 160, f2: 110, t: 0.3, dur: 0.12, vol: 0.14 });
        break;
      case 'tick':
        this._tone({ f: 2200, dur: 0.02, vol: 0.04, type: 'square' });
        break;
      case 'yay':
        [76, 79, 84, 88, 91, 96].forEach((n, i) => this._bell(n, i * 0.06, 0.12, 0.6, 0.6));
        this._noise({ dur: 0.7, vol: 0.04, freq: 6000, f2: 10000, q: 0.6 });
        break;
      case 'win':
        [72, 76, 79, 84, 79, 84, 88].forEach((n, i) => this._bell(n, i * 0.11, 0.15, 0.6, 0.6));
        this._tone({ f: midi(48), t: 0, dur: 0.9, vol: 0.12, type: 'triangle' });
        break;
      case 'fail': // trombón triste: wa-wa-wa-waaa
        [[311, 0], [294, 0.32], [277, 0.64]].forEach(([f, t]) => this._tone({ f, f2: f * 0.97, t, dur: 0.28, vol: 0.16, type: 'sawtooth' }));
        this._tone({ f: 262, f2: 247, t: 0.96, dur: 1.1, vol: 0.16, type: 'sawtooth' });
        break;
    }
  }

  // "Voz" de los diálogos: un blip por letra, con tono distinto por personaje
  blip(voice = 1) {
    if (!this.ctx) return;
    const f = 430 * voice * (0.94 + Math.random() * 0.14);
    this._tone({ f, f2: f * 1.08, dur: 0.055, vol: 0.085, type: 'triangle' });
  }

  // ── música ──
  startMusic(name) {
    this.wantSong = name;
    if (!this.ctx) return;
    if (this.song && this.song.name === name) return;
    this.stopMusic(true);
    this.wantSong = name;
    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    out.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 1.2);
    out.connect(this.music);
    const song = this.song = { name, out, step: 0, next: this.ctx.currentTime + 0.1 };
    const file = this.buffers['music:' + name];
    if (file) {
      const s = this.ctx.createBufferSource(); s.buffer = file; s.loop = true; s.connect(out); s.start();
      song.src = s;
      return;
    }
    const def = SONGS[name];
    if (!def) return;
    song.timer = setInterval(() => this._schedule(song, def), 60);
  }

  stopMusic(keepWant = false) {
    if (!keepWant) this.wantSong = null;
    const s = this.song;
    if (!s) return;
    this.song = null;
    clearInterval(s.timer);
    const t = this.ctx.currentTime;
    s.out.gain.cancelScheduledValues(t);
    s.out.gain.setValueAtTime(s.out.gain.value, t);
    s.out.gain.linearRampToValueAtTime(0.0001, t + 0.5);
    setTimeout(() => { try { s.src?.stop(); } catch {} s.out.disconnect(); }, 900);
  }

  _schedule(song, def) {
    const eighth = 60 / def.bpm / 2;
    while (song.next < this.ctx.currentTime + 0.25) {
      const at = song.next, out = song.out;
      const bar = Math.floor(song.step / 8) % def.chords.length;
      const i = song.step % 8;
      const chord = def.chords[bar];
      const note = def.melody[bar][i];
      if (def.style === 'calm') {
        if (i === 0) for (const n of chord) this._tone({ f: midi(n), at, dur: eighth * 8.5, vol: 0.05, a: 0.4, type: 'triangle', out });
        if (i === 0 || i === 4) this._tone({ f: midi(chord[0] - 12), at, dur: eighth * 3.5, vol: 0.14, a: 0.02, out });
        if (i % 2 === 1) this._noise({ at, dur: 0.03, vol: 0.012, freq: 7000, q: 2, out });
        if (note) {
          this._tone({ f: midi(note), at, dur: eighth * 3, vol: 0.12, echo: 0.6, out });
          this._tone({ f: midi(note + 12), at, dur: eighth, vol: 0.025, type: 'triangle', out });
        }
      } else if (def.style === 'disco') {
        // bombo en cada tiempo, platillo abierto a contratiempo, bajo en octavas y acordes cortos
        if (i % 2 === 0) {
          this._tone({ f: 150, f2: 45, at, dur: 0.22, vol: 0.32, a: 0.002, out });
          this._noise({ at, dur: 0.02, vol: 0.03, freq: 2500, q: 1, out });
        } else this._noise({ at, dur: 0.09, vol: 0.022, freq: 9000, q: 1.5, type: 'highpass', out });
        if (i === 2 || i === 6) this._noise({ at, dur: 0.14, vol: 0.05, freq: 1800, q: 0.8, out }); // palmas
        const bass = chord[0] - 24 + (i % 2 ? 12 : 0);
        this._tone({ f: midi(bass), at, dur: eighth * 0.85, vol: 0.13, a: 0.005, type: 'triangle', out });
        if (i === 1 || i === 5) for (const n of chord) this._tone({ f: midi(n), at, dur: eighth * 0.6, vol: 0.04, type: 'square', out });
        if (note) this._tone({ f: midi(note), at, dur: eighth * 1.4, vol: 0.085, type: 'triangle', echo: 0.4, out });
      } else {
        if (i === 0 || i === 4) this._tone({ f: midi(chord[0] - 12), at, dur: eighth * 1.6, vol: 0.16, a: 0.01, out });
        if (i === 3) this._tone({ f: midi(chord[0] - 5), at, dur: eighth, vol: 0.11, a: 0.01, out });
        if (i === 2 || i === 6) for (const n of chord) this._tone({ f: midi(n), at, dur: eighth * 0.7, vol: 0.045, type: 'triangle', out });
        if (i % 2 === 0) this._noise({ at, dur: 0.025, vol: 0.014, freq: 8000, q: 2, out });
        if (note) this._tone({ f: midi(note), at, dur: eighth * 1.5, vol: 0.10, type: 'triangle', echo: 0.35, out });
      }
      song.step++;
      song.next += eighth;
    }
  }
}
