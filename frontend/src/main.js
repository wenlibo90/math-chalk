import katex from "katex";
import "katex/dist/katex.min.css";
import "./style.css";
import { ChalkBoard } from "./chalk.js";
import { Plotter, makeEval } from "./plot.js";
import { recognize } from "./api.js";

const el = {
  boardShell: document.querySelector(".board-shell"),
  board: document.getElementById("board"),
  plot: document.getElementById("plot"),
  boardImage: document.getElementById("board-image"),
  plotHint: document.getElementById("graph-hint"),
  recognizeBtn: document.getElementById("recognize-btn"),
  clearBtn: document.getElementById("clear-btn"),
  uploadBtn: document.getElementById("upload-btn"),
  uploadInput: document.getElementById("upload-input"),
  rewardBtn: document.getElementById("reward-btn"),
  rewardModal: document.getElementById("reward-modal"),
  rewardMask: document.getElementById("reward-mask"),
  rewardClose: document.getElementById("reward-close"),
  danmakuBtn: document.getElementById("danmaku-btn"),
  msgDock: document.getElementById("msg-dock"),
  bubble: document.getElementById("msg-bubble"),
  bubbleText: document.getElementById("msg-bubble-text"),
  danmakuInput: document.getElementById("danmaku-input"),
  danmakuText: document.getElementById("danmaku-text"),
  danmakuSend: document.getElementById("danmaku-send"),
  resetView: document.getElementById("reset-view"),
  plotResize: document.getElementById("plot-resize"),
  consoleEl: document.getElementById("console"),
  consoleStatus: document.getElementById("console-status"),
  consoleBody: document.getElementById("console-body"),
  formulaPanel: document.getElementById("formula-panel"),
  formulaLatex: document.getElementById("formula-latex"),
  kindInput: document.getElementById("kind-input"),
  exportBtn: document.getElementById("export-btn"),
  examples: document.getElementById("examples"),
  rackItems: Array.from(document.querySelectorAll(".rack-item")),
  fieldEls: Array.from(document.querySelectorAll(".console-row[data-field]")),
  inputExplicit: document.getElementById("input-explicit"),
  inputImplicit: document.getElementById("input-implicit"),
  inputParamX: document.getElementById("input-param-x"),
  inputParamY: document.getElementById("input-param-y"),
  inputPolar: document.getElementById("input-polar"),
};

const board = new ChalkBoard(el.board, null);
const plotter = new Plotter(el.plot, el.plotHint, el.boardShell);

const state = { mode: "explicit", currentTool: "chalk-white" };

const TOOL_MAP = {
  "chalk-white": { type: "chalk", color: "chalk-white" },
  "chalk-yellow": { type: "chalk", color: "chalk-yellow" },
  eraser: { type: "eraser" },
};

const TOOL_ICON = {
  "chalk-white": "/brand/chalk-white.png",
  "chalk-yellow": "/brand/chalk-yellow.png",
  eraser: "/brand/eraser.png",
};

/* ---------- 黑板上跟随鼠标的工具光标（粉笔有、黑板擦无） ---------- */

const toolCursor = document.createElement("div");
toolCursor.className = "tool-cursor";
toolCursor.innerHTML = `<img alt="">`;
el.boardShell.appendChild(toolCursor);
const toolCursorImg = toolCursor.querySelector("img");

function applyToolCursor(toolKey) {
  state.currentTool = toolKey;
  board.setTool(TOOL_MAP[toolKey]);

  if (toolKey === "eraser") {
    // 黑板擦模式：隐藏小光标，恢复原生指针，拖动即擦
    toolCursor.classList.remove("visible");
    el.board.style.cursor = "default";
  } else {
    // 粉笔模式：显示跟随光标
    toolCursor.dataset.tool = toolKey;
    toolCursorImg.src = TOOL_ICON[toolKey];
    el.board.style.cursor = "none";
  }
}

// 取消选择：恢复普通鼠标，禁用书写
function clearTool() {
  state.currentTool = null;
  board.setTool(null);
  toolCursor.classList.remove("visible");
  el.board.style.cursor = "default";
}

el.boardShell.addEventListener("pointermove", (e) => {
  if (!state.currentTool || state.currentTool === "eraser") return;
  // 悬停在重置文字或控制台上时，不显示粉笔光标
  if (el.resetView && (e.target === el.resetView || el.resetView.contains(e.target))) {
    toolCursor.classList.remove("visible");
    return;
  }
  if (el.consoleEl && (e.target === el.consoleEl || el.consoleEl.contains(e.target))) {
    toolCursor.classList.remove("visible");
    return;
  }
  const rect = el.boardShell.getBoundingClientRect();
  toolCursor.style.left = `${e.clientX - rect.left}px`;
  toolCursor.style.top = `${e.clientY - rect.top}px`;
  toolCursor.classList.add("visible");
});

el.boardShell.addEventListener("pointerleave", () => {
  toolCursor.classList.remove("visible");
});

el.boardShell.addEventListener("pointerenter", () => {
  if (state.currentTool && state.currentTool !== "eraser") toolCursor.classList.add("visible");
});

