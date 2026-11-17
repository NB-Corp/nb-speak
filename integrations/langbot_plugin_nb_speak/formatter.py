"""Pure Python 3.10+ IM bubble planner, pipe-table converter, and atomic code-card extractor for AstrBot."""

from __future__ import annotations

import asyncio
import json
import os
import re
import tempfile
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Sequence

try:
    from . import bubble_lint
except ImportError:
    import bubble_lint  # type: ignore[no-redef]

PROMPT_MARKER = "[nb-speak/1 · chat-human]"

PERSONA_INSTRUCTIONS: Dict[str, str] = {
    "neutral_peer": (
        "以平等自然的技术搭档口吻交流，直接给结论与数字，不说卑微客服套话，不主动做说教科普。"
    ),
    "sharp_lead": (
        "以干练直接的技术负责人风格交流，先给放行或拦截判断，砍掉模棱两可的铺垫。"
    ),
    "warm_companion": (
        "像熟稔朋友在手机上发消息，靠自然动词与短句节奏传递温度，严禁使用括号舞台动作。"
    ),
    "calm_sre": (
        "以沉稳值班 SRE 口吻同步指标、影响面与下一步动作，1-2 条短气泡收束，零焦虑渲染。"
    ),
}

COMPACT_KV_PLATFORMS = frozenset(
    {
        "aiocqhttp",
        "qq_official",
        "qq_official_webhook",
        "weixin_oc",
        "weixin_official_account",
        "wecom",
        "wecom_ai_bot",
        "lark",
        "dingtalk",
        "satori",
        "line",
    }
)

STAGE_BRACKET_STRIP_RE = re.compile(
    r"(?:\*[a-zA-Z][a-zA-Z\s\-]{1,28}\*|[（(](?:叹气|笑|微笑|苦笑|歪头|叉腰|双手叉腰|气鼓鼓|摸头|摸摸头|捂脸|扶额|耸肩|小声|轻声|皱眉|眨眼|挑眉|擦汗|深呼吸|sighs?|smiles?|laughs?|giggles?|tilts\s+head|shrugs?|whispers?|grins?|rolls\s+eyes)[）)])\s*",
    re.IGNORECASE,
)

BUBBLE_LABEL_PREFIX_RE = re.compile(r"^(?:Bubble|Beat|气泡)\s*[1-9]\s*[:：]\s*", re.IGNORECASE)

CONCIERGE_TAIL_RE = re.compile(
    r"(?:^|[\s~～]+|(?<=[。！？!?；;]))(?:希望(?:这)?(?:对您|对你)?有帮助[！!。.~～]*|如有(?:任何)?(?:需要|问题)(?:请)?随时告诉我[！!。.~～]*|请(?:随时)?检阅[！!。.~～]*|Let me know if you need anything(?:\s+else)?[!.]?|Hope this helps[!.]?)\s*$",
    re.IGNORECASE,
)

VOICE_NOTE_TAG_RE = re.compile(r"<voice_note>\s*([\s\S]*?)\s*</voice_note>", re.IGNORECASE)
FENCED_CODE_RE = re.compile(r"```([A-Za-z0-9_+\-]*)\n([\s\S]*?)```")
PIPE_TABLE_RE = re.compile(r"(?:^|\n)((?:\|[^\n]+\|\s*\n)\|[\s:\-|]+\|\s*\n(?:\|[^\n]+\|\s*(?:\n|$))+)")
TABLE_SEP_CELL_RE = re.compile(r"^:?-{2,}:?$")
WIDE_CHAR_RE = re.compile(
    r"[\u1100-\u115f\u2e80-\u303e\u3040-\u33bf\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6]"
)
SENTENCE_SPLIT_RE = re.compile(
    r"(?:https?://\S+|[^。！？；;\n!?]|!(?=\S)|\?(?=[A-Za-z0-9_=&/%#]))+(?:[。！？；;…~～]+|[!?]+(?=\s|$)|$)"
)


