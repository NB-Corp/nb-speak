# OpenWebUI Filter — NB Speak (`nb_speak_filter.py`)

Single-file OpenWebUI Function (`Filter`) that brings `chat-human` mobile rhythm and pipe-table cleanup to **OpenWebUI** without installing extra Python packages.

- **Multimodal & RAG safe**: Preserves `content: list[dict]` blocks (`image_url`, uploaded files, prompt-cache metadata) in both `inlet()` and `outlet()` without flattening arrays or dropping attachments.
- **WebUI single-bubble presentation**: Replaces raw `|---|---|` walls, `*sighs*` stage brackets, and `Hope this helps!` sign-offs with airy short paragraphs (`\n\n`), compact key-value cards, and intact syntax-highlighted code blocks—never injecting artificial dividers or corrupting closing ```` ``` ```` fences.
- **Admin `Valves` + per-user `UserValves`**: Administrators set workspace defaults while individual users toggle formatting or switch tone/table modes from the chat header.
- **Pure text by default**: `enable_voice_notes` defaults to `False`. Even when optional generic `/v1/audio/speech` synthesis is enabled, timeouts (`<= 8s` hard cap), `4xx/5xx` responses, or offline endpoints fall back immediately to pure text without dropping replies.

## Import into OpenWebUI

1. Open **OpenWebUI -> Workspace -> Functions -> + (New Function)**.
2. Paste [`nb_speak_filter.py`](./nb_speak_filter.py) (or upload the file) and click **Save**.
3. Toggle the function **On**, then enable **Global** (applies to all models) or enable it on specific models under **Workspace -> Models**.

## Before and After in OpenWebUI

**Raw model output:**

```markdown
*sighs* Bubble 1: ### Session Lock Comparison

Redis wins on sub-millisecond TTL leases.

| Engine | Lease Latency | Failover |
|---|---|---|
| Redis | 0.4ms | Sentinel |
| Postgres | 2.8ms | Native WAL |

```sql
SELECT pg_try_advisory_lock(42);
```

Hope this helps! Let me know if you need anything else!
```

**Formatted by `nb_speak_filter.py` (`table_mode="kv"`, default):**

````markdown
Redis wins on sub-millisecond TTL leases

- Redis — Lease Latency: 0.4ms · Failover: Sentinel
- Postgres — Lease Latency: 2.8ms · Failover: Native WAL

```sql
SELECT pg_try_advisory_lock(42);
```
````

## `Valves` (Admin) vs `UserValves` (Per-User)

Users can open **Chat Controls (top-right slider icon) -> Valves** to override personal settings without changing workspace defaults:

| Option | Scope | Default | Accepted Values & Behavior |
| --- | --- | --- | --- |
| `enabled` | `Valves` / `UserValves` | `True` / `None` | Master switch (`None` in `UserValves` inherits admin `Valves`). |
| `persona` | `Valves` / `UserValves` | `"neutral_peer"` / `"inherit"` | `neutral_peer` · `sharp_lead` · `warm_companion` · `calm_sre` · `keep_host` (`inherit` uses admin setting). |
| `custom_soul` | `Valves` | `""` | Custom tone line injected in `inlet()` when non-empty. |
| `inject_system_prompt` | `Valves` | `True` | Appends static `chat-human` guidance once per conversation (idempotent and prefix-cache friendly). |
| `clean_outlet_reply` | `Valves` | `True` | Cleans stage brackets, concierge tails, dense walls, and pipe tables in `outlet()`. |
| `table_mode` | `Valves` / `UserValves` | `"kv"` / `"inherit"` | `kv` (compact `- Row — Key: val` bullets) · `web_clean` (keeps `<=3`-col compact GFM tables, converts wide tables to KV cards) · `code` (`<=40`-col aligned monospace) · `off`. |
| `max_bubbles` | `Valves` / `UserValves` | `4` / `0` | Maximum conversational paragraphs per reply (`0` in `UserValves` inherits admin value; overflow merges into the last text paragraph without touching code fences). |
| `emit_status` | `Valves` | `False` | Emits a subtle `done` status event via `__event_emitter__` when `outlet()` formats a turn. |
| `enable_voice_notes` | `Valves` / `UserValves` | `False` / `None` | **Off by default.** Strips `<voice_note>` tags unless explicitly set to `True`. |
| `tts_api_base` | `Valves` | `""` | Optional OpenAI-compatible `/v1/audio/speech` base URL when `enable_voice_notes=True`. |
| `tts_timeout_sec` | `Valves` | `4.0` | Hard timeout clamped to `<= 8.0` seconds; any timeout or HTTP error degrades silently to pure text. |

## Multimodal & RAG Compatibility

When users attach screenshots, PDFs, or vision inputs, OpenWebUI sends `messages[i]["content"]` as `[{"type": "text", ...}, {"type": "image_url", ...}]`. `nb_speak_filter.py` inspects and rewrites only `"type": "text"` entries while forwarding `image_url`, audio, and RAG citation blocks untouched.

## Run Tests Locally

```bash
python -B -m unittest discover -s integrations/openwebui/tests -v
```
