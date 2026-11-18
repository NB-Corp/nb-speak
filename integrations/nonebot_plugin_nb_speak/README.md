# nonebot-plugin-nb-speak

<div align="center">

[![NoneBot2](https://img.shields.io/badge/NoneBot2-2.2.0%2B-ea5252?style=flat-square)](https://nonebot.dev/)
[![Python](https://img.shields.io/badge/Python-3.10%2B-2d4b35?style=flat-square)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-2d4b35?style=flat-square)](LICENSE)

**全适配器通用的 NoneBot2 真人感短气泡分段与防 Markdown 破表插件（`nb-speak/1` + `chat-human`）**

</div>

加载后无需改动原有 LLM 对话插件业务代码，自动通过 `Bot.on_calling_api` 将机器人外发的 250 字长篇大论与裸 `|---|---|` 管道表格拆解为自然打字节奏的短气泡、手机端键值卡片与完整闭合代码块。

- **全适配器即插即用（`supported_adapters = None`）**：原生适配 **OneBot V11 / V12（NapCat / Lagrange / LLOneBot）**、**Telegram**、**飞书（Feishu）**、**QQ 官方**、**Discord** 与 **Satori**。
- **富媒体与引用精准保序**：自动识别 `Message` 对象、段数组 `list[dict]` 与 CQ 码字符串——将 `reply` / `@at` 严格保留在首条气泡（绝不在后续气泡重复引用刷屏），`image` / `record` / `video` 等富媒体段原样保序透传，飞书 `{"text": "..."}` JSON 信封逐条保持合法序列化。
- **协程级重入隔离与风控容错**：采用 `contextvars.ContextVar` 实现协程树级防重入（多群高并发同时发泡零串扰、零私有字段污染）；多泡投递中途若遇风控或网络超时，自动安全收束并返回已达回执，绝不抛出未捕获异常炸毁上层 Matcher。
- **纯文本开箱即稳**：语音条默认严格关闭（`nb_speak_enable_voice_notes = False`）；即使显式开启可选兼容 `/v1/audio/speech` 接口，超时（硬上限 `<= 8s`）或报错亦毫秒级静默退回纯文本发送。

## 安装

### 方式一：使用 `nb-cli` 安装（推荐）

```bash
nb plugin install nonebot-plugin-nb-speak
```

### 方式二：使用 `uv` / `pip` / `poetry` 安装

```bash
uv pip install nonebot-plugin-nb-speak
# 或
pip install nonebot-plugin-nb-speak
```

随后在项目的 `pyproject.toml` 中注册插件：

```toml
[tool.nonebot]
plugins = ["nonebot_plugin_nb_speak"]
```

或在入口文件手动加载：

```python
import nonebot

nonebot.init()
nonebot.load_plugin("nonebot_plugin_nb_speak")
```

## 配置项（`.env` / `.env.prod`）

所有配置项均可直接写入 `.env` 或 `.env.prod`，开箱默认即安全可用：

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `NB_SPEAK_ENABLED` | `bool` | `True` | 是否启用外发短气泡分段与裸管道表格转换 |
| `NB_SPEAK_PERSONA_PRESET` | `str` | `"neutral_peer"` | `get_chat_human_prompt()` 默认语气基线（`keep_host` · `neutral_peer` · `sharp_lead` · `warm_companion` · `calm_sre`） |
| `NB_SPEAK_PLATFORM_MODE` | `str` | `"auto"` | 表格转换策略：`auto`（QQ/微信/飞书转键值卡，TG/Discord 短表转等宽代码块）· `im_compact`（全转键值卡）· `markdown_code`（`<=40` 列等宽块） |
| `NB_SPEAK_MAX_BUBBLES` | `int` | `4` | 单轮文字短气泡上限（超出部分自动归并进末条文字气泡，绝不丢字；代码块与表格卡独立计列） |
| `NB_SPEAK_TARGET_CJK_CHARS` | `int` | `36` | 单条短气泡目标中文字数尺度 |
| `NB_SPEAK_PACED_DELIVERY` | `bool` | `True` | 是否按拟真打字节奏（`0.36s–2.1s`）逐条调用发送 API |
| `NB_SPEAK_SPEED_MULTIPLIER` | `float` | `1.0` | 打字间隔速度倍率（如 `2.0` 为两倍速） |
| `NB_SPEAK_ENABLE_VOICE_NOTES` | `bool` | `False` | **默认关闭。** 是否允许解析末尾 `<voice_note>` 并调用可选兼容 TTS |
| `NB_SPEAK_TTS_API_BASE` | `str` | `""` | 可选 OpenAI `/v1/audio/speech` 兼容地址（仅在 `NB_SPEAK_ENABLE_VOICE_NOTES=True` 时生效） |
| `NB_SPEAK_TTS_API_KEY` | `str` | `""` | 可选 TTS 接口鉴权密钥 |
| `NB_SPEAK_TTS_MODEL` | `str` | `"tts-1"` | 可选 TTS 模型名称 |
| `NB_SPEAK_TTS_VOICE` | `str` | `"alloy"` | 可选 TTS 音色标识 |
| `NB_SPEAK_TTS_TIMEOUT` | `float` | `4.0` | 可选 TTS 请求超时秒数（自动硬限幅 `<= 8.0s`，超时或异常静默退回纯文本） |

`.env.prod` 配置示例：

```dotenv
NB_SPEAK_ENABLED=true
NB_SPEAK_PLATFORM_MODE=auto
NB_SPEAK_MAX_BUBBLES=4
NB_SPEAK_PACED_DELIVERY=true
NB_SPEAK_ENABLE_VOICE_NOTES=false
```

## 效果对比（OneBot V11 / NapCat 群聊回复）

当上层插件执行 `await bot.send(event, raw_llm_reply, reply_message=True, at_sender=True)`：

- **原始大模型长文**：
  `（微笑）压测跑完了。\n\n| 节点 | QPS | 锁表 |\n|---|---|---|\n| 网关 | 4200 | 否 |\n\n```sql\nSELECT 1;\n```\n\n如有问题请随时告诉我！`
- **经 `nonebot-plugin-nb-speak` 拦截投递后**：
  1. **气泡 1（携带引用与 `@`）**：`[回复] @提问者 压测跑完了`
  2. **气泡 2（手机键值对比卡，不重复引用）**：`- 网关 — QPS: 4200 · 锁表: 否`
  3. **气泡 3（独立完整代码块，零切碎）**：
     ````text
     ```sql
     SELECT 1;
     ```
     ````

## 编程接口（供自定义 LLM 插件按需调用）

除自动外发拦截外，也可在自定义对话插件中注入 `chat-human` 系统层提示词或预览分泡计划：

```python
from nonebot import require

require("nonebot_plugin_nb_speak")
from nonebot_plugin_nb_speak import get_chat_human_prompt, plan_bot_reply

# 1. 获取可拼入 System Prompt 的静态口语物理规则（默认关闭语音条，对 Prefix Cache 友好）
system_addition = get_chat_human_prompt(persona_preset="keep_host", enable_voice_notes=False)

# 2. 离线计算任意平台下的分段与延迟计划
plan = plan_bot_reply("第一句结论。\n\n| 指标 | 数值 |\n|---|---|\n| p99 | 18ms |", adapter_name="OneBot V11")
```

## 支持适配器一览

| 适配器 | 识别名称 | 拦截字段与特化保护 |
| --- | --- | --- |
| `nonebot-adapter-onebot` (V11 / V12) | `OneBot V11` / `OneBot V12` | 支持 `Message`、`MessageSegment`、`list[dict]` 与 CQ 码字符串；首泡保留 `reply`/`at`，`image`/`record` 原样透传 |
| `nonebot-adapter-telegram` | `Telegram` | 窄表转 `<=40` 列等宽代码块，`reply_to_message_id` / `reply_parameters` 仅保留在首泡 |
| `nonebot-adapter-feishu` | `Feishu` | 自动解析并重封装 `msg_type="text"` 的 `{"text": "..."}` JSON 字符串 |
| `nonebot-adapter-qq` | `QQ` | 表格自动转手机键值卡，保留被动回复 `msg_id` 凭据并仅首泡携带 `message_reference` |
| `nonebot-adapter-discord` / `satori` | `Discord` / `Satori` | 自动按终端宽度切换等宽代码卡与键值卡 |

## 许可证

MIT