@dataclass(frozen=True)
class PlannedSegment:
    kind: str  # "bubble" | "code" | "table"
    text: str
    delay_ms: int


@dataclass(frozen=True)
class OutboundPlan:
    changed: bool
    segments: List[PlannedSegment]
    bubbles: List[str]
    cards: List[str]
    voice_note_text: str | None
    lint_issues: List[Dict[str, Any]]


def estimate_display_width(text: str) -> int:
    s = str(text or "")
    return len(s) + len(WIDE_CHAR_RE.findall(s))


def compute_bubble_schedule(
    texts: Sequence[str],
    *,
    speed_multiplier: float = 1.0,
    first_delay_ms: int = 240,
    min_delay_ms: int = 360,
    max_delay_ms: int = 2100,
) -> List[int]:
    """Compute realistic thumb-typing delays in milliseconds (matches TS computeBubbleSchedule)."""
    speed = speed_multiplier if speed_multiplier and speed_multiplier > 0 else 1.0
    delays: List[int] = []
    for idx, raw in enumerate(texts):
        s = str(raw or "").strip()
        if idx == 0:
            delays.append(max(0, round(first_delay_ms / speed)))
            continue
        cjk, en_words = bubble_lint.count_units(s)
        clause_breaks = len(re.findall(r"[，,、；;：:—–\-]", s))
        raw_typing = round((190 + cjk * 42 + en_words * 56 + clause_breaks * 75) / speed)
        clamped = max(min_delay_ms, min(max_delay_ms, raw_typing))
        delays.append(clamped)
    return delays


def build_astrbot_system_prompt(
    *,
    persona_preset: str = "keep_host",
    enable_voice_notes: bool = False,
) -> str:
    lines = [
        f"\n\n{PROMPT_MARKER}",
        "你在手机即时通讯窗口（QQ/微信/Telegram/飞书）与真人对话，请严格遵守以下气泡物理规律：",
        "1. 默认用 1-2 段简短口语回复（每段约 6-28 个汉字或 4-22 个英文词），段与段之间用空行（\\n\\n）隔开；随口应答或收尾只需 1 短句，单轮最多不超过 4 段。",
        "2. 短单句末尾省略正式句号（。/.），取件码、命令、单号与链接末尾严禁紧贴句号。",
        "3. 严禁在聊天气泡中直接输出 Markdown 管道表格（|---|）或 # 多级标题；对比数据请直接写成紧凑条目，多行代码单独放在完整 ``` 代码块内。",
        "4. 严禁输出括号舞台动作（如 *sighs*、（叹气）、（笑））及客服管家套话（如“向你汇报”“请检阅”“希望这对你有帮助”）。",
    ]
    if enable_voice_notes:
        lines.append(
            "5. 如需附带耳畔口语补充，仅可在整轮回复最末尾追加一个 `<voice_note>口语补充内容</voice_note>`（15-35 字，严禁复读正文文字，数字转口语读法，不含 URL）。"
        )
    persona_line = PERSONA_INSTRUCTIONS.get(persona_preset)
    if persona_line:
        lines.append(f"语气基线：{persona_line}")
    return "\n".join(lines)


def _split_pipe_row(line: str) -> List[str]:
    trimmed = line.strip().removeprefix("|").removesuffix("|")
    cells: List[str] = []
    buf: List[str] = []
    i = 0
    while i < len(trimmed):
        ch = trimmed[i]
        if ch == "\\" and i + 1 < len(trimmed) and trimmed[i + 1] == "|":
            buf.append("|")
            i += 2
            continue
        if ch == "|":
            cell = "".join(buf).strip()
            cell = re.sub(r"\*\*([^*]+)\*\*", r"\1", cell)
            cells.append(cell)
            buf = []
        else:
            buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    tail = re.sub(r"\*\*([^*]+)\*\*", r"\1", tail)
    cells.append(tail)
    return cells


