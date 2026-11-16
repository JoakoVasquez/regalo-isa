// Capítulo 5 · Los puentes (la pedida de pololeo)
// Puentes modelados en Blender (tools/build_puentes.py → assets/escenarios/puentes.glb) y el ramo
// (tools/build_ramo.py → assets/escenarios/ramo.glb). De día, con la Costanera al fondo.
//
// Fase 1 · "Que no vea las flores": juegas como Joaco. La Isa llegó primero y mira la vista desde el
//   mirador; cada cierto rato se da vuelta. Manteniendo A, Joaco esconde el ramo en la espalda (y camina
//   más lento). Si te ve moviéndote o con las flores a la vista, sube la SOSPECHA. Los maceteros y la
//   gente que pasa te tapan.
// Fase 2 · "Los nervios": hay que apretar A al ritmo del corazón; cada acierto arma un pedazo de la frase.
// Fase 3 · "¿Sí o no?": juegas como la Isa. El botón "No" se arranca.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';
import { loadTemplate, Mii, SharedRig, randomShirt, randomPants } from './mii.js';
import * as D from './mision5_dialogos.js';

const WALK_SPEED = 2.8;
const SNEAK_SPEED = 1.45;      // con el ramo escondido camina más lento
const WALK_CYCLE_SPEED = 1.65;
const CAM_DIST = 5.0;
const CAM_H = 3.0;             // altura de la cámara sobre la pasarela
const R_PLAYER = 0.3;
const RAMO_SCALE = 1.1;
const REACH = 1.6;             // distancia a la Isa para que empiece la escena
// Sospecha (0-100) por segundo cuando la Isa te está mirando y te ve
const SUS_FLORES = 75;         // quieto con las flores a la vista
const SUS_CORRER = 95;         // caminando con las flores a la vista
const SUS_ESCONDIDO = 24;      // caminando con el ramo escondido
const SUS_BAJA = 6;            // baja cuando no mira
// Ritmo del corazón
const BPM0 = 64;
const BPM_MISS = 9;
const WIN_OK = 0.17;           // margen para acertar (segundos)
const LEAD = 2.2;              // segundos que se ve cada latido antes de llegar al centro
const NERV0 = 25, NERV_MISS = 22, NERV_HIT = 5;
const TAU = Math.PI * 2;

const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const ease = (t) => t * t * (3 - 2 * t);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
const inRect = (x, z, r, m = 0) => x > r[0] + m && x < r[2] - m && z > r[1] + m && z < r[3] - m;

