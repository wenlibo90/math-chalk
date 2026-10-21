# MathChalk · 数学黑板报

> 选择粉笔写下方程，点击识别按钮即可绘制专业函数图像。
>
> 在一块会思考的黑板上，手写、识别、出图，一气呵成。

MathChalk 是一块可以手写方程并实时出图的「数学黑板报」。它把书写体验和函数可视化揉在一起：用粉笔在黑板上写下公式，识别后就能在角落的函数视窗里看到对应的曲线，适合课堂演示、自学探索，以及纯粹玩一玩数学。

---

## 截图

![MathChalk 界面截图](docs/screenshot.jpg)

<!-- 截图占位：请将项目截图保存为 docs/screenshot.jpg 后即可在 README 中显示 -->

---

## 功能特性

- **手写识别**：在黑板上用粉笔写下方程，点击「识别」由视觉大模型转写为公式。
- **多类型支持**：显式函数 `y=f(x)`、隐式方程 `F(x,y)=0`、参数方程 `x(t),y(t)`、极坐标 `r(θ)`。
- **专业函数图像**：右下角函数视窗支持滚轮缩放、拖动平移，以及左上角手柄等比缩放。
- **示例贴图**：内置 `y=x²`、`y=sin x` 等示例，点击即绘制并贴上对应手写图；打开页面随机演示其一。
- **上传识别**：不想在线手写时，可直接上传图片识别公式，原图回显在黑板中央。
- **终端风格控制台**：识别结果与可编辑表达式以命令行风格对齐展示，可直接修改后重新出图。
- **粉笔字识别结果**：识别出的公式在右上角以粉笔字放大显示。
- **真实书写手感**：粉笔、黑板擦可在置物栏自由摆放，支持拖动擦除，笔迹带粉笔颗粒质感。
- **导出与清屏**：一键清屏，可导出手写笔迹 PNG。
- **工程化脚本**：`dev.sh` / `start.sh` / `stop.sh` 一键启停，端口固定、日志落盘。

---

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vite 5 + 原生 JavaScript、Canvas 2D、KaTeX、mathjs |
| 后端 | Node.js + Express，调用兼容 OpenAI 协议的视觉大模型 |
| 识别 | Vision LLM（手写公式转写为结构化 JSON） |

---

## 目录结构

```
.
├── backend/                 # Express 后端：手写公式识别
│   ├── server.js            # 识别接口与提示词
│   └── package.json
├── frontend/                # Vite 前端：黑板、绘图与交互
│   ├── index.html
│   ├── public/
│   │   └── brand/           # 黑板、粉笔、示例贴图、赞赏码等素材
│   ├── src/
│   │   ├── main.js          # 交互主逻辑
│   │   ├── chalk.js         # 粉笔书写与擦除
│   │   ├── plot.js          # 函数图像绘制
│   │   ├── api.js           # 识别接口封装
│   │   └── style.css
│   └── vite.config.js
├── dev.sh                   # 开发模式：后端 + Vite dev（热更新）
├── start.sh                 # 生产模式：后端 + 前端构建 + 预览
├── stop.sh                  # 按端口停止前后端服务
└── README.md
```

---

## 快速开始

### 环境要求

- Node.js 18+（建议 20 LTS）
- npm

### 1. 配置识别服务

后端需要一个兼容 OpenAI 协议的视觉大模型网关。以下环境变量可在启动前导出（任选一组前缀即可）：

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `MCAI_LLM_BASE_URL` / `OPENAI_BASE_URL` | 模型网关地址（不含 `/chat/completions`） | 无，必填 |
| `MCAI_LLM_API_KEY` / `OPENAI_API_KEY` | 网关密钥 | 无，必填 |
| `MCAI_LLM_MODEL` / `OPENAI_MODEL` | 模型名 | `gpt-4o` |
| `PORT` | 后端监听端口 | `3001` |

```bash
# 示例：以 OpenAI 兼容网关为例
export MCAI_LLM_BASE_URL="https://your-gateway.example.com/v1"
export MCAI_LLM_API_KEY="sk-xxxxxxxx"
export MCAI_LLM_MODEL="gpt-4o"
```

> 未配置网关时，前后端仍可正常启动，仅「识别」相关接口不可用。

### 2. 一键启动

```bash
# 开发模式：后端 :3001 + 前端 Vite dev :5173（支持热更新）
./dev.sh

# 生产模式：后端 :3001 + 前端构建 + vite preview :5173
./start.sh

# 停止服务（按端口精确终止）
./stop.sh
```

启动成功后访问 `http://localhost:5173`。前端通过 Vite 代理把 `/api` 请求转发到后端 `:3001`，因此只需访问前端端口即可。

### 3. 手动启动（可选）

```bash
# 后端
cd backend && npm install && npm run start

# 前端（另开终端）
cd frontend && npm install && npm run dev
```

---

## 使用说明

1. 从黑板下方的置物栏拿起一支粉笔（白色或黄色）。
2. 在黑板上写下方程，例如 `y = x^2`、`y = sin x`、`x^2 + y^2 = 9`。
3. 点击左侧黑色圆形按钮进行识别，结果会在右上角以粉笔字显示，并在右下角绘制函数图像。
4. 左下角控制台可直接修改表达式或类型关键字（`[explicit]` / `[implicit]` / `[parametric]` / `[polar]`），改完自动重绘。
5. 右下角视窗支持滚轮缩放、拖动平移，左上角手柄等比缩放；点击「重置视图」恢复。
6. 需要重新书写时，点击「清屏」清除笔迹与图像。

> 提示：绘图支持二维函数与曲线。像 `z = 3x + 4y` 这类含多个自变量的三维表达式，二维黑板无法绘制，会给出相应提示。

---

## 前后端接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查，返回模型名与是否已配置网关 |
| `POST` | `/api/recognize` | 传入 `{ image }`（dataURL 或 base64），返回识别结果 |

识别返回结构：

```jsonc
{
  "latex": "y = x^{2}",
  "kind": "explicit",          // explicit | implicit | parametric | polar | unknown
  "explicit": "x^2",
  "implicit": "",
  "parametric": { "x": "", "y": "" },
  "polar": ""
}
```

---

## 常见问题

- **识别按钮无响应 / 报错**：请确认已正确配置模型网关环境变量，且后端 `:3001` 已启动。
- **端口被占用**：项目使用固定端口（后端 `3001`、前端 `5173`），可先执行 `./stop.sh` 再启动。
- **公式无法绘制**：确认是二维表达式；含 `z` 等第三个变量的三维式子暂不支持。
- **远程访问**：`vite.config.js` 已配置 `host: 0.0.0.0` 与 `allowedHosts`，可通过自定义域名访问。

---

## 赞赏支持

MathChalk 由个人在业余时间开发与维护。如果它帮到了你，欢迎请作者喝杯咖啡。

每一份赞赏都会用于项目的持续开发与维护，让这块小黑板走得更远。**赞赏完全自愿，不影响任何功能的使用。**

<p align="center">
  <img src="frontend/public/brand/wxpay.jpg" alt="微信赞赏码" width="220" />
  &nbsp;&nbsp;&nbsp;
  <img src="frontend/public/brand/alipay.jpg" alt="支付宝赞赏码" width="220" />
</p>

<p align="center">微信赞赏 · 支付宝赞赏</p>

如果不想赞赏也没关系，给项目点个 **Star** 也是很好的支持。

---

## License

本项目暂未声明开源许可证，如需转载或商用请先联系作者。