def parse_markdown_pipe_table(block: str) -> tuple[List[str], List[List[str]]] | None:
    lines = [ln.strip() for ln in block.replace("\r\n", "\n").split("\n") if ln.strip()]
    if len(lines) < 3 or "|" not in lines[0] or "|" not in lines[1]:
        return None
    headers = _split_pipe_row(lines[0])
    sep = _split_pipe_row(lines[1])
    if not headers or not sep or not all(TABLE_SEP_CELL_RE.match(c) for c in sep):
        return None
    rows: List[List[str]] = []
    for ln in lines[2:]:
        if "|" not in ln:
            continue
        parsed = _split_pipe_row(ln)
        if len(parsed) < len(headers):
            parsed.extend([""] * (len(headers) - len(parsed)))
        row = parsed[: len(headers)]
        if any(cell for cell in row):
            rows.append(row)
    if not rows:
        return None
    return headers, rows


def format_table_for_platform(
    table_md: str,
    *,
    platform_name: str = "",
    platform_mode: str = "auto",
    max_monospace_width: int = 40,
) -> str:
    parsed = parse_markdown_pipe_table(table_md)
    if parsed is None:
        return table_md.strip()
    headers, rows = parsed

    def to_kv_card() -> str:
        out: List[str] = []
        for row in rows:
            lead = row[0] or "-"
            if len(headers) == 1:
                out.append(f"- {lead}")
            elif len(headers) == 2:
                out.append(f"- {lead}：{row[1]}".rstrip("："))
            else:
                pairs = [f"{headers[idx]}: {row[idx]}" for idx in range(1, len(headers)) if row[idx]]
                out.append(f"- {lead} — {' · '.join(pairs)}" if pairs else f"- {lead}")
        return "\n".join(out)

    if platform_mode == "im_compact":
        return to_kv_card()

    col_widths = [
        max([max(1, estimate_display_width(h))] + [estimate_display_width(r[i]) for r in rows])
        for i, h in enumerate(headers)
    ]

    def pad(val: str, width: int) -> str:
        return val + (" " * max(0, width - estimate_display_width(val)))

    header_ln = "  ".join(pad(h, col_widths[i]) for i, h in enumerate(headers)).rstrip()
    sep_ln = "  ".join("-" * w for w in col_widths)
    body_lns = ["  ".join(pad(r[i], col_widths[i]) for i in range(len(headers))).rstrip() for r in rows]
    ascii_lines = [header_ln, sep_ln, *body_lns]
    max_w = max(estimate_display_width(ln) for ln in ascii_lines)

    norm_platform = (platform_name or "").strip().lower()
    if platform_mode == "auto" and (norm_platform in COMPACT_KV_PLATFORMS or max_w > max_monospace_width):
        return to_kv_card()
    if platform_mode == "markdown_code" and max_w > max_monospace_width:
        return to_kv_card()
    return "```text\n" + "\n".join(ascii_lines) + "\n```"


def _clean_single_beat(text: str, *, strip_short_trailing_period: bool = True) -> str:
    s = text.replace("\r\n", "\n").strip()
    if not s:
        return ""
    s = STAGE_BRACKET_STRIP_RE.sub("", s).strip()
    s = BUBBLE_LABEL_PREFIX_RE.sub("", s).strip()
    s = CONCIERGE_TAIL_RE.sub("", s).strip()
    if not s:
        return ""

    # Flatten Markdown headers and bold-bullet wrappers inside plain chat bubbles
    s = re.sub(r"(?m)^\s*#{1,6}\s+", "", s)
    s = re.sub(r"(?m)^\s*[-*]\s+\*\*([^*\n:：]+)\*\*\s*[:：]\s*", r"\1：", s)
    s = re.sub(r"\*\*([^*\n]+)\*\*", r"\1", s).strip()
    if not s:
        return ""

    if strip_short_trailing_period:
        if bubble_lint.CODE_PERIOD_END_RE.search(s):
            s = s[:-1].strip()
        else:
            cjk, en_words = bubble_lint.count_units(s)
            has_internal_stops = bool(re.search(r"[。！？!?；;\n]", s[:-1]))
            if not has_internal_stops:
                if s.endswith("。") and 0 < cjk <= 26 and en_words <= 6:
                    s = s[:-1].strip()
                elif (
                    s.endswith(".")
                    and not s.endswith("..")
                    and not bubble_lint.ABBREV_END_RE.search(s)
                    and cjk == 0
                    and 0 < en_words <= 12
                ):
                    s = s[:-1].strip()
    return s


