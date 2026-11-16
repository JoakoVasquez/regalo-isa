// Minijuego · Duelo en la cocina
// La Isa (jugadora) contra Joaco (bot) en la cocina del capítulo 6. Cinco pruebas cortas en orden al azar;
// gana el duelo quien llegue primero a 3 puntos. Cada duelo ganado sube la racha y Joaco se pone más rápido;
// al perder, la racha vuelve a 0. La mejor racha queda guardada (src/progreso.js).
//
// Reutiliza la escena del capítulo 6 (cocina, Miis, boles, utensilios, cámara y tareas por frame); aquí solo
// se agregan el segundo juego de bol y utensilios, la interfaz y las pruebas.
import * as THREE from 'three';
import { Mission6 } from './mision6.js';

// ───────────── Textos (se pueden editar) ─────────────
const AYUDA = '<span><b>E</b> / Espacio: botón A</span><span><b>WASD</b> / flechas: direcciones</span><span><b>Esc</b>: pausa</span>';
const RONDAS = {
  galletas: { nombre: 'Moler galletas', help: 'Aprieta <span class="btn-a">A</span> lo más rápido que puedas' },
  limones: { nombre: 'Exprimir limones', help: 'Alterna <b>←</b> <b>→</b> lo más rápido que puedas' },
  relleno: { nombre: 'Revolver el relleno', help: 'Gira <b>↑</b> <b>→</b> <b>↓</b> <b>←</b> (o WASD) siguiendo la flecha' },
  merengue: { nombre: 'Batir el merengue', help: 'Aprieta <span class="btn-a">A</span> a ritmo parejo: aguja en la <b>zona verde</b>' },
  reflejos: { nombre: '¡Atrapa el limón!', help: 'Aprieta <span class="btn-a">A</span> apenas caiga el limón. ¡Antes no!' },
};
// lo que dice Joaco antes de empezar, según la racha que lleva la Isa
const RETOS = [
  ['¿Un duelo?{w} Te aviso que cocino *rapidísimo*.', 'El que pierde lava la loza.'],
  ['Ya,{w} la revancha.{w} Ahora sí que sí.', 'Eso fue suerte.{w} Otra vez.'],
  ['Me estás dejando mal...{w} Esta vez voy *en serio*.', 'Ok,{w} se acabó el Joaco buena onda.'],
  ['¿Cómo eres tan rápida?{w} *Modo turbo activado.*', 'No puede ser.{w} ¡Otra!'],
];
const PUNTO = {
  isa: ['¡Punto para mí!', '¡Toma!', '¡Gané!', '¡Fácil!'],
  yo: ['¡Punto para Joaco!', '¡Ja!', '¡Mío!', 'Casi, casi...'],
};
const SALPICA = ['¡Salpicó!', '¡Uy, la mesa!', '¡Cuidado!'];
const MUY_RAPIDO = ['¡Saltó merengue!', '¡Más despacio!'];
const FALTA_ISA = '¡Me adelanté!';
const FALTA_YO = 'Ups... me adelanté.';

// ───────────── Ajustes ─────────────
const PUNTOS = 3;          // puntos para ganar el duelo
const NIVELES = 8;         // duelos seguidos hasta que Joaco llega a su tope
// bot: [más lento, más rápido] según el nivel
const GALLETAS = { porGolpe: 0.026, baja: 0.03, bot: [3.6, 6.6] };        // golpes por segundo
const LIMONES = { n: 56, bot: [4.5, 9.0] };                               // apretones por segundo
const RELLENO = { n: 40, castigo: 0.5, bot: [2.8, 5.6], torpe: [0.12, 0.03] }; // flechas/s y tropiezos/s
const MERENGUE = { nieve: 6.5, porGolpe: 13, freno: 0.9, zona: [42, 74], alto: 86, maxAlto: 0.6, pierde: 0.12, bot: [0.5, 0.82] };
const REFLEJOS = { espera: [1.8, 4.5], bot: [0.52, 0.25], faltaBot: [0.14, 0] };

const RUEDA = [[0, -1, 'u'], [1, 0, 'r'], [0, 1, 'd'], [-1, 0, 'l']];

