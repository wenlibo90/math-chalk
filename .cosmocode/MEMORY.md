# 用户指令记忆

本文件记录了用户的指令、偏好和教导，用于在未来的交互中提供参考。

## 格式

### 用户指令条目
用户指令条目应遵循以下格式：

[用户指令摘要]
- Date: [YYYY-MM-DD]
- Context: [提及的场景或时间]
- Instructions:
  - [用户教导或指示的内容，逐行描述]

### 项目知识条目
Agent 在任务执行过程中发现的条目应遵循以下格式：

[项目知识摘要]
- Date: [YYYY-MM-DD]
- Context: Agent 在执行 [具体任务描述] 时发现
- Category: [运维部署|构建方法|测试方法|排错调试|工作流协作|环境配置]
- Instructions:
  - [具体的知识点，逐行描述]

## 去重策略
- 添加新条目前，检查是否存在相似或相同的指令
- 若发现重复，跳过新条目或与已有条目合并
- 合并时，更新上下文或日期信息
- 这有助于避免冗余条目，保持记忆文件整洁

## 条目

[可用视觉识别网关]
- Date: 2026-10-20
- Context: Agent 在执行「黑板方程 MATH CHALK」项目时发现
- Category: 环境配置
- Instructions:
  - 环境提供 OpenAI 兼容协议的大模型网关，地址/密钥/模型名分别来自环境变量 MCAI_LLM_BASE_URL、MCAI_LLM_API_KEY、MCAI_LLM_MODEL。
  - 当前模型（MCAI_LLM_MODEL）支持图片输入（vision），可直接用于手写/图像识别，无需自训练模型。
  - 调用方式：POST {MCAI_LLM_BASE_URL}/chat/completions，messages 中 content 传 [{type:"text"},{type:"image_url"}]。

[无系统字体时的测试图片生成]
- Date: 2026-10-20
- Context: Agent 在执行「黑板方程 MATH CHALK」项目时发现
- Category: 环境配置
- Instructions:
  - 本环境未安装系统字体（/usr/share/fonts 为空，apt 源也无 fonts-dejavu-core）。
  - 需要离线生成带文字的图片时，可复用 katex 包自带的 TTF 字体（node_modules/katex/dist/fonts/*.ttf），用 @napi-rs/canvas 的 GlobalFonts.registerFromPath 注册后 fillText。

[预览端口约定]
- Date: 2026-10-20
- Context: Agent 在执行「黑板方程 MATH CHALK」项目时发现
- Category: 运维部署
- Instructions:
  - 本项目为前端 + 后端双服务，预览只暴露前端 Vite 端口 5173；后端 3001 通过 Vite 的 /api 代理访问，不单独暴露。
  - 因此前端必须配置 host: 0.0.0.0、allowedHosts、以及 /api 反向代理，才能单端口预览。
