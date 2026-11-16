// Capítulo 7 · El retrato
// Picnic en el parque (tools/build_parque.py → assets/escenarios/parque.glb): la Isa y Joaco se pintan el uno
// al otro. Se juega como Joaco:
//   1 · Mirarla: primer plano de la Isa desde los ojos de Joaco, unos segundos para memorizar su cara.
//   2 · Pintarla: un lienzo tapa la vista. Caen del cielo las cejas, los ojos, la nariz y la boca; se mueven
//       con ← → y con A quedan pintados donde están. Mientras más cerca de su lugar real, más parecido.
//   3 · Mostrarse los cuadros: se compara el retrato con la Isa de verdad y ella muestra el suyo de Joaco.
//
// Los rasgos son los del Mii de la Isa de verdad: al cargar se saca una "foto" de su cabeza sin cara (la base
// del lienzo) y una de cada rasgo por separado (las cejas, ojos y boca vienen juntos en la textura "Mask" del
// .glb; se separan por manchas conectadas). Así, si se cambia el Mii, el minijuego cambia solo.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';
import { loadTemplate, Mii } from './mii.js';
import * as D from './mision7_dialogos.js';

const TAU = Math.PI * 2;

// Lienzo (píxeles lógicos) y encuadre de la "foto" de la cabeza (en metros del Mii sin escalar)
const PW = 700, PH = 800;
const VIEW = { cy: 1.45, hw: 0.7, hh: 0.8 };

// Ajustes del minijuego
const MIRAR = { tiempo: 8, minimo: 1.2 };
const CAER = { vel: 130, acel: 13, rapido: 2.8, mover: 340, deriva: 34, giro: 0.2 };
// nota de cada rasgo: 100 en su lugar exacto, 0 a `dist` píxeles. Se gana solo con MÁS de `ganar` % de parecido;
// desde `genial` la Isa reacciona con más entusiasmo
const NOTA = { dist: 105, angulo: 0.6, ganar: 80, genial: 92 };

const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const ease = (t) => t * t * (3 - 2 * t);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lam = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const plain = (s) => s.replace(/\{w\}/g, '').replace(/\*(.+?)\*/g, '$1');

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function makeBlobTexture(inner = 'rgba(30,50,20,0.36)', mid = 'rgba(30,50,20,0.16)') {
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.55, mid);
  grad.addColorStop(1, 'rgba(30,50,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function makeEmojiTexture(ch, color) {
  const c = makeCanvas(64, 64);
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

// ───────────── Retratos: "fotos" del Mii y sus rasgos sueltos ─────────────
// Manchas conectadas de una imagen RGBA (por alfa). Devuelve las etiquetas y las manchas grandes.
function labelBlobs(data, w, h, thr = 20, min = 150) {
  const lab = new Int32Array(w * h);
  const blobs = [];
  const stack = [];
  for (let i = 0; i < w * h; i++) {
    if (lab[i] || data[i * 4 + 3] <= thr) continue;
    const b = { id: blobs.length + 1, n: 0, x0: w, y0: h, x1: 0, y1: 0, sx: 0, sy: 0 };
    lab[i] = b.id;
    stack.push(i);
    while (stack.length) {
      const k = stack.pop(), x = k % w, y = (k - x) / w;
      b.n++; b.sx += x; b.sy += y;
      if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
      if (x > 0 && !lab[k - 1] && data[(k - 1) * 4 + 3] > thr) { lab[k - 1] = b.id; stack.push(k - 1); }
      if (x < w - 1 && !lab[k + 1] && data[(k + 1) * 4 + 3] > thr) { lab[k + 1] = b.id; stack.push(k + 1); }
      if (y > 0 && !lab[k - w] && data[(k - w) * 4 + 3] > thr) { lab[k - w] = b.id; stack.push(k - w); }
      if (y < h - 1 && !lab[k + w] && data[(k + w) * 4 + 3] > thr) { lab[k + w] = b.id; stack.push(k + w); }
    }
    blobs.push(b);
  }
  return { lab, blobs: blobs.filter((b) => b.n >= min) };
}

// Recorta una imagen a lo que tiene pintado. Devuelve { img, cx, cy, w, h } (centro en la imagen original).
function cropAlpha(cv, thr = 10, pad = 5) {
  const { width: w, height: h } = cv;
  const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] <= thr) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const img = makeCanvas(x1 - x0 + 1, y1 - y0 + 1);
  img.getContext('2d').drawImage(cv, -x0, -y0);
  return { img, w: img.width, h: img.height, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2 };
}

