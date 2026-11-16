// Capítulo 6 · El pie de limón
// Cocina modelada en Blender (tools/build_cocina.py → assets/escenarios/cocina.glb). El pie, el bol, los
// limones y los utensilios se arman aquí en three.js porque cambian durante la receta.
//
// Cinco etapas por turnos (src/mision6_dialogos.js → ETAPAS):
//   1 · La base (Joaco): moler las galletas apretando A rápido.
//   2 · Los limones (Isa): exprimir alternando ← →; cuando cae una pepa, A para sacarla.
//   3 · El relleno (Joaco): revolver siguiendo la flecha (↑ → ↓ ←); equivocarse salpica.
//   4 · El merengue (Isa): batir con A a ritmo parejo, con la aguja en la zona verde.
//   5 · El horno (los dos): apretar A cuando el merengue esté dorado.
// Si una etapa sale mal, se pierde (con su propio mensaje) y se reintenta el capítulo.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';
import { loadTemplate, Mii } from './mii.js';
import * as D from './mision6_dialogos.js';

const WALK_SPEED = 1.8;
const WALK_CYCLE_SPEED = 1.65;
const TAU = Math.PI * 2;

// Ajustes de cada etapa
const GALLETAS = { tiempo: 11, porGolpe: 5.5, baja: 5 };
const LIMONES = { tiempo: 16, n: 5, porLimon: 6, pepas: 3, maxFallos: 2, ventana: 2.2 };
const RELLENO = { tiempo: 22, vueltas: 8, maxFallos: 3 };
const MERENGUE = { tiempo: 26, nieve: 7, porGolpe: 13, freno: 0.9, zona: [42, 74], alto: 86, maxAlto: 0.6, maxFallos: 3 };
const HORNO = { vel: 8.5, zona: [60, 80], maxFallos: 3 };

// direcciones de la rueda del relleno (sentido del reloj, vista desde arriba)
const RUEDA = [[0, -1, 'u'], [1, 0, 'r'], [0, 1, 'd'], [-1, 0, 'l']];

const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const ease = (t) => t * t * (3 - 2 * t);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };

