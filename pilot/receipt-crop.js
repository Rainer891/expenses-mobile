'use strict';

function detectReceiptCorners(canvas) {
  const ratio = Math.min(1, 240 / Math.max(canvas.width, canvas.height));
  const sample = document.createElement('canvas');
  const w = sample.width = Math.max(1, Math.round(canvas.width * ratio));
  const h = sample.height = Math.max(1, Math.round(canvas.height * ratio));
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h).data;
  const brightness = new Uint8Array(w * h);
  const histogram = new Uint32Array(256);
  let sum = 0;
  for (let i = 0; i < brightness.length; i++) {
    const j = i * 4;
    const value = Math.round(.299 * pixels[j] + .587 * pixels[j + 1] + .114 * pixels[j + 2]);
    brightness[i] = value;
    histogram[value]++;
    sum += value;
  }

  let count = 0, partial = 0, best = 0, threshold = 255;
  const total = brightness.length;
  for (let level = 0; level < 255; level++) {
    count += histogram[level];
    partial += level * histogram[level];
    if (!count || count === total) continue;
    const difference = (sum - partial) / (total - count) - partial / count;
    const score = count * (total - count) * difference ** 2;
    if (difference >= 30 && score > best) {
      best = score;
      threshold = level;
    }
  }

  const queue = new Int32Array(total);
  let largest = 0, corners = null;
  for (let i = 0; i < total; i++) {
    if (brightness[i] <= threshold) continue;
    brightness[i] = 0;
    queue[0] = i;
    let end = 1;
    const limits = [-Infinity, -Infinity, -Infinity, -Infinity];
    const points = [];
    for (let head = 0; head < end; head++) {
      const current = queue[head];
      const x = current % w;
      const y = Math.floor(current / w);
      const metrics = [-x-y, x-y, x+y, y-x];
      metrics.forEach((metric, corner) => {
        if (metric > limits[corner]) {
          limits[corner] = metric;
          points[corner] = { x: (x + .5) / w, y: (y + .5) / h };
        }
      });
      for (const next of [x > 0 ? current - 1 : -1, x + 1 < w ? current + 1 : -1, current - w, current + w]) {
        if (!(brightness[next] > threshold)) continue;
        brightness[next] = 0;
        queue[end++] = next;
      }
    }
    if (end > largest) {
      largest = end;
      corners = points;
    }
  }

  if (largest < total * .06 || largest > total * .92 || !validReceiptCorners(corners)) return null;
  return corners;
}

function validReceiptCorners(points) {
  if (!points) return false;
  return points.every((a, i) => {
    const b = points[(i + 1) % 4], c = points[(i + 2) % 4];
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) > .001;
  });
}

async function cropReceipt(source, corners) {
  if (!validReceiptCorners(corners)) throw new Error('Adjust the corners so the outline does not cross.');
  const [a,b,c,d] = corners.map(p => ({ x: p.x * (source.width - 1), y: p.y * (source.height - 1) }));
  const distance = (p,q) => Math.hypot(p.x - q.x, p.y - q.y);
  const width = Math.max(distance(a,b), distance(d,c));
  const height = Math.max(distance(a,d), distance(b,c));
  const scale = Math.min(1, 2400 / Math.max(width, height));
  const result = document.createElement('canvas');
  result.width = Math.max(2, Math.round(width * scale));
  result.height = Math.max(2, Math.round(height * scale));

  // Map the rectangular output back to the four corners in the source image.
  const dx1 = b.x - c.x, dy1 = b.y - c.y;
  const dx2 = d.x - c.x, dy2 = d.y - c.y;
  const dx3 = a.x - b.x + c.x - d.x, dy3 = a.y - b.y + c.y - d.y;
  const determinant = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / determinant;
  const h = (dx1 * dy3 - dx3 * dy1) / determinant;
  const xU = b.x - a.x + g * b.x, xV = d.x - a.x + h * d.x;
  const yU = b.y - a.y + g * b.y, yV = d.y - a.y + h * d.y;

  const ctx = result.getContext('2d');
  const destination = ctx.createImageData(result.width, result.height);
  const input = source.getContext('2d').getImageData(0, 0, source.width, source.height).data;
  for (let y = 0; y < result.height; y++) {
    const v = y / (result.height - 1);
    for (let x = 0; x < result.width; x++) {
      const u = x / (result.width - 1);
      const denominator = 1 + g * u + h * v;
      const sx = Math.min(source.width - 1, Math.max(0, (a.x + xU * u + xV * v) / denominator));
      const sy = Math.min(source.height - 1, Math.max(0, (a.y + yU * u + yV * v) / denominator));
      const left = Math.floor(sx), top = Math.floor(sy);
      const right = Math.min(left + 1, source.width - 1), bottom = Math.min(top + 1, source.height - 1);
      const wx = sx - left, wy = sy - top;
      const offset = (y * result.width + x) * 4;
      for (let k = 0; k < 3; k++) {
        const upper = input[(top * source.width + left) * 4 + k] * (1 - wx) + input[(top * source.width + right) * 4 + k] * wx;
        const lower = input[(bottom * source.width + left) * 4 + k] * (1 - wx) + input[(bottom * source.width + right) * 4 + k] * wx;
        destination.data[offset + k] = upper * (1 - wy) + lower * wy;
      }
      destination.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(destination, 0, 0);
  return new Promise((resolve, reject) => {
    result.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not prepare the cropped photo.')), 'image/jpeg', .92);
  });
}

async function createReceiptEditor(photo, container) {
  const url = URL.createObjectURL(photo);
  const image = new Image();
  const canvas = document.createElement('canvas');
  try {
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(2, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(2, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d', { alpha: false }).drawImage(image, 0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }

  const detected = detectReceiptCorners(canvas);
  const corners = detected || [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
  const stage = document.createElement('div');
  stage.className = 'receipt-crop';
  stage.append(canvas);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 1000 1000');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const outline = document.createElementNS(svg.namespaceURI, 'polygon');
  svg.append(outline);
  stage.append(svg);
  const labels = ['Top left', 'Top right', 'Bottom right', 'Bottom left'];
  const handles = corners.map((point, index) => {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.setAttribute('aria-label', labels[index] + ' corner');
    handle.onpointerdown = event => handle.setPointerCapture(event.pointerId);
    handle.onpointermove = event => {
      if (!handle.hasPointerCapture(event.pointerId)) return;
      const box = stage.getBoundingClientRect();
      point.x = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
      point.y = Math.max(0, Math.min(1, (event.clientY - box.top) / box.height));
      draw();
    };
    handle.onkeydown = event => {
      const moves = {ArrowLeft:[-.01,0],ArrowRight:[.01,0],ArrowUp:[0,-.01],ArrowDown:[0,.01]};
      if (!moves[event.key]) return;
      event.preventDefault();
      const [dx,dy] = moves[event.key];
      point.x = Math.max(0, Math.min(1, point.x + dx));
      point.y = Math.max(0, Math.min(1, point.y + dy));
      draw();
    };
    stage.append(handle);
    return handle;
  });
  function draw() {
    outline.setAttribute('points', corners.map(({x,y}) => (x * 1000) + ',' + (y * 1000)).join(' '));
    corners.forEach(({x,y}, index) => {
      handles[index].style.left = x * 100 + '%';
      handles[index].style.top = y * 100 + '%';
    });
  }
  draw();
  container.append(stage);
  return { detected: Boolean(detected), crop: () => cropReceipt(canvas, corners) };
}
