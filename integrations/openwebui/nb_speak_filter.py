"""
title: NB Speak — Human IM Bubbles & Table Gate
author: NB-Corp
author_url: https://github.com/NB-Corp/nb-speak
funding_url: https://github.com/NB-Corp/nb-speak
version: 0.2.0
license: MIT
description: Stop LLMs from dumping raw Markdown pipe tables and 250-word essay walls in OpenWebUI. Preserves multimodal images/files, supports per-user UserValves, cleans stage brackets & concierge tails into airy short paragraphs, and keeps voice notes off by default.
"""

import asyncio
import base64
import concurrent.futures
import copy
import html
import json
import re
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

try:
    from pydantic import BaseModel, Field
except ImportError:  # pragma: no cover - zero-dep stdlib fallback

    class BaseModel:  # type: ignore[no-redef]
        def __init__(self, **kwargs: Any) -> None:
            for k, v in self.__class__.__dict__.items():
                if not k.startswith("_") and not callable(v):
                    setattr(self, k, v)
            for k, v in kwargs.items():
                setattr(self, k, v)

    def Field(default: Any = None, **_kwargs: Any) -> Any:  # type: ignore[misc]
        return default


PROMPT_MARKER = "[nb-speak/1 · chat-human]"
MAX_TTS_TIMEOUT_SEC = 8.0

PERSONA_BASELINES: Dict[str, str] = {
    "neutral_peer": "Speak as a sharp, grounded peer: lead with the verdict and concrete numbers, zero servile filler.",
    "sharp_lead": "Speak as a decisive tech lead: state pass/block immediately and cut hedging preambles.",
    "warm_companion": "Speak like a close friend texting on a phone: natural verbs and crisp beats, zero stage brackets.",
    "calm_sre": "Speak as a calm on-call SRE: metric, blast radius, next action in 1-2 short beats.",
}

STAGE_BRACKET_RE = re.compile(
    r"(?:\*[a-zA-Z][a-zA-Z\s\-]{1,28}\*|[（(](?:叹气|笑|微笑|苦笑|歪头|叉腰|双手叉腰|气鼓鼓|摸头|摸摸头|捂脸|扶额|耸肩|小声|轻声|皱眉|眨眼|挑眉|擦汗|深呼吸|sighs?|smiles?|laughs?|giggles?|tilts\s+head|shrugs?|whispers?|grins?|rolls\s+eyes)[）)])\s*",
    re.IGNORECASE,
)
BUBBLE_LABEL_RE = re.compile(r"^(?:Bubble|Beat|气泡)\s*[1-9]\s*[:：]\s*", re.IGNORECASE)
CONCIERGE_TAIL_RE = re.compile(
    r"(?:^|[\s~～]+|(?<=[。！？!?；;]))(?:希望(?:这)?(?:对您|对你)?有帮助[！!。.~～]*|如有(?:任何)?(?:需要|问题)(?:请)?随时告诉我[！!。.~～]*|请(?:随时)?检阅[！!。.~～]*|Let me know if you need anything(?:\s+else)?[!.]?|Hope this helps[!.]?|Feel free to ask if you have(?:\s+any)?\s+questions[!.]?)\s*$",
    re.IGNORECASE,
)
VOICE_NOTE_TAG_RE = re.compile(r"<voice_note>\s*([\s\S]*?)\s*</voice_note>", re.IGNORECASE)
FENCED_CODE_RE = re.compile(r"```([A-Za-z0-9_+\-]*)\n([\s\S]*?)```")
PIPE_TABLE_RE = re.compile(
    r"(?:^|\n)((?:\|[^\n]+\|[ \t]*\n)\|[ \t:\-|]+\|[ \t]*\n(?:\|[^\n]+\|[ \t]*(?:\n|$))+)"
)
TABLE_SEP_RE = re.compile(r"^:?-{2,}:?$")
CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
EN_WORD_RE = re.compile(r"[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?")
WIDE_CHAR_RE = re.compile(
    r"[\u1100-\u115f\u2e80-\u303e\u3040-\u33bf\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6]"
)
ABBREV_END_RE = re.compile(r"\b(?:etc|e\.g|i\.e|vs|mr|mrs|ms|dr|st|a\.m|p\.m)\.$", re.IGNORECASE)
SENTENCE_SPLIT_RE = re.compile(
    r"(?:https?://\S+|[^。！？；;\n!?.]|\.(?!\s+[A-Z0-9\"'])|!(?=\S)|\?(?=[A-Za-z0-9_=&/%#]))+(?:[。！？；;…~～]+|[.!?]+(?=\s+|$)|$)"
)
COMPACT_KV_LINE_RE = re.compile(r"^-\s+[^*#\n]{1,48}(?:\s*(?:[:：]|—)\s*[^*#\n]+)$")