function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(60,40,20,0.38)');
  grad.addColorStop(0.55, 'rgba(60,40,20,0.18)');
  grad.addColorStop(1, 'rgba(60,40,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function makeEmojiTexture(ch, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.font = '50px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(ch, 32, 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

// Colores del merengue en el horno: crudo → doradito → quemado
const BROWN = [[0, 0xfbf8ef], [40, 0xf6e9c6], [62, 0xeab865], [80, 0xcf8c3c], [92, 0x7a4420], [100, 0x2a1a10]]
  .map(([k, c]) => [k, new THREE.Color(c)]);
function brownColor(b, out) {
  for (let i = 1; i < BROWN.length; i++) {
    if (b <= BROWN[i][0]) {
      const [k0, c0] = BROWN[i - 1], [k1, c1] = BROWN[i];
      return out.copy(c0).lerp(c1, (b - k0) / (k1 - k0));
    }
  }
  return out.copy(BROWN[BROWN.length - 1][1]);
}

export class Mission6 {
  constructor({ audio, dialogue, onEnd }) {
    this.audio = audio;
    this.dialogue = dialogue;
    this.onEnd = onEnd;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.05, 100);
    this.hint = D.AYUDA;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camGoalPos = new THREE.Vector3();
    this.camGoalLook = new THREE.Vector3();
    this.tasks = [];
    this.time = 0;
    this.run = 0;
    this.shake = 0;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._c = new THREE.Color();
    this._buildDom();
    // un clic en la pantalla también sirve para sacar la pepa
    $('#game').addEventListener('mousedown', () => { if (this.state === 'mini' && this.mg?.seed) this.pressA(); });
  }

  // ───────────── Interfaz propia del capítulo ─────────────
  _buildDom() {
    const layer = document.createElement('div');
    layer.id = 'c6Layer';
    const items = D.ETAPAS.map((e, i) => `
      <li data-i="${i}"><span class="who ${e.who}">${e.who === 'yo' ? 'J' : e.who === 'isa' ? 'I' : '♥'}</span>
      <span class="txt">${e.paso}</span><span class="chk">✔</span></li>`).join('');
    layer.innerHTML = `
      <div id="c6Recipe" class="hidden"><h3>🍋 ${D.TITULO_RECETA}</h3><ol>${items}</ol></div>
      <div id="c6Turn" class="hidden"></div>
      <div id="c6Say" class="hidden"></div>
      <div id="c6Panel" class="hidden">
        <div class="c6-head">
          <div class="c6-title"></div>
          <div class="c6-strikes"></div>
          <div class="c6-timer"><span>⏱</span><div class="c6-clock"><i></i></div></div>
        </div>
        <div class="c6-body"></div>
        <div class="c6-help"></div>
      </div>`;
    document.body.appendChild(layer);
    this.recipeEl = $('#c6Recipe');
    this.turnEl = $('#c6Turn');
    this.sayEl = $('#c6Say');
    this.panelEl = $('#c6Panel');
    this.pTitle = layer.querySelector('.c6-title');
    this.pStrikes = layer.querySelector('.c6-strikes');
    this.pTimer = layer.querySelector('.c6-timer');
    this.pClock = layer.querySelector('.c6-clock i');
    this.pBody = layer.querySelector('.c6-body');
    this.pHelp = layer.querySelector('.c6-help');
  }

  // ───────────── Carga ─────────────
  async load() {
    const ch = CONFIG.characters;
    const [L, gltf, tIsa, tYo] = await Promise.all([
      fetch('assets/escenarios/cocina.json').then((r) => r.json()),
      new GLTFLoader().loadAsync('assets/escenarios/cocina.glb'),
      loadTemplate(ch.isa.file), loadTemplate(ch.yo.file),
    ]);
    this.L = L;
    this.CH = L.counterH;
    const scene = this.scene;
    scene.background = new THREE.Color(0xfbf3df);

    // Luz de tarde: cálida desde la ventana + relleno suave
    scene.add(new THREE.HemisphereLight(0xfff6e6, 0xb39a7a, 1.9));
    const sun = new THREE.DirectionalLight(0xffefd2, 1.25);
    sun.position.set(-3, 6, -8);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xfff3ea, 0.55);
    fill.position.set(4, 5, 8);
    scene.add(fill);
    // luz anaranjada dentro del horno (se prende en la etapa 5)
    this.ovenLight = new THREE.PointLight(0xff9a3c, 0, 1.4, 1.5);
    this.ovenLight.position.set(L.ovenPie[0], L.ovenPie[2] + 0.25, L.ovenPie[1]);
    scene.add(this.ovenLight);

    // Lo que cuelga del techo o está pegado a la pared de adelante se esconde si la cámara queda encima
    this.ceilingProps = [];
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const s = o.material;
      if (o.name.startsWith('lampara')) this.ceilingProps.push(o);
      if (o.name === 'vidrio_horno') {
        o.material = new THREE.MeshBasicMaterial({ color: 0x241a14, transparent: true, opacity: 0.38, depthWrite: false });
        o.renderOrder = 2;
        this.ovenGlass = o;
      } else if (['ventana', 'lampara', 'luz_horno'].includes(o.name)) {
        o.material = new THREE.MeshBasicMaterial({ color: s.color });
        if (o.name === 'luz_horno') this.ovenBulb = o;
      } else {
        o.material = new THREE.MeshLambertMaterial({ color: s.color, map: s.map, side: s.side });
      }
      if (s.map) s.map.anisotropy = 4;
    });
    scene.add(gltf.scene);

    this.blobMat = new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, depthWrite: false });
    this.blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.isa = new Mii(tIsa, { id: 'isa' });
    this.yo = new Mii(tYo, { id: 'yo' });
    for (const m of [this.isa, this.yo]) {
      const blob = new THREE.Mesh(this.blobGeo, this.blobMat);
      blob.scale.setScalar(1.0); blob.position.y = 0.02; blob.renderOrder = 1;
      m.root.add(blob);
      scene.add(m.root);
    }

    this._buildPie();
    this._buildBowl();
    this._buildLemons();
    this._buildTools();
    this._buildBurst();
    this.reset();
  }

  // El pie: molde acanalado + base de galleta + relleno + merengue (se van mostrando)
  _buildPie() {
    const g = new THREE.Group();
    const R = 0.25;
    const tin = new THREE.CylinderGeometry(R, R * 0.88, 0.075, 48, 1, true);
    const p = tin.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x);
      const k = 1 + 0.035 * Math.cos(a * 24);
      p.setX(i, x * k); p.setZ(i, z * k);
    }
    tin.computeVertexNormals();
    const tinMat = lam(0xc4c9ce, { side: THREE.DoubleSide });
    const tinMesh = new THREE.Mesh(tin, tinMat);
    tinMesh.position.y = 0.0375;
    g.add(tinMesh);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(R * 0.88, 32).rotateX(-Math.PI / 2), tinMat);
    bottom.position.y = 0.002;
    g.add(bottom);

    // base de galleta (con borde que sube por el molde)
    this.pieBase = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.98, R * 0.86, 0.06, 36), lam(0xc58b4e));
    this.pieBase.position.y = 0.032;
    g.add(this.pieBase);
    // relleno amarillo
    this.pieFill = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.93, R * 0.93, 0.02, 36), lam(0xf5d94e));
    this.pieFill.position.y = 0.06;
    g.add(this.pieFill);
    // merengue: domo con olas y picos
    const dome = new THREE.SphereGeometry(R * 0.93, 36, 12, 0, TAU, 0, Math.PI / 2);
    const dp = dome.attributes.position;
    for (let i = 0; i < dp.count; i++) {
      const x = dp.getX(i), y = dp.getY(i), z = dp.getZ(i);
      const a = Math.atan2(z, x), r = Math.hypot(x, z) / (R * 0.93);
      const swirl = 1 + 0.18 * Math.sin(a * 7 + r * 9) * Math.sin(r * Math.PI);
      dp.setY(i, y * 0.48 * swirl);
    }
    dome.computeVertexNormals();
    this.meringueMat = lam(0xfbf8ef);
    this.pieMer = new THREE.Group();
    this.pieMer.add(new THREE.Mesh(dome, this.meringueMat));
    const peakGeo = new THREE.ConeGeometry(0.03, 0.06, 8);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + rand(-0.1, 0.1), r = i % 2 ? 0.17 : 0.09;
      const pk = new THREE.Mesh(peakGeo, this.meringueMat);
      const yy = Math.sqrt(Math.max(0, 1 - (r / (R * 0.93)) ** 2)) * R * 0.93 * 0.48;
      pk.position.set(Math.cos(a) * r, yy + 0.015, Math.sin(a) * r);
      pk.rotation.z = rand(-0.3, 0.3);
      this.pieMer.add(pk);
    }
    const top = new THREE.Mesh(peakGeo, this.meringueMat);
    top.position.y = R * 0.93 * 0.48 + 0.02;
    this.pieMer.add(top);
    this.pieMer.position.y = 0.07;
    g.add(this.pieMer);
    this.pie = g;
    this.scene.add(g);
  }

  // Bol con lo que se está preparando (el contenido cambia de color y de nivel)
  _buildBowl() {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(new THREE.Vector2(0.09 + 0.12 * Math.sin(t * Math.PI / 2), t * 0.16));
    }
    const g = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), lam(0x9fd2e6, { side: THREE.DoubleSide }));
    g.add(bowl);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.008, 6, 28).rotateX(Math.PI / 2), lam(0xffffff));
    rim.position.y = 0.16;
    g.add(rim);
    this.bowlStuff = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), lam(0xffffff));
    g.add(this.bowlStuff);
    // galletas enteras dentro del bol (desaparecen al molerlas)
    this.cookies = [];
    const cg = new THREE.CylinderGeometry(0.055, 0.055, 0.016, 14);
    const cm = lam(0xd9a362);
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(cg, cm);
      const a = (i / 6) * TAU;
      c.position.set(Math.cos(a) * 0.08, 0.04 + (i % 3) * 0.015, Math.sin(a) * 0.08);
      c.rotation.set(rand(-0.5, 0.5), 0, rand(-0.5, 0.5));
      g.add(c);
      this.cookies.push(c);
    }
    this.bowl = g;
    this.scene.add(g);
  }
  _setBowl(level, color) {
    // level 0..1 = altura del contenido dentro del bol
    const y = 0.008 + level * 0.14;
    const r = 0.09 + 0.12 * Math.sin((y / 0.16) * Math.PI / 2) - 0.004;
    this.bowlStuff.visible = level > 0.001;
    this.bowlStuff.position.y = y;
    this.bowlStuff.scale.setScalar(r);
    if (color != null) this.bowlStuff.material.color.set(color);
  }

  // Limones en la tabla + jarro de jugo + la pepa
  _buildLemons() {
    const L = this.L, CH = this.CH;
    this.lemonGroup = new THREE.Group();
    const lg = new THREE.SphereGeometry(0.05, 12, 8).scale(1.2, 0.85, 0.85);
    const lm = lam(0xf6d936);
    this.lemons = [];
    for (let i = 0; i < LIMONES.n; i++) {
      const m = new THREE.Mesh(lg, lm.clone());
      m.position.set(-0.12 + (i % 3) * 0.1, 0.07 + Math.floor(i / 3) * 0.06, (i % 2) * 0.05 - 0.02 + Math.floor(i / 3) * 0.02);
      m.rotation.y = rand(0, TAU);
      this.lemonGroup.add(m);
      this.lemons.push(m);
    }
    this.lemonGroup.position.set(L.lemons[0], CH + 0.0, L.lemons[1]);
    this.scene.add(this.lemonGroup);

    const jug = new THREE.Group();
    jug.add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.2, 18, 1, true),
      new THREE.MeshLambertMaterial({ color: 0xdff1f7, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })));
    jug.children[0].position.y = 0.1;
    jug.children[0].renderOrder = 3;
    this.juice = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.062, 1, 18), lam(0xf4e27a));
    jug.add(this.juice);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 6, 12, Math.PI), lam(0xdff1f7));
    handle.rotation.z = -Math.PI / 2;
    handle.position.set(0.08, 0.11, 0);
    jug.add(handle);
    jug.position.set(L.jug[0], CH, L.jug[1]);
    this.jug = jug;
    this.scene.add(jug);

    this.seed = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8).scale(1, 1.6, 0.75), lam(0xb88a4a));
    this.seed.visible = false;
    this.scene.add(this.seed);
  }
  _setJuice(level) {
    const h = Math.max(0.001, level * 0.17);
    this.juice.visible = level > 0.001;
    this.juice.scale.y = h;
    this.juice.position.y = 0.006 + h / 2;
  }

  // Utensilios en las manos: uslero, cuchara de palo, batidor y medio limón
  _buildTools() {
    const wood = lam(0xc99a64);
    const steel = lam(0xd8dde2);
    const uslero = new THREE.Group();
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.42, 12).rotateZ(Math.PI / 2), wood);
    uslero.add(roll);
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 8).rotateZ(Math.PI / 2), lam(0xa8774a));
      h.position.x = s * 0.26;
      uslero.add(h);
    }
    const cuchara = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.32, 8), wood);
    stick.position.y = -0.1;
    cuchara.add(stick);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 6).scale(1, 1.3, 0.45), wood);
    head.position.y = -0.27;
    cuchara.add(head);
    const batidor = new THREE.Group();
    const bh = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 8), lam(0xef6aa7));
    bh.position.y = 0.0;
    batidor.add(bh);
    for (let i = 0; i < 4; i++) {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.004, 4, 16).scale(1, 2.2, 1), steel);
      loop.rotation.y = (i / 4) * Math.PI;
      loop.position.y = -0.15;
      batidor.add(loop);
    }
    const medio = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8, 0, TAU, 0, Math.PI / 2).scale(1.15, 0.9, 0.9), lam(0xf6d936, { side: THREE.DoubleSide }));
    medio.rotation.x = Math.PI;
    const azucar = new THREE.Group();
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.09, 12), lam(0xffffff));
    cup.position.y = 0.08; // asoma sobre la mano
    azucar.add(cup);
    const tarro = new THREE.Group();
    const lata = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.11, 14), lam(0x2c6fb7));
    tarro.add(lata);
    const etiqueta = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.05, 14, 1, true), lam(0xf4efe0));
    tarro.add(etiqueta);
    lata.position.y = etiqueta.position.y = 0.09;
    this.tools = { uslero, cuchara, batidor, medio, azucar, tarro };
    for (const t of Object.values(this.tools)) { t.visible = false; this.scene.add(t); }
    this.held = new Map(); // mii → { tool, mode }
  }
  _hold(mii, name, mode = 'r') {
    for (const [m, h] of this.held) if (h.tool === this.tools[name] && m !== mii) this.held.delete(m);
    const prev = this.held.get(mii);
    if (prev) prev.tool.visible = false;
    if (!name) { this.held.delete(mii); return; }
    const tool = this.tools[name];
    tool.visible = true;
    this.held.set(mii, { tool, mode });
  }
  _placeTools() {
    for (const [m, { tool, mode }] of this.held) {
      m.root.updateMatrixWorld(true);
      const wr = m.rig.bones.wrist_r.getWorldPosition(this._v);
      if (mode === 'both') {
        const wl = m.rig.bones.wrist_l.getWorldPosition(this._v2);
        tool.position.addVectors(wr, wl).multiplyScalar(0.5);
        tool.position.y -= 0.03;
      } else {
        tool.position.copy(wr);
      }
      tool.rotation.set(0, m.heading, 0);
    }
  }

  // Corazones y limoncitos del final
  _buildBurst() {
    const tex = {
      heart: makeEmojiTexture('♥', '#ff6f9c'),
      lemon: makeEmojiTexture('🍋', '#f2c21a'),
      dot: makeEmojiTexture('●', '#ffffff'),
    };
    this.parts = [];
    for (let i = 0; i < 48; i++) {
      const mats = {};
      for (const [k, t] of Object.entries(tex)) mats[k] = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
      const s = new THREE.Sprite(mats.heart);
      s.visible = false;
      this.scene.add(s);
      this.parts.push({ s, mats, v: new THREE.Vector3(), life: 0, max: 1, g: 1 });
    }
  }
  // kind: 'mix' (corazones y limones), 'splash' (gotas de relleno), 'white' (merengue)
  _burst(center, n = 40, spread = 0.5, kind = 'mix', up = 1.6) {
    let k = 0;
    for (const p of this.parts) {
      if (k >= n) break;
      if (p.life > 0) continue;
      const big = kind === 'mix';
      p.s.material = big ? (k % 2 ? p.mats.lemon : p.mats.heart) : p.mats.dot;
      p.s.material.color.set(kind === 'splash' ? 0xf1dc7a : 0xffffff);
      k++;
      p.s.position.copy(center).add(this._v.set(rand(-spread, spread) * 0.4, rand(-0.05, 0.2), rand(-spread, spread) * 0.4));
      p.v.set(rand(-0.7, 0.7) * spread, rand(0.5, 1) * up, rand(-0.7, 0.7) * spread);
      p.life = p.max = big ? rand(1.2, 2.2) : rand(0.6, 1.0);
      p.g = big ? 0.6 : 4;
      p.s.scale.setScalar(big ? rand(0.1, 0.2) : rand(0.035, 0.06));
      p.s.visible = true;
    }
  }
  _updateParts(dt) {
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.v.y -= p.g * dt;
      p.s.position.addScaledVector(p.v, dt);
      p.s.material.opacity = clamp((p.life / p.max) * 1.6, 0, 1);
      if (p.life <= 0) p.s.visible = false;
    }
  }

  // ───────────── Reinicio ─────────────
  reset() {
    this.run++;
    this.tasks = [];
    this.state = 'intro'; // 'intro' | 'scene' | 'mini' | 'end' | 'done'
    this.introT = 0;
    this.introStarted = false;
    this.mg = null;
    this.wantsCursor = false;
    this.camRate = 4;
    this.fovGoal = 44;
    this.shake = 0;
    this.sayT = 0;
    this.sayWho = null;
    for (const p of this.parts) { p.life = 0; p.s.visible = false; }

    const L = this.L, S = L.spots, CH = this.CH;
    const put = (m, s) => { m.position.set(s[0], 0, s[1]); m.setHeading(s[2]); };
    for (const m of [this.yo, this.isa]) { m.talking = false; m.model.position.y = 0; m.play('idle', 0); m.setSpeed?.(1); }
    put(this.yo, S.isla_j);
    put(this.isa, S.isla_i);

    // receta desde cero: molde vacío en la isla, bol con galletas delante de Joaco
    this.pie.position.set(L.pie[0], CH, L.pie[1]);
    this.pie.rotation.set(0, 0, 0);
    this.pieBase.visible = this.pieFill.visible = this.pieMer.visible = false;
    this.meringueMat.color.set(0xfbf8ef);
    this.bowl.position.set(L.bowls.j[0], CH, L.bowls.j[1]);
    this.bowl.visible = true;
    for (const c of this.cookies) c.visible = true;
    this._setBowl(0);
    this.lemons.forEach((m) => { m.visible = true; m.scale.set(1, 1, 1); m.material.color.set(0xf6d936); });
    this._setJuice(0);
    this.jug.visible = true;
    this.seed.visible = false;
    for (const m of [...this.held.keys()]) this._hold(m, null);
    this.ovenLight.intensity = 0;
    this.ovenBulb?.material.color.set(0x8a6a50);

    // primera toma: los dos detrás de la isla, con la cocina atrás
    this._shot(0, 1.75, 3.6, 0, 0.95, -0.6);
    this.camera.fov = this.fovGoal;
    this.camera.updateProjectionMatrix();
    this._placeCamera(0, true);
    for (const m of [this.yo, this.isa]) m.update(0);
    this._hideUi();
    this.recipeEl.querySelectorAll('li').forEach((li) => li.classList.remove('on', 'done'));
  }

  _hideUi() {
    this.recipeEl.classList.add('hidden');
    this.turnEl.classList.add('hidden');
    this.sayEl.classList.add('hidden');
    this.panelEl.classList.add('hidden');
    $('#objective').classList.remove('show');
  }

  exit() {
    this.run++;
    this.tasks = [];
    this.state = 'done';
    this.mg = null;
    this.wantsCursor = false;
    this._hideUi();
  }

  // ───────────── Tareas por frame (se congelan con la pausa) ─────────────
  _task(step) { return new Promise((res) => this.tasks.push({ step, res })); }
  _sleep(s) { let t = 0; return this._task((dt) => (t += dt) >= s); }
  _tween(dur, fn) { let t = 0; return this._task((dt) => { t = Math.min(1, t + dt / dur); fn(ease(t)); return t >= 1; }); }
  _walk(m, spot, sp = WALK_SPEED) {
    const g = { x: spot[0], z: spot[1] };
    return this._task((dt) => {
      const dx = g.x - m.position.x, dz = g.z - m.position.z, d = Math.hypot(dx, dz);
      const step = sp * dt;
      if (d <= step) {
        m.position.x = g.x; m.position.z = g.z;
        m.play('idle', 0.2);
        return true;
      }
      m.position.x += (dx / d) * step;
      m.position.z += (dz / d) * step;
      m.turnToward(Math.atan2(dx, dz), dt, 10);
      m.play('walk', 0.15);
      m.setSpeed(sp / WALK_CYCLE_SPEED);
      return false;
    }).then(() => (spot[2] != null ? this._turn(m, spot[2]) : null));
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
  _talk(script) {
    const run = this.run;
    return this.dialogue.play(script, this._hooks()).then(() => { if (run === this.run) this._quiet(); });
  }
  _shot(px, py, pz, lx, ly, lz) {
    this.camGoalPos.set(px, py, pz);
    this.camGoalLook.set(lx, ly, lz);
  }

  pressA() {
    if (this.state === 'mini' && this.mg?.pressA) this.mg.pressA();
  }
  pressDir(dx, dz) {
    if (this.state === 'mini' && this.mg?.pressDir) this.mg.pressDir(dx, dz);
  }

  // ───────────── Flujo del capítulo ─────────────
  async _play() {
    const run = this.run;
    const ok = () => run === this.run;
    await this._sleep(0.6);
    if (!ok()) return;
    this.camRate = 1.4;
    this._shot(0, 1.55, 2.4, 0, 1.0, -0.8);
    await this._talk(D.INTRO);
    if (!ok()) return;
    this.recipeEl.classList.remove('hidden');
    const obj = $('#objective');
    obj.innerHTML = D.OBJETIVO;
    obj.classList.remove('show'); void obj.offsetWidth; obj.classList.add('show');

    const stages = [this._galletas, this._limones, this._relleno, this._merengue, this._horno];
    for (let i = 0; i < stages.length; i++) {
      if (!ok()) return;
      const li = this.recipeEl.querySelectorAll('li');
      li.forEach((el, k) => el.classList.toggle('on', k === i));
      const won = await stages[i].call(this, run);
      if (!ok() || !won) return;
      li[i].classList.remove('on');
      li[i].classList.add('done');
      this.audio.play('hit');
    }
    if (!ok()) return;
    await this._final(run);
  }

  async _turnBanner(who) {
    const e = this.turnEl;
    e.className = who;
    const st = D.ETAPAS[this.stageI];
    e.innerHTML = `<small>${st.nombre}</small>${D.TURNO[who]}`;
    void e.offsetWidth;
    this.audio.play('start');
    await this._sleep(1.6);
    e.classList.add('hidden');
  }

  // Panel del minijuego: arma el cuerpo y devuelve una promesa que resuelve el minijuego
  _mini(cfg) {
    const st = D.ETAPAS[this.stageI];
    this.pTitle.textContent = st.paso;
    this.pBody.innerHTML = cfg.html;
    this.pHelp.innerHTML = cfg.help;
    this.pStrikes.innerHTML = cfg.maxFallos ? Array.from({ length: cfg.maxFallos }, () => '<b>💥</b>').join('') : '';
    this.pTimer.style.display = cfg.tiempo ? '' : 'none';
    this.pTimer.classList.remove('low');
    this.panelEl.classList.remove('hidden');
    this.state = 'mini';
    return new Promise((res) => {
      this.mg = { t: 0, fallos: 0, ...cfg, finish: (r) => { if (this.mg) { this.mg = null; this.state = 'scene'; this.panelEl.classList.add('hidden'); res(r); } } };
      cfg.init?.(this.mg);
    });
  }
  _strike(mg) {
    mg.fallos++;
    const b = this.pStrikes.querySelectorAll('b');
    if (b[mg.fallos - 1]) b[mg.fallos - 1].classList.add('on');
    this.pStrikes.classList.remove('hit'); void this.pStrikes.offsetWidth; this.pStrikes.classList.add('hit');
    this.shake = 0.25;
    return mg.fallos >= mg.maxFallos;
  }
  _updateMini(dt) {
    const mg = this.mg;
    mg.t += dt;
    if (mg.tiempo) {
      const left = 1 - mg.t / mg.tiempo;
      this.pClock.style.width = (clamp(left, 0, 1) * 100).toFixed(1) + '%';
      this.pTimer.classList.toggle('low', left < 0.25);
      if (left <= 0) { mg.finish({ ok: false, why: 'tiempo' }); return; }
    }
    mg.update?.(dt, mg);
  }

  async _lose(res) {
    const run = this.run;
    this.state = 'end';
    this._hideUi();
    this._quiet();
    this.audio.stopMusic();
    await this._sleep(0.4);
    if (run !== this.run) return;
    this.state = 'done';
    this.audio.play('fail');
    this.onEnd({ win: false, ...res });
  }

  // Burbujita corta sobre un Mii (¡Una pepa!, ¡Salpicó!…)
  _say(mii, text, kind = '') {
    const el = this.sayEl;
    el.innerHTML = text.replace(/\*(.+?)\*/g, '$1');
    el.className = kind;
    void el.offsetWidth;
    el.classList.add('pop');
    this.sayWho = mii;
    this.sayT = 1.3;
  }
  _updateSay(dt) {
    if (this.sayT <= 0) return;
    this.sayT -= dt;
    if (this.sayT <= 0) { this.sayEl.classList.add('hidden'); return; }
    const p = this.sayWho.position;
    const v = this._v.set(p.x, p.y + 2.25, p.z).project(this.camera);
    this.sayEl.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px';
    this.sayEl.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
  }

  // Toma de frente al que cocina en la isla
  _islandShot(m) {
    const x = m.position.x;
    this._shot(x * 0.5, 2.0, 2.5, x * 0.6, 0.95, -0.55);
  }

  // ───────────── 1 · La base: Joaco muele las galletas ─────────────
  async _galletas(run) {
    this.stageI = 0;
    const p = this.yo, isa = this.isa;
    this.camRate = 2.2;
    this.fovGoal = 44;
    this._islandShot(p);
    await this._turnBanner('yo');
    if (run !== this.run) return false;
    isa.faceToward(p.position, 1, 1);
    await this._talk(D.GALLETAS_ANTES);
    if (run !== this.run) return false;
    this._hold(p, 'uslero', 'both');
    p.play('mash', 0.2);
    p.setSpeed(0);
    const crumbs = new THREE.Color(0xc9925a);
    const res = await this._mini({
      tiempo: GALLETAS.tiempo,
      html: `<span class="c6-label">🍪</span><div class="c6-bar big"><i></i></div><span class="c6-label">⏳</span>`,
      help: D.GALLETAS_AYUDA,
      init: (mg) => { mg.p = 0; mg.bar = this.pBody.querySelector('.c6-bar i'); mg.speed = 0; },
      pressA: () => {
        const mg = this.mg;
        mg.p = Math.min(100, mg.p + GALLETAS.porGolpe);
        mg.speed = Math.min(2.5, mg.speed + 0.6);
        this.audio.play('crunch');
        this.shake = Math.max(this.shake, 0.06);
        if (mg.p >= 100) mg.finish({ ok: true });
      },
      update: (dt, mg) => {
        mg.p = Math.max(0, mg.p - GALLETAS.baja * dt);
        mg.speed = Math.max(0, mg.speed - dt * 3);
        p.setSpeed(mg.speed);
        mg.bar.style.width = mg.p.toFixed(1) + '%';
        const k = mg.p / 100;
        this.cookies.forEach((c, i) => { c.visible = k < 1 - (i + 1) / (this.cookies.length + 1); });
        this._setBowl(k * 0.35, crumbs);
      },
    });
    if (run !== this.run) return false;
    p.setSpeed(1);
    if (!res.ok) { await this._lose(D.PERDER_GALLETAS); return false; }
    this.audio.play('yay');
    p.play('idle', 0.3);
    this._hold(p, null);
    await this._sleep(0.4);
    if (run !== this.run) return false;
    // al molde: la base aparece
    this._setBowl(0);
    this.pieBase.visible = true;
    this.audio.play('sit');
    this._burst(this._v2.set(this.pie.position.x, this.CH + 0.1, this.pie.position.z), 6, 0.3, 'splash', 0.6);
    await this._talk(D.GALLETAS_FIN);
    return run === this.run;
  }

  // ───────────── 2 · Los limones: la Isa exprime ─────────────
  async _limones(run) {
    this.stageI = 1;
    const p = this.yo, isa = this.isa, S = this.L.spots;
    this.camRate = 1.8;
    this._shot(0.6, 1.7, 0.4, -0.4, 0.9, -2.6);
    await Promise.all([this._walk(isa, S.meson), this._walk(p, S.meson_j)]);
    if (run !== this.run) return false;
    // cámara de lado, mirando la tabla con los limones
    this.fovGoal = 42;
    this._shot(1.3, 1.85, -1.1, -0.2, 0.9, -2.5);
    await this._turnBanner('isa');
    if (run !== this.run) return false;
    await this._talk(D.LIMONES_ANTES);
    if (run !== this.run) return false;
    this._hold(isa, 'medio', 'r');
    isa.play('mash', 0.2);
    isa.setSpeed(0);
    const N = LIMONES.n, PER = LIMONES.porLimon;
    const lemonsHtml = Array.from({ length: N }, () => '<span>🍋</span>').join('');
    // momentos en que cae una pepa (repartidos en la etapa)
    const seedTimes = Array.from({ length: LIMONES.pepas }, (_, i) => 2.2 + i * ((LIMONES.tiempo - 5) / LIMONES.pepas) + rand(0, 1.6));
    const jugTop = this._v2.set(this.L.jug[0], this.CH + 0.42, this.L.jug[1]).clone();
    const res = await this._mini({
      tiempo: LIMONES.tiempo,
      maxFallos: LIMONES.maxFallos,
      html: `<div class="c6-key l">←</div><div class="c6-col"><div class="c6-lemons">${lemonsHtml}</div><div class="c6-bar"><i></i></div></div><div class="c6-key r">→</div>
             <div class="c6-pepa hidden">${D.PEPA_AVISO}</div>`,
      help: D.LIMONES_AYUDA,
      init: (mg) => {
        mg.sq = 0; mg.last = 0; mg.seed = null; mg.seedI = 0; mg.speed = 0;
        mg.keys = { [-1]: this.pBody.querySelector('.c6-key.l'), [1]: this.pBody.querySelector('.c6-key.r') };
        mg.icons = [...this.pBody.querySelectorAll('.c6-lemons span')];
        mg.bar = this.pBody.querySelector('.c6-bar i');
        mg.alert = this.pBody.querySelector('.c6-pepa');
        mg.paint = () => {
          const done = Math.floor(mg.sq / PER);
          mg.icons.forEach((e, i) => { e.classList.toggle('done', i < done); e.classList.toggle('cur', i === done); });
          mg.bar.style.width = (((mg.sq % PER) / PER) * 100).toFixed(0) + '%';
          for (const d of [-1, 1]) mg.keys[d].classList.toggle('next', mg.last !== d);
        };
        mg.paint();
      },
      pressDir: (dx) => {
        const mg = this.mg;
        if (!dx) return;
        const k = mg.keys[dx];
        k.classList.remove('press'); void k.offsetWidth; k.classList.add('press');
        setTimeout(() => k.classList.remove('press'), 90);
        if (dx === mg.last) return; // hay que alternar
        mg.last = dx;
        mg.sq++;
        mg.speed = Math.min(2.4, mg.speed + 0.5);
        this.audio.play('squeeze');
        const li = Math.floor((mg.sq - 1) / PER);
        const lemon = this.lemons[li];
        if (lemon) {
          const f = 1 - ((mg.sq - 1) % PER + 1) / PER * 0.55;
          lemon.scale.set(1, f, 1);
          if ((mg.sq % PER) === 0) { lemon.material.color.set(0xd8c56a); this.audio.play('drip'); }
        }
        this._setJuice(mg.sq / (N * PER));
        mg.paint();
        if (mg.sq >= N * PER) mg.finish({ ok: true });
      },
      pressA: () => {
        const mg = this.mg;
        if (!mg.seed) return;
        // ¡sacó la pepa a tiempo!
        mg.seed = null;
        this.seed.visible = false;
        mg.alert.classList.add('hidden');
        this.wantsCursor = false;
        this.audio.play('hit');
        this._say(isa, D.pepaFuera(), 'good');
      },
      update: (dt, mg) => {
        mg.speed = Math.max(0, mg.speed - dt * 3);
        isa.setSpeed(mg.speed);
        if (!mg.seed && mg.seedI < seedTimes.length && mg.t >= seedTimes[mg.seedI]) {
          mg.seedI++;
          mg.seed = { t: 0 };
          this.seed.visible = true;
          mg.alert.classList.remove('hidden');
          this.wantsCursor = true; // se puede sacar con un clic
          this.audio.play('alert');
          this._say(isa, D.PEPA, 'bad');
        }
        if (mg.seed) {
          mg.seed.t += dt;
          const k = mg.seed.t / LIMONES.ventana;
          this.seed.position.set(jugTop.x + Math.sin(mg.seed.t * 9) * 0.02, jugTop.y - k * 0.3, jugTop.z);
          if (k >= 1) {
            mg.seed = null;
            this.seed.visible = false;
            mg.alert.classList.add('hidden');
            this.wantsCursor = false;
            this.audio.play('miss');
            this._say(isa, D.pepaDentro(), 'bad');
            if (this._strike(mg)) mg.finish({ ok: false, why: 'pepas' });
          }
        }
      },
    });
    if (run !== this.run) return false;
    isa.setSpeed(1);
    this.seed.visible = false;
    this.wantsCursor = false;
    if (!res.ok) { await this._lose(res.why === 'pepas' ? D.PERDER_LIMONES_PEPAS : D.PERDER_LIMONES_TIEMPO); return false; }
    this.audio.play('yay');
    isa.play('cheer', 0.2);
    this._hold(isa, null);
    await this._sleep(0.8);
    if (run !== this.run) return false;
    isa.play('idle', 0.3);
    await this._talk(D.LIMONES_FIN);
    if (run !== this.run) return false;
    // vuelven a la isla; el jugo va con ellos
    this.camRate = 1.6;
    this._shot(0, 1.75, 3.0, 0, 0.95, -0.6);
    this.jug.visible = false;
    const S2 = this.L.spots;
    await Promise.all([this._walk(isa, S2.isla_i), this._walk(p, S2.isla_j)]);
    return run === this.run;
  }

  // ───────────── 3 · El relleno: Joaco revuelve, la Isa echa ─────────────
  async _relleno(run) {
    this.stageI = 2;
    const p = this.yo, isa = this.isa;
    this.bowl.position.set(this.L.bowls.j[0], this.CH, this.L.bowls.j[1]);
    for (const c of this.cookies) c.visible = false;
    this._setBowl(0);
    this.camRate = 2.2;
    this.fovGoal = 44;
    this._islandShot(p);
    await this._turnBanner('yo');
    if (run !== this.run) return false;
    await this._talk(D.RELLENO_ANTES);
    if (run !== this.run) return false;
    this._hold(p, 'cuchara', 'r');
    p.play('stir', 0.2);
    p.setSpeed(0);
    const milk = new THREE.Color(0xf3e6c4), lemon = new THREE.Color(0xf2d64b), col = new THREE.Color();
    const NEED = RELLENO.vueltas * 4;
    const pours = [0, Math.round(NEED * 0.3), Math.round(NEED * 0.6)];
    const res = await this._mini({
      tiempo: RELLENO.tiempo,
      maxFallos: RELLENO.maxFallos,
      html: `<div class="c6-wheel"><span class="u">↑</span><span class="r">→</span><span class="d">↓</span><span class="l">←</span></div>
             <div class="c6-col"><span class="c6-label">🥣</span><div class="c6-bar big"><i></i></div></div>`,
      help: D.RELLENO_AYUDA,
      init: (mg) => {
        mg.i = 0; mg.n = 0; mg.cool = 0; mg.speed = 0; mg.pour = 0;
        mg.wheel = this.pBody.querySelector('.c6-wheel');
        mg.bar = this.pBody.querySelector('.c6-bar i');
        mg.paint = () => {
          mg.wheel.querySelectorAll('span').forEach((e) => e.classList.toggle('next', e.classList.contains(RUEDA[mg.i][2])));
          mg.bar.style.width = ((mg.n / NEED) * 100).toFixed(1) + '%';
        };
        mg.paint();
      },
      pressDir: (dx, dz) => {
        const mg = this.mg;
        const [wx, wz] = RUEDA[mg.i];
        if (dx === wx && dz === wz) {
          mg.i = (mg.i + 1) % 4;
          mg.n++;
          mg.speed = Math.min(2.2, mg.speed + 0.45);
          if (mg.n % 2 === 0) this.audio.play('tick');
          mg.paint();
          if (mg.n >= NEED) mg.finish({ ok: true });
        } else if (mg.cool <= 0) {
          mg.cool = 0.45;
          this.audio.play('splash');
          this._say(p, D.salpica(), 'bad');
          mg.wheel.classList.remove('bad'); void mg.wheel.offsetWidth; mg.wheel.classList.add('bad');
          this._burst(this._v2.set(this.bowl.position.x, this.CH + 0.18, this.bowl.position.z), 8, 0.6, 'splash', 1.2);
          if (this._strike(mg)) mg.finish({ ok: false, why: 'salpica' });
        }
      },
      update: (dt, mg) => {
        mg.cool -= dt;
        mg.speed = Math.max(0, mg.speed - dt * 2.5);
        p.setSpeed(mg.speed);
        // la Isa va echando los ingredientes
        if (mg.pour < pours.length && mg.n >= pours[mg.pour]) {
          this._say(isa, D.ECHA[mg.pour]);
          isa.play('offer', 0.2);
          this._hold(isa, mg.pour === 2 ? 'medio' : 'tarro', 'r');
          this.audio.play('drip');
          mg.pourT = 1.1;
          mg.pour++;
        }
        if (mg.pourT > 0) {
          mg.pourT -= dt;
          if (mg.pourT <= 0) { isa.play('idle', 0.3); this._hold(isa, null); }
        }
        const k = mg.n / NEED;
        this._setBowl(Math.min(0.55, 0.15 + mg.pour * 0.13), col.copy(milk).lerp(lemon, clamp(k * 1.2, 0, 1)));
      },
    });
    if (run !== this.run) return false;
    p.setSpeed(1);
    this._hold(isa, null);
    if (!res.ok) { await this._lose(res.why === 'salpica' ? D.PERDER_RELLENO_SALPICA : D.PERDER_RELLENO_TIEMPO); return false; }
    this.audio.play('yay');
    p.play('idle', 0.3);
    isa.play('idle', 0.3);
    this._hold(p, null);
    await this._sleep(0.3);
    if (run !== this.run) return false;
    // relleno al molde
    this._setBowl(0);
    this.pieFill.visible = true;
    this.audio.play('sit');
    await this._talk(D.RELLENO_FIN);
    return run === this.run;
  }

  // ───────────── 4 · El merengue: la Isa bate ─────────────
  async _merengue(run) {
    this.stageI = 3;
    const p = this.yo, isa = this.isa;
    this.bowl.position.set(this.L.bowls.i[0], this.CH, this.L.bowls.i[1]);
    this._setBowl(0.12, 0xf7f4ea);
    this.camRate = 2.2;
    this._islandShot(isa);
    await this._turnBanner('isa');
    if (run !== this.run) return false;
    await this._talk(D.MERENGUE_ANTES);
    if (run !== this.run) return false;
    this._hold(isa, 'batidor', 'r');
    isa.play('stir', 0.2);
    isa.setSpeed(0);
    const [z0, z1] = MERENGUE.zona;
    const res = await this._mini({
      tiempo: MERENGUE.tiempo,
      maxFallos: MERENGUE.maxFallos,
      html: `<div class="c6-col">
          <div class="c6-row"><span class="c6-label">${D.VELOCIDAD}</span>
            <div class="c6-gauge"><div class="zone" style="left:${z0}%;width:${z1 - z0}%"></div><div class="zone hot"></div><div class="needle"></div></div></div>
          <div class="c6-row"><span class="c6-label">${D.PUNTO_NIEVE}</span><div class="c6-bar"><i></i></div></div>
        </div>`,
      help: D.MERENGUE_AYUDA,
      init: (mg) => {
        mg.s = 0; mg.nieve = 0; mg.hot = 0; mg.slow = 0; mg.sugar = 0;
        mg.needle = this.pBody.querySelector('.needle');
        mg.bar = this.pBody.querySelector('.c6-bar i');
      },
      pressA: () => {
        const mg = this.mg;
        mg.s = Math.min(100, mg.s + MERENGUE.porGolpe);
        this.audio.play('whisk');
      },
      update: (dt, mg) => {
        mg.s = Math.max(0, mg.s - mg.s * MERENGUE.freno * dt);
        isa.setSpeed(0.4 + mg.s / 30);
        const inZone = mg.s >= z0 && mg.s <= z1;
        if (inZone) mg.nieve += dt;
        if (mg.s > MERENGUE.alto) {
          mg.hot += dt;
          if (mg.hot >= MERENGUE.maxAlto) {
            mg.hot = 0;
            mg.s = 30;
            this.audio.play('splash');
            this._say(isa, D.muyRapido(), 'bad');
            this._burst(this._v2.set(this.bowl.position.x, this.CH + 0.2, this.bowl.position.z), 10, 0.8, 'white', 1.6);
            if (this._strike(mg)) { mg.finish({ ok: false, why: 'salpica' }); return; }
          }
        } else mg.hot = Math.max(0, mg.hot - dt);
        // Joaco va echando el azúcar de a poco
        if (mg.sugar < 3 && mg.nieve > (mg.sugar + 0.5) * (MERENGUE.nieve / 3.5)) {
          mg.sugar++;
          p.play('offer', 0.2);
          this._hold(p, 'azucar', 'r');
          this.audio.play('drip');
          mg.sugarT = 1.0;
        }
        if (mg.sugarT > 0) { mg.sugarT -= dt; if (mg.sugarT <= 0) { p.play('idle', 0.3); this._hold(p, null); } }
        mg.needle.style.left = mg.s.toFixed(1) + '%';
        const k = mg.nieve / MERENGUE.nieve;
        mg.bar.style.width = (clamp(k, 0, 1) * 100).toFixed(1) + '%';
        this._setBowl(0.12 + 0.75 * clamp(k, 0, 1), 0xffffff);
        if (k >= 1) mg.finish({ ok: true });
      },
    });
    if (run !== this.run) return false;
    isa.setSpeed(1);
    this._hold(p, null);
    if (!res.ok) { await this._lose(res.why === 'salpica' ? D.PERDER_MERENGUE_SALPICA : D.PERDER_MERENGUE_TIEMPO); return false; }
    this.audio.play('yay');
    isa.play('cheer', 0.2);
    p.play('idle', 0.3);
    this._hold(isa, null);
    await this._sleep(0.7);
    if (run !== this.run) return false;
    isa.play('idle', 0.3);
    this._setBowl(0);
    this.pieMer.visible = true;
    this.audio.play('sit');
    await this._talk(D.MERENGUE_FIN);
    return run === this.run;
  }

  // ───────────── 5 · El horno: los dos ─────────────
  async _horno(run) {
    this.stageI = 4;
    const p = this.yo, isa = this.isa, L = this.L, S = L.spots, CH = this.CH;
    this.bowl.visible = false;
    // Joaco lleva el pie al horno
    this.camRate = 1.6;
    this.fovGoal = 46;
    this._shot(1.3, 1.65, 0.9, 1.4, 0.7, -2.2);
    const from = this.pie.position.clone();
    const to = new THREE.Vector3(L.ovenPie[0], L.ovenPie[2], L.ovenPie[1]);
    await Promise.all([this._walk(p, S.horno_j), this._walk(isa, S.horno_i)]);
    if (run !== this.run) return false;
    p.play('offer', 0.2);
    await this._tween(1.0, (t) => {
      this.pie.position.lerpVectors(from, to, t);
      this.pie.position.y += Math.sin(t * Math.PI) * 0.35;
    });
    if (run !== this.run) return false;
    p.play('idle', 0.3);
    this.ovenLight.intensity = 2.2;
    this.ovenBulb?.material.color.set(0xffb35c);
    this.audio.play('sit');
    // cámara frente al horno, con los dos mirando a los lados
    this.fovGoal = 50;
    this._shot(1.6, 1.2, -0.35, 1.6, 0.3, -2.6);
    await this._turnBanner('ambos');
    if (run !== this.run) return false;
    await this._talk(D.HORNO_ANTES);
    if (run !== this.run) return false;
    p.faceToward(to, 1, 1); isa.faceToward(to, 1, 1);
    const [z0, z1] = HORNO.zona;
    const res = await this._mini({
      maxFallos: HORNO.maxFallos,
      html: `<div class="c6-col"><div class="c6-row"><span class="c6-label">🔥</span>
          <div class="c6-gauge oven"><div class="zone" style="left:${z0}%;width:${z1 - z0}%"></div><div class="needle"></div></div>
          <span class="c6-label">${D.DORADO}</span></div></div>`,
      help: D.HORNO_AYUDA,
      init: (mg) => { mg.b = 0; mg.needle = this.pBody.querySelector('.needle'); },
      pressA: () => {
        const mg = this.mg;
        if (mg.b >= z0 && mg.b <= z1) { mg.finish({ ok: true }); return; }
        if (mg.b > z1) { mg.finish({ ok: false, why: 'quemado' }); return; }
        this.audio.play('miss');
        this._say(isa, D.todavia(), 'bad');
        if (this._strike(mg)) mg.finish({ ok: false, why: 'apurado' });
      },
      update: (dt, mg) => {
        // dora lento al principio y más rápido al final
        mg.b = Math.min(100, mg.b + HORNO.vel * dt * (0.7 + mg.b / 160));
        brownColor(mg.b, this.meringueMat.color);
        mg.needle.style.left = mg.b.toFixed(1) + '%';
        this.ovenLight.intensity = 2.0 + Math.sin(this.time * 11) * 0.25;
        if (mg.b >= 100) mg.finish({ ok: false, why: 'quemado' });
      },
    });
    if (run !== this.run) return false;
    if (!res.ok) {
      if (res.why === 'quemado') {
        brownColor(100, this.meringueMat.color);
        this.audio.play('splash');
        isa.play('dizzy', 0.2); p.play('dizzy', 0.2);
        await this._sleep(0.8);
      }
      await this._lose(res.why === 'apurado' ? D.PERDER_HORNO_APURADO : D.PERDER_HORNO_QUEMADO);
      return false;
    }
    this.audio.play('ding');
    this.ovenLight.intensity = 0;
    this.ovenBulb?.material.color.set(0x8a6a50);
    await this._sleep(0.6);
    if (run !== this.run) return false;
    // lo sacan y lo llevan a la isla
    this.camRate = 1.5;
    this.fovGoal = 44;
    this._shot(0, 1.6, 2.2, 0, 0.95, -0.5);
    p.play('offer', 0.2);
    await this._tween(1.0, (t) => {
      this.pie.position.lerpVectors(to, from, t);
      this.pie.position.y += Math.sin(t * Math.PI) * 0.45;
    });
    if (run !== this.run) return false;
    await Promise.all([this._walk(p, S.isla_j), this._walk(isa, S.isla_i)]);
    if (run !== this.run) return false;
    p.play('cheer', 0.2); isa.play('cheer', 0.2);
    this.audio.play('yay');
    this._burst(this._v2.set(0, CH + 0.4, this.pie.position.z), 24, 1.0);
    await this._sleep(1.2);
    if (run !== this.run) return false;
    p.play('idle', 0.3); isa.play('idle', 0.3);
    await this._talk(D.HORNO_FIN);
    return run === this.run;
  }

  // ───────────── Final: se lo comen juntos ─────────────
  async _final(run) {
    const p = this.yo, isa = this.isa;
    this.state = 'end';
    this.panelEl.classList.add('hidden');
    this.audio.startMusic('amor');
    this.camRate = 1.2;
    this.fovGoal = 40;
    this._shot(0, 1.5, 2.1, 0, 1.05, -0.8);
    await Promise.all([this._turn(p, 0.45), this._turn(isa, -0.45)]);
    if (run !== this.run) return;
    p.play('eat', 0.3);
    isa.play('eat', 0.3);
    isa.setSpeed(1.15);
    await this._sleep(1.6);
    if (run !== this.run) return;
    await this._talk(D.FINAL);
    if (run !== this.run) return;
    $('#blush').style.opacity = 0.3;
    p.play('cheer', 0.2); isa.play('cheer', 0.2);
    isa.setSpeed(1);
    this._burst(this._v2.set(0, this.CH + 0.6, -0.6), 40, 1.3, 'mix', 1.8);
    await this._sleep(1.4);
    if (run !== this.run) return;
    $('#blush').style.opacity = 0;
    this.recipeEl.classList.add('hidden');
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
    if (this.state === 'mini' && this.mg) this._updateMini(dt);
    this.yo.update(dt);
    this.isa.update(dt);
    this._placeTools();
    this._updateParts(dt);
    this._updateSay(dt);
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
    this.shake = Math.max(0, this.shake - dt);
    if (this.shake > 0) this.camera.rotateZ(Math.sin(this.time * 47) * 0.04 * this.shake);
    for (const o of this.ceilingProps) o.visible = this.camPos.y < 2.0;
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }
}
