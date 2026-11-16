// Capítulo 8 · ¿Quién quiere ser millonaria?
// Estudio de televisión (modelado en Blender: tools/build_estudio.py → assets/escenarios/estudio.glb).
// Joaco es el animador y la Isa concursa: 5 preguntas con 4 alternativas (src/mision8_dialogos.js).
// Se elige con las flechas (o el mouse), A marca la respuesta y A de nuevo la confirma.
// Una mala y se pierde; con las 5 buenas aparece un sobre: al abrirlo sale la carta (CONFIG.letter),
// que desde entonces queda también en el botón del menú principal.
// Este capítulo solo se abre con todos los corazones escondidos (ver src/progreso.js).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';
import { loadTemplate, Mii } from './mii.js';
import * as D from './mision8_dialogos.js';

const LETRAS = ['A', 'B', 'C', 'D'];
const SW = 512, SH = 288; // pantalla gigante (lienzo)

const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const plain = (s) => s.replace(/\*|\{w\}/g, '');

function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(5,5,20,0.5)');
  grad.addColorStop(0.55, 'rgba(5,5,20,0.25)');
  grad.addColorStop(1, 'rgba(5,5,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function makeEmojiTexture(ch, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.font = '900 52px Nunito, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(ch, 32, 36);
  return new THREE.CanvasTexture(c);
}

