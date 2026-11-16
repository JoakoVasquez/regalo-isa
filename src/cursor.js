// Cursor de mano a partir de assets/ui/manos.gif (mano abierta a la izquierda, mano apuntando a la derecha).
// Se usa la que apunta. Si la imagen trae fondo blanco en vez de transparente, se le quita aquí.

export async function setupCursor(el, url) {
  const img = el.querySelector('img');
  try {
    const src = new Image();
    src.src = url;
    await src.decode();
    const w = src.width >> 1, h = src.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(src, w, 0, w, h, 0, 0, w, h);
    const im = g.getImageData(0, 0, w, h), d = im.data;

    if (d[3] > 200) removeBackground(d, w, h); // esquina opaca → tiene fondo

    // recorte al contenido y punta del dedo (la fila opaca más alta)
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    let tipSum = 0, tipN = 0;
    for (let y = y0; y < y0 + 4; y++) for (let x = x0; x <= x1; x++) if (d[(y * w + x) * 4 + 3] > 40) { tipSum += x; tipN++; }
    const tipX = tipN ? tipSum / tipN : (x0 + x1) / 2;

    g.putImageData(im, 0, 0);
    const out = document.createElement('canvas');
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    img.src = out.toDataURL();
    // el punto que "hace clic" es la punta del dedo
    img.style.marginLeft = (-(tipX - x0) / out.width * 100) + '%';
    img.style.marginTop = (-2 / out.width * 100) + '%';
  } catch (e) {
    console.warn('No se pudo preparar el cursor', e);
    img.src = url;
  }
}

// Borra el fondo claro conectado con los bordes (el interior blanco de la mano queda, porque
// el contorno negro lo encierra) y suaviza el borde que queda.
function removeBackground(d, w, h) {
  const light = (i) => d[i + 3] > 0 && d[i] > 232 && d[i + 1] > 232 && d[i + 2] > 232;
  const stack = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  const seen = new Uint8Array(w * h);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    if (!light(p * 4)) { seen[p] = 2; continue; } // 2 = borde tocado por el fondo
    d[p * 4 + 3] = 0;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  // los píxeles grises del borde (mezcla de contorno negro y fondo) pasan a negro semitransparente
  for (let p = 0; p < w * h; p++) {
    if (seen[p] !== 2) continue;
    const i = p * 4, lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (lum > 40 && Math.abs(d[i] - d[i + 2]) < 30) { d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 255 - lum; }
  }
}