// Papel del lienzo: crema con grano y una mancha de acuarela de fondo
function makePaper(tint) {
  const c = makeCanvas(PW, PH);
  const g = c.getContext('2d');
  g.fillStyle = '#fbf5e6';
  g.fillRect(0, 0, PW, PH);
  for (let i = 0; i < 26; i++) { // acuarela: círculos translúcidos encimados
    const a = rand(0, TAU), r = rand(0, 150);
    const x = PW / 2 + Math.cos(a) * r, y = PH * 0.47 + Math.sin(a) * r * 1.1, rr = rand(150, 250);
    const grad = g.createRadialGradient(x, y, rr * 0.2, x, y, rr);
    grad.addColorStop(0, tint.replace('A', '0.085'));
    grad.addColorStop(0.8, tint.replace('A', '0.05'));
    grad.addColorStop(1, tint.replace('A', '0'));
    g.fillStyle = grad;
    g.fillRect(0, 0, PW, PH);
  }
  for (let i = 0; i < 9000; i++) { // grano
    g.fillStyle = Math.random() < 0.5 ? 'rgba(120,95,60,0.05)' : 'rgba(255,255,255,0.12)';
    g.fillRect(rand(0, PW), rand(0, PH), rand(1, 2.6), rand(1, 2.6));
  }
  return c;
}

function drawSignature(g, text, color) {
  g.save();
  g.font = 'italic 700 40px "Segoe Script", "Brush Script MT", "Comic Sans MS", cursive';
  g.textAlign = 'right';
  g.textBaseline = 'alphabetic';
  g.fillStyle = color;
  g.translate(PW - 34, PH - 34);
  g.rotate(-0.06);
  g.fillText(text, 0, 0);
  g.restore();
}

