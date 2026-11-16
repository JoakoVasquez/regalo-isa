// Capítulo 3 · La pista de baile
// Disco modelada en Blender (tools/build_disco.py → assets/escenarios/disco.glb).
// Joaco e Isa están bailando en medio de la pista y a Joaco le baja el mareo. Juegas como Joaco:
// hay que salir de la pista repleta (y cruzar el trencito) hasta el sillón del fondo, con la Isa
// siguiéndote. Cada choque sube el MAREO; si llega al máximo, pierdes. En el sillón empieza la escena
// con el señor de la disco (assets/miis/hombre_disco.glb).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';
import { loadTemplate, Mii, SharedRig, randomShirt, randomPants } from './mii.js';
import * as D from './mision3_dialogos.js';

const SENOR_FILE = 'assets/miis/hombre_disco.glb';
const N_DANCERS = 150;         // gente bailando en la pista
const N_CONGA = 7;             // largo de cada trencito (hay dos: uno por dentro y otro por fuera)
const WALK_SPEED = 2.6;        // Joaco anda mareado: un poco más lento que en el capítulo 2
const WALK_CYCLE_SPEED = 1.65;
const CAM_DIST = 5.6;
const R_PLAYER = 0.3;
const MAREO_START = 25;        // de 0 a 100
const MAREO_RATE = 1.5;        // por segundo en la pista (afuera, la mitad)
const MAREO_BUMP = 11;         // por choque con alguien bailando
const MAREO_CONGA = 16;        // por choque con el trencito
const BEAT = 0.5;              // 120 bpm
const TAU = Math.PI * 2;

const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ease = (t) => t * t * (3 - 2 * t);
const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
const inRect = (x, z, r, m = 0) => x > r[0] - m && x < r[2] + m && z > r[1] - m && z < r[3] + m;

const FLOOR_COLORS = ['#ff3fa4', '#3fd0ff', '#ffd93a', '#8a4cff', '#3dff95', '#ff7a2f'];