class _EffectiveSettings:
    __slots__ = (
        "enabled",
        "persona",
        "custom_soul",
        "inject_system_prompt",
        "clean_outlet_reply",
        "table_mode",
        "max_bubbles",
        "emit_status",
        "enable_voice_notes",
        "tts_api_base",
        "tts_api_key",
        "tts_model",
        "tts_voice",
        "tts_timeout_sec",
    )

    def __init__(
        self,
        *,
        enabled: bool,
        persona: str,
        custom_soul: str,
        inject_system_prompt: bool,
        clean_outlet_reply: bool,
        table_mode: str,
        max_bubbles: int,
        emit_status: bool,
        enable_voice_notes: bool,
        tts_api_base: str,
        tts_api_key: str,
        tts_model: str,
        tts_voice: str,
        tts_timeout_sec: float,
    ) -> None:
        self.enabled = enabled
        self.persona = persona
        self.custom_soul = custom_soul
        self.inject_system_prompt = inject_system_prompt
        self.clean_outlet_reply = clean_outlet_reply
        self.table_mode = table_mode
        self.max_bubbles = max_bubbles
        self.emit_status = emit_status
        self.enable_voice_notes = enable_voice_notes
        self.tts_api_base = tts_api_base
        self.tts_api_key = tts_api_key
        self.tts_model = tts_model
        self.tts_voice = tts_voice
        self.tts_timeout_sec = tts_timeout_sec


def _count_units(text: str) -> Tuple[int, int]:
    cjk = len(CJK_RE.findall(text))
    en = len(EN_WORD_RE.findall(CJK_RE.sub(" ", text)))
    return cjk, en


def _display_width(text: str) -> int:
    return len(text) + len(WIDE_CHAR_RE.findall(text))


def _split_pipe_row(line: str) -> List[str]:
    trimmed = line.strip().removeprefix("|").removesuffix("|")
    return [re.sub(r"\*\*([^*]+)\*\*", r"\1", c.strip()) for c in re.split(r"(?<!\\)\|", trimmed)]


def _convert_pipe_table(block: str, mode: str, max_width: int = 40) -> str:
    if mode == "off":
        return block.strip()
    lines = [ln.strip() for ln in block.replace("\r\n", "\n").split("\n") if ln.strip()]
    if len(lines) < 3 or "|" not in lines[0] or "|" not in lines[1]:
        return block.strip()
    headers = _split_pipe_row(lines[0])
    sep = _split_pipe_row(lines[1])
    if not headers or not sep or not all(TABLE_SEP_RE.match(c) for c in sep):
        return block.strip()
    rows: List[List[str]] = []
    for ln in lines[2:]:
        if "|" not in ln:
            continue
        cells = _split_pipe_row(ln)
        if len(cells) < len(headers):
            cells.extend([""] * (len(headers) - len(cells)))
        row = cells[: len(headers)]
        if any(cell for cell in row):
            rows.append(row)
    if not rows:
        return block.strip()

    def as_kv() -> str:
        out: List[str] = []
        for r in rows:
            lead = r[0] or "-"
            if len(headers) == 1:
                out.append(f"- {lead}")
            elif len(headers) == 2:
                out.append(f"- {lead}: {r[1]}".rstrip(": "))
            else:
                pairs = [f"{headers[i]}: {r[i]}" for i in range(1, len(headers)) if r[i]]
                out.append(f"- {lead} — {' · '.join(pairs)}" if pairs else f"- {lead}")
        return "\n".join(out)

    if mode == "kv":
        return as_kv()

    widths = [max([max(1, _display_width(h))] + [_display_width(r[i]) for r in rows]) for i, h in enumerate(headers)]
    total_width = sum(widths) + (2 * max(0, len(headers) - 1))

    if mode == "web_clean":
        if len(headers) <= 3 and total_width <= 44:
            header_md = "| " + " | ".join(headers) + " |"
            sep_md = "| " + " | ".join("---" for _ in headers) + " |"
            body_md = ["| " + " | ".join(r[i] for i in range(len(headers))) + " |" for r in rows]
            return "\n".join([header_md, sep_md, *body_md])
        return as_kv()

    pad = lambda v, w: v + (" " * max(0, w - _display_width(v)))
    ascii_lines = [
        "  ".join(pad(h, widths[i]) for i, h in enumerate(headers)).rstrip(),
        "  ".join("-" * w for w in widths),
        *["  ".join(pad(r[i], widths[i]) for i in range(len(headers))).rstrip() for r in rows],
    ]
    if max(_display_width(ln) for ln in ascii_lines) > max_width:
        return as_kv()
    return "```text\n" + "\n".join(ascii_lines) + "\n```"


