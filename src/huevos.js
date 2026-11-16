// Easter eggs: un corazón dorado escondido en cada capítulo (posiciones en CONFIG.eggs).
// Se recoge haciéndole clic o, en los capítulos donde se camina, pasando por encima.
// Queda guardado apenas se recoge, aunque después se pierda el capítulo.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const $ = (s) => document.querySelector(s);

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

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,236,160,0.85)');
  grad.addColorStop(0.5, 'rgba(255,200,90,0.28)');
  grad.addColorStop(1, 'rgba(255,200,90,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Eggs {
  constructor({ audio, progress }) {
    this.audio = audio;
    this.progress = progress;
    this.id = null;
    this.host = null;
    this.t = 0;
    this.popT = 0;
    this._v = new THREE.Vector3();

    this.root = new THREE.Group();
    // fog: false → se distingue aunque la escena tenga neblina
    this.heart = new THREE.Mesh(heartGeometry(), new THREE.MeshBasicMaterial({ color: 0xffc83d, fog: false }));
    const rim = new THREE.Mesh(this.heart.geometry, new THREE.MeshBasicMaterial({ color: 0xff7fae, side: THREE.BackSide, fog: false }));
    rim.scale.setScalar(1.14);
    this.heart.add(rim);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, fog: false }));
    this.glow.scale.setScalar(2.2);
    this.root.add(this.heart, this.glow);

    const toast = document.createElement('div');
    toast.id = 'eggToast';
    toast.className = 'hidden';
    document.body.appendChild(toast);
    this.toast = toast;
  }

  // Al entrar a un capítulo: pone el corazón en su escena (si todavía no se ha encontrado)
  attach(id, host) {
    this.detach();
    const def = CONFIG.eggs[id];
    if (!def || this.progress.hasEgg(id)) return;
    this.id = id;
    this.host = host;
    this.def = def;
    this.popT = 0;
    this.root.position.set(...def.pos);
    this.root.scale.setScalar(def.size ?? 0.5);
    this.root.visible = true;
    host.scene.add(this.root);
  }

  detach() {
    this.root.removeFromParent();
    this.id = this.host = null;
    this.toast.classList.add('hidden');
  }

  get active() { return !!this.id && this.popT === 0; }

  update(dt) {
    if (!this.id) return;
    this.t += dt;
    this.heart.rotation.y = this.t * 2.2;
    this.heart.position.y = Math.sin(this.t * 2.6) * 0.18;
    this.glow.material.opacity = 0.75 + Math.sin(this.t * 5) * 0.2;

    if (this.popT > 0) { // animación al recogerlo: crece, sube y desaparece
      this.popT += dt;
      const k = Math.min(1, this.popT / 0.6);
      this.root.scale.setScalar((this.def.size ?? 0.5) * (1 + k * 1.4) * (1 - k * k));
      this.root.position.y = this.def.pos[1] + k * 1.2;
      this.heart.rotation.y = this.t * 14;
      if (k >= 1) { this.root.removeFromParent(); this.id = null; }
      return;
    }

    // pasar caminando por encima
    const who = this.def.player && this.host[this.def.player];
    if (who && this.host.state === 'play') {
      const p = who.position, e = this.root.position;
      if (Math.hypot(p.x - e.x, p.z - e.z) < 1.2 && Math.abs(p.y - e.y) < 3) this.collect();
    }
  }

  // ¿El clic cayó sobre el corazón? (distancia en pantalla, con margen generoso)
  click(clientX, clientY) {
    if (!this.active) return false;
    const cam = this.host.camera;
    const v = this._v.copy(this.root.position).project(cam);
    if (v.z > 1 || v.z < -1) return false; // detrás de la cámara
    const sx = (v.x * 0.5 + 0.5) * innerWidth, sy = (-v.y * 0.5 + 0.5) * innerHeight;
    // radio en pantalla del corazón, con un mínimo para que no sea imposible de lejos
    const dist = cam.position.distanceTo(this.root.position);
    const pxPerUnit = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * dist);
    const r = Math.max(innerHeight * 0.035, (this.def.size ?? 0.5) * 0.9 * pxPerUnit);
    if (Math.hypot(clientX - sx, clientY - sy) > r) return false;
    this.collect();
    return true;
  }

  collect() {
    if (!this.active) return;
    this.popT = 0.0001;
    this.progress.collectEgg(this.id);
    this.audio.play('yay');
    const { eggCount: n, eggTotal: total } = this.progress;
    this.toast.innerHTML = `<b>♥</b> ¡Encontraste un corazón escondido! <span>${n} / ${total}</span>`
      + (n >= total ? '<small>¡Los tienes todos! Algo se abrió en el menú…</small>' : '');
    this.toast.classList.remove('hidden', 'show');
    void this.toast.offsetWidth;
    this.toast.classList.add('show');
    clearTimeout(this._hide);
    this._hide = setTimeout(() => this.toast.classList.add('hidden'), 4200);
  }
}
