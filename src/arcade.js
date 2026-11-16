// Base de los minijuegos arcade (src/trencito.js, src/limones.js): marcador con récord, vidas, cartel y
// cuenta regresiva, tareas por frame (se congelan con la pausa), cámara suave y chispas.
// Cada juego define load(), reset(), update(dt, input) y _play().
import * as THREE from 'three';

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

export function blobTexture(rgb = '0,0,0', a = 0.5) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, `rgba(${rgb},${a})`);
  grad.addColorStop(0.55, `rgba(${rgb},${a / 2})`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function glyphTexture(ch) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.font = '52px "Segoe UI Symbol", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(ch, 32, 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Arcade {
  constructor({ audio, dialogue, onEnd, progress, id, fov = 42, label = 'Puntos', hint = '' }) {
    this.audio = audio;
    this.dialogue = dialogue;
    this.onEnd = onEnd;
    this.progress = progress;
    this.id = id;
    this.hint = hint;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 400);
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camGoalPos = new THREE.Vector3();
    this.camGoalLook = new THREE.Vector3();
    this.camRate = 4;
    this.tasks = [];
    this.time = 0;
    this.run = 0;
    this.shake = 0;
    this.score = 0;
    this._v = new THREE.Vector3();

    const layer = document.createElement('div');
    layer.className = 'ar-layer';
    layer.innerHTML = `
      <div class="ar-hud hidden">
        <div class="ar-box ar-score"><small>${label}</small><b>0</b></div>
        <div class="ar-lives"></div>
        <div class="ar-box ar-best"><small>Récord</small><b>0</b></div>
      </div>
      <div class="ar-banner hidden"></div>`;
    document.body.appendChild(layer);
    this.hudEl = layer.querySelector('.ar-hud');
    this.scoreEl = layer.querySelector('.ar-score b');
    this.bestEl = layer.querySelector('.ar-best b');
    this.livesEl = layer.querySelector('.ar-lives');
    this.bannerEl = layer.querySelector('.ar-banner');
  }

  // ───────────── Marcador ─────────────
  setScore(n) {
    this.score = n;
    this.scoreEl.textContent = n;
    this.scoreEl.classList.remove('pop'); void this.scoreEl.offsetWidth; this.scoreEl.classList.add('pop');
  }
  setLives(n, max) {
    const lost = n < (this.lives ?? n);
    this.lives = n;
    this.livesEl.innerHTML = Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}">♥</i>`).join('');
    if (lost) { this.livesEl.classList.remove('hit'); void this.livesEl.offsetWidth; this.livesEl.classList.add('hit'); }
  }

  // ───────────── Tareas por frame ─────────────
  _task(step) { return new Promise((res) => this.tasks.push({ step, res })); }
  _sleep(s) { let t = 0; return this._task((dt) => (t += dt) >= s); }
  _tween(dur, fn) { let t = 0; return this._task((dt) => { t = Math.min(1, t + dt / dur); fn(ease(t)); return t >= 1; }); }

  async _banner(html, dur = 2.2) {
    const e = this.bannerEl;
    e.className = 'ar-banner';
    e.innerHTML = html;
    void e.offsetWidth;
    e.classList.add('title');
    this.audio.play('start');
    await this._sleep(dur);
    e.classList.add('hidden');
  }
  async _count(run) {
    const e = this.bannerEl;
    for (const n of ['3', '2', '1']) {
      e.className = 'ar-banner'; e.textContent = n; void e.offsetWidth; e.classList.add('count');
      this.audio.play('tick');
      await this._sleep(0.55);
      if (run !== this.run) return false;
    }
    e.className = 'ar-banner'; e.textContent = '¡Ya!'; void e.offsetWidth; e.classList.add('count', 'go');
    this.audio.play('hit');
    this._sleep(0.5).then(() => { if (run === this.run) e.classList.add('hidden'); });
    return true;
  }

  // ───────────── Chispas (estrellas, corazones y gotas) ─────────────
  _buildParts(n = 40) {
    const mats = { star: glyphTexture('★'), heart: glyphTexture('♥'), dot: glyphTexture('●') };
    this.parts = [];
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mats.star, transparent: true, depthWrite: false, fog: false }));
      s.visible = false;
      this.scene.add(s);
      this.parts.push({ s, mats, v: new THREE.Vector3(), life: 0, max: 1 });
    }
  }
  _burst(x, y, z, { n = 10, kind = 'star', color = 0xffe066, spread = 1, size = 0.22 } = {}) {
    let k = 0;
    for (const p of this.parts) {
      if (k >= n) break;
      if (p.life > 0) continue;
      k++;
      p.s.material.map = p.mats[kind];
      p.s.material.color.set(color);
      p.s.position.set(x, y, z);
      p.v.set(rand(-1, 1) * spread, rand(0.8, 2.2) * spread, rand(-1, 1) * spread);
      p.life = p.max = rand(0.5, 0.9);
      p.s.scale.setScalar(size * rand(0.7, 1.3));
      p.s.visible = true;
    }
  }
  _updateParts(dt) {
    for (const p of this.parts ?? []) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.v.y -= 4 * dt;
      p.s.position.addScaledVector(p.v, dt);
      p.s.material.opacity = clamp((p.life / p.max) * 1.6, 0, 1);
      if (p.life <= 0) p.s.visible = false;
    }
  }

  // ───────────── Cámara ─────────────
  _shot(px, py, pz, lx, ly, lz) {
    this.camGoalPos.set(px, py, pz);
    this.camGoalLook.set(lx, ly, lz);
  }
  _placeCamera(dt, snap = false) {
    const k = snap ? 1 : 1 - Math.exp(-dt * this.camRate);
    this.camPos.lerp(this.camGoalPos, k);
    this.camLook.lerp(this.camGoalLook, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.shake = Math.max(0, this.shake - dt);
    if (this.shake > 0) this.camera.rotateZ(Math.sin(this.time * 47) * 0.05 * this.shake);
  }
  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  // ───────────── Ciclo ─────────────
  baseReset() {
    this.run++;
    this.tasks = [];
    this.state = 'intro'; // 'intro' | 'ready' | 'play' | 'over' | 'done'
    this.introT = 0;
    this.started = false;
    this.shake = 0;
    this.score = 0;
    this.lives = undefined;
    this.scoreEl.textContent = '0';
    this.bestEl.textContent = this.progress?.record(this.id) ?? 0;
    this.hudEl.classList.add('hidden');
    this.bannerEl.classList.add('hidden');
    for (const p of this.parts ?? []) { p.life = 0; p.s.visible = false; }
  }
  exit() {
    this.run++;
    this.tasks = [];
    this.state = 'done';
    this.hudEl.classList.add('hidden');
    this.bannerEl.classList.add('hidden');
  }
  baseUpdate(dt) {
    this.time += dt;
    if (this.tasks.length) {
      for (const t of [...this.tasks]) if (t.step(dt)) { this.tasks.splice(this.tasks.indexOf(t), 1); t.res(); }
    }
    if (this.state === 'intro') {
      this.introT += dt;
      if (this.introT > 0.4 && !this.started) { this.started = true; this.state = 'ready'; this._play(); }
    }
    this._updateParts(dt);
  }
  pressA() {}

  // Fin de la partida: guarda el récord y muestra la tarjeta (siempre con "Jugar otra vez" primero)
  async _gameOver(run, { icon, title, text }) {
    this.state = 'over';
    const nuevo = !!this.progress?.setRecord(this.id, this.score);
    const best = this.progress?.record(this.id) ?? this.score;
    this.bestEl.textContent = best;
    await this._sleep(1.5);
    if (run !== this.run) return;
    this.hudEl.classList.add('hidden');
    this.state = 'done';
    this.audio.stopMusic();
    this.audio.play(nuevo ? 'win' : 'fail');
    this.onEnd({
      win: true, again: true,
      icon: nuevo ? '★' : icon,
      title: nuevo ? '¡Nuevo récord!' : title,
      text: `${text}\nRécord: ${best}`,
    });
  }
}
