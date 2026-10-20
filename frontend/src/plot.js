import { compile } from "mathjs";

const COLORS = {
  grid: "rgba(247, 246, 239, 0.09)",
  axis: "rgba(247, 246, 239, 0.45)",
  label: "rgba(247, 246, 239, 0.6)",
  curve: "#f3d24e",
  curveSoft: "rgba(243, 210, 78, 0.25)",
};

function makeEval(expr) {
  if (!expr || !expr.trim()) return { error: "表达式为空", fn: null };
  let node;
  try {
    node = compile(expr);
  } catch (e) {
    return { error: `无法解析：${e.message}`, fn: null };
  }
  const fn = (scope) => {
    try {
      const v = node.evaluate(scope);
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : NaN;
    } catch {
      return NaN;
    }
  };
  return { error: null, fn };
}

function niceStep(range, target = 9) {
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step;
  if (norm < 1.5) step = 1;
  else if (norm < 3) step = 2;
  else if (norm < 7) step = 5;
  else step = 10;
  return step * mag;
}

function fmt(n, step) {
  if (Math.abs(n) < step / 1000) return "0";
  const dec = Math.max(0, -Math.floor(Math.log10(step)));
  return n.toFixed(dec).replace(/\.0+$/, "");
}

export class Plotter {
  constructor(canvas, hintEl, container) {
    this.canvas = canvas;
    this.hint = hintEl;
    this.container = container || canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.view = { xMin: -10, xMax: 10, yMin: -6, yMax: 6 };
    this.spec = null;
    this.drag = null;
    this.resize();
    this._bind();
    this.render();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.cssW = w;
    this.cssH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  _bind() {
    // 监听绑在画布本身：避免捕获整个黑板导致覆盖层的点击事件被吞掉
    const c = this.canvas;
    const getRect = () => this.canvas.getBoundingClientRect();

    c.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = getRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const wx = this._sx2wx(px);
        const wy = this._sy2wy(py);
        const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85;
        this.view.xMin = wx + (this.view.xMin - wx) * factor;
        this.view.xMax = wx + (this.view.xMax - wx) * factor;
        this.view.yMin = wy + (this.view.yMin - wy) * factor;
        this.view.yMax = wy + (this.view.yMax - wy) * factor;
        this.render();
      },
      { passive: false }
    );

    c.addEventListener("pointerdown", (e) => {
      const rect = getRect();
      c.setPointerCapture?.(e.pointerId);
      this.drag = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    });
    c.addEventListener("pointermove", (e) => {
      if (!this.drag) return;
      const rect = getRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const dx = (x - this.drag.x) / this.cssW;
      const dy = (y - this.drag.y) / this.cssH;
      const rx = (this.view.xMax - this.view.xMin) * dx;
      const ry = (this.view.yMax - this.view.yMin) * dy;
      this.view.xMin -= rx;
      this.view.xMax -= rx;
      this.view.yMin += ry;
      this.view.yMax += ry;
      this.drag = { x, y };
      this.render();
    });
    const end = () => {
      this.drag = null;
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("pointerleave", end);
  }

  _sx(wx) {
    return ((wx - this.view.xMin) / (this.view.xMax - this.view.xMin)) * this.cssW;
  }
  _sy(wy) {
    return this.cssH - ((wy - this.view.yMin) / (this.view.yMax - this.view.yMin)) * this.cssH;
  }
  _sx2wx(px) {
    return this.view.xMin + (px / this.cssW) * (this.view.xMax - this.view.xMin);
  }
  _sy2wy(py) {
    return this.view.yMin + ((this.cssH - py) / this.cssH) * (this.view.yMax - this.view.yMin);
  }

  setSpec(spec) {
    this.spec = spec;
    this.autoFit();
    this.render();
  }

  clearSpec() {
    this.spec = null;
    this.view = { xMin: -10, xMax: 10, yMin: -6, yMax: 6 };
    this.render();
  }

  resetView() {
    this.autoFit();
    this.render();
  }

  autoFit() {
    const spec = this.spec;
    if (!spec) {
      this.view = { xMin: -10, xMax: 10, yMin: -6, yMax: 6 };
      return;
    }
    const aspect = this.cssW / Math.max(1, this.cssH);

    if (spec.mode === "explicit") {
      const xMin = -10;
      const xMax = 10;
      const ys = [];
      for (let i = 0; i <= 600; i++) {
        const x = xMin + ((xMax - xMin) * i) / 600;
        const y = spec.fn(x);
        if (Number.isFinite(y)) ys.push(y);
      }
      let yMin = -6;
      let yMax = 6;
      if (ys.length > 4) {
        ys.sort((a, b) => a - b);
        const lo = ys[Math.floor(ys.length * 0.04)];
        const hi = ys[Math.floor(ys.length * 0.96)];
        const pad = Math.max(1, (hi - lo) * 0.15);
        yMin = lo - pad;
        yMax = hi + pad;
        if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMax - yMin < 1e-3) {
          yMin = -6;
          yMax = 6;
        }
      }
      this.view = { xMin, xMax, yMin, yMax };
      return;
    }