/* ---------- 置物栏：随机散落 + 可拖动 + 点击选中 ---------- */

const rackEl = document.querySelector(".rack-items");

function randBetween(a, b) {
  return a + Math.random() * (b - a);
}

// 黑板擦在右侧，粉笔在中间偏左
const RACK_LAYOUT = [
  { cls: "rack-chalk-white", minX: 30, maxX: 260 },   // 白粉笔：左侧
  { cls: "rack-chalk-yellow", minX: 300, maxX: 520 }, // 黄粉笔：中左
  { cls: "rack-eraser", minX: 580, maxX: 760 },       // 黑板擦：右侧
];

function layoutRackItems() {
  const rackRect = rackEl.getBoundingClientRect();
  const rackW = rackRect.width || window.innerWidth;

  el.rackItems.forEach((item) => {
    const tool = item.dataset.tool;
    const cfg = RACK_LAYOUT.find((c) => item.classList.contains(c.cls));
    const itemW = item.offsetWidth || 40;

    // 根据屏宽缩放区间
    const scale = rackW / 1920;
    const lo = Math.min(rackW - itemW - 10, (cfg ? cfg.minX : 50) * scale);
    const hi = Math.min(rackW - itemW - 6, (cfg ? cfg.maxX : rackW - 50) * scale);

    const left = Math.max(6, randBetween(lo, hi));
    const rot = tool === "eraser" ? randBetween(-3, 3) : randBetween(-6, 6);

    item.style.left = `${left}px`;
    item.style.transform = `rotate(${rot}deg)`;
    item.dataset.homeX = left;
    item.dataset.homeRot = rot;
  });
}

// 黑板擦：按住从置物栏抓起，拖动即擦，松手缓动飞回置物栏原位
function startEraserDrag(e, item) {
  e.preventDefault();
  const boardRect = el.board.getBoundingClientRect();
  // 擦除范围与黑板擦宽度相当，避免看起来擦不干净
  const eraseRadius = Math.max(16, (item.offsetWidth || 80) / 3);
  const toLocal = (cx, cy) => ({ x: cx - boardRect.left, y: cy - boardRect.top });
  const place = (cx, cy) => {
    const w = item.offsetWidth || 60;
    item.style.left = `${cx - w / 2}px`;
    // rack-items 距舞台底部 26px，让黑板擦底边贴着光标
    item.style.bottom = `${window.innerHeight - cy - 26}px`;
  };

  item.classList.remove("is-active", "returning");
  item.classList.add("dragging");
  item.style.cursor = "none";
  el.rackItems.forEach((b) => b.classList.remove("is-active"));
  clearTool();

  try {
    item.setPointerCapture(e.pointerId);
  } catch {}

  place(e.clientX, e.clientY);
  let last = toLocal(e.clientX, e.clientY);
  board.eraseSegment(last, last, eraseRadius);

  const onMove = (ev) => {
    place(ev.clientX, ev.clientY);
    const p = toLocal(ev.clientX, ev.clientY);
    board.eraseSegment(last, p, eraseRadius);
    last = p;
  };

  const onUp = () => {
    item.removeEventListener("pointermove", onMove);
    item.removeEventListener("pointerup", onUp);
    item.removeEventListener("pointercancel", onUp);
    item.classList.remove("dragging");
    item.style.cursor = "";

    // 缓动飞回置物栏原位
    const homeX = parseFloat(item.dataset.homeX || "0");
    const homeRot = parseFloat(item.dataset.homeRot || "0");
    item.classList.add("returning");
    item.style.left = `${homeX}px`;
    item.style.bottom = "0px";
    item.style.transform = `rotate(${homeRot}deg)`;

    const settled = () => {
      item.classList.remove("returning");
      item.removeEventListener("transitionend", settled);
    };
    item.addEventListener("transitionend", settled);
    window.setTimeout(settled, 320);
  };

  item.addEventListener("pointermove", onMove);
  item.addEventListener("pointerup", onUp);
  item.addEventListener("pointercancel", onUp);
}