def _clean_beat(raw: str) -> str:
    s = raw.replace("\r\n", "\n").strip()
    if not s:
        return ""
    s = STAGE_BRACKET_RE.sub("", s).strip()
    s = BUBBLE_LABEL_RE.sub("", s).strip()
    s = CONCIERGE_TAIL_RE.sub("", s).strip()
    s = re.sub(r"(?m)^\s*#{1,6}\s+", "", s)
    s = re.sub(r"(?m)^\s*[-*]\s+\*\*([^*\n:：]+)\*\*\s*[:：]\s*", r"\1: ", s)
    s = re.sub(r"\*\*([^*\n]+)\*\*", r"\1", s).strip()
    if not s:
        return ""
    if re.search(r"[A-Za-z0-9]{4,}[。.]$", s):
        return s[:-1].strip()
    cjk, en = _count_units(s)
    if not re.search(r"[。！？!?；;\n]", s[:-1]):
        if s.endswith("。") and 0 < cjk <= 24 and en <= 6:
            return s[:-1].strip()
        if s.endswith(".") and not s.endswith("..") and not ABBREV_END_RE.search(s) and cjk == 0 and 0 < en <= 12:
            return s[:-1].strip()
    return s


def _split_dense_paragraph(paragraph: str) -> List[str]:
    trimmed = paragraph.strip()
    if not trimmed:
        return []
    lines = [ln.strip() for ln in trimmed.split("\n") if ln.strip()]
    if lines and all(COMPACT_KV_LINE_RE.match(ln) for ln in lines):
        return ["\n".join(lines)]
    if len(lines) == 2:
        cjk, en = _count_units(trimmed)
        if cjk <= 38 and en <= 26 and not re.match(r"^(?:[-*•]|\d+[.)])\s+", lines[0]):
            return ["\n".join(lines)]
    if len(lines) > 1 and all(re.match(r"^(?:[-*•]|\d+[.)])\s+", ln) for ln in lines):
        return [re.sub(r"^(?:[-*•]|\d+[.)])\s+", "", ln).strip() for ln in lines if ln.strip()]

    cjk_total, en_total = _count_units(trimmed)
    if cjk_total <= 42 and en_total <= 30:
        return [trimmed]

    pieces = [m.group(0).strip() for m in SENTENCE_SPLIT_RE.finditer(trimmed) if m.group(0).strip()]
    if not pieces:
        return [trimmed]
    beats: List[str] = []
    buf = ""
    for piece in pieces:
        if not buf:
            buf = piece
            continue
        sep = "" if re.search(r"[\u4e00-\u9fff。！？；，]$", buf) else " "
        merged = f"{buf}{sep}{piece}"
        mc, me = _count_units(merged)
        if mc <= 40 and me <= 28:
            buf = merged
        else:
            beats.append(buf)
            buf = piece
    if buf:
        beats.append(buf)
    return beats