def _split_paragraph_beats(paragraph: str, *, target_cjk_chars: int = 36) -> List[str]:
    trimmed = paragraph.strip()
    if not trimmed:
        return []

    lines = [ln.strip() for ln in trimmed.split("\n") if ln.strip()]
    # Preserve tightly coupled 2-line copyable blocks (e.g. locker + pickup code)
    if len(lines) == 2:
        cjk, en_words = bubble_lint.count_units(trimmed)
        if cjk <= max(36, target_cjk_chars) and en_words <= 24 and not re.match(r"^(?:[-*•]|\d+[.)])\s+", lines[0]):
            return ["\n".join(lines)]

    # Unpack explicit bullet / numbered lists into clean individual beats
    if len(lines) > 1 and all(re.match(r"^(?:[-*•]|\d+[.)])\s+", ln) for ln in lines):
        return [re.sub(r"^(?:[-*•]|\d+[.)])\s+", "", ln).strip() for ln in lines if ln.strip()]

    target_en = max(18, int(target_cjk_chars * 0.75))
    cjk_total, en_total = bubble_lint.count_units(trimmed)
    if cjk_total <= target_cjk_chars and en_total <= target_en and len(lines) == 1:
        return [trimmed]

    beats: List[str] = []
    for line in lines:
        lc, le = bubble_lint.count_units(line)
        if lc <= target_cjk_chars and le <= target_en:
            beats.append(line)
            continue
        pieces = [m.group(0).strip() for m in SENTENCE_SPLIT_RE.finditer(line) if m.group(0).strip()]
        if not pieces:
            beats.append(line)
            continue
        buf = ""
        for piece in pieces:
            if not buf:
                buf = piece
                continue
            sep = "" if re.search(r"[\u4e00-\u9fff。！？；，]$", buf) else " "
            candidate = f"{buf}{sep}{piece}"
            cc, ce = bubble_lint.count_units(candidate)
            if cc <= target_cjk_chars and ce <= target_en:
                buf = candidate
            else:
                beats.append(buf)
                buf = piece
        if buf:
            beats.append(buf)
    return beats


def _try_unwrap_leaked_json(raw: str) -> tuple[str, str | None] | None:
    stripped = raw.strip()
    if not (stripped.startswith("{") and stripped.endswith("}")):
        return None
    try:
        obj = json.loads(stripped)
    except Exception:
        return None
    if not isinstance(obj, dict):
        return None
    bubbles = obj.get("bubbles") or obj.get("messages")
    if not isinstance(bubbles, list):
        return None
    texts: List[str] = []
    vn_text: str | None = None
    for item in bubbles:
        if isinstance(item, dict):
            t = str(item.get("text") or "").strip()
            if t:
                texts.append(t)
            tts_obj = item.get("tts")
            if isinstance(tts_obj, dict) and str(tts_obj.get("text") or "").strip():
                vn_text = str(tts_obj.get("text") or "").strip()
        elif item is not None:
            t = str(item).strip()
            if t:
                texts.append(t)
    vn_root = obj.get("voice_note")
    if isinstance(vn_root, dict) and str(vn_root.get("text") or "").strip():
        vn_text = str(vn_root.get("text") or "").strip()
    if not texts:
        return None
    return "\n\n".join(texts), vn_text


