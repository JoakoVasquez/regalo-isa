// Capítulo 4 · Bromita
// Juegas como la Isa, acostada en su cama de noche mirando reels. Vista en primera persona:
// el celular (HTML, con la interfaz de Instagram) tapa casi toda la pantalla y la pieza de atrás
// (3D, hecha aquí mismo con figuras simples) se ve desenfocada.
// Minijuego: 3 barras de tiempo, cada una más difícil. Dos para mandarle el reel al Joaco
// (tocar compartir → elegirlo y enviar) y una para escribirle "bromita". Máximo 3 errores en total:
// al tercero se te cae el celular en la cara.
import * as THREE from 'three';
import * as D from './mision4_dialogos.js';

const VIDEO = 'assets/video/reel.mp4';
const POSTER = 'assets/video/reel_poster.jpg';
const AVATAR = 'assets/video/reel_avatar.jpg';
const MAX_ERRORS = 3;
// speed: largos de barra por segundo · w: ancho de la zona buena · move: cuánto se pasea la zona
const BARS = [
  { speed: 0.75, w: 0.24, move: 0 },
  { speed: 1.15, w: 0.15, move: 0 },
  { speed: 1.55, w: 0.11, move: 0.22 },
];

const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const ease = (t) => t * t * (3 - 2 * t);
const restart = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

// Íconos de Instagram (trazos blancos, caja de 24)
const ICON = {
  heart: '<path d="M12 20.3S3.6 15.4 2.6 10.2C1.9 6.8 4.1 4.2 7.1 4.2c2 0 3.5 1.1 4.9 2.9 1.4-1.8 2.9-2.9 4.9-2.9 3 0 5.2 2.6 4.5 6-1 5.2-9.4 10.1-9.4 10.1z"/>',
  comment: '<path d="M20.7 16.6A9 9 0 1 0 17.2 20l4.3 1.2z"/>',
  repost: '<path d="M4 11.5V9.5a3 3 0 0 1 3-3h13M16.5 3l3.5 3.5-3.5 3.5M20 12.5v2a3 3 0 0 1-3 3H4M7.5 21 4 17.5 7.5 14"/>',
  share: '<path d="M21.5 2.8 2.6 9.3l7.6 3.6 3.6 7.9zM10.2 12.9l11.3-10.1"/>',
  save: '<path d="M19 21.2l-7-6.2-7 6.2V2.8h14z"/>',
  more: '<path d="M4 8.5h16M9 15.5h11"/>',
  back: '<path d="M20.5 12H4M10.5 5.5 4 12l6.5 6.5"/>',
  plus: '<path d="M12 3.5v17M3.5 12h17"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.8"/><path d="m15.6 15.6 5.4 5.4"/>',
  call: '<path d="M7 3.5h2.6l1.6 4.4-2.1 1.5a12 12 0 0 0 5.5 5.5l1.5-2.1 4.4 1.6V17a3 3 0 0 1-3.3 3A16.5 16.5 0 0 1 4 6.8a3 3 0 0 1 3-3.3z"/>',
  video: '<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="m15.5 10.5 6-3.5v10l-6-3.5z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  photo: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="9" r="1.6"/><path d="m3.5 17 5-4.5 4 3.5 3-2.5 5 4"/>',
};
const svg = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24">${ICON[name]}</svg>`;
const initial = (c) => `<span class="av" style="background:${c.color}">${c.name[0]}</span>`;