export class Mission8 {
  constructor({ audio, dialogue, onEnd }) {
    this.audio = audio;
    this.dialogue = dialogue;
    this.onEnd = onEnd;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 200);
    this.hint = D.AYUDA;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camGoalPos = new THREE.Vector3();
    this.camGoalLook = new THREE.Vector3();
    this.tasks = [];
    this.time = 0;
    this.run = 0;
    this._v = new THREE.Vector3();
    this._buildDom();
  }

  // ───────────── Interfaz propia del capítulo ─────────────
  _buildDom() {
    const layer = document.createElement('div');
    layer.id = 'c8Layer';
    layer.innerHTML = `
      <ol id="c8Ladder" class="hidden"></ol>
      <div id="c8Quiz" class="hidden">
        <div class="c8-num"></div>
        <div class="c8-q"></div>
        <div class="c8-opts">${LETRAS.map((l) => `<button class="c8-opt"><b>${l}</b><span></span></button>`).join('')}</div>
        <div class="c8-help"></div>
      </div>
      <div id="c8Prize" class="hidden">
        <div class="c8-env">
          <h3>${D.SOBRE.titulo}</h3>
          <div class="c8-envelope"><i></i><b>♥</b></div>
          <div class="c8-go">${D.SOBRE.abrir}</div>
        </div>
        <div class="c8-letter hidden">
          <h2></h2>
          <p></p>
          <div class="c8-go">${D.SOBRE.cerrar}</div>
        </div>
      </div>`;
    document.body.appendChild(layer);
    this.ladderEl = $('#c8Ladder');
    this.quizEl = $('#c8Quiz');
    this.numEl = layer.querySelector('.c8-num');
    this.qEl = layer.querySelector('.c8-q');
    this.helpEl = layer.querySelector('.c8-help');
    this.optEls = [...layer.querySelectorAll('.c8-opt')];
    this.prizeEl = $('#c8Prize');
    this.envEl = layer.querySelector('.c8-env');
    this.letterEl = layer.querySelector('.c8-letter');

    // escalera de premios (el más grande arriba)
    this.ladderEl.innerHTML = `<h4>${D.PANEL.escalera}</h4>` + D.PREGUNTAS.map((q, i) => `<li data-i="${i}"><b>${i + 1}</b><span>${q.premio}</span></li>`).reverse().join('');

    this.optEls.forEach((b, i) => {
      b.addEventListener('mouseenter', () => { if (this.state === 'ask' && !this.ask.armed) this._select(i, false); });
      b.addEventListener('click', () => {
        if (this.state !== 'ask' || this.dialogue.active) return;
        if (this.ask.armed && this.ask.sel === i) this.pressA();
        else { this._select(i, false); this.pressA(); }
      });
    });
    this.prizeEl.addEventListener('click', () => this.pressA());
  }

  // ───────────── Carga ─────────────
  async load() {
    const ch = CONFIG.characters;
    const [L, gltf, tIsa, tYo] = await Promise.all([
      fetch('assets/escenarios/estudio.json').then((r) => r.json()),
      new GLTFLoader().loadAsync('assets/escenarios/estudio.glb'),
      loadTemplate(ch.isa.file), loadTemplate(ch.yo.file),
    ]);
    this.L = L;
    const scene = this.scene;
    scene.background = new THREE.Color(0x090a18);
    scene.fog = new THREE.Fog(0x090a18, 12, 30);

    // Luces de estudio: relleno azulado, un foco blanco de frente y contraluz rosado
    scene.add(new THREE.HemisphereLight(0xb9c2ff, 0x3a2a5c, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(0.5, 5, 7);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff8fc6, 0.9);
    rim.position.set(-3, 4, -6);
    scene.add(rim);

    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const s = o.material;
      o.material = o.name.startsWith('luz')
        ? new THREE.MeshBasicMaterial({ color: s.color, fog: false })
        : new THREE.MeshLambertMaterial({ color: s.color, side: s.side });
      if (o.name === 'luz_borde' || o.name === 'luz_anillo') (this.pulse ??= []).push({ mat: o.material, base: o.material.color.clone() });
    });
    scene.add(gltf.scene);

    // Pantalla gigante: un lienzo que se redibuja con el programa, la pregunta o el premio
    this.screenCv = document.createElement('canvas');
    this.screenCv.width = SW; this.screenCv.height = SH;
    this.screenTex = new THREE.CanvasTexture(this.screenCv);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    const [sx, sy, sz, sw, sh] = L.screen;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: this.screenTex, fog: false }));
    screen.position.set(sx, sy, sz);
    scene.add(screen);

    // Haces de luz de los focos (se mecen)
    const beamGeo = new THREE.ConeGeometry(0.85, 4.2, 20, 1, true).translate(0, -2.1, 0);
    const cols = [0xff8fc6, 0x7fe3ff, 0xfff3c4, 0x7fe3ff, 0xff8fc6];
    this.beams = L.lamps.map(([x, z], i) => {
      const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
        color: cols[i % cols.length], transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
      }));
      m.position.set(x, L.trussY - 0.47, z);
      m.renderOrder = 3;
      scene.add(m);
      return { m, ph: i * 1.3, x };
    });

    const blobMat = new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, depthWrite: false });
    const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.isa = new Mii(tIsa, { id: 'isa' });
    this.yo = new Mii(tYo, { id: 'yo' });
    for (const m of [this.isa, this.yo]) {
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.scale.setScalar(1.2); blob.position.y = 0.03; blob.renderOrder = 2;
      m.root.add(blob);
      scene.add(m.root);
    }

    // corazones y confeti para los aciertos
    const tex = { heart: makeEmojiTexture('♥', '#ff6f9c'), dot: makeEmojiTexture('●', '#ffffff') };
    this.parts = [];
    for (let i = 0; i < 70; i++) {
      const mats = {};
      for (const [k, t] of Object.entries(tex)) mats[k] = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false });
      const s = new THREE.Sprite(mats.heart);
      s.visible = false;
      scene.add(s);
      this.parts.push({ s, mats, v: new THREE.Vector3(), life: 0, max: 1, g: 1 });
    }

    this.reset();
  }

  // ───────────── Pantalla gigante ─────────────
  _screen(kind, a = '', b = '') {
    const g = this.screenCv.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, SH);
    const tones = { ok: ['#1f7a4d', '#0d3d2a'], bad: ['#8a2440', '#3d0d1d'], win: ['#c2417d', '#5a1a52'] }[kind] ?? ['#2a2f8a', '#120f3d'];
    grad.addColorStop(0, tones[0]); grad.addColorStop(1, tones[1]);
    g.fillStyle = grad;
    g.fillRect(0, 0, SW, SH);
    // brillo de fondo
    const r = g.createRadialGradient(SW / 2, SH / 2, 10, SW / 2, SH / 2, SW * 0.55);
    r.addColorStop(0, 'rgba(255,255,255,0.22)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, SW, SH);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const fit = (text, y, size, color, maxW = SW - 60) => {
      g.font = `900 ${size}px Nunito, sans-serif`;
      const w = g.measureText(text).width;
      if (w > maxW) g.font = `900 ${Math.floor(size * maxW / w)}px Nunito, sans-serif`;
      g.fillStyle = color;
      g.fillText(text, SW / 2, y);
    };
    if (kind === 'title') {
      fit('♥', 62, 70, '#ff8fc6');
      fit(D.PROGRAMA, 150, 46, '#ffe07a');
      fit('con Joaco', 216, 28, '#dfe3ff');
    } else {
      fit(a, 84, 40, '#dfe3ff');
      fit(b, 176, 64, '#ffe07a');
    }
    this.screenTex.needsUpdate = true;
  }

  // ───────────── Reinicio ─────────────
  reset() {
    this.run++;
    this.tasks = [];
    this.state = 'intro'; // 'intro' | 'scene' | 'ask' | 'reveal' | 'prize' | 'done'
    this.introT = 0;
    this.introStarted = false;
    this.ask = null;
    this.waitA = null;
    this.wantsCursor = false;
    this.camRate = 4;
    this.fovGoal = 40;
    this.level = 0;
    for (const p of this.parts) { p.life = 0; p.s.visible = false; }

    const L = this.L;
    const put = (m, s) => { m.position.set(s[0], L.stageH, s[1]); m.setHeading(s[2]); };
    for (const m of [this.yo, this.isa]) { m.talking = false; m.model.position.y = 0; m.play('idle', 0); }
    put(this.yo, L.spots.joaco);
    put(this.isa, L.spots.isa);

    this._screen('title');
    this._shot(0, 2.3, 8.2, 0, 1.5, 0);
    this.camera.fov = this.fovGoal;
    this.camera.updateProjectionMatrix();
    this._placeCamera(0, true);
    for (const m of [this.yo, this.isa]) m.update(0);
    this._hideUi();
  }

  _hideUi() {
    this.quizEl.classList.add('hidden');
    this.ladderEl.classList.add('hidden');
    this.prizeEl.classList.add('hidden');
    $('#objective').classList.remove('show');
    $('#blush').style.opacity = 0;
  }

  exit() {
    this.run++;
    this.tasks = [];
    this.state = 'done';
    this.ask = null;
    this.waitA = null;
    this.wantsCursor = false;
    this._hideUi();
  }

  // ───────────── Tareas por frame (se congelan con la pausa) ─────────────
  _task(step) { return new Promise((res) => this.tasks.push({ step, res })); }
  _sleep(s) { let t = 0; return this._task((dt) => (t += dt) >= s); }
  _talk(script) {
    const run = this.run;
    const hooks = {
      onTyping: (who, on) => {
        if (who === 'yo') this.yo.talking = on;
        if (who === 'isa') this.isa.talking = on;
      },
    };
    return this.dialogue.play(script, hooks).then(() => { if (run === this.run) this.yo.talking = this.isa.talking = false; });
  }
  // fit = alejar la cámara en pantallas angostas para que los dos sigan entrando en el cuadro
  _shot(px, py, pz, lx, ly, lz, fit = true) {
    this.shotRaw = [px, py, pz, lx, ly, lz, fit];
    this._applyShot();
  }
  _applyShot() {
    const [px, py, pz, lx, ly, lz, fit] = this.shotRaw;
    const f = fit ? clamp(1.7 / this.camera.aspect, 1, 1.7) : 1;
    this.camGoalLook.set(lx, ly, lz);
    this.camGoalPos.set(lx + (px - lx) * f, ly + (py - ly) * f, lz + (pz - lz) * f);
  }
  _burst(center, n = 40, spread = 1, up = 1.8) {
    const COLS = [0xffd257, 0x7fe3ff, 0xff8fc6, 0xffffff];
    let k = 0;
    for (const p of this.parts) {
      if (k >= n) break;
      if (p.life > 0) continue;
      const heart = k % 3 !== 2;
      p.s.material = heart ? p.mats.heart : p.mats.dot;
      p.s.material.color.set(heart ? 0xffffff : COLS[k % COLS.length]);
      k++;
      p.s.position.copy(center).add(this._v.set(rand(-spread, spread) * 0.4, rand(-0.05, 0.2), rand(-spread, spread) * 0.4));
      p.v.set(rand(-0.7, 0.7) * spread, rand(0.5, 1) * up, rand(-0.7, 0.7) * spread);
      p.life = p.max = heart ? rand(1.2, 2.2) : rand(0.8, 1.4);
      p.g = heart ? 0.6 : 2.6;
      p.s.scale.setScalar(heart ? rand(0.12, 0.22) : rand(0.05, 0.08));
      p.s.visible = true;
    }
  }

  // ───────────── Entrada ─────────────
  _paintOpts() {
    const a = this.ask;
    this.optEls.forEach((b, i) => {
      b.classList.toggle('sel', !!a && a.sel === i && !a.armed);
      b.classList.toggle('armed', !!a && a.sel === i && a.armed);
    });
    this.helpEl.innerHTML = a?.armed ? D.PANEL.confirmar : D.PANEL.elegir;
  }
  _select(i, sound = true) {
    const a = this.ask;
    if (!a || (a.sel === i && !a.armed)) return;
    a.sel = i;
    a.armed = false;
    if (sound) this.audio.play('hover');
    this._paintOpts();
  }
  pressDir(dx, dz) {
    if (this.state !== 'ask') return;
    const a = this.ask;
    let col = a.sel % 2, row = Math.floor(a.sel / 2);
    if (dx) col = clamp(col + dx, 0, 1);
    if (dz) row = clamp(row + dz, 0, 1);
    const i = row * 2 + col;
    if (i === a.sel && a.armed) { a.armed = false; this._paintOpts(); } else this._select(i);
  }
  pressA() {
    if (this.state === 'ask') {
      const a = this.ask;
      if (!a.armed) { a.armed = true; this.audio.play('select'); this._paintOpts(); }
      else { this.ask = null; this.audio.play('start'); a.done(a.sel); }
    } else if (this.state === 'prize' && this.waitA) {
      const f = this.waitA; this.waitA = null; f();
    }
  }

  // ───────────── Flujo del capítulo ─────────────
  async _play() {
    const run = this.run;
    const ok = () => run === this.run;
    const yo = this.yo, isa = this.isa;
    await this._sleep(1.0);
    if (!ok()) return;
    this.camRate = 1.2;
    this._shot(0, 1.5, 4.9, 0, 0.95, 0);
    await this._sleep(1.0);
    if (!ok()) return;
    yo.play('wave', 0.2);
    this.audio.play('wave');
    await this._talk(D.INTRO.slice(0, 2));
    if (!ok()) return;
    yo.play('idle', 0.3);
    isa.play('wave', 0.2);
    await this._talk(D.INTRO.slice(2, 3));
    if (!ok()) return;
    isa.play('idle', 0.3);
    await this._talk(D.INTRO.slice(3));
    if (!ok()) return;
    const obj = $('#objective');
    obj.innerHTML = D.OBJETIVO;
    obj.classList.remove('show'); void obj.offsetWidth; obj.classList.add('show');

    const total = D.PREGUNTAS.length;
    for (let i = 0; i < total; i++) {
      const q = D.PREGUNTAS[i];
      this.level = i;
      this._screen('q', D.PANEL.pregunta(i + 1, total), q.premio);
      this._shot(0, 1.5, 4.9, 0, 0.95, 0);
      if (q.antes) { await this._talk(q.antes); if (!ok()) return; }

      // ── la pregunta ──
      this.camRate = 2;
      this._shot(0.35, 1.75, 4.3, 0.25, 1.2, 0);
      const pickd = await this._preguntar(q, i, total);
      if (!ok()) return;

      // ── suspenso y resultado ──
      this.state = 'reveal';
      this.wantsCursor = false;
      this.optEls[pickd].classList.remove('armed');
      this.optEls[pickd].classList.add('locked');
      this.helpEl.textContent = plain(D.suspenso());
      for (let k = 0; k < 3; k++) {
        this.audio.play('heart');
        await this._sleep(0.62);
        if (!ok()) return;
      }
      const good = pickd === q.ok;
      this.optEls[pickd].classList.remove('locked');
      this.optEls[q.ok].classList.add('right');
      if (!good) this.optEls[pickd].classList.add('wrong');
      this.helpEl.textContent = '';

      if (!good) {
        this.audio.play('miss');
        this._screen('bad', '✗', LETRAS[q.ok] + ': ' + q.opciones[q.ok]);
        await this._sleep(1.5);
        if (!ok()) return;
        this.quizEl.classList.add('hidden');
        this.ladderEl.classList.add('hidden');
        this._shot(0, 1.5, 4.9, 0, 0.95, 0);
        await this._talk(D.MAL);
        if (!ok()) return;
        this.state = 'done';
        this.audio.stopMusic();
        this.audio.play('fail');
        this.onEnd({ win: false, ...D.PERDER });
        return;
      }

      this.audio.play('yay');
      this._screen('ok', '¡Correcto!', q.premio);
      this.ladderEl.querySelector(`li[data-i="${i}"]`).classList.add('won');
      isa.play('cheer', 0.15);
      this._burst(this._v.set(isa.position.x, 1.5, isa.position.z), 22, 1.1, 1.7);
      await this._sleep(1.5);
      if (!ok()) return;
      isa.play('idle', 0.3);
      this.quizEl.classList.add('hidden');
      this.ladderEl.classList.add('hidden');
      this._shot(0, 1.5, 4.9, 0, 0.95, 0);
      if (q.bien) { await this._talk(q.bien); if (!ok()) return; }
    }

    await this._final(run);
  }

  // Muestra la pregunta y espera la respuesta confirmada (devuelve el índice elegido)
  _preguntar(q, i, total) {
    this.numEl.textContent = D.PANEL.pregunta(i + 1, total) + ' · ' + q.premio;
    this.qEl.textContent = q.texto;
    this.optEls.forEach((b, k) => {
      b.className = 'c8-opt';
      b.querySelector('span').textContent = q.opciones[k];
    });
    for (const li of this.ladderEl.querySelectorAll('li')) li.classList.toggle('cur', +li.dataset.i === i);
    this.quizEl.classList.remove('hidden'); void this.quizEl.offsetWidth;
    this.ladderEl.classList.remove('hidden');
    this.audio.play('open');
    return new Promise((res) => {
      this.ask = { sel: 0, armed: false, done: res };
      this._paintOpts();
      this.state = 'ask';
      this.wantsCursor = true;
    });
  }

  // ───────────── Final: el sobre y la carta ─────────────
  async _final(run) {
    const ok = () => run === this.run;
    const yo = this.yo, isa = this.isa;
    this.state = 'scene';
    $('#objective').classList.remove('show');
    this._screen('win', '¡GANADORA!', '♥ Isa ♥');
    this.audio.startMusic('amor');
    this.camRate = 1.2;
    this._shot(0, 1.6, 5.4, 0, 1.1, 0);
    yo.play('cheer', 0.2); isa.play('cheer', 0.2);
    this._burst(this._v.set(0, 1.6, 0.4), 60, 2.4, 2.3);
    await this._sleep(1.8);
    if (!ok()) return;
    yo.play('idle', 0.3); isa.play('idle', 0.3);
    await this._talk(D.FINAL);
    if (!ok()) return;

    // el sobre
    this.letterEl.querySelector('h2').textContent = CONFIG.letter.title;
    this.letterEl.querySelector('p').textContent = CONFIG.letter.body;
    this.envEl.classList.remove('hidden');
    this.letterEl.classList.add('hidden');
    this.prizeEl.classList.remove('hidden');
    this.audio.play('open');
    this.state = 'prize';
    this.wantsCursor = true;
    await new Promise((res) => { this.waitA = res; });
    if (!ok()) return;
    this.audio.play('yay');
    this.envEl.classList.add('hidden');
    this.letterEl.classList.remove('hidden');
    await this._sleep(0.6); // que un doble toque no la cierre sin querer
    if (!ok()) return;
    await new Promise((res) => { this.waitA = res; });
    if (!ok()) return;
    this.audio.play('select');
    this.prizeEl.classList.add('hidden');
    this.wantsCursor = false;
    this.state = 'scene';

    $('#blush').style.opacity = 0.3;
    await this._talk(D.DESPUES);
    if (!ok()) return;
    yo.play('cheer', 0.2); isa.play('cheer', 0.2);
    this._burst(this._v.set(0, 1.5, 0.4), 50, 2.0, 2.0);
    await this._sleep(1.5);
    if (!ok()) return;
    $('#blush').style.opacity = 0;
    this.state = 'done';
    this.audio.play('win');
    this.onEnd({ win: true, ...D.GANAR });
  }

  // ───────────── Bucle ─────────────
  update(dt) {
    this.time += dt;
    if (this.tasks.length) {
      for (const t of [...this.tasks]) if (t.step(dt)) { this.tasks.splice(this.tasks.indexOf(t), 1); t.res(); }
    }
    if (this.state === 'intro') {
      this.introT += dt;
      if (this.introT > 0.5 && !this.introStarted) { this.introStarted = true; this.state = 'scene'; this._play(); }
    }
    this.yo.update(dt);
    this.isa.update(dt);

    // luces: los haces se mecen y el borde de la tarima late (más rápido en el suspenso)
    const t = this.time;
    for (const b of this.beams) {
      b.m.rotation.z = Math.sin(t * 0.7 + b.ph) * 0.3 - b.x * 0.06;
      b.m.rotation.x = Math.cos(t * 0.5 + b.ph) * 0.18 + 0.12;
      b.m.material.opacity = 0.09 + Math.sin(t * 1.3 + b.ph) * 0.03;
    }
    const beat = this.state === 'reveal' ? 9 : 2.2;
    const k = 0.78 + Math.sin(t * beat) * 0.22;
    if (this.pulse) for (const p of this.pulse) p.mat.color.copy(p.base).multiplyScalar(k);

    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.v.y -= p.g * dt;
      p.s.position.addScaledVector(p.v, dt);
      p.s.material.opacity = clamp((p.life / p.max) * 1.6, 0, 1);
      if (p.life <= 0) p.s.visible = false;
    }
    this._placeCamera(dt);
  }

  _placeCamera(dt, snap = false) {
    const k = snap ? 1 : 1 - Math.exp(-dt * (this.camRate ?? 4));
    if (Math.abs(this.camera.fov - this.fovGoal) > 0.01) {
      this.camera.fov += (this.fovGoal - this.camera.fov) * (snap ? 1 : 1 - Math.exp(-dt * 3));
      this.camera.updateProjectionMatrix();
    }
    this.camPos.lerp(this.camGoalPos, k);
    this.camLook.lerp(this.camGoalLook, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
    if (this.shotRaw) this._applyShot();
  }
}
