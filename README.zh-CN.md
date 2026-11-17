<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-zh-dark.svg">
  <img src="docs/assets/banner-zh-light.svg" alt="nb-speak — 别让你的 Personal Agent 把聊天窗当公文垃圾场" width="1200">
</picture>

**`humanizer` 去的是文章 AI 味；`chat-human` + `nb-speak` 治的是你的 Personal Agent（OpenClaw / AstrBot / Telegram / WhatsApp / 微信 / QQ / Claude Code）把聊天窗口当公文汇报和裸管道表格垃圾场。**

[![CI](https://img.shields.io/github/actions/workflow/status/NB-Corp/nb-speak/ci.yml?branch=main&style=flat-square&color=2d4b35)](https://github.com/NB-Corp/nb-speak/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-22.19%2B-2d4b35?style=flat-square)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3.10%2B-2d4b35?style=flat-square)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-2d4b35?style=flat-square)](LICENSE)
[![Playground](https://img.shields.io/badge/playground-在线交互试玩-2d4b35?style=flat-square)](https://nb-corp.github.io/nb-speak/zh/)

[**在线同屏对比舞台**](https://nb-corp.github.io/nb-speak/zh/) · [30 秒极速上手](#30-秒极速上手) · [OpenClaw & AstrBot 原生插件](#personal-agent-原生插件openclaw-与-astrbot) · [协议与 SSE 桥接](#架构流程与协议契约) · [bubble_lint 规范](#确定性门禁-bubble_lint-8-大规则规范) · [四大同题对决](#同一模型两种体感四大实测同题对决) · [llms.txt](llms.txt)

[English](README.md) · **简体中文**

</div>

常规文章级 Humanizer 只能润色长文。一旦你把大模型接进 **OpenClaw**、**AstrBot**、微信、QQ、Telegram、WhatsApp、飞书或 Discord，光在提示词里写 SOP 依然会反复破功——往手机窄屏里狂吐裸 `|---|---|` 管道表格（`openclaw#36323` 社区记录 15+ 次回归）、超过 150 字就放弃分段（`AstrBot#8614`）、正则把 ` ```sql ` 代码块切成七八段碎片、两句话能讲完的事非要甩出 250 字公文汇报墙。

在 **NB-Corp** 工具矩阵中（[nb-search](https://github.com/NB-Corp/nb-search) 发现、[nb-extract](https://github.com/NB-Corp/nb-extract) 精读、[nb-im](https://github.com/NB-Corp/nb-im) 路由），**`nb-speak`** 从 **Agent Skill、PA 发送前确定性门禁、双工具协议与静态 Linter** 四层联动赋予大模型真人手机聊天的物理节奏——**默认纯文字短气泡 + 独立代码/表格卡片（`enableVoiceNotes = false` 语音默认关闭，按需开启兼容通用 TTS）**。

<p align="center">
  <a href="https://nb-corp.github.io/nb-speak/zh/">
    <img src="docs/assets/playground-preview-zh.png" alt="nb-speak 在线同屏对比工作台：传统 250 字 Markdown 长文墙 vs 带节奏短气泡、独立 SQL 卡片与实时 bubble_lint 门禁" width="1160">
  </a>
</p>

<p align="center">
  <strong><a href="https://nb-corp.github.io/nb-speak/zh/">点此进入在线交互舞台：切换 5 大真实场景、直接粘贴长文测试拆解与实时 bubble_lint → nb-corp.github.io/nb-speak/zh/</a></strong>
</p>

## 30 秒极速上手

> **零外部运行时依赖 (`v0.2.0`)**：仓库内置预编译 ESM 产物 (`dist/`) 与纯 Python 标准库模块，仅需 **Node.js >= 22.19**（推荐 Node 24）与 **Python >= 3.10** 即可开箱运行。

### 1. `skills.sh` · Claude Code · Codex · Cursor（安装 `chat-human` 技能）

```bash
npx skills add NB-Corp/nb-speak --global --agent '*'
# 或安装独立技能镜像仓：
npx skills add NB-Corp/chat-human --global --agent '*'
```

### 2. OpenClaw 原生插件与外发格式化门禁 (`@nb-corp/nb-speak-openclaw`)

根治 `openclaw#36323`（Telegram / WhatsApp / Discord / Signal 裸 Markdown 管道表格错位、代码块粘连与上下文压缩后复发 250 字长文墙）：

```bash
# 零克隆一行挂载至 ~/.openclaw（先 dry-run 预览改动，再 apply 持久化生效）
npx --yes github:NB-Corp/nb-speak openclaw --dry-run
npx --yes github:NB-Corp/nb-speak openclaw --apply --preset neutral_peer

# 字节级无损还原卸载（全程绝不读取或修改凭据文件）
npx --yes github:NB-Corp/nb-speak openclaw --uninstall
```

### 3. AstrBot 原生插件：QQ · 微信 · Telegram · 飞书 (`astrbot_plugin_nb_speak`)

根治 `AstrBot#8614`（内置 `segmented_reply` 超过 150 字停止分段、正则误切代码块与 URL、往 QQ/微信气泡直吐裸 `|---|---|` 表格）：

```bash
# 方式 A（面板一键安装）：打开 AstrBot WebUI -> 插件管理 -> 安装插件，直接粘贴仓库地址：
#   https://github.com/NB-Corp/astrbot_plugin_nb_speak

# 方式 B（命令行零前置克隆）：一行拉取至 AstrBot 的 data/plugins 目录后在面板点击重载
git clone --depth 1 https://github.com/NB-Corp/astrbot_plugin_nb_speak <AstrBot>/data/plugins/astrbot_plugin_nb_speak
```

### 4. OpenAI / SSE 通用桥接网关、CLI 与其他客户端（OpenWebUI、LobeChat、`nb-im`、DSH）

```bash
# 1. 在 DeepSeek / OpenAI / 本地 llama-server 前启动零依赖桥接服务 (http://127.0.0.1:18090)
#    （默认纯文字短气泡 + 独立代码/表格卡，enableVoiceNotes = false）
NB_SPEAK_API_KEY="sk-..." npx --yes github:NB-Corp/nb-speak serve \
  --port 18090 \
  --upstream-url https://api.deepseek.com/v1 \
  --model deepseek-chat \
  --persona calm_sre

# 2. 对外发载荷执行确定性 bubble_lint 门禁校验（0 告警返回退出码 0）
echo '{"bubbles":["错误率 0.02% 没动，p99 降到 38ms","连接池水位也稳，直接推全量吧"]}' \
  | node packages/core/bin/nb-speak.mjs lint --json

# 3. 其他支持的客户端 —— 例如一键挂载至 DeepSeek Harness (DSH) WebUI：
npx --yes github:NB-Corp/nb-speak-dsh --apply --profile web
```

---

## Personal Agent 原生插件：OpenClaw 与 AstrBot

| 社区高频翻车痛点 | `@nb-corp/nb-speak-openclaw` ([`packages/openclaw-plugin`](packages/openclaw-plugin)) | `astrbot_plugin_nb_speak` ([`integrations/astrbot_plugin_nb_speak`](integrations/astrbot_plugin_nb_speak)) |
| --- | --- | --- |
| **手机窄屏裸 `\|---\|` 管道表格乱码** | `reply_payload_sending` + `message_sending` 双钩子门禁：在 `WhatsApp` / `Signal` / `WeChat` 或表宽 `>40` 列时自动转为清爽 **`- 条目 — 字段: 值` 键值卡**；`Telegram` / `Discord` 短表自动对齐为 `<=40` 列等宽代码卡。 | `on_decorating_result` 自动识别管道表格：在 `aiocqhttp` / `qq_official` / `weixin_oc` / `wecom` / `lark` 转为手机易读键值卡，在 `telegram` / `discord` 短表转为对齐等宽代码卡。 |
| **250 字公文墙 & 150 字分段断崖** | `before_prompt_build` 注入 `chat-human` 口语物理层并内置 `skills/chat-human/SKILL.md`；支持 `send_bubble` 通过 `toolContext.delivery?.send` 按打字间隔逐泡投递。 | 彻底解除原生 `words_count_threshold: 150` 限制：无论 40 字还是 500 字均按句边界收束为 `1–4` 条短气泡，首泡保留引用/`@`，末泡留驻 `result.chain`（网络抖动自动回退，**零丢消息风险**）。 |
| **代码块与链接被正则切碎** | 通过 `send_artifact` 或占位符保序抽离多行代码、SQL 与 Diff，绝不与口语气泡粘连。 | 先用占位符完整保护 ```` ```lang ```` 代码块、小数点 `0.02%` 与带 `?` 参数的 URL，再切分正文，代码块作为独立完整消息发出。 |
| **人设兼容与语音默认关闭** | 兼容自定义 `SOUL.md` 与 4 档预设；**默认 `enableVoiceNotes: false`**（按需开启后支持任意兼容 OpenAI `/v1/audio/speech` 的端点）。 | 默认 `persona_preset: "keep_host"`（**100% 保留 AstrBot 面板原有角色人设**）且 **`enable_voice_notes: false`**。 |

---

## 架构流程与协议契约

<p align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/workflow-zh-dark.svg">
  <img src="docs/assets/workflow-zh-light.svg" alt="任意大模型 / Personal Agent → nb-speak 双工具协议、PA 门禁与桥接层 → bubble_lint 确定性门禁 → 真人感 IM 终端交付" width="1200">
</picture>
</p>

### 1. `send_message` 与 `send_artifact` 线级 JSON 载荷 (`nb-speak/1`)

`@nb-corp/nb-speak` (`packages/core`) 从协议层把「手机拇指聊天的短节拍」与「代码/SQL/表格重内容」拆分为两个正交工具调用，兼容任意 OpenAI、DeepSeek、Anthropic Claude、Google Gemini 与本地 GGUF 模型。

**`send_message`（1–4 条短气泡 + 引用锚点；默认 `enableVoiceNotes: false` 不注入语音字段）**：

```json
{
  "bubbles": [
    "错误率 0.02% 没动，p99 降到 38ms",
    "连接池水位也稳，直接推全量吧"
  ],
  "reply_to": "msg_94810",
  "end_turn": true
}
```

**`send_artifact`（剥离代码、SQL、Diff 补丁或对比表格至独立卡片）**：

```json
{
  "title": "idx_orders_tenant_created.sql",
  "kind": "code",
  "language": "sql",
  "content": "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tenant_created\n  ON orders (tenant_id, created_at DESC)\n  WHERE deleted_at IS NULL;"
}
```

- **自然打字节拍推算 (`computeBubbleSchedule`)**：首条气泡固定 `240ms` 阅读反应延迟，后续气泡按 `190ms + 42ms × 汉字数 + 56ms × 英文词数 + 75ms × 停顿标点数` 推算拇指输入耗时（钳位在 `[360ms, 2100ms]`）。
- **纯文本长文自动兜底 (`normalizeTurnOutput`)**：当上游模型直接输出普通文本时，解析器自动抽离代码块与 `|---|` 管道表格转为 `artifacts`，按 `\n\n` 切分微节拍（保留快递柜号+取件码等双行复制单元），剥除 `Bubble 1:` 前缀与短句句号，并将超长说明外置为 `markdown` 制品卡。
- **跨后端中立的可选语音（默认关闭 `enableVoiceNotes: false`）**：全栈默认仅输出纯文字短气泡与代码/表格卡。显式传入 `--voice-notes` 或开启 `enableVoiceNotes: true` 后，仅允许在末条气泡附带 1 条互补口语补充（二元组重合度 `<50%`、数字转口语读法、失败静默降级），通用兼容任意 OpenAI `/v1/audio/speech` 语音端点（OpenAI、Qwen TTS、Fish、Kokoro、vLLM）、本地 JSON 桥接脚本或浏览器 Web Speech API。

### 2. 流式 SSE 事件契约与标准 OpenAI 兼容模式

`nb-speak serve` 的 `POST /v1/chat/completions` 同时支持**结构化 IM 事件流**（请求头带 `x-nb-speak-events: structured` 或请求体 `"speak_stream": true`，依次推送 `nb.artifact` → `nb.bubble` → `nb.lint` → `nb.done`）与**零改造 OpenAI 客户端兼容流**（原样透传 `delta.content` 并在流尾附带 `nb.*` 归一化帧）。

---

## 确定性门禁：`bubble_lint` 8 大规则规范

TypeScript 版 `lintTurn()` (`packages/core/src/lint.ts`) 与零依赖 Python 版 `skills/chat-human/scripts/bubble_lint.py` 保持 100% 规则同构，在 DeepSeek 与 GPT 多轮评测中实测达到 **`97.2%–100%` 零八股通过率**：

| # | 规则域 | 错误 / 告警码 | 级别 | 精确判定阈值与触发条件 |
| --- | --- | --- | --- | --- |
| 1 | **气泡数量与空载荷门禁** | `bubble.empty`<br>`bubble.too_many` | `error` | 无非空文字时报错；`bubbles[]` 协议单轮上限 **`4` 条**（传统 `messages[]` 默认上限 **`3` 条**，可通过 `--max-bubbles` 覆盖）。 |
| 2 | **手机拇指阅读字数预算** | `bubble.over_cjk_budget`<br>`bubble.over_en_budget` | `warning` | 单轮全部气泡累计汉字 `> 55` 字或英文词数 `> 45` 词时告警，提示精简或外置到 `send_artifact`。 |
| 3 | **气泡内禁混排 Markdown 结构墙** | `bubble.markdown_structure` | `error` | 气泡正文出现 `#` 标题、`\|---\|` 管道表格、```` ``` ```` 代码围栏、`- **加粗**：` 列表墙或 `1. ... 2. ...` 编号墙时直接拦截。 |
| 4 | **短句与取件码禁挂正式句号** | `style.trailing_period` | `warning` | 单子句短气泡以 `。` / `.` 结尾、4 位以上字母数字码后紧贴句号（如 `663920。`）、或 `>= 2` 条气泡每条都以句号结尾时告警。 |
| 5 | **禁剧本括号、管家腔与语气词刷屏** | `style.stage_brackets`<br>`style.steward_cliche`<br>`style.particle_spam` | `error` / `warning` | 出现 `*sighs*`、`（叹气）` 等舞台括号报 `error`；出现 `向你汇报`、`请检阅`、`顺手替你`、`希望这对你有帮助` 报 `warning`；超过 `50%` 气泡以 `啦` 结尾报 `warning`。 |
| 6 | **Emoji 策略与元数据/报错防泄漏** | `style.unicode_emoji`<br>`plain.meta_leak`<br>`style.placeholder_leak`<br>`style.system_error_leak` | `error` / `warning` | 默认 `--persona-emoji deny` 下出现 Unicode Emoji 报 `warning`；裸露 `{"bubbles":...}` / `气泡1：`、未渲染 `{{user}}` 或泄漏后端插件报错报 `error`。 |
| 7 | **可选语音单轮末尾挂载约束** | `tts.batch_root_duplication`<br>`tts.multiple_clips`<br>`tts.not_on_final_bubble` | `error` / `warning` | 开启可选语音时，单轮超过 `1` 条语音或顶层误挂 `tts` 报 `error`；未挂在末条气泡报 `warning`。 |
| 8 | **图文二元组去重与口语数字规范** | `tts.verbatim_overlap`<br>`tts.raw_path_or_url`<br>`tts.unnormalized_numbers` | `error` / `warning` | 可选语音与文字气泡的有向字符二元组重合度 `> 50%`（复读文字泡）或含裸 URL/路径报 `error`；含未转口语的小数或时间冒号报 `warning`。 |

---

## 同一模型、两种体感：四大实测同题对决

以下四组对比均由同一模型 **`cmd/deepseek-v4.1-flash`** 真实跑出（原生单块 `assistant.content` vs `nb-speak` 短气泡 + 独立制品卡片，零 Mock）：

| 真实实测场景 | 原生单块输出 (`assistant.content`) | 挂载 `nb-speak` (`send_bubble` + `send_artifact`) |
| --- | --- | --- |
| **1. 周五下班日常闲聊**<br>*“站在便利店冰柜前纠结吃啥，脑子已经转不动了”* | 甩出「一条铁律」+ **4 项加粗营养搭配清单**（关东煮/便当/三明治/泡面）+ 味觉钝化生理科普 + 管家式追问。 | **3 条松弛朋友短气泡**（`别纠结了，直接拿关东煮加一个饭团` / `热的、有咸味、碳水管饱，脑子不用参与` / `柜里没有的话报一下有啥，我秒选`），**零代码卡，彻底去 AI 味**。 |
| **2. 420 万行慢 SQL 救火**<br>*“orders 倒序分页飙到 4.2 秒，白天主库不能锁表，怎么救”* | 多级标题分段 + 编号排查清单 + 塞在聊天气泡里的长段 `EXPLAIN` SQL 代码围栏。 | **3 条平辈排障结论** + 可展开/一键复制的 **`orders-pagination-fix.sql`** 独立卡片。 |
| **3. 多文件工单看板修 Bug**<br>*“修双计时器泄漏 + 顶部实时 `MM:SS` + 松针绿呼吸点 + 筛选胶囊”* | **13/13 测试通过**，但改完 9 个文件后倾倒整屏逐文件改动邀功报告墙。 | **17/17 测试全绿（工程能力零折损）**，仅发 **4 条干脆气泡** + **`board.css`** 样式卡片。 |
| **4. 角色人设并发死锁抗压**<br>*自定义角色 `AGENTS.md`：第 1 轮暴雨忘带伞 -> 第 2 轮修死锁 Python LRU* | 第 1 轮维持口吻，**第 2 轮一碰并发代码瞬间破功**，退化为 10 段互斥锁原理讲义。 | **全程 100% 稳住手机短句人设与硬核交付**：自然短句回应 + 32 线程压测通过的 **`ttl_lru.py`** 卡片。 |

<details>
<summary><strong>其他支持的客户端：DeepSeek Harness (<code>@nb-corp/nb-speak-dsh</code>) 与实机同屏抓拍图</strong></summary>

<br>

[`packages/dsh-plugin`](packages/dsh-plugin)（独立仓库 [`NB-Corp/nb-speak-dsh`](https://github.com/NB-Corp/nb-speak-dsh)）为 DeepSeek Harness (`DSH`) 提供原生 `send_bubble`（`exec.concludeTurn()` 零子代理冲突）与 WebUI 圆角气泡/代码卡片前端扩展（默认 `enableVoiceNotes: false`）。

<p align="center">
  <img src="docs/assets/dsh-hero-showcase-zh.png" alt="原生单块长文输出 vs nb-speak 短气泡与一键复制 SQL 卡片同屏实拍" width="1100">
</p>

</details>

---

## 可插拔人设架构与 `@nb-corp/nb-im` 配方

Layer 1 负责全场景通用的手机发消息物理直觉，Layer 2 按严格优先级解析语气距离：
1. **当前轮用户显式指令**（例如*“帮我拟一条发给李总的微信，带握手表情”*）
2. **激活人设 / `SOUL.md` / AstrBot 或 OpenClaw 系统提示词**（内置 `neutral_peer`、`sharp_lead`、`warm_companion`、`calm_sre`，或任意自定义人设）
3. **会话场域上下文**（1v1 私聊 vs 团队工作群）
4. **默认平等技术搭档基线**（干脆自然、零自作多情角色扮演、零 Emoji 轰炸、零卑微客服套话）

```ts
import { setTimeout as sleep } from 'node:timers/promises';
import { normalizeTurnOutput } from '@nb-corp/nb-speak';

export async function deliverSpeakTurn(session, target, rawCompletion, abortSignal) {
  const turn = normalizeTurnOutput(rawCompletion, { cleanHygiene: true });

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

  for (const beat of turn.schedule) {
    await sleep(beat.delayMs, undefined, { signal: abortSignal });
    await session.send({ type: 'text', target, text: beat.text }, abortSignal);
  }
}
```

## 仓库目录与测试验证

```text
nb-speak/
├── packages/
│   ├── core/                        # @nb-corp/nb-speak：双工具协议、解析器、TS bubble_lint、HTTP/SSE 桥接与 CLI
│   ├── openclaw-plugin/             # @nb-corp/nb-speak-openclaw：OpenClaw 原生双工具、表格/长文门禁与无损安装器
│   └── dsh-plugin/                  # @nb-corp/nb-speak-dsh：DeepSeek Harness WebUI 气泡与代码卡片插件
├── integrations/
│   └── astrbot_plugin_nb_speak/     # AstrBot v4+ 原生 Star 插件（QQ/微信/TG/飞书）+ pytest 测试套件
├── skills/
│   └── chat-human/                  # 通用 chat-human 技能 (v0.2.0) + bubble_lint.py + proactive_gate.py
├── apps/
│   └── web/                         # 纸墨触感 IM 同屏对比工作台源码（构建同步至 docs/）
├── llms.txt                         # 面向生成式搜索引擎的精简索引 (llmstxt.org)
└── llms-full.txt                    # 完整协议 Schema、PA 插件矩阵、定量指标与工程问答
```

运行全量构建与单元验证套件（纯 Node.js + Python 标准库，零外部依赖）：

```bash
npm test
pytest integrations/astrbot_plugin_nb_speak/tests -v
```

## 开源协议

[MIT](LICENSE) © 2026 NB-Corp —— 适用于本仓库全部源码、协议 Schema、CLI 工具、OpenClaw/AstrBot/DSH 插件、`chat-human` 技能与文档。

**示例语音资产与 AI 标识说明**：[`apps/web/src/assets/audio/`](apps/web/src/assets/audio/NOTICE.txt)（同步至 `docs/assets/audio/`）中的静态 `.mp3` 示例语音条均为 AI 合成语音（未克隆任何自然人声纹），仅用于在线体验页演示可选语音胶囊；上游语音模型署名及条款见 [AI Demo Audio Notice](apps/web/src/assets/audio/NOTICE.txt)。
