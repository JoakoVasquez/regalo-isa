// Miis (.glb de Mii Creator): plantillas, animaciones compartidas y versión "multitud".
//
// Cómo está pensado para aguantar muchos Miis:
//   · Cada .glb se carga UNA vez (plantilla). Todos los Miis de esa plantilla comparten
//     geometría, texturas y materiales.
//   · Las partes de color liso (camiseta, pantalón, pelo, piel…) se funden en una sola malla,
//     así un Mii son 3-4 dibujados en vez de 8. El color de la ropa se elige por material.
//   · Las animaciones (idle, walk, sit) se generan por código una sola vez.
//   · Un Mii normal tiene su propio esqueleto y puede mezclar animaciones.
//     Un Mii de multitud NO tiene esqueleto: se "cuelga" de un esqueleto compartido (SharedRig)
//     que se anima una vez por frame para todos. 100 Miis sentados cuestan 1 animación.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const IDENT = new THREE.Matrix4();
const BOUNDS = new THREE.Sphere(new THREE.Vector3(0, 1.05, 0), 1.6); // esfera holgada para descartar los que no se ven

// Orden jerárquico: los padres siempre antes que los hijos.
const BONES = [
  'skl_root', 'hip',
  'foot_l1', 'foot_l2', 'ankle_l', 'foot_r1', 'foot_r2', 'ankle_r',
  'chest', 'arm_l1', 'arm_l2', 'arm_r1', 'arm_r2', 'head',
];
// Para saber hacia dónde "apunta" cada hueso de brazo/pierna: es la dirección hacia su hijo.
const AXIS_CHILD = {
  arm_l1: 'arm_l2', arm_l2: 'wrist_l', arm_r1: 'arm_r2', arm_r2: 'wrist_r',
  foot_l1: 'foot_l2', foot_l2: 'ankle_l', foot_r1: 'foot_r2', foot_r2: 'ankle_r',
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const E = (x, y, z) => new THREE.Euler(x, y, z, 'YXZ');
const TAU = Math.PI * 2;

// ───────────── Colores de ropa ─────────────
export const SHIRT_COLORS = [
  0xd21e14, 0xff6e19, 0xffd820, 0x78d220, 0x007830, 0x0a48b4,
  0x3caade, 0xf55a7d, 0x7328ad, 0x6b4a1f, 0xe6e6e6, 0x26262a,
].map((h) => new THREE.Color(h));
export const PANTS_COLORS = [0x5a5f66, 0x2a3350, 0x4a3a2a, 0x26282b, 0xb8a888, 0x7d8a99].map((h) => new THREE.Color(h));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const randomShirt = () => pick(SHIRT_COLORS);
export const randomPants = () => pick(PANTS_COLORS);

// ───────────── Poses ─────────────
// Espacio del personaje: +Z = hacia delante, +Y = arriba, +X = su izquierda.
//   { dir }  → el hueso apunta en esa dirección
//   { rot }  → giro extra (x = inclinarse adelante, y = girar, z = ladear) sobre la pose base
//   { keep } → 0..1, cuánto conserva su orientación original (pies planos en el suelo)
// u va de 0 a 1 a lo largo del ciclo.

function poseIdle(u) {
  const b = Math.sin(u * TAU);
  const p = { root: V(0, -0.008 + 0.008 * b, 0) };
  p.chest = { rot: E(0.015 * b, 0, 0) };
  p.head = { rot: E(-0.02 * b, 0.06 * Math.sin(u * TAU + 1.2), 0.012 * b) };
  for (const [k, s] of [['l', 1], ['r', -1]]) {
    p['arm_' + k + '1'] = { dir: V(s * (0.38 + 0.03 * b), -1, 0.02) };
    p['arm_' + k + '2'] = { dir: V(s * (0.26 + 0.03 * b), -1, 0.18) };
  }
  return p;
}

function poseWalk(u) {
  const ph = u * TAU, sw = Math.sin(ph), cw = Math.cos(ph);
  const p = { root: V(0, -0.07 * sw * sw, 0) };
  p.chest = { rot: E(0.07, 0.13 * sw, 0) };
  p.hip = { rot: E(0, -0.08 * sw, 0) };
  p.head = { rot: E(-0.04, -0.11 * sw, 0) };
  for (const [k, s, ss, cc] of [['l', 1, sw, cw], ['r', -1, -sw, -cw]]) {
    const a = 0.6 * ss;                          // muslo: adelante / atrás
    const knee = 0.12 + 0.95 * Math.max(0, cc);  // la rodilla se dobla mientras la pierna avanza
    p['foot_' + k + '1'] = { dir: V(s * 0.03, -Math.cos(a), Math.sin(a)) };
    p['foot_' + k + '2'] = { dir: V(s * 0.03, -Math.cos(a - knee), Math.sin(a - knee)) };
    p['ankle_' + k] = { keep: 0.6 };
    const arm = -0.6 * ss;                       // el brazo va al revés que la pierna del mismo lado
    const fore = arm + 0.45;
    p['arm_' + k + '1'] = { dir: V(s * 0.3, -Math.cos(arm), Math.sin(arm)) };
    p['arm_' + k + '2'] = { dir: V(s * 0.22, -Math.cos(fore), Math.sin(fore)) };
  }
  return p;
}

function poseSit(u, rig) {
  const b = Math.sin(u * TAU);
  const p = { root: V(0, -rig.thighLen + 0.005 * b, 0) };
  p.chest = { rot: E(-0.04 + 0.012 * b, 0, 0) };
  p.head = { rot: E(0.03 - 0.012 * b, 0.05 * Math.sin(u * TAU + 0.8), 0) };
  for (const [k, s] of [['l', 1], ['r', -1]]) {
    p['foot_' + k + '1'] = { dir: V(s * 0.12, -0.05, 1) };
    p['foot_' + k + '2'] = { dir: V(s * 0.03, -1, 0.08) };
    p['ankle_' + k] = { keep: 1 };
    p['arm_' + k + '1'] = { dir: V(s * 0.36, -1, 0.2) };
    p['arm_' + k + '2'] = { dir: V(-s * 0.3, -0.5, 1) };
  }
  return p;
}

// Saludo: brazo derecho arriba moviendo la mano de lado a lado; el resto como en idle.
function poseWave(u) {
  const w = Math.sin(u * TAU);
  const p = poseIdle(u);
  p.chest = { rot: E(-0.03, 0.08, 0.04 * w) };
  p.head = { rot: E(-0.06, 0.05, -0.05 + 0.04 * w) };
  p.arm_r1 = { dir: V(-0.85, 0.75, 0.2) };
  p.arm_r2 = { dir: V(-0.15 - 0.55 * w, 1, 0.25) };
  return p;
}

// Saludo estando sentado
function poseSitWave(u, rig) {
  const w = Math.sin(u * TAU);
  const p = poseSit(u, rig);
  p.chest = { rot: E(-0.04, 0.06, 0.03 * w) };
  p.head = { rot: E(-0.04, 0.04, -0.05 + 0.04 * w) };
  p.arm_r1 = { dir: V(-0.8, 0.8, 0.25) };
  p.arm_r2 = { dir: V(-0.15 - 0.55 * w, 1, 0.25) };
  return p;
}

// Baile 1: rebota en cada tiempo y sube los brazos alternados. Un ciclo = 2 tiempos.
function poseDance(u) {
  const s1 = Math.sin(u * TAU), bounce = Math.abs(Math.sin(u * TAU));
  const p = { root: V(0.03 * s1, -0.06 * bounce, 0) };
  p.hip = { rot: E(0, 0.22 * s1, 0) };
  p.chest = { rot: E(0.06, -0.3 * s1, 0.07 * s1) };
  p.head = { rot: E(-0.04 + 0.1 * bounce, 0.12 * s1, -0.06 * s1) };
  for (const [k, s] of [['l', 1], ['r', -1]]) {
    const knee = 0.12 + 0.35 * bounce;
    p['foot_' + k + '1'] = { dir: V(s * 0.12, -Math.cos(knee * 0.6), Math.sin(knee * 0.6)) };
    p['foot_' + k + '2'] = { dir: V(s * 0.06, -Math.cos(-knee * 0.4), Math.sin(-knee * 0.4)) };
    p['ankle_' + k] = { keep: 1 };
    const up = Math.max(0, s * s1); // cada brazo sube en su tiempo
    p['arm_' + k + '1'] = { dir: V(s * (0.55 - 0.3 * up), -0.35 + 1.6 * up, 0.35) };
    p['arm_' + k + '2'] = { dir: V(s * 0.12, -0.1 + 1.1 * up, 0.75 - 0.6 * up) };
  }
  return p;
}

// Baile 2: el clásico "dedo arriba, dedo abajo" con la otra mano en la cadera.
function poseDance2(u) {
  const pt = Math.sin(u * TAU), bounce = Math.abs(Math.sin(u * TAU));
  const p = { root: V(0.06 * pt, -0.05 * bounce, 0) };
  p.hip = { rot: E(0, -0.12 * pt, 0) };
  p.chest = { rot: E(0.03, 0.18 * pt, -0.12 * pt) };
  p.head = { rot: E(-0.05 - 0.12 * pt, 0.15 * pt, 0.05 * pt) };
  for (const [k, s] of [['l', 1], ['r', -1]]) {
    const knee = 0.1 + 0.3 * bounce;
    p['foot_' + k + '1'] = { dir: V(s * 0.16, -Math.cos(knee * 0.6), Math.sin(knee * 0.6)) };
    p['foot_' + k + '2'] = { dir: V(s * 0.08, -Math.cos(-knee * 0.4), Math.sin(-knee * 0.4)) };
    p['ankle_' + k] = { keep: 1 };
  }
  p.arm_r1 = { dir: V(-0.65, 0.95 * pt, 0.35) };
  p.arm_r2 = { dir: V(-0.6, 1.1 * pt, 0.3) };
  p.arm_l1 = { dir: V(0.9, -0.55, -0.25) };
  p.arm_l2 = { dir: V(-0.45, -0.6, 0.35) };
  return p;
}

// Mareado: se tambalea con la mano en la guata y la cabeza gacha.
function poseDizzy(u) {
  const w = Math.sin(u * TAU), w2 = Math.sin(u * TAU * 2 + 0.7);
  const p = { root: V(0.035 * w, -0.03 - 0.015 * w2, 0) };
  p.chest = { rot: E(0.18 + 0.03 * w2, 0.05 * w, 0.09 * w) };
  p.head = { rot: E(0.22, -0.1 * w, -0.14 * w) };
  for (const [k, s] of [['l', 1], ['r', -1]]) {
    p['foot_' + k + '1'] = { dir: V(s * (0.1 + 0.04 * s * w), -1, 0.05) };
    p['foot_' + k + '2'] = { dir: V(s * 0.05, -1, -0.05) };
    p['ankle_' + k] = { keep: 1 };
  }
  p.arm_l1 = { dir: V(0.45, -1, 0.35) };
  p.arm_l2 = { dir: V(-0.7, -0.3, 0.6) };  // mano en la guata
  p.arm_r1 = { dir: V(-0.5 - 0.05 * w, -1, 0.1) };
  p.arm_r2 = { dir: V(-0.35, -1, 0.25) };
  return p;
}

// Capítulo 5 · manos atrás (escondiendo el ramo en la espalda)
function armsBehind(p) {
  for (const [k, s] of [['l', 1], ['r', -1]]) {
    p['arm_' + k + '1'] = { dir: V(s * 0.22, -1, -0.42) };
    p['arm_' + k + '2'] = { dir: V(-s * 0.75, -0.25, -0.55) };
  }
  return p;
}
function poseHide(u) {
  const p = armsBehind(poseIdle(u));
  p.chest = { rot: E(-0.04, 0, 0) };
  return p;
}
// Caminar en puntillas con las manos atrás
function poseSneak(u) {
  const p = armsBehind(poseWalk(u));
  p.chest = { rot: E(0.16, 0.05 * Math.sin(u * TAU), 0) };
  p.head = { rot: E(-0.1, 0, 0) };
  return p;
}
// Ofreciendo el ramo con las dos manos
function poseOffer(u) {
  const b = Math.sin(u * TAU);
  const p = poseIdle(u);
  p.chest = { rot: E(0.06 + 0.01 * b, 0, 0) };
  p.head = { rot: E(0.02, 0, 0.03 * b) };
  for (const [k, s] of [['l', 1], ['r', -1]]) {
    p['arm_' + k + '1'] = { dir: V(s * 0.18, -0.55, 1) };
    p['arm_' + k + '2'] = { dir: V(-s * 0.32, 0.12 + 0.02 * b, 1) };
  }
  return p;
}
// Celebrando: saltito con los brazos arriba
function poseCheer(u) {
  const j = Math.abs(Math.sin(u * TAU));
  const p = { root: V(0, 0.06 * j, 0) };
  p.chest = { rot: E(-0.08, 0, 0.05 * Math.sin(u * TAU)) };
  p.head = { rot: E(-0.15, 0, 0) };
  for (const [k, s] of [['l', 1], ['r', -1]]) {
    p['foot_' + k + '1'] = { dir: V(s * 0.08, -1, 0.04) };
    p['foot_' + k + '2'] = { dir: V(s * 0.04, -1, -0.04) };
    p['ankle_' + k] = { keep: 1 };
    p['arm_' + k + '1'] = { dir: V(s * 0.55, 1, 0.15) };
    p['arm_' + k + '2'] = { dir: V(s * 0.3, 1, 0.1 - 0.2 * j) };
  }
  return p;
}

// Capítulo 6 · cocinando. Revolver: la mano izquierda sujeta el bol y la derecha da vueltas.
function poseStir(u) {
  const c = Math.cos(u * TAU), s = Math.sin(u * TAU);
  const p = poseIdle(u);
  p.chest = { rot: E(0.14, 0.04 * s, 0.02 * c) };
  p.head = { rot: E(0.22, 0.03 * c, 0) };
  p.arm_l1 = { dir: V(0.3, -0.55, 0.85) };
  p.arm_l2 = { dir: V(-0.55, -0.2, 0.8) };
  p.arm_r1 = { dir: V(-0.22 + 0.1 * c, -0.45, 0.9) };
  p.arm_r2 = { dir: V(0.25 + 0.3 * c, -0.6, 0.75 + 0.3 * s) };
  return p;
}
// Machacar / amasar: las dos manos suben y bajan juntas (con el uslero o exprimiendo)
function poseMash(u) {
  const a = Math.abs(Math.sin(u * TAU));
  const p = poseIdle(u);
  p.root = V(0, -0.02 * (1 - a), 0);
  p.chest = { rot: E(0.18 - 0.06 * a, 0, 0) };
  p.head = { rot: E(0.2, 0, 0) };
  for (const [k, s] of [['l', 1], ['r', -1]]) {
    p['arm_' + k + '1'] = { dir: V(s * 0.2, -0.5 + 0.3 * a, 0.9) };
    p['arm_' + k + '2'] = { dir: V(-s * 0.35, -0.55 + 0.6 * a, 0.8) };
  }
  return p;
}
// Comiendo: la mano derecha va del plato a la boca
function poseEat(u) {
  const m = Math.max(0, Math.sin(u * TAU));
  const p = poseIdle(u);
  p.head = { rot: E(0.05 - 0.08 * m, 0, 0.04 * m) };
  p.arm_l1 = { dir: V(0.3, -0.8, 0.6) };
  p.arm_l2 = { dir: V(-0.5, -0.25, 0.85) };
  p.arm_r1 = { dir: V(-0.3, -0.7 + 0.45 * m, 0.7) };
  p.arm_r2 = { dir: V(0.2 + 0.25 * m, -0.4 + 1.4 * m, 0.8 - 0.3 * m) };
  return p;
}

// Capítulo 7 · picnic. Sentado en el suelo con las piernas estiradas y las manos en las rodillas.
function poseSitFloor(u, rig) {
  const b = Math.sin(u * TAU);
  const p = { root: V(0, -2 * rig.thighLen + 0.004 * b, 0) };
  p.chest = { rot: E(0.05 + 0.012 * b, 0, 0) };
  p.head = { rot: E(-0.03 - 0.012 * b, 0.05 * Math.sin(u * TAU + 0.8), 0) };
  for (const [k, s] of [['l', 1], ['r', -1]]) {
    p['foot_' + k + '1'] = { dir: V(s * 0.3, 0.3, 1) };      // rodillas un poco arriba
    p['foot_' + k + '2'] = { dir: V(-s * 0.08, -0.42, 1) };
    p['arm_' + k + '1'] = { dir: V(s * 0.42, -0.9, 0.45) };
    p['arm_' + k + '2'] = { dir: V(-s * 0.05, -0.55, 1) };
  }
  return p;
}
// Pintando sentado: la derecha da pinceladas hacia adelante, la izquierda sostiene la paleta.
function posePaint(u, rig) {
  const c = Math.cos(u * TAU), s = Math.sin(u * TAU);
  const p = poseSitFloor(u, rig);
  p.chest = { rot: E(0.1, -0.12 + 0.03 * s, 0) };
  p.head = { rot: E(-0.02, 0.1 + 0.04 * s, 0.05 * c) };
  p.arm_r1 = { dir: V(-0.35, -0.3 + 0.1 * s, 1) };
  p.arm_r2 = { dir: V(0.05 + 0.22 * c, 0.3 + 0.25 * s, 1) };
  p.arm_l1 = { dir: V(0.5, -0.85, 0.4) };
  p.arm_l2 = { dir: V(-0.35, -0.05, 1) };
  return p;
}
// Sentado en el suelo celebrando con los brazos arriba
function poseSitCheer(u, rig) {
  const j = Math.abs(Math.sin(u * TAU));
  const p = poseSitFloor(u, rig);
  p.root = V(0, -2 * rig.thighLen + 0.03 * j, 0);
  p.chest = { rot: E(-0.06, 0, 0.05 * Math.sin(u * TAU)) };
  p.head = { rot: E(-0.14, 0, 0) };
  for (const [k, s] of [['l', 1], ['r', -1]]) {
    p['arm_' + k + '1'] = { dir: V(s * 0.55, 1, 0.15) };
    p['arm_' + k + '2'] = { dir: V(s * 0.3, 1, 0.1 - 0.2 * j) };
  }
  return p;
}

// ───────────── "Horneado" de poses a AnimationClips ─────────────
let sharedClips = null;

function bakeClips(root, bones) {
  root.updateMatrixWorld(true);
  const bind = {}, bindWorld = {}, axis = {};
  for (const n of BONES) {
    bind[n] = { q: bones[n].quaternion.clone(), p: bones[n].position.clone() };
    bindWorld[n] = bones[n].getWorldQuaternion(new THREE.Quaternion());
  }
  for (const [n, c] of Object.entries(AXIS_CHILD)) axis[n] = bones[c].position.clone().normalize();
  const rig = { thighLen: bones.foot_l2.position.length() };

  const pw = new THREE.Quaternion(), wc = new THREE.Quaternion(), r = new THREE.Quaternion();
  const v = new THREE.Vector3(), d = new THREE.Vector3();

  function apply(pose) {
    for (const n of BONES) {
      const b = bones[n], spec = pose[n];
      b.quaternion.copy(bind[n].q);
      b.position.copy(bind[n].p);
      if (n === 'skl_root' && pose.root) b.position.add(pose.root);
      if (!spec) continue;
      b.parent.getWorldQuaternion(pw);
      b.getWorldQuaternion(wc); // orientación que tendría con su pose base bajo el padre ya posado
      if (spec.dir) {
        v.copy(axis[n]).applyQuaternion(wc).normalize();
        r.setFromUnitVectors(v, d.copy(spec.dir).normalize());
        wc.premultiply(r);
      } else if (spec.rot) {
        wc.premultiply(r.setFromEuler(spec.rot));
      } else if (spec.keep != null) {
        wc.slerp(bindWorld[n], spec.keep);
      }
      b.quaternion.copy(pw.invert().multiply(wc));
    }
  }

  function bake(name, duration, samples, fn) {
    const times = [], rootPos = [], quats = {};
    for (const n of BONES) quats[n] = [];
    for (let i = 0; i <= samples; i++) {
      apply(fn((i % samples) / samples, rig)); // última muestra = primera → el bucle cierra perfecto
      times.push((i / samples) * duration);
      rootPos.push(...bones.skl_root.position.toArray());
      for (const n of BONES) quats[n].push(...bones[n].quaternion.toArray());
    }
    const tracks = [new THREE.VectorKeyframeTrack('skl_root.position', times, rootPos)];
    for (const n of BONES) tracks.push(new THREE.QuaternionKeyframeTrack(n + '.quaternion', times, quats[n]));
    return new THREE.AnimationClip(name, duration, tracks);
  }

  return {
    idle: bake('idle', 3.2, 32, poseIdle),
    walk: bake('walk', 0.62, 28, poseWalk),
    sit: bake('sit', 3.6, 24, poseSit),
    wave: bake('wave', 0.7, 20, poseWave),
    sitwave: bake('sitwave', 0.7, 20, poseSitWave),
    dance: bake('dance', 1.0, 24, poseDance),     // 2 tiempos a 120 bpm
    dance2: bake('dance2', 1.0, 24, poseDance2),
    dizzy: bake('dizzy', 2.4, 32, poseDizzy),
    hide: bake('hide', 3.2, 32, poseHide),
    sneak: bake('sneak', 0.62, 28, poseSneak),
    offer: bake('offer', 2.4, 24, poseOffer),
    cheer: bake('cheer', 0.6, 20, poseCheer),
    stir: bake('stir', 0.8, 24, poseStir),
    mash: bake('mash', 0.5, 20, poseMash),
    eat: bake('eat', 1.6, 24, poseEat),
    sitfloor: bake('sitfloor', 3.4, 24, poseSitFloor),
    paint: bake('paint', 1.5, 24, posePaint),
    sitcheer: bake('sitcheer', 0.6, 20, poseSitCheer),
  };
}

// ───────────── Materiales ─────────────
// Iluminación simple (Phong) con un borde claro suave, en vez del PBR con el que viene el .glb.
const RIM = `
  float rim = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 2.5);
  outgoingLight += diffuseColor.rgb * rim * 0.32;
  #include <opaque_fragment>`;

// Partes con textura (cara, máscara de ojos/boca…): un material por plantilla.
function texturedMaterial(src) {
  const decal = src.transparent;
  const m = new THREE.MeshPhongMaterial({
    name: src.name, color: src.color, map: src.map,
    transparent: src.transparent, alphaTest: src.alphaTest, side: src.side, depthWrite: src.depthWrite,
    shininess: decal ? 0 : 22,
    specular: new THREE.Color(decal ? 0x000000 : 0x1c1c1c),
  });
  if (!decal) m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', RIM); };
  return m;
}

// Malla fundida de colores lisos: el color viene por vértice, salvo camiseta (aPart = 1) y
// pantalón (aPart = 2), que toman el color del material. Se reutiliza un material por combinación.
const solidCache = new Map();
function solidMaterial(shirt, pants) {
  const key = shirt.getHex() + '_' + pants.getHex();
  let m = solidCache.get(key);
  if (m) return m;
  m = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 22, specular: 0x1c1c1c });
  const uniforms = { uShirt: { value: shirt.clone() }, uPants: { value: pants.clone() } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPart;\nuniform vec3 uShirt;\nuniform vec3 uPants;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nif (aPart > 1.5) vColor.rgb = uPants; else if (aPart > 0.5) vColor.rgb = uShirt;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', RIM);
  };
  solidCache.set(key, m);
  return m;
}

