// Punto de entrada: pantalla de inicio → menú → juego.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { AudioSys } from './audio.js';
import { Menu } from './menu.js';
import { Dialogue } from './dialogue.js';
import { PostFX } from './postfx.js';
import { Mission1 } from './mision1.js';
import { Mission2 } from './mision2.js';
import { Mission3 } from './mision3.js';
import { Mission4 } from './mision4.js';
import { Mission5 } from './mision5.js';
import { Mission6 } from './mision6.js';
import { Mission7 } from './mision7.js';
import { Mission8 } from './mision8.js';
import { Duelo } from './duelo.js';
import { Trencito } from './trencito.js';
import { Limones } from './limones.js';
import { Progress } from './progreso.js';
import { Eggs } from './huevos.js';
import { setupCursor } from './cursor.js';

const $ = (s) => document.querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const canvas = $('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.NoToneMapping;
renderer.info.autoReset = false; // para poder contar los dibujados de todo el frame

const audio = new AudioSys();
// copia: las misiones agregan hablantes propios (p. ej. "grupo") sin tocar la lista de Miis
const dialogue = new Dialogue(audio, { ...CONFIG.characters });
const postfx = new PostFX(renderer);
const mission1 = new Mission1({ audio, dialogue, onEnd: (r) => showResult(r) });
const mission2 = new Mission2({ audio, dialogue, onEnd: (r) => showResult(r) });
const mission3 = new Mission3({ audio, dialogue, onEnd: (r) => showResult(r) });
const mission4 = new Mission4({ audio, dialogue, onEnd: (r) => showResult(r) });
const mission5 = new Mission5({ audio, dialogue, onEnd: (r) => showResult(r) });
const mission6 = new Mission6({ audio, dialogue, onEnd: (r) => showResult(r) });
const mission7 = new Mission7({ audio, dialogue, onEnd: (r) => showResult(r) });
const mission8 = new Mission8({ audio, dialogue, onEnd: (r) => showResult(r) });
const progress = new Progress();
const duelo = new Duelo({ audio, dialogue, progress, id: 'duelo', onEnd: (r) => showResult(r) });
const trencito = new Trencito({ audio, dialogue, progress, id: 'trencito', onEnd: (r) => showResult(r) });
const limones = new Limones({ audio, dialogue, progress, id: 'limones', onEnd: (r) => showResult(r) });
const eggs = new Eggs({ audio, progress });
const menu = new Menu(audio, { onStart: startGame, progress });

// Cada casilla del menú → su escena y su música
const SCENES = {
  m1: { scene: mission1, music: 'plaza' },
  m2: { scene: mission2, music: 'sala' },
  m3: { scene: mission3, music: 'disco' },
  m4: { scene: mission4, music: null }, // sin música: suena el reel
  m5: { scene: mission5, music: 'puentes' },
  m6: { scene: mission6, music: 'cocina' },
  m7: { scene: mission7, music: 'parque' },
  m8: { scene: mission8, music: 'concurso' },
  duelo: { scene: duelo, music: 'cocina' },
  trencito: { scene: trencito, music: 'disco' },
  limones: { scene: limones, music: 'parque' },
};
let curId = 'm1';
let cur = mission1;
const defaultHint = $('#hint').innerHTML;

let mode = 'boot'; // 'boot' | 'menu' | 'game'
let paused = false;
let pauseSel = 0;
let result = null; // { buttons } cuando está abierta la pantalla de fin de misión
let resultSel = 0;

// ───────────── Tamaño: siempre 480 líneas, el ancho según la ventana ─────────────
function resize() {
  const h = CONFIG.internalHeight;
  const aspect = innerWidth > 0 && innerHeight > 0 ? innerWidth / innerHeight : 16 / 9;
  const w = Math.max(320, Math.round((h * aspect) / 2) * 2);
  renderer.setSize(w, h, false);
  postfx.setSize(w, h);
  for (const s of Object.values(SCENES)) s.scene.setAspect(w / h);
  // La interfaz se dibuja nítida; este desenfoque la deja igual de suave que el juego a 480p.
  document.documentElement.style.setProperty('--soft', ((innerHeight / h) * 0.45).toFixed(2) + 'px');
}
addEventListener('resize', resize);
resize();

// ───────────── Carga en segundo plano (mientras se ve el menú) ─────────────
async function snapshot(id) {
  const s = SCENES[id].scene;
  postfx.render(s.scene, s.camera);
  const url = canvas.toDataURL('image/jpeg', 0.9);
  // una escena puede armar su propia miniatura (p. ej. el capítulo 4 le pone el celular encima)
  menu.setPreview(id, s.preview ? await s.preview(url) : url);
}
const loading = {};
for (const id of Object.keys(SCENES)) {
  loading[id] = SCENES[id].scene.load().then(() => snapshot(id)).catch((e) => {
    console.error(e);
    alert('No se pudieron cargar los modelos. Abre el juego con jugar.bat (necesita un servidor local e internet para three.js).');
  });
}

// ───────────── Flujo ─────────────
async function fade(on) {
  $('#fade').classList.toggle('on', on);
  await wait(480);
}

function bootContinue() {
  if (mode !== 'boot') return;
  audio.unlock();
  audio.play('select');
  mode = 'menu';
  menu.show();
  $('#boot').classList.add('out');
  setTimeout(() => $('#boot').classList.add('hidden'), 600);
  audio.startMusic('menu');
}

async function startGame(id = curId) {
  audio.stopMusic();
  await Promise.all([fade(true), loading[id], wait(900)]);
  hideResult();
  menu.hide();
  dialogue.cancel();
  for (const s of Object.values(SCENES)) s.scene.exit?.();
  curId = id;
  cur = SCENES[id].scene;
  cur.reset();
  eggs.attach(id, cur);
  const ch = CONFIG.channels.find((c) => c.id === id);
  $('.pause-bottom span').textContent = ch ? ch.title : '';
  $('#hint').innerHTML = cur.hint ?? defaultHint;
  mode = 'game';
  setPaused(false);
  $('#hud').classList.remove('hidden');
  document.body.classList.remove('show-cursor');
  if (SCENES[id].music) audio.startMusic(SCENES[id].music);
  await fade(false);
}

async function backToMenu() {
  audio.stopMusic();
  audio.play('back');
  await fade(true);
  mode = 'menu';
  setPaused(false);
  hideResult();
  dialogue.cancel();
  cur.exit?.();
  eggs.detach();
  $('#hud').classList.add('hidden');
  document.body.classList.add('show-cursor');
  menu.show();
  audio.startMusic('menu');
  await fade(false);
}

function setPaused(p) {
  paused = p;
  if (mode === 'game') cur.setPaused?.(p);
  $('#pause').classList.toggle('hidden', !p);
  pauseSel = 0;
  paintPause();
  document.body.classList.toggle('show-cursor', mode !== 'game' || p || dialogue.mode === 'choosing' || !!result);
}
function paintPause() {
  [...document.querySelectorAll('#pause .pill')].forEach((b, i) => b.classList.toggle('sel', i === pauseSel));
}
function pauseAct(act) {
  if (act === 'resume') { audio.play('select'); setPaused(false); }
  else if (act === 'menu') backToMenu();
}
document.querySelectorAll('#pause .pill').forEach((b, i) => {
  b.addEventListener('mouseenter', () => { pauseSel = i; paintPause(); });
  b.addEventListener('click', () => pauseAct(b.dataset.act));
});

// ───────────── Fin de misión ─────────────
// el título y el texto los manda cada misión (están en src/misionN_dialogos.js)
// icon / again: los minijuegos arcade ponen su propio ícono y dejan "Jugar otra vez" primero
async function showResult({ win, title = '', text = '', icon = null, again = false }) {
  if (win) progress.complete(curId); // abre el capítulo siguiente (y la carta, si es el último)
  await wait(win ? 900 : 300);
  const el = $('#result');
  el.classList.toggle('win', win);
  el.classList.toggle('lose', !win);
  $('#resIcon').textContent = icon ?? (win ? '★' : '💀');
  $('#resTitle').textContent = title;
  $('#resText').textContent = text;
  const buttons = win
    ? [{ label: 'Volver al menú', act: () => backToMenu() }, { label: 'Jugar otra vez', act: () => startGame(curId) }]
    : [{ label: 'Reintentar', act: () => startGame(curId) }, { label: 'Menú', act: () => backToMenu() }];
  if (again) buttons.reverse();
  const box = $('#resButtons');
  box.innerHTML = '';
  buttons.forEach((b, i) => {
    const btn = document.createElement('button');
    btn.className = 'pill';
    btn.textContent = b.label;
    btn.addEventListener('mouseenter', () => { resultSel = i; paintResult(); });
    btn.addEventListener('click', () => resultAct(i));
    box.appendChild(btn);
  });
  result = { buttons };
  resultSel = 0;
  paintResult();
  el.classList.remove('hidden');
  document.body.classList.add('show-cursor');
}
function hideResult() {
  result = null;
  $('#result').classList.add('hidden');
}
function paintResult() {
  [...document.querySelectorAll('#resButtons .pill')].forEach((b, i) => b.classList.toggle('sel', i === resultSel));
}
function resultAct(i) {
  if (!result) return;
  const b = result.buttons[i];
  audio.play('select');
  result = null;
  b.act();
}

// ───────────── Entrada ─────────────
const held = new Set();
const A_KEYS = ['KeyE', 'Space', 'Enter', 'KeyZ'];
const DIRS = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};

