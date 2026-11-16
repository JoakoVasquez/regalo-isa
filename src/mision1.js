// Capítulo 1 · El grupo 68
// La plaza del Baticristo (modelada en Blender: tools/build_plaza.py → assets/escenarios/plaza.glb).
// Hay 15 grupos de Miis en círculo repartidos al azar por el cemento y el pasto. Isa tiene que
// encontrar el grupo 68: la única pista es que ahí está Joaco. Cada grupo equivocado suma vergüenza;
// a la tercera, Isa se muere de vergüenza. En el grupo correcto Isa saluda, la cámara recorre el
// círculo mostrando que nadie le devuelve el saludo... salvo Joaco, que está justo a su lado.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';
import { loadTemplate, Mii, SharedRig, randomShirt, randomPants } from './mii.js';
import * as D from './mision1_dialogos.js';

const N_GROUPS = 15;
const MAX_SHAME = 3;
const SPACING = 1.18;          // distancia entre vecinos de un círculo
const WALK_SPEED = 3.2;
const WALK_CYCLE_SPEED = 1.65;
const POOL = (N_GROUPS - 1) * 11 + 9;
const TAU = Math.PI * 2;
const FACES = ['🙂', '😅', '😳', '💀'];

const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const ease = (t) => t * t * (3 - 2 * t);
const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
const inRect = (x, z, r, m = 0) => x >= r[0] + m && x <= r[2] - m && z >= r[1] + m && z <= r[3] - m;
const rectDist = (x, z, r) => Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - z, 0, z - r[3]));