    let xs = [];
    let ys = [];
    if (spec.mode === "polar") {
      const N = 1200;
      for (let i = 0; i <= N; i++) {
        const th = (2 * Math.PI * i) / N;
        const r = spec.fn(th);
        if (!Number.isFinite(r)) continue;
        xs.push(r * Math.cos(th));
        ys.push(r * Math.sin(th));
      }
    } else if (spec.mode === "parametric") {
      const N = 1200;
      for (let i = 0; i <= N; i++) {
        const t = (2 * Math.PI * i) / N;
        const x = spec.fnX(t);
        const y = spec.fnY(t);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        xs.push(x);
        ys.push(y);
      }
    } else if (spec.mode === "implicit") {
      this.view = { xMin: -6, xMax: 6, yMin: -6 / aspect, yMax: 6 / aspect };
      return;
    }

    let xMaxAbs = 6;
    let yMaxAbs = 6;
    if (xs.length) {
      xMaxAbs = Math.max(...xs.map(Math.abs));
      yMaxAbs = Math.max(...ys.map(Math.abs));
    }
    const half = Math.max(xMaxAbs, yMaxAbs, 1) * 1.15;
    const halfY = half / aspect;
    this.view = { xMin: -half, xMax: half, yMin: -halfY, yMax: halfY };
  }

  render() {
    const ctx = this.ctx;
    const W = this.cssW;
    const H = this.cssH;
    ctx.clearRect(0, 0, W, H);

    this._drawGrid();
    this._drawAxes();
    if (this.spec) this._drawCurve();
  }

  _drawGrid() {
    const ctx = this.ctx;
    const { xMin, xMax, yMin, yMax } = this.view;
    const stepX = niceStep(xMax - xMin);
    const stepY = niceStep(yMax - yMin);
    ctx.lineWidth = 1;
    ctx.strokeStyle = COLORS.grid;
    ctx.beginPath();
    for (let x = Math.ceil(xMin / stepX) * stepX; x <= xMax; x += stepX) {
      const px = Math.round(this._sx(x)) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, this.cssH);
    }
    for (let y = Math.ceil(yMin / stepY) * stepY; y <= yMax; y += stepY) {
      const py = Math.round(this._sy(y)) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(this.cssW, py);
    }
    ctx.stroke();
  }

  _drawAxes() {
    const ctx = this.ctx;
    const { xMin, xMax, yMin, yMax } = this.view;
    const stepX = niceStep(xMax - xMin);
    const stepY = niceStep(yMax - yMin);

    // 矩形边框
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = COLORS.axis;
    ctx.strokeRect(0.5, 0.5, this.cssW - 1, this.cssH - 1);

    // 原点坐标轴（若在视野内）
    ctx.beginPath();
    if (yMin <= 0 && yMax >= 0) {
      const py = Math.round(this._sy(0)) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(this.cssW, py);
    }
    if (xMin <= 0 && xMax >= 0) {
      const px = Math.round(this._sx(0)) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, this.cssH);
    }
    ctx.stroke();

    ctx.fillStyle = COLORS.label;
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const y0 = yMin <= 0 && yMax >= 0 ? this._sy(0) : this.cssH - 16;
    for (let x = Math.ceil(xMin / stepX) * stepX; x <= xMax; x += stepX) {
      if (Math.abs(x) < stepX / 1000) continue;
      const px = this._sx(x);
      if (px < 20 || px > this.cssW - 20) continue;
      ctx.fillText(fmt(x, stepX), px, Math.min(this.cssH - 14, y0 + 5));
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const x0 = xMin <= 0 && xMax >= 0 ? this._sx(0) : 34;
    for (let y = Math.ceil(yMin / stepY) * stepY; y <= yMax; y += stepY) {
      if (Math.abs(y) < stepY / 1000) continue;
      const py = this._sy(y);
      if (py < 12 || py > this.cssH - 12) continue;
      ctx.fillText(fmt(y, stepY), Math.max(30, x0 - 6), py);
    }
  }

  _drawCurve() {
    const spec = this.spec;
    if (spec.mode === "implicit") {
      this._drawImplicit(spec);
      return;
    }
    this._pathCurve(spec);
  }

  _beginCurve() {
    const ctx = this.ctx;
    ctx.strokeStyle = COLORS.curve;
    ctx.lineWidth = 2.6;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = COLORS.curveSoft;
    ctx.shadowBlur = 10;
  }

  _endCurve() {
    this.ctx.shadowBlur = 0;
  }

  _pathCurve(spec) {
    const ctx = this.ctx;
    const W = this.cssW;
    const H = this.cssH;
    this._beginCurve();
    ctx.beginPath();

    let started = false;
    let prevPy = null;
    if (spec.mode === "explicit") {
      const samples = Math.max(600, Math.round(W * 1.5));
      for (let i = 0; i <= samples; i++) {
        const x = this._sx2wx((i / samples) * W);
        const y = spec.fn(x);
        if (!Number.isFinite(y)) {
          started = false;
          prevPy = null;
          continue;
        }
        const py = this._sy(y);
        if (py < -H * 3 || py > H * 4) {
          started = false;
          prevPy = null;
          continue;
        }
        if (prevPy !== null && Math.abs(py - prevPy) > H * 1.4) {
          started = false;
        }
        const px = this._sx(x);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
        prevPy = py;
      }
    } else {
      const N = Math.max(800, Math.round((W + H) * 1.5));
      for (let i = 0; i <= N; i++) {
        let wx;
        let wy;
        if (spec.mode === "polar") {
          const th = (2 * Math.PI * i) / N;
          const r = spec.fn(th);
          if (!Number.isFinite(r)) {
            started = false;
            prevPy = null;
            continue;
          }
          wx = r * Math.cos(th);
          wy = r * Math.sin(th);
        } else {
          const t = (2 * Math.PI * i) / N;
          wx = spec.fnX(t);
          wy = spec.fnY(t);
          if (!Number.isFinite(wx) || !Number.isFinite(wy)) {
            started = false;
            prevPy = null;
            continue;
          }
        }
        const px = this._sx(wx);
        const py = this._sy(wy);
        if (py < -H * 4 || py > H * 5) {
          started = false;
          prevPy = null;
          continue;
        }
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
        prevPy = py;
      }
    }
    ctx.stroke();
    this._endCurve();
  }

  _drawImplicit(spec) {
    const ctx = this.ctx;
    const { xMin, xMax, yMin, yMax } = this.view;
    const target = 200;
    const N = target;
    const M = Math.max(60, Math.round(target * (this.cssH / this.cssW)));
    const grid = [];
    for (let j = 0; j <= M; j++) {
      const wy = yMax - ((yMax - yMin) * j) / M;
      const row = new Array(N + 1);
      for (let i = 0; i <= N; i++) {
        const wx = xMin + ((xMax - xMin) * i) / N;
        row[i] = spec.fn(wx, wy);
      }
      grid.push(row);
    }
    const fx = (i) => xMin + ((xMax - xMin) * i) / N;
    const fy = (j) => yMax - ((yMax - yMin) * j) / M;

    this._beginCurve();
    ctx.beginPath();
    for (let j = 0; j < M; j++) {
      for (let i = 0; i < N; i++) {
        const v0 = grid[j][i];
        const v1 = grid[j][i + 1];
        const v2 = grid[j + 1][i + 1];
        const v3 = grid[j + 1][i];
        if (![v0, v1, v2, v3].every(Number.isFinite)) continue;
        let idx = 0;
        if (v0 > 0) idx |= 8;
        if (v1 > 0) idx |= 4;
        if (v2 > 0) idx |= 2;
        if (v3 > 0) idx |= 1;
        if (idx === 0 || idx === 15) continue;
        const top = { x: fx(i) + ((xMax - xMin) / N) * (v0 / (v0 - v1)), y: fy(j) };
        const right = { x: fx(i + 1), y: fy(j) + ((yMax - yMin) / M) * (v1 / (v1 - v2)) };
        const bottom = { x: fx(i) + ((xMax - xMin) / N) * (v3 / (v3 - v2)), y: fy(j + 1) };
        const left = { x: fx(i), y: fy(j) + ((yMax - yMin) / M) * (v0 / (v0 - v3)) };
        const seg = (a, b) => {
          ctx.moveTo(this._sx(a.x), this._sy(a.y));
          ctx.lineTo(this._sx(b.x), this._sy(b.y));
        };
        switch (idx) {
          case 1:
          case 14:
            seg(left, bottom);
            break;
          case 2:
          case 13:
            seg(bottom, right);
            break;
          case 3:
          case 12:
            seg(left, right);
            break;
          case 4:
          case 11:
            seg(top, right);
            break;
          case 5:
            seg(left, top);
            seg(bottom, right);
            break;
          case 6:
          case 9:
            seg(top, bottom);
            break;
          case 7:
          case 8:
            seg(left, top);
            break;
          case 10:
            seg(top, right);
            seg(left, bottom);
            break;
        }
      }
    }
    ctx.stroke();
    this._endCurve();
  }
}

export { makeEval };
