// Capítulo 2 · El puesto de al lado
// Sala de clases en cascada (modelada en Blender: tools/build_sala.py → assets/escenarios/sala.glb).
// Juegas como Joaco. Casi todos los puestos están ocupados; quedan algunos libres. Hay que sentarse
// al lado de la Isa. Si te sientas al lado de otra persona, la saludas, te responde pesadísimo y pierdes.
// Al lado de la Isa, ella te saluda de vuelta (y bien).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';
import { loadTemplate, Mii, SharedRig, randomShirt, randomPants } from './mii.js';
import * as D from './mision2_dialogos.js';

const N_EMPTY = 14;            // puestos libres (uno de ellos al lado de la Isa)
const WALK_SPEED = 3.0;
const WALK_CYCLE_SPEED = 1.65;
const CAM_DIST = 8.5;
const TAU = Math.PI * 2;

const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ease = (t) => t * t * (3 - 2 * t);
const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };

function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(60,30,20,0.4)');
  grad.addColorStop(0.55, 'rgba(60,30,20,0.2)');
  grad.addColorStop(1, 'rgba(60,30,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Mission2 {
  constructor({ audio, dialogue, onEnd }) {
    this.audio = audio;
    this.dialogue = dialogue;
    this.onEnd = onEnd;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.2, 200);
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
  }

  // ───────────── Carga ─────────────
  async load() {
    const ch = CONFIG.characters;
    const [L, gltf, tIsa, tYo, tR1, tR2] = await Promise.all([
      fetch('assets/escenarios/sala.json').then((r) => r.json()),
      new GLTFLoader().loadAsync('assets/escenarios/sala.glb'),
      loadTemplate(ch.isa.file), loadTemplate(ch.yo.file), loadTemplate(ch.random1.file), loadTemplate(ch.random2.file),
    ]);
    this.L = L;
    const scene = this.scene;
    scene.background = new THREE.Color(0x2c2e33);

    // Luz de sala: mucho relleno cálido desde arriba + una luz suave desde la pizarra
    scene.add(new THREE.HemisphereLight(0xfff8ee, 0x9a6a58, 2.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(4, 10, -6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffeedd, 0.6);
    fill.position.set(-6, 6, 14);
    scene.add(fill);

    // Cosas pegadas a una pared o colgando del techo: se esconden cuando la cámara queda al otro
    // lado (las paredes y el techo ya son invisibles desde fuera, pero estas son cajas).
    const FRONT_PROPS = ['pizarra', 'pizarra_marco', 'telon', 'puerta', 'vidrio_puerta', 'manilla', 'marco_puerta'];
    const CEILING_PROPS = ['viga', 'luz'];
    this.frontProps = [];
    this.ceilingProps = [];
    this.sideProps = [];
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      if (FRONT_PROPS.includes(o.name)) this.frontProps.push(o);
      else if (CEILING_PROPS.includes(o.name)) this.ceilingProps.push(o);
      else if (o.name === 'marco_ventana') this.sideProps.push(o);
      const s = o.material;
      // tubos de luz y ventanas brillan solos
      const glow = o.name.startsWith('luz') || o.name.startsWith('ventana');
      o.material = glow
        ? new THREE.MeshBasicMaterial({ color: s.color })
        : new THREE.MeshLambertMaterial({ color: s.color, map: s.map, side: s.side });
      if (s.map) s.map.anisotropy = 4;
    });
    scene.add(gltf.scene);

    // piso del pasillo alrededor de la sala (si no, fuera de la sala se ve un vacío)
    const hall = new THREE.Mesh(new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6d6a66 }));
    hall.position.set(0, -0.03, 13);
    scene.add(hall);

    // Puestos: fila → bloque (4 · 8 · 4) → asiento
    this.seats = [];
    this.tableRects = [];
    for (let row = 0; row < L.rows; row++) {
      const z0 = L.front + row * L.tierDepth;
      const y = row * L.step;
      L.tables.forEach(([xs, n], ti) => {
        this.tableRects.push([xs, z0 + L.tableZ[0], xs + n * L.seatSpacing, z0 + L.tableZ[1]]);
        const list = [];
        for (let k = 0; k < n; k++) {
          const s = { row, table: ti, k, x: xs + (k + 0.5) * L.seatSpacing, z: z0 + L.seatZ, y, mii: null, empty: false, list };
          list.push(s);
          this.seats.push(s);
        }
      });
    }
    this.obsRects = [L.desk];

    this.blobMat = new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, depthWrite: false });
    this.blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

    this.isa = new Mii(tIsa, { id: 'isa' });
    this.yo = new Mii(tYo, { id: 'yo' });
    for (const m of [this.isa, this.yo]) scene.add(m.root);
    const blob = new THREE.Mesh(this.blobGeo, this.blobMat);
    blob.scale.setScalar(1.2); blob.position.y = 0.02; blob.renderOrder = 1;
    this.yo.root.add(blob);

    // compañeros sentados: cuelgan de 4 esqueletos compartidos con la animación de sentado
    this.rigs = [0, 0.9, 1.8, 2.7].map((ph, i) => new SharedRig(i % 2 ? tR2 : tR1, 'sit', ph));
    this.pool = [];
    for (let i = 0; i < this.seats.length; i++) {
      const tpl = i % 2 ? tR2 : tR1;
      const m = new Mii(tpl, { shared: this.rigs[i % 4], shirt: randomShirt(), pants: randomPants() });
      this.pool.push(m);
      scene.add(m.root);
    }

    this.reset();
  }

  _tier(z) {
    const L = this.L;
    if (z < L.front) return -1;
    return Math.min(L.rows - 1, Math.floor((z - L.front) / L.tierDepth));
  }
  _groundY(z) { return Math.max(0, this._tier(z)) * this.L.step; }

  _sitPos(mii, s) {
    // sentado mirando a la pizarra (-z); el Mii queda un poquito adelantado sobre el asiento
    return new THREE.Vector3(s.x, s.y + this.L.seatH - 0.22 * mii.scale, s.z - 0.12);
  }

  // ───────────── Reparto (distinto cada vez) ─────────────
  _arrange() {
    const seats = this.seats;
    for (const s of seats) { s.empty = false; s.mii = null; }
    const nb = (s) => [s.list[s.k - 1], s.list[s.k + 1]].filter(Boolean);

    // la Isa y el puesto libre a su lado
    const isaSeat = pick(seats);
    const target = pick(nb(isaSeat));
    target.empty = true;
    this.isaSeat = isaSeat;

    // otros puestos libres: nunca pegados a la Isa ni a otro libre (así siempre hay alguien al lado)
    const banned = new Set([isaSeat, target, ...nb(isaSeat), ...nb(target)]);
    const cands = seats.filter((s) => !banned.has(s));
    let n = 1;
    while (n < N_EMPTY && cands.length) {
      const s = cands.splice(randInt(0, cands.length - 1), 1)[0];
      if (nb(s).some((o) => o.empty)) continue;
      s.empty = true;
      n++;
    }

    let pi = 0;
    for (const s of seats) {
      if (s.empty) continue;
      if (s === isaSeat) {
        s.mii = this.isa;
        this.isa.play('sit', 0);
      } else {
        const m = this.pool[pi++];
        m.root.visible = true;
        m.setColors(randomShirt(), randomPants());
        m.scale = m.template.scale * rand(0.93, 1.05);
        m.root.scale.setScalar(m.scale);
        m.setShared(this.rigs[randInt(0, 3)]);
        s.mii = m;
      }
      const m = s.mii;
      m.position.copy(this._sitPos(m, s));
      m.home = Math.PI + rand(-0.12, 0.12);
      m.setHeading(m.home);
      m.model.position.y = 0;
      m.talking = false;
    }
    for (; pi < this.pool.length; pi++) this.pool[pi].root.visible = false;
  }

  // ───────────── Reinicio ─────────────
  reset() {
    this.tasks = [];
    this.state = 'play'; // 'play' | 'busy' | 'scene' | 'done'
    this.camMode = 'follow';
    this.fovGoal = 40;
    this.camYaw = this.camYawGoal = Math.PI; // la cámara empieza del lado de la pizarra, mirando las caras
    this.focus = null;
    this.stepAcc = 0;
    this._arrange();

    const L = this.L;
    const p = this.yo;
    p.talking = false;
    p.play('idle', 0);
    p.position.set(L.start[0], 0, L.start[1]);
    p.setHeading(0); // mirando hacia las filas
    this.isa.talking = false;

    this.promptEl.classList.add('hidden');
    this._placeCamera(0, true);
    for (const m of [p, this.isa]) m.update(0);

    const obj = $('#objective');
    obj.innerHTML = D.OBJETIVO;
    obj.classList.remove('show'); void obj.offsetWidth; obj.classList.add('show');
  }

  exit() {
    $('#objective').classList.remove('show');
  }

  // ───────────── Tareas por frame (se congelan con la pausa) ─────────────
  _task(step) { return new Promise((res) => this.tasks.push({ step, res })); }
  _sleep(s) { let t = 0; return this._task((dt) => (t += dt) >= s); }
  _tween(dur, fn) { let t = 0; return this._task((dt) => { t = Math.min(1, t + dt / dur); fn(ease(t)); return t >= 1; }); }

  rotateCamera(d) {
    if (this.state === 'play') this.camYawGoal += d;
  }

  pressA() {
    if (this.state === 'play' && this.target) this.sit(this.target);
  }

  // ───────────── Sentarse ─────────────
  async sit(seat) {
    this.state = 'busy';
    this.promptEl.classList.add('hidden');
    const p = this.yo;
    this.audio.play('sit');
    p.play('sit', 0.3);
    const from = p.position.clone(), to = this._sitPos(p, seat);
    const h0 = p.heading, dh = wrap(Math.PI - h0);
    await this._tween(0.45, (t) => { p.position.lerpVectors(from, to, t); p.setHeading(h0 + dh * t); });
    seat.empty = false;

    const neighbors = [seat.list[seat.k - 1], seat.list[seat.k + 1]].filter((s) => s && s.mii);
    const withIsa = neighbors.find((s) => s.mii === this.isa);
    const other = withIsa ? withIsa.mii : pick(neighbors).mii;
    this.focus = other;
    this.state = 'scene';

    // cámara de frente a los dos, desde la fila de adelante
    const mid = new THREE.Vector3().addVectors(p.position, other.position).multiplyScalar(0.5);
    this.camMode = 'goal';
    this.camRate = 3;
    this.fovGoal = 38;
    this.camGoalPos.set(mid.x, mid.y + 2.3, mid.z - 4.0);
    this.camGoalLook.set(mid.x, mid.y + 0.7, mid.z);
    await this._sleep(0.7);

    // los dos se miran un poco
    const side = Math.sign(other.position.x - p.position.x);
    const lookJ = Math.PI - side * 0.55, lookO = Math.PI + side * 0.55;
    const turn = (m, h) => this._tween(0.35, (t) => m.setHeading(m.heading + wrap(h - m.heading) * t));

    const hooks = {
      onTyping: (who, on) => {
        if (who === 'yo') p.talking = on;
        else if (who === 'isa' || who === 'vecino') other.talking = on;
      },
    };

    await turn(p, lookJ);
    p.play('sitwave', 0.15);
    this.audio.play('wave');
    await this.dialogue.play([{ who: 'yo', text: D.saludo() }], hooks);
    p.play('sit', 0.3);
    p.talking = false;

    if (withIsa) {
      // ── la Isa: saluda de vuelta, bien ──
      await turn(other, lookO);
      other.play('sitwave', 0.15);
      this.audio.play('wave');
      await this.dialogue.play(D.ISA.slice(0, 1), hooks);
      other.play('sit', 0.3);
      await this.dialogue.play(D.ISA.slice(1), hooks);
      p.talking = other.talking = false;
      await this._sleep(0.5);
      this.state = 'done';
      this.audio.play('win');
      this.onEnd({ win: true, ...D.GANAR });
    } else {
      // ── otra persona: respuesta pesada y pierdes ──
      this.dialogue.speakers.vecino = { name: D.NOMBRE_VECINO, color: '#7d8fa3', voice: rand(0.8, 1.5) };
      await this._sleep(0.3);
      await turn(other, lookO);
      await this.dialogue.play([...D.pesado(), { who: 'yo', text: D.reaccion() }], hooks);
      p.talking = other.talking = false;
      other.model.position.y = 0;
      this.state = 'done';
      this.audio.stopMusic();
      this.audio.play('fail');
      this.onEnd({ win: false, ...D.PERDER });
    }
  }

  // ───────────── Bucle ─────────────
  update(dt, input) {
    this.time += dt;
    for (const r of this.rigs) r.update(dt);
    if (this.tasks.length) {
      for (const t of [...this.tasks]) if (t.step(dt)) { this.tasks.splice(this.tasks.indexOf(t), 1); t.res(); }
    }
    if (this.state === 'play') this._movePlayer(dt, input);
    this.yo.update(dt);
    this.isa.update(dt);
    if (this.focus && this.focus !== this.isa) this.focus.update(dt);
    this._updateTarget();
    this._placeCamera(dt);
  }

  _movePlayer(dt, input) {
    const p = this.yo;
    const cy = Math.cos(this.camYaw), sy = Math.sin(this.camYaw);
    let x = input.x * cy + input.z * sy, z = -input.x * sy + input.z * cy;
    const len = Math.hypot(x, z);
    if (len > 0.1) {
      x /= len; z /= len;
      p.position.x += x * WALK_SPEED * dt;
      p.position.z += z * WALK_SPEED * dt;
      p.turnToward(Math.atan2(x, z), dt, 12);
      p.play('walk', 0.15);
      p.setSpeed(WALK_SPEED / WALK_CYCLE_SPEED);
      this.stepAcc += dt * (WALK_SPEED / WALK_CYCLE_SPEED);
      if (this.stepAcc > 0.31) { this.stepAcc = 0; this.audio.play('step'); }
    } else {
      p.play('idle', 0.2);
      this.stepAcc = 0.2;
    }
    const pos = p.position;
    const row = this._tier(pos.z);
    for (const s of this.seats) {
      if (Math.abs(s.row - row) > 1) continue;
      this._pushOut(pos, s, s.empty ? 0.32 : 0.55);
    }
    for (const r of this.tableRects) this._pushOutRect(pos, r, 0.3);
    for (const r of this.obsRects) this._pushOutRect(pos, r, 0.35);
    const [x0, z0, x1, z1] = this.L.room;
    pos.x = Math.min(x1 - 0.4, Math.max(x0 + 0.4, pos.x));
    pos.z = Math.min(z1 - 0.4, Math.max(z0 + 0.5, pos.z));
    pos.y += (this._groundY(pos.z) - pos.y) * Math.min(1, dt * 14); // sube y baja los escalones
  }

  _pushOut(pos, o, r) {
    const dx = pos.x - o.x, dz = pos.z - o.z;
    const d = Math.hypot(dx, dz);
    if (d < r && d > 1e-4) { pos.x = o.x + (dx / d) * r; pos.z = o.z + (dz / d) * r; }
  }

  _pushOutRect(pos, r, m) {
    const x0 = r[0] - m, z0 = r[1] - m, x1 = r[2] + m, z1 = r[3] + m;
    if (pos.x <= x0 || pos.x >= x1 || pos.z <= z0 || pos.z >= z1) return;
    const opts = [[pos.x - x0, x0, null], [x1 - pos.x, x1, null], [pos.z - z0, null, z0], [z1 - pos.z, null, z1]];
    opts.sort((a, b) => a[0] - b[0]);
    if (opts[0][1] != null) pos.x = opts[0][1]; else pos.z = opts[0][2];
  }

  // Puesto libre más cercano en el mismo escalón → cartelito "A"
  _updateTarget() {
    this.target = null;
    if (this.state !== 'play') { this.promptEl.classList.add('hidden'); return; }
    const p = this.yo.position;
    const row = this._tier(p.z);
    let best = 1.15;
    for (const s of this.seats) {
      if (!s.empty || s.row !== row) continue;
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (d < best) { best = d; this.target = s; }
    }
    if (!this.target) { this.promptEl.classList.add('hidden'); return; }
    const v = new THREE.Vector3(this.target.x, this.target.y + 1.5, this.target.z).project(this.camera);
    this.promptText.textContent = D.CARTEL_SENTARSE;
    this.promptEl.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px';
    this.promptEl.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
    this.promptEl.classList.remove('hidden');
  }

  _placeCamera(dt, snap = false) {
    const p = this.yo.position;
    let rate = 5;
    if (this.camMode === 'follow') {
      this.camYaw += (this.camYawGoal - this.camYaw) * (snap ? 1 : Math.min(1, dt * 10));
      this.camGoalPos.set(p.x + Math.sin(this.camYaw) * CAM_DIST, p.y + 4.6, p.z + Math.cos(this.camYaw) * CAM_DIST);
      this.camGoalLook.set(p.x, p.y + 1.0, p.z);
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
    const c = this.camPos, [, rz0, rx1] = this.L.room;
    for (const o of this.frontProps) o.visible = c.z > rz0 + 0.3;
    for (const o of this.ceilingProps) o.visible = c.y < this.L.height - 0.5;
    for (const o of this.sideProps) o.visible = c.x < rx1 - 0.2;
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }
}
