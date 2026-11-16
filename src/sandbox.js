// Zona de pruebas: plano infinito blanco con los 4 Miis.
//   · Isa        → la controla el jugador
//   · Joaco      → de pie (idle), te sigue con la mirada
//   · Random 1   → sentado en un taburete
//   · Random 2   → caminando de un punto a otro
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { loadMii, loadTemplate, Mii, SharedRig, randomShirt, randomPants } from './mii.js';
import { DIALOGUES } from './dialogues.js';

const WALK_SPEED = 2.5;      // unidades por segundo (un Mii mide ~2)
const WALK_CYCLE_SPEED = 1.65; // velocidad a la que la animación de caminar "calza" con el suelo
const SEAT_H = 0.24;
const TAU = Math.PI * 2;
const CROWD_SIZE = 100;

const $ = (s) => document.querySelector(s);

function makeFloor() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCenter: { value: new THREE.Vector3() } },
    vertexShader: /* glsl */`
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCenter;
      varying vec3 vW;
      void main() {
        float dist = length(vW.xz - uCenter.xz);
        // cuadrícula muy tenue para que se note el movimiento; se desvanece a blanco puro a lo lejos
        vec2 p = vW.xz / 2.0;
        vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        float fade = 1.0 - smoothstep(5.0, 34.0, dist);
        vec3 base = mix(vec3(0.93, 0.945, 0.96), vec3(1.0), smoothstep(3.0, 42.0, dist));
        vec3 col = mix(base, vec3(0.74, 0.83, 0.92), line * 0.6 * fade);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function makeBlobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(40,55,80,0.42)');
  grad.addColorStop(0.55, 'rgba(40,55,80,0.22)');
  grad.addColorStop(1, 'rgba(40,55,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Sandbox {
  constructor({ audio, dialogue }) {
    this.audio = audio;
    this.dialogue = dialogue;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 400);
    this.state = 'play'; // 'play' | 'dialogue' | 'busy' | 'sitting'
    this.time = 0;
    this.promptEl = $('#prompt');
    this.promptText = $('#promptText');
    this.camTarget = new THREE.Vector3();
    this.camOffset = new THREE.Vector3(0, 3.3, 8.6);
    this.focus = null; // Mii con el que se está hablando
    this.lookY = 1.2;
    this.camYaw = this.camYawGoal = 0; // giro de la cámara alrededor del jugador (Q / R o arrastrar)
  }

  async load() {
    const scene = this.scene;
    scene.background = new THREE.Color(0xffffff);
    scene.fog = new THREE.Fog(0xffffff, 16, 60);

    // Luz: mucho relleno suave + un sol frontal. Sin sombras proyectadas: sombras "de mancha".
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcfdcec, 2.1));
    const sun = new THREE.DirectionalLight(0xfff6e8, 1.7);
    sun.position.set(-3, 8, 6);
    scene.add(sun);

    this.floor = makeFloor();
    scene.add(this.floor);

    this.blobTex = makeBlobTexture();
    this.blobMat = new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false, fog: false });
    this.blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

    // Miis
    const ids = Object.keys(CONFIG.characters);
    const list = await Promise.all(ids.map((id) => loadMii(id, CONFIG.characters[id])));
    this.miis = {};
    for (const m of list) {
      this.miis[m.id] = m;
      m.root.add(this._blob(1.25, 0.02));
      scene.add(m.root);
    }
    this.player = this.miis[CONFIG.player];

    // Taburetes
    this.stools = [this._stool(2.3, -1.4), this._stool(3.9, -1.4)];

    this.wander = {
      points: [[-5, -4.5], [-1.5, -6], [3, -5.5], [6, -3.5], [3, -7.5], [-3, -7.5]].map(([x, z]) => new THREE.Vector3(x, 0, z)),
      i: 0, wait: 0,
    };

    // Cosas con las que se puede interactuar
    this.interactables = [
      { mii: this.miis.yo, label: 'Hablar', range: 1.9, act: () => this.talk('yo') },
      { mii: this.miis.random1, label: 'Hablar', range: 1.9, act: () => this.talk('random1') },
      { mii: this.miis.random2, label: 'Hablar', range: 1.9, act: () => this.talk('random2') },
      { stool: this.stools[1], label: 'Sentarse', range: 1.25, act: () => this.sit(this.stools[1]) },
    ];

    this.reset();
  }

  _blob(size, y) {
    const m = new THREE.Mesh(this.blobGeo, this.blobMat);
    m.scale.setScalar(size);
    m.position.y = y;
    m.renderOrder = 1;
    return m;
  }

  _stoolParts() {
    return this._sp ??= {
      bodyGeo: new THREE.CylinderGeometry(0.31, 0.34, SEAT_H - 0.04, 20).translate(0, (SEAT_H - 0.04) / 2, 0),
      topGeo: new THREE.CylinderGeometry(0.33, 0.33, 0.04, 20).translate(0, SEAT_H - 0.02, 0),
      bodyMat: new THREE.MeshPhongMaterial({ color: 0xf2f6fb, shininess: 10, specular: 0x111111 }),
      topMat: new THREE.MeshPhongMaterial({ color: 0x6ccbf0, shininess: 30, specular: 0x222222 }),
    };
  }

  _stool(x, z) {
    const g = new THREE.Group();
    const sp = this._stoolParts();
    g.add(new THREE.Mesh(sp.bodyGeo, sp.bodyMat), new THREE.Mesh(sp.topGeo, sp.topMat), this._blob(1.35, 0.015));
    g.position.set(x, 0, z);
    this.scene.add(g);
    return g;
  }

  // ───────────── Multitud de prueba ─────────────
  // 100 Miis (mitad sentados, mitad de pie) con ropa al azar. Todos cuelgan de unos pocos
  // esqueletos compartidos, y sombras y taburetes van en mallas instanciadas (1 dibujado cada una).
  get crowdCount() { return this.crowd ? this.crowd.miis.length : 0; }

  async toggleCrowd() {
    if (this.crowd) {
      this.scene.remove(this.crowd.group);
      this.crowd.blobs.dispose(); this.crowd.stoolBody.dispose(); this.crowd.stoolTop.dispose();
      this.crowd = null;
      return;
    }
    if (this._crowdBusy) return;
    this._crowdBusy = true;
    const tpls = await Promise.all(['random1', 'random2'].map((id) => loadTemplate(CONFIG.characters[id].file)));
    // 3 fases por animación para que no respiren todos a la vez
    this.rigs ??= {
      idle: [0, 1.1, 2.2].map((ph) => new SharedRig(tpls[0], 'idle', ph)),
      sit: [0, 1.2, 2.4].map((ph) => new SharedRig(tpls[0], 'sit', ph)),
    };
    const group = new THREE.Group();
    const miis = [], seats = [];
    const cols = 20;
    for (let i = 0; i < CROWD_SIZE; i++) {
      const seated = Math.random() < 0.5;
      const tpl = tpls[i % tpls.length];
      const rig = this.rigs[seated ? 'sit' : 'idle'][i % 3];
      const m = new Mii(tpl, { shared: rig, shirt: randomShirt(), pants: randomPants(), scale: tpl.scale * (0.9 + Math.random() * 0.16) });
      const x = ((i % cols) - (cols - 1) / 2) * 1.9 + (Math.random() - 0.5) * 0.5;
      const z = -9.5 - Math.floor(i / cols) * 2.3 + (Math.random() - 0.5) * 0.5;
      if (seated) { m.position.set(x, SEAT_H - 0.22 * m.scale, z + 0.12); seats.push([x, z]); }
      else m.position.set(x, 0, z);
      m.setHeading((Math.random() - 0.5) * 0.8);
      m.root.updateMatrix();
      m.root.matrixAutoUpdate = false; // no se mueven: no hace falta recalcular su matriz
      group.add(m.root);
      miis.push(m);
    }
    const sp = this._stoolParts();
    const mat4 = new THREE.Matrix4();
    const blobs = new THREE.InstancedMesh(this.blobGeo, this.blobMat, CROWD_SIZE);
    blobs.renderOrder = 1;
    miis.forEach((m, i) => blobs.setMatrixAt(i, mat4.makeScale(1.3, 1, 1.3).setPosition(m.position.x, 0.02, m.position.z)));
    const stoolBody = new THREE.InstancedMesh(sp.bodyGeo, sp.bodyMat, seats.length);
    const stoolTop = new THREE.InstancedMesh(sp.topGeo, sp.topMat, seats.length);
    seats.forEach(([x, z], i) => { mat4.makeTranslation(x, 0, z); stoolBody.setMatrixAt(i, mat4); stoolTop.setMatrixAt(i, mat4); });
    for (const im of [blobs, stoolBody, stoolTop]) { im.frustumCulled = false; group.add(im); }
    this.scene.add(group);
    this.crowd = { group, miis, blobs, stoolBody, stoolTop };
    this._crowdBusy = false;
  }

  // Deja todo en su posición inicial
  reset() {
    const { isa, yo, random1, random2 } = this.miis;
    const others = { isa, yo, random1, random2 };
    for (const m of Object.values(others)) { m.talking = false; m.play('idle', 0); }
    // los dos "random" estrenan ropa cada vez que se entra
    random1.setColors(randomShirt(), randomPants());
    random2.setColors(randomShirt(), randomPants());

    this.player.position.set(0, 0, 2.2);
    this.player.setHeading(0);

    const npcYo = this.player === yo ? isa : yo;
    npcYo.position.set(-2.4, 0, -1.2);
    npcYo.setHeading(0.4);
    npcYo.home = 0.4;

    this._seat(random1, this.stools[0]);
    random1.play('sit', 0);

    this.wander.i = 0; this.wander.wait = 0;
    random2.position.copy(this.wander.points[0]);
    random2.setHeading(Math.PI / 2);

    this.state = 'play';
    this.focus = null;
    this.seated = null;
    this.stepAcc = 0;
    this.camTarget.copy(this.player.position);
    this.camYaw = this.camYawGoal = 0;
    this._placeCamera(1);
    for (const m of Object.values(this.miis)) m.update(0);
    this.promptEl.classList.add('hidden');
  }

  _seat(mii, stool) {
    mii.position.set(stool.position.x, SEAT_H - 0.22 * mii.scale, stool.position.z + 0.12);
    mii.setHeading(0);
  }

  // ───────────── Acciones ─────────────
  pressA() {
    if (this.state === 'play' && this.target) this.target.act();
    else if (this.state === 'sitting') this.stand();
  }

  async talk(id) {
    const npc = this.miis[id];
    this.state = 'dialogue';
    this.focus = npc;
    this.promptEl.classList.add('hidden');
    if (this.player.current === 'walk') this.player.play('idle');
    await this.dialogue.play(DIALOGUES[id], {
      onSpeak: () => {},
      onTyping: (who, on) => { if (this.miis[who]) this.miis[who].talking = on; },
    });
    for (const m of Object.values(this.miis)) m.talking = false;
    this.focus = null;
    this.state = this.seated ? 'sitting' : 'play';
  }

  sit(stool) {
    this.state = 'busy';
    this.seated = stool;
    this.audio.play('sit');
    this.player.play('sit', 0.3);
    this._tween = {
      t: 0, dur: 0.3, from: this.player.position.clone(),
      to: new THREE.Vector3(stool.position.x, SEAT_H - 0.22 * this.player.scale, stool.position.z + 0.12),
      heading: 0, then: 'sitting',
    };
  }

  stand() {
    const s = this.seated;
    this.state = 'busy';
    this.player.play('idle', 0.3);
    this.audio.play('step');
    this._tween = {
      t: 0, dur: 0.3, from: this.player.position.clone(),
      to: new THREE.Vector3(s.position.x, 0, s.position.z + 0.85),
      heading: 0, then: 'play', onDone: () => { this.seated = null; },
    };
  }

  // ───────────── Bucle ─────────────
  update(dt, input) {
    this.time += dt;
    const p = this.player;

    if (this.state === 'play') this._movePlayer(dt, input);
    else if (this.state === 'sitting' && Math.hypot(input.x, input.z) > 0.5) this.stand();
    else if (this.state === 'busy' && this._tween) {
      const tw = this._tween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const k = tw.t * tw.t * (3 - 2 * tw.t);
      p.position.lerpVectors(tw.from, tw.to, k);
      p.turnToward(tw.heading, dt, 14);
      if (tw.t >= 1) { this._tween = null; tw.onDone?.(); this.state = tw.then; }
    } else if (this.state === 'dialogue' && this.focus && !this.seated) {
      p.faceToward(this.focus.position, dt);
    }

    this._updateNPCs(dt);
    if (this.crowd) for (const k in this.rigs) for (const r of this.rigs[k]) r.update(dt);
    for (const m of Object.values(this.miis)) m.update(dt);
    this._updateTarget();
    this._placeCamera(1 - Math.exp(-dt * 5));
  }

  rotateCamera(d) {
    if (this.state !== 'busy') this.camYawGoal += d;
  }

  _movePlayer(dt, input) {
    const p = this.player;
    // relativo a la cámara
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
    // choques simples (círculos)
    for (const m of Object.values(this.miis)) if (m !== p && m.current !== 'sit') this._pushOut(p.position, m.position, 0.75);
    for (const s of this.stools) this._pushOut(p.position, s.position, 0.72);
    if (this.crowd) for (const m of this.crowd.miis) this._pushOut(p.position, m.position, 0.7);
  }

  _pushOut(pos, other, r) {
    const dx = pos.x - other.x, dz = pos.z - other.z;
    const d = Math.hypot(dx, dz);
    if (d < r && d > 1e-4) { pos.x = other.x + (dx / d) * r; pos.z = other.z + (dz / d) * r; }
  }

  _updateNPCs(dt) {
    const p = this.player;
    for (const m of Object.values(this.miis)) {
      if (m === p) continue;
      const talkingToMe = this.focus === m;

      if (m.id === 'random2') { // el que camina
        const w = this.wander;
        const near = m.position.distanceTo(p.position) < 1.3;
        if (talkingToMe) { m.play('idle'); m.faceToward(p.position, dt); continue; }
        if (w.wait > 0 || near) {
          w.wait -= dt;
          m.play('idle');
          if (near) m.faceToward(p.position, dt, 5);
          continue;
        }
        const goal = w.points[w.i];
        const dx = goal.x - m.position.x, dz = goal.z - m.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.08) { w.i = (w.i + 1) % w.points.length; w.wait = 1.2 + Math.random() * 2; continue; }
        const sp = 1.5;
        m.position.x += (dx / d) * Math.min(d, sp * dt);
        m.position.z += (dz / d) * Math.min(d, sp * dt);
        m.turnToward(Math.atan2(dx, dz), dt, 8);
        m.play('walk');
        m.setSpeed(sp / WALK_CYCLE_SPEED);
      } else if (m.current !== 'sit') { // el que está de pie
        const d = m.position.distanceTo(p.position);
        if (talkingToMe || d < 4.5) m.faceToward(p.position, dt, talkingToMe ? 8 : 3);
        else m.turnToward(m.home ?? 0, dt, 2);
      }
    }
  }

  // Busca lo más cercano con lo que se pueda interactuar y coloca el cartelito "A"
  _updateTarget() {
    this.target = null;
    if (this.state !== 'play' && this.state !== 'sitting') { this.promptEl.classList.add('hidden'); return; }
    const v = new THREE.Vector3();
    let label = null;
    if (this.state === 'sitting') {
      label = 'Levantarse';
      v.copy(this.player.position).setY(2.35 * this.player.scale);
    } else {
      let best = Infinity;
      for (const it of this.interactables) {
        const pos = it.mii ? it.mii.position : it.stool.position;
        const d = Math.hypot(pos.x - this.player.position.x, pos.z - this.player.position.z);
        if (d < it.range && d < best) { best = d; this.target = it; }
      }
      if (this.target) {
        const it = this.target;
        label = it.label;
        if (it.mii) v.copy(it.mii.position).setY(it.mii.position.y + 2.3 * it.mii.scale);
        else v.copy(it.stool.position).setY(1.0);
      }
    }
    if (!label) { this.promptEl.classList.add('hidden'); return; }
    v.project(this.camera);
    this.promptText.textContent = label;
    this.promptEl.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + 'px';
    this.promptEl.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
    this.promptEl.classList.remove('hidden');
  }

  _placeCamera(k) {
    const p = this.player.position;
    const want = new THREE.Vector3(p.x, 0, p.z);
    const off = new THREE.Vector3(0, 3.3, 8.6);
    let lookY = 1.2;
    if (this.state === 'dialogue' && this.focus) {
      // en un diálogo la cámara se acerca y encuadra a los dos
      want.lerp(new THREE.Vector3(this.focus.position.x, 0, this.focus.position.z), 0.5);
      off.set(0, 2.2, 7.0);
      lookY = 0.55; // deja a los personajes por encima del cuadro de texto
    }
    this.camYaw += (this.camYawGoal - this.camYaw) * Math.min(1, k * 2);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.camYaw);
    this.camTarget.lerp(want, k);
    this.camOffset.lerp(off, k);
    this.camera.position.copy(this.camTarget).add(this.camOffset);
    this.lookY += (lookY - this.lookY) * k;
    this.camera.lookAt(this.camTarget.x, this.lookY, this.camTarget.z);
    this.floor.position.set(this.camTarget.x, 0, this.camTarget.z);
    this.floor.material.uniforms.uCenter.value.copy(this.camTarget);
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }
}