// 拖动 + 点击选中（移动 < 3px 视为点击）
el.rackItems.forEach((item) => {
  let dragState = null;

  item.addEventListener("pointerdown", (e) => {
    if (item.dataset.tool === "eraser") {
      startEraserDrag(e, item);
      return;
    }
    e.preventDefault();
    const rackRect = rackEl.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const offsetX = e.clientX - itemRect.left;
    const startLeft = itemRect.left - rackRect.left;

    try { item.setPointerCapture(e.pointerId); } catch {}
    item.classList.add("dragging");

    dragState = { startLeft, moved: 0 };

    const onMove = (ev) => {
      const r = rackEl.getBoundingClientRect();
      let newLeft = ev.clientX - r.left - offsetX;
      const itemW = item.offsetWidth;
      newLeft = Math.max(6, Math.min(r.width - itemW - 6, newLeft));
      item.style.left = `${newLeft}px`;
      dragState.moved = Math.abs(newLeft - dragState.startLeft);
    };

    const onUp = () => {
      item.removeEventListener("pointermove", onMove);
      item.removeEventListener("pointerup", onUp);
      item.removeEventListener("pointercancel", onUp);
      item.classList.remove("dragging");

      // 轻微拖动 → 选中/取消工具；较大拖动 → 不触发选中
      if (dragState && dragState.moved < 4) {
        const tool = item.dataset.tool;
        if (state.currentTool === tool) {
          // 再次点击同一个工具 → 取消选择，恢复普通鼠标
          el.rackItems.forEach((b) => b.classList.remove("is-active"));
          clearTool();
        } else {
          el.rackItems.forEach((b) => b.classList.toggle("is-active", b === item));
          applyToolCursor(tool);
        }
      } else {
        // 拖动后倾角随机微调，保留"自然摆放"感
        const newRot = (parseFloat(item.style.transform.match(/-?\d+/)?.[0] || "0") + randBetween(-4, 4));
        const clampedRot = Math.max(-8, Math.min(8, newRot));
        item.style.transform = `rotate(${clampedRot}deg)`;
      }
      dragState = null;
    };

    item.addEventListener("pointermove", onMove);
    item.addEventListener("pointerup", onUp);
    item.addEventListener("pointercancel", onUp);
  });
});

// 响应窗口 resize：保持相对位置不变
window.addEventListener("resize", () => {
  if (!rackEl.offsetWidth) return;
  // 第一次或小屏重建时重新布局以保证可见
  layoutRackItems();
});

// 初始化：默认不选中任何工具，使用普通鼠标
layoutRackItems();
clearTool();

/* ---------- 其他原有逻辑 ---------- */

const KIND_LABEL = {
  explicit: "显式函数",
  implicit: "隐式函数",
  parametric: "参数函数",
  polar: "极坐标",
};

function setStatus(text, kind) {
  if (!el.consoleStatus) return;
  el.consoleStatus.textContent = text || "";
  el.consoleStatus.dataset.kind = kind || "";
}

function renderLatex(latex) {
  if (!el.formulaLatex || !el.formulaPanel) return;
  if (!latex) {
    el.formulaLatex.innerHTML = "";
    el.formulaPanel.hidden = true;
    return;
  }
  el.formulaPanel.hidden = false;
  try {
    katex.render(latex, el.formulaLatex, { throwOnError: false, displayMode: false });
  } catch {
    el.formulaLatex.textContent = latex;
  }
}

function setMode(mode) {
  state.mode = mode;
  if (el.kindInput) el.kindInput.value = `[${mode}]`;
  const active = {
    explicit: ["explicit"],
    implicit: ["implicit"],
    parametric: ["parametric-x", "parametric-y"],
    polar: ["polar"],
  }[mode] || [];
  el.fieldEls.forEach((f) => {
    f.classList.toggle("is-visible", active.includes(f.dataset.field));
  });
  // 类型关键字固定排到当前模式第一行行首
  const firstVisible = el.fieldEls.find((f) => f.classList.contains("is-visible"));
  el.fieldEls.forEach((f) => f.classList.toggle("has-kind", f === firstVisible));
  if (firstVisible && el.kindInput) {
    firstVisible.insertBefore(el.kindInput, firstVisible.firstChild);
  }
}

function parseKind(text) {
  const s = String(text || "");
  const m =
    s.match(/\[\s*(explicit|implicit|parametric|polar)\s*\]/i) ||
    s.match(/\b(explicit|implicit|parametric|polar)\b/i);
  return m ? m[1].toLowerCase() : null;
}

function readInputs() {
  return {
    explicit: el.inputExplicit.value.trim(),
    implicit: el.inputImplicit.value.trim(),
    paramX: el.inputParamX.value.trim(),
    paramY: el.inputParamY.value.trim(),
    polar: el.inputPolar.value.trim(),
  };
}

function buildSpec() {
  const v = readInputs();
  if (state.mode === "explicit") {
    if (!v.explicit) return { error: "请先填写 y = f(x)" };
    const e = makeEval(v.explicit);
    if (e.error) return { error: e.error };
    return { spec: { mode: "explicit", fn: (x) => e.fn({ x }) } };
  }
  if (state.mode === "implicit") {
    if (!v.implicit) return { error: "请先填写 F(x, y)" };
    const e = makeEval(v.implicit);
    if (e.error) return { error: e.error };
    return { spec: { mode: "implicit", fn: (x, y) => e.fn({ x, y }) } };
  }
  if (state.mode === "polar") {
    if (!v.polar) return { error: "请先填写 r(θ)" };
    const e = makeEval(v.polar);
    if (e.error) return { error: e.error };
    return { spec: { mode: "polar", fn: (th) => e.fn({ theta: th }) } };
  }
  if (state.mode === "parametric") {
    if (!v.paramX || !v.paramY) return { error: "请填写 x(t) 与 y(t)" };
    const ex = makeEval(v.paramX);
    if (ex.error) return { error: `x(t)：${ex.error}` };
    const ey = makeEval(v.paramY);
    if (ey.error) return { error: `y(t)：${ey.error}` };
    return {
      spec: {
        mode: "parametric",
        fnX: (t) => ex.fn({ t }),
        fnY: (t) => ey.fn({ t }),
      },
    };
  }
  return { error: "未知模式" };
}

