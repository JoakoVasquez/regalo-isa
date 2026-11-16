// Minijuego · Lluvia de limones
// En el parque del capítulo 7 (assets/escenarios/parque.glb). La Isa corre de lado a lado con un canasto en
// la cabeza: hay que atrapar los limones que caen y esquivar las piñas. Limón que toca el pasto o piña en
// el canasto = una vida menos. Los corazones devuelven una vida (o dan puntos extra). Cada vez cae más
// rápido y más seguido. Puntaje = limones atrapados.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';
import { loadTemplate, Mii } from './mii.js';
import { Arcade, rand, clamp, lerp, blobTexture } from './arcade.js';

// ───────────── Ajustes ─────────────
const PISTA = { z: 4.2, mitad: 4.0 };       // la Isa corre sobre esta línea, entre -mitad y +mitad
const CORRER = 5.8;                          // metros por segundo
const VIDAS = 3;
const RAMPA = 85;                            // segundos hasta la dificultad máxima
const CAIDA = { y0: 7.6, vel: [3.0, 7.2], cada: [1.15, 0.4] }; // [al empezar, al máximo]
const PINA = [0.12, 0.3];                    // probabilidad de que caiga una piña
const CORAZON = 0.06;                        // probabilidad de corazón
const PUNTOS_CORAZON = 5;                    // si ya tiene todas las vidas
const R_CANASTO = 0.62;
const WALK_CYCLE_SPEED = 1.65;

const AYUDA = '<span><b>A</b> <b>D</b> / <b>←</b> <b>→</b>: correr</span><span><b>Esc</b>: pausa</span>';
const TITULO = 'Lluvia de limones<small>Atrapa los limones 🍋 · Esquiva las piñas 🌰</small>';

const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

function heartGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.42);
  s.bezierCurveTo(-0.62, 0.02, -0.5, 0.52, -0.22, 0.52);
  s.bezierCurveTo(-0.08, 0.52, 0, 0.42, 0, 0.3);
  s.bezierCurveTo(0, 0.42, 0.08, 0.52, 0.22, 0.52);
  s.bezierCurveTo(0.5, 0.52, 0.62, 0.02, 0, -0.42);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -0.08);
  return g;
}

export class Limones extends Arcade {
  constructor(opts) {
    super({ ...opts, fov: 42, label: 'Limones', hint: AYUDA });
  }