function mergeSolids(list) {
  let nv = 0, ni = 0;
  for (const s of list) { nv += s.geo.attributes.position.count; ni += s.geo.index ? s.geo.index.count : s.geo.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const sw = new Float32Array(nv * 4), si = new Uint16Array(nv * 4), part = new Float32Array(nv);
  const idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const s of list) {
    const a = s.geo.attributes, n = a.position.count;
    for (let i = 0; i < n; i++) {
      const o = vo + i;
      pos[o * 3] = a.position.getX(i); pos[o * 3 + 1] = a.position.getY(i); pos[o * 3 + 2] = a.position.getZ(i);
      nor[o * 3] = a.normal.getX(i); nor[o * 3 + 1] = a.normal.getY(i); nor[o * 3 + 2] = a.normal.getZ(i);
      col[o * 3] = s.color.r; col[o * 3 + 1] = s.color.g; col[o * 3 + 2] = s.color.b;
      si[o * 4] = a.skinIndex.getX(i); si[o * 4 + 1] = a.skinIndex.getY(i); si[o * 4 + 2] = a.skinIndex.getZ(i); si[o * 4 + 3] = a.skinIndex.getW(i);
      sw[o * 4] = a.skinWeight.getX(i); sw[o * 4 + 1] = a.skinWeight.getY(i); sw[o * 4 + 2] = a.skinWeight.getZ(i); sw[o * 4 + 3] = a.skinWeight.getW(i);
      part[o] = s.part;
    }
    if (s.geo.index) for (let j = 0; j < s.geo.index.count; j++) idx[io++] = s.geo.index.getX(j) + vo;
    else for (let j = 0; j < n; j++) idx[io++] = j + vo;
    vo += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  g.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// ───────────── Plantilla (un .glb cargado una vez) ─────────────
class MiiTemplate {
  constructor(gltf) {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    const skinned = [];
    scene.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
    const skel = skinned[0].skeleton;
    this.jointNames = skel.bones.map((b) => b.name);
    this.boneInverses = skel.boneInverses.map((m) => m.clone());
    this.rigSource = scene.getObjectByName('all_root');

    // Altura guardada por Mii Creator (0-127)
    const h = gltf.asset?.extras?.additionalInfo?.height ?? 64;
    this.scale = 0.9 + 0.2 * (h / 127);

    const solids = [];
    this.parts = [];
    this.shirt = new THREE.Color(0x888888);
    this.pants = new THREE.Color(0x555555);
    for (const m of skinned) {
      const mat = m.material;
      if (mat.map || mat.transparent) { this.parts.push({ geometry: m.geometry, material: texturedMaterial(mat) }); continue; }
      let part = 0;
      if (m.name === 'bodyModelBody') { part = 1; this.shirt.copy(mat.color); }
      else if (m.name === 'bodyModelLegs') { part = 2; this.pants.copy(mat.color); }
      solids.push({ geo: m.geometry, color: mat.color, part });
    }
    this.parts.unshift({ geometry: mergeSolids(solids), solid: true });
    for (const p of this.parts) p.geometry.boundingSphere = BOUNDS.clone();
  }

  // Copia del esqueleto, lista para animar
  makeRig() {
    const root = this.rigSource.clone(true);
    const bones = {};
    root.traverse((o) => { bones[o.name] = o; });
    return { root, bones, skeleton: new THREE.Skeleton(this.jointNames.map((n) => bones[n]), this.boneInverses) };
  }
}

const templates = new Map();
export function loadTemplate(file) {
  if (!templates.has(file)) templates.set(file, loader.loadAsync(file).then((g) => new MiiTemplate(g)));
  return templates.get(file);
}

function getClips(template) {
  if (!sharedClips) {
    const rig = template.makeRig();
    sharedClips = bakeClips(rig.root, rig.bones);
  }
  return sharedClips;
}

// ───────────── Esqueleto compartido (para multitudes) ─────────────
// Un solo esqueleto animado en el origen; cualquier cantidad de Miis puede usarlo a la vez.
export class SharedRig {
  constructor(template, anim, phase = 0) {
    this.anim = anim;
    this.rig = template.makeRig();
    this.mixer = new THREE.AnimationMixer(this.rig.root);
    this.mixer.clipAction(getClips(template)[anim]).play();
    this.skeletons = new Map([[template, this.rig.skeleton]]);
    this.update(phase);
  }

  skeletonFor(template) {
    let s = this.skeletons.get(template);
    if (!s) {
      s = new THREE.Skeleton(template.jointNames.map((n) => this.rig.bones[n]), template.boneInverses);
      this.skeletons.set(template, s);
    }
    return s;
  }

  update(dt) {
    this.mixer.update(dt);
    this.rig.root.updateMatrixWorld(true);
  }
}

// ───────────── Mii ─────────────
export class Mii {
  // opts.shared = SharedRig → Mii de multitud (sin esqueleto ni animación propios)
  constructor(template, { id = null, info = null, shared = null, shirt = null, pants = null, scale = null } = {}) {
    this.id = id;
    this.info = info;
    this.template = template;
    this.root = new THREE.Group();   // mover / girar este
    this.model = new THREE.Group();
    this.root.add(this.model);
    this.scale = scale ?? template.scale;
    this.root.scale.setScalar(this.scale);
    this.heading = 0;   // 0 = mirando hacia +Z
    this.talking = false;
    this._talkT = 0;
    this.current = null;

    this.meshes = template.parts.map((p) => {
      const mesh = new THREE.SkinnedMesh(p.geometry, p.solid ? solidMaterial(shirt ?? template.shirt, pants ?? template.pants) : p.material);
      this.model.add(mesh);
      return mesh;
    });

    if (shared) {
      this.mixer = null;
      this.setShared(shared);
    } else {
      this.rig = template.makeRig();
      this.model.add(this.rig.root);
      for (const mesh of this.meshes) {
        mesh.bind(this.rig.skeleton, IDENT);
        mesh.frustumCulled = false; // se sale de su caja original al animarse; son pocos, no importa
      }
      this.mixer = new THREE.AnimationMixer(this.rig.root);
      this.actions = {};
      for (const [name, clip] of Object.entries(getClips(template))) this.actions[name] = this.mixer.clipAction(clip);
      this.play('idle', 0);
      this.mixer.update(Math.random() * 3); // que no respiren todos sincronizados
    }
  }

  get position() { return this.root.position; }

  // Multitud: engancha las mallas a un esqueleto compartido (cambiar de rig = cambiar de animación)
  setShared(shared) {
    for (const mesh of this.meshes) {
      mesh.bindMode = THREE.DetachedBindMode;
      mesh.bind(shared.skeletonFor(this.template), IDENT);
      mesh.boundingSphere = BOUNDS; // permite descartar los que quedan fuera de cámara
      mesh.frustumCulled = true;
    }
    this.current = shared.anim;
  }

  setColors(shirt, pants) {
    this.meshes[0].material = solidMaterial(shirt ?? this.template.shirt, pants ?? this.template.pants);
  }

  play(name, fade = 0.22) {
    if (!this.mixer || this.current === name) return;
    const next = this.actions[name], prev = this.actions[this.current];
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if (prev && fade > 0) next.crossFadeFrom(prev, fade, false);
    else if (prev) prev.stop();
    this.current = name;
  }

  setSpeed(s) { this.actions?.[this.current].setEffectiveTimeScale(s); }

  setHeading(h) { this.heading = h; this.root.rotation.y = h; }

  // Gira suavemente hacia un ángulo
  turnToward(target, dt, rate = 10) {
    let d = (target - this.heading) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    this.setHeading(this.heading + d * Math.min(1, dt * rate));
  }

  faceToward(point, dt, rate = 8) {
    this.turnToward(Math.atan2(point.x - this.position.x, point.z - this.position.z), dt, rate);
  }

  update(dt) {
    this.mixer?.update(dt);
    // saltito mientras habla
    if (this.talking) { this._talkT += dt; this.model.position.y = Math.abs(Math.sin(this._talkT * 13)) * 0.035; }
    else { this._talkT = 0; this.model.position.y *= Math.max(0, 1 - dt * 14); }
  }
}

export async function loadMii(id, info) {
  return new Mii(await loadTemplate(info.file), { id, info });
}