function plotNow({ quiet } = {}) {
  const { spec, error } = buildSpec();
  if (error) {
    if (!quiet) setStatus(error, "error");
    return false;
  }
  plotter.setSpec(spec);
  el.plotHint.style.opacity = "0";
  return true;
}

function fillFields(result) {
  el.inputExplicit.value = result.explicit || "";
  el.inputImplicit.value = result.implicit || "";
  el.inputPolar.value = result.polar || "";
  el.inputParamX.value = (result.parametric && result.parametric.x) || "";
  el.inputParamY.value = (result.parametric && result.parametric.y) || "";
}

el.clearBtn.addEventListener("click", () => {
  board.clear();
  plotter.clearSpec();
  showBoardImage("");
  el.consoleBody.hidden = true;
  renderLatex("");
  setStatus("");
});

let kindTimer = null;

el.kindInput.addEventListener("input", () => {
  clearTimeout(kindTimer);
  kindTimer = setTimeout(() => {
    const k = parseKind(el.kindInput.value);
    if (k && k !== state.mode) {
      setMode(k);
      plotNow({ quiet: true });
    }
  }, 320);
});

el.kindInput.addEventListener("blur", () => {
  const k = parseKind(el.kindInput.value) || state.mode;
  el.kindInput.value = `[${k}]`;
});

el.kindInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") el.kindInput.blur();
});

/* 示例贴图 / 上传回显：把图片画到黑板上（无则隐藏），并支持被黑板擦擦除 */
const boardImageCtx = el.boardImage ? el.boardImage.getContext("2d") : null;

function drawBoardImage(img) {
  const canvas = el.boardImage;
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  boardImageCtx.globalCompositeOperation = "source-over";
  boardImageCtx.clearRect(0, 0, canvas.width, canvas.height);
  boardImageCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
}

function showBoardImage(src, upload = false) {
  if (!el.boardImage) return;
  if (!src) {
    el.boardImage.classList.remove("is-visible", "is-upload");
    return;
  }
  const img = new Image();
  img.onload = () => {
    drawBoardImage(img);
    el.boardImage.classList.toggle("is-upload", upload);
    el.boardImage.classList.add("is-visible");
  };
  img.onerror = () => {
    el.boardImage.classList.remove("is-visible", "is-upload");
  };
  img.src = src;
}

// 黑板擦：在贴图上擦出透明缺口，模拟"擦得掉"的手感
function eraseBoardImageAt(clientX, clientY, radius) {
  const canvas = el.boardImage;
  if (!canvas || !boardImageCtx || !canvas.classList.contains("is-visible")) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  if (
    clientX < rect.left - radius ||
    clientX > rect.right + radius ||
    clientY < rect.top - radius ||
    clientY > rect.bottom + radius
  ) {
    return;
  }
  const scale = canvas.width / rect.width;
  const x = (clientX - rect.left) * scale;
  const y = (clientY - rect.top) * scale;
  const r = radius * scale;
  const ctx = boardImageCtx;
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, "rgba(0,0,0,1)");
  grad.addColorStop(0.7, "rgba(0,0,0,0.75)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 黑板擦擦到黑板任意位置时，同步擦除贴图
board.onErase = (x, y, r) => {
  const rect = el.board.getBoundingClientRect();
  eraseBoardImageAt(rect.left + x, rect.top + y, r);
};

/* 示例：点击直接填入表达式并绘制 */
function applyExample(chip) {
  const kind = chip.dataset.kind;
  el.inputExplicit.value = "";
  el.inputImplicit.value = "";
  el.inputPolar.value = "";
  el.inputParamX.value = "";
  el.inputParamY.value = "";
  if (kind === "explicit") {
    el.inputExplicit.value = chip.dataset.expr || "";
  } else if (kind === "implicit") {
    el.inputImplicit.value = chip.dataset.expr || "";
  } else if (kind === "polar") {
    el.inputPolar.value = chip.dataset.expr || "";
  } else if (kind === "parametric") {
    el.inputParamX.value = chip.dataset.xt || "";
    el.inputParamY.value = chip.dataset.yt || "";
  }
  setMode(kind);
  renderLatex(chip.dataset.latex || "");
  showBoardImage(chip.dataset.image || "");
  el.consoleBody.hidden = false;
  const ok = plotNow({ quiet: true });
  setStatus(ok ? `> ${KIND_LABEL[kind] || kind}` : "! 示例表达式无法绘制", ok ? "ok" : "error");
}

if (el.examples) {
  el.examples.addEventListener("click", (e) => {
    const chip = e.target.closest(".example-chip");
    if (chip) applyExample(chip);
  });
}

/* 所有输入框：改完 debounce 自动绘制 */
const ALL_INPUTS = [
  el.inputExplicit, el.inputImplicit,
  el.inputParamX, el.inputParamY, el.inputPolar,
];
let inputTimer = null;
ALL_INPUTS.forEach((inp) => {
  inp.addEventListener("input", () => {
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => plotNow({ quiet: true }), 280);
  });
});