export class Mission4 {
  constructor({ audio, dialogue, onEnd }) {
    this.audio = audio;
    this.dialogue = dialogue;
    this.onEnd = onEnd;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 50);
    this.hint = D.AYUDA;
    this.tasks = [];
    this.time = 0;
    this.run = 0;
    this._buildDom();
  }

  // ───────────── Interfaz: celular, manos, barra de tiempo, nervios ─────────────
  _buildDom() {
    const joaco = D.CONTACTOS.find((c) => c.joaco);
    const layer = document.createElement('div');
    layer.id = 'phoneLayer';
    layer.className = 'hidden';
    layer.innerHTML = `
      <div class="ph-wrap">
        <div class="hand hand-r"><i></i><i></i><i></i><i></i></div>
        <div class="phone">
          <div class="screen">
            <video class="reel" src="${VIDEO}" poster="${POSTER}" loop playsinline preload="auto"></video>
            <div class="reel-fx"></div>
            <div class="heartpop">${svg('heart')}</div>
            <div class="ig-status"><b>1:47</b><span class="st-r"><i class="sig"><u></u><u></u><u></u><u></u></i><i class="bat">48</i></span></div>
            <div class="ig-top">${svg('back')}<b>Reels</b><span class="sp"></span>${svg('plus')}</div>
            <div class="ig-side">
              <div class="sb sb-like">${svg('heart')}<small>3,194</small></div>
              <div class="sb">${svg('comment')}<small>&nbsp;</small></div>
              <div class="sb">${svg('repost')}<small>239</small></div>
              <div class="sb sb-share">${svg('share')}<small>2,771</small></div>
              <div class="sb">${svg('save')}<small>516</small></div>
              <div class="sb">${svg('more')}</div>
              <div class="sb sb-audio" style="background-image:url(${AVATAR})"></div>
            </div>
            <div class="ig-user">
              <div class="u-row"><span class="u-av" style="background-image:url(${AVATAR})"></span><b>sserahr</b><span class="follow">Follow</span></div>
              <div class="u-cap">Check out my latest video ...</div>
            </div>
            <div class="ig-comment">Add comment...</div>

            <div class="ig-sheet">
              <div class="sh-handle"></div>
              <div class="sh-search">${svg('search')}<span>Search</span></div>
              <div class="sh-grid">${D.CONTACTOS.map((c, i) => `
                <div class="ct${c.joaco ? ' joaco' : ''}" data-i="${i}">${initial(c)}<span class="ck">✓</span><small>${c.name}</small></div>`).join('')}
              </div>
              <div class="sh-foot"><div class="sh-msg">Write a message...</div><div class="sh-send">Send</div></div>
            </div>

            <div class="ig-dm">
              <div class="dm-head">${svg('back')}${initial(joaco)}<div class="dm-name"><b>Joaco</b><small>Active now</small></div><span class="sp"></span>${svg('call')}${svg('video')}</div>
              <div class="dm-list">
                <div class="dm-card"><div class="dm-card-top"><span class="u-av" style="background-image:url(${AVATAR})"></span>sserahr</div><img src="${POSTER}" alt=""></div>
                <div class="dm-me hidden"></div>
                <div class="dm-seen hidden">Seen just now</div>
                <div class="dm-typing hidden">${initial(joaco)}<span><i></i><i></i><i></i></span></div>
              </div>
              <div class="dm-input"><span class="dm-cam">${svg('photo')}</span><span class="dm-text"></span><span class="dm-ph">Message...</span><span class="dm-caret"></span><span class="sp"></span><span class="dm-send">Send</span>${svg('mic', 'dm-mic')}</div>
            </div>

            <div class="toast">Sent</div>
          </div>
          <div class="notch"></div>
        </div>
        <div class="hand hand-l"><i class="thumb"></i></div>
      </div>
      <div class="thought hidden"></div>
      <div class="tbar hidden">
        <div class="tb-step"></div>
        <div class="tb-tip"></div>
        <div class="tb-track"><i class="tb-zone"></i><i class="tb-needle"></i></div>
        <div class="tb-press"><span class="btn-a">A</span>¡Ahora!</div>
      </div>
      <div class="nervios hidden">
        <div class="nv-face">🙂</div>
        <div><div class="nv-label">${D.ERRORES}</div><div class="nv-dots"><i></i><i></i><i></i></div></div>
      </div>
      <div class="paf hidden">¡PAF!</div>`;
    document.body.appendChild(layer);
    const q = (s) => layer.querySelector(s);
    this.ui = {
      layer, wrap: q('.ph-wrap'), phone: q('.phone'), screen: q('.screen'), video: q('.reel'), fx: q('.reel-fx'),
      heartpop: q('.heartpop'), like: q('.sb-like'), likeCount: q('.sb-like small'), share: q('.sb-share'),
      sheet: q('.ig-sheet'), contacts: [...layer.querySelectorAll('.ct')], send: q('.sh-send'),
      dm: q('.ig-dm'), me: q('.dm-me'), seen: q('.dm-seen'), typing: q('.dm-typing'),
      input: q('.dm-input'), text: q('.dm-text'), ph: q('.dm-ph'), dmSend: q('.dm-send'), toast: q('.toast'),
      thought: q('.thought'), tbar: q('.tbar'), step: q('.tb-step'), tip: q('.tb-tip'),
      zone: q('.tb-zone'), needle: q('.tb-needle'), nervios: q('.nervios'), face: q('.nv-face'),
      dots: [...layer.querySelectorAll('.nv-dots i')], paf: q('.paf'),
    };
    this.ui.joaco = this.ui.contacts.find((c) => c.classList.contains('joaco'));
  }

  // ───────────── Pieza (3D, se ve borrosa detrás del celular) ─────────────
  async load() {
    const s = this.scene;
    s.background = new THREE.Color(0x1a1530);
    s.fog = new THREE.Fog(0x1a1530, 4, 9);
    const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
    const glow = (c) => new THREE.MeshBasicMaterial({ color: c });
    const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); s.add(o); return o; };

    s.add(new THREE.HemisphereLight(0x6f68b0, 0x221a38, 0.75));
    const lamp = new THREE.PointLight(0xffb36b, 9, 6, 1.4); // velador
    lamp.position.set(1.45, 1.0, -0.6);
    s.add(lamp);
    this.phoneLight = new THREE.PointLight(0x9fc4ff, 2.2, 3, 1.5); // la luz del celular en la cara/sábanas
    this.phoneLight.position.set(0, 0.95, -0.35);
    s.add(this.phoneLight);

    // pieza de 3,6 × 4,4 m, 2,6 de alto; la Isa tiene la cabeza en z≈0 y los pies hacia -z
    const W = 1.8, Z0 = -3.4, Z1 = 1.0, H = 2.6;
    const wall = lam(0xd9c3e3, { side: THREE.BackSide });
    const room = new THREE.Mesh(new THREE.BoxGeometry(W * 2, H, Z1 - Z0), wall);
    room.position.set(0, H / 2, (Z0 + Z1) / 2);
    s.add(room);
    box(W * 2, 0.02, Z1 - Z0, lam(0x8a6a5a), 0, 0.01, (Z0 + Z1) / 2); // piso

    // cama: colchón, plumón rosado con las rodillas levantadas, almohada
    box(1.5, 0.45, 2.3, lam(0xf4eef4), 0, 0.22, -1.0);
    box(1.56, 0.12, 2.0, lam(0xf3a6c4), 0, 0.5, -1.15);
    const knees = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), lam(0xf3a6c4));
    knees.scale.set(1.4, 0.95, 0.9);
    knees.position.set(0, 0.62, -1.25);
    s.add(knees);
    box(1.6, 0.9, 0.08, lam(0xb08a72), 0, 0.45, -2.2); // pie de la cama

    // pared del frente: cuadros, repisa y guirnalda de luces
    box(0.7, 0.5, 0.03, lam(0x7fb3d8), -0.7, 1.75, Z0 + 0.02);
    box(0.45, 0.6, 0.03, lam(0xf7d67a), 0.35, 1.85, Z0 + 0.02);
    box(0.4, 0.4, 0.03, lam(0xe57a8f), 1.0, 1.55, Z0 + 0.02);
    box(1.1, 0.04, 0.2, lam(0xa98468), 0.9, 1.2, Z0 + 0.1);
    box(0.12, 0.22, 0.12, lam(0x7cc58a), 0.6, 1.33, Z0 + 0.1);
    box(0.16, 0.12, 0.14, lam(0xf1f1f1), 1.15, 1.28, Z0 + 0.1);
    const bulbCols = [0xffd27a, 0xffb0d0, 0xfff1c2, 0xffc48a];
    const bulb = new THREE.SphereGeometry(0.03, 8, 6);
    const garland = (a, b, sag, n, k) => {
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(t * Math.PI) * sag;
        const m = new THREE.Mesh(bulb, glow(bulbCols[(i + k) % bulbCols.length]));
        m.position.copy(p);
        s.add(m);
      }
    };
    garland(new THREE.Vector3(-W, 2.35, Z0 + 0.05), new THREE.Vector3(0, 2.35, Z0 + 0.05), 0.28, 14, 0);
    garland(new THREE.Vector3(0, 2.35, Z0 + 0.05), new THREE.Vector3(W, 2.35, Z0 + 0.05), 0.28, 14, 2);
    garland(new THREE.Vector3(-W + 0.05, 2.35, Z0), new THREE.Vector3(-W + 0.05, 2.3, 0.4), 0.3, 18, 1);
    const fairy = new THREE.PointLight(0xffc98a, 2.5, 4, 1.5);
    fairy.position.set(0, 2.1, Z0 + 0.4);
    s.add(fairy);

    // ventana con la noche a la izquierda, y la luna
    box(0.03, 1.0, 1.1, glow(0x2d3f7a), -W + 0.02, 1.55, -1.6);
    box(0.04, 1.08, 0.06, lam(0xf2f2f2), -W + 0.03, 1.55, -1.03);
    box(0.04, 1.08, 0.06, lam(0xf2f2f2), -W + 0.03, 1.55, -2.17);
    box(0.04, 0.06, 1.18, lam(0xf2f2f2), -W + 0.03, 1.55, -1.6);
    const moon = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), glow(0xf6f1d8));
    moon.position.set(-W + 0.04, 1.8, -1.85);
    moon.rotation.y = Math.PI / 2;
    s.add(moon);
    box(0.05, 1.3, 0.3, lam(0xb7d6c9), -W + 0.06, 1.45, -0.85); // cortina

    // velador con lámpara a la derecha
    box(0.5, 0.55, 0.45, lam(0xc9a27f), 1.45, 0.27, -0.55);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.22, 16, 1, true), glow(0xffd8a0));
    shade.position.set(1.45, 0.9, -0.6);
    s.add(shade);
    box(0.03, 0.3, 0.03, lam(0x7a6050), 1.45, 0.7, -0.6);

    // la cámara: acostada, la cabeza en la almohada, mirando un poco hacia arriba
    this.camBase = new THREE.Vector3(0, 0.82, 0.1);
    this.camLook = new THREE.Vector3(0, 1.5, -3.4);
    this._placeCamera(0);

    // imagen del póster para la miniatura del menú
    this.posterImg = await new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = POSTER;
    });
    // (aquí no se llama a reset(): eso mostraría el celular encima del menú)
  }

  // Miniatura del menú: la pieza borrosa con el celular encima
  async preview(url) {
    const bg = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = url; });
    const c = document.createElement('canvas');
    c.width = bg.width; c.height = bg.height;
    const g = c.getContext('2d');
    g.filter = 'blur(6px)';
    g.drawImage(bg, -10, -10, c.width + 20, c.height + 20);
    g.filter = 'none';
    const h = c.height * 0.94, w = h * 9 / 19.5, x = (c.width - w) / 2, y = c.height * 0.06;
    g.save();
    g.translate(c.width / 2, c.height / 2);
    g.rotate(-0.04);
    g.translate(-c.width / 2, -c.height / 2);
    g.fillStyle = '#111';
    g.beginPath(); g.roundRect(x - 8, y - 8, w + 16, h + 40, 28); g.fill();
    g.beginPath(); g.roundRect(x, y, w, h + 30, 22); g.clip();
    if (this.posterImg) g.drawImage(this.posterImg, x, y, w, w * this.posterImg.height / this.posterImg.width);
    g.restore();
    return c.toDataURL('image/jpeg', 0.9);
  }

  // ───────────── Reinicio ─────────────
  reset() {
    this.run++;
    this.tasks = [];
    this.state = 'intro'; // 'intro' | 'bar' | 'busy' | 'done'
    this.errors = 0;
    this.barIdx = 0;
    this.bar = null;
    this.shake = 0;
    this.likes = 3194;
    this.introStarted = false;
    this.introT = 0;
    const u = this.ui;
    u.layer.classList.remove('hidden', 'falling');
    u.wrap.style.transform = '';
    u.sheet.classList.remove('open');
    u.dm.classList.remove('open');
    u.like.classList.remove('liked');
    u.likeCount.textContent = '3,194';
    for (const c of u.contacts) c.classList.remove('sel', 'target');
    u.send.classList.remove('on', 'press');
    u.share.classList.remove('target', 'press');
    u.input.classList.remove('target', 'has');
    u.text.textContent = '';
    u.me.classList.add('hidden');
    u.seen.classList.add('hidden');
    u.typing.classList.add('hidden');
    u.toast.classList.remove('show');
    u.thought.classList.add('hidden');
    u.tbar.classList.add('hidden');
    u.nervios.classList.add('hidden');
    u.paf.classList.add('hidden');
    this._paintErrors();
    document.body.classList.add('cap4');
    $('#objective').classList.remove('show');
    this._startVideo();
  }

  exit() {
    this.run++;
    this.tasks = [];
    this.ui.video.pause();
    this.ui.layer.classList.add('hidden');
    document.body.classList.remove('cap4');
    $('#objective').classList.remove('show');
  }

  // Pausa del juego: el reel también se detiene
  setPaused(p) {
    if (this.ui.layer.classList.contains('hidden')) return;
    if (p) this.ui.video.pause();
    else if (this.state !== 'done') this.ui.video.play().catch(() => {});
  }

  _startVideo() {
    const v = this.ui.video;
    // el sonido del reel pasa por el mezclador del juego (así respeta el botón de silencio)
    const ctx = this.audio.ctx;
    if (ctx && !this.vidGain) {
      try {
        const src = ctx.createMediaElementSource(v);
        this.vidGain = ctx.createGain();
        this.vidGain.gain.value = 0.85;
        src.connect(this.vidGain).connect(this.audio.master);
      } catch (e) { console.warn(e); }
    }
    v.currentTime = 0;
    v.play().catch(() => {});
  }

  // ───────────── Tareas por frame (se congelan con la pausa) ─────────────
  _task(step) { return new Promise((res) => this.tasks.push({ step, res })); }
  _sleep(s) { let t = 0; return this._task((dt) => (t += dt) >= s); }
  _tween(dur, fn) { let t = 0; return this._task((dt) => { t = Math.min(1, t + dt / dur); fn(ease(t)); return t >= 1; }); }
  async _say(lines) {
    const run = this.run;
    await this.dialogue.play(lines);
    return run === this.run;
  }

  // ───────────── Historia ─────────────
  async _intro() {
    const run = this.run;
    await this._sleep(1.3);
    if (run !== this.run) return;
    if (!(await this._say(D.INTRO))) return;
    const obj = $('#objective');
    obj.innerHTML = D.OBJETIVO;
    restart(obj, 'show');
    this.ui.nervios.classList.remove('hidden');
    this._startBar(0);
  }

  _startBar(i) {
    const cfg = BARS[i];
    this.barIdx = i;
    this.bar = { pos: 0, dir: 1, speed: cfg.speed, w: cfg.w, move: cfg.move, c: 0, base: 0, ph: rand(0, 6) };
    this._placeZone();
    const u = this.ui;
    u.step.textContent = `${i + 1} / ${BARS.length}`;
    u.tip.innerHTML = D.BARRAS[i].tip;
    u.tbar.classList.remove('hidden');
    restart(u.tbar, 'in');
    [u.share, u.joaco, u.input].forEach((el, k) => el.classList.toggle('target', k === i));
    this.state = 'bar';
    this._paintBar();
  }

  _placeZone() {
    const b = this.bar;
    const m = b.w / 2 + b.move + 0.03;
    b.base = rand(Math.max(m, 0.35), 1 - m); // nunca justo al principio
    b.c = b.base;
  }

  _paintBar() {
    const b = this.bar;
    if (!b) return;
    this.ui.zone.style.left = ((b.c - b.w / 2) * 100).toFixed(2) + '%';
    this.ui.zone.style.width = (b.w * 100).toFixed(2) + '%';
    this.ui.needle.style.left = (b.pos * 100).toFixed(2) + '%';
  }

  pressA() {
    if (this.state !== 'bar') return;
    const b = this.bar;
    const hit = Math.abs(b.pos - b.c) <= b.w / 2;
    this.state = 'busy';
    if (hit) this._success(this.barIdx);
    else this._miss(this.barIdx);
  }

  async _success(i) {
    const run = this.run, u = this.ui;
    this.audio.play('select');
    restart(u.tbar, 'ok');
    await this._sleep(0.35);
    u.tbar.classList.add('hidden');
    for (const el of [u.share, u.joaco, u.input]) el.classList.remove('target');
    if (run !== this.run) return;

    if (i === 0) {
      restart(u.share, 'press');
      this.audio.play('open');
      await this._sleep(0.25);
      u.sheet.classList.add('open');
      await this._sleep(0.55);
      if (run !== this.run) return;
      this._startBar(1);
    } else if (i === 1) {
      u.joaco.classList.add('sel');
      u.send.classList.add('on');
      this.audio.play('hover');
      await this._sleep(0.5);
      restart(u.send, 'press');
      this.audio.play('wave');
      await this._sleep(0.3);
      u.sheet.classList.remove('open');
      restart(u.toast, 'show');
      await this._sleep(0.9);
      u.dm.classList.add('open');
      this.ui.video.pause();
      await this._sleep(0.7);
      if (run !== this.run) return;
      this._startBar(2);
    } else {
      await this._type(D.MENSAJE);
      if (run !== this.run) return;
      await this._sleep(0.25);
      restart(u.dmSend, 'press');
      this.audio.play('wave');
      u.text.textContent = '';
      u.input.classList.remove('has');
      u.me.textContent = D.MENSAJE;
      u.me.classList.remove('hidden');
      restart(u.me, 'pop');
      await this._sleep(0.8);
      this._finale();
    }
  }

  async _type(word) {
    const u = this.ui;
    u.input.classList.add('has');
    u.text.textContent = '';
    for (const ch of word) {
      u.text.textContent += ch;
      this.audio.play('hover');
      await this._sleep(0.11);
    }
  }

  async _miss(i) {
    const run = this.run, u = this.ui;
    const e = this.errors++;
    this._paintErrors();
    restart(u.nervios, 'hit');
    restart(u.tbar, 'bad');
    this.audio.play('bump');
    this.shake = 1;
    this._think(D.FALLOS[i][Math.min(e, D.FALLOS[i].length - 1)]);

    // lo que sale mal en el celular
    if (i === 0) {
      if (e % 3 === 0) {
        restart(u.heartpop, 'pop');
        u.like.classList.add('liked');
        u.likeCount.textContent = (++this.likes).toLocaleString('en-US');
      } else restart(u.fx, e % 3 === 1 ? 'swipe' : 'dim');
    } else if (i === 1) {
      const wrong = u.contacts.filter((c) => c !== u.joaco)[e % 4];
      wrong.classList.add('sel');
      this.audio.play('hover');
      await this._sleep(0.7);
      wrong.classList.remove('sel');
    } else {
      await this._type(D.TYPOS[e % D.TYPOS.length]);
      if (run !== this.run) return;
      await this._sleep(0.45);
      u.text.textContent = '';
      u.input.classList.remove('has');
    }
    if (run !== this.run) return;

    if (this.errors >= MAX_ERRORS) { await this._fall(); return; }
    await this._sleep(i === 0 ? 1.1 : 0.5);
    if (run !== this.run) return;
    this.bar.pos = 0;
    this.bar.dir = 1;
    this._placeZone();
    this._paintBar();
    this.state = 'bar';
  }

  _think(text) {
    const t = this.ui.thought;
    t.innerHTML = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
    t.classList.remove('hidden');
    restart(t, 'pop');
    this.thoughtT = 1.9;
  }

  _paintErrors() {
    this.ui.dots.forEach((d, k) => d.classList.toggle('on', k < this.errors));
    this.ui.face.textContent = ['🙂', '😬', '😰', '😵'][Math.min(3, this.errors)];
  }

  // Tercer error: se le resbala el celular y le cae en la cara
  async _fall() {
    const run = this.run, u = this.ui;
    this.state = 'done';
    u.tbar.classList.add('hidden');
    await this._sleep(0.6);
    if (run !== this.run) return;
    this.audio.play('dizzy');
    u.layer.classList.add('falling');
    await this._sleep(0.55);
    if (run !== this.run) return;
    u.video.pause();
    this.audio.play('bump');
    this.shake = 2;
    u.paf.classList.remove('hidden');
    restart(u.paf, 'pop');
    await this._sleep(0.5);
    this.audio.play('fail');
    this.onEnd({ win: false, ...D.PERDER });
  }

  async _finale() {
    const run = this.run, u = this.ui;
    this.state = 'done';
    if (!(await this._say(D.ENVIADO))) return;
    await this._sleep(0.6);
    u.seen.classList.remove('hidden');
    this.audio.play('advance');
    await this._sleep(1.0);
    u.typing.classList.remove('hidden');
    restart(u.typing, 'pop');
    await this._sleep(1.4);
    if (run !== this.run) return;
    if (!(await this._say(D.ESCRIBIENDO))) return;
    this.audio.play('win');
    this.onEnd({ win: true, ...D.GANAR });
  }

  // ───────────── Por frame ─────────────
  update(dt) {
    this.time += dt;
    if (this.state === 'intro' && !this.introStarted) { this.introStarted = true; this._intro(); }

    for (let i = this.tasks.length - 1; i >= 0; i--) {
      const t = this.tasks[i];
      if (t.step(dt)) { this.tasks.splice(i, 1); t.res(); }
    }

    // aguja de la barra (rebota de punta a punta)
    const b = this.bar;
    if (this.state === 'bar' && b) {
      b.pos += b.dir * b.speed * dt;
      if (b.pos > 1) { b.pos = 2 - b.pos; b.dir = -1; }
      if (b.pos < 0) { b.pos = -b.pos; b.dir = 1; }
      if (b.move) b.c = b.base + Math.sin(this.time * 1.7 + b.ph) * b.move;
      this._paintBar();
    }

    if (this.thoughtT > 0) {
      this.thoughtT -= dt;
      if (this.thoughtT <= 0) this.ui.thought.classList.add('hidden');
    }

    // el celular se mece con la respiración (y tiembla cuando la Isa se equivoca)
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const nerv = this.errors / MAX_ERRORS;
    const tremor = (Math.sin(this.time * 37) * 0.4 + Math.sin(this.time * 23) * 0.3) * nerv * 0.12;
    const sx = Math.sin(this.time * 47) * this.shake * 0.9;
    const sy = Math.cos(this.time * 41) * this.shake * 0.6;
    const breathe = Math.sin(this.time * 1.3);
    if (!this.ui.layer.classList.contains('falling')) {
      this.ui.wrap.style.transform =
        `translate(calc(-50% + ${(sx + tremor).toFixed(2)}vmin), calc(-47% + ${(breathe * 0.5 + sy).toFixed(2)}vmin)) rotate(${(-3 + Math.sin(this.time * 0.7) * 0.6 + sx * 0.4).toFixed(2)}deg)`;
    }
    this.phoneLight.intensity = this.ui.dm.classList.contains('open') ? 1.6 : 2.2 + Math.sin(this.time * 3) * 0.3;
    this._placeCamera(breathe);
  }

  _placeCamera(breathe) {
    const c = this.camera;
    c.position.copy(this.camBase);
    c.position.y += breathe * 0.012;
    c.position.x += Math.sin(this.time * 41) * this.shake * 0.01;
    c.lookAt(this.camLook);
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }
}