function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Mission3 {
  constructor({ audio, dialogue, onEnd }) {
    this.audio = audio;
    this.dialogue = dialogue;
    this.onEnd = onEnd;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.2, 200);
    this.hint = D.AYUDA;
    this.promptEl = $('#prompt');
    this.promptText = $('#promptText');
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camGoalPos = new THREE.Vector3();
    this.camGoalLook = new THREE.Vector3();
    this.camYaw = this.camYawGoal = Math.PI;
    this.tasks = [];
    this.time = 0;
    this.run = 0;
  }

  // ───────────── Carga ─────────────
  async load() {
    const ch = CONFIG.characters;
    const [L, gltf, tIsa, tYo, tR1, tR2, tSenor] = await Promise.all([
      fetch('assets/escenarios/disco.json').then((r) => r.json()),
      new GLTFLoader().loadAsync('assets/escenarios/disco.glb'),
      loadTemplate(ch.isa.file), loadTemplate(ch.yo.file), loadTemplate(ch.random1.file), loadTemplate(ch.random2.file),
      loadTemplate(SENOR_FILE),
    ]);
    this.L = L;
    const scene = this.scene;
    scene.background = new THREE.Color(0x07050b);

    // Luz de disco: poca luz general morada + tres focos de color que se pasean sobre la pista
    scene.add(new THREE.HemisphereLight(0xb9a2ff, 0x2a1838, 1.5));
    const key = new THREE.DirectionalLight(0xffe6f4, 0.7);
    key.position.set(3, 10, 14);
    scene.add(key);
    this.movers = [0xff3fa4, 0x3fd0ff, 0xffd93a].map((c) => {
      const l = new THREE.PointLight(c, 10, 20, 1);
      scene.add(l);
      return l;
    });
    const lounge = new THREE.PointLight(0xff9ac8, 6, 9, 1); // luz cálida de los sillones
    lounge.position.set(L.sofaSeats[1][0], 2.6, L.sofaSeats[1][1] - 2.4);
    scene.add(lounge);

    // Pista: textura de baldosas que cambia con el ritmo
    this.floorCanvas = document.createElement('canvas');
    this.floorCanvas.width = L.tiles[0] * 8;
    this.floorCanvas.height = L.tiles[1] * 8;
    this.floorTex = new THREE.CanvasTexture(this.floorCanvas);
    this.floorTex.colorSpace = THREE.SRGBColorSpace;

    // vigas y bola: se esconden cuando la cámara sube por sobre el techo (el techo ya es invisible desde arriba)
    this.ceilingProps = [];
    const GLOW = ['neon', 'pantalla', 'salida', 'botella', 'letrero'];
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const s = o.material;
      if (o.name === 'pista') o.material = new THREE.MeshBasicMaterial({ map: this.floorTex });
      else if (o.name === 'bola') {
        o.material = new THREE.MeshPhongMaterial({ color: 0xcfd6df, flatShading: true, shininess: 140, specular: 0xffffff, emissive: 0x1a1a26 });
        const [bx, by, bz] = L.ball;
        o.geometry.translate(-bx, -by, -bz); // que gire sobre sí misma
        o.position.set(bx, by, bz);
        this.ball = o;
      } else if (GLOW.some((g) => o.name.startsWith(g))) o.material = new THREE.MeshBasicMaterial({ color: s.color });
      else o.material = new THREE.MeshLambertMaterial({ color: s.color, map: s.map, side: s.side });
      if (o.name === 'pantalla') this.screen = o;
      if (['viga', 'bola', 'cadena'].includes(o.name)) this.ceilingProps.push(o);
      if (s.map) s.map.anisotropy = 4;
    });
    scene.add(gltf.scene);

    // Haces de luz que barren la pista desde el techo
    const [bfx0, bfz0, bfx1, bfz1] = L.floor, bcx = (bfx0 + bfx1) / 2, bw = (bfx1 - bfx0) / 2;
    this.beams = [[bcx - bw * 0.65, bfz0 + 2.5, 0xff3fa4], [bcx + bw * 0.65, bfz0 + 2.5, 0x3fd0ff], [bcx, (bfz0 + bfz1) / 2, 0xffd93a],
      [bcx - bw * 0.55, bfz1 - 2.5, 0x8a4cff], [bcx + bw * 0.55, bfz1 - 2.5, 0x3dff95]].map(([x, z, c], i) => {
      const g = new THREE.ConeGeometry(1.25, 6.2, 20, 1, true).translate(0, -3.1, 0);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color: c, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      m.position.set(x, L.height - 0.1, z);
      m.userData.ph = i * 1.7;
      scene.add(m);
      return m;
    });

    // Choques: cajas y círculos fijos
    this.obsRects = [L.stage, L.bar, L.sofa, L.sofa2, L.table,
      ...L.speakers.map(([x, z]) => [x - 0.7, z - 0.6, x + 0.7, z + 0.6])];
    this.obsCircles = L.stools.map(([x, z]) => ({ x, z, r: 0.3 }));

    this.blobMat = new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, depthWrite: false });
    this.blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

    // Joaco, Isa y el señor: Miis completos (con su propio esqueleto)
    this.isa = new Mii(tIsa, { id: 'isa' });
    this.yo = new Mii(tYo, { id: 'yo' });
    this.senor = new Mii(tSenor, { id: 'disco' });
    for (const m of [this.isa, this.yo, this.senor]) {
      const blob = new THREE.Mesh(this.blobGeo, this.blobMat);
      blob.scale.setScalar(1.2); blob.position.y = 0.05; blob.renderOrder = 1;
      m.root.add(blob);
      scene.add(m.root);
    }
    // aro brillante bajo Joaco, para no perderlo entre tanta gente
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.55, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.ring.position.y = 0.06;
    this.ring.renderOrder = 2;
    scene.add(this.ring);

    // La multitud: cuelga de esqueletos compartidos (bailando al ritmo, caminando o parada)
    this.rigs = {
      dance: [new SharedRig(tR1, 'dance', 0), new SharedRig(tR2, 'dance', 0.5)],
      dance2: [new SharedRig(tR1, 'dance2', 0), new SharedRig(tR2, 'dance2', 0.5)],
      walk: [new SharedRig(tR1, 'walk', 0)],
      idle: [new SharedRig(tR1, 'idle', 0), new SharedRig(tR2, 'idle', 1.4)],
    };
    this.allRigs = Object.values(this.rigs).flat();
    this.pool = [];
    for (let i = 0; i < N_DANCERS + N_CONGA * 2 + 8; i++) {
      const m = new Mii(i % 2 ? tR2 : tR1, { shared: this.rigs.idle[0], shirt: randomShirt(), pants: randomPants() });
      this.pool.push(m);
      scene.add(m.root);
    }

    this.reset();
  }

  // ───────────── Reparto de la multitud (distinto cada vez) ─────────────
  _congaPoint(c, th) {
    return { x: c.cx + Math.sin(th) * c.rx, z: c.cz + Math.cos(th) * c.rz };
  }

  _arrange() {
    const L = this.L;
    const [fx0, fz0, fx1, fz1] = L.floor;
    let pi = 0;
    const take = (rig, x, z, y = 0) => {
      const m = this.pool[pi++];
      m.root.visible = true;
      m.setColors(randomShirt(), randomPants());
      m.scale = m.template.scale * rand(0.92, 1.06);
      m.root.scale.setScalar(m.scale);
      m.setShared(rig);
      m.position.set(x, y, z);
      m.model.position.y = 0;
      return m;
    };
    this.crowd = [];

    // dos trencitos alrededor del centro de la pista: uno chico por dentro y uno grande por fuera,
    // girando al revés (hay que cruzar los dos para salir)
    const ccx = L.start[0] + 0.5, ccz = L.start[1];
    this.congas = [
      { cx: ccx, cz: ccz, rx: 4.6, rz: 3.4, th: rand(0, TAU), w: -0.36 },
      { cx: ccx, cz: ccz, rx: 9.0, rz: 6.6, th: rand(0, TAU), w: 0.2 },
    ];
    const ring = [];
    for (const c of this.congas) {
      c.gap = 0.85 / ((c.rx + c.rz) / 2);
      for (let k = 0; k < 96; k++) ring.push(this._congaPoint(c, (k / 96) * TAU));
      for (let i = 0; i < N_CONGA; i++) {
        const m = take(this.rigs.walk[0], 0, 0);
        this.crowd.push({ m, type: 'conga', line: c, i, x: 0, z: 0, r: 0.36 });
      }
    }

    // gente bailando: puntos al azar con separación mínima, lejos del trencito y de Joaco e Isa
    const cx = L.start[0] + 0.55, cz = L.start[1];
    const pts = [];
    for (let tries = 0; pts.length < N_DANCERS && tries < 20000; tries++) {
      const x = rand(fx0 + 0.45, fx1 - 0.45), z = rand(fz0 + 0.45, fz1 - 0.45);
      if (Math.hypot(x - cx, z - cz) < 2.2) continue;
      if (Math.abs(x - cx) < 1.5 && z < cz && z > cz - 3.4) continue; // despejado hacia la cámara de la intro
      if (ring.some((p) => Math.hypot(p.x - x, p.z - z) < 0.95)) continue;
      if (pts.some((p) => Math.hypot(p.x - x, p.z - z) < 1.22)) continue;
      pts.push({ x, z });
    }
    for (const p of pts) {
      const rig = pick(Math.random() < 0.55 ? this.rigs.dance : this.rigs.dance2);
      const m = take(rig, p.x, p.z);
      const face = Math.atan2(cx - p.x, cz - p.z) + rand(-1.2, 1.2); // más o menos hacia el centro
      this.crowd.push({ m, type: 'dance', hx: p.x, hz: p.z, x: p.x, z: p.z, r: 0.36, face, ph: rand(0, TAU), amp: rand(0.08, 0.2), f: rand(0.5, 1.1) });
    }

    // DJ en el escenario
    const dj = take(this.rigs.dance[0], 0, 0.6, L.stageH);
    dj.setHeading(0);

    // un par de grupitos conversando (barra y camino a los sillones)
    for (const [x, z, h] of [[-13.6, 10.4, -1.6], [-13.6, 16.6, -1.4], [-12.9, 16.0, -2.4], [8.6, 25.2, 2.2], [9.6, 25.6, -2.0], [9.0, 26.4, 3.1]]) {
      const m = take(pick(this.rigs.idle), x, z);
      m.setHeading(h);
      this.crowd.push({ m, type: 'idle', x, z, r: 0.36 });
    }
    for (; pi < this.pool.length; pi++) this.pool[pi].root.visible = false;
    this._updateCrowd(0);
  }

  _updateCrowd(dt) {
    for (const c of this.congas) c.th += c.w * dt;
    const t = this.time;
    for (const d of this.crowd) {
      if (d.type === 'dance') {
        // vuelven de a poco a su lugar si alguien los empujó
        d.x = d.hx + Math.sin(t * d.f + d.ph) * d.amp;
        d.z = d.hz + Math.cos(t * d.f * 0.8 + d.ph) * d.amp;
        d.m.position.set(d.x, 0, d.z);
        d.m.setHeading(d.face + Math.sin(t * d.f * 0.7 + d.ph) * 0.5);
      } else if (d.type === 'conga') {
        const c = d.line, s = Math.sign(c.w);
        const th = c.th - s * d.i * c.gap;
        const p = this._congaPoint(c, th);
        d.x = p.x; d.z = p.z;
        d.m.position.set(p.x, 0, p.z);
        d.m.setHeading(Math.atan2(s * Math.cos(th) * c.rx, -s * Math.sin(th) * c.rz));
      }
    }
  }

  // ───────────── Reinicio ─────────────
  reset() {
    this.run++;
    this.tasks = [];
    this.state = 'intro'; // 'intro' | 'play' | 'scene' | 'dying' | 'done'
    this.introT = 0;
    this.introStarted = false;
    this.camMode = 'goal';
    this.camRate = 5;
    this.fovGoal = 40;
    this.camYaw = this.camYawGoal = Math.PI;
    this.mareo = MAREO_START;
    this.bumpCd = 0;
    this.shake = 0;
    this.knock = { x: 0, z: 0 };
    this.stepAcc = 0;
    this.beat = 0;
    this.beatT = 0;
    this.bubbleT = 0;
    this.trail = [];
    this.target = null;
    this._arrange();

    const L = this.L;
    const [sx, sz] = L.start;
    const p = this.yo, isa = this.isa, s = this.senor;
    for (const m of [p, isa, s]) { m.talking = false; m.model.position.y = 0; }
    p.position.set(sx, 0, sz);
    p.setHeading(Math.PI / 2 + 0.45); // frente a frente, un poco girados hacia la cámara
    p.play('dance', 0);
    isa.position.set(sx + 1.1, 0, sz);
    isa.setHeading(-Math.PI / 2 - 0.45);
    isa.play('dance2', 0);
    s.position.set(L.stranger[0], 0, L.stranger[1]);
    s.setHeading(-Math.PI / 2 - 0.5);
    s.play('idle', 0);

    // cámara de cerca a los dos bailando
    // cámara alta, desde el lado del DJ, mirando a los dos bailar
    this.camGoalPos.set(sx + 0.55, 3.3, sz - 3.4);
    this.camGoalLook.set(sx + 0.55, 0.55, sz + 0.3);
    this.camera.fov = this.fovGoal;
    this.camera.updateProjectionMatrix();
    this._paintFloor();
    this.promptEl.classList.add('hidden');
    this._placeCamera(0, true);
    for (const m of [p, isa, s]) m.update(0);

    $('#mareo').classList.add('hidden');
    $('#nausea').style.opacity = 0;
    $('#bubble').classList.add('hidden');
    $('#objective').classList.remove('show');
  }

  exit() {
    this.run++;
    $('#mareo').classList.add('hidden');
    $('#nausea').style.opacity = 0;
    $('#bubble').classList.add('hidden');
    $('#objective').classList.remove('show');
  }

  // ───────────── Tareas por frame (se congelan con la pausa) ─────────────
  _task(step) { return new Promise((res) => this.tasks.push({ step, res })); }
  _sleep(s) { let t = 0; return this._task((dt) => (t += dt) >= s); }
  _tween(dur, fn) { let t = 0; return this._task((dt) => { t = Math.min(1, t + dt / dur); fn(ease(t)); return t >= 1; }); }
  _walk(m, points, sp = 2.2) {
    let i = 0;
    return this._task((dt) => {
      const g = points[i];
      if (!g) return true;
      const dx = g.x - m.position.x, dz = g.z - m.position.z, d = Math.hypot(dx, dz);
      const step = sp * dt;
      if (d <= step) {
        m.position.x = g.x; m.position.z = g.z;
        if (++i >= points.length) { m.play('idle', 0.2); return true; }
        return false;
      }
      m.position.x += (dx / d) * step;
      m.position.z += (dz / d) * step;
      m.turnToward(Math.atan2(dx, dz), dt, 10);
      m.play('walk', 0.15);
      m.setSpeed(sp / WALK_CYCLE_SPEED);
      return false;
    });
  }
  _turn(m, h, dur = 0.35) {
    const h0 = m.heading, dh = wrap(h - h0);
    return this._tween(dur, (t) => m.setHeading(h0 + dh * t));
  }

  rotateCamera(d) {
    if (this.state === 'play') this.camYawGoal += d;
  }

  pressA() {
    if (this.state === 'play' && this.target) this.sitDown();
  }

  _hooks() {
    return {
      onTyping: (who, on) => {
        if (who === 'yo' || who === 'ambos') this.yo.talking = on;
        if (who === 'isa' || who === 'ambos') this.isa.talking = on;
        if (who === 'disco') this.senor.talking = on;
      },
    };
  }
  _quiet() { this.yo.talking = this.isa.talking = this.senor.talking = false; }

  // ───────────── Intro: bailando, y a Joaco le baja el mareo ─────────────
  async _intro() {
    const run = this.run;
    this.dialogue.speakers.disco = D.SENOR;
    this.dialogue.speakers.ambos = D.AMBOS;
    const p = this.yo, isa = this.isa;
    await this._sleep(1.2);
    if (run !== this.run) return;
    p.play('dizzy', 0.5);
    this.audio.play('dizzy');
    await this._sleep(0.9);
    if (run !== this.run) return;
    await this.dialogue.play(D.INTRO.slice(0, 2), this._hooks());
    if (run !== this.run) return;
    isa.play('idle', 0.4);
    await this.dialogue.play(D.INTRO.slice(2), this._hooks());
    if (run !== this.run) return;
    this._quiet();

    // a jugar: la cámara se pone detrás de Joaco, mirando hacia los sillones
    this.state = 'play';
    this.camMode = 'follow';
    this.fovGoal = 42;
    $('#mareo').classList.remove('hidden');
    $('#mareoLabel').textContent = D.MAREO;
    const obj = $('#objective');
    obj.innerHTML = D.OBJETIVO;
    obj.classList.remove('show'); void obj.offsetWidth; obj.classList.add('show');
  }

  // ───────────── Choques y mareo ─────────────
  _bump(d, nx, nz) {
    const conga = d.type === 'conga';
    this.mareo = Math.min(100, this.mareo + (conga ? MAREO_CONGA : MAREO_BUMP));
    this.bumpCd = 0.8;
    this.shake = conga ? 0.5 : 0.3;
    const k = conga ? 3.2 : 2.2;
    this.knock.x = nx * k; this.knock.z = nz * k;
    if (d.type === 'dance') { // se corre un poquito (así la pista nunca queda cerrada del todo)
      d.hx -= nx * 0.3; d.hz -= nz * 0.3;
    }
    this.audio.play('bump');
    const el = $('#mareo');
    el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
    this._say(D.choque());
  }

  _say(text) {
    const b = $('#bubble');
    b.innerHTML = text.replace(/\*(.+?)\*/g, '$1');
    b.classList.remove('hidden');
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    this.bubbleT = 1.4;
  }

  _paintMareo() {
    const m = this.mareo;
    $('#mareoBar i').style.width = m.toFixed(1) + '%';
    $('#mareoFace').textContent = m < 35 ? '😐' : m < 60 ? '😣' : m < 82 ? '🤢' : '😵';
    $('#nausea').style.opacity = (Math.max(0, m - 30) / 70 * 0.7).toFixed(3);
  }

  async _faint() {
    const run = this.run;
    this.state = 'dying';
    this.promptEl.classList.add('hidden');
    const p = this.yo, isa = this.isa;
    p.play('dizzy', 0.2);
    isa.play('idle', 0.2);
    this.audio.play('dizzy');
    this.camMode = 'goal';
    this.camRate = 2;
    this.fovGoal = 34;
    this.camGoalPos.set(p.position.x, 3.2, p.position.z - 4.2);
    this.camGoalLook.set(p.position.x, 0.8, p.position.z);
    const h0 = p.heading;
    await this._tween(1.6, (t) => p.setHeading(h0 + t * TAU * 1.5));
    if (run !== this.run) return;
    await this.dialogue.play(D.DESMAYO.slice(0, 1), this._hooks());
    if (run !== this.run) return;
    // se sienta en el suelo
    this.audio.play('sit');
    p.play('sit', 0.3);
    const y0 = p.position.y;
    await this._tween(0.4, (t) => { p.position.y = y0 - 0.22 * p.scale * t; });
    isa.faceToward(p.position, 1, 1);
    await this.dialogue.play(D.DESMAYO.slice(1), this._hooks());
    if (run !== this.run) return;
    this._quiet();
    this.state = 'done';
    this.audio.stopMusic();
    this.audio.play('fail');
    this.onEnd({ win: false, ...D.PERDER });
  }

  // ───────────── El sillón y la escena del señor ─────────────
  _seatFront(i) { const s = this.L.sofaSeats[i]; return { x: s[0], z: s[1] - 1.0 }; }
  _sitPos(m, i) {
    const s = this.L.sofaSeats[i];
    return new THREE.Vector3(s[0], this.L.sofaSeatH - 0.22 * m.scale, s[1] - 0.12);
  }
  // camino hasta el frente de un asiento, rodeando la mesita de centro
  _route(pos, goal) {
    const [tx0, , tx1, tz1] = this.L.table;
    const pts = [];
    if (pos.z < tz1 + 0.25) {
      const inside = pos.x > tx0 - 0.4 && pos.x < tx1 + 0.4;
      const sx = inside ? (pos.x < (tx0 + tx1) / 2 ? tx0 - 0.6 : tx1 + 0.6) : pos.x;
      if (inside) pts.push({ x: sx, z: pos.z });
      pts.push({ x: sx, z: goal.z });
    }
    pts.push(goal);
    return pts;
  }
  async _sitOn(m, i) {
    await this._walk(m, this._route(m.position, this._seatFront(i)), m === this.senor ? 1.6 : 2.2);
    this.audio.play('sit');
    m.play('sit', 0.3);
    const from = m.position.clone(), to = this._sitPos(m, i);
    const h0 = m.heading, dh = wrap(Math.PI - h0);
    await this._tween(0.45, (t) => { m.position.lerpVectors(from, to, t); m.setHeading(h0 + dh * t); });
  }

  async sitDown() {
    const run = this.run;
    this.state = 'scene';
    this.promptEl.classList.add('hidden');
    $('#bubble').classList.add('hidden');
    const p = this.yo, isa = this.isa, s = this.senor;
    const [, , , sz1] = this.L.sofa;
    const cx = this.L.sofaSeats[1][0];

    // cámara de frente al sillón
    this.camMode = 'goal';
    this.camRate = 2.5;
    this.fovGoal = 40;
    this.camGoalPos.set(cx, 2.0, sz1 - 5.0);
    this.camGoalLook.set(cx, 0.85, sz1 - 1.0);

    await Promise.all([this._sitOn(p, 1), this._sleep(0.3).then(() => this._sitOn(isa, 0))]);
    if (run !== this.run) return;
    // el mareo baja de a poco
    const m0 = this.mareo;
    this._tween(2.0, (t) => { this.mareo = m0 * (1 - t); });
    await this._sleep(0.6);
    if (run !== this.run) return;
    await this._turn(isa, Math.PI - 0.5);
    await this.dialogue.play(D.SILLON, this._hooks());
    if (run !== this.run) return;
    this._quiet();
    $('#mareo').classList.add('hidden');
    await this._turn(isa, Math.PI, 0.5);

    // llega el señor
    this.fovGoal = 44;
    await this._sitOn(s, 2);
    if (run !== this.run) return;
    await this._sleep(0.4);
    await Promise.all([this._turn(p, Math.PI - 0.55), this._turn(isa, Math.PI - 0.4), this._turn(s, Math.PI + 0.55)]);
    await this.dialogue.play(D.SENOR_LLEGA, this._hooks());
    if (run !== this.run) return;
    this._quiet();

    // se miran entre ellos y contestan los dos a la vez
    await Promise.all([this._turn(p, Math.PI + 0.6, 0.2), this._turn(isa, Math.PI - 0.6, 0.2)]);
    await this._sleep(0.25);
    await Promise.all([this._turn(p, Math.PI - 0.55, 0.15), this._turn(isa, Math.PI - 0.4, 0.15)]);
    await this.dialogue.play(D.RESPUESTA, this._hooks());
    if (run !== this.run) return;
    this._quiet();
    await this.dialogue.play(D.SENOR_FINAL, this._hooks());
    if (run !== this.run) return;
    this._quiet();

    // silencio incómodo: se miran, la cámara se acerca
    this.camRate = 1.2;
    this.fovGoal = 30;
    this.camGoalLook.set((this.L.sofaSeats[0][0] + cx) / 2, 0.95, sz1 - 1.0);
    await Promise.all([this._turn(p, Math.PI + 0.6, 0.6), this._turn(isa, Math.PI - 0.6, 0.6)]);
    this.audio.play('cricket');
    await this._sleep(1.0);
    await this.dialogue.play(D.FINAL, this._hooks());
    if (run !== this.run) return;
    this._quiet();
    await this._sleep(0.4);
    this.state = 'done';
    this.audio.play('win');
    this.onEnd({ win: true, ...D.GANAR });
  }

  // ───────────── Bucle ─────────────
  update(dt, input) {
    this.time += dt;
    for (const r of this.allRigs) r.update(dt);
    if (this.tasks.length) {
      for (const t of [...this.tasks]) if (t.step(dt)) { this.tasks.splice(this.tasks.indexOf(t), 1); t.res(); }
    }
    this._animateDisco(dt);
    this._updateCrowd(dt);

    if (this.state === 'intro') {
      this.introT += dt;
      if (this.introT > 0.5 && !this.introStarted) { this.introStarted = true; this._intro(); }
    } else this.introStarted = false;

    if (this.state === 'play') {
      this._movePlayer(dt, input);
      this._follow(dt);
      const onFloor = inRect(this.yo.position.x, this.yo.position.z, this.L.floor);
      this.mareo = Math.min(100, this.mareo + MAREO_RATE * (onFloor ? 1 : 0.5) * dt);
      if (this.mareo >= 100) this._faint();
    }
    if (this.state === 'play' || this.state === 'scene' || this.state === 'dying') this._paintMareo();

    this.yo.update(dt);
    this.isa.update(dt);
    this.senor.update(dt);
    this.ring.visible = this.state === 'play';
    this.ring.position.x = this.yo.position.x;
    this.ring.position.z = this.yo.position.z;
    this.ring.scale.setScalar(1 + 0.08 * Math.sin(this.time * TAU / BEAT));
    this._updateTarget();
    this._updateBubble(dt);
    this._placeCamera(dt);
  }

  // luces, pista, bola y haces
  _animateDisco(dt) {
    const t = this.time;
    this.beatT += dt;
    if (this.beatT >= BEAT) {
      this.beatT -= BEAT;
      this.beat++;
      this._paintFloor();
      if (this.screen) this.screen.material.color.setHSL((this.beat * 0.13) % 1, 0.8, 0.55);
    }
    this.movers.forEach((l, k) => {
      const [fx0, fz0, fx1, fz1] = this.L.floor;
      l.position.set((fx0 + fx1) / 2 + Math.cos(t * 0.55 + k * 2.1) * (fx1 - fx0) * 0.38, 3.4, (fz0 + fz1) / 2 + Math.sin(t * 0.7 + k * 2.1) * (fz1 - fz0) * 0.38);
      l.intensity = 7 + 4 * Math.max(0, 1 - this.beatT / BEAT * 2);
    });
    if (this.ball) this.ball.rotation.y = t * 0.6;
    for (const b of this.beams) {
      const ph = b.userData.ph;
      b.rotation.set(Math.sin(t * 0.8 + ph) * 0.45, 0, Math.cos(t * 0.6 + ph * 1.3) * 0.45);
    }
  }

  _paintFloor() {
    const [W, H] = this.L.tiles;
    const g = this.floorCanvas.getContext('2d');
    g.fillStyle = '#120d18';
    g.fillRect(0, 0, W * 8, H * 8);
    const b = this.beat, mode = Math.floor(b / 8) % 4;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      let c = null;
      if (mode === 0) c = (i + j + b) % 2 ? FLOOR_COLORS[(Math.floor(b / 2)) % 6] : null;
      else if (mode === 1) { const r = Math.floor(Math.hypot(i - W / 2 + 0.5, j - H / 2 + 0.5)); c = ((r - b) % 3 + 3) % 3 === 0 ? FLOOR_COLORS[(r + 6) % 6] : null; }
      else if (mode === 2) { const k = ((i - j + b) % 4 + 4) % 4; c = k < 2 ? FLOOR_COLORS[(k + Math.floor(b / 4)) % 6] : null; }
      else c = Math.random() < 0.45 ? pick(FLOOR_COLORS) : null;
      if (!c) continue;
      g.globalAlpha = 0.75;
      g.fillStyle = c;
      g.fillRect(i * 8 + 1, j * 8 + 1, 6, 6);
    }
    g.globalAlpha = 1;
    this.floorTex.needsUpdate = true;
  }

  _movePlayer(dt, input) {
    const p = this.yo;
    const mz = this.mareo / 100;
    // con el mareo, el control "se tuerce" un poco
    const yaw = this.camYaw + Math.sin(this.time * 1.1) * 0.4 * mz;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    let x = input.x * cy + input.z * sy, z = -input.x * sy + input.z * cy;
    const len = Math.hypot(x, z);
    const pos = p.position;
    if (len > 0.1) {
      x /= len; z /= len;
      pos.x += x * WALK_SPEED * dt;
      pos.z += z * WALK_SPEED * dt;
      p.turnToward(Math.atan2(x, z), dt, 12);
      p.play('walk', 0.15);
      p.setSpeed(WALK_SPEED / WALK_CYCLE_SPEED);
      this.stepAcc += dt * (WALK_SPEED / WALK_CYCLE_SPEED);
      if (this.stepAcc > 0.31) { this.stepAcc = 0; this.audio.play('step'); }
    } else {
      p.play('dizzy', 0.25);
      this.stepAcc = 0.2;
    }
    // empujón del último choque
    pos.x += this.knock.x * dt; pos.z += this.knock.z * dt;
    const kd = Math.exp(-dt * 7);
    this.knock.x *= kd; this.knock.z *= kd;

    this.bumpCd = Math.max(0, this.bumpCd - dt);
    for (const d of this.crowd) {
      const dx = pos.x - d.x, dz = pos.z - d.z, r = R_PLAYER + d.r;
      if (Math.abs(dx) > r || Math.abs(dz) > r) continue;
      const dist = Math.hypot(dx, dz);
      if (dist >= r || dist < 1e-4) continue;
      const nx = dx / dist, nz = dz / dist;
      pos.x = d.x + nx * r; pos.z = d.z + nz * r;
      if (this.bumpCd <= 0) this._bump(d, nx, nz);
    }
    // el señor (todavía de pie junto a los sillones) también estorba, pero no marea
    const sx = pos.x - this.senor.position.x, sz = pos.z - this.senor.position.z, sd = Math.hypot(sx, sz);
    if (sd < 0.68 && sd > 1e-4) { pos.x = this.senor.position.x + (sx / sd) * 0.68; pos.z = this.senor.position.z + (sz / sd) * 0.68; }
    this._collideStatic(pos, R_PLAYER);

    // rastro para que la Isa siga el mismo camino
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - pos.x, last.z - pos.z) > 0.12) {
      this.trail.push({ x: pos.x, z: pos.z });
      if (this.trail.length > 60) this.trail.shift();
    }
  }

  _collideStatic(pos, rad) {
    for (const c of this.obsCircles) {
      const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), r = c.r + rad;
      if (d < r && d > 1e-4) { pos.x = c.x + (dx / d) * r; pos.z = c.z + (dz / d) * r; }
    }
    for (const r of this.obsRects) this._pushOutRect(pos, r, rad);
    const [x0, z0, x1, z1] = this.L.room;
    pos.x = Math.min(x1 - 0.4, Math.max(x0 + 0.4, pos.x));
    pos.z = Math.min(z1 - 0.4, Math.max(z0 + 0.4, pos.z));
  }

  _pushOutRect(pos, r, m) {
    const x0 = r[0] - m, z0 = r[1] - m, x1 = r[2] + m, z1 = r[3] + m;
    if (pos.x <= x0 || pos.x >= x1 || pos.z <= z0 || pos.z >= z1) return;
    const opts = [[pos.x - x0, x0, null], [x1 - pos.x, x1, null], [pos.z - z0, null, z0], [z1 - pos.z, null, z1]];
    opts.sort((a, b) => a[0] - b[0]);
    if (opts[0][1] != null) pos.x = opts[0][1]; else pos.z = opts[0][2];
  }

  // La Isa camina detrás de Joaco por el mismo camino, a ~1 m
  _follow(dt) {
    const isa = this.isa, pos = isa.position, p = this.yo.position;
    let goal = null, acc = 0, prev = { x: p.x, z: p.z };
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const q = this.trail[i];
      acc += Math.hypot(q.x - prev.x, q.z - prev.z);
      prev = q;
      if (acc >= 1.3) { goal = q; break; }
    }
    if (!goal) { isa.faceToward(p, dt, 6); isa.play('idle', 0.25); return; }
    const dx = goal.x - pos.x, dz = goal.z - pos.z, d = Math.hypot(dx, dz);
    if (d < 0.08) { isa.faceToward(p, dt, 6); isa.play('idle', 0.25); return; }
    const sp = Math.min(3.4, d * 4);
    const step = Math.min(d, sp * dt);
    pos.x += (dx / d) * step; pos.z += (dz / d) * step;
    isa.turnToward(Math.atan2(dx, dz), dt, 10);
    if (sp > 0.6) { isa.play('walk', 0.15); isa.setSpeed(sp / WALK_CYCLE_SPEED); }
    else isa.play('idle', 0.25);
    // que no se meta dentro de nadie
    for (const c of this.crowd) {
      const ex = pos.x - c.x, ez = pos.z - c.z, e = Math.hypot(ex, ez), r = 0.6;
      if (e < r && e > 1e-4) { pos.x = c.x + (ex / e) * r; pos.z = c.z + (ez / e) * r; }
    }
    this._collideStatic(pos, 0.28);
  }

  // Cerca del sillón → cartelito "A"
  _updateTarget() {
    this.target = null;
    if (this.state !== 'play') { this.promptEl.classList.add('hidden'); return; }
    const p = this.yo.position;
    const [sx, sz] = this.L.sofaSeats[1];
    if (Math.hypot(p.x - sx, p.z - (sz - 1.0)) > 2.0) { this.promptEl.classList.add('hidden'); return; }
    this.target = true;
    const v = new THREE.Vector3(sx, 1.6, sz).project(this.camera);
    this.promptText.textContent = D.CARTEL_SENTARSE;
    this.promptEl.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px';
    this.promptEl.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
    this.promptEl.classList.remove('hidden');
  }

  _updateBubble(dt) {
    if (this.bubbleT <= 0) return;
    this.bubbleT -= dt;
    const b = $('#bubble');
    if (this.bubbleT <= 0 || this.state !== 'play') { b.classList.add('hidden'); this.bubbleT = 0; return; }
    const p = this.yo.position;
    const v = new THREE.Vector3(p.x, p.y + 2.4, p.z).project(this.camera);
    b.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px';
    b.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
  }

  _placeCamera(dt, snap = false) {
    const p = this.yo.position;
    let rate = 5;
    if (this.camMode === 'follow') {
      this.camYaw += (this.camYawGoal - this.camYaw) * (snap ? 1 : Math.min(1, dt * 10));
      this.camGoalPos.set(p.x + Math.sin(this.camYaw) * CAM_DIST, 7.6, p.z + Math.cos(this.camYaw) * CAM_DIST);
      this.camGoalLook.set(p.x, 0.9, p.z);
    } else rate = this.camRate ?? 5;
    const k = snap ? 1 : 1 - Math.exp(-dt * rate);
    if (Math.abs(this.camera.fov - this.fovGoal) > 0.01) {
      this.camera.fov += (this.fovGoal - this.camera.fov) * (snap ? 1 : 1 - Math.exp(-dt * 4));
      this.camera.updateProjectionMatrix();
    }
    this.camPos.lerp(this.camGoalPos, k);
    this.camLook.lerp(this.camGoalLook, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    const above = this.camPos.y > this.L.height - 0.7;
    for (const o of this.ceilingProps) o.visible = !above;
    for (const b of this.beams) b.visible = !above;
    // mareo: la imagen se balancea; los choques la sacuden
    this.shake = Math.max(0, this.shake - dt);
    const playing = this.state === 'play' || this.state === 'dying';
    const mz = playing ? this.mareo / 100 : 0;
    const roll = Math.sin(this.time * 1.6) * 0.06 * mz + Math.sin(this.time * 41) * 0.05 * this.shake;
    this.camera.rotateZ(roll);
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }
}
