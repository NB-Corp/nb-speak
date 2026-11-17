"""
title: NB Speak — Human IM Bubbles & Table Gate
author: NB-Corp
author_url: https://github.com/NB-Corp/nb-speak
funding_url: https://github.com/NB-Corp/nb-speak
version: 0.2.0
license: MIT
description: Stop LLMs from dumping raw Markdown pipe tables and 250-word essay walls. Injects chat-human mobile IM physics in inlet() and cleans stage brackets, concierge sign-offs, and wide pipe tables in outlet() (voice notes off by default).
"""

from __future__ import annotations

import copy
import re
from typing import Any, Dict, List, Optional

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
    r"(?:^|[\s~～]+|(?<=[。！？!?；;]))(?:希望(?:这)?(?:对您|对你)?有帮助[！!。.~～]*|如有(?:任何)?(?:需要|问题)(?:请)?随时告诉我[！!。.~～]*|请(?:随时)?检阅[！!。.~～]*|Let me know if you need anything(?:\s+else)?[!.]?|Hope this helps[!.]?)\s*$",
    re.IGNORECASE,
)
FENCED_CODE_RE = re.compile(r"```([A-Za-z0-9_+\-]*)\n([\s\S]*?)```")
PIPE_TABLE_RE = re.compile(r"(?:^|\n)((?:\|[^\n]+\|\s*\n)\|[\s:\-|]+\|\s*\n(?:\|[^\n]+\|\s*(?:\n|$))+)")
TABLE_SEP_RE = re.compile(r"^:?-{2,}:?$")
CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
EN_WORD_RE = re.compile(r"[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?")
WIDE_CHAR_RE = re.compile(
    r"[\u1100-\u115f\u2e80-\u303e\u3040-\u33bf\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\ufe30-\ufe6f\uff01-\uff60\uffe0-\uffe6]"
)