export class Mission7 {
  constructor({ audio, dialogue, onEnd }) {
    this.audio = audio;
    this.dialogue = dialogue;
    this.onEnd = onEnd;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 400);
    this.hint = D.AYUDA;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camGoalPos = new THREE.Vector3();
    this.camGoalLook = new THREE.Vector3();
    this.tasks = [];
    this.time = 0;
    this.run = 0;
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._buildDom();
    // en las tarjetas del final, un clic también sirve para continuar
    $('#game').addEventListener('mousedown', () => { if (this.state === 'card') this.pressA(); });
  }

  // ───────────── Interfaz propia del capítulo ─────────────
  _buildDom() {
    const layer = document.createElement('div');
    layer.id = 'c7Layer';
    layer.innerHTML = `
      <div id="c7Look" class="hidden">
        <h3>👀 ${D.MIRAR_TITULO}</h3>
        <p>${D.MIRAR_TEXTO}</p>
        <div class="c7-clock"><i></i></div>
      </div>
      <div id="c7Skip" class="hidden">${D.MIRAR_LISTO}</div>
      <div id="c7Easel">
        <div class="c7-board"><canvas id="c7Canvas" width="${PW}" height="${PH}"></canvas></div>
        <div class="c7-side">
          <h3>🎨 ${D.LIENZO_TITULO}</h3>
          <ol></ol>
          <div class="c7-think hidden"></div>
          <div class="c7-help">${D.LIENZO_AYUDA}</div>
        </div>
      </div>
      <div id="c7Banner" class="hidden"></div>
      <div id="c7Say" class="hidden"></div>
      <div id="c7Card" class="hidden">
        <div class="c7-pics">
          <figure class="real"><img alt=""><figcaption>${D.TARJETA.real}</figcaption></figure>
          <figure class="mine"><img alt=""><figcaption>${D.TARJETA.mio}</figcaption></figure>
        </div>
        <div class="c7-score"><span>${D.TARJETA.parecido}</span><b>0%</b></div>
        <div class="c7-parts"></div>
        <div class="c7-go">${D.TARJETA.seguir}</div>
      </div>`;
    document.body.appendChild(layer);
    this.lookEl = $('#c7Look');
    this.lookClock = layer.querySelector('.c7-clock i');
    this.skipEl = $('#c7Skip');
    this.easelEl = $('#c7Easel');
    this.listEl = layer.querySelector('.c7-side ol');
    this.thinkEl = layer.querySelector('.c7-think');
    this.bannerEl = $('#c7Banner');
    this.sayEl = $('#c7Say');
    this.cardEl = $('#c7Card');
    this.paintCv = $('#c7Canvas');
    this.pg2d = this.paintCv.getContext('2d');
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

    // Sol de media tarde
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

    // sombra del árbol grande sobre el pasto y parte del mantel
    const shade = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: makeBlobTexture('rgba(20,50,30,0.34)', 'rgba(20,50,30,0.22)'), transparent: true, depthWrite: false }));
    shade.position.set(L.bigTree[0] + 0.6, 0.05, L.bigTree[1] + 0.8);
    shade.scale.set(10.5, 1, 8.5);
    shade.renderOrder = 1;
    scene.add(shade);

    this.blobMat = new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, depthWrite: false });
    this.blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.isa = new Mii(tIsa, { id: 'isa' });
    this.yo = new Mii(tYo, { id: 'yo' });
    for (const m of [this.isa, this.yo]) {
      const blob = new THREE.Mesh(this.blobGeo, this.blobMat);
      blob.scale.setScalar(1.25); blob.position.y = 0.03; blob.renderOrder = 2;
      m.root.add(blob);
      scene.add(m.root);
    }

    this._buildPortraits(tIsa, tYo);
    this._buildEasels();
    this._buildTools();
    this._buildBurst();
    this.reset();
  }

  // Saca las fotos de los Miis con un renderizador aparte (solo durante la carga)
  _buildPortraits(tIsa, tYo) {
    const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setSize(PW, PH, false);
    r.setClearColor(0x000000, 0);
    r.toneMapping = THREE.NoToneMapping;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xead8cc, 2.5));
    const key = new THREE.DirectionalLight(0xffffff, 0.7);
    key.position.set(0.5, 1, 2);
    scene.add(key);
    const cam = new THREE.OrthographicCamera(-VIEW.hw, VIEW.hw, VIEW.hh, -VIEW.hh, 0.1, 20);
    cam.position.set(0, VIEW.cy, 6);
    cam.lookAt(0, VIEW.cy, 0);

    const pose = (tpl) => {
      const m = new Mii(tpl, { scale: 1 });
      m.mixer.setTime(0.99); // instante del idle en que mira justo al frente
      scene.add(m.root);
      m.root.updateMatrixWorld(true);
      return m;
    };
    const snap = (m, show) => {
      for (const mesh of m.meshes) mesh.visible = show(mesh.material.name || '');
      r.render(scene, cam);
      const c = makeCanvas(PW, PH);
      c.getContext('2d', { willReadFrequently: true }).drawImage(r.domElement, 0, 0);
      return c;
    };
    const FACE = ['Mask', 'Noseline'];

    // ── la Isa: completa, sin cara, y cada rasgo por separado ──
    const isa = pose(tIsa);
    this.isaReal = snap(isa, () => true);
    const base = snap(isa, (n) => !FACE.includes(n));
    const pieces = [];

    const maskMesh = isa.meshes.find((m) => m.material.name === 'Mask');
    if (maskMesh?.material.map) {
      const orig = maskMesh.material, src = orig.map.image;
      const tw = src.width, th = src.height;
      const tc = makeCanvas(tw, th);
      const tg = tc.getContext('2d', { willReadFrequently: true });
      tg.drawImage(src, 0, 0);
      const px = tg.getImageData(0, 0, tw, th);
      const { lab, blobs } = labelBlobs(px.data, tw, th);
      for (const b of blobs) {
        // textura con solo esta mancha (más su borde suave)
        const out = new ImageData(tw, th);
        const m = 4;
        for (let y = Math.max(0, b.y0 - m); y <= Math.min(th - 1, b.y1 + m); y++) {
          for (let x = Math.max(0, b.x0 - m); x <= Math.min(tw - 1, b.x1 + m); x++) {
            const k = y * tw + x;
            if (lab[k] !== b.id && lab[k] !== 0) continue;
            out.data[k * 4] = px.data[k * 4]; out.data[k * 4 + 1] = px.data[k * 4 + 1];
            out.data[k * 4 + 2] = px.data[k * 4 + 2]; out.data[k * 4 + 3] = px.data[k * 4 + 3];
          }
        }
        const pc = makeCanvas(tw, th);
        pc.getContext('2d').putImageData(out, 0, 0);
        const tex = new THREE.CanvasTexture(pc);
        tex.flipY = orig.map.flipY; tex.colorSpace = orig.map.colorSpace;
        tex.wrapS = orig.map.wrapS; tex.wrapT = orig.map.wrapT;
        const mat = orig.clone();
        mat.map = tex;
        maskMesh.material = mat;
        const p = cropAlpha(snap(isa, (n) => n === 'Mask'));
        tex.dispose(); mat.dispose();
        if (p) pieces.push({ ...p, ty: (b.sy / b.n) * (1024 / th) });
      }
      maskMesh.material = orig;
    }
    // filas de la textura: cejas arriba, ojos al medio, boca abajo
    pieces.sort((a, b) => a.ty - b.ty);
    const rows = [];
    for (const p of pieces) {
      const last = rows[rows.length - 1];
      if (last && p.ty - last[last.length - 1].ty < 30) last.push(p); else rows.push([p]);
    }
    const kinds = rows.length === 3 ? ['ceja', 'ojo', 'boca'] : rows.map(() => 'rasgo');
    const ordered = [];
    rows.forEach((row, i) => {
      row.sort((a, b) => a.cx - b.cx);
      const names = D.PIEZAS[kinds[i]];
      row.forEach((p, k) => {
        p.kind = kinds[i];
        p.label = typeof names === 'string' ? names : row.length === 2 ? names[k] : names[2];
        ordered.push(p);
      });
    });
    const nose = cropAlpha(snap(isa, (n) => n === 'Noseline'));
    if (nose) {
      nose.kind = 'nariz'; nose.label = D.PIEZAS.nariz;
      const at = kinds.includes('boca') ? ordered.findIndex((p) => p.kind === 'boca') : ordered.length;
      ordered.splice(at, 0, nose);
    }
    this.pieces = ordered;
    scene.remove(isa.root);

    // la nariz en relieve delataría dónde va todo: se tapa con el color de la piel de sus mejillas
    {
      const bg = base.getContext('2d', { willReadFrequently: true });
      const nx = PW / 2, ny = (nose?.cy ?? PH * 0.53) - 22;
      const a = bg.getImageData(nx - 85, ny + 5, 1, 1).data, b = bg.getImageData(nx + 85, ny + 5, 1, 1).data;
      const skin = `${(a[0] + b[0]) >> 1},${(a[1] + b[1]) >> 1},${(a[2] + b[2]) >> 1}`;
      bg.save();
      bg.translate(nx, ny);
      bg.scale(1, 1.7);
      const grad = bg.createRadialGradient(0, 0, 0, 0, 0, 46);
      grad.addColorStop(0, `rgba(${skin},1)`);
      grad.addColorStop(0.72, `rgba(${skin},1)`);
      grad.addColorStop(1, `rgba(${skin},0)`);
      bg.fillStyle = grad;
      bg.fillRect(-50, -50, 100, 100);
      bg.restore();
    }

    // lienzo de Joaco: papel + la Isa sin cara, pintada suavecita
    this.basePaper = makePaper('rgba(120,190,235,A)');
    const g = this.basePaper.getContext('2d');
    g.filter = 'saturate(0.9) contrast(0.95)';
    g.drawImage(base, 0, 0);
    g.filter = 'none';

    // ── Joaco: el cuadro que pinta la Isa ──
    const yo = pose(tYo);
    const yoReal = snap(yo, () => true);
    scene.remove(yo.root);
    this.isaPainting = makePaper('rgba(255,150,185,A)');
    const g2 = this.isaPainting.getContext('2d');
    g2.filter = 'saturate(0.9) contrast(0.95)';
    g2.drawImage(yoReal, 0, 0);
    g2.filter = 'none';
    g2.font = '54px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    g2.fillStyle = '#ff6f9c';
    for (const [x, y, s, a] of [[92, 150, 1, -0.3], [610, 120, 0.8, 0.25], [640, 560, 0.7, 0.2], [70, 600, 0.6, -0.15], [560, 250, 0.45, 0.1]]) {
      g2.save(); g2.translate(x, y); g2.rotate(a); g2.scale(s, s); g2.fillText('♥', -20, 18); g2.restore();
    }
    drawSignature(g2, D.FIRMA_ISA, '#e0508f');

    r.dispose();
    r.forceContextLoss?.();
  }

  // Caballetes bajitos (para pintar sentados) con su lienzo
  _buildEasels() {
    const wood = lam(0xc99a64);
    const mk = () => {
      const g = new THREE.Group();
      const leg = new THREE.BoxGeometry(0.035, 1.0, 0.035);
      for (const s of [-1, 1]) {
        const l = new THREE.Mesh(leg, wood);
        l.position.set(s * 0.24, 0.48, -0.03);
        l.rotation.z = -s * 0.2;
        l.rotation.x = -0.12;
        g.add(l);
      }
      const back = new THREE.Mesh(leg, wood);
      back.position.set(0, 0.46, -0.26);
      back.rotation.x = 0.42;
      g.add(back);
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.07), wood);
      shelf.position.set(0, 0.33, 0.03);
      g.add(shelf);
      const board = new THREE.Group();
      const W = 0.56, H = W * PH / PW;
      board.add(new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, H + 0.02, 0.03), lam(0xe9dcc0)));
      const mat = new THREE.MeshLambertMaterial({ color: 0xfbf5e6 });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
      face.position.z = 0.017;
      board.add(face);
      board.position.set(0, 0.345 + H / 2, 0.03);
      board.rotation.x = -0.12;
      g.add(board);
      this.scene.add(g);
      return { g, mat };
    };
    this.easelJ = mk();
    this.easelI = mk();
    const tex = (cv) => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
    this.easelJ.tex = tex(this.paintCv);
    this.easelI.tex = tex(this.isaPainting);
  }

  // Pincel (mano derecha) y paleta (mano izquierda) de cada uno
  _buildTools() {
    const mk = (tip) => {
      const brush = new THREE.Group();
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.26, 6).rotateX(Math.PI / 2), lam(0xd9b27c));
      stick.position.z = 0.13;
      const hair = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.05, 6).rotateX(Math.PI / 2), lam(tip));
      hair.position.z = 0.28;
      brush.add(stick, hair);
      const pal = new THREE.Group();
      pal.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.012, 16).scale(1, 1, 0.75), lam(0xb98654)));
      [0xe2463a, 0xffd84a, 0x3f8fcf, 0x6fb44a, 0xffffff].forEach((c, i) => {
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6).scale(1, 0.4, 1), lam(c));
        const a = -0.4 + i * 0.75;
        d.position.set(Math.cos(a) * 0.065, 0.01, Math.sin(a) * 0.05);
        pal.add(d);
      });
      this.scene.add(brush, pal);
      return { brush, pal };
    };
    this.toolsJ = mk(0x3f8fcf);
    this.toolsI = mk(0xe2463a);
  }
  _placeTools() {
    for (const [m, t] of [[this.yo, this.toolsJ], [this.isa, this.toolsI]]) {
      const show = m.root.visible && this.toolsOn;
      t.brush.visible = t.pal.visible = show;
      if (!show) continue;
      m.root.updateMatrixWorld(true);
      t.brush.position.copy(m.rig.bones.wrist_r.getWorldPosition(this._v));
      t.brush.rotation.set(-0.5, m.heading, 0, 'YXZ');
      t.pal.position.copy(m.rig.bones.wrist_l.getWorldPosition(this._v));
      t.pal.position.y += 0.03;
      t.pal.rotation.set(0, m.heading, 0);
    }
  }

  // Corazones y gotitas de pintura del final
  _buildBurst() {
    const tex = { heart: makeEmojiTexture('♥', '#ff6f9c'), dot: makeEmojiTexture('●', '#ffffff') };
    this.parts = [];
    for (let i = 0; i < 56; i++) {
      const mats = {};
      for (const [k, t] of Object.entries(tex)) mats[k] = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
      const s = new THREE.Sprite(mats.heart);
      s.visible = false;
      this.scene.add(s);
      this.parts.push({ s, mats, v: new THREE.Vector3(), life: 0, max: 1, g: 1 });
    }
  }
  _burst(center, n = 40, spread = 0.5, up = 1.6) {
    const PAINT = [0xe2463a, 0xffd84a, 0x3f8fcf, 0x6fb44a, 0xb79af0];
    let k = 0;
    for (const p of this.parts) {
      if (k >= n) break;
      if (p.life > 0) continue;
      const heart = k % 3 !== 2;
      p.s.material = heart ? p.mats.heart : p.mats.dot;
      p.s.material.color.set(heart ? 0xffffff : PAINT[k % PAINT.length]);
      k++;
      p.s.position.copy(center).add(this._v.set(rand(-spread, spread) * 0.4, rand(-0.05, 0.2), rand(-spread, spread) * 0.4));
      p.v.set(rand(-0.7, 0.7) * spread, rand(0.5, 1) * up, rand(-0.7, 0.7) * spread);
      p.life = p.max = heart ? rand(1.2, 2.2) : rand(0.8, 1.3);
      p.g = heart ? 0.6 : 3;
      p.s.scale.setScalar(heart ? rand(0.1, 0.2) : rand(0.04, 0.07));
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
    this.state = 'intro'; // 'intro' | 'scene' | 'look' | 'paint' | 'card' | 'end' | 'done'
    this.introT = 0;
    this.introStarted = false;
    this.pg = null;
    this.waitA = null;
    this.wantsCursor = false;
    this.toolsOn = true;
    this.camRate = 4;
    this.fovGoal = 40;
    this.sayT = 0;
    this.score = 0;
    for (const p of this.parts) { p.life = 0; p.s.visible = false; }

    const L = this.L;
    const put = (m, s) => { m.position.set(s[0], 0.03, s[1]); m.setHeading(s[2]); };
    for (const m of [this.yo, this.isa]) { m.root.visible = true; m.talking = false; m.model.position.y = 0; m.play('paint', 0); m.setSpeed(1); }
    put(this.yo, L.spots.joaco);
    put(this.isa, L.spots.isa);
    for (const [e, s] of [[this.easelJ, L.easels.joaco], [this.easelI, L.easels.isa]]) {
      e.g.position.set(s[0], 0.02, s[1]);
      e.g.rotation.y = s[2];
      e.mat.map = null;
      e.mat.needsUpdate = true;
    }
    this._drawPainting();

    // primera toma: el picnic entero
    this._shot(0.3, 1.7, 5.2, 0, 0.75, -0.4);
    this.camera.fov = this.fovGoal;
    this.camera.updateProjectionMatrix();
    this._placeCamera(0, true);
    for (const m of [this.yo, this.isa]) m.update(0);
    this._placeTools();
    this._hideUi();
  }

  _hideUi() {
    this.lookEl.classList.add('hidden');
    this.skipEl.classList.add('hidden');
    this.bannerEl.classList.add('hidden');
    this.sayEl.classList.add('hidden');
    this.cardEl.classList.add('hidden');
    this.thinkEl.classList.add('hidden');
    this.easelEl.classList.remove('up');
    $('#game').classList.remove('c7-blur');
    $('#objective').classList.remove('show');
    $('#blush').style.opacity = 0;
  }

  exit() {
    this.run++;
    this.tasks = [];
    this.state = 'done';
    this.pg = null;
    this.waitA = null;
    this.wantsCursor = false;
    this._hideUi();
  }

  // ───────────── Tareas por frame (se congelan con la pausa) ─────────────
  _task(step) { return new Promise((res) => this.tasks.push({ step, res })); }
  _sleep(s) { let t = 0; return this._task((dt) => (t += dt) >= s); }
  _tween(dur, fn) { let t = 0; return this._task((dt) => { t = Math.min(1, t + dt / dur); fn(ease(t)); return t >= 1; }); }
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
  // fit = alejar la cámara en pantallas angostas para que los dos sigan entrando en el cuadro
  _shot(px, py, pz, lx, ly, lz, fit = true) {
    this.shotRaw = [px, py, pz, lx, ly, lz, fit];
    this._applyShot();
  }
  _applyShot() {
    const [px, py, pz, lx, ly, lz, fit] = this.shotRaw;
    const f = fit ? clamp(1.7 / this.camera.aspect, 1, 1.7) : 1;
    this.camGoalLook.set(lx, ly, lz);
    this.camGoalPos.set(lx + (px - lx) * f, ly + (py - ly) * f, lz + (pz - lz) * f);
  }
  _banner(html, dur = 1.5) {
    const e = this.bannerEl;
    e.innerHTML = html;
    e.classList.remove('hidden'); void e.offsetWidth;
    e.style.animationDuration = dur + 's';
    return this._sleep(dur).then(() => e.classList.add('hidden'));
  }
  // Burbujita corta sobre la Isa
  _say(text, kind = '') {
    const el = this.sayEl;
    el.textContent = plain(text);
    el.className = kind;
    void el.offsetWidth;
    el.classList.add('pop');
    this.sayT = 1.8;
  }
  _updateSay(dt) {
    if (this.sayT <= 0) return;
    this.sayT -= dt;
    if (this.sayT <= 0) { this.sayEl.classList.add('hidden'); return; }
    // al lado de su cabeza (la cámara la mira de frente, así que +z es la derecha de la pantalla)
    const v = this._isaFace(this._v);
    v.y += 0.3 * this.isa.scale;
    v.z += 0.66 * this.isa.scale;
    v.project(this.camera);
    this.sayEl.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px';
    this.sayEl.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
  }
  // centro de la cara de la Isa en el mundo
  _isaFace(out) {
    this.isa.root.updateMatrixWorld(true);
    this.isa.rig.bones.head.getWorldPosition(out);
    out.y += 0.4 * this.isa.scale;
    return out;
  }
  // Joaco piensa (al lado del lienzo)
  _think(text) {
    const e = this.thinkEl;
    e.textContent = plain(text);
    e.classList.remove('hidden'); void e.offsetWidth;
    e.classList.add('pop');
    this.thinkT = 1.6;
  }

  pressA() {
    if (this.state === 'look') { if (this.look && this.look.t >= MIRAR.minimo) this.look.done(); }
    else if (this.state === 'paint') { if (this.pg?.cur) this._stamp(false); }
    else if (this.state === 'card' && this.waitA) { const f = this.waitA; this.waitA = null; this.audio.play('select'); f(); }
  }

  // ───────────── Flujo del capítulo ─────────────
  async _play() {
    const run = this.run;
    const ok = () => run === this.run;
    const yo = this.yo, isa = this.isa;
    await this._sleep(0.8);
    if (!ok()) return;
    this.camRate = 1.3;
    this._shot(0, 1.25, 3.5, 0, 0.7, -0.2);
    await this._sleep(0.9);
    if (!ok()) return;
    yo.play('sitfloor', 0.4); isa.play('sitfloor', 0.4);
    await this._talk(D.INTRO);
    if (!ok()) return;
    const obj = $('#objective');
    obj.innerHTML = D.OBJETIVO;
    obj.classList.remove('show'); void obj.offsetWidth; obj.classList.add('show');
    await this._talk(D.MIRAR_ANTES);
    if (!ok()) return;

    await this._mirar(run);
    if (!ok()) return;
    await this._pintar(run);
    if (!ok()) return;
    await this._mostrar(run);
  }

  // ───────────── 1 · Mirarla (desde los ojos de Joaco) ─────────────
  async _mirar(run) {
    const yo = this.yo, isa = this.isa;
    yo.root.visible = false; // primera persona
    const f = this._isaFace(this._v2).clone();
    this.camRate = 3;
    this.fovGoal = 38;
    this._shot(f.x - 2.0, f.y + 0.03, f.z, f.x, f.y, f.z, false);
    $('#objective').classList.remove('show');
    await this._sleep(1.1);
    if (run !== this.run) return;
    this.audio.play('start');
    this.lookEl.classList.remove('hidden');
    this.skipEl.classList.remove('hidden');
    this.state = 'look';
    let said = 0;
    await new Promise((res) => {
      this.look = { t: 0, done: () => { if (this.look) { this.look = null; res(); } } };
      this.lookStep = (dt) => {
        const lk = this.look;
        lk.t += dt;
        const left = 1 - lk.t / MIRAR.tiempo;
        this.lookClock.style.width = (clamp(left, 0, 1) * 100).toFixed(1) + '%';
        this.lookEl.classList.toggle('low', left < 0.3);
        if (said < 2 && lk.t > 2.2 + said * 2.8) { said++; this._say(D.posando()); this.audio.blip(CONFIG.characters.isa.voice); }
        if (left <= 0) lk.done();
      };
    });
    if (run !== this.run) return;
    this.state = 'scene';
    this.lookEl.classList.add('hidden');
    this.skipEl.classList.add('hidden');
    this.sayEl.classList.add('hidden');
    this.sayT = 0;
  }

  // ───────────── 2 · Pintarla de memoria ─────────────
  async _pintar(run) {
    // el lienzo sube y la tapa
    this.listEl.innerHTML = this.pieces.map((p) => `<li><img src="${p.img.toDataURL()}" alt=""><span>${p.label}</span><b>✔</b></li>`).join('');
    this.pg = { i: 0, placed: [], cur: null, wait: 0 };
    this._drawPainting();
    this.audio.play('canvas');
    this.easelEl.classList.add('up');
    $('#game').classList.add('c7-blur');
    await this._sleep(0.8);
    if (run !== this.run) return;
    await this._banner(D.PINTAR_CARTEL, 1.4);
    if (run !== this.run) return;

    this.state = 'paint';
    await new Promise((res) => { this.pg.done = res; this.pg.wait = 0.3; });
    if (run !== this.run) return;
    this.state = 'scene';
    const placed = this.pg.placed;
    this.score = Math.round((placed.reduce((s, p) => s + p.score, 0) / Math.max(1, placed.length)) * 100);
    this.audio.play('yay');
    this._think(D.LISTO);
    drawSignature(this.pg2d, D.FIRMA_JOACO, '#3f6fb0');
    this.easelJ.tex.needsUpdate = true;
    await this._sleep(1.3);
    if (run !== this.run) return;
    this.easelEl.classList.remove('up');
    $('#game').classList.remove('c7-blur');
    this.thinkEl.classList.add('hidden');
  }

  _spawn() {
    const pg = this.pg, p = this.pieces[pg.i];
    pg.cur = {
      p, t: 0, ph: rand(0, TAU),
      x: rand(PW * 0.22, PW * 0.78), y: -p.h / 2 - 8, rot: 0,
      vy: CAER.vel + pg.i * CAER.acel,
    };
    this.listEl.querySelectorAll('li').forEach((li, k) => li.classList.toggle('on', k === pg.i));
    this.audio.play('whoosh');
  }

  // El rasgo queda pintado donde está (fell = llegó al borde de abajo sin que apretaran A)
  _stamp(fell) {
    const pg = this.pg, c = pg.cur, p = c.p;
    const d = Math.hypot(c.x - p.cx, c.y - p.cy);
    const pos = clamp(1 - d / NOTA.dist, 0, 1);
    const ang = clamp(1 - Math.abs(c.rot) / NOTA.angulo, 0, 1);
    pg.placed.push({ p, x: c.x, y: c.y, rot: c.rot, score: pos * (0.85 + 0.15 * ang) });
    pg.cur = null;
    this.audio.play(fell ? 'miss' : 'stamp');
    this._think(fell ? D.seCayo() : D.pensando());
    const li = this.listEl.querySelectorAll('li')[pg.i];
    li?.classList.remove('on');
    li?.classList.add('done');
    pg.i++;
    pg.wait = pg.i >= this.pieces.length ? 0.7 : 0.55;
    this._drawPainting();
  }

  _updatePaint(dt, input) {
    const pg = this.pg;
    if (this.thinkT > 0) { this.thinkT -= dt; if (this.thinkT <= 0) this.thinkEl.classList.add('hidden'); }
    if (!pg.cur) {
      pg.wait -= dt;
      if (pg.wait > 0) return;
      if (pg.i >= this.pieces.length) { const f = pg.done; pg.done = null; f?.(); return; }
      this._spawn();
    }
    const c = pg.cur;
    c.t += dt;
    const sway = Math.sin(c.t * 2.3 + c.ph);
    c.x = clamp(c.x + ((input?.x ?? 0) * CAER.mover + sway * CAER.deriva) * dt, c.p.w / 2 + 6, PW - c.p.w / 2 - 6);
    c.y += c.vy * ((input?.z ?? 0) > 0 ? CAER.rapido : 1) * dt;
    c.rot = Math.cos(c.t * 2.3 + c.ph) * CAER.giro;
    if (c.y >= PH - c.p.h / 2 - 8) { c.y = PH - c.p.h / 2 - 8; this._stamp(true); return; }
    this._drawPainting();
  }

  _drawPainting() {
    const g = this.pg2d;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.basePaper, 0, 0);
    const put = (p, x, y, rot) => {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.drawImage(p.img, -p.w / 2, -p.h / 2);
      g.restore();
    };
    for (const s of this.pg?.placed ?? []) put(s.p, s.x, s.y, s.rot);
    const c = this.pg?.cur;
    if (c) {
      // sombra en el papel + borde claro para que se vea también sobre el pelo
      g.save();
      g.shadowColor = 'rgba(60,40,20,0.35)';
      g.shadowBlur = 14;
      g.shadowOffsetY = 12;
      put(c.p, c.x, c.y, c.rot);
      g.shadowColor = 'rgba(255,255,255,0.95)';
      g.shadowBlur = 7;
      g.shadowOffsetY = 0;
      put(c.p, c.x, c.y, c.rot);
      put(c.p, c.x, c.y, c.rot);
      g.restore();
    }
  }

  // ───────────── 3 · Mostrarse los cuadros ─────────────
  // Tarjeta de comparación; resuelve cuando aprietan A
  _card(html, setup) {
    if (html != null) this.cardEl.className = html;
    setup?.();
    this.cardEl.classList.remove('hidden');
    this.state = 'card';
    this.wantsCursor = true;
    return new Promise((res) => {
      this.waitA = () => {
        this.cardEl.classList.add('hidden');
        this.state = 'scene';
        this.wantsCursor = false;
        res();
      };
    });
  }

  async _mostrar(run) {
    const yo = this.yo, isa = this.isa;
    const ok = () => run === this.run;
    yo.root.visible = true;
    this.camRate = 1.6;
    this.fovGoal = 38;
    this._shot(0, 1.2, 3.3, 0, 0.72, -0.35);
    yo.play('sitfloor', 0.3); isa.play('sitfloor', 0.3);
    await this._sleep(1.0);
    if (!ok()) return;
    await this._talk(D.MOSTRAR_ANTES);
    if (!ok()) return;

    // los caballetes dan una vuelta y aparecen los cuadros
    this.audio.play('open');
    const spin = (e, dir) => {
      const r0 = e.g.rotation.y;
      let shown = false;
      return this._tween(0.9, (t) => {
        e.g.rotation.y = r0 + dir * TAU * t;
        if (!shown && t > 0.5) { shown = true; e.mat.map = e.tex; e.mat.needsUpdate = true; }
      });
    };
    await Promise.all([spin(this.easelJ, 1), spin(this.easelI, -1)]);
    if (!ok()) return;
    this.audio.play('yay');
    await this._sleep(0.7);
    if (!ok()) return;

    // comparación: la Isa de verdad vs. el retrato
    const pct = this.score;
    const imgs = this.cardEl.querySelectorAll('img');
    imgs[0].src = this.isaReal.toDataURL();
    imgs[1].src = this.paintCv.toDataURL();
    const scoreEl = this.cardEl.querySelector('.c7-score b');
    scoreEl.textContent = '0%';
    this.cardEl.querySelector('.c7-parts').innerHTML = this.pg.placed
      .map((s) => `<span class="${s.score >= 0.8 ? 'good' : s.score >= 0.5 ? 'mid' : 'bad'}"><img src="${s.p.img.toDataURL()}" alt="">${Math.round(s.score * 100)}%</span>`).join('');
    const tier = pct <= NOTA.ganar ? 'mal' : pct >= NOTA.genial ? 'genial' : 'bien';
    let lastTick = -1;
    const shown = this._card('compare ' + tier);
    this._tween(1.4, (t) => {
      const v = Math.round(pct * t);
      scoreEl.textContent = v + '%';
      if (v !== lastTick && v % 4 === 0) { lastTick = v; this.audio.play('tick'); }
    }).then(() => { if (ok()) this.audio.play(tier === 'mal' ? 'miss' : 'hit'); });
    await shown;
    if (!ok()) return;

    // la reacción de la Isa
    this.camRate = 2;
    this._shot(0.3, 1.2, 3.1, 0.2, 0.76, -0.25);
    if (tier === 'mal') {
      await this._talk(D.REACCION_MAL);
      if (!ok()) return;
      this.state = 'end';
      this._hideUi();
      this.audio.stopMusic();
      await this._sleep(0.4);
      if (!ok()) return;
      this.state = 'done';
      this.audio.play('fail');
      this.onEnd({ win: false, ...D.PERDER });
      return;
    }
    if (tier === 'genial') { isa.play('sitcheer', 0.2); $('#blush').style.opacity = 0.25; }
    await this._talk(tier === 'genial' ? D.REACCION_GENIAL : D.REACCION_BIEN);
    if (!ok()) return;
    $('#blush').style.opacity = 0;
    isa.play('sitfloor', 0.3);

    // el cuadro de la Isa
    await this._talk(D.SUYO_ANTES);
    if (!ok()) return;
    this.audio.play('open');
    await this._card('single', () => {
      imgs[1].src = this.isaPainting.toDataURL();
      this.cardEl.querySelector('.mine figcaption').textContent = D.SUYO_TITULO;
    });
    this.cardEl.querySelector('.mine figcaption').textContent = D.TARJETA.mio;
    if (!ok()) return;

    // final
    this.state = 'end';
    this.audio.startMusic('amor');
    this.camRate = 1.2;
    this.fovGoal = 36;
    this._shot(0, 1.2, 3.0, 0, 0.75, -0.3);
    await this._talk(D.FINAL);
    if (!ok()) return;
    $('#blush').style.opacity = 0.3;
    yo.play('sitcheer', 0.2); isa.play('sitcheer', 0.2);
    this._burst(this._v2.set(0, 1.0, 0), 46, 1.5, 1.9);
    await this._sleep(1.6);
    if (!ok()) return;
    $('#blush').style.opacity = 0;
    this.state = 'done';
    this.audio.play('win');
    this.onEnd({ win: true, ...D.ganar(pct) });
  }

  // ───────────── Bucle ─────────────
  update(dt, input) {
    this.time += dt;
    if (this.tasks.length) {
      for (const t of [...this.tasks]) if (t.step(dt)) { this.tasks.splice(this.tasks.indexOf(t), 1); t.res(); }
    }
    if (this.state === 'intro') {
      this.introT += dt;
      if (this.introT > 0.5 && !this.introStarted) { this.introStarted = true; this.state = 'scene'; this._play(); }
    }
    if (this.state === 'look' && this.look) this.lookStep(dt);
    if (this.state === 'paint' && this.pg) this._updatePaint(dt, input);
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
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
    if (this.shotRaw) this._applyShot();
  }
}
