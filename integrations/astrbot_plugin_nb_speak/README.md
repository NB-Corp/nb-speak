# `astrbot_plugin_nb_speak` — 让机器人像真人一样发短气泡（拒绝 150 字失效、碎代码块与裸表格）

面向 **AstrBot (`>= 4.16.0`)** 的零第三方依赖短气泡与重内容分离插件，支持 QQ（OneBot / 官方）、微信（`weixin_oc` / 企业微信）、Telegram、飞书、钉钉、Discord 与 Slack。

## 解决哪三个原生痛点？

| 常见翻车现场 | 原生 `segmented_reply` / 普通提示词 | 安装 `astrbot_plugin_nb_speak` 后 |
| --- | --- | --- |
| **回复超过 150 字瞬间变回一整坨长文**（`AstrBot#8614`） | 默认 `words_count_threshold: 150`，回复越长反而直接放弃分段 | **无上限断崖**：无论 40 字还是 450 字，均按句边界收束为 `1–4` 条拇指尺度短气泡（尾部超额自动合并，**绝不丢字**） |
| **正则把 ` ```python ` 代码块切成七八段碎片** | `.*?[。？！~…]+` 遇到代码注释句号或 URL `?` 直接劈开 | **占位符级保护**：先将完整代码块剥离为独立单条消息，再切分口语正文，保护小数点 `0.02%` 与 URL 不被误切 |
| **往 QQ / 微信气泡里裸吐 `\|---\|` 管道表格** | 手机聊天气泡不支持 GFM 表格，满屏竖线与横杠乱码 | **按平台智能转卡**：QQ/微信/飞书自动转为清爽 `- 条目 — 字段: 值` 手机键值卡；Telegram/Discord 短表自动对齐为 `<=40` 列等宽代码卡 |
| **改完提示词几轮后又复发“好的！1. 2. 希望对你有帮助。”** | 纯人设提示词随上下文增长迅速退化 | `on_llm_request` 注入缓存友好的 `chat-human` 口语物理层 + 发送前自动剥除 `（叹气）` 舞台括号、管家套话与短单句末尾句号 |

## 聊天小剧场（前后对比）

**你的提问**：「`orders` 表倒序分页慢到 4.2 秒，白天主库不能锁表，给我个方案对比和 SQL」

- **未安装时（单条 260 字长文 + 裸管道表格乱码）**：
  ```text
  好的！我来向你汇报排查方案（微笑）：
  | 方案 | 延迟 | 是否锁表 |
  |---|---|---|
  | 普通建索引 | 38ms | 是 |
  | CONCURRENTLY | 38ms | 否 |
  ```sql
  CREATE INDEX CONCURRENTLY idx_orders ON orders (created_at DESC);
  ```
  希望这对你有帮助！如有任何问题请随时告诉我。
  ```

- **启用 `astrbot_plugin_nb_speak` 后（按打字节奏依次送达）**：
  - **气泡 1**：`先别加机器，白天直接跑 CONCURRENTLY 建索引就行，读写不阻塞`
  - **气泡 2（手机键值对比卡）**：
    ```text
    - 普通建索引 — 延迟: 38ms · 是否锁表: 是
    - CONCURRENTLY — 延迟: 38ms · 是否锁表: 否
    ```
  - **气泡 3（完整独立代码卡，零切碎）**：
    ````text
    ```sql
    CREATE INDEX CONCURRENTLY idx_orders ON orders (created_at DESC);
    ```
    ````

## 安装方式

### 方式一：AstrBot 管理面板粘贴 URL 一键安装（推荐）

打开 **AstrBot 管理面板 → 插件管理 → 安装插件**，直接粘贴以下仓库地址安装：

```text
https://github.com/NB-Corp/astrbot_plugin_nb_speak
```

安装完成后插件与内置 `skills/chat-human/SKILL.md` 自动生效。

### 方式二：命令行一行拉取至 `AstrBot/data/plugins` 目录

```bash
git clone --depth 1 https://github.com/NB-Corp/astrbot_plugin_nb_speak <AstrBot>/data/plugins/astrbot_plugin_nb_speak
```

随后在 **AstrBot 管理面板 → 插件管理** 点击右上角重载即可生效。

## 关键默认配置（开箱安全）

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `persona_preset` | `keep_host` | **完全保留你在 AstrBot 配置的原有角色人设**，只修分段、句号与表格 |
| `platform_mode` | `auto` | QQ / 微信 / 飞书自动将表格转为键值列表；TG / Discord 短表转为等宽代码卡 |
| `max_bubbles` | `4` | 单轮文字短气泡上限（超出部分自动合并进末条气泡，绝不丢弃内容） |
| `enable_voice_notes` | `false` | **默认关闭语音条**，仅发送纯文字短气泡与代码/表格卡；按需开启后兼容任意 OpenAI `/v1/audio/speech` 接口，失败静默回退纯文字 |

## 本地运行测试

零外部重依赖，支持 `pytest` 与 Python 标准库 `unittest` 直接运行：

```bash
pytest integrations/astrbot_plugin_nb_speak/tests -v
```
