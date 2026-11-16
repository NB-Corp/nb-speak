<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-zh-dark.svg">
  <img src="docs/assets/banner-zh-light.svg" alt="nb-speak — 让 AI Agent 真正说人话" width="1200">
</picture>

**通用 `send_message` + `send_artifact` IM 短气泡协议、零依赖 OpenAI/SSE 桥接网关、DeepSeek Harness 插件、纸墨触感实时对比工作台与 `chat-human` Agent Skill。**

[![CI](https://img.shields.io/github/actions/workflow/status/NB-Corp/nb-speak/ci.yml?branch=main&style=flat-square&color=2d4b35)](https://github.com/NB-Corp/nb-speak/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-22.19%2B-2d4b35?style=flat-square)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.10%2B-2d4b35?style=flat-square)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-2d4b35?style=flat-square)](LICENSE)
[![Playground](https://img.shields.io/badge/playground-在线体验-2d4b35?style=flat-square)](https://nb-corp.github.io/nb-speak/zh/)

[在线同屏对比](https://nb-corp.github.io/nb-speak/zh/) · [30 秒快速开始](#快速开始) · [协议与流式契约](#协议载荷与-sse-流式契约) · [DSH 插件指南](#deepseek-harness-插件指南-nb-corpnb-speak-dsh) · [bubble_lint 规范](#确定性门禁-bubble_lint-8-大规则规范) · [集成配方](#实战集成配方) · [nb-im](https://github.com/NB-Corp/nb-im)

[English](README.md) · **简体中文**

</div>

今天主流的 AI 对话面板与 Agent 框架，仍然把每次回复当成单块 300 字 Markdown 论文倾倒进 `assistant.content`——把 SQL 与宽表格硬塞进狭窄手机气泡、反复套用「热情接球 + 逐条邀功汇报 + 催吃饭催睡觉」全能管家三件套、甚至在 TTS 语音条里把刚发的文字一字不差重新朗读一遍。

在 **NB-Corp** 工具矩阵中（[nb-search](https://github.com/NB-Corp/nb-search) 负责发现，[nb-extract](https://github.com/NB-Corp/nb-extract) 负责精读，[nb-hub](https://github.com/NB-Corp/nb-hub) 负责信号唤醒，[nb-im](https://github.com/NB-Corp/nb-im) 负责多平台会话路由），**`nb-speak`** 定义了 **AI Agent 如何真正像人类一样开口说话**：

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/workflow-zh-dark.svg">
  <img src="docs/assets/workflow-zh-light.svg" alt="任意大模型 / 框架 → nb-speak 双工具协议与桥接层 → bubble_lint 确定性门禁 → 真人感 IM 终端交付" width="1200">
</picture>
</p>

## 接入前后对比

| 真实场景 | 传统单块 `assistant.content` 输出 | 接入 `nb-speak` (`send_message` + `send_artifact`) |
| --- | --- | --- |
| **SRE 灰度放量确认** | **180 字风险说教墙**：「向你汇报灰度评估结论！但在推全量前请注意三点风险：1. 流量切面覆盖不足…… 2. 建议先推 50%…… \| 指标 \| 灰度 \|…… 请随时检阅！」 | **气泡 1** (`240ms`)：`错误率 0.02% 没动，p99 降到 38ms` <br>**气泡 2** (`980ms`)：`连接池水位也稳，直接推全量吧` <br>**独立制品卡片**：`auth-canary-25m.sql` <br>**末尾互补语音条** (`6s`)：*“大盘安安静静跑了快半小时。你那边点完发布就能收工下班啦。”* |
| **SQL 慢查询排查** | 气泡内嵌 `###` 标题 + 加粗列表墙 + 12 行折行错位的 SQL 代码块 + 「希望这对你有帮助！」 | **气泡 1**：`tenant_id 加 created_at 没建联合索引，420 万行全在内存硬排` <br>**气泡 2**：`不锁表建索引的 SQL 放卡片里了，直接主库跑就行` <br>**独立制品卡片**：`idx_orders_tenant_created.sql` |
| **第 3 次改需求** | `（叹气）频繁在上线前临时改视觉需求会影响效率！不过已按要求改回松针绿，请检阅。` | **气泡 1**：`第三回“真最后一版”推测试服了` <br>**气泡 2**：`松针绿换回去了，瞄一眼顺不顺眼` |

<p align="center">
  <a href="https://nb-corp.github.io/nb-speak/zh/">
    <img src="docs/assets/playground-preview-zh.png" alt="nb-speak 中文同屏对比工作台：传统单块输出 vs nb-speak 短气泡、SQL 卡片与 0 告警门禁" width="1100">
  </a>
</p>

## 快速开始

> **发布状态 (`v0.2.0`)**：仓库已内置预编译 ESM 产物 (`dist/`)，**零运行时 npm/pip 第三方依赖**。需要 **Node.js >= 22.19**（推荐 Node 24）；`skills/chat-human` 脚本仅依赖 **Python >= 3.10** 标准库。下方命令均已实机逐条验证。

### 1. 安装 `chat-human` Agent Skill（Codex、Claude Code、Kiki、Cursor）

```bash
npx skills add NB-Corp/nb-speak
# 或安装独立技能镜像仓：
npx skills add NB-Corp/chat-human
```

也可直接将 [`skills/chat-human`](skills/chat-human) 复制或软链接至 `~/.agents/skills/chat-human` 或 `~/.claude/skills/chat-human`。

### 2. 30 秒体验确定性门禁、长文拆解与本地 OpenAI/SSE 桥接网关

无需构建即可通过 `npx --yes github:NB-Corp/nb-speak` 直接运行，或克隆仓库本地执行：

```bash
git clone https://github.com/NB-Corp/nb-speak.git
cd nb-speak

# 1. 导出 OpenAI / Anthropic / Gemini 标准双工具 JSON Schema
node packages/core/bin/nb-speak.mjs tools --provider openai

# 2. 对外发气泡载荷执行确定性 bubble_lint 校验（0 告警返回退出码 0）
echo '{"bubbles":["错误率 0.02% 没动，p99 降到 38ms","连接池水位也稳，直接推全量吧"]}' \
  | node packages/core/bin/nb-speak.mjs lint --json

# 3. 将原始大模型 Markdown + SQL 长文自动归一化为短气泡与独立制品卡片
printf 'Bubble 1: 慢查询定位到了。\n\n```sql\n-- fix.sql\nSELECT 1;\n```\n\n直接跑迁移就行。\n' \
  | node packages/core/bin/nb-speak.mjs parse

# 4. 在 DeepSeek / OpenAI / 本地 llama-server 前启动零依赖桥接服务 (http://127.0.0.1:18090)
NB_SPEAK_API_KEY="sk-..." node packages/core/bin/nb-speak.mjs serve \
  --port 18090 \
  --upstream-url https://api.deepseek.com/v1 \
  --model deepseek-chat \
  --persona calm_sre
```

## 协议载荷与 SSE 流式契约

`@nb-corp/nb-speak` (`packages/core`) 从协议层把「手机拇指聊天的短节拍」与「代码/SQL/表格重内容」拆分为两个正交工具调用，兼容任意 OpenAI、DeepSeek、Anthropic Claude、Google Gemini 与本地 Gemma 模型。

### 1. `send_message` 与 `send_artifact` 线级 JSON 载荷示例

**`send_message`（1–4 条短气泡 + 可选末尾互补语音条 + 引用锚点）**：

```json
{
  "bubbles": [
    "错误率 0.02% 没动，p99 降到 38ms",
    "连接池水位也稳，直接推全量吧"
  ],
  "voice_note": {
    "text": "大盘安安静静跑了快半小时。你那边点完发布就能收工下班啦。",
    "emotion": "calm"
  },
  "reply_to": "msg_94810",
  "end_turn": true
}
```

**`send_artifact`（剥离代码、SQL、Diff 补丁或 Markdown 表格至独立卡片）**：

```json
{
  "title": "idx_orders_tenant_created.sql",
  "kind": "code",
  "language": "sql",
  "content": "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tenant_created\n  ON orders (tenant_id, created_at DESC)\n  WHERE deleted_at IS NULL;"
}
```

- **自然打字节拍推算 (`computeBubbleSchedule`)**：首条气泡固定 `240ms` 阅读反应延迟，后续气泡按 `190ms + 42ms × 汉字数 + 56ms × 英文词数 + 75ms × 停顿标点数` 推算拇指输入耗时（钳位在 `[360ms, 2100ms]`），输出逐条 `{ index, text, delayMs, typingDurationMs, cumulativeMs }`。
- **纯文本长文自动兜底 (`normalizeTurnOutput`)**：当上游模型未发起工具调用而直接吐出普通文本时，解析器自动抽离 ```` ```lang ```` 代码块与 `|---|` 管道表格转为 `artifacts`，按 `\n\n` 切分微节拍（保留快递柜号+取件码等双行复制单元），剥除泄漏的 `Bubble 1:` 前缀与短句句号，并将超过 4 泡或超长说明自动外置为 `markdown` 制品卡。

### 2. 流式 SSE 事件契约与标准 OpenAI `delta.content` 兼容模式

`nb-speak serve` 的 `POST /v1/chat/completions` 同时支持**结构化 IM 事件流**与**零改造 OpenAI 客户端兼容流**：

- **结构化事件模式**（请求头带 `x-nb-speak-events: structured` 或请求体带 `"speak_stream": true`）：抑制原始碎片化 JSON 块，直接按序推送带类型的 `nb.*` SSE 事件：

```text
event: nb.artifact
data: {"type":"nb.artifact","index":0,"artifact":{"title":"auth-canary-25m.sql","kind":"code","language":"sql","content":"SELECT ..."}}

event: nb.bubble
data: {"type":"nb.bubble","index":0,"text":"错误率 0.02% 没动，p99 降到 38ms","delayMs":240,"typingDurationMs":880,"cumulativeMs":240}

event: nb.bubble
data: {"type":"nb.bubble","index":1,"text":"连接池水位也稳，直接推全量吧","delayMs":786,"typingDurationMs":786,"cumulativeMs":1026}

event: nb.voice_note
data: {"type":"nb.voice_note","voice_note":{"text":"大盘安安静静跑了快半小时。你那边点完发布就能收工下班啦。","emotion":"calm"}}

event: nb.lint
data: {"type":"nb.lint","lint":{"ok":true,"issueCount":0,"errorCount":0,"warningCount":0,"stats":{"bubbleCount":2,"totalCjkChars":26,"totalEnWords":5,"hasVoiceNote":true,"ttsOverlap":0.04},"issues":[]}}

event: nb.done
data: {"type":"nb.done","turn":{"source":"tool_calls","bubbles":["..."],"artifacts":[...],"end_turn":true,"schedule":[...],"lint":{...}}}

data: [DONE]
```

- **标准 OpenAI 兼容模式**（默认不带 `x-nb-speak-events` 头）：流式请求原样透传上游标准 `data: {"choices":[{"delta":{"content":...}}]}` 增量帧并在流尾附带 `nb.*` 事件与 `data: [DONE]`；非流式请求（`stream: false`）保留完整 `choices[0].message` 并额外挂载顶层 `nb_speak` 归一化对象，因此现有 OpenAI SDK、`OpenWebUI` 与 `LobeChat` 无需改一行代码即可直连。

## DeepSeek Harness 插件指南 (`@nb-corp/nb-speak-dsh`)

[`packages/dsh-plugin`](packages/dsh-plugin) 为 DeepSeek Harness (`DSH`) 提供零侵入的 Cordis 插件与本地回环桥接（默认 `127.0.0.1:18091`），同时覆盖云端推理模型与专用语音小模型。

### 1. 安全安装、隔离沙箱验证与字节级可逆卸载

安装脚本 `install-dsh.mjs` **绝不读取或修改 `.credentials.yaml`**，落盘前会在 `<DSH_HOME>/.nb-speak-backup/<profile>.json` 记录原始快照：

```bash
# 1. 干跑预览改动清单（不写入任何文件）
node packages/dsh-plugin/scripts/install-dsh.mjs --dry-run --profile web

# 2. 在独立沙箱目录验证（不触碰默认 ~/.dsh 配置）
node packages/dsh-plugin/scripts/install-dsh.mjs --apply \
  --dsh-home .tmp/dsh-sandbox \
  --profile web \
  --runtime-mode skill \
  --preset calm_sre \
  --bridge-port 18091

# 3. 正式挂载至当前用户的 web profile
node packages/dsh-plugin/scripts/install-dsh.mjs --apply --profile web --runtime-mode skill

# 4. 一键无损卸载，按字节级快照还原 package.json 与 cordis.patch.yml
node packages/dsh-plugin/scripts/install-dsh.mjs --uninstall --profile web
```

### 2. 双运行模式：Mode A (`skill`) vs. Mode B (`voice-model`)

| 对比项 | Mode A：`skill`（标准云端/本地通用大模型） | Mode B：`voice-model`（Split-Phase / 4B 语音侧车） |
| --- | --- | --- |
| **适用上游模型** | `deepseek-v4.1-flash`、`deepseek-chat`、GPT、Claude、Gemini 等任意标准模型 | 专用分阶段模型或 `<0.8s` 4B 语音翻译侧车（`http://127.0.0.1:18088/v1`） |
| **协议注入机制** | 自动注入 `chat-human` 系统层与面向用户的 `send_message` / `send_artifact` 工具，并将返回的气泡与制品卡合成为 DSH 可读段落 | 将 5 轴连续风格权重编码为模型标签 `nb-speak-voice-v1\|w0,w1,w2,w3,w4`，通过 `BubbleStreamFormatter` 实时将口语单换行扩展为 `\n\n` 气泡段（代码块原样保留） |
| **推荐场景** | 零额外显卡成本，直接让主力工程 Agent 具备真人聊天体感 | 高频实时陪伴或需要连续 LoRA/Steering 混音控制的生产网关 |

### 3. 子代理 `send_message <-> agent_send_message` 防撞机制

DSH 内置的子代理编排系统本身注册了名为 `send_message` 的内部通信工具（用于向 worker 子代理派发指令）。若直接向模型暴露面向人类聊天的 `send_message({ bubbles })`，就会引发工具重名冲突。

`@nb-corp/nb-speak-dsh` (`src/tool-remap.ts`) 在每次请求进出桥接层时自动维护双向重映射表：
1. **发往上游模型前**：将 DSH 传入的子代理 `send_message` 工具定义及历史消息中的子代理 `tool_calls` 透明重命名为 `agent_send_message`（同时隔离 `send_artifact` -> `ext_send_artifact`、`send_code_or_doc` -> `ext_send_code_or_doc` 等保留名），再挂载面向人类的 `send_message({ bubbles })`。
2. **模型响应返回时**：面向人类的 `send_message` / `send_artifact` 由桥接层直接消费渲染为聊天气泡与制品卡；模型发出的 `agent_send_message` 则自动无损还原为 `send_message` 交回 DSH 子代理运行时执行。

### 4. 五轴连续风格权重预算与自定义 `SOUL.md`

插件支持预设档位（`neutral_peer`、`sharp_lead`、`warm_companion`、`calm_sre`）或 `preset: custom` 下的 5 轴连续混音，加上 `customSoul` 自定义 `SOUL.md` 语气覆盖：

| 权重轴 | 字段名 | 取值范围 | 默认值 (`neutral_peer`) | 作用说明 |
| --- | --- | --- | --- | --- |
| `w0` | `clarity` | `0.00 – 1.25` | `1.00` | 基底事实清晰度与结论直给强度（不参与滤镜上限缩放） |
| `w1` | `warmth` | `0.00 – 1.25` | `0.20` | 熟人接话温度与日常陪伴感 |
| `w2` | `sharp_wit` | `0.00 – 1.25` | `0.10` | 冷幽默、克制吐槽与去客套锋芒 |
| `w3` | `calm_grounding` | `0.00 – 1.25` | `0.20` | 值班排障与高压现场的沉稳兜底感 |
| `w4` | `concise_cadence` | `0.00 – 1.25` | `0.30` | 手机拇指打字的省主语与超短句偏置 |

- **`L1` 滤镜预算自动钳位**：当 `w1 + w2 + w3 + w4 > 1.15`（`BUDGET_LIMIT`）时，`computeEffectiveWeights()` 按比例等比缩放 `w1..w4` 使总和严格 `<= 1.15`，避免多风格叠加导致小模型语无伦次。

## 确定性门禁：`bubble_lint` 8 大规则规范

TypeScript 版 `lintTurn()` (`packages/core/src/lint.ts`) 与零依赖 Python 版 `skills/chat-human/scripts/bubble_lint.py` 保持 100% 规则同构，在 DeepSeek 与 GPT 多轮评测中实测达到 **`97.2%–100%` 零八股通过率**：

| # | 规则域 | 错误 / 告警码 | 级别 | 精确判定阈值与触发条件 |
| --- | --- | --- | --- | --- |
| 1 | **气泡数量与空载荷门禁** | `bubble.empty`<br>`bubble.too_many` | `error` | 无非空文字且无语音条时报错；`bubbles[]` 协议单轮上限 **`4` 条**（传统 `messages[]` 默认上限 **`3` 条**，可通过 `--max-bubbles` 覆盖）。 |
| 2 | **手机拇指阅读字数预算** | `bubble.over_cjk_budget`<br>`bubble.over_en_budget` | `warning` | 单轮全部气泡累计汉字 `> 55` 字（默认 `--max-cjk-chars 55`）或英文词数 `> 45` 词（默认 `--max-en-words 45`）时告警，提示精简或外置到 `send_artifact`。 |
| 3 | **气泡内禁混排 Markdown 结构墙** | `bubble.markdown_structure` | `error` | 气泡正文出现 `#` 标题、`|---|` 管道表格、```` ``` ```` 代码围栏、`- **加粗**：` 列表墙或 `1. ... 2. ...` 编号墙时直接拦截。 |
| 4 | **短句与取件码禁挂正式句号** | `style.trailing_period` | `warning` | 单子句短气泡（汉字 `<= 22` 且英文 `<= 6`，或纯英文 `<= 12` 词）以 `。` / `.` 结尾、4 位以上字母数字码后紧贴句号（如 `663920。`）、或 `>= 2` 条气泡每条都以句号结尾时告警。 |
| 5 | **禁剧本括号、管家腔与语气词刷屏** | `style.stage_brackets`<br>`style.steward_cliche`<br>`style.particle_spam` | `error` / `warning` | 出现 `*sighs*`、`（叹气）`、`（叉腰）` 等舞台括号报 `error`；出现 `向你汇报`、`请检阅`、`顺手替你`、`for your review`、`hope this helps` 报 `warning`；`>= 2` 条气泡中超过 `50%` 以 `啦` 结尾报 `warning`。 |
| 6 | **Emoji 策略与元数据/报错防泄漏** | `style.unicode_emoji`<br>`plain.meta_leak`<br>`style.placeholder_leak`<br>`style.system_error_leak` | `error` / `warning` | 默认 `--persona-emoji deny` 下出现 Unicode Emoji 报 `warning`；纯文本流裸露 `{"bubbles":...}` / `气泡1：`、未渲染的 `{{user}}` 占位符、或泄漏「语音合成插件未配置」等后端报错均报 `error`。 |
| 7 | **单轮单条末尾语音挂载约束** | `tts.batch_root_duplication`<br>`tts.multiple_clips`<br>`tts.not_on_final_bubble` | `error` / `warning` | 单轮超过 `1` 条语音或 `messages[]` 多泡批次顶层误挂 `tts`/`voice_mode` 报 `error`；语音条未挂在最后一条气泡上报 `warning`。 |
| 8 | **图文二元组去重与口语数字规范** | `tts.verbatim_overlap`<br>`tts.raw_path_or_url`<br>`tts.unnormalized_numbers` | `error` / `warning` | 语音文本与文字气泡的**有向字符二元组重合度 `> 50%`**（复读文字泡）报 `error`；语音含裸 URL 或文件路径报 `error`；含未转口语的小数或时间冒号（如 `19.9`、`14:30`）报 `warning`。 |

**CLI 退出码契约**（适用于 `nb-speak lint` 与 `bubble_lint.py`）：
- `0`：全部规则通过（`0` 错误、`0` 告警）
- `1`：命中至少 1 项门禁错误或告警
- `2`：命令行参数错误或输入 JSON 解析失败

## 实战集成配方

### 配方 1：配合 `@nb-corp/nb-im` 实现多平台带节奏分泡发送 + 末尾语音条

将 `normalizeTurnOutput()` 推算出的 `schedule` 直接接入 [`@nb-corp/nb-im`](https://github.com/NB-Corp/nb-im) 会话通道（飞书、Telegram、Slack、Discord、微信等），按真人打字节拍逐条投递：

```ts
import { setTimeout as sleep } from 'node:timers/promises';
import { normalizeTurnOutput } from '@nb-corp/nb-speak';

export async function deliverSpeakTurn(session, target, rawCompletion, synthesizeTts, abortSignal) {
  const turn = normalizeTurnOutput(rawCompletion, { cleanHygiene: true });

  // 1. 先投递独立代码 / SQL / 表格制品文件或卡片，保持气泡干净
  for (const art of turn.artifacts) {
    await session.send(
      {
        type: 'file',
        target,
        filename: art.title,
        bytes: new TextEncoder().encode(art.content),
        mime_type: 'text/plain; charset=utf-8',
      },
      abortSignal,
    );
  }

  // 2. 按 computeBubbleSchedule 推算出的自然拇指打字间隔逐条发送气泡
  for (const beat of turn.schedule) {
    await sleep(beat.delayMs, undefined, { signal: abortSignal });
    await session.send({ type: 'text', target, text: beat.text }, abortSignal);
  }

  // 3. 末尾挂载唯一一条非重复互补语音；TTS 不可用时静默降级不报错
  if (turn.voice_note && synthesizeTts) {
    try {
      const audioBytes = await synthesizeTts(turn.voice_note.text, turn.voice_note.emotion);
      await session.send(
        { type: 'voice', target, bytes: audioBytes, mime_type: 'audio/ogg; codecs=opus' },
        abortSignal,
      );
    } catch {
      // Layer 1 铁律：TTS 失败静默跳过，绝不向用户聊天窗吐出插件报错文本
    }
  }
}
```

### 配方 2：主力推理大模型 + 本地 4B 语音翻译侧车 (`--voice-sidecar-url`)

当上游接入不支持工具调用的纯推理端点或已有旧版 Agent 工作流时，可在本地 `llama-server` / vLLM 启动一个轻量化 4B 口语改写小模型，由 `nb-speak serve` 自动拦截纯文本草稿并完成 `<0.8s` 二阶段口语分泡归一化：

```bash
# 终端 1：启动本地 4B 语音翻译侧车（例如 llama-server OpenAI 兼容端口 18088）
llama-server -m ./models/voice-translator-4b-q4_k_m.gguf --port 18088

# 终端 2：启动 nb-speak 桥接网关，串联云端推理主模型与本地 4B 侧车
NB_SPEAK_API_KEY="sk-..." node packages/core/bin/nb-speak.mjs serve \
  --port 18090 \
  --upstream-url https://api.deepseek.com/v1 \
  --model deepseek-reasoner \
  --voice-sidecar-url http://127.0.0.1:18088/v1
```

## 可插拔人设架构：一套物理节奏，适配任意声音

`nb-speak` 绝不把你的 Agent 焊死成单一角色。Layer 1 负责全场景通用的手机发消息物理直觉，Layer 2 按严格优先级解析语气距离：

1. **当前轮用户显式指令**（例如*“帮我拟一条发给李总的微信，带握手表情”*）
2. **激活人设 / `SOUL.md` / 系统提示词**（内置 `neutral_peer` 平等技术搭档、`sharp_lead` 干练技术负责人、`warm_companion` 熟稔日常伙伴、`calm_sre` 沉稳值班 SRE，或挂载任意自定义 `SOUL.md`）
3. **会话场域上下文**（1v1 私聊 vs. 团队工作群）
4. **默认平等技术搭档基线**（干脆自然、零自作多情角色扮演、零 Emoji 轰炸、零卑微客服套话）

## 仓库目录与测试验证

```text
nb-speak/
├── packages/
│   ├── core/                # @nb-corp/nb-speak：双工具协议、流解析器、TS bubble_lint、HTTP/SSE 桥接与 CLI
│   └── dsh-plugin/          # @nb-corp/nb-speak-dsh：DSH 双模插件、子代理工具防撞重映射与可逆安装器
├── skills/
│   └── chat-human/          # 通用 chat-human 技能 (v0.2.0) + bubble_lint.py + proactive_gate.py
├── apps/
│   └── web/                 # 纸墨触感 IM 同屏对比工作台源码（同步构建至 docs/）
├── docs/                    # GitHub Pages 双语实时工作台、SEO 结构化数据与中英视觉资产
├── llms.txt                 # 面向生成式搜索引擎的精简索引 (llmstxt.org)
└── llms-full.txt            # 完整协议 Schema、定量指标、对比矩阵与高频工程问答
```

运行全量构建与单元验证套件（纯 Node.js + Python 标准库，零外部依赖）：

```bash
npm test
```

## 开源协议

[MIT](LICENSE) © 2026 NB-Corp
