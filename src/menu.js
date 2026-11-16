// Menú principal: cuadrícula de casillas, barra inferior con reloj y pantalla de canal.
import { CONFIG } from './config.js';

const $ = (s) => document.querySelector(s);
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export class Menu {
  constructor(audio, { onStart }) {
    this.audio = audio;
    this.onStart = onStart;
    this.root = $('#menu');
    this.grid = $('#grid');
    this.channel = $('#channel');
    this.tiles = {};
    this.previews = {};
    this.current = null;
    this.busy = false;

    const bySlot = [];
    CONFIG.channels.forEach((c, i) => { bySlot[c.slot ?? i] = c; });
    for (let i = 0; i < 12; i++) {
      const ch = bySlot[i];
      const tile = document.createElement('button');
      tile.className = 'tile' + (ch ? '' : ' empty');
      if (ch) {
        tile.innerHTML = `<div class="tile-img"></div><div class="tile-loading">Cargando…</div><div class="tile-label">${ch.title}</div>`;
        this.tiles[ch.id] = tile;
        tile.addEventListener('click', () => this.open(ch, tile));
      } else {
        tile.innerHTML = '<div class="tile-ghost">?</div>';
        tile.addEventListener('click', () => {
          audio.play('locked');
          tile.classList.remove('shake'); void tile.offsetWidth; tile.classList.add('shake');
        });
      }
      this.grid.appendChild(tile);
    }

    // sonido al pasar por encima de cualquier botón
    document.addEventListener('mouseover', (e) => {
      const b = e.target.closest?.('button');
      if (b && b !== this._lastHover) audio.play('hover');
      this._lastHover = b;
    });

    $('#chBack').addEventListener('click', () => this.close());
    $('#chStart').addEventListener('click', () => this.start());

    const snd = $('#btnSound');
    snd.addEventListener('click', () => {
      audio.setMuted(!audio.muted);
      snd.classList.toggle('off', audio.muted);
      audio.play('select');
    });
    $('#btnLetter').addEventListener('click', () => {
      audio.play('open');
      $('#letterTitle').textContent = CONFIG.letter.title;
      $('#letterBody').textContent = CONFIG.letter.body;
      $('#letter').classList.remove('hidden');
    });
    $('#letterClose').addEventListener('click', () => this.closeLetter());

    this._tick();
    setInterval(() => this._tick(), 1000);
  }

  get visible() { return !this.root.classList.contains('hidden'); }

  show() {
    this.root.classList.remove('hidden');
    this.channel.classList.add('hidden');
    this.current = null;
    this.busy = false;
  }
  hide() {
    this.root.classList.add('hidden');
    this.channel.classList.add('hidden');
  }

  setPreview(id, url) {
    this.previews[id] = url;
    const tile = this.tiles[id];
    if (!tile) return;
    tile.querySelector('.tile-img').style.backgroundImage = `url(${url})`;
    tile.querySelector('.tile-loading')?.remove();
  }

  closeLetter() {
    if ($('#letter').classList.contains('hidden')) return false;
    this.audio.play('back');
    $('#letter').classList.add('hidden');
    return true;
  }

  // La casilla "crece" hasta ocupar toda la pantalla
  open(ch, tile) {
    if (this.busy || this.current) return;
    this.audio.play('open');
    this.current = { ch, tile };
    $('#chTitle').textContent = ch.title;
    $('#chSub').textContent = ch.subtitle || '';
    $('#chImage').style.backgroundImage = this.previews[ch.id] ? `url(${this.previews[ch.id]})` : '';
    const c = this.channel;
    c.classList.remove('anim', 'hidden');
    c.style.transform = this._tileTransform(tile);
    c.style.borderRadius = '6vmin';
    void c.offsetWidth;
    c.classList.add('anim');
    c.style.transform = 'none';
    c.style.borderRadius = '0';
  }

  close() {
    if (this.busy || !this.current) return false;
    this.audio.play('back');
    const c = this.channel, { tile } = this.current;
    this.current = null;
    c.classList.add('anim');
    c.style.transform = this._tileTransform(tile);
    c.style.borderRadius = '6vmin';
    setTimeout(() => { if (!this.current) c.classList.add('hidden'); }, 420);
    return true;
  }

  start() {
    if (this.busy || !this.current) return;
    this.busy = true;
    this.audio.play('start');
    this.onStart(this.current.ch.id);
  }

  // Esc / Enter desde el teclado
  key(code) {
    if (!this.visible) return;
    if (code === 'Escape') { if (!this.closeLetter()) this.close(); }
    else if (code === 'Enter' && this.current) this.start();
  }

  _tileTransform(tile) {
    const r = tile.getBoundingClientRect();
    return `translate(${r.left}px, ${r.top}px) scale(${r.width / innerWidth}, ${r.height / innerHeight})`;
  }

  _tick() {
    const d = new Date();
    $('#clkH').textContent = String(d.getHours()).padStart(2, '0');
    $('#clkM').textContent = String(d.getMinutes()).padStart(2, '0');
    $('#clockDate').textContent = `${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
  }
}
