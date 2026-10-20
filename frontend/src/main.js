import katex from "katex";
import "katex/dist/katex.min.css";
import "./style.css";
import { ChalkBoard } from "./chalk.js";
import { Plotter, makeEval } from "./plot.js";
import { recognize } from "./api.js";

const el = {
  board: document.getElementById("board"),
  boardHint: document.getElementById("board-hint"),
  plot: document.getElementById("plot"),
  plotHint: document.getElementById("graph-hint"),
  recognizeBtn: document.getElementById("recognize-btn"),
  plotBtn: document.getElementById("plot-btn"),
  clearBtn: document.getElementById("clear-btn"),
  resetView: document.getElementById("reset-view"),
  latexBox: document.getElementById("latex-box"),
  rawLatex: document.getElementById("raw-latex"),
  status: document.getElementById("status"),
  modeSwitch: document.getElementById("mode-switch"),
  toolBtns: Array.from(document.querySelectorAll(".tool-btn")),
  modeBtns: Array.from(document.querySelectorAll("#mode-switch button")),
  fieldEls: Array.from(document.querySelectorAll(".expr-field")),
  inputExplicit: document.getElementById("input-explicit"),
  inputImplicit: document.getElementById("input-implicit"),
  inputParamX: document.getElementById("input-param-x"),
  inputParamY: document.getElementById("input-param-y"),
  inputPolar: document.getElementById("input-polar"),
};

const board = new ChalkBoard(el.board, el.boardHint);
const plotter = new Plotter(el.plot, el.plotHint);

const state = { mode: "explicit" };

const TOOL_MAP = {
  "chalk-white": { type: "chalk", color: "chalk-white" },
  "chalk-yellow": { type: "chalk", color: "chalk-yellow" },
  eraser: { type: "eraser" },
};

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

function renderLatex(latex) {
  if (!latex) {
    el.latexBox.innerHTML = '<span class="placeholder">识别结果会显示在这里</span>';
    el.rawLatex.textContent = "";
    return;
  }
  try {
    katex.render(latex, el.latexBox, { throwOnError: false, displayMode: true });
  } catch {
    el.latexBox.textContent = latex;
  }
  el.rawLatex.textContent = latex;
}

function fillFields(result) {
  el.inputExplicit.value = result.explicit || "";
  el.inputImplicit.value = result.implicit || "";
  el.inputPolar.value = result.polar || "";
  el.inputParamX.value = (result.parametric && result.parametric.x) || "";
  el.inputParamY.value = (result.parametric && result.parametric.y) || "";
}

el.toolBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    el.toolBtns.forEach((b) => b.classList.toggle("is-active", b === btn));
    board.setTool(TOOL_MAP[btn.dataset.tool]);
  });
});

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

el.plotBtn.addEventListener("click", () => {
  if (plotNow()) setStatus("已绘制", "ok");
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
    renderLatex(result.latex);
    fillFields(result);
    if (result.kind && result.kind !== "unknown") setMode(result.kind);
    const ok = plotNow({ quiet: true });
    if (ok) {
      setStatus(`识别完成（${result.kind || "unknown"}），可直接修改表达式`, "ok");
    } else {
      setStatus("识别完成，但表达式无法绘制，请检查后修改", "error");
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
