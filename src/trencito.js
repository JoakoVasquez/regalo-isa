// Minijuego · El trencito
// En la pista de la disco del capítulo 3 (assets/escenarios/disco.glb). La Isa lidera un trencito que no
// para de avanzar: con las flechas dobla, y cada persona que recoge se suma al final de la fila y lo acelera.
// Se acaba al chocar con la propia fila o con el borde de la pista. Puntaje = personas en el trencito.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';
import { loadTemplate, Mii, SharedRig, randomShirt, randomPants } from './mii.js';
import { Arcade, rand, pick, blobTexture } from './arcade.js';

// ───────────── Ajustes ─────────────
const ARENA = { w: 16, d: 12 };                   // pista de juego (metros), centrada en la pista de baile
const VEL = { ini: 3.0, sube: 0.11, max: 6.2 };   // metros por segundo; sube con cada persona
const GAP = 0.82;        // separación entre personas de la fila
const PASO = 0.1;        // cada cuánto se guarda el camino de la Isa
const R_CHOQUE = 0.45;   // distancia a la que se choca con la fila
const R_RECOGER = 0.8;
const GIRO_MIN = 0.62;   // metros mínimos entre dos giros (para no doblar sobre una misma)
const POOL = 80;         // largo máximo del trencito
const BEAT = 0.5;
const TAU = Math.PI * 2;
const WALK_CYCLE_SPEED = 1.65;
const FLOOR_COLORS = ['#ff3fa4', '#3fd0ff', '#ffd93a', '#8a4cff', '#3dff95', '#ff7a2f'];

const AYUDA = '<span><b>WASD</b> / flechas: doblar</span><span><b>Esc</b>: pausa</span>';
const TITULO = 'El trencito<small>Suma gente a la fila. ¡No choques!</small>';

export class Trencito extends Arcade {
  constructor(opts) {
    super({ ...opts, fov: 42, label: 'Trencito', hint: AYUDA });
  }

