import "./style.css";
import { ChalkBoard } from "./chalk.js";
import { Plotter, makeEval } from "./plot.js";
import { recognize } from "./api.js";

const el = {
  boardShell: document.querySelector(".board-shell"),
  board: document.getElementById("board"),
  boardHint: document.getElementById("board-hint"),
  plot: document.getElementById("plot"),
  plotHint: document.getElementById("graph-hint"),
  recognizeBtn: document.getElementById("recognize-btn"),
  clearBtn: document.getElementById("clear-btn"),
  resetView: document.getElementById("reset-view"),
  status: document.getElementById("status"),
  modeSwitch: document.getElementById("mode-switch"),
  rackItems: Array.from(document.querySelectorAll(".rack-item")),
  modeBtns: Array.from(document.querySelectorAll("#mode-switch button")),
  fieldEls: Array.from(document.querySelectorAll(".expr-field")),
  inputExplicit: document.getElementById("input-explicit"),
  inputImplicit: document.getElementById("input-implicit"),
  inputParamX: document.getElementById("input-param-x"),
  inputParamY: document.getElementById("input-param-y"),
  inputPolar: document.getElementById("input-polar"),
};

const board = new ChalkBoard(el.board, el.boardHint);
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

el.boardShell.addEventListener("pointermove", (e) => {
  if (state.currentTool === "eraser") return;
  const rect = el.boardShell.getBoundingClientRect();
  toolCursor.style.left = `${e.clientX - rect.left}px`;
  toolCursor.style.top = `${e.clientY - rect.top}px`;
  toolCursor.classList.add("visible");
});

el.boardShell.addEventListener("pointerleave", () => {
  toolCursor.classList.remove("visible");
});

el.boardShell.addEventListener("pointerenter", () => {
  if (state.currentTool !== "eraser") toolCursor.classList.add("visible");
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

// 拖动 + 点击选中（移动 < 3px 视为点击）
el.rackItems.forEach((item) => {
  let dragState = null;

  item.addEventListener("pointerdown", (e) => {
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

      // 轻微拖动 → 选中工具；较大拖动 → 不触发选中
      if (dragState && dragState.moved < 4) {
        el.rackItems.forEach((b) => b.classList.remove("is-active"));
        item.classList.add("is-active");
        applyToolCursor(item.dataset.tool);
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

// 初始化
layoutRackItems();
el.rackItems[0].classList.add("is-active");
applyToolCursor("chalk-white");

/* ---------- 其他原有逻辑 ---------- */

function setStatus(text, kind) {
  el.status.textContent = text || "";
  el.status.dataset.kind = kind || "";
}

function setMode(mode) {
  state.mode = mode;
  el.modeBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.mode === mode));
  const active = {
    explicit: ["explicit"],
    implicit: ["implicit"],
    parametric: ["parametric-x", "parametric-y"],
    polar: ["polar"],
  }[mode] || [];
  el.fieldEls.forEach((f) => {
    f.classList.toggle("is-visible", active.includes(f.dataset.field));
  });
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
  setStatus("");
});

el.modeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    setMode(btn.dataset.mode);
    plotNow({ quiet: true });
  });
});

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

el.recognizeBtn.addEventListener("click", async () => {
  if (board.isEmpty()) {
    setStatus("请先在黑板上写下方程", "error");
    return;
  }
  const image = board.exportImage();
  el.recognizeBtn.disabled = true;
  el.recognizeBtn.textContent = "识别中…";
  setStatus("正在识别手写公式…", "loading");
  try {
    const result = await recognize(image);
    fillFields(result);
    if (result.kind && result.kind !== "unknown") setMode(result.kind);
    const ok = plotNow({ quiet: true });
    const kindLabel = { explicit: "显式", implicit: "隐式", parametric: "参数", polar: "极坐标" }[result.kind] || result.kind || "未知";
    if (ok) {
      setStatus(`✓ 识别完成 · 已匹配「${kindLabel}」· 可直接修改`, "ok");
    } else {
      setStatus(`识别完成（${kindLabel}），但表达式无法绘制，请修改后重试`, "error");
    }
  } catch (err) {
    setStatus(err.message || "识别失败", "error");
  } finally {
    el.recognizeBtn.disabled = false;
    el.recognizeBtn.textContent = "识别";
  }
});

window.addEventListener("resize", () => {
  board.resize();
  plotter.resize();
  plotter.render();
});

setMode("explicit");
renderLatex("");