el.resetView.addEventListener("click", () => plotter.resetView());

/* ---------- 导出手写函数 PNG ---------- */
el.exportBtn.addEventListener("click", () => {
  if (board.isEmpty()) {
    setStatus("! 黑板上还没有内容可导出", "error");
    return;
  }
  let dataUrl = null;
  try {
    dataUrl = board.exportTransparentPng();
  } catch {
    dataUrl = null;
  }
  if (!dataUrl) {
    setStatus("! 导出失败", "error");
    return;
  }
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `mathchalk-${ts}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setStatus("> 已导出手写函数 PNG", "ok");
});

/* ---------- 绘图面板：拖动左上角缩放 ---------- */
const PLOT_MIN = { w: 220, h: 160 };
const PLOT_MAX = { w: 900, h: 700 };

function positionPlotHandle() {
  if (!el.plotResize) return;
  const br = el.boardShell.getBoundingClientRect();
  const pr = el.plot.getBoundingClientRect();
  el.plotResize.style.left = `${pr.left - br.left}px`;
  el.plotResize.style.top = `${pr.top - br.top}px`;
}

if (el.plotResize) {
  el.plotResize.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = el.plot.getBoundingClientRect();
    const startW = rect.width;
    const startH = rect.height;
    try {
      el.plotResize.setPointerCapture(e.pointerId);
    } catch {}

    const onMove = (ev) => {
      const dx = startX - ev.clientX; // 向左拖 → 变大
      const dy = startY - ev.clientY; // 向上拖 → 变大
      // 等比缩放：以宽高变化中较大的一方作为缩放比例，保持初始宽高比
      let scale = Math.max((startW + dx) / startW, (startH + dy) / startH);
      const minScale = Math.max(PLOT_MIN.w / startW, PLOT_MIN.h / startH);
      const maxScale = Math.min(PLOT_MAX.w / startW, PLOT_MAX.h / startH);
      scale = Math.max(minScale, Math.min(maxScale, scale));
      el.plot.style.width = `${startW * scale}px`;
      el.plot.style.height = `${startH * scale}px`;
      plotter.resize();
      plotter.render();
      positionPlotHandle();
    };
    const onUp = () => {
      el.plotResize.removeEventListener("pointermove", onMove);
      el.plotResize.removeEventListener("pointerup", onUp);
      el.plotResize.removeEventListener("pointercancel", onUp);
    };
    el.plotResize.addEventListener("pointermove", onMove);
    el.plotResize.addEventListener("pointerup", onUp);
    el.plotResize.addEventListener("pointercancel", onUp);
  });
}

/* 识别兜底：后端没给出可直接绘制的二维表达式时，尝试从识别出的 latex 反推 */
const LATEX_FUNCS = [
  "sqrt", "cbrt", "sin", "cos", "tan", "cot", "sec", "csc", "asin", "acos", "atan",
  "sinh", "cosh", "tanh", "log10", "log", "ln", "exp", "abs", "min", "max",
  "floor", "ceil", "round", "sign",
];

function readLatexGroup(s, i) {
  let depth = 0;
  let out = "";
  for (; i < s.length; i++) {
    const c = s[i];
    if (c === "{") {
      depth++;
      if (depth === 1) continue;
    } else if (c === "}") {
      depth--;
      if (depth === 0) break;
    }
    out += c;
  }
  return [out, i + 1];
}

function latexToPlain(latex) {
  const s = String(latex || "");
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\") {
      let j = i + 1;
      let name = "";
      while (j < s.length && /[a-zA-Z]/.test(s[j])) {
        name += s[j];
        j++;
      }
      if (name === "frac") {
        const [a, i1] = readLatexGroup(s, j);
        const [b, i2] = readLatexGroup(s, i1);
        out += `((${latexToPlain(a)})/(${latexToPlain(b)}))`;
        i = i2 - 1;
      } else if (name === "sqrt") {
        const [a, i1] = readLatexGroup(s, j);
        out += `sqrt(${latexToPlain(a)})`;
        i = i1 - 1;
      } else if (name === "cdot" || name === "times") {
        out += "*";
        i = j - 1;
      } else if (name === "div") {
        out += "/";
        i = j - 1;
      } else if (name === "pi") {
        out += "pi";
        i = j - 1;
      } else if (name === "ln") {
        out += "log";
        i = j - 1;
      } else if (name) {
        out += `${name} `;
        i = j - 1;
      } else {
        i = j - 1;
      }
    } else if (c === "{") {
      const [a, i1] = readLatexGroup(s, i);
      out += `(${latexToPlain(a)})`;
      i = i1 - 1;
    } else if (c === "}") {
      // 忽略多余的右花括号
    } else {
      out += c;
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

function plainVars(plain) {
  let s = plain;
  for (const f of LATEX_FUNCS) {
    s = s.replace(new RegExp(`\\b${f}\\b`, "g"), " ");
  }
  s = s.replace(/\b(pi|theta|e)\b/g, " ");
  const letters = s.match(/[a-zA-Z]/g) || [];
  return new Set(letters.map((c) => c.toLowerCase()));
}

function deriveFromLatex(latex) {
  const plain = latexToPlain(latex);
  const parts = plain.split("=");
  if (parts.length !== 2) return null;
  const lhs = parts[0].trim();
  const rhs = parts[1].trim();
  if (!lhs || !rhs) return null;
  const vars = plainVars(plain);
  if (vars.size === 0) return null;
  const onlyXY = [...vars].every((v) => v === "x" || v === "y");
  if (!onlyXY) return { error: "multi" };
  if (lhs === "y" && [...plainVars(rhs)].every((v) => v === "x")) {
    return { mode: "explicit", expr: rhs };
  }
  return { mode: "implicit", expr: `${lhs}-(${rhs})` };
}

async function runRecognize(image, { echo = false } = {}) {
  setStatus("> 正在识别手写公式…", "loading");
  showBoardImage("");
  try {
    const result = await recognize(image);
    fillFields(result);
    renderLatex(result.latex);
    el.consoleBody.hidden = false;
    if (KIND_LABEL[result.kind]) setMode(result.kind);

    let ok = plotNow({ quiet: true });
    let unsupported = false;
    if (!ok) {
      // 以右上角识别出的公式为准，尝试推导出可绘制的二维表达式
      const derived = deriveFromLatex(result.latex);
      if (derived && derived.mode) {
        if (derived.mode === "explicit") el.inputExplicit.value = derived.expr;
        else el.inputImplicit.value = derived.expr;
        setMode(derived.mode);
        ok = plotNow({ quiet: true });
      } else if (derived && derived.error === "multi") {
        unsupported = true;
      }
    }

    if (echo) showBoardImage(image, true);
    // 识别完成：下次落笔前自动清掉上一道笔迹，避免多道公式叠加
    board.armAutoClear();

    if (ok) {
      const label = KIND_LABEL[result.kind];
      setStatus(
        label
          ? `> 识别完成 · 命中「${label}」，可修改下方表达式`
          : "> 识别完成 · 已生成函数图像，可修改下方表达式",
        "ok"
      );
    } else if (unsupported) {
      setStatus("! 该式为三维/多元表达式（含 x、y 以外的变量），当前仅支持二维函数图像", "error");
    } else {
      setStatus(`! 识别为「${KIND_LABEL[result.kind] || "未知"}」，但表达式无法绘制，请修改`, "error");
    }
  } catch (err) {
    setStatus(`! ${err.message || "识别失败"}`, "error");
  }
}

el.recognizeBtn.addEventListener("click", async () => {
  if (board.isEmpty()) {
    setStatus("! 请先在黑板上写下方程", "error");
    return;
  }
  el.recognizeBtn.disabled = true;
  el.recognizeBtn.classList.add("is-loading");
  try {
    await runRecognize(board.exportImage());
  } finally {
    el.recognizeBtn.disabled = false;
    el.recognizeBtn.classList.remove("is-loading");
  }
});

/* ---------- 上传图片识别 ---------- */

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败"));
    };
    img.src = url;
  });
}

// 过大图片先等比压缩，避免请求体过大
async function fileToDataUrl(file, maxSide = 1280) {
  const img = await loadImageFromFile(file);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(img, 0, 0, w, h);
  return c.toDataURL("image/png");
}

el.uploadBtn.addEventListener("click", () => el.uploadInput.click());

el.uploadInput.addEventListener("change", async () => {
  const file = el.uploadInput.files && el.uploadInput.files[0];
  el.uploadInput.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setStatus("! 请上传图片文件", "error");
    return;
  }
  el.uploadBtn.disabled = true;
  el.uploadBtn.classList.add("is-loading");
  try {
    const image = await fileToDataUrl(file);
    await runRecognize(image, { echo: true });
  } catch (err) {
    setStatus(`! ${err.message || "读取图片失败"}`, "error");
  } finally {
    el.uploadBtn.disabled = false;
    el.uploadBtn.classList.remove("is-loading");
  }
});

window.addEventListener("resize", () => {
  board.resize();
  plotter.resize();
  plotter.render();
  positionPlotHandle();
});

/* ---------- 禁止右键菜单与元素原生拖拽，避免误操作 ---------- */
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("dragstart", (e) => {
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
  e.preventDefault();
});

setMode("explicit");
positionPlotHandle();

/* 初始化：随机展示 y = x² 或 y = sin x 之一 */
if (el.examples) {
  const bootExamples = Array.from(el.examples.querySelectorAll(".example-chip[data-image]"));
  if (bootExamples.length) {
    applyExample(bootExamples[Math.floor(Math.random() * bootExamples.length)]);
  }
}

/* ---------- 首次进入：分步操作指引 ---------- */

const tourEl = document.getElementById("tour");
const tourSpot = document.getElementById("tour-spot");
const tourTip = document.getElementById("tour-tip");
const tourStepEl = document.getElementById("tour-step");
const tourTitleEl = document.getElementById("tour-title");
const tourDescEl = document.getElementById("tour-desc");
const tourSkip = document.getElementById("tour-skip");
const tourPrev = document.getElementById("tour-prev");
const tourNext = document.getElementById("tour-next");

function chalkTool() {
  return el.rackItems.find((i) => i.dataset.tool === "chalk-white") || el.rackItems[0];
}

const TOUR_STEPS = [
  {
    target: () => el.clearBtn,
    title: "清除演示内容",
    desc: "先点击左侧「清屏」按钮，清掉默认展示的函数图像，腾出一块干净的黑板。",
    placement: "right",
  },
  {
    target: chalkTool,
    title: "挑一支粉笔",
    desc: "从黑板下方的置物栏拿起一支粉笔（白色或黄色），它决定你写出来的颜色。",
    placement: "top",
  },
  {
    spot: () => {
      const w = Math.min(560, window.innerWidth * 0.46);
      const h = Math.min(360, window.innerHeight * 0.5);
      return { left: window.innerWidth / 2 - w / 2, top: window.innerHeight * 0.26, width: w, height: h };
    },
    title: "写下你的方程",
    desc: "在黑板空白处写下想绘制的方程，例如 y = x^2 或 y = sin x，尽量写清楚一些。",
    placement: "bottom",
  },
  {
    target: () => el.recognizeBtn,
    title: "生成函数图像",
    desc: "点击左侧黑色圆形按钮，识别手写方程，并在右下角绘制出对应的函数图像。",
    placement: "right",
  },
];

let tourIndex = 0;
let tourOn = false;
const TOUR_ENABLED = false;
const TOUR_SEEN_KEY = "mathchalk:tour-seen";

function tourSeen() {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markTourSeen() {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, "1");
  } catch {}
}

function tourRect(step) {
  if (step.spot) return step.spot();
  const target = step.target && step.target();
  return target ? target.getBoundingClientRect() : null;
}

function renderTour() {
  const step = TOUR_STEPS[tourIndex];
  const rect = tourRect(step);
  if (!rect) return;
  const pad = 8;

  tourSpot.style.left = `${rect.left - pad}px`;
  tourSpot.style.top = `${rect.top - pad}px`;
  tourSpot.style.width = `${Math.max(0, rect.width + pad * 2)}px`;
  tourSpot.style.height = `${Math.max(0, rect.height + pad * 2)}px`;

  tourStepEl.textContent = `第 ${tourIndex + 1} 步 / 共 ${TOUR_STEPS.length} 步`;
  tourTitleEl.textContent = step.title;
  tourDescEl.textContent = step.desc;
  tourPrev.disabled = tourIndex === 0;
  tourNext.textContent = tourIndex === TOUR_STEPS.length - 1 ? "完成" : "下一步";

  const tipW = tourTip.offsetWidth || 300;
  const tipH = tourTip.offsetHeight || 170;
  let x;
  let y;
  if (step.placement === "right") {
    x = rect.right + 22;
    y = rect.top + rect.height / 2 - tipH / 2;
  } else if (step.placement === "left") {
    x = rect.left - tipW - 22;
    y = rect.top + rect.height / 2 - tipH / 2;
  } else if (step.placement === "top") {
    x = rect.left + rect.width / 2 - tipW / 2;
    y = rect.top - tipH - 18;
  } else if (step.placement === "bottom") {
    x = rect.left + rect.width / 2 - tipW / 2;
    y = rect.top + rect.height + 18;
  } else {
    x = window.innerWidth / 2 - tipW / 2;
    y = window.innerHeight * 0.62;
  }
  x = Math.max(12, Math.min(window.innerWidth - tipW - 12, x));
  y = Math.max(12, Math.min(window.innerHeight - tipH - 12, y));
  tourTip.style.left = `${x}px`;
  tourTip.style.top = `${y}px`;
}

function goTour(i) {
  tourIndex = Math.max(0, Math.min(TOUR_STEPS.length - 1, i));
  renderTour();
}

function endTour() {
  tourOn = false;
  tourEl.hidden = true;
  markTourSeen();
}

function startTour() {
  if (!TOUR_ENABLED) return;
  if (!tourEl || tourOn) return;
  if (window.innerWidth < 920) return;
  if (tourSeen()) return;
  tourOn = true;
  tourIndex = 0;
  tourEl.hidden = false;
  requestAnimationFrame(renderTour);
}

tourNext.addEventListener("click", () => {
  if (tourIndex >= TOUR_STEPS.length - 1) endTour();
  else goTour(tourIndex + 1);
});
tourPrev.addEventListener("click", () => goTour(tourIndex - 1));
tourSkip.addEventListener("click", endTour);
window.addEventListener("resize", () => {
  if (tourOn) renderTour();
});

/* ---------- 左下角控制台上方：气泡留言（每次一条，定时翻页） ---------- */

const BUBBLE_ENABLED = false; // 气泡功能暂时隐藏，改为 true 即可开启
const BUBBLE_PRESETS = [
  "不想学数学，我想画画、写字",
  "能不能增加作品分享和错题打印",
  "哇，可以做黑板报",
  "这黑板比我教室的高级",
  "学数学也可以很快乐",
  "画个心形函数试试？",
  "用粉笔写公式，仪式感拉满",
  "我摊牌了，我是来画画的",
  "谁会画椭圆？",
];

const BUBBLE_INTERVAL = 6000;
let bubblePool = [];
let bubbleIndex = 0;
let bubbleTimer = null;

// 气泡/留言入口跟随控制台顶部，始终贴在控制台上方
function positionMsgDock() {
  if (!el.msgDock || !el.consoleEl) return;
  const r = el.consoleEl.getBoundingClientRect();
  const bottom = window.innerHeight - r.top + 12;
  el.msgDock.style.bottom = `${bottom}px`;
  if (el.danmakuInput) {
    el.danmakuInput.style.bottom = `${bottom + el.msgDock.offsetHeight + 10}px`;
  }
}

function showBubble(text) {
  if (!el.bubble || !el.bubbleText) return;
  el.bubbleText.textContent = text;
  el.bubble.hidden = false;
  positionMsgDock();
  requestAnimationFrame(() => el.bubble.classList.add("is-show"));
}

function nextBubble() {
  if (!el.bubble || !bubblePool.length) return;
  el.bubble.classList.remove("is-show");
  window.setTimeout(() => {
    showBubble(bubblePool[bubbleIndex % bubblePool.length]);
    bubbleIndex++;
  }, 300);
}

function restartBubbleTimer() {
  if (bubbleTimer) window.clearInterval(bubbleTimer);
  bubbleTimer = window.setInterval(nextBubble, BUBBLE_INTERVAL);
}

function startBubbles() {
  if (!BUBBLE_ENABLED || !el.bubble || !BUBBLE_PRESETS.length) return;
  bubblePool = BUBBLE_PRESETS.slice();
  for (let i = bubblePool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bubblePool[i], bubblePool[j]] = [bubblePool[j], bubblePool[i]];
  }
  bubbleIndex = 0;
  positionMsgDock();
  showBubble(bubblePool[bubbleIndex++]);
  restartBubbleTimer();
}

function closeDanmakuInput() {
  el.danmakuInput.hidden = true;
  el.danmakuBtn.classList.remove("is-active");
}

function sendDanmaku() {
  const t = el.danmakuText.value.trim();
  if (!t) return;
  closeDanmakuInput();
  if (el.bubble) {
    el.bubble.classList.remove("is-show");
    window.setTimeout(() => {
      showBubble(t);
      // 自己的留言展示后，继续按时翻页
      restartBubbleTimer();
    }, 240);
  }
  el.danmakuText.value = "";
}

el.danmakuBtn.addEventListener("click", () => {
  const show = el.danmakuInput.hidden;
  el.danmakuInput.hidden = !show;
  el.danmakuBtn.classList.toggle("is-active", show);
  if (show) {
    positionMsgDock();
    el.danmakuText.focus();
  }
});

el.danmakuSend.addEventListener("click", sendDanmaku);
el.danmakuText.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendDanmaku();
  }
});
document.addEventListener("pointerdown", (e) => {
  if (el.danmakuInput.hidden) return;
  if (el.danmakuInput.contains(e.target) || el.danmakuBtn.contains(e.target)) return;
  closeDanmakuInput();
});

window.addEventListener("resize", positionMsgDock);
if (el.consoleEl) {
  new MutationObserver(positionMsgDock).observe(el.consoleEl, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "class", "style"],
  });
}

/* ---------- 赞赏弹窗 ---------- */

function closeReward() {
  el.rewardModal.hidden = true;
}

el.rewardBtn.addEventListener("click", () => {
  el.rewardModal.hidden = false;
});
el.rewardClose.addEventListener("click", closeReward);
el.rewardMask.addEventListener("click", closeReward);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !el.rewardModal.hidden) closeReward();
});

/* ---------- 启动遮罩：等黑板背景就绪后再淡出，避免首屏白闪 ---------- */
function dismissBoot() {
  const boot = document.getElementById("boot");
  clearTimeout(window.__bootFallback);
  document.body.classList.add("is-ready");
  if (!boot) return;
  boot.classList.add("is-hidden");
  window.setTimeout(() => boot.remove(), 500);
  window.setTimeout(startTour, 450);
  startBubbles();
}

let bootDone = false;
function finishBoot() {
  if (bootDone) return;
  bootDone = true;
  requestAnimationFrame(() => requestAnimationFrame(dismissBoot));
}

const boardBg = new Image();
boardBg.addEventListener("load", finishBoot);
boardBg.addEventListener("error", finishBoot);
boardBg.src = "/brand/board.webp";
if (boardBg.complete) finishBoot();
window.setTimeout(finishBoot, 2500);
