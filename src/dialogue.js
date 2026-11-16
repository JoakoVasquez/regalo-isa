// Sistema de diálogo.
//
// Un guion es una lista de líneas:
//   { who: 'yo', text: 'Hola, *Isa*.{w} ¿Cómo estás?' }
//   { who: 'yo', text: '¿Sí o no?', choices: [
//       { text: 'Sí', then: [ ...más líneas... ] },
//       { text: 'No', then: [ ... ] },
//   ] }
//   { do: () => algo() }            // ejecuta código en medio del diálogo (puede ser async)
//
// Marcas dentro del texto:  *así* resalta en color,  {w} hace una pausa,  \n salta de línea.
//
// Uso:  await dialogue.play(guion, { onSpeak(id), onTyping(id, bool) })

const $ = (s) => document.querySelector(s);

export class Dialogue {
  constructor(audio, speakers) {
    this.audio = audio;
    this.speakers = speakers;
    this.root = $('#dialogue');
    this.box = $('#dlgBox');
    this.nameEl = $('#dlgName');
    this.textEl = $('#dlgText');
    this.nextEl = $('#dlgNext');
    this.choicesEl = $('#dlgChoices');
    this.active = false;
    this.mode = null; // 'typing' | 'waiting' | 'choosing'
    this.fast = false;
    this.box.addEventListener('click', () => this.press());
  }

  async play(script, hooks = {}) {
    if (this.active) return;
    this.active = true;
    this.hooks = hooks;
    this.textEl.innerHTML = '';
    this.choicesEl.innerHTML = '';
    this.root.classList.remove('hidden');
    this.audio.play('dlgOpen');
    await this._run(script);
    this.root.classList.add('hidden');
    this.mode = null;
    this.active = false;
  }

  // Corta cualquier diálogo a medias (al salir al menú o reiniciar una misión)
  cancel() {
    this.active = false;
    this.mode = null;
    this._resolve = null;
    this.root.classList.add('hidden');
    this.choicesEl.innerHTML = '';
  }

  async _run(lines) {
    for (const line of lines) {
      if (line.do) await line.do();
      if (line.text != null) await this._say(line);
      if (line.choices) {
        const c = await this._choose(line.choices);
        if (c.then) await this._run(c.then);
      }
    }
  }

  _say(line) {
    const sp = this.speakers[line.who] || { name: line.who || '', color: '#8b939c', voice: 1 };
    this.who = line.who;
    this.voice = sp.voice ?? 1;
    this.nameEl.textContent = sp.name;
    this.nameEl.style.background = sp.color;
    this.nameEl.style.display = sp.name ? '' : 'none';
    this.hooks.onSpeak?.(line.who);

    // Se crean todas las letras ocultas de antemano: así el texto no "salta" al ir apareciendo.
    this.textEl.innerHTML = '';
    this.nextEl.classList.remove('on');
    this.chars = [];
    const src = line.text;
    let em = false;
    for (let i = 0; i < src.length; i++) {
      if (src[i] === '*') { em = !em; continue; }
      if (src.startsWith('{w}', i)) { this.chars.push({ pause: 0.4 }); i += 2; continue; }
      if (src[i] === '\n') { this.textEl.appendChild(document.createElement('br')); continue; }
      const span = document.createElement('span');
      span.className = em ? 'ch em' : 'ch';
      span.textContent = src[i];
      this.textEl.appendChild(span);
      this.chars.push({ el: span, ch: src[i] });
    }
    this.pos = 0;
    this.timer = 0.12;
    this.blips = 0;
    this.autoNext = !!line.choices; // si vienen opciones, no hace falta pulsar A
    this.mode = 'typing';
    this.hooks.onTyping?.(this.who, true);
    return new Promise((res) => { this._resolve = res; });
  }

  _choose(choices) {
    this.choices = choices;
    this.sel = 0;
    this.choicesEl.innerHTML = '';
    choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'pill';
      b.textContent = c.text;
      b.style.animationDelay = (i * 0.06) + 's';
      b.addEventListener('mouseenter', () => { this.sel = i; this._paintChoices(); });
      b.addEventListener('click', (e) => { e.stopPropagation(); this.sel = i; this.press(); });
      this.choicesEl.appendChild(b);
    });
    this._paintChoices();
    this.mode = 'choosing';
    return new Promise((res) => { this._resolve = res; });
  }

  _paintChoices() {
    [...this.choicesEl.children].forEach((b, i) => b.classList.toggle('sel', i === this.sel));
  }

  _finishTyping() {
    for (const c of this.chars) c.el?.classList.add('on');
    this.pos = this.chars.length;
    this.hooks.onTyping?.(this.who, false);
    if (this.autoNext) { this.mode = null; this._resolve(); }
    else { this.mode = 'waiting'; this.nextEl.classList.add('on'); }
  }

  // Botón A
  press() {
    if (!this.active) return;
    if (this.mode === 'typing') this._finishTyping();
    else if (this.mode === 'waiting') {
      this.audio.play('advance');
      this.nextEl.classList.remove('on');
      this.mode = null;
      this._resolve();
    } else if (this.mode === 'choosing') {
      this.audio.play('select');
      const c = this.choices[this.sel];
      this.choicesEl.innerHTML = '';
      this.mode = null;
      this._resolve(c);
    }
  }

  // Arriba / abajo en las opciones
  nav(d) {
    if (this.mode !== 'choosing') return;
    const n = this.choices.length;
    this.sel = (this.sel + d + n) % n;
    this.audio.play('hover');
    this._paintChoices();
  }

  update(dt) {
    if (this.mode !== 'typing') return;
    this.timer -= dt * (this.fast ? 3 : 1);
    while (this.timer <= 0 && this.pos < this.chars.length) {
      const c = this.chars[this.pos++];
      if (c.pause) { this.timer += c.pause; continue; }
      c.el.classList.add('on');
      let delay = 0.034;
      if ('.!?…'.includes(c.ch)) delay = 0.26;
      else if (',;:'.includes(c.ch)) delay = 0.13;
      this.timer += delay;
      if (c.ch.trim() && (this.blips++ % 2 === 0)) this.audio.blip(this.voice);
    }
    if (this.pos >= this.chars.length && this.timer <= 0) this._finishTyping();
  }
}