def _count_units(text: str) -> tuple[int, int]:
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
        rows.append(cells[: len(headers)])
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
    s = re.sub(r"\*\*([^*\n]+)\*\*", r"\1", s).strip()
    if not s:
        return ""
    if re.search(r"[A-Za-z0-9]{4,}[。.]$", s):
        return s[:-1].strip()
    cjk, en = _count_units(s)
    if not re.search(r"[。！？!?；;\n]", s[:-1]):
        if s.endswith("。") and 0 < cjk <= 24 and en <= 6:
            return s[:-1].strip()
        if s.endswith(".") and not s.endswith("..") and cjk == 0 and 0 < en <= 12:
            return s[:-1].strip()
    return s


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
            description="Strip stage brackets, concierge sign-offs, and convert raw pipe tables in outlet().",
        )
        table_mode: str = Field(
            default="kv",
            description="Table conversion mode: kv (mobile key-value bullets), code (<=40-col monospace), or off.",
        )
        max_bubbles: int = Field(default=4, description="Maximum short paragraphs per reply.")
        enable_voice_notes: bool = Field(
            default=False,
            description="Enable optional <voice_note> prompt guidance (strictly disabled by default).",
        )

    def __init__(self) -> None:
        self.valves = self.Valves()

    def _build_system_block(self) -> str:
        lines = [
            PROMPT_MARKER,
            "- Reply in 1-2 short conversational paragraphs separated by a blank line (`\\n\\n`), never 250-word essay walls.",
            "- Avoid raw Markdown pipe tables (`|---|---|`) inside conversational beats; summarize comparisons as compact `- Item — Key: val` bullets and keep code inside fenced blocks.",
            "- Omit trailing periods (`.` / `。`) on short single-clause beats and after copyable codes; never output `*sighs*` / `（叹气）` stage brackets or `Hope this helps!` concierge tails.",
        ]
        if self.valves.enable_voice_notes:
            lines.append(
                "- Optional spoken aside may be placed once at the end inside `<voice_note>...</voice_note>` without repeating the text bubble."
            )
        soul = self.valves.custom_soul.strip() or PERSONA_BASELINES.get(self.valves.persona, "")
        if soul:
            lines.append(f"- Active tone baseline: {soul}")
        return "\n".join(lines)

    def inlet(self, body: dict, __user__: Optional[dict] = None) -> dict:
        if not self.valves.enabled or not self.valves.inject_system_prompt:
            return body
        messages = body.get("messages")
        if not isinstance(messages, list):
            return body

        for msg in messages:
            if isinstance(msg, dict) and PROMPT_MARKER in str(msg.get("content") or ""):
                return body

        next_body = copy.copy(body)
        next_messages = [dict(m) if isinstance(m, dict) else m for m in messages]
        block = self._build_system_block()

        if next_messages and isinstance(next_messages[0], dict) and next_messages[0].get("role") == "system":
            existing = str(next_messages[0].get("content") or "").rstrip()
            next_messages[0]["content"] = f"{existing}\n\n{block}" if existing else block
        else:
            next_messages.insert(0, {"role": "system", "content": block})

        next_body["messages"] = next_messages
        return next_body

    def outlet(self, body: dict, __user__: Optional[dict] = None) -> dict:
        if not self.valves.enabled or not self.valves.clean_outlet_reply:
            return body
        messages = body.get("messages")
        if not isinstance(messages, list) or not messages:
            return body
        last = messages[-1]
        if not isinstance(last, dict) or last.get("role") != "assistant":
            return body
        content = last.get("content")
        if not isinstance(content, str) or not content.strip():
            return body

        cards: List[str] = []

        def shield_code(match: re.Match[str]) -> str:
            lang = (match.group(1) or "").strip()
            code_body = (match.group(2) or "").rstrip("\n")
            if not code_body.strip():
                return ""
            idx = len(cards)
            cards.append(f"```{lang}\n{code_body}\n```")
            return f"\n\n@@NB_OWUI_CARD_{idx}@@\n\n"

        working = FENCED_CODE_RE.sub(shield_code, content.replace("\r\n", "\n"))

        if self.valves.table_mode != "off":

            def shield_table(match: re.Match[str]) -> str:
                tbl = match.group(1).strip()
                if not tbl:
                    return "\n\n"
                idx = len(cards)
                cards.append(_convert_pipe_table(tbl, self.valves.table_mode))
                return f"\n\n@@NB_OWUI_CARD_{idx}@@\n\n"

            working = PIPE_TABLE_RE.sub(shield_table, working)

        if not self.valves.enable_voice_notes:
            working = re.sub(r"<voice_note>[\s\S]*?</voice_note>", "", working, flags=re.IGNORECASE)

        token_re = re.compile(r"@@NB_OWUI_CARD_(\d+)@@")
        out_blocks: List[str] = []
        beat_count = 0
        max_b = max(1, int(self.valves.max_bubbles or 4))

        pos = 0
        for m in token_re.finditer(working):
            chunk = working[pos : m.start()].strip()
            if chunk:
                for para in re.split(r"\n\s*\n+", chunk):
                    cleaned = _clean_beat(para)
                    if cleaned:
                        if beat_count < max_b:
                            out_blocks.append(cleaned)
                            beat_count += 1
                        elif out_blocks:
                            out_blocks[-1] = f"{out_blocks[-1]}；{cleaned}"
            c_idx = int(m.group(1))
            if 0 <= c_idx < len(cards):
                out_blocks.append(cards[c_idx])
            pos = m.end()

        tail = working[pos:].strip()
        if tail:
            for para in re.split(r"\n\s*\n+", tail):
                cleaned = _clean_beat(para)
                if cleaned:
                    if beat_count < max_b:
                        out_blocks.append(cleaned)
                        beat_count += 1
                    elif out_blocks:
                        out_blocks[-1] = f"{out_blocks[-1]}；{cleaned}"

        if not out_blocks:
            return body

        next_body = copy.copy(body)
        next_messages = list(messages)
        updated_last = dict(last)
        updated_last["content"] = "\n\n".join(out_blocks)
        next_messages[-1] = updated_last
        next_body["messages"] = next_messages
        return next_body