def plan_outbound_segments(
    raw_text: str,
    *,
    platform_name: str = "",
    platform_mode: str = "auto",
    max_bubbles: int = 4,
    target_bubble_cjk_chars: int = 36,
    strip_short_trailing_period: bool = True,
    enable_voice_notes: bool = False,
    speed_multiplier: float = 1.0,
) -> OutboundPlan:
    original = str(raw_text or "")
    trimmed = original.strip()
    if not trimmed:
        return OutboundPlan(
            changed=False,
            segments=[],
            bubbles=[],
            cards=[],
            voice_note_text=None,
            lint_issues=[],
        )

    voice_note_text: str | None = None
    working = trimmed.replace("\r\n", "\n")

    unwrapped = _try_unwrap_leaked_json(working)
    if unwrapped is not None:
        working, unwrapped_vn = unwrapped
        if enable_voice_notes and unwrapped_vn:
            voice_note_text = unwrapped_vn

    def _capture_voice_tag(match: re.Match[str]) -> str:
        nonlocal voice_note_text
        captured = match.group(1).strip()
        if enable_voice_notes and captured and voice_note_text is None:
            voice_note_text = captured
        return ""

    working = VOICE_NOTE_TAG_RE.sub(_capture_voice_tag, working).strip()

    # Token-shield fenced code blocks and Markdown pipe tables in exact appearance order
    card_pool: List[tuple[str, str]] = []

    def _shield_code(match: re.Match[str]) -> str:
        lang = (match.group(1) or "").strip()
        body = (match.group(2) or "").rstrip("\n")
        if not body.strip():
            return ""
        slot = len(card_pool)
        if lang in ("", "markdown", "md") and parse_markdown_pipe_table(body) is not None:
            rendered_tbl = format_table_for_platform(
                body,
                platform_name=platform_name,
                platform_mode=platform_mode,
            )
            card_pool.append(("table", rendered_tbl))
        else:
            fence = f"```{lang}\n{body}\n```"
            card_pool.append(("code", fence))
        return f"\n\n@@NB_SPEAK_CARD_{slot}@@\n\n"

    working = FENCED_CODE_RE.sub(_shield_code, working)

    def _shield_table(match: re.Match[str]) -> str:
        tbl_block = match.group(1).strip()
        if not tbl_block:
            return "\n\n"
        slot = len(card_pool)
        rendered_tbl = format_table_for_platform(
            tbl_block,
            platform_name=platform_name,
            platform_mode=platform_mode,
        )
        card_pool.append(("table", rendered_tbl))
        return f"\n\n@@NB_SPEAK_CARD_{slot}@@\n\n"

    working = PIPE_TABLE_RE.sub(_shield_table, working)

    # Walk tokens in document order, splitting prose blocks while keeping card tokens atomic
    raw_tokens: List[tuple[str, str]] = []
    token_re = re.compile(r"@@NB_SPEAK_CARD_(\d+)@@")
    pos = 0
    for m in token_re.finditer(working):
        prose_chunk = working[pos : m.start()].strip()
        if prose_chunk:
            for para in re.split(r"\n\s*\n+", prose_chunk):
                for beat in _split_paragraph_beats(para, target_cjk_chars=target_bubble_cjk_chars):
                    cleaned = _clean_single_beat(beat, strip_short_trailing_period=strip_short_trailing_period)
                    if cleaned:
                        raw_tokens.append(("bubble", cleaned))
        card_idx = int(m.group(1))
        if 0 <= card_idx < len(card_pool):
            raw_tokens.append(card_pool[card_idx])
        pos = m.end()

    tail_prose = working[pos:].strip()
    if tail_prose:
        for para in re.split(r"\n\s*\n+", tail_prose):
            for beat in _split_paragraph_beats(para, target_cjk_chars=target_bubble_cjk_chars):
                cleaned = _clean_single_beat(beat, strip_short_trailing_period=strip_short_trailing_period)
                if cleaned:
                    raw_tokens.append(("bubble", cleaned))

    # Enforce max_bubbles on conversational bubbles without dropping a single word (consolidate overflow)
    effective_max = max(1, int(max_bubbles))
    bubble_indices = [i for i, (kind, _) in enumerate(raw_tokens) if kind == "bubble"]
    if len(bubble_indices) > effective_max:
        keep_head = bubble_indices[: effective_max - 1]
        merge_indices = set(bubble_indices[effective_max - 1 :])
        first_merge_idx = bubble_indices[effective_max - 1]
        merged_text = "；".join(raw_tokens[i][1] for i in bubble_indices[effective_max - 1 :])
        consolidated: List[tuple[str, str]] = []
        for idx, item in enumerate(raw_tokens):
            if item[0] != "bubble" or idx in keep_head:
                consolidated.append(item)
            elif idx == first_merge_idx:
                consolidated.append(("bubble", merged_text))
            elif idx in merge_indices:
                continue
        raw_tokens = consolidated

    delays = compute_bubble_schedule([txt for _, txt in raw_tokens], speed_multiplier=speed_multiplier)
    segments = [
        PlannedSegment(kind=kind, text=txt, delay_ms=delays[idx])
        for idx, (kind, txt) in enumerate(raw_tokens)
    ]
    bubbles = [seg.text for seg in segments if seg.kind == "bubble"]
    cards = [seg.text for seg in segments if seg.kind != "bubble"]

    lint_target: Dict[str, Any] = {"bubbles": bubbles or [trimmed]}
    if voice_note_text:
        lint_target["voice_note"] = {"text": voice_note_text}
    lint_issues = bubble_lint.lint_payload(lint_target, max_bubbles=effective_max)

    changed = len(segments) > 1 or bool(voice_note_text) or (len(segments) == 1 and segments[0].text != trimmed)
    return OutboundPlan(
        changed=changed,
        segments=segments,
        bubbles=bubbles,
        cards=cards,
        voice_note_text=voice_note_text,
        lint_issues=lint_issues,
    )


