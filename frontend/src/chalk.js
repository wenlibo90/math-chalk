const CHALK_COLORS = {
  "chalk-white": "#f7f6ef",
  "chalk-yellow": "#f3d24e",
};

function makeChalkSprite(color, radius) {
  const d = Math.ceil(radius * 2) + 2;
  const c = document.createElement("canvas");
  c.width = d;
  c.height = d;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(d, d);
  const cx = d / 2;
  const cy = d / 2;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  for (let y = 0; y < d; y++) {
    for (let x = 0; x < d; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy) / radius;
      let fall = 1 - dist;
      if (fall < 0) fall = 0;
      fall = Math.pow(fall, 1.15);
      const noise = Math.random() * 1.55 - 0.3;
      const a = Math.round(255 * Math.min(1, Math.max(0, fall * noise)));
      const i = (y * d + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export class ChalkBoard {
  constructor(canvas, hintEl) {
    this.canvas = canvas;
    this.hint = hintEl;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.ctx = canvas.getContext("2d");
    this.tool = null;
    this.drawing = false;
    this.last = null;
    this.lastTime = 0;
    this.bbox = null;
    this.hasInk = false;
    this.autoClear = false;
    this.onErase = null;
    this.sprites = {};
    this.resize();
    this._bind();
  }

  _sprite(color, radius) {
    const key = `${color}:${radius}`;
    if (!this.sprites[key]) {
      this.sprites[key] = makeChalkSprite(CHALK_COLORS[color] || color, radius);
    }
    return this.sprites[key];
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const prev = document.createElement("canvas");
    prev.width = this.canvas.width;
    prev.height = this.canvas.height;
    if (prev.width && prev.height) {
      prev.getContext("2d").drawImage(this.canvas, 0, 0);
    }
    this.cssW = w;
    this.cssH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    if (prev.width && prev.height) {
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.drawImage(prev, 0, 0);
      this.ctx.restore();
    }
  }

  setTool(tool) {
    this.tool = tool ? { radius: 7, ...(this.tool || {}), ...tool } : null;
  }

  // 识别完成后标记：下次落笔画新公式前，先清掉上一道笔迹
  armAutoClear() {
    this.autoClear = true;
  }

  clear() {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.restore();
    this.bbox = null;
    this.hasInk = false;
    this._setHint(true);
  }

  _setHint(visible) {
    if (this.hint) this.hint.style.opacity = visible ? "1" : "0";
  }

  _pos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _bind() {
    const c = this.canvas;
    c.style.touchAction = "none";

    c.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (!this.tool) return;
      if (this.autoClear) {
        this.clear();
        this.autoClear = false;
      }
      c.setPointerCapture(e.pointerId);
      this.drawing = true;
      const p = this._pos(e);
      this.last = p;
      this.lastTime = performance.now();
      this.hasInk = true;
      this._setHint(false);
      this._stamp(p, p, 0);
    });

    c.addEventListener("pointermove", (e) => {
      if (!this.drawing) return;
      const p = this._pos(e);
      const now = performance.now();
      const dt = Math.max(1, now - this.lastTime);
      const dist = Math.hypot(p.x - this.last.x, p.y - this.last.y);
      const speed = dist / dt;
      this._stroke(this.last, p, speed);
      this.last = p;
      this.lastTime = now;
    });

    const end = (e) => {
      if (!this.drawing) return;
      this.drawing = false;
      try {
        c.releasePointerCapture(e.pointerId);
      } catch {}
      this.last = null;
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("pointerleave", (e) => {
      if (this.drawing) end(e);
    });
  }

  _stroke(from, to, speed, tool = this.tool) {
    const spacing = tool.type === "eraser" ? 4 : Math.max(1.4, tool.radius * 0.34);
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(dist / spacing));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const p = {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      };
      this._stamp(from, p, speed, tool);
    }
  }

  // 供外部（如被拖动的黑板擦）调用：在两点之间擦除
  eraseSegment(from, to, radius = 10) {
    this._stroke(from, to, 0, { type: "eraser", radius });
  }

  _stamp(from, p, speed, tool = this.tool) {
    const ctx = this.ctx;
    if (tool.type === "eraser") {
      const r = tool.radius * 2.3;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(0.7, "rgba(0,0,0,0.75)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      this._expand(p.x, p.y, r);
      if (this.onErase) this.onErase(p.x, p.y, r);
      return;
    }

    const radius = tool.radius;
    const sprite = this._sprite(tool.color, radius);
    const d = sprite.width;
    const alpha = Math.min(0.95, Math.max(0.42, 0.95 - speed * 0.22));
    const jitter = radius * 0.5;
    const jx = (Math.random() - 0.5) * jitter;
    const jy = (Math.random() - 0.5) * jitter;
    ctx.save();
    ctx.globalAlpha = alpha * (0.75 + Math.random() * 0.25);
    ctx.drawImage(sprite, p.x + jx - d / 2, p.y + jy - d / 2);
    ctx.restore();
    this._expand(p.x + jx, p.y + jy, d / 2);
  }

  _expand(x, y, r) {
    if (!this.bbox) {
      this.bbox = { minX: x - r, minY: y - r, maxX: x + r, maxY: y + r };
      return;
    }
    this.bbox.minX = Math.min(this.bbox.minX, x - r);
    this.bbox.minY = Math.min(this.bbox.minY, y - r);
    this.bbox.maxX = Math.max(this.bbox.maxX, x + r);
    this.bbox.maxY = Math.max(this.bbox.maxY, y + r);
  }

  isEmpty() {
    return !this.hasInk || !this.bbox;
  }

  exportImage(padding = 34) {
    if (this.isEmpty()) return null;
    const dpr = this.dpr;
    const x = Math.max(0, Math.floor((this.bbox.minX - padding) * dpr));
    const y = Math.max(0, Math.floor((this.bbox.minY - padding) * dpr));
    const right = Math.min(this.canvas.width, Math.ceil((this.bbox.maxX + padding) * dpr));
    const bottom = Math.min(this.canvas.height, Math.ceil((this.bbox.maxY + padding) * dpr));
    const w = Math.max(1, right - x);
    const h = Math.max(1, bottom - y);

    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const octx = out.getContext("2d");
    octx.clearRect(0, 0, w, h);
    octx.drawImage(this.canvas, x, y, w, h, 0, 0, w, h);

    const img = octx.getImageData(0, 0, w, h);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] / 255;
      const v = Math.round(255 * (1 - Math.min(1, a * 1.25)));
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    return out.toDataURL("image/png");
  }

  // 导出：仅手写笔迹的透明背景 PNG，裁剪到笔迹范围
  exportTransparentPng(padding = 44) {
    if (this.isEmpty()) return null;
    const dpr = this.dpr;
    const x = Math.max(0, Math.floor((this.bbox.minX - padding) * dpr));
    const y = Math.max(0, Math.floor((this.bbox.minY - padding) * dpr));
    const right = Math.min(this.canvas.width, Math.ceil((this.bbox.maxX + padding) * dpr));
    const bottom = Math.min(this.canvas.height, Math.ceil((this.bbox.maxY + padding) * dpr));
    const w = Math.max(1, right - x);
    const h = Math.max(1, bottom - y);

    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const octx = out.getContext("2d");
    // 原样保留粉笔颜色与透明度
    octx.drawImage(this.canvas, x, y, w, h, 0, 0, w, h);
    return out.toDataURL("image/png");
  }
}