const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class Duelo extends Mission6 {
  constructor(opts) {
    super(opts);
    this.progress = opts.progress;
    this.id = opts.id ?? 'duelo';
    this.hint = AYUDA;
  }

  // ───────────── Interfaz ─────────────
  _buildDom() {
    const layer = document.createElement('div');
    layer.id = 'duLayer';
    const dots = Array.from({ length: PUNTOS }, () => '<i></i>').join('');
    layer.innerHTML = `
      <div id="duScore" class="hidden">
        <div class="du-side yo"><b>Joaco</b><span class="du-pts">${dots}</span></div>
        <div class="du-mid"><small></small>VS</div>
        <div class="du-side isa"><span class="du-pts">${dots}</span><b>Isa</b></div>
      </div>
      <div id="duBanner" class="hidden"></div>
      <div id="duSay" class="hidden"></div>
      <div id="duPanel" class="hidden">
        <div class="du-title"></div>
        <div class="du-body">
          <div class="du-ctl"></div>
          <div class="du-lanes">
            <div class="du-lane isa"><b>Isa</b><div class="c6-bar big"><i></i></div></div>
            <div class="du-lane yo"><b>Joaco</b><div class="c6-bar big"><i></i></div></div>
          </div>
        </div>
        <div class="c6-help"></div>
      </div>`;
    document.body.appendChild(layer);
    // mismos nombres que usa el capítulo 6 (para _hideUi, _say…)
    this.recipeEl = $('#duScore');
    this.turnEl = $('#duBanner');
    this.sayEl = $('#duSay');
    this.panelEl = $('#duPanel');
    this.pTitle = layer.querySelector('.du-title');
    this.pCtl = layer.querySelector('.du-ctl');
    this.pHelp = layer.querySelector('.c6-help');
    this.bars = { isa: layer.querySelector('.du-lane.isa i'), yo: layer.querySelector('.du-lane.yo i') };
    this.pts = { isa: [...layer.querySelectorAll('.du-side.isa .du-pts i')], yo: [...layer.querySelectorAll('.du-side.yo .du-pts i')] };
    this.levelEl = layer.querySelector('.du-mid small');
  }

  // ───────────── Carga: la cocina del capítulo 6 + un segundo bol y juego de utensilios ─────────────
  async load() {
    await super.load();
    const a = { bowl: this.bowl, stuff: this.bowlStuff, cookies: this.cookies, tools: this.tools };
    this._buildBowl();
    this._buildTools();
    const b = { bowl: this.bowl, stuff: this.bowlStuff, cookies: this.cookies, tools: this.tools };
    Object.assign(this, { bowl: a.bowl, bowlStuff: a.stuff, cookies: a.cookies, tools: a.tools });
    this.side = { isa: { mii: this.isa, key: 'i', ...a }, yo: { mii: this.yo, key: 'j', ...b } };
    // el limón de la prueba de reflejos
    this.limon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10).scale(1.2, 0.85, 0.85), new THREE.MeshLambertMaterial({ color: 0xf6d936 }));
    this.scene.add(this.limon);
    this.reset();
  }

  reset() {
    super.reset();
    if (!this.side) return; // primera llamada, desde la carga del capítulo 6
    const L = this.L;
    this.score = { isa: 0, yo: 0 };
    this.pie.visible = false;
    this.limon.visible = false;
    for (const who of ['isa', 'yo']) {
      const s = this.side[who];
      s.bowl.position.set(L.bowls[s.key][0], this.CH, L.bowls[s.key][1]);
      s.bowl.visible = true;
      for (const t of Object.values(s.tools)) t.visible = false;
      for (const c of s.cookies) c.visible = true;
      this._fill(who, 0);
    }
    this.held.clear();
    this._shot(0, 2.05, 3.6, 0, 1.15, -0.6);
    this._placeCamera(0, true);
    this._paintScore();
  }

  _fill(who, level, color) {
    const s = this.side[who];
    const y = 0.008 + level * 0.14;
    const r = 0.09 + 0.12 * Math.sin((y / 0.16) * Math.PI / 2) - 0.004;
    s.stuff.visible = level > 0.001;
    s.stuff.position.y = y;
    s.stuff.scale.setScalar(r);
    if (color != null) s.stuff.material.color.set(color);
  }
  _give(who, name, mode = 'r') {
    const s = this.side[who];
    const prev = this.held.get(s.mii);
    if (prev) prev.tool.visible = false;
    if (!name) { this.held.delete(s.mii); return; }
    const tool = s.tools[name];
    tool.visible = true;
    this.held.set(s.mii, { tool, mode });
  }
  _bowlTop(who, h = 0.18) {
    const p = this.side[who].bowl.position;
    return this._v2.set(p.x, this.CH + h, p.z);
  }
  // deja a los dos listos para una prueba: herramienta + animación, boles vacíos
  _ready(tool, mode, anim) {
    for (const who of ['isa', 'yo']) {
      const s = this.side[who];
      for (const c of s.cookies) c.visible = false;
      this._fill(who, 0);
      this._give(who, tool, mode);
      s.mii.play(anim, 0.2);
      s.mii.setSpeed(anim === 'idle' ? 1 : 0);
    }
  }
  _paintScore() {
    for (const who of ['isa', 'yo']) this.pts[who].forEach((e, i) => e.classList.toggle('on', i < this.score[who]));
  }
  get skill() { return clamp((this.level - 1) / (NIVELES - 1), 0, 1); }
  // ritmo irregular del bot: cambia un poco cada rato
  _wob(mg, dt) {
    mg.wT = (mg.wT ?? 0) - dt;
    if (mg.wT <= 0) { mg.wT = rand(0.4, 0.9); mg.w = rand(0.82, 1.15); }
    return mg.w;
  }

  // ───────────── Flujo ─────────────
  async _play() {
    const run = this.run;
    const ok = () => run === this.run;
    this.racha = this.progress?.stat(this.id + ':racha') ?? 0;
    this.level = this.racha + 1;
    this.levelEl.textContent = 'Nivel ' + this.level;
    this.recipeEl.classList.remove('hidden');
    await this._sleep(0.5);
    if (!ok()) return;
    await this._talk([{ who: 'yo', text: pick(RETOS[Math.min(this.racha, RETOS.length - 1)]) }]);
    if (!ok()) return;
    const orden = shuffle(Object.keys(RONDAS));
    for (let i = 0; this.score.isa < PUNTOS && this.score.yo < PUNTOS; i++) {
      const id = orden[i % orden.length];
      await this._banner(`<small>Prueba ${i + 1}</small>${RONDAS[id].nombre}`);
      if (!ok()) return;
      const w = await this['_r_' + id](run);
      if (!ok() || !w) return;
      await this._point(w, run);
      if (!ok()) return;
    }
    await this._end(run);
  }

  async _banner(html) {
    const e = this.turnEl;
    e.className = '';
    e.innerHTML = html;
    void e.offsetWidth;
    e.className = 'title';
    this.audio.play('start');
    await this._sleep(1.6);
    e.classList.add('hidden');
  }
  async _count(run) {
    const e = this.turnEl;
    for (const n of ['3', '2', '1']) {
      e.className = ''; e.textContent = n; void e.offsetWidth; e.className = 'count';
      this.audio.play('tick');
      await this._sleep(0.55);
      if (run !== this.run) return false;
    }
    e.className = ''; e.textContent = '¡Ya!'; void e.offsetWidth; e.className = 'count go';
    this.audio.play('hit');
    this._sleep(0.5).then(() => { if (run === this.run) e.classList.add('hidden'); });
    return true;
  }

  // Una carrera: los dos llenan su barra (0..1) y gana quien llegue primero. Devuelve 'isa' | 'yo'.
  async _race(run, id, cfg) {
    this.pTitle.textContent = RONDAS[id].nombre;
    this.pHelp.innerHTML = RONDAS[id].help;
    this.pCtl.innerHTML = cfg.html;
    this.panelEl.classList.toggle('solo', !!cfg.solo);
    this.bars.isa.style.width = this.bars.yo.style.width = '0%';
    this.panelEl.classList.remove('hidden');
    cfg.setup?.();
    if (!cfg.solo && !(await this._count(run))) return null;
    if (run !== this.run) return null;
    this.state = 'mini';
    return new Promise((res) => {
      this.mg = { t: 0, me: 0, bot: 0, ...cfg, finish: (w) => { if (this.mg) { this.mg = null; this.state = 'scene'; res(w); } } };
      cfg.init?.(this.mg);
    });
  }
  _updateMini(dt) {
    const mg = this.mg;
    mg.t += dt;
    mg.update(dt, mg);
    if (!this.mg || mg.solo) return;
    this.bars.isa.style.width = (clamp(mg.me, 0, 1) * 100).toFixed(1) + '%';
    this.bars.yo.style.width = (clamp(mg.bot, 0, 1) * 100).toFixed(1) + '%';
    if (mg.me >= 1) mg.finish('isa');
    else if (mg.bot >= 1) mg.finish('yo');
  }

  async _point(w, run) {
    const win = this.side[w].mii, lose = this.side[w === 'isa' ? 'yo' : 'isa'].mii;
    this.score[w]++;
    this._paintScore();
    const dot = this.pts[w][this.score[w] - 1];
    dot.classList.remove('pop'); void dot.offsetWidth; dot.classList.add('pop');
    for (const who of ['isa', 'yo']) { this._give(who, null); this.side[who].mii.setSpeed(1); }
    win.play('cheer', 0.2);
    lose.play('idle', 0.3);
    this.audio.play(w === 'isa' ? 'yay' : 'miss');
    if (this.sayT <= 0) this._say(win, pick(PUNTO[w]), w === 'isa' ? 'good' : '');
    if (w === 'isa') this._burst(this._bowlTop('isa', 0.5), 14, 0.8);
    await this._sleep(1.5);
    if (run !== this.run) return;
    win.play('idle', 0.3);
    this.panelEl.classList.add('hidden');
    this.limon.visible = false;
    for (const who of ['isa', 'yo']) this._fill(who, 0);
  }

  async _end(run) {
    const win = this.score.isa > this.score.yo;
    const marcador = `Isa ${this.score.isa} – ${this.score.yo} Joaco`;
    this.state = 'end';
    this.panelEl.classList.add('hidden');
    let title, text;
    if (win) {
      this.racha++;
      this.progress?.setStat(this.id + ':racha', this.racha);
      const nuevo = this.progress?.setRecord(this.id, this.racha);
      const best = this.progress?.record(this.id) ?? this.racha;
      this.isa.play('cheer', 0.2);
      this.yo.play('dizzy', 0.3);
      this._burst(this._v2.set(0, this.CH + 0.6, -0.5), 36, 1.3, 'mix', 1.8);
      title = '¡Ganaste el duelo!';
      text = `${marcador}\nRacha: ${this.racha} · Récord: ${best}${nuevo ? '  ¡Nuevo récord!' : ''}\nEn la revancha Joaco va a ir más rápido.`;
    } else {
      const era = this.racha;
      this.racha = 0;
      this.progress?.setStat(this.id + ':racha', 0);
      this.yo.play('cheer', 0.2);
      this.isa.play('dizzy', 0.3);
      this.audio.stopMusic();
      title = 'Ganó Joaco';
      text = `${marcador}\n${era ? `Se cortó la racha de ${era}. ` : ''}Récord: ${this.progress?.record(this.id) ?? 0}\nTe toca lavar la loza.`;
    }
    await this._sleep(1.3);
    if (run !== this.run) return;
    this._hideUi();
    this.state = 'done';
    this.audio.play(win ? 'win' : 'fail');
    this.onEnd({ win, title, text });
  }

  // ───────────── Pruebas ─────────────
  _r_galletas(run) {
    const paint = (who, k) => {
      const cs = this.side[who].cookies;
      cs.forEach((c, i) => { c.visible = k < 1 - (i + 1) / (cs.length + 1); });
      this._fill(who, k * 0.35, 0xc9925a);
    };
    return this._race(run, 'galletas', {
      html: '<span class="du-big">🍪</span>',
      setup: () => { this._ready('uslero', 'both', 'mash'); for (const who of ['isa', 'yo']) paint(who, 0); },
      init: (mg) => { mg.sp = 0; },
      pressA: () => {
        const mg = this.mg;
        mg.me = Math.min(1, mg.me + GALLETAS.porGolpe);
        mg.sp = Math.min(2.5, mg.sp + 0.6);
        this.audio.play('crunch');
        this.shake = Math.max(this.shake, 0.05);
      },
      update: (dt, mg) => {
        if (mg.me < 1) mg.me = Math.max(0, mg.me - GALLETAS.baja * dt);
        mg.sp = Math.max(0, mg.sp - dt * 3);
        const hz = lerp(...GALLETAS.bot, this.skill) * this._wob(mg, dt);
        mg.bot = clamp(mg.bot + (hz * GALLETAS.porGolpe - GALLETAS.baja) * dt, 0, 1);
        this.isa.setSpeed(mg.sp);
        this.yo.setSpeed(hz / 3.2);
        paint('isa', mg.me); paint('yo', mg.bot);
      },
    });
  }

  _r_limones(run) {
    return this._race(run, 'limones', {
      html: '<div class="c6-key l next">←</div><span class="du-big">🍋</span><div class="c6-key r next">→</div>',
      setup: () => this._ready('medio', 'r', 'mash'),
      init: (mg) => {
        mg.sp = 0; mg.last = 0;
        mg.keys = { [-1]: this.pCtl.querySelector('.c6-key.l'), [1]: this.pCtl.querySelector('.c6-key.r') };
      },
      pressDir: (dx) => {
        const mg = this.mg;
        if (!dx) return;
        const k = mg.keys[dx];
        k.classList.add('press');
        setTimeout(() => k.classList.remove('press'), 90);
        if (dx === mg.last) return; // hay que alternar
        mg.last = dx;
        mg.me = Math.min(1, mg.me + 1 / LIMONES.n);
        mg.sp = Math.min(2.4, mg.sp + 0.5);
        this.audio.play('squeeze');
        for (const d of [-1, 1]) mg.keys[d].classList.toggle('next', d !== dx);
      },
      update: (dt, mg) => {
        mg.sp = Math.max(0, mg.sp - dt * 3);
        const hz = lerp(...LIMONES.bot, this.skill) * this._wob(mg, dt);
        mg.bot = Math.min(1, mg.bot + (hz / LIMONES.n) * dt);
        this.isa.setSpeed(mg.sp);
        this.yo.setSpeed(hz / 4);
        this._fill('isa', mg.me * 0.5, 0xf4e27a); this._fill('yo', mg.bot * 0.5, 0xf4e27a);
      },
    });
  }

  _r_relleno(run) {
    const milk = new THREE.Color(0xf3e6c4), lemon = new THREE.Color(0xf2d64b), col = new THREE.Color();
    const splash = (who) => {
      this._say(this.side[who].mii, pick(SALPICA), 'bad');
      this._burst(this._bowlTop(who), 8, 0.6, 'splash', 1.2);
    };
    return this._race(run, 'relleno', {
      html: '<div class="c6-wheel"><span class="u">↑</span><span class="r">→</span><span class="d">↓</span><span class="l">←</span></div>',
      setup: () => this._ready('cuchara', 'r', 'stir'),
      init: (mg) => {
        mg.i = 0; mg.n = 0; mg.cool = 0; mg.botCool = 0; mg.sp = 0;
        mg.wheel = this.pCtl.querySelector('.c6-wheel');
        mg.paint = () => mg.wheel.querySelectorAll('span').forEach((e) => e.classList.toggle('next', e.classList.contains(RUEDA[mg.i][2])));
        mg.paint();
      },
      pressDir: (dx, dz) => {
        const mg = this.mg;
        if (mg.cool > 0) return;
        const [wx, wz] = RUEDA[mg.i];
        if (dx === wx && dz === wz) {
          mg.i = (mg.i + 1) % 4;
          mg.n++;
          mg.me = Math.min(1, mg.n / RELLENO.n);
          mg.sp = Math.min(2.2, mg.sp + 0.45);
          if (mg.n % 2 === 0) this.audio.play('tick');
          mg.paint();
        } else {
          mg.cool = RELLENO.castigo;
          this.audio.play('splash');
          this.shake = 0.2;
          mg.wheel.classList.remove('bad'); void mg.wheel.offsetWidth; mg.wheel.classList.add('bad');
          splash('isa');
        }
      },
      update: (dt, mg) => {
        mg.cool -= dt;
        mg.sp = Math.max(0, mg.sp - dt * 2.5);
        let hz = 0;
        if (mg.botCool > 0) mg.botCool -= dt;
        else {
          hz = lerp(...RELLENO.bot, this.skill) * this._wob(mg, dt);
          mg.bot = Math.min(1, mg.bot + (hz / RELLENO.n) * dt);
          if (Math.random() < lerp(...RELLENO.torpe, this.skill) * dt) { mg.botCool = 0.7; splash('yo'); }
        }
        this.isa.setSpeed(mg.sp);
        this.yo.setSpeed(hz / 2.6);
        this._fill('isa', 0.15 + mg.me * 0.35, col.copy(milk).lerp(lemon, mg.me));
        this._fill('yo', 0.15 + mg.bot * 0.35, col.copy(milk).lerp(lemon, mg.bot));
      },
    });
  }

  _r_merengue(run) {
    const [z0, z1] = MERENGUE.zona;
    return this._race(run, 'merengue', {
      html: `<div class="c6-gauge"><div class="zone" style="left:${z0}%;width:${z1 - z0}%"></div><div class="zone hot"></div><div class="needle"></div></div>`,
      setup: () => { this._ready('batidor', 'r', 'stir'); for (const who of ['isa', 'yo']) this._fill(who, 0.12, 0xf7f4ea); },
      init: (mg) => { mg.s = 0; mg.hot = 0; mg.needle = this.pCtl.querySelector('.needle'); },
      pressA: () => {
        const mg = this.mg;
        mg.s = Math.min(100, mg.s + MERENGUE.porGolpe);
        this.audio.play('whisk');
      },
      update: (dt, mg) => {
        mg.s = Math.max(0, mg.s - mg.s * MERENGUE.freno * dt);
        if (mg.s >= z0 && mg.s <= z1) mg.me = Math.min(1, mg.me + dt / MERENGUE.nieve);
        if (mg.s > MERENGUE.alto) {
          mg.hot += dt;
          if (mg.hot >= MERENGUE.maxAlto) {
            mg.hot = 0;
            mg.s = 30;
            mg.me = Math.max(0, mg.me - MERENGUE.pierde);
            this.audio.play('splash');
            this.shake = 0.2;
            this._say(this.isa, pick(MUY_RAPIDO), 'bad');
            this._burst(this._bowlTop('isa', 0.2), 10, 0.8, 'white', 1.6);
          }
        } else mg.hot = Math.max(0, mg.hot - dt);
        const frac = Math.min(0.95, lerp(...MERENGUE.bot, this.skill) * this._wob(mg, dt));
        mg.bot = Math.min(1, mg.bot + (frac / MERENGUE.nieve) * dt);
        mg.needle.style.left = mg.s.toFixed(1) + '%';
        this.isa.setSpeed(0.4 + mg.s / 30);
        this.yo.setSpeed(0.8 + frac * 1.6);
        this._fill('isa', 0.12 + 0.75 * mg.me, 0xffffff); this._fill('yo', 0.12 + 0.75 * mg.bot, 0xffffff);
      },
    });
  }

  // Reflejos: cae un limón en la isla y gana quien lo agarre primero. Apretar antes de tiempo es falta.
  _r_reflejos(run) {
    const s = this.skill;
    const drop = () => {
      const y0 = this.CH + 1.9, y1 = this.CH + 0.06;
      this.limon.visible = true;
      this.limon.position.set(0, y0, -0.05);
      this._tween(0.28, (t) => { this.limon.position.y = lerp(y0, y1, t * t); this.limon.rotation.z = t * 5; });
    };
    return this._race(run, 'reflejos', {
      solo: true,
      html: '<div class="du-wait">Espera…</div>',
      setup: () => this._ready(null, 'r', 'idle'),
      init: (mg) => {
        mg.wait = rand(...REFLEJOS.espera);
        mg.go = -1; // segundos desde que cayó (-1 = todavía no)
        mg.botAt = lerp(...REFLEJOS.bot, s) + rand(0, 0.09);
        mg.botFoul = Math.random() < lerp(...REFLEJOS.faltaBot, s) ? rand(0.6, mg.wait - 0.3) : -1;
        mg.label = this.pCtl.querySelector('.du-wait');
      },
      pressA: () => {
        const mg = this.mg;
        if (mg.go < 0) { // falta de la Isa
          this._say(this.isa, FALTA_ISA, 'bad');
          this.shake = 0.25;
          mg.label.textContent = '¡Falta!';
          mg.label.className = 'du-wait foul';
          mg.finish('yo');
        } else {
          this.audio.play('hit');
          mg.finish('isa');
        }
      },
      update: (dt, mg) => {
        if (mg.go < 0) {
          if (mg.botFoul > 0 && mg.t >= mg.botFoul) { // a Joaco le ganan los nervios
            this._say(this.yo, FALTA_YO, 'bad');
            mg.label.textContent = '¡Falta de Joaco!';
            mg.label.className = 'du-wait foul';
            mg.finish('isa');
          } else if (mg.t >= mg.wait) {
            mg.go = 0;
            drop();
            this.audio.play('alert');
            mg.label.innerHTML = '¡AHORA! <span class="btn-a">A</span>';
            mg.label.className = 'du-wait go';
          }
          return;
        }
        mg.go += dt;
        if (mg.go >= mg.botAt) mg.finish('yo');
      },
    });
  }
}