addEventListener('keydown', (e) => {
  if (e.code in DIRS || A_KEYS.includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  held.add(e.code);
  const isA = A_KEYS.includes(e.code);

  if (mode === 'boot') { bootContinue(); return; }
  if (mode === 'menu') { menu.key(e.code); return; }

  // en juego
  if (result) {
    const d = DIRS[e.code];
    if (d && (d[0] || d[1])) { resultSel = 1 - resultSel; audio.play('hover'); paintResult(); }
    else if (isA) resultAct(resultSel);
    return;
  }
  if (e.code === 'Escape' && !$('#fade').classList.contains('on')) {
    audio.play('pause');
    setPaused(!paused);
    return;
  }
  if (paused) {
    const d = DIRS[e.code];
    if (d && (d[0] || d[1])) { pauseSel = 1 - pauseSel; audio.play('hover'); paintPause(); }
    else if (isA) pauseAct(document.querySelectorAll('#pause .pill')[pauseSel].dataset.act);
    return;
  }
  if (dialogue.active) {
    if (isA) dialogue.press();
    else if (DIRS[e.code]?.[1]) dialogue.nav(DIRS[e.code][1]);
    return;
  }
  if (isA) cur.pressA();
  else if (DIRS[e.code] && cur.pressDir) cur.pressDir(...DIRS[e.code]); // p. ej. revolver en el capítulo 6
  else if (e.code === 'KeyC' && cur.toggleCrowd) { audio.play('select'); cur.toggleCrowd(); }
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => held.clear());
$('#boot').addEventListener('click', bootContinue);

// Girar la cámara: Q / R, o arrastrando con el mouse
let dragX = 0, dragging = false, lastDragX = 0;
canvas.addEventListener('mousedown', (e) => { dragging = true; lastDragX = e.clientX; });
addEventListener('mouseup', () => { dragging = false; });
// Corazón escondido: un clic encima lo recoge (en captura, para que sirva aunque haya interfaz encima)
addEventListener('mousedown', (e) => {
  if (mode !== 'game' || paused || result || $('#fade').classList.contains('on')) return;
  if (eggs.click(e.clientX, e.clientY)) { e.stopPropagation(); dragging = false; }
}, true);
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  dragX += e.clientX - lastDragX;
  lastDragX = e.clientX;
});
function rotateInput(dt) {
  let r = 0;
  if (held.has('KeyQ')) r -= 1;
  if (held.has('KeyR')) r += 1;
  const amount = r * 2.4 * dt - dragX * 0.008;
  dragX = 0;
  return amount;
}