function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.42)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.2)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function makeHeartTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.font = '52px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#ff6f9c';
  g.fillText('♥', 32, 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Cielo de día: degradado de azul profundo arriba a celeste claro en el horizonte
function makeSky() {
  const g = new THREE.SphereGeometry(800, 24, 12);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x2f7fd6) }, mid: { value: new THREE.Color(0x8cc2ee) }, low: { value: new THREE.Color(0xdcecf7) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vP;
      void main(){ float h = clamp(vP.y, 0.0, 1.0);
        vec3 c = mix(low, mid, smoothstep(0.0, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.75, h));
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(g, m);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}

export class Mission5 {
  constructor({ audio, dialogue, onEnd }) {
    this.audio = audio;
    this.dialogue = dialogue;
    this.onEnd = onEnd;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 1200);
    this.hint = D.AYUDA;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camGoalPos = new THREE.Vector3();
    this.camGoalLook = new THREE.Vector3();
    this.tasks = [];
    this.time = 0;
    this.run = 0;
    this.wantsCursor = false;
    this._v = new THREE.Vector3();
    this._buildDom();
  }

  // ───────────── Interfaz propia del capítulo ─────────────
  _buildDom() {
    const layer = document.createElement('div');
    layer.id = 'c5Layer';
    layer.innerHTML = `
      <div id="c5Eye" class="hidden"></div>
      <div id="c5Rhythm" class="hidden">
        <div id="c5Phrase"></div>
        <div class="c5-bottom">
          <div class="c5-nerves"><span>${D.NERVIOS}</span><div class="c5-bar"><i></i></div></div>
          <div class="c5-track"><div class="c5-target"><b>♥</b></div><div class="c5-notes"></div></div>
          <div class="c5-help">${D.RITMO_AYUDA}</div>
        </div>
      </div>
      <div id="c5Answer" class="hidden">
        <div class="c5-q">${D.PREGUNTA}</div>
        <button class="c5-btn c5-yes">${D.BOTON_SI}</button>
        <button class="c5-btn c5-no">${D.BOTON_NO}</button>
        <div class="c5-help">${D.RESPUESTA_AYUDA}</div>
      </div>`;
    document.body.appendChild(layer);
    this.eyeEl = $('#c5Eye');
    this.rhEl = $('#c5Rhythm');
    this.phraseEl = $('#c5Phrase');
    this.notesEl = layer.querySelector('.c5-notes');
    this.targetEl = layer.querySelector('.c5-target');
    this.nervBar = layer.querySelector('.c5-bar i');
    this.ansEl = $('#c5Answer');
    this.yesBtn = layer.querySelector('.c5-yes');
    this.noBtn = layer.querySelector('.c5-no');
    this.yesBtn.addEventListener('click', () => { if (this.state === 'answer') this._sayYes(); });
    this.noBtn.addEventListener('click', () => { if (this.state === 'answer') this._noClicked(); });
    this.yesBtn.addEventListener('mouseenter', () => { if (this.state === 'answer') { this.ansSel = 0; this._paintAnswer(); } });
    addEventListener('mousemove', (e) => { if (this.state === 'answer') this._dodge(e.clientX, e.clientY); });
  }

  // ───────────── Carga ─────────────
  async load() {
    const ch = CONFIG.characters;
    const [L, gltf, ramo, tIsa, tYo, tR1, tR2] = await Promise.all([
      fetch('assets/escenarios/puentes.json').then((r) => r.json()),
      new GLTFLoader().loadAsync('assets/escenarios/puentes.glb'),
      new GLTFLoader().loadAsync('assets/escenarios/ramo.glb'),
      loadTemplate(ch.isa.file), loadTemplate(ch.yo.file), loadTemplate(ch.random1.file), loadTemplate(ch.random2.file),
    ]);
    this.L = L;
    this.DY = L.deckY;
    const scene = this.scene;
    scene.background = new THREE.Color(0x8cc2ee);
    scene.fog = new THREE.Fog(0xd3e5f4, 110, 560);
    scene.add(makeSky());

    // Luz de mediodía
    scene.add(new THREE.HemisphereLight(0xd8ecff, 0x9a8b6e, 1.7));
    const sun = new THREE.DirectionalLight(0xfff3dc, 1.6);
    sun.position.set(-30, 60, -25);
    scene.add(sun);

    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const s = o.material;
      if (o.name.startsWith('baranda')) {
        o.material = new THREE.MeshLambertMaterial({ map: s.map, alphaTest: 0.5, side: THREE.DoubleSide });
      } else if (['vidrio', 'costanera', 'ciudad3'].some((n) => o.name.startsWith(n))) {
        o.material = new THREE.MeshPhongMaterial({ map: s.map, shininess: 60, specular: 0x6f8aa6 });
      } else {
        o.material = new THREE.MeshLambertMaterial({ color: s.color, map: s.map, side: s.side });
      }
      if (s.map) s.map.anisotropy = 4;
    });
    scene.add(gltf.scene);

    // El ramo (de Blender): se pone en la mano de quien lo tenga
    this.ramo = new THREE.Group();
    const inner = ramo.scene;
    inner.traverse((o) => {
      if (!o.isMesh) return;
      o.material = new THREE.MeshLambertMaterial({ color: o.material.color, side: o.material.side });
    });
    inner.scale.setScalar(RAMO_SCALE);
    this.ramo.add(inner);
    scene.add(this.ramo);
    this.ramoQ = new THREE.Quaternion();

    this.blobMat = new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, depthWrite: false });
    this.blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const addBlob = (m) => {
      const blob = new THREE.Mesh(this.blobGeo, this.blobMat);
      blob.scale.setScalar(1.1); blob.position.y = 0.03; blob.renderOrder = 1;
      m.root.add(blob);
    };

    this.isa = new Mii(tIsa, { id: 'isa' });
    this.yo = new Mii(tYo, { id: 'yo' });
    for (const m of [this.isa, this.yo]) { addBlob(m); scene.add(m.root); }

    // Gente: los que pasan por las pasarelas (tapan la vista) y los del jardín
    this.rigs = {
      walk: [new SharedRig(tR1, 'walk', 0), new SharedRig(tR2, 'walk', 0.3)],
      sit: [new SharedRig(tR1, 'sit', 0), new SharedRig(tR2, 'sit', 1.7)],
      idle: [new SharedRig(tR1, 'idle', 0), new SharedRig(tR2, 'idle', 1.4)],
    };
    this.allRigs = Object.values(this.rigs).flat();
    const mk = (i, rig) => {
      const m = new Mii(i % 2 ? tR2 : tR1, { shared: rig, shirt: randomShirt(), pants: randomPants() });
      addBlob(m);
      scene.add(m.root);
      return m;
    };
    this.peds = L.peds.map((path, i) => ({ m: mk(i, this.rigs.walk[i % 2]), path, t: 0, dir: 1, r: 0.35, x: 0, z: 0 }));
    this.garden = [];
    let gi = 0;
    for (const [x, z] of L.tables) {
      for (const s of [-1, 1]) {
        if ((gi++ % 3) === 2) continue; // algunas sillas vacías
        const m = mk(gi, this.rigs.sit[gi % 2]);
        m.position.set(x + s * 0.68, 0.47 - 0.22 * m.scale, z);
        m.setHeading(s < 0 ? Math.PI / 2 : -Math.PI / 2);
        this.garden.push(m);
      }
    }
    for (const [x, z, h] of [[-0.2, 13.0, 0.6], [0.5, 13.4, -2.3], [3.6, 29.5, 3], [-4.8, 12.6, 1.2]]) {
      const m = mk(gi++, this.rigs.idle[gi % 2]);
      m.position.set(x, 0, z);
      m.setHeading(h);
      this.garden.push(m);
    }

    // Coberturas fijas: maceteros con arbustos
    this.planters = L.planters.map(([x, z, r]) => ({ x, z, r }));

    // Corazones del final
    const hm = new THREE.SpriteMaterial({ map: makeHeartTexture(), transparent: true, depthWrite: false });
    this.hearts = [];
    for (let i = 0; i < 36; i++) {
      const s = new THREE.Sprite(hm.clone());
      s.visible = false;
      scene.add(s);
      this.hearts.push({ s, v: new THREE.Vector3(), life: 0 });
    }

    this.reset();
  }

  // ───────────── Reinicio ─────────────
  reset() {
    this.run++;
    this.tasks = [];
    this.state = 'intro'; // 'intro' | 'play' | 'scene' | 'rhythm' | 'answer' | 'end' | 'done'
    this.introT = 0;
    this.introStarted = false;
    this.camMode = 'goal';
    this.camRate = 5;
    this.camYaw = this.camYawGoal = 0;
    this.fovGoal = 46;
    this.sus = 0;
    this.hiding = false;
    this.ramoMode = 'hand';   // 'hand' | 'back' | 'offer' | 'isa'
    this.ramoHolder = this.yo;
    this.shake = 0;
    this.bubbleT = 0;
    this.stepAcc = 0;
    this.wantsCursor = false;
    // la Isa: ciclo de mirar la vista / darse vuelta
    this.look = { state: 'away', t: 5.5, turned: false, gain: 0, said: false };

    const L = this.L, DY = this.DY;
    const p = this.yo, isa = this.isa;
    for (const m of [p, isa]) { m.talking = false; m.model.position.y = 0; m.root.visible = true; }
    p.position.set(L.start[0], DY, L.start[1]);
    p.setHeading(Math.PI);
    p.play('idle', 0);
    isa.position.set(L.isa[0], DY, L.isa[1]);
    isa.setHeading(Math.PI);
    isa.play('idle', 0);

    this.peds.forEach((d, i) => { d.t = (i * 0.37) % 1; d.dir = i % 2 ? -1 : 1; });
    this._updatePeds(0);
    for (const h of this.hearts) { h.s.visible = false; h.life = 0; }

    // primera toma: la Isa en el mirador, de espaldas, mirando la Costanera
    this._shotIsa();
    this.camera.fov = this.fovGoal;
    this.camera.updateProjectionMatrix();
    this._placeCamera(0, true);
    for (const m of [p, isa]) m.update(0);
    this._placeRamo(0, true);
    this._hideUi();
  }

  _shotIsa() {
    const [ix, iz] = this.L.isa, DY = this.DY;
    this.camGoalPos.set(ix + 2.6, DY + 2.3, iz + 5.2);
    this.camGoalLook.set(ix - 1.2, DY + 1.6, iz - 6);
  }

  _hideUi() {
    $('#mareo').classList.add('hidden');
    $('#mareo').classList.remove('c5');
    $('#bubble').classList.add('hidden');
    $('#objective').classList.remove('show');
    $('#blush').style.opacity = 0;
    this.eyeEl.classList.add('hidden');
    this.rhEl.classList.add('hidden');
    this.ansEl.classList.add('hidden');
    document.body.classList.remove('c5-pov');
  }

  exit() {
    this.run++;
    this.tasks = [];
    this.state = 'done';
    this.wantsCursor = false;
    this._hideUi();
  }

  // ───────────── Tareas por frame (se congelan con la pausa) ─────────────
  _task(step) { return new Promise((res) => this.tasks.push({ step, res })); }
  _sleep(s) { let t = 0; return this._task((dt) => (t += dt) >= s); }
  _tween(dur, fn) { let t = 0; return this._task((dt) => { t = Math.min(1, t + dt / dur); fn(ease(t)); return t >= 1; }); }
  _walk(m, points, sp = 2.0, anim = 'walk') {
    let i = 0;
    return this._task((dt) => {
      const g = points[i];
      if (!g) return true;
      const dx = g.x - m.position.x, dz = g.z - m.position.z, d = Math.hypot(dx, dz);
      const step = sp * dt;
      if (d <= step) {
        m.position.x = g.x; m.position.z = g.z;
        if (++i >= points.length) { m.play(anim === 'sneak' ? 'hide' : 'idle', 0.2); return true; }
        return false;
      }
      m.position.x += (dx / d) * step;
      m.position.z += (dz / d) * step;
      m.turnToward(Math.atan2(dx, dz), dt, 10);
      m.play(anim, 0.15);
      m.setSpeed(sp / WALK_CYCLE_SPEED);
      return false;
    });
  }
  _turn(m, h, dur = 0.35) {
    const h0 = m.heading, dh = wrap(h - h0);
    return this._tween(dur, (t) => m.setHeading(h0 + dh * t));
  }
  _hooks() {
    return {
      onTyping: (who, on) => {
        if (who === 'yo') this.yo.talking = on;
        if (who === 'isa') this.isa.talking = on;
      },
    };
  }
  _quiet() { this.yo.talking = this.isa.talking = false; }

  rotateCamera(d) {
    if (this.state === 'play') this.camYawGoal += d;
  }

  pressA() {
    if (this.state === 'rhythm') this._rhythmPress();
    else if (this.state === 'answer') {
      if (this.ansSel === 0) this._sayYes();
      else this._noClicked();
    }
  }

  // ───────────── Intro ─────────────
  async _intro() {
    const run = this.run;
    await this._sleep(2.2);
    if (run !== this.run) return;
    // la cámara viaja hasta Joaco, que viene llegando con el ramo
    const p = this.yo.position;
    this.camRate = 1.6;
    this.camGoalPos.set(p.x + 1.8, p.y + 1.9, p.z - 3.2);
    this.camGoalLook.set(p.x, p.y + 1.1, p.z);
    await this._sleep(1.8);
    if (run !== this.run) return;
    await this.dialogue.play(D.INTRO, this._hooks());
    if (run !== this.run) return;
    this._quiet();

    this.state = 'play';
    this.camMode = 'follow';
    this.camYaw = this.camYawGoal = 0;
    const m = $('#mareo');
    m.classList.add('c5');
    m.classList.remove('hidden');
    $('#mareoLabel').textContent = D.SOSPECHA;
    this._paintSus();
    this.eyeEl.classList.remove('hidden');
    const obj = $('#objective');
    obj.innerHTML = D.OBJETIVO;
    obj.classList.remove('show'); void obj.offsetWidth; obj.classList.add('show');
  }

  // ───────────── Fase 1: la Isa mira la vista y a veces se da vuelta ─────────────
  _updateLook(dt) {
    const k = this.look, isa = this.isa;
    k.t -= dt;
    if (k.state === 'away') {
      isa.turnToward(Math.PI, dt, 4);
      if (k.t <= 0) {
        k.state = 'warn'; k.t = rand(0.85, 1.15);
        this.audio.play('alert');
      }
    } else if (k.state === 'warn') {
      if (k.t <= 0) {
        k.state = 'look'; k.t = rand(1.8, 2.7); k.turned = false; k.gain = 0; k.said = false;
      }
    } else if (k.state === 'look') {
      const want = Math.atan2(this.yo.position.x - isa.position.x, this.yo.position.z - isa.position.z);
      isa.turnToward(want, dt, 9);
      if (!k.turned && Math.abs(wrap(want - isa.heading)) < 0.35) k.turned = true;
      if (k.turned) this._watch(dt);
      if (k.t <= 0) {
        k.state = 'away'; k.t = rand(2.6, 5.0);
        if (k.gain < 4) this._say(D.salvado());
      }
    }
    this.sus = Math.max(0, this.sus - (k.state === 'look' ? 0 : SUS_BAJA * dt));
  }

  // ¿Algo tapa la línea entre la Isa y Joaco?
  _blocked() {
    const a = this.isa.position, b = this.yo.position;
    const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
    const covers = [...this.planters, ...this.peds];
    for (const c of covers) {
      const t = ((c.x - a.x) * dx + (c.z - a.z) * dz) / len2;
      if (t < 0.04 || t > 0.97) continue;
      const px = a.x + dx * t, pz = a.z + dz * t;
      if (Math.hypot(c.x - px, c.z - pz) < c.r + 0.08) return true;
    }
    return false;
  }

  _watch(dt) {
    const k = this.look;
    if (this._blocked()) return;
    const d = Math.hypot(this.yo.position.x - this.isa.position.x, this.yo.position.z - this.isa.position.z);
    const far = clamp(1.5 - d / 24, 0.35, 1.3);
    let rate = 0;
    if (!this.hiding) rate = this.moving ? SUS_CORRER : SUS_FLORES;
    else if (this.moving) rate = SUS_ESCONDIDO;
    if (rate <= 0) return;
    const add = rate * far * dt;
    this.sus = Math.min(100, this.sus + add);
    k.gain += add;
    if (!k.said && k.gain > 6) {
      k.said = true;
      this._say(D.casi());
      this.shake = 0.25;
      const el = $('#mareo');
      el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
    }
    if (this.sus >= 100) this._caught();
  }

  _paintSus() {
    const s = this.sus;
    $('#mareoBar i').style.width = s.toFixed(1) + '%';
    $('#mareoFace').textContent = s < 25 ? '😊' : s < 50 ? '😬' : s < 78 ? '😰' : '😱';
  }

  async _caught() {
    const run = this.run;
    this.state = 'end';
    this.eyeEl.classList.add('hidden');
    $('#bubble').classList.add('hidden');
    const p = this.yo, isa = this.isa;
    this.hiding = false;
    this.ramoMode = 'hand';
    p.play('idle', 0.2);
    isa.faceToward(p.position, 1, 1);
    this.audio.play('gasp');
    this.camMode = 'goal';
    this.camRate = 2.2;
    const mx = (p.position.x + isa.position.x) / 2, mz = (p.position.z + isa.position.z) / 2;
    const d = Math.hypot(p.position.x - isa.position.x, p.position.z - isa.position.z);
    this.camGoalPos.set(p.position.x + Math.sin(p.heading + 2.4) * 3.6, this.DY + 2.0, p.position.z + Math.cos(p.heading + 2.4) * 3.6);
    this.camGoalLook.set(p.position.x, this.DY + 1.1, p.position.z);
    await this._sleep(0.6);
    if (run !== this.run) return;
    if (d > 4) { // está lejos: la cámara los muestra a los dos
      this.camGoalPos.set(clamp(mx + 3, -10, 11), this.DY + 3.2, Math.min(mz + 7, 33));
      this.camGoalLook.set(mx, this.DY + 1.0, mz);
    }
    isa.faceToward(p.position, 1, 1);
    p.faceToward(isa.position, 1, 1);
    await this.dialogue.play(D.PILLADO, this._hooks());
    if (run !== this.run) return;
    this._quiet();
    this.state = 'done';
    $('#mareo').classList.add('hidden');
    this.audio.stopMusic();
    this.audio.play('fail');
    this.onEnd({ win: false, ...D.PERDER_PILLADO });
  }

  // ───────────── Movimiento ─────────────
  _walkable(x, z, m = R_PLAYER) {
    // el punto y sus cuatro bordes (a m metros) tienen que caer sobre alguna pasarela, no necesariamente
    // la misma: así el margen solo cuenta contra las barandas y en las juntas se pasa sin trabas
    const on = (px, pz) => this.L.walk.some((r) => inRect(px, pz, r, -0.001));
    return on(x, z) && on(x - m, z) && on(x + m, z) && on(x, z - m) && on(x, z + m);
  }

  _movePlayer(dt, input) {
    const p = this.yo, pos = p.position;
    this.hiding = !!input.a;
    const cy = Math.cos(this.camYaw), sy = Math.sin(this.camYaw);
    let x = input.x * cy + input.z * sy, z = -input.x * sy + input.z * cy;
    const len = Math.hypot(x, z);
    this.moving = len > 0.1;
    if (this.moving) {
      x /= len; z /= len;
      const sp = this.hiding ? SNEAK_SPEED : WALK_SPEED;
      const nx = pos.x + x * sp * dt, nz = pos.z + z * sp * dt;
      if (this._walkable(nx, nz)) { pos.x = nx; pos.z = nz; }
      else if (this._walkable(nx, pos.z)) pos.x = nx;
      else if (this._walkable(pos.x, nz)) pos.z = nz;
      p.turnToward(Math.atan2(x, z), dt, 12);
      p.play(this.hiding ? 'sneak' : 'walk', 0.15);
      p.setSpeed(sp / WALK_CYCLE_SPEED);
      this.stepAcc += dt * (sp / WALK_CYCLE_SPEED);
      if (this.stepAcc > 0.31) { this.stepAcc = 0; if (!this.hiding) this.audio.play('step'); }
    } else {
      p.play(this.hiding ? 'hide' : 'idle', 0.2);
      this.stepAcc = 0.2;
    }
    this.ramoMode = this.hiding ? 'back' : 'hand';

    // choques: maceteros, gente que pasa y la Isa
    const solid = [...this.planters, ...this.peds, { x: this.isa.position.x, z: this.isa.position.z, r: 0.32 }];
    for (const c of solid) {
      const dx = pos.x - c.x, dz = pos.z - c.z, r = R_PLAYER + c.r, d = Math.hypot(dx, dz);
      if (d < r && d > 1e-4) {
        const ox = c.x + (dx / d) * r, oz = c.z + (dz / d) * r;
        if (this._walkable(ox, oz, R_PLAYER * 0.5)) { pos.x = ox; pos.z = oz; }
      }
    }

    // llegó hasta la Isa
    if (Math.hypot(pos.x - this.isa.position.x, pos.z - this.isa.position.z) < REACH) this._arrive();
  }

  _updatePeds(dt) {
    for (const d of this.peds) {
      const [a, b] = d.path;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      d.t += (d.dir * 1.05 * dt) / len;
      if (d.t > 1) { d.t = 1; d.dir = -1; }
      if (d.t < 0) { d.t = 0; d.dir = 1; }
      d.x = a[0] + (b[0] - a[0]) * d.t;
      d.z = a[1] + (b[1] - a[1]) * d.t;
      d.m.position.set(d.x, this.DY, d.z);
      d.m.setHeading(Math.atan2((b[0] - a[0]) * d.dir, (b[1] - a[1]) * d.dir));
    }
  }

  // ───────────── El ramo en la mano ─────────────
  _placeRamo(dt, snap = false) {
    const m = this.ramoHolder;
    const wrist = m.rig.bones.wrist_r;
    m.root.updateMatrixWorld(true);
    wrist.getWorldPosition(this._v);
    const h = m.heading;
    let tilt, yawOff = 0, fwd = 0, up = 0;
    if (this.ramoMode === 'back') { tilt = 2.5; fwd = -0.05; up = -0.02; }  // colgando detrás de la espalda
    else if (this.ramoMode === 'offer') { tilt = 0.55; fwd = 0.05; }       // hacia adelante, flores a la Isa
    else if (this.ramoMode === 'isa') { tilt = 0.35; yawOff = 0.3; }
    else { tilt = 0.28; yawOff = -0.3; }                                     // en la mano, flores arriba
    const goal = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, h + yawOff, 0, 'YXZ'));
    if (snap) this.ramoQ.copy(goal); else this.ramoQ.slerp(goal, 1 - Math.exp(-dt * 12));
    this.ramo.quaternion.copy(this.ramoQ);
    this.ramo.position.set(this._v.x + Math.sin(h) * fwd, this._v.y + up, this._v.z + Math.cos(h) * fwd);
  }

  // ───────────── Fase 2: llega y le dan los nervios ─────────────
  async _arrive() {
    const run = this.run;
    this.state = 'scene';
    this.eyeEl.classList.add('hidden');
    $('#bubble').classList.add('hidden');
    $('#mareo').classList.add('hidden');
    const p = this.yo, isa = this.isa, DY = this.DY;
    this.hiding = true;
    this.ramoMode = 'back';
    const ix = this.L.isa[0], iz = this.L.isa[1];
    // Joaco se pone a su lado (con las flores atrás) y la Isa se da vuelta
    this.camMode = 'goal';
    this.camRate = 2.2;
    this.fovGoal = 40;
    this.camGoalPos.set(ix + 0.75, DY + 2.35, iz + 5.0);
    this.camGoalLook.set(ix + 0.75, DY + 0.95, iz - 1);
    await this._walk(p, [{ x: ix + 1.5, z: iz }], 1.4, 'sneak');
    if (run !== this.run) return;
    await Promise.all([this._turn(p, -Math.PI / 2, 0.4), this._turn(isa, Math.PI / 2, 0.6)]);
    p.play('hide', 0.2);
    this.audio.play('gasp');
    await this.dialogue.play(D.LLEGA, this._hooks());
    if (run !== this.run) return;
    this._quiet();
    this._startRhythm();
  }

  _startRhythm() {
    this.state = 'rhythm';
    this.audio.stopMusic();
    const obj = $('#objective');
    obj.innerHTML = D.OBJETIVO2;
    obj.classList.remove('show'); void obj.offsetWidth; obj.classList.add('show');
    this.rh = { t: -1.2, bpm: BPM0, nextAt: 1.2, notes: [], hits: 0, nerves: NERV0, stutter: null };
    this.notesEl.innerHTML = '';
    this.phraseEl.innerHTML = '<span class="c5-dots">...</span>';
    this.rhEl.classList.remove('hidden');
    this._paintNerves();
    // cámara: se acerca de a poco a los dos
    this.camRate = 0.5;
    this.fovGoal = 35;
  }

  _updateRhythm(dt) {
    const r = this.rh;
    r.t += dt;
    // programa latidos con anticipación (el tempo sube con los nervios)
    while (r.nextAt < r.t + LEAD) {
      const el = document.createElement('div');
      el.className = 'c5-note';
      el.textContent = '♥';
      this.notesEl.appendChild(el);
      r.notes.push({ at: r.nextAt, el, done: false, beat: false });
      r.nextAt += 60 / r.bpm;
    }
    for (const n of r.notes) {
      const left = clamp((n.at - r.t) / LEAD, -0.2, 1);
      n.el.style.left = (10 + left * 88) + '%';
      if (!n.beat && r.t >= n.at) { n.beat = true; this.audio.play('heart'); this._pulse(); }
      if (!n.done && r.t > n.at + WIN_OK) { n.done = true; this._miss(n); }
      if (r.t > n.at + 0.6) n.el.remove();
    }
    r.notes = r.notes.filter((n) => r.t <= n.at + 0.6);
    // nervios: rubor en la orilla y la cámara tiembla
    $('#blush').style.opacity = (r.nerves / 100 * 0.75).toFixed(2);
    this.shake = Math.max(this.shake, r.nerves > 70 ? 0.08 : 0);
  }

  _pulse() {
    const t = this.targetEl;
    t.classList.remove('beat'); void t.offsetWidth; t.classList.add('beat');
  }

  _rhythmPress() {
    const r = this.rh;
    let best = null, bd = Infinity;
    for (const n of r.notes) if (!n.done && Math.abs(n.at - r.t) < bd) { bd = Math.abs(n.at - r.t); best = n; }
    if (best && bd <= WIN_OK) {
      best.done = true;
      best.el.classList.add('ok');
      this._hit(bd < 0.07);
    } else if (best && bd < 0.45) {
      best.done = true;
      this._miss(best);
    } else {
      // apretar sin latido cerca: se pone nervioso igual (pero menos)
      r.nerves = Math.min(100, r.nerves + 8);
      this._paintNerves();
      if (r.nerves >= 100) this._choke();
    }
  }

  _hit(perfect) {
    const r = this.rh;
    r.hits++;
    r.nerves = Math.max(0, r.nerves - NERV_HIT);
    r.bpm = Math.max(BPM0, r.bpm - 2);
    this.audio.play('hit');
    this._paintPhrase(perfect);
    this._paintNerves();
    if (r.hits >= D.FRASE.length) this._askDone();
  }

  _miss(n) {
    const r = this.rh;
    if (this.state !== 'rhythm') return;
    n?.el.classList.add('bad');
    r.nerves = Math.min(100, r.nerves + NERV_MISS);
    r.bpm += BPM_MISS;
    this.audio.play('miss');
    this.shake = 0.3;
    r.stutter = D.tartamudeo();
    this._paintPhrase(false);
    clearTimeout(this._stT);
    this._stT = setTimeout(() => { if (this.rh) { this.rh.stutter = null; if (this.state === 'rhythm') this._paintPhrase(false); } }, 650);
    this._paintNerves();
    const bar = this.rhEl.querySelector('.c5-nerves');
    bar.classList.remove('hit'); void bar.offsetWidth; bar.classList.add('hit');
    if (r.nerves >= 100) this._choke();
  }

  _paintPhrase(pop) {
    const r = this.rh;
    const words = D.FRASE.slice(0, r.hits).map((w, i) => `<span class="${i === r.hits - 1 && pop !== null ? 'new' : ''}">${w}</span>`);
    if (r.stutter) words.push(`<span class="c5-st">${r.stutter}</span>`);
    this.phraseEl.innerHTML = words.length ? words.join(' ') : '<span class="c5-dots">...</span>';
  }

  _paintNerves() {
    this.nervBar.style.width = this.rh.nerves.toFixed(0) + '%';
  }

  async _choke() {
    const run = this.run;
    this.state = 'end';
    this.rhEl.classList.add('hidden');
    $('#blush').style.opacity = 0.5;
    this.audio.play('dizzy');
    this.camRate = 2;
    this.fovGoal = 38;
    await this._sleep(0.5);
    if (run !== this.run) return;
    await this.dialogue.play(D.BLOQUEO, this._hooks());
    if (run !== this.run) return;
    this._quiet();
    this.state = 'done';
    $('#blush').style.opacity = 0;
    this.audio.play('fail');
    this.onEnd({ win: false, ...D.PERDER_NERVIOS });
  }

  async _askDone() {
    const run = this.run;
    this.state = 'end';
    this.audio.play('yay');
    await this._sleep(0.5);
    if (run !== this.run) return;
    this.rhEl.classList.add('hidden');
    $('#blush').style.opacity = 0.25;
    // saca las flores de la espalda y se las ofrece
    this.ramoMode = 'offer';
    this.yo.play('offer', 0.35);
    this.camRate = 2;
    this.fovGoal = 40;
    await this._sleep(1.1);
    if (run !== this.run) return;
    this._startAnswer();
  }

  // ───────────── Fase 3: la Isa responde (POV) ─────────────
  _startAnswer() {
    this.state = 'answer';
    const isa = this.isa, p = this.yo;
    // cámara en los ojos de la Isa
    isa.root.updateMatrixWorld(true);
    const head = isa.rig.bones.head.getWorldPosition(new THREE.Vector3());
    isa.root.visible = false;
    this.camMode = 'goal';
    this.camRate = 3;
    this.fovGoal = 58;
    $('#objective').classList.remove('show');
    // un poco detrás de sus ojos, para que el ramo no tape a Joaco
    const dx = p.position.x - head.x, dz = p.position.z - head.z, dl = Math.hypot(dx, dz) || 1;
    this.camGoalPos.set(head.x - (dx / dl) * 0.9, head.y + 0.15, head.z - (dz / dl) * 0.9);
    this.camGoalLook.set(p.position.x, p.position.y + 1.0, p.position.z);
    this.escapes = 0;
    this.ansSel = 0;
    this.noBtn.textContent = D.NO_ESCAPA[0];
    this.noBtn.style.left = '62%';
    this.noBtn.style.top = '74%';
    this.yesBtn.style.setProperty('--grow', 1);
    this.ansEl.classList.remove('hidden');
    document.body.classList.add('c5-pov');
    this.wantsCursor = true;
    this.lastX = 0;
    this._paintAnswer();
  }

  _paintAnswer() {
    this.yesBtn.classList.toggle('sel', this.ansSel === 0);
    this.noBtn.classList.toggle('sel', this.ansSel === 1);
  }

  _noIsYes() { return false; } // el "No" nunca se deja apretar

  _escape() {
    this.escapes++;
    this.audio.play('whoosh');
    // salta a otro lugar, lejos del "Sí" y del mouse
    const yes = this.yesBtn.getBoundingClientRect();
    let x, y;
    for (let k = 0; k < 30; k++) {
      x = rand(12, 84); y = rand(28, 86);
      const px = (x / 100) * innerWidth, py = (y / 100) * innerHeight;
      const far = Math.hypot(px - (this.mx ?? -999), py - (this.my ?? -999)) > innerHeight * 0.3;
      const offYes = px < yes.left - 120 || px > yes.right + 120 || py < yes.top - 60 || py > yes.bottom + 60;
      if (far && offYes) break;
    }
    this.noBtn.style.left = x + '%';
    this.noBtn.style.top = y + '%';
    this.noBtn.textContent = D.NO_ESCAPA[this.escapes % D.NO_ESCAPA.length];
    this.yesBtn.style.setProperty('--grow', Math.min(1.8, 1 + this.escapes * 0.12));
  }

  _dodge(x, y) {
    this.mx = x; this.my = y;
    if (this._noIsYes()) return;
    const b = this.noBtn.getBoundingClientRect();
    const cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
    if (Math.hypot(x - cx, y - cy) < Math.max(b.width, b.height) * 0.75 + innerHeight * 0.04) this._escape();
  }

  _noClicked() {
    if (this._noIsYes()) { this._sayYes(); return; }
    this._escape();
    this.ansSel = 0;
    this._paintAnswer();
  }

  _answerKeys(input) {
    const x = input.x;
    if (x && x !== this.lastX) {
      this.audio.play('hover');
      if (x > 0) { // ir al "No": se arranca y la selección vuelve al "Sí"
        if (this._noIsYes()) { this.ansSel = 1; }
        else { this.ansSel = 0; this._escape(); }
      } else this.ansSel = 0;
      this._paintAnswer();
    }
    this.lastX = x;
  }

  async _sayYes() {
    const run = this.run;
    this.state = 'end';
    this.wantsCursor = false;
    this.ansEl.classList.add('hidden');
    document.body.classList.remove('c5-pov');
    this.audio.play('yay');
    this.audio.startMusic('amor');
    const p = this.yo, isa = this.isa, DY = this.DY;
    isa.root.visible = true;
    $('#blush').style.opacity = 0.35;
    // vuelve la cámara de lado, con la Costanera atrás
    const mx = (p.position.x + isa.position.x) / 2, mz = p.position.z;
    this.camRate = 2.2;
    this.fovGoal = 42;
    this.camGoalPos.set(mx, DY + 2.3, mz + 5.0);
    this.camGoalLook.set(mx, DY + 0.95, mz - 1);
    isa.play('cheer', 0.2);
    this._burst();
    await this._sleep(1.4);
    if (run !== this.run) return;
    // ella recibe el ramo
    isa.play('idle', 0.3);
    p.play('idle', 0.3);
    this.ramoHolder = isa;
    this.ramoMode = 'isa';
    await this._sleep(0.5);
    if (run !== this.run) return;
    await this.dialogue.play(D.FINAL, this._hooks());
    if (run !== this.run) return;
    this._quiet();
    this._burst();
    p.play('cheer', 0.2);
    await this._sleep(1.0);
    if (run !== this.run) return;
    this.state = 'done';
    $('#blush').style.opacity = 0;
    this.audio.play('win');
    this.onEnd({ win: true, ...D.GANAR });
  }

  _burst() {
    const c = new THREE.Vector3((this.yo.position.x + this.isa.position.x) / 2, this.DY + 1.2, this.yo.position.z);
    for (const h of this.hearts) {
      h.s.position.copy(c).add(new THREE.Vector3(rand(-0.6, 0.6), rand(-0.2, 0.4), rand(-0.4, 0.4)));
      h.v.set(rand(-0.8, 0.8), rand(0.8, 2.0), rand(-0.6, 0.6));
      h.life = rand(1.4, 2.6);
      h.max = h.life;
      h.s.scale.setScalar(rand(0.12, 0.26));
      h.s.visible = true;
    }
  }

  _updateHearts(dt) {
    for (const h of this.hearts) {
      if (h.life <= 0) continue;
      h.life -= dt;
      h.v.y -= 0.6 * dt;
      h.s.position.addScaledVector(h.v, dt);
      h.s.material.opacity = clamp(h.life / h.max * 1.6, 0, 1);
      if (h.life <= 0) h.s.visible = false;
    }
  }

  // ───────────── Bucle ─────────────
  update(dt, input) {
    this.time += dt;
    for (const r of this.allRigs) r.update(dt);
    if (this.tasks.length) {
      for (const t of [...this.tasks]) if (t.step(dt)) { this.tasks.splice(this.tasks.indexOf(t), 1); t.res(); }
    }
    this._updatePeds(dt);

    if (this.state === 'intro') {
      this.introT += dt;
      if (this.introT > 0.5 && !this.introStarted) { this.introStarted = true; this._intro(); }
    } else this.introStarted = false;

    if (this.state === 'play') {
      this._movePlayer(dt, input);
      if (this.state === 'play') this._updateLook(dt);
      this._paintSus();
    }
    if (this.state === 'rhythm') this._updateRhythm(dt);
    if (this.state === 'answer') this._answerKeys(input);

    this.yo.update(dt);
    this.isa.update(dt);
    this._placeRamo(dt);
    this._updateHearts(dt);
    this._placeCamera(dt);
    this._updateEye();
    this._updateBubble(dt);
  }

  // Ícono sobre la Isa: ♪ mirando la vista · ! se va a dar vuelta · 👀 mirando
  _updateEye() {
    if (this.state !== 'play') return;
    const k = this.look, el = this.eyeEl;
    const icon = k.state === 'away' ? '♪' : k.state === 'warn' ? '!' : '👀';
    if (el.dataset.icon !== icon) {
      el.dataset.icon = icon;
      el.textContent = icon;
      el.className = 'c5-' + k.state;
    }
    const p = this.isa.position;
    const v = this._v.set(p.x, p.y + 2.25, p.z).project(this.camera);
    el.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px';
    el.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
    el.style.visibility = v.z < 1 ? 'visible' : 'hidden';
  }

  _say(text) {
    const b = $('#bubble');
    b.innerHTML = text.replace(/\*(.+?)\*/g, '$1');
    b.classList.remove('hidden');
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    this.bubbleT = 1.4;
  }

  _updateBubble(dt) {
    if (this.bubbleT <= 0) return;
    this.bubbleT -= dt;
    const b = $('#bubble');
    if (this.bubbleT <= 0 || this.state !== 'play') { b.classList.add('hidden'); this.bubbleT = 0; return; }
    const p = this.yo.position;
    const v = this._v.set(p.x, p.y + 2.3, p.z).project(this.camera);
    b.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px';
    b.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
  }

  _placeCamera(dt, snap = false) {
    const p = this.yo.position;
    let rate = 5;
    if (this.camMode === 'follow') {
      this.camYaw += (this.camYawGoal - this.camYaw) * (snap ? 1 : Math.min(1, dt * 10));
      let cx = p.x + Math.sin(this.camYaw) * CAM_DIST, cz = p.z + Math.cos(this.camYaw) * CAM_DIST;
      // que no se meta dentro de los edificios
      cx = clamp(cx, this.L.towerL[2] + 0.4, this.L.buildR[0] - 0.4);
      cz = Math.min(cz, this.L.buildBack[1] - 0.4);
      this.camGoalPos.set(cx, p.y + CAM_H, cz);
      this.camGoalLook.set(p.x, p.y + 1.0, p.z);
    } else rate = this.camRate ?? 5;
    const k = snap ? 1 : 1 - Math.exp(-dt * rate);
    if (Math.abs(this.camera.fov - this.fovGoal) > 0.01) {
      this.camera.fov += (this.fovGoal - this.camera.fov) * (snap ? 1 : 1 - Math.exp(-dt * 3));
      this.camera.updateProjectionMatrix();
    }
    this.camPos.lerp(this.camGoalPos, k);
    this.camLook.lerp(this.camGoalLook, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.shake = Math.max(0, this.shake - dt);
    if (this.shake > 0) this.camera.rotateZ(Math.sin(this.time * 47) * 0.04 * this.shake);
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }
}