def _content_contains_marker(content: Any, marker: str) -> bool:
    if isinstance(content, str):
        return marker in content
    if isinstance(content, list):
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text":
                if marker in str(part.get("text") or ""):
                    return True
    return False


def _clamp_tts_timeout(raw_timeout: Any) -> float:
    try:
        val = float(raw_timeout)
    except (TypeError, ValueError):
        val = 4.0
    if val <= 0:
        val = 4.0
    return max(0.2, min(MAX_TTS_TIMEOUT_SEC, val))


def _synthesize_tts_data_uri(
    text: str,
    *,
    api_base: str,
    api_key: str,
    model: str,
    voice: str,
    timeout_sec: float,
) -> Optional[str]:
    clean_base = (api_base or "").strip().rstrip("/")
    if not clean_base or not text.strip():
        return None
    if clean_base.endswith("/audio/speech"):
        endpoint = clean_base
    elif clean_base.endswith("/v1"):
        endpoint = f"{clean_base}/audio/speech"
    else:
        endpoint = f"{clean_base}/v1/audio/speech"

    clamped_timeout = _clamp_tts_timeout(timeout_sec)
    payload = json.dumps(
        {
            "model": model or "tts-1",
            "voice": voice or "alloy",
            "input": text.strip(),
            "response_format": "wav",
        }
    ).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    def _do_request() -> Optional[bytes]:
        req = urllib.request.Request(endpoint, data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=clamped_timeout) as resp:
            if resp.status < 200 or resp.status >= 300:
                return None
            return resp.read(8 * 1024 * 1024)

    pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    future = pool.submit(_do_request)
    try:
        audio_bytes = future.result(timeout=clamped_timeout)
    except Exception:
        return None
    finally:
        pool.shutdown(wait=False, cancel_futures=True)

    if not audio_bytes:
        return None
    b64 = base64.b64encode(audio_bytes).decode("ascii")
    return f"data:audio/wav;base64,{b64}"


def _emit_status_nonblocking(emitter: Any, description: str) -> None:
    if not callable(emitter):
        return
    event_payload = {
        "type": "status",
        "data": {"description": description, "done": True},
    }
    try:
        maybe_coro = emitter(event_payload)
        if asyncio.iscoroutine(maybe_coro):
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(maybe_coro)
            except RuntimeError:
                maybe_coro.close()
    except Exception:
        pass