def _post_tts_wav_sync(
    text: str,
    *,
    api_base: str,
    api_key: str = "",
    model: str = "tts-1",
    voice: str = "alloy",
    output_dir: str | None = None,
    timeout_sec: float = 8.0,
) -> str | None:
    clean_base = api_base.rstrip("/")
    if not clean_base or not text.strip():
        return None
    if clean_base.endswith("/audio/speech"):
        endpoint = clean_base
    elif clean_base.endswith("/v1"):
        endpoint = f"{clean_base}/audio/speech"
    else:
        endpoint = f"{clean_base}/v1/audio/speech"

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

    req = urllib.request.Request(endpoint, data=payload, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
        if resp.status < 200 or resp.status >= 300:
            return None
        audio_bytes = resp.read()
    if not audio_bytes:
        return None

    target_dir = output_dir or tempfile.gettempdir()
    os.makedirs(target_dir, exist_ok=True)
    fd, wav_path = tempfile.mkstemp(prefix="nb_speak_astr_", suffix=".wav", dir=target_dir)
    try:
        os.write(fd, audio_bytes)
    finally:
        os.close(fd)
    return wav_path


async def synthesize_openai_wav(
    text: str,
    *,
    api_base: str,
    api_key: str = "",
    model: str = "tts-1",
    voice: str = "alloy",
    output_dir: str | None = None,
) -> str | None:
    """Async non-blocking wrapper around stdlib urllib for optional WAV voice-note synthesis."""
    try:
        return await asyncio.to_thread(
            _post_tts_wav_sync,
            text,
            api_base=api_base,
            api_key=api_key,
            model=model,
            voice=voice,
            output_dir=output_dir,
        )
    except Exception:
        return None