  // ───────────── Carga ─────────────
  async load() {
    const ch = CONFIG.characters;
    const [L, gltf, tIsa, tYo, tR1, tR2] = await Promise.all([
      fetch('assets/escenarios/disco.json').then((r) => r.json()),
      new GLTFLoader().loadAsync('assets/escenarios/disco.glb'),
      loadTemplate(ch.isa.file), loadTemplate(ch.yo.file), loadTemplate(ch.random1.file), loadTemplate(ch.random2.file),
    ]);
    this.L = L;
    const scene = this.scene;
    scene.background = new THREE.Color(0x07050b);

    // misma luz que el capítulo 3, un poco más clara para que se lea la fila
    scene.add(new THREE.HemisphereLight(0xcbb8ff, 0x3a2450, 2.1));
    const key = new THREE.DirectionalLight(0xffe6f4, 0.9);
    key.position.set(3, 10, 14);
    scene.add(key);
    this.movers = [0xff3fa4, 0x3fd0ff, 0xffd93a].map((c) => {
      const l = new THREE.PointLight(c, 10, 20, 1);
      scene.add(l);
      return l;
    });

    this.floorCanvas = document.createElement('canvas');
    this.floorCanvas.width = L.tiles[0] * 8;
    this.floorCanvas.height = L.tiles[1] * 8;
    this.floorTex = new THREE.CanvasTexture(this.floorCanvas);
    this.floorTex.colorSpace = THREE.SRGBColorSpace;

    const GLOW = ['neon', 'pantalla', 'salida', 'botella', 'letrero'];
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const s = o.material;
      if (o.name === 'pista') o.material = new THREE.MeshBasicMaterial({ map: this.floorTex });
      else if (GLOW.some((g) => o.name.startsWith(g))) o.material = new THREE.MeshBasicMaterial({ color: s.color });
      else o.material = new THREE.MeshLambertMaterial({ color: s.color, map: s.map, side: s.side });
      if (o.name === 'pantalla') this.screen = o;
      // la cámara mira desde arriba: lo que cuelga del techo estorba
      if (['viga', 'bola', 'cadena'].includes(o.name)) o.visible = false;
      if (s.map) s.map.anisotropy = 4;
    });
    scene.add(gltf.scene);

    // Pista de juego: rectángulo con borde de neón
    const cx = L.start[0], cz = L.start[1];
    this.A = [cx - ARENA.w / 2, cz - ARENA.d / 2, cx + ARENA.w / 2, cz + ARENA.d / 2];
    this.cx = cx; this.cz = cz;
    this.neon = new THREE.MeshBasicMaterial({ color: 0xff3fa4 });
    for (const [x, z, w, d] of [[cx, this.A[1], ARENA.w + 0.3, 0.15], [cx, this.A[3], ARENA.w + 0.3, 0.15], [this.A[0], cz, 0.15, ARENA.d + 0.3], [this.A[2], cz, 0.15, ARENA.d + 0.3]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), this.neon);
      b.position.set(x, 0.07, z);
      scene.add(b);
    }

    const blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
    const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const addBlob = (m) => {
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.scale.setScalar(1.2); blob.position.y = 0.05; blob.renderOrder = 1;
      m.root.add(blob);
    };
    this.isa = new Mii(tIsa, { id: 'isa' });
    this.yo = new Mii(tYo, { id: 'yo' });
    for (const m of [this.isa, this.yo]) { addBlob(m); scene.add(m.root); }

    const ringGeo = new THREE.RingGeometry(0.42, 0.56, 32).rotateX(-Math.PI / 2);
    const mkRing = (color) => {
      const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
      r.position.y = 0.08; r.renderOrder = 2;
      scene.add(r);
      return r;
    };
    this.ring = mkRing(0xff8fc0);     // bajo la Isa
    this.pickRing = mkRing(0xfff27a); // bajo la persona que hay que recoger

    // La gente: esqueletos compartidos (caminando en la fila, bailando alrededor, parados al chocar)
    this.rigs = {
      walk: new SharedRig(tR1, 'walk', 0),
      idle: new SharedRig(tR1, 'idle', 0),
      dance: [new SharedRig(tR1, 'dance', 0), new SharedRig(tR2, 'dance', 0.5), new SharedRig(tR1, 'dance2', 0), new SharedRig(tR2, 'dance2', 0.5)],
    };
    this.allRigs = [this.rigs.walk, this.rigs.idle, ...this.rigs.dance];
    const mk = (i) => {
      const m = new Mii(i % 2 ? tR2 : tR1, { shared: this.rigs.idle, shirt: randomShirt(), pants: randomPants() });
      addBlob(m);
      scene.add(m.root);
      return m;
    };
    this.pool = Array.from({ length: POOL }, (_, i) => mk(i));

    // Público bailando alrededor de la pista (el lado de la cámara queda más lejos para no tapar)
    const [x0, z0, x1, z1] = this.A;
    const spots = [];
    for (let x = x0 - 1; x <= x1 + 1; x += 1.45) { spots.push([x, z0 - 1.2]); spots.push([x + 0.7, z0 - 2.5]); spots.push([x, z1 + 2.1]); }
    for (let z = z0; z <= z1; z += 1.45) { spots.push([x0 - 1.2, z]); spots.push([x0 - 2.6, z + 0.7]); spots.push([x1 + 1.2, z]); spots.push([x1 + 2.6, z + 0.7]); }
    spots.forEach(([x, z], i) => {
      const m = mk(i);
      m.setShared(pick(this.rigs.dance));
      m.position.set(x + rand(-0.2, 0.2), 0, z + rand(-0.2, 0.2));
      m.setHeading(Math.atan2(cx - x, cz - z) + rand(-0.5, 0.5));
    });
    const dj = mk(1);
    dj.setShared(this.rigs.dance[0]);
    dj.position.set(0, L.stageH, 0.6);

    this._buildParts(30);
    this.beat = 0; this.beatT = 0;
    this._paintFloor();
    this.reset();
  }

  // ───────────── Reinicio ─────────────
  reset() {
    this.baseReset();
    const { cx, cz } = this;
    this.dir = { x: 1, z: 0 };
    this.next = null;
    this.sinceTurn = 9;
    this.speed = VEL.ini;
    this.acc = 0;
    this.stepAcc = 0;
    for (const m of this.pool) { m.root.visible = false; m.root.scale.setScalar(m.scale); }
    this.free = [...this.pool];
    this.train = [{ m: this.yo }];
    this.pickup = null;

    const p = this.isa;
    p.position.set(cx - 3, 0, cz);
    p.setHeading(Math.PI / 2);
    p.play('idle', 0);
    this.yo.play('idle', 0);
    // camino ya recorrido (hacia atrás), para que la fila tenga dónde pararse desde el principio
    this.path = [];
    for (let i = 0; i < 40; i++) this.path.push({ x: p.position.x - i * PASO, z: cz });
    this._placeTrain();
    this._spawn();

    this.camRate = 4;
    this._shot(cx, 14.5, cz + 12.5, cx, 0, cz - 0.6);
    this._placeCamera(0, true);
    p.update(0); this.yo.update(0);
    this.neon.color.set(0xff3fa4);
  }

  async _play() {
    const run = this.run;
    this.hudEl.classList.remove('hidden');
    this.scoreEl.textContent = this.train.length;
    this.score = this.train.length;
    await this._banner(TITULO, 2.2);
    if (run !== this.run) return;
    if (!(await this._count(run))) return;
    this.isa.play('walk', 0.15);
    this.yo.play('walk', 0.15);
    this.state = 'play';
  }

  // flechas: doblar (no se puede dar media vuelta)
  pressDir(dx, dz) {
    if (this.state !== 'play' && this.state !== 'ready') return;
    const cur = this.next ?? this.dir;
    if (dx === -cur.x && dz === -cur.z) return;
    if (dx === this.dir.x && dz === this.dir.z) { this.next = null; return; }
    if (dx === -this.dir.x && dz === -this.dir.z) return;
    this.next = { x: dx, z: dz };
  }

  // ───────────── Juego ─────────────
  _move(dt) {
    const p = this.isa, pos = p.position;
    const step = this.speed * dt;
    this.sinceTurn += step;
    if (this.next && this.sinceTurn >= GIRO_MIN) {
      this.dir = this.next;
      this.next = null;
      this.sinceTurn = 0;
      this.audio.play('tick');
    }
    const d = this.dir;
    pos.x += d.x * step; pos.z += d.z * step;
    p.turnToward(Math.atan2(d.x, d.z), dt, 18);
    const cyc = this.speed / WALK_CYCLE_SPEED;
    p.setSpeed(cyc * 0.8); this.yo.setSpeed(cyc * 0.8);
    this.stepAcc += dt * cyc;
    if (this.stepAcc > 0.31) { this.stepAcc = 0; this.audio.play('step'); }

    this.acc += step;
    while (this.acc >= PASO) {
      this.acc -= PASO;
      this.path.unshift({ x: pos.x - d.x * this.acc, z: pos.z - d.z * this.acc });
    }
    const keep = Math.ceil(((this.train.length + 3) * GAP) / PASO) + 4;
    if (this.path.length > keep) this.path.length = keep;
    this._placeTrain(dt);

    // choques: borde de la pista y la propia fila
    const [x0, z0, x1, z1] = this.A;
    if (pos.x < x0 + 0.4 || pos.x > x1 - 0.4 || pos.z < z0 + 0.4 || pos.z > z1 - 0.4) { this._crash('borde'); return; }
    for (let i = 2; i < this.train.length; i++) {
      const q = this.train[i].m.position;
      if (Math.hypot(q.x - pos.x, q.z - pos.z) < R_CHOQUE) { this._crash('fila'); return; }
    }
    const k = this.pickup;
    if (k && Math.hypot(k.position.x - pos.x, k.position.z - pos.z) < R_RECOGER) this._join(k);
  }

  // cada persona va a (i + 1) · GAP metros detrás de la Isa, siguiendo su mismo camino
  _placeTrain(dt = 0) {
    const path = this.path, last = path.length - 1;
    this.train.forEach((t, i) => {
      const f = Math.max(0, ((i + 1) * GAP - this.acc) / PASO);
      const i0 = Math.min(last, Math.floor(f)), i1 = Math.min(last, i0 + 1), u = f - Math.floor(f);
      const a = path[i0], b = path[i1];
      const m = t.m;
      m.position.set(a.x + (b.x - a.x) * u, 0, a.z + (b.z - a.z) * u);
      if (i0 !== i1) {
        const h = Math.atan2(a.x - b.x, a.z - b.z);
        if (dt) m.turnToward(h, dt, 14); else m.setHeading(h);
      }
      if (t.grow != null && t.grow < 1) { // recién llegada: aparece creciendo al final de la fila
        t.grow = Math.min(1, t.grow + dt * 4);
        m.root.scale.setScalar(m.scale * t.grow);
      }
    });
  }

  _spawn() {
    const m = this.free.pop();
    this.pickup = m ?? null;
    if (!m) { this.pickRing.visible = false; return; }
    const [x0, z0, x1, z1] = this.A;
    const hp = this.isa.position;
    let x = this.cx, z = this.cz;
    for (let tries = 0; tries < 80; tries++) {
      x = rand(x0 + 1.2, x1 - 1.2); z = rand(z0 + 1.2, z1 - 1.2);
      if (Math.hypot(x - hp.x, z - hp.z) < 3.2) continue;
      // no justo delante de la Isa (sería gratis) ni encima de la fila
      if (this.train.some((t) => Math.hypot(t.m.position.x - x, t.m.position.z - z) < 1.2)) continue;
      break;
    }
    m.setColors(randomShirt(), randomPants());
    m.setShared(pick(this.rigs.dance));
    m.root.scale.setScalar(m.scale);
    m.position.set(x, 0, z);
    m.setHeading(rand(0, TAU));
    m.root.visible = true;
    this.pickRing.position.set(x, 0.08, z);
    this.pickRing.visible = true;
  }

  _join(m) {
    m.setShared(this.rigs.walk);
    m.root.scale.setScalar(0.01);
    this.train.push({ m, grow: 0 });
    this.speed = Math.min(VEL.max, this.speed + VEL.sube);
    this.setScore(this.train.length);
    this.audio.play(this.train.length % 5 === 0 ? 'yay' : 'hit');
    const p = this.isa.position;
    this._burst(p.x, 1.6, p.z, { n: 8, kind: 'star', color: 0xfff27a, spread: 1.4, size: 0.4 });
    this._spawn();
  }

  _crash(why) {
    const run = this.run;
    this.state = 'over';
    this.audio.play('miss');
    this.audio.play('crunch');
    this.shake = 0.5;
    this.neon.color.set(why === 'borde' ? 0xff2a2a : 0xff3fa4);
    this.isa.play('dizzy', 0.15);
    this.yo.play('idle', 0.2);
    for (const t of this.train) if (t.m !== this.yo) t.m.setShared(this.rigs.idle);
    const p = this.isa.position;
    this._burst(p.x, 1.4, p.z, { n: 12, kind: 'star', color: 0xffffff, spread: 2, size: 0.4 });
    const n = this.train.length;
    this._gameOver(run, {
      icon: '💃',
      title: why === 'borde' ? '¡Se salió de la pista!' : '¡Chocó el trencito!',
      text: `Trencito de ${n} ${n === 1 ? 'persona' : 'personas'}`,
    });
  }

  // ───────────── Bucle ─────────────
  update(dt) {
    this.baseUpdate(dt);
    for (const r of this.allRigs) r.update(dt);
    this._animateDisco(dt);
    if (this.state === 'play') this._move(dt);
    this.isa.update(dt);
    this.yo.update(dt);
    const pulse = 1 + 0.1 * Math.sin(this.time * TAU / BEAT);
    this.ring.position.x = this.isa.position.x;
    this.ring.position.z = this.isa.position.z;
    this.pickRing.scale.setScalar(pulse * 1.15);
    this._placeCamera(dt);
  }

  _animateDisco(dt) {
    const t = this.time;
    this.beatT += dt;
    if (this.beatT >= BEAT) {
      this.beatT -= BEAT;
      this.beat++;
      this._paintFloor();
      if (this.screen) this.screen.material.color.setHSL((this.beat * 0.13) % 1, 0.8, 0.55);
    }
    const [fx0, fz0, fx1, fz1] = this.L.floor;
    this.movers.forEach((l, k) => {
      l.position.set((fx0 + fx1) / 2 + Math.cos(t * 0.55 + k * 2.1) * (fx1 - fx0) * 0.38, 3.4, (fz0 + fz1) / 2 + Math.sin(t * 0.7 + k * 2.1) * (fz1 - fz0) * 0.38);
      l.intensity = 7 + 4 * Math.max(0, 1 - this.beatT / BEAT * 2);
    });
  }

  // baldosas al ritmo, más apagadas que en el capítulo 3 para que la fila se distinga
  _paintFloor() {
    const [W, H] = this.L.tiles;
    const g = this.floorCanvas.getContext('2d');
    g.fillStyle = '#120d18';
    g.fillRect(0, 0, W * 8, H * 8);
    const b = this.beat, mode = Math.floor(b / 8) % 3;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      let c = null;
      if (mode === 0) c = (i + j + b) % 2 ? FLOOR_COLORS[(Math.floor(b / 2)) % 6] : null;
      else if (mode === 1) { const r = Math.floor(Math.hypot(i - W / 2 + 0.5, j - H / 2 + 0.5)); c = ((r - b) % 3 + 3) % 3 === 0 ? FLOOR_COLORS[(r + 6) % 6] : null; }
      else { const k = ((i - j + b) % 4 + 4) % 4; c = k < 2 ? FLOOR_COLORS[(k + Math.floor(b / 4)) % 6] : null; }
      if (!c) continue;
      g.globalAlpha = 0.42;
      g.fillStyle = c;
      g.fillRect(i * 8 + 1, j * 8 + 1, 6, 6);
    }
    g.globalAlpha = 1;
    this.floorTex.needsUpdate = true;
  }
}