class Filter:
    """OpenWebUI Inlet/Outlet Filter for NB Speak & chat-human."""

    class Valves(BaseModel):
        priority: int = Field(default=0, description="Filter execution priority.")
        enabled: bool = Field(default=True, description="Enable NB Speak inlet prompt & outlet formatting.")
        persona: str = Field(
            default="neutral_peer",
            description="Tone baseline: neutral_peer | sharp_lead | warm_companion | calm_sre | keep_host.",
        )
        custom_soul: str = Field(default="", description="Optional custom persona guidance.")
        inject_system_prompt: bool = Field(default=True, description="Inject chat-human mobile IM physics in inlet().")
        clean_outlet_reply: bool = Field(
            default=True,
            description="Strip stage brackets, concierge sign-offs, and format raw pipe tables in outlet().",
        )
        table_mode: str = Field(
            default="kv",
            description="Table rendering mode: kv (compact key-value cards), web_clean (keep <=3-col GFM tables, convert wide tables), code (<=40-col monospace), or off.",
        )
        max_bubbles: int = Field(default=4, description="Maximum short conversational paragraphs per reply.")
        emit_status: bool = Field(
            default=False,
            description="Emit a subtle completion status badge in OpenWebUI when outlet() formats a reply.",
        )
        enable_voice_notes: bool = Field(
            default=False,
            description="Enable optional <voice_note> prompt & synthesis (strictly disabled by default).",
        )
        tts_api_base: str = Field(
            default="",
            description="Optional OpenAI-compatible /v1/audio/speech URL when enable_voice_notes=True.",
        )
        tts_api_key: str = Field(default="", description="Optional Bearer token for TTS endpoint.")
        tts_model: str = Field(default="tts-1", description="Optional TTS model ID.")
        tts_voice: str = Field(default="alloy", description="Optional TTS voice ID.")
        tts_timeout_sec: float = Field(
            default=4.0,
            description="Hard timeout in seconds for optional TTS (clamped <= 8.0s; falls back to pure text on failure).",
        )

    class UserValves(BaseModel):
        enabled: Optional[bool] = Field(
            default=None,
            description="Per-user toggle (None = inherit admin Valves).",
        )
        persona: str = Field(
            default="inherit",
            description="Per-user tone override: inherit | neutral_peer | sharp_lead | warm_companion | calm_sre | keep_host.",
        )
        table_mode: str = Field(
            default="inherit",
            description="Per-user table mode: inherit | kv | web_clean | code | off.",
        )
        max_bubbles: int = Field(
            default=0,
            description="Per-user max paragraphs per reply (0 = inherit admin Valves).",
        )
        enable_voice_notes: Optional[bool] = Field(
            default=None,
            description="Per-user optional voice-note toggle (None = inherit admin Valves; False by default).",
        )

    def __init__(self) -> None:
        self.valves = self.Valves()

    def _resolve_settings(self, user: Optional[dict]) -> _EffectiveSettings:
        uv: Any = user.get("valves") if isinstance(user, dict) else None

        def _uv_get(key: str) -> Any:
            if uv is None:
                return None
            if isinstance(uv, dict):
                return uv.get(key)
            return getattr(uv, key, None)

        uv_enabled = _uv_get("enabled")
        enabled = bool(self.valves.enabled) if uv_enabled is None else bool(uv_enabled)

        uv_persona = str(_uv_get("persona") or "").strip()
        persona = uv_persona if uv_persona and uv_persona != "inherit" else str(self.valves.persona or "neutral_peer")

        uv_table = str(_uv_get("table_mode") or "").strip().lower()
        table_mode = (
            uv_table
            if uv_table in ("kv", "web_clean", "code", "off")
            else str(self.valves.table_mode or "kv").strip().lower()
        )

        try:
            uv_max = int(_uv_get("max_bubbles") or 0)
        except (TypeError, ValueError):
            uv_max = 0
        base_max = int(self.valves.max_bubbles or 4)
        max_bubbles = max(1, uv_max if uv_max > 0 else base_max)

        uv_voice = _uv_get("enable_voice_notes")
        enable_voice_notes = (
            bool(self.valves.enable_voice_notes is True) if uv_voice is None else bool(uv_voice is True)
        )

        return _EffectiveSettings(
            enabled=enabled,
            persona=persona,
            custom_soul=str(self.valves.custom_soul or "").strip(),
            inject_system_prompt=bool(self.valves.inject_system_prompt),
            clean_outlet_reply=bool(self.valves.clean_outlet_reply),
            table_mode=table_mode,
            max_bubbles=max_bubbles,
            emit_status=bool(getattr(self.valves, "emit_status", False)),
            enable_voice_notes=enable_voice_notes,
            tts_api_base=str(getattr(self.valves, "tts_api_base", "") or "").strip(),
            tts_api_key=str(getattr(self.valves, "tts_api_key", "") or "").strip(),
            tts_model=str(getattr(self.valves, "tts_model", "tts-1") or "tts-1").strip(),
            tts_voice=str(getattr(self.valves, "tts_voice", "alloy") or "alloy").strip(),
            tts_timeout_sec=_clamp_tts_timeout(getattr(self.valves, "tts_timeout_sec", 4.0)),
        )

    def _build_system_block(self, cfg: _EffectiveSettings) -> str:
        lines = [
            PROMPT_MARKER,
            "- Reply in 1-2 short, airy conversational paragraphs separated by a blank line (`\\n\\n`), never 250-word essay walls.",
            "- Avoid wide Markdown pipe tables (`|---|---|`) inside conversational beats; summarize comparisons as compact `- Item — Key: val` bullets and keep code inside fenced blocks.",
            "- Omit trailing periods (`.` / `。`) on short single-clause beats and after copyable codes; never output `*sighs*` / `（叹气）` stage brackets or `Hope this helps!` concierge tails.",
        ]
        if cfg.enable_voice_notes:
            lines.append(
                "- Optional spoken aside may be placed once at the end inside `<voice_note>...</voice_note>` without repeating the text paragraphs."
            )
        soul = cfg.custom_soul or PERSONA_BASELINES.get(cfg.persona, "")
        if soul:
            lines.append(f"- Active tone baseline: {soul}")
        return "\n".join(lines)

    def _format_text_segment(self, raw_text: str, cfg: _EffectiveSettings) -> Tuple[str, bool]:
        if not raw_text or not raw_text.strip():
            return raw_text, False

        original_norm = raw_text.replace("\r\n", "\n").strip()
        working = original_norm

        voice_note_text: Optional[str] = None

        def _capture_voice(match: re.Match[str]) -> str:
            nonlocal voice_note_text
            captured = (match.group(1) or "").strip()
            if cfg.enable_voice_notes and captured and voice_note_text is None:
                voice_note_text = captured
            return ""

        working = VOICE_NOTE_TAG_RE.sub(_capture_voice, working).strip()

        cards: List[str] = []

        def shield_code(match: re.Match[str]) -> str:
            lang = (match.group(1) or "").strip()
            code_body = (match.group(2) or "").rstrip("\n")
            if not code_body.strip():
                return ""
            idx = len(cards)
            if lang in ("", "markdown", "md") and cfg.table_mode != "off" and "|" in code_body:
                converted = _convert_pipe_table(code_body, cfg.table_mode)
                if converted != code_body.strip():
                    cards.append(converted)
                    return f"\n\n@@NB_OWUI_CARD_{idx}@@\n\n"
            cards.append(f"```{lang}\n{code_body}\n```")
            return f"\n\n@@NB_OWUI_CARD_{idx}@@\n\n"

        working = FENCED_CODE_RE.sub(shield_code, working)

        if cfg.table_mode != "off":

            def shield_table(match: re.Match[str]) -> str:
                tbl = match.group(1).strip()
                if not tbl:
                    return "\n\n"
                idx = len(cards)
                cards.append(_convert_pipe_table(tbl, cfg.table_mode))
                return f"\n\n@@NB_OWUI_CARD_{idx}@@\n\n"

            working = PIPE_TABLE_RE.sub(shield_table, working)

        token_re = re.compile(r"@@NB_OWUI_CARD_(\d+)@@")
        tokens: List[Tuple[str, str]] = []

        def _append_prose_chunk(chunk_text: str) -> None:
            for para in re.split(r"\n\s*\n+", chunk_text):
                for raw_beat in _split_dense_paragraph(para):
                    if COMPACT_KV_LINE_RE.match(raw_beat.split("\n", 1)[0].strip()):
                        tokens.append(("card", raw_beat))
                        continue
                    cleaned = _clean_beat(raw_beat)
                    if cleaned:
                        tokens.append(("beat", cleaned))

        pos = 0
        for m in token_re.finditer(working):
            chunk = working[pos : m.start()].strip()
            if chunk:
                _append_prose_chunk(chunk)
            c_idx = int(m.group(1))
            if 0 <= c_idx < len(cards):
                tokens.append(("card", cards[c_idx]))
            pos = m.end()

        tail = working[pos:].strip()
        if tail:
            _append_prose_chunk(tail)

        # Enforce max_bubbles strictly across conversational ("beat") items without ever corrupting code/table cards
        beat_positions = [idx for idx, (kind, _) in enumerate(tokens) if kind == "beat"]
        if len(beat_positions) > cfg.max_bubbles:
            keep_positions = set(beat_positions[: cfg.max_bubbles - 1])
            anchor_pos = beat_positions[cfg.max_bubbles - 1]
            merged_beat = "；".join(tokens[idx][1] for idx in beat_positions[cfg.max_bubbles - 1 :])
            consolidated: List[Tuple[str, str]] = []
            for idx, item in enumerate(tokens):
                if item[0] != "beat" or idx in keep_positions:
                    consolidated.append(item)
                elif idx == anchor_pos:
                    consolidated.append(("beat", merged_beat))
            tokens = consolidated

        out_blocks = [txt for _, txt in tokens if txt]

        if cfg.enable_voice_notes and voice_note_text:
            audio_uri = _synthesize_tts_data_uri(
                voice_note_text,
                api_base=cfg.tts_api_base,
                api_key=cfg.tts_api_key,
                model=cfg.tts_model,
                voice=cfg.tts_voice,
                timeout_sec=cfg.tts_timeout_sec,
            )
            if audio_uri:
                safe_caption = html.escape(voice_note_text)
                out_blocks.append(f'<audio controls src="{audio_uri}" title="{safe_caption}"></audio>')
            elif not out_blocks:
                # Lossless fallback if reply contained only a <voice_note> and TTS was unreachable/unset
                out_blocks.append(_clean_beat(voice_note_text) or voice_note_text)

        if not out_blocks:
            return raw_text, False

        rendered = "\n\n".join(out_blocks)
        return rendered, rendered != original_norm

    def inlet(
        self,
        body: dict,
        __user__: Optional[dict] = None,
        __event_emitter__: Optional[Any] = None,
    ) -> dict:
        cfg = self._resolve_settings(__user__)
        if not cfg.enabled or not cfg.inject_system_prompt:
            return body
        messages = body.get("messages")
        if not isinstance(messages, list):
            return body

        for msg in messages:
            if isinstance(msg, dict) and _content_contains_marker(msg.get("content"), PROMPT_MARKER):
                return body

        next_body = copy.copy(body)
        next_messages = [dict(m) if isinstance(m, dict) else m for m in messages]
        block = self._build_system_block(cfg)

        if next_messages and isinstance(next_messages[0], dict) and next_messages[0].get("role") == "system":
            sys_content = next_messages[0].get("content")
            if isinstance(sys_content, list):
                copied_parts = [dict(p) if isinstance(p, dict) else p for p in sys_content]
                copied_parts.append({"type": "text", "text": block})
                next_messages[0]["content"] = copied_parts
            else:
                existing = str(sys_content or "").rstrip()
                next_messages[0]["content"] = f"{existing}\n\n{block}" if existing else block
        else:
            next_messages.insert(0, {"role": "system", "content": block})

        next_body["messages"] = next_messages
        return next_body

    def outlet(
        self,
        body: dict,
        __user__: Optional[dict] = None,
        __event_emitter__: Optional[Any] = None,
    ) -> dict:
        cfg = self._resolve_settings(__user__)
        if not cfg.enabled or not cfg.clean_outlet_reply:
            return body
        messages = body.get("messages")
        if not isinstance(messages, list) or not messages:
            return body
        last = messages[-1]
        if not isinstance(last, dict) or last.get("role") != "assistant":
            return body

        content = last.get("content")
        changed_any = False
        updated_content: Any = content

        if isinstance(content, str):
            if not content.strip():
                return body
            updated_content, changed_any = self._format_text_segment(content, cfg)
        elif isinstance(content, list):
            new_parts: List[Any] = []
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text" and isinstance(part.get("text"), str):
                    cleaned_text, part_changed = self._format_text_segment(part["text"], cfg)
                    if part_changed:
                        changed_any = True
                        next_part = dict(part)
                        next_part["text"] = cleaned_text
                        new_parts.append(next_part)
                    else:
                        new_parts.append(part)
                else:
                    # Preserve image_url, audio, RAG citations, and non-text blocks verbatim
                    new_parts.append(part)
            updated_content = new_parts
        else:
            return body

        if not changed_any:
            return body

        if cfg.emit_status:
            _emit_status_nonblocking(__event_emitter__, "Formatted for clean chat reading")

        next_body = copy.copy(body)
        next_messages = list(messages)
        updated_last = dict(last)
        updated_last["content"] = updated_content
        next_messages[-1] = updated_last
        next_body["messages"] = next_messages
        return next_body