function moveInput() {
  let x = 0, z = 0;
  for (const code of held) { const d = DIRS[code]; if (d) { x += d[0]; z += d[1]; } }
  // a = botón A mantenido (p. ej. esconder el ramo en el capítulo 5)
  return { x: Math.sign(x), z: Math.sign(z), a: A_KEYS.some((k) => held.has(k)) };
}

// ───────────── Cursor de mano ─────────────
const cursor = $('#cursor');
let cx = 0, cy = 0, tilt = 0, lastX = 0;
let mouseT = 0; // segundos desde que se movió el mouse: la mano aparece un rato para poder apuntar
addEventListener('mousemove', (e) => {
  cx = e.clientX; cy = e.clientY;
  mouseT = 0;
  cursor.classList.add('seen');
});
function updateCursor(dt) {
  const target = Math.max(-18, Math.min(18, (cx - lastX) * 1.2));
  lastX = cx;
  tilt += (target - tilt) * Math.min(1, dt * 10);
  cursor.style.transform = `translate(${cx}px, ${cy}px) rotate(${tilt - 8}deg)`;
}

setupCursor(cursor, 'assets/ui/manos.gif');

// Contador (solo visible con la multitud de prueba activada)
const statsEl = $('#stats');
let fpsAcc = 0, fpsN = 0;
function updateStats(dt) {
  fpsAcc += dt; fpsN++;
  if (fpsAcc < 0.5) return;
  const n = cur.crowdCount ?? 0;
  statsEl.classList.toggle('hidden', !n);
  if (n) statsEl.textContent = `${n + 4} Miis · ${renderer.info.render.calls} dibujados · ${Math.round(fpsN / fpsAcc)} fps`;
  fpsAcc = 0; fpsN = 0;
}

// ───────────── Bucle principal ─────────────
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  updateCursor(dt);
  if (mode !== 'game') return;
  if (!paused) {
    dialogue.fast = held.has('ShiftLeft') || held.has('ShiftRight');
    dialogue.update(dt);
    const rot = rotateInput(dt);
    if (!dialogue.active && rot) cur.rotateCamera?.(rot);
    cur.update(dt, dialogue.active ? { x: 0, z: 0 } : moveInput());
    eggs.update(dt);
    // el cursor de mano aparece cuando hay algo que apuntar, o un rato después de mover el mouse
    // (si queda un corazón escondido por encontrar en este capítulo)
    mouseT += dt;
    document.body.classList.toggle('show-cursor', dialogue.active || !!result || !!cur.wantsCursor || (eggs.active && mouseT < 2));
  }
  renderer.info.reset();
  postfx.render(cur.scene, cur.camera);
  updateStats(dt);
}
frame();

// para depurar desde la consola
window.game = { mission1, mission2, mission3, mission4, mission5, mission6, mission7, mission8, duelo, trencito, limones, progress, eggs, dialogue, audio, menu, renderer, start: startGame, get cur() { return cur; } };
