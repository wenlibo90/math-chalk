import express from "express";

const PORT = process.env.PORT || 3001;

const LLM_BASE_URL = (
  process.env.MCAI_LLM_BASE_URL ||
  process.env.OPENAI_BASE_URL ||
  ""
).replace(/\/+$/, "");
const LLM_API_KEY =
  process.env.MCAI_LLM_API_KEY || process.env.OPENAI_API_KEY || "";
const LLM_MODEL =
  process.env.MCAI_LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o";

const app = express();
app.use(express.json({ limit: "12mb" }));

const SYSTEM_PROMPT = `You are a precise handwritten-math transcription engine.
You read an image of a mathematical expression handwritten in chalk on a dark green blackboard.
Return ONLY a JSON object. Never add markdown fences, comments or explanations.`;

const USER_PROMPT = `Transcribe the mathematical expression handwritten in the image.

Rules:
- Transcribe faithfully. Preserve what is actually written. Do not solve, simplify or invent values.
- Ignore the blackboard texture, wood frame, dust, smudges and fingers.
- Read from top-left to bottom-right for multi-line content; concatenate parts on one line.

Return a JSON object with exactly these fields:
{
  "latex": "<the expression in LaTeX, e.g. y = x^{2} + 1>",
  "kind": "explicit" | "implicit" | "parametric" | "polar" | "unknown",
  "explicit": "<f(x) as a plain math expression, variable x, empty string if N/A>",
  "implicit": "<F(x,y) moved to one side so that it equals 0, variables x and y, empty string if N/A>",
  "parametric": { "x": "<x(t) expression, variable t>", "y": "<y(t) expression, variable t>" },
  "polar": "<r(theta) expression, variable theta, empty string if N/A>"
}

Kind selection:
- explicit: the form is y = f(x)  -> fill "explicit".
- implicit: it is an equation in x and y (e.g. x^2 + y^2 = 1) -> move everything to the left side and fill "implicit" (e.g. "x^2 + y^2 - 1").
- parametric: given as x = ...(t), y = ...(t) -> fill "parametric".
- polar: given as r = ...(theta) -> fill "polar".
- Fill only the field(s) matching the detected kind. Leave the others as "" or null.

Expression syntax (for the non-latex fields):
- Plain math text. Use ^ for power, * for multiply, / for divide.
- Allowed functions/constants: sqrt, sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, log (natural), log10, exp, abs, min, max, floor, ceil, round, sign, pi, e.
- Use parentheses freely. Do NOT use LaTeX commands (no \\\\frac, \\\\sqrt, \\\\cdot, \\\\pi) in these fields.
- Examples: y = x^2 becomes "x^2"; x^2 + y^2 = 1 becomes implicit "x^2 + y^2 - 1"; y = 1/(1+x^2) becomes "1/(1+x^2)"; y = sqrt(x) becomes "sqrt(x)".

Output ONLY the JSON object.`;

function normalizeExpr(input) {
  if (typeof input !== "string") return "";
  let s = input.trim();
  if (!s) return "";
  s = s.replace(/\\left/g, "").replace(/\\right/g, "");
  s = s.replace(/\\cdot/g, "*").replace(/\\times/g, "*").replace(/\\div/g, "/");
  s = s.replace(/\\pi\b/g, "pi");
  s = s.replace(/\\ln\b/g, "log");
  s = s.replace(/\\(sin|cos|tan|asin|acos|atan|sinh|cosh|tanh|log|exp|sqrt|abs)\b/g, "$1");
  s = s.replace(/\\([a-zA-Z]+)/g, "$1");
  s = s.replace(/\\sqrt\{([^{}]*)\}/g, "sqrt($1)");
  s = s.replace(
    /\\frac\{([^{}]*)\}\{([^{}]*)\}/g,
    "(($1)/($2))"
  );
  s = s.replace(/[{}]/g, "");
  s = s.replace(/\s+/g, " ");
  return s.trim();
}

function normalizeResult(raw) {
  const out = {
    latex: typeof raw?.latex === "string" ? raw.latex.trim() : "",
    kind: typeof raw?.kind === "string" ? raw.kind.trim() : "unknown",
    explicit: normalizeExpr(raw?.explicit),
    implicit: normalizeExpr(raw?.implicit),
    polar: normalizeExpr(raw?.polar),
    parametric: {
      x: normalizeExpr(raw?.parametric?.x),
      y: normalizeExpr(raw?.parametric?.y),
    },
  };
  if (!["explicit", "implicit", "parametric", "polar"].includes(out.kind)) {
    if (out.parametric.x && out.parametric.y) out.kind = "parametric";
    else if (out.polar) out.kind = "polar";
    else if (out.implicit) out.kind = "implicit";
    else if (out.explicit) out.kind = "explicit";
    else out.kind = "unknown";
  }
  return out;
}

function extractJson(text) {
  if (typeof text !== "string") return null;
  let t = text.trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/g, "").trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    model: LLM_MODEL,
    configured: Boolean(LLM_BASE_URL && LLM_API_KEY),
  });
});

app.post("/api/recognize", async (req, res) => {
  try {
    if (!LLM_BASE_URL || !LLM_API_KEY) {
      return res
        .status(500)
        .json({ error: "识别服务未配置（缺少网关地址或密钥）" });
    }
    const { image } = req.body || {};
    if (typeof image !== "string" || image.length < 64) {
      return res.status(400).json({ error: "缺少有效的图片数据" });
    }
    const dataUrl = image.startsWith("data:")
      ? image
      : `data:image/png;base64,${image}`;

    const payload = {
      model: LLM_MODEL,
      temperature: 0,
      max_tokens: 900,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: USER_PROMPT },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    let resp;
    try {
      resp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LLM_API_KEY}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return res
        .status(502)
        .json({ error: `识别网关返回 ${resp.status}`, detail: detail.slice(0, 400) });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = extractJson(content);
    if (!parsed) {
      return res.status(502).json({
        error: "无法解析识别结果",
        detail: typeof content === "string" ? content.slice(0, 400) : "",
      });
    }

    res.json(normalizeResult(parsed));
  } catch (err) {
    const aborted = err?.name === "AbortError";
    res.status(aborted ? 504 : 500).json({
      error: aborted ? "识别超时，请重试" : "识别过程出错",
      detail: String(err?.message || err).slice(0, 300),
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[backend] listening on http://0.0.0.0:${PORT}`);
  console.log(`[backend] model=${LLM_MODEL} configured=${Boolean(LLM_BASE_URL && LLM_API_KEY)}`);
});
