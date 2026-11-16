// Progreso guardado en el navegador (localStorage): capítulos completados, corazones escondidos
// encontrados y si ya se ganó la carta.
//
// Reglas:
//  · El primer capítulo parte abierto; cada uno de los siguientes se abre al completar el anterior.
//  · Un capítulo con `needsEggs: true` (el concurso) pide además todos los corazones escondidos.
//  · La carta del menú se abre al completar el capítulo con `givesLetter: true`.
//  · Los minijuegos (`extra: true`) se abren al completar todos los capítulos y guardan su récord.
//
// Desde la consola:  game.progress.reset()  borra todo  ·  game.progress.unlockAll()  abre todo.
import { CONFIG } from './config.js';

const KEY = 'regalo-isa-progreso-v1';

export class Progress {
  constructor() {
    this.data = { done: {}, eggs: {}, letter: false, records: {} };
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d) this.data = { done: d.done || {}, eggs: d.eggs || {}, letter: !!d.letter, records: d.records || {} };
    } catch { /* sin almacenamiento (modo privado): el progreso dura lo que dure la pestaña */ }
    this.onChange = null;
  }

  _save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ver arriba */ }
    this.onChange?.();
  }

  // capítulos en orden (todo lo del menú que no sea `free` ni un minijuego `extra`)
  get chapters() { return CONFIG.channels.filter((c) => !c.free && !c.extra); }
  get storyDone() { return this.chapters.every((c) => this.isDone(c.id)); }

  // Minijuegos: números guardados por clave (récords, racha actual…)
  stat(key) { return this.data.records[key] ?? 0; }
  setStat(key, v) { this.data.records[key] = v; this._save(); }
  record(id) { return this.stat(id); }
  // guarda el récord si es mejor que el anterior; devuelve si lo fue
  setRecord(id, v) {
    if (v <= this.stat(id)) return false;
    this.setStat(id, v);
    return true;
  }
  // capítulos que esconden un corazón
  get eggChapters() { return this.chapters.filter((c) => CONFIG.eggs[c.id]); }

  isDone(id) { return !!this.data.done[id]; }
  hasEgg(id) { return !!this.data.eggs[id]; }
  get eggCount() { return this.eggChapters.filter((c) => this.hasEgg(c.id)).length; }
  get eggTotal() { return this.eggChapters.length; }
  get allEggs() { return this.eggCount >= this.eggTotal; }
  get letter() { return this.data.letter; }

  // null = abierto; si no, por qué está cerrado: { prev } y/o { eggs: true }
  lockOf(id) {
    const ch = CONFIG.channels.find((c) => c.id === id);
    if (!ch || ch.free) return null;
    if (ch.extra) return this.storyDone ? null : { story: true };
    const list = this.chapters;
    const i = list.indexOf(ch);
    const prev = i > 0 && !this.isDone(list[i - 1].id) ? list[i - 1] : null;
    const eggs = !!ch.needsEggs && !this.allEggs;
    return prev || eggs ? { prev, eggs } : null;
  }
  isUnlocked(id) { return !this.lockOf(id); }

  complete(id) {
    const ch = CONFIG.channels.find((c) => c.id === id);
    if (!ch || ch.free || ch.extra) return;
    this.data.done[id] = true;
    if (ch.givesLetter) this.data.letter = true;
    this._save();
  }
  collectEgg(id) {
    if (this.data.eggs[id]) return false;
    this.data.eggs[id] = true;
    this._save();
    return true;
  }

  reset() {
    this.data = { done: {}, eggs: {}, letter: false, records: {} };
    this._save();
  }
  unlockAll() {
    for (const c of this.chapters) { this.data.done[c.id] = true; if (CONFIG.eggs[c.id]) this.data.eggs[c.id] = true; }
    this.data.letter = true;
    this._save();
  }
}