function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(30,40,30,0.45)');
  grad.addColorStop(0.55, 'rgba(30,40,30,0.24)');
  grad.addColorStop(1, 'rgba(30,40,30,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Mission1 {
  constructor({ audio, dialogue, onEnd }) {
    this.audio = audio;
    this.dialogue = dialogue;
    this.onEnd = onEnd;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.3, 900);
    this.hint = D.AYUDA;
    this.camYaw = this.camYawGoal = 0;
    this.promptEl = $('#prompt');
    this.promptText = $('#promptText');
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camGoalPos = new THREE.Vector3();
    this.camGoalLook = new THREE.Vector3();
    this.tasks = [];
    this.turning = new Map();
    this.time = 0;
  }

  // ───────────── Carga ─────────────
  async load() {
    const ch = CONFIG.characters;
    const [L, gltf, tIsa, tYo, tR1, tR2] = await Promise.all([
      fetch('assets/escenarios/plaza.json').then((r) => r.json()),
      new GLTFLoader().loadAsync('assets/escenarios/plaza.glb'),
      loadTemplate(ch.isa.file), loadTemplate(ch.yo.file), loadTemplate(ch.random1.file), loadTemplate(ch.random2.file),
    ]);
    this.L = L;
    const scene = this.scene;

    // Cielo con degradado + niebla del mismo color en el horizonte (así la cordillera se ve lejana)
    scene.fog = new THREE.Fog(0xd6e8f5, 80, 360);
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(700, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying vec3 vP; void main(){ float h = clamp(vP.y, 0.0, 1.0); vec3 c = mix(vec3(0.84, 0.91, 0.96), vec3(0.33, 0.6, 0.9), pow(h, 0.5)); gl_FragColor = vec4(c, 1.0); }',
      }),
    );
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    scene.add(new THREE.HemisphereLight(0xe4f1ff, 0x8d8a72, 1.75));
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.1);
    sun.position.set(-25, 40, 18);
    scene.add(sun);

    // La plaza: el .glb trae materiales PBR; aquí se cambian a Lambert (más barato y más "de consola")
    this.flagTime = { value: 0 };
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const s = o.material;
      const m = new THREE.MeshLambertMaterial({ color: s.color, map: s.map, side: s.side });
      if (s.map) s.map.anisotropy = 4;
      if (o.name.startsWith('bandera')) { // las banderas ondean (más lejos del poste = más movimiento)
        m.onBeforeCompile = (sh) => {
          sh.uniforms.uTime = this.flagTime;
          sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
            '#include <begin_vertex>\nfloat fu = vMapUv.x;\ntransformed.z += sin(fu * 5.0 - uTime * 4.0 + position.x) * 0.22 * fu;\ntransformed.y += sin(fu * 4.0 - uTime * 3.0) * 0.08 * fu;');
        };
      }
      o.material = m;
    });
    scene.add(gltf.scene);

    // Zonas: dónde se puede pisar, dónde pueden aparecer grupos y qué estorba
    this.grassRects = L.grass;
    this.pavedRects = [...Object.values(L.paved).flat(), L.strip];
    this.spawnRects = [L.paved.plaza[0], L.paved.norte[0], L.paved.sur[0], L.strip, ...L.grass];
    this.obsCircles = [{ x: L.statue[0], z: L.statue[1], r: 1.5 }];
    for (const t of L.trees) this.obsCircles.push({ x: t[0], z: t[1], r: 0.42 * t[2] });
    for (const [x, z] of L.lamps) this.obsCircles.push({ x, z, r: 0.3 });
    for (const [x, z, rot] of L.benches) {
      const a = rot * Math.PI / 180;
      for (const k of [-0.6, 0.6]) this.obsCircles.push({ x: x + Math.cos(a) * k, z: z + Math.sin(a) * k, r: 0.5 });
    }
    this.obsCircles.push({ x: L.kiosk[0] - 1.6, z: L.kiosk[3] - 1.0, r: 0.35 });
    const b = L.building;
    this.obsRects = [L.planter, L.kiosk, L.sculpture, [b[0], b[1], -34.7, b[3]]];

    // Sombras "de mancha"
    this.blobMat = new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, depthWrite: false });
    this.blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const m4 = new THREE.Matrix4();
    const treeBlobs = new THREE.InstancedMesh(this.blobGeo, this.blobMat, L.trees.length);
    L.trees.forEach((t, i) => treeBlobs.setMatrixAt(i, m4.makeScale(5.2 * t[2], 1, 5.2 * t[2]).setPosition(t[0], this._groundY(t[0], t[1]) + 0.03, t[1])));
    treeBlobs.renderOrder = 1;
    scene.add(treeBlobs);

    // Isa y Joaco: Miis completos (con su propio esqueleto, pueden saludar)
    this.isa = new Mii(tIsa, { id: 'isa' });
    this.yo = new Mii(tYo, { id: 'yo' });
    for (const m of [this.isa, this.yo]) {
      const blob = new THREE.Mesh(this.blobGeo, this.blobMat);
      blob.scale.setScalar(1.25); blob.position.y = 0.02; blob.renderOrder = 1;
      m.root.add(blob);
      scene.add(m.root);
    }

    // Los demás: un montón de Miis colgados de 4 esqueletos compartidos (respiran desfasados)
    this.rigs = [0, 0.8, 1.6, 2.4].map((ph, i) => new SharedRig(i % 2 ? tR2 : tR1, 'idle', ph));
    this.pool = [];
    for (let i = 0; i < POOL; i++) {
      const tpl = i % 2 ? tR2 : tR1;
      const m = new Mii(tpl, { shared: this.rigs[i % 4], shirt: randomShirt(), pants: randomPants() });
      this.pool.push(m);
      scene.add(m.root);
    }
    this.blobs = new THREE.InstancedMesh(this.blobGeo, this.blobMat, POOL);
    this.blobs.renderOrder = 1;
    this.blobs.frustumCulled = false;
    scene.add(this.blobs);

    this.reset();
  }

  _groundY(x, z) {
    for (const r of this.grassRects) if (inRect(x, z, r)) return 0.1;
    for (const r of this.pavedRects) if (inRect(x, z, r)) return 0.05;
    return 0;
  }

  // ───────────── Reparto de grupos (distinto cada vez) ─────────────
  _placeGroups() {
    const L = this.L;
    const areas = this.spawnRects.map((r) => Math.max(0, (r[2] - r[0] - 5) * (r[3] - r[1] - 5)));
    const total = areas.reduce((a, b) => a + b, 0);
    const centers = [];
    const ok = (x, z) => {
      if (Math.hypot(x - L.start[0], z - L.start[1]) < 8) return false;
      for (const c of this.obsCircles) if (Math.hypot(x - c.x, z - c.z) < c.r + 3.2) return false;
      for (const r of this.obsRects) if (rectDist(x, z, r) < 3.2) return false;
      for (const c of centers) if (Math.hypot(x - c.x, z - c.z) < 7.2) return false;
      return true;
    };
    for (let tries = 0; centers.length < N_GROUPS && tries < 6000; tries++) {
      let k = Math.random() * total, i = 0;
      while (k > areas[i]) k -= areas[i++];
      const r = this.spawnRects[i];
      const x = rand(r[0] + 2.5, r[2] - 2.5), z = rand(r[1] + 2.5, r[3] - 2.5);
      if (ok(x, z)) centers.push({ x, z });
    }

    // números de grupo al azar (ninguno es el 68, salvo el correcto)
    const nums = [];
    while (nums.length < centers.length) {
      const n = randInt(1, 120);
      if (n !== D.NUMERO_CORRECTO && !nums.includes(n)) nums.push(n);
    }
    const correct = randInt(0, centers.length - 1);
    nums[correct] = D.NUMERO_CORRECTO;

    let pi = 0;
    const m4 = new THREE.Matrix4();
    this.groups = centers.map((c, gi) => {
      const isCorrect = gi === correct;
      const count = isCorrect ? 11 : randInt(8, 11); // en el correcto: 9 + Joaco + el hueco para Isa
      const r = Math.max(1.6, (count * SPACING) / TAU);
      const a0 = Math.random() * TAU;
      const g = { center: new THREE.Vector3(c.x, 0, c.z), r, count, num: nums[gi], correct: isCorrect, asked: false, members: [], slots: [] };
      for (let i = 0; i < count; i++) {
        const a = a0 + (i / count) * TAU;
        const rr = r * (1 + rand(-0.04, 0.04));
        const x = c.x + Math.sin(a) * rr, z = c.z + Math.cos(a) * rr;
        const slot = { a, x, z, heading: a + Math.PI, mii: null };
        g.slots.push(slot);
        if (isCorrect && i === 0) continue; // hueco para Isa
        let m;
        if (isCorrect && i === 1) {
          m = this.yo;
          m.play('idle', 0);
        } else {
          m = this.pool[pi];
          m.root.visible = true;
          m.setColors(randomShirt(), randomPants());
          m.scale = m.template.scale * rand(0.92, 1.06);
          m.root.scale.setScalar(m.scale);
          m.setShared(this.rigs[randInt(0, 3)]);
          this.blobs.setMatrixAt(pi, m4.makeScale(1.3, 1, 1.3).setPosition(x, this._groundY(x, z) + 0.025, z));
          pi++;
        }
        m.position.set(x, this._groundY(x, z), z);
        m.home = slot.heading + rand(-0.12, 0.12);
        m.setHeading(m.home);
        m.model.position.y = 0;
        m.talking = false;
        slot.mii = m;
        g.members.push(m);
      }
      return g;
    });
    for (; pi < POOL; pi++) {
      this.pool[pi].root.visible = false;
      this.blobs.setMatrixAt(pi, m4.makeScale(0, 0, 0));
    }
    this.blobs.instanceMatrix.needsUpdate = true;
  }

  // ───────────── Reinicio ─────────────
  reset() {
    this.tasks = [];
    this.turning.clear();
    this.state = 'play';   // 'play' | 'dialogue' | 'cutscene' | 'dying' | 'done'
    this.camMode = 'follow';
    this.fovGoal = 34;
    this.camYaw = this.camYawGoal = 0;
    this.focus = null;
    this.focusGroup = null;
    this.shame = 0;
    this.stepAcc = 0;
    this._placeGroups();

    const L = this.L;
    const isa = this.isa;
    isa.talking = false;
    isa.play('idle', 0);
    isa.position.set(L.start[0], this._groundY(L.start[0], L.start[1]), L.start[1]);
    isa.setHeading(Math.PI); // mirando hacia el Baticristo
    this.yo.talking = false;

    this._paintShame(false);
    $('#shame').classList.remove('hidden');
    $('#blush').style.opacity = 0;
    this.promptEl.classList.add('hidden');
    this._placeCamera(0, true);
    for (const m of [isa, this.yo]) m.update(0);

    const obj = $('#objective');
    obj.innerHTML = D.OBJETIVO;
    obj.classList.remove('show'); void obj.offsetWidth; obj.classList.add('show');
  }

  exit() {
    $('#shame').classList.add('hidden');
    $('#blush').style.opacity = 0;
    $('#objective').classList.remove('show');
  }

  // ───────────── Vergüenza ─────────────
  _paintShame(flash = true) {
    const segs = document.querySelectorAll('#shameBar i');
    segs.forEach((s, i) => s.classList.toggle('on', i < this.shame));
    $('#shameFace').textContent = FACES[Math.min(this.shame, FACES.length - 1)];
    $('#blush').style.opacity = (this.shame / MAX_SHAME) * 0.55;
    if (flash) { const el = $('#shame'); el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
  }

  _addShame() {
    this.shame = Math.min(MAX_SHAME, this.shame + 1);
    this.audio.play('shame');
    this._paintShame(true);
  }

  // ───────────── Tareas por frame (para las escenas; se congelan con la pausa) ─────────────
  _task(step) { return new Promise((res) => this.tasks.push({ step, res })); }
  _sleep(s) { let t = 0; return this._task((dt) => (t += dt) >= s); }
  _tween(dur, fn) { let t = 0; return this._task((dt) => { t = Math.min(1, t + dt / dur); fn(ease(t)); return t >= 1; }); }
  _walk(points) {
    let i = 0;
    const p = this.isa;
    return this._task((dt) => {
      const g = points[i];
      const dx = g.x - p.position.x, dz = g.z - p.position.z, d = Math.hypot(dx, dz);
      const sp = WALK_SPEED * 0.75, step = sp * dt;
      if (d <= step) {
        p.position.x = g.x; p.position.z = g.z;
        if (++i >= points.length) { p.play('idle', 0.2); return true; }
        return false;
      }
      p.position.x += (dx / d) * step;
      p.position.z += (dz / d) * step;
      p.turnToward(Math.atan2(dx, dz), dt, 10);
      p.play('walk', 0.15);
      p.setSpeed(sp / WALK_CYCLE_SPEED);
      this._steps(dt, sp);
      return false;
    });
  }
  _steps(dt, sp) {
    this.stepAcc += dt * (sp / WALK_CYCLE_SPEED);
    if (this.stepAcc > 0.31) { this.stepAcc = 0; this.audio.play('step'); }
  }

  // ───────────── Acciones ─────────────
  pressA() {
    if (this.state === 'play' && this.target) this.ask(this.target);
  }

  async ask(g) {
    this.state = 'dialogue';
    this.focusGroup = g;
    this.promptEl.classList.add('hidden');
    this.isa.play('idle', 0.2);
    const p = this.isa.position;
    let speaker = null, best = Infinity;
    for (const m of g.members) {
      if (m === this.yo) continue; // Joaco deja que hablen los demás
      const d = m.position.distanceTo(p);
      if (d < best) { best = d; speaker = m; }
    }
    this.focus = speaker;
    this.turning.delete(speaker);
    this.camMode = 'dialogue';
    this.dialogue.speakers.grupo = { name: D.NOMBRE_GRUPO, color: '#7d8fa3', voice: rand(0.85, 1.55) };

    let script;
    let shameNow = false;
    if (g.correct) script = [{ who: 'isa', text: D.pregunta() }, ...D.CORRECTO];
    else if (g.asked) script = D.REPETIDO(g.num);
    else {
      shameNow = true;
      const level = this.shame + 1;
      script = [
        { who: 'isa', text: D.pregunta() },
        ...D.respuestaEquivocada(g.num),
        { do: () => this._addShame(), who: 'isa', text: D.disculpa(level) },
      ];
    }
    g.asked = true;

    await this.dialogue.play(script, {
      onTyping: (who, on) => {
        if (who === 'grupo') speaker.talking = on;
        else if (who === 'isa') this.isa.talking = on;
        else if (who === 'yo') this.yo.talking = on;
      },
    });
    speaker.talking = false;
    this.isa.talking = false;

    if (g.correct) { this.celebrate(g, speaker); return; }

    speaker.model.position.y = 0;
    this.turning.set(speaker, speaker.home);
    this.focus = null;
    this.focusGroup = null;
    if (shameNow && this.shame >= MAX_SHAME) { this.die(); return; }
    this.camMode = 'follow';
    this.state = 'play';
  }

  // ───────────── Final malo: morir de vergüenza ─────────────
  die() {
    this.state = 'dying';
    this.camMode = 'goal';
    this.audio.stopMusic();
    this.audio.play('fail');
    this.dieT = 0;
    this.dieY0 = this.isa.position.y;
    this.dieDone = false;
    $('#shameFace').textContent = FACES[3];
  }

  _dying(dt) {
    const p = this.isa;
    this.dieT += dt;
    const t = Math.min(1, this.dieT / 2.6);
    p.setHeading(p.heading + dt * (3 + 14 * t));       // da vueltas...
    p.position.y = this.dieY0 - ease(t) * 2.8;          // ...y se la traga la tierra
    $('#blush').style.opacity = 0.55 + 0.4 * t;
    this.camGoalPos.set(p.position.x, 2.6, p.position.z + 6.5);
    this.camGoalLook.set(p.position.x, 0.5, p.position.z);
    if (this.dieT > 3.2 && !this.dieDone) {
      this.dieDone = true;
      this.state = 'done';
      this.onEnd({ win: false, ...D.PERDER });
    }
  }

  // ───────────── Final bueno: el saludo ─────────────
  async celebrate(g, speaker) {
    this.state = 'cutscene';
    this.camMode = 'follow';
    speaker.model.position.y = 0;
    this.turning.set(speaker, speaker.home);
    this.focus = null;
    const c = g.center, isa = this.isa;
    const gap = g.slots[0];

    // 1) Isa rodea el círculo por fuera hasta el hueco que hay al lado de Joaco
    const ai = Math.atan2(isa.position.x - c.x, isa.position.z - c.z);
    const d = wrap(gap.a - ai);
    const R = g.r + 1.15;
    const n = Math.max(1, Math.ceil((Math.abs(d) * R) / 0.7));
    const pts = [{ x: c.x + Math.sin(ai) * R, z: c.z + Math.cos(ai) * R }];
    for (let k = 1; k <= n; k++) { const a = ai + (d * k) / n; pts.push({ x: c.x + Math.sin(a) * R, z: c.z + Math.cos(a) * R }); }
    pts.push({ x: gap.x, z: gap.z });
    await this._walk(pts);
    await this._tween(0.35, () => isa.turnToward(gap.heading, 1 / 60, 12));
    isa.setHeading(gap.heading);

    // 2) Isa saluda (cámara desde el centro del círculo, mirándola a ella)
    const dirTo = (a) => new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    // la cámara se para en el borde opuesto del círculo (por delante de los que están ahí) y mira hacia el otro lado
    const back = g.r - 0.45;
    const shotAt = (a, y = 1.55, lookY = 1.12) => {
      const dir = dirTo(a);
      this.camGoalPos.copy(c).addScaledVector(dir, -back).setY(y);
      this.camGoalLook.copy(c).addScaledVector(dir, g.r).setY(lookY);
    };
    this.camMode = 'goal';
    this.fovGoal = 44;
    this.camRate = 4;
    shotAt(gap.a);
    await this._sleep(0.6);
    isa.play('wave', 0.15);
    this.audio.play('wave');
    await this.dialogue.play(D.SALUDO_ISA, { onTyping: (w, on) => { isa.talking = on; } });
    await this._sleep(0.5);
    isa.play('idle', 0.3);

    // 3) Silencio incómodo: la cámara recorre el círculo. Nadie saluda.
    this.audio.stopMusic();
    await this._sleep(0.4);
    this.camRate = 9;
    let ang = gap.a;
    const step = TAU / g.count;
    let cricket = 0;
    const crickets = this._task((dt) => { cricket -= dt; if (cricket <= 0) { this.audio.play('cricket'); cricket = 1.1; } return this.state !== 'cutscene' || this.panDone; });
    this.panDone = false;
    for (let k = 1; k < g.count; k++) {
      const from = ang, to = gap.a - step * k;
      const slot = g.slots[(g.count - k) % g.count];
      await this._tween(k === 1 ? 0.6 : 0.42, (t) => { ang = from + (to - from) * t; shotAt(ang); });
      if (slot.mii === this.yo) break;
      // cada uno, al sentirse mirado, desvía la mirada
      this.turning.set(slot.mii, slot.mii.home + (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 0.6));
      await this._sleep(0.5);
    }
    this.panDone = true;
    await crickets;

    // 4) ...menos Joaco, que está justo al lado
    this.yo.play('wave', 0.15);
    this.audio.play('wave');
    await this._sleep(1.0);
    const yoSlot = g.slots[1];
    const mid = wrap(yoSlot.a - gap.a) / 2 + gap.a;
    this.camRate = 3;
    shotAt(mid, 1.5, 1.05);
    await this._sleep(0.8);
    this.audio.startMusic('plaza');
    await this.dialogue.play(D.SALUDO_YO, {
      onTyping: (who, on) => { if (who === 'yo') this.yo.talking = on; else isa.talking = on; },
    });
    this.yo.play('idle', 0.3);
    await this._sleep(0.6);
    this.state = 'done';
    this.audio.play('win');
    this.onEnd({ win: true, ...D.GANAR });
  }

  // ───────────── Bucle ─────────────
  update(dt, input) {
    this.time += dt;
    this.flagTime.value = this.time;
    for (const r of this.rigs) r.update(dt);

    if (this.tasks.length) {
      for (const t of [...this.tasks]) if (t.step(dt)) { this.tasks.splice(this.tasks.indexOf(t), 1); t.res(); }
    }

    if (this.state === 'play') this._movePlayer(dt, input);
    else if (this.state === 'dialogue' && this.focus) {
      this.isa.faceToward(this.focus.position, dt);
      this.focus.faceToward(this.isa.position, dt, 6);
    } else if (this.state === 'dying') this._dying(dt);

    for (const [m, h] of this.turning) {
      m.turnToward(h, dt, 3.5);
      if (Math.abs(wrap(h - m.heading)) < 0.01) this.turning.delete(m);
    }

    this.isa.update(dt);
    this.yo.update(dt);
    if (this.focus && this.focus !== this.yo) this.focus.update(dt);
    this._updateTarget();
    this._placeCamera(dt);
  }

  // Girar la cámara alrededor de Isa (solo mientras se camina libremente)
  rotateCamera(d) {
    if (this.state === 'play') this.camYawGoal += d;
  }

  _movePlayer(dt, input) {
    const p = this.isa;
    // las flechas son relativas a la cámara: "arriba" siempre es hacia el fondo de la pantalla
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
      this._steps(dt, WALK_SPEED);
    } else {
      p.play('idle', 0.2);
      this.stepAcc = 0.2;
    }
    const pos = p.position;
    for (const g of this.groups) {
      if (Math.hypot(pos.x - g.center.x, pos.z - g.center.z) > g.r + 2) continue;
      for (const m of g.members) this._pushOut(pos, m.position, 0.68);
    }
    for (const c of this.obsCircles) this._pushOut(pos, c, c.r + 0.35);
    for (const r of this.obsRects) this._pushOutRect(pos, r, 0.35);
    const B = this.L.bounds;
    pos.x = Math.min(B[2], Math.max(B[0], pos.x));
    pos.z = Math.min(B[3], Math.max(B[1], pos.z));
    pos.y += (this._groundY(pos.x, pos.z) - pos.y) * Math.min(1, dt * 20);
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

  // Grupo más cercano al que se le puede preguntar → cartelito "A"
  _updateTarget() {
    this.target = null;
    if (this.state !== 'play') { this.promptEl.classList.add('hidden'); return; }
    const p = this.isa.position;
    let best = Infinity;
    for (const g of this.groups) {
      const d = Math.hypot(p.x - g.center.x, p.z - g.center.z) - g.r;
      if (d < 1.5 && d < best) { best = d; this.target = g; }
    }
    if (!this.target) { this.promptEl.classList.add('hidden'); return; }
    const v = this.target.center.clone().setY(2.9);
    v.project(this.camera);
    this.promptText.textContent = this.target.asked && !this.target.correct ? D.CARTEL_YA_PREGUNTADO(this.target.num) : D.CARTEL_PREGUNTAR;
    this.promptEl.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px';
    this.promptEl.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
    this.promptEl.classList.remove('hidden');
  }

  _placeCamera(dt, snap = false) {
    const p = this.isa.position;
    let rate = 5;
    if (this.camMode === 'follow') {
      this.camYaw += (this.camYawGoal - this.camYaw) * (snap ? 1 : Math.min(1, dt * 10));
      this.camGoalPos.set(p.x + Math.sin(this.camYaw) * 11.5, 6.0, p.z + Math.cos(this.camYaw) * 11.5);
      this.camGoalLook.set(p.x, 1.0, p.z);
    } else if (this.camMode === 'dialogue' && this.focus && this.focusGroup) {
      // de lado, por fuera del círculo, para ver a los dos sin que los demás estorben
      const c = this.focusGroup.center;
      const dir = new THREE.Vector3(p.x - c.x, 0, p.z - c.z).normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);
      if (perp.x * Math.sin(this.camYaw) + perp.z * Math.cos(this.camYaw) < 0) perp.negate(); // del lado donde ya estaba la cámara
      const mid = new THREE.Vector3().addVectors(p, this.focus.position).multiplyScalar(0.5);
      this.camGoalPos.copy(mid).addScaledVector(dir, 3.4).addScaledVector(perp, 4.4).setY(2.4);
      this.camGoalLook.copy(mid).setY(0.85);
      rate = 4;
    } else if (this.camMode === 'goal') {
      rate = this.camRate ?? 5;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * rate);
    const fov = this.fovGoal ?? 34;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * (snap ? 1 : 1 - Math.exp(-dt * 4));
      this.camera.updateProjectionMatrix();
    }
    this.camPos.lerp(this.camGoalPos, k);
    this.camLook.lerp(this.camGoalLook, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.sky.position.copy(this.camPos);
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }
}