  // ───────────── Carga ─────────────
  async load() {
    const ch = CONFIG.characters;
    const [L, gltf, tIsa, tYo] = await Promise.all([
      fetch('assets/escenarios/parque.json').then((r) => r.json()),
      new GLTFLoader().loadAsync('assets/escenarios/parque.glb'),
      loadTemplate(ch.isa.file), loadTemplate(ch.yo.file),
    ]);
    this.L = L;
    const scene = this.scene;
    scene.background = new THREE.Color(0x9fd8f6);
    scene.fog = new THREE.Fog(0xcdeaf8, 55, 190);
    scene.add(new THREE.HemisphereLight(0xeef8ff, 0x9cc76e, 2.0));
    const sun = new THREE.DirectionalLight(0xfff1d0, 1.45);
    sun.position.set(6, 10, 5);
    scene.add(sun);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const s = o.material;
      if (['nube', 'farol'].includes(o.name)) o.material = new THREE.MeshBasicMaterial({ color: s.color, fog: o.name !== 'nube' });
      else o.material = new THREE.MeshLambertMaterial({ color: s.color, map: s.map, side: s.side });
      if (s.map) s.map.anisotropy = 4;
    });
    scene.add(gltf.scene);

    const blobTex = blobTexture('30,50,20', 0.4);
    const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
    this.isa = new Mii(tIsa, { id: 'isa' });
    this.yo = new Mii(tYo, { id: 'yo' });
    for (const m of [this.isa, this.yo]) {
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.scale.setScalar(1.25); blob.position.y = 0.03; blob.renderOrder = 2;
      m.root.add(blob);
      scene.add(m.root);
    }

    // Canasto de mimbre sobre la cabeza de la Isa (va pegado a ella)
    const basket = new THREE.Group();
    const wicker = lam(0xc99a64, { side: THREE.DoubleSide });
    basket.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.36, 0.34, 20, 1, true), wicker));
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.36, 20).rotateX(-Math.PI / 2), lam(0xb08350, { side: THREE.DoubleSide }));
    bottom.position.y = -0.165;
    basket.add(bottom);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.035, 6, 24).rotateX(Math.PI / 2), lam(0xa8774a));
    rim.position.y = 0.17;
    basket.add(rim);
    // limones que se van juntando dentro
    this.pile = [];
    const lemonGeo = new THREE.SphereGeometry(0.13, 12, 8).scale(1.2, 0.85, 0.85);
    const lemonMat = lam(0xf6d936);
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(lemonGeo, lemonMat);
      const a = (i / 6) * Math.PI * 2;
      m.position.set(i ? Math.cos(a) * 0.24 : 0, i ? 0.08 : 0.16, i ? Math.sin(a) * 0.24 : 0);
      m.rotation.y = rand(0, 6);
      basket.add(m);
      this.pile.push(m);
    }
    this.basketY = 2.18; // sobre el pelo (en metros del Mii sin escalar)
    basket.position.y = this.basketY;
    this.isa.root.add(basket);
    this.basket = basket;

    // Cosas que caen: cada una tiene las tres formas (limón, piña, corazón) y su sombra en el pasto
    const bigLemon = new THREE.SphereGeometry(0.2, 14, 10).scale(1.2, 0.88, 0.88);
    const leafGeo = new THREE.SphereGeometry(0.08, 8, 6).scale(1.4, 0.3, 0.8);
    const pineGeo = new THREE.SphereGeometry(0.2, 9, 7).scale(0.85, 1.25, 0.85);
    const scaleGeo = new THREE.ConeGeometry(0.21, 0.16, 9, 1, true);
    const heartGeo = heartGeometry().scale(0.5, 0.5, 0.5);
    const pineMat = new THREE.MeshLambertMaterial({ color: 0x5a3a1e, flatShading: true });
    const pineMat2 = new THREE.MeshLambertMaterial({ color: 0x3b2512, flatShading: true, side: THREE.DoubleSide });
    const heartMat = new THREE.MeshBasicMaterial({ color: 0xff4f86, fog: false });
    const leafMat = lam(0x4fa83d);
    const shadowMat = () => new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
    this.items = [];
    for (let i = 0; i < 20; i++) {
      const g = new THREE.Group();
      const lemon = new THREE.Group();
      lemon.add(new THREE.Mesh(bigLemon, lemonMat));
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(0.2, 0.12, 0); leaf.rotation.z = 0.5;
      lemon.add(leaf);
      const pine = new THREE.Group();
      pine.add(new THREE.Mesh(pineGeo, pineMat));
      for (let k = 0; k < 3; k++) {
        const sc = new THREE.Mesh(scaleGeo, pineMat2);
        sc.position.y = 0.12 - k * 0.12;
        sc.scale.setScalar(1 - Math.abs(k - 1) * 0.18);
        pine.add(sc);
      }
      const heart = new THREE.Mesh(heartGeo, heartMat);
      g.add(lemon, pine, heart);
      g.visible = false;
      scene.add(g);
      const shadow = new THREE.Mesh(blobGeo, shadowMat());
      shadow.position.set(0, 0.05, PISTA.z);
      shadow.renderOrder = 2;
      shadow.visible = false;
      scene.add(shadow);
      this.items.push({ g, shadow, forms: { lemon, pine, heart }, on: false });
    }

    this._buildParts(40);
    this.reset();
  }

  // ───────────── Reinicio ─────────────
  reset() {
    this.baseReset();
    const L = this.L;
    this.t = 0;
    this.spawnT = 0.6;
    this.lastX = 0;
    this.caught = 0;
    this.cheerT = 0;
    this.stepAcc = 0;
    for (const it of this.items) { it.on = false; it.g.visible = false; it.shadow.visible = false; }
    this.pile.forEach((m) => { m.visible = false; });

    const p = this.isa;
    p.position.set(0, 0, PISTA.z);
    p.setHeading(0);
    p.play('idle', 0);
    p.model.rotation.set(0, 0, 0);
    this.basket.rotation.set(0, 0, 0);
    // Joaco mira desde el mantel
    const sj = L.spots.joaco;
    this.yo.position.set(sj[0], 0, sj[1] + 0.9);
    this.yo.setHeading(0.15);
    this.yo.play('idle', 0);

    this.camRate = 3;
    this._shot(0, 2.6, PISTA.z + 9.2, 0, 2.9, PISTA.z);
    this._placeCamera(0, true);
    p.update(0); this.yo.update(0);
  }

  async _play() {
    const run = this.run;
    this.hudEl.classList.remove('hidden');
    this.setLives(VIDAS, VIDAS);
    await this._banner(TITULO, 2.4);
    if (run !== this.run) return;
    if (!(await this._count(run))) return;
    this.state = 'play';
  }

  get k() { return clamp(this.t / RAMPA, 0, 1); } // dificultad 0..1

  // ───────────── Juego ─────────────
  _spawn() {
    const it = this.items.find((i) => !i.on);
    if (!it) return;
    const k = this.k;
    const r = Math.random();
    const kind = r < CORAZON ? 'heart' : r < CORAZON + lerp(...PINA, k) ? 'pine' : 'lemon';
    const cada = lerp(...CAIDA.cada, k);
    // que el siguiente limón siempre se alcance corriendo desde el anterior
    const alcance = Math.max(1.2, CORRER * cada * 0.8);
    let x = clamp(this.lastX + rand(-alcance, alcance), -PISTA.mitad, PISTA.mitad);
    if (kind === 'pine') x = clamp(this.isa.position.x + rand(-1.6, 1.6), -PISTA.mitad, PISTA.mitad); // las piñas apuntan a la Isa
    else this.lastX = x;
    it.on = true;
    it.past = false;
    it.kind = kind;
    it.x = x;
    it.y = CAIDA.y0;
    it.v = lerp(...CAIDA.vel, k) * (kind === 'heart' ? 1.15 : rand(0.92, 1.08));
    it.spin = rand(-3, 3);
    for (const [name, f] of Object.entries(it.forms)) f.visible = name === kind;
    it.g.position.set(x, it.y, PISTA.z);
    it.g.rotation.set(0, 0, rand(0, 6));
    it.g.visible = true;
    it.shadow.visible = true;
    it.shadow.position.x = x;
    it.shadow.material.color.set(kind === 'pine' ? 0xff5a3c : 0xffffff);
  }

  _hurt() {
    this.setLives(this.lives - 1, VIDAS);
    this.shake = 0.35;
    if (this.lives <= 0) this._lose();
  }

  _catch(it) {
    const p = this.isa.position, y = this.catchY;
    if (it.kind === 'lemon') {
      this.caught++;
      this.setScore(this.score + 1);
      this.audio.play(this.score % 10 === 0 ? 'yay' : 'hit');
      this._burst(it.x, y + 0.2, PISTA.z, { n: 5, kind: 'dot', color: 0xf6d936, spread: 1.2, size: 0.16 });
      this.pile.forEach((m, i) => { m.visible = i < Math.min(this.pile.length, Math.ceil(this.caught / 3)); });
      if (this.score % 10 === 0) { this.yo.play('cheer', 0.2); this.cheerT = 1.4; }
    } else if (it.kind === 'heart') {
      this.audio.play('yay');
      if (this.lives < VIDAS) this.setLives(this.lives + 1, VIDAS);
      else this.setScore(this.score + PUNTOS_CORAZON);
      this._burst(p.x, y + 0.3, PISTA.z, { n: 10, kind: 'heart', color: 0xff6f9c, spread: 1.6, size: 0.3 });
    } else {
      this.audio.play('crunch');
      this.audio.play('miss');
      this._burst(it.x, y + 0.2, PISTA.z, { n: 8, kind: 'star', color: 0xffffff, spread: 1.8, size: 0.3 });
      this._hurt();
    }
  }

  _miss(it) {
    if (it.kind !== 'lemon') return;
    this.audio.play('splash');
    this._burst(it.x, 0.2, PISTA.z, { n: 6, kind: 'dot', color: 0xf1dc7a, spread: 1.4, size: 0.14 });
    this._hurt();
  }

  _lose() {
    const run = this.run;
    this.state = 'over';
    this.isa.play('dizzy', 0.2);
    this.yo.play('idle', 0.3);
    const n = this.score;
    this._gameOver(run, { icon: '🍋', title: '¡Se acabó la lluvia!', text: `${n} ${n === 1 ? 'punto' : 'puntos'}` });
  }

  _step(dt, input) {
    const p = this.isa, pos = p.position;
    this.t += dt;
    // correr
    const dx = input?.x ?? 0;
    if (dx) {
      pos.x = clamp(pos.x + dx * CORRER * dt, -PISTA.mitad, PISTA.mitad);
      p.turnToward(dx * 1.1, dt, 14); // medio de lado, sin dejar de mirar a la cámara
      p.play('walk', 0.12);
      p.setSpeed(CORRER / WALK_CYCLE_SPEED * 0.6);
      this.stepAcc += dt * 3.2;
      if (this.stepAcc > 0.31) { this.stepAcc = 0; this.audio.play('step'); }
    } else {
      p.turnToward(0, dt, 10);
      p.play('idle', 0.18);
    }
    // caen cosas
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = lerp(...CAIDA.cada, this.k) * rand(0.85, 1.15); this._spawn(); }
    const cy = this.catchY;
    for (const it of this.items) {
      if (!it.on) continue;
      const y0 = it.y;
      it.y -= it.v * dt;
      it.g.position.y = it.y;
      it.g.rotation.z += it.spin * dt;
      if (it.kind === 'heart') it.g.rotation.set(0, this.time * 4, 0);
      const h = clamp(it.y / CAIDA.y0, 0, 1);
      it.shadow.scale.setScalar(1.3 - h * 0.9);
      it.shadow.material.opacity = 1 - h * 0.75;
      let gone = false;
      if (!it.past && y0 > cy && it.y <= cy) {
        if (Math.abs(it.x - pos.x) < R_CANASTO) { this._catch(it); gone = true; }
        else it.past = true;
      }
      if (!gone && it.y <= 0.15) { this._miss(it); gone = true; }
      if (gone) { it.on = false; it.past = false; it.g.visible = false; it.shadow.visible = false; }
      if (this.state !== 'play') return;
    }
  }

  // ───────────── Bucle ─────────────
  update(dt, input) {
    this.baseUpdate(dt);
    this.catchY = this.basketY * this.isa.scale;
    if (this.state === 'play') this._step(dt, input);
    if (this.cheerT > 0) { this.cheerT -= dt; if (this.cheerT <= 0 && this.state === 'play') this.yo.play('idle', 0.3); }
    this.isa.update(dt);
    this.yo.update(dt);
    this._placeCamera(dt);
  }
}
