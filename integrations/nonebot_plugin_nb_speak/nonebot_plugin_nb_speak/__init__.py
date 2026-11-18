from __future__ import annotations

import asyncio
from contextvars import ContextVar
import json
import logging
import os
from pathlib import Path
import re
from typing import Any, Callable

from . import formatter
from .config import Config

_std_logger = logging.getLogger("nonebot_plugin_nb_speak")

try:
    from nonebot import get_plugin_config, logger as _nb_logger
    from nonebot.adapters import Bot
    from nonebot.exception import MockApiException
    from nonebot.plugin import PluginMetadata

    try:
        _plugin_config = get_plugin_config(Config)
    except ValueError:
        # Imported before `nonebot.init()` — lazily resolved via `_get_active_config()`
        _plugin_config = None  # type: ignore[assignment]
except Exception:  # pragma: no cover - standalone unit-test mode without nonebot2 installed
    _nb_logger = None  # type: ignore[assignment]

    class MockApiException(Exception):  # type: ignore[no-redef]
        def __init__(self, result: Any = None) -> None:
            super().__init__()
            self.result = result

    class PluginMetadata:  # type: ignore[no-redef]
        def __init__(
            self,
            name: str,
            description: str,
            usage: str,
            type: str | None = None,
            homepage: str | None = None,
            config: Any = None,
            supported_adapters: set[str] | None = None,
            extra: dict[str, Any] | None = None,
        ) -> None:
            self.name = name
            self.description = description
            self.usage = usage
            self.type = type
            self.homepage = homepage
            self.config = config
            self.supported_adapters = supported_adapters
            self.extra = extra or {}

    class Bot:  # type: ignore[no-redef]
        _hooks: list[Callable[..., Any]] = []

        @classmethod
        def on_calling_api(cls, fn: Callable[..., Any]) -> Callable[..., Any]:
            cls._hooks.append(fn)
            return fn

    _plugin_config = Config()


__plugin_meta__ = PluginMetadata(
    name="NB Speak — 真人感短气泡与防破表门禁",
    description="将大模型长篇回复与裸 Markdown 管道表格拆解为自然短气泡与手机端键值/代码卡片（全适配器通用，默认关闭语音条）",
    usage="加载 nonebot_plugin_nb_speak 后自动对机器人外发长文本与裸管道表格生效；亦可直接调用 plan_bot_reply() 与 get_chat_human_prompt()。",
    type="application",
    homepage="https://github.com/NB-Corp/nb-speak",
    config=Config,
    supported_adapters=None,
)

# Coroutine-local re-entrancy guard: isolates concurrent group/private sends with zero global lock contention
_PACED_DISPATCH_CVAR: ContextVar[bool] = ContextVar("nb_speak_nonebot_paced_dispatch", default=False)

SEND_API_NAMES = frozenset(
    {
        "send_msg",
        "send_private_msg",
        "send_group_msg",
        "send_message",
        "create_message",
        "message_create",
        "post_messages",
        "post_dms",
        "im/v1/messages",
    }
)

FIRST_BUBBLE_ONLY_PAYLOAD_KEYS = (
    "reply_to_message_id",
    "reply_parameters",
    "message_reference",
)

ADAPTER_PLATFORM_MAP = {
    "onebot v11": "aiocqhttp",
    "onebot v12": "aiocqhttp",
    "qq": "qq_official",
    "telegram": "telegram",
    "feishu": "lark",
    "lark": "lark",
    "ding": "dingtalk",
    "discord": "discord",
    "satori": "satori",
    "wechat": "weixin_oc",
}

HEADER_SEG_TYPES = frozenset({"reply", "at", "mention", "mention_all"})
STRUCTURAL_SKIP_SEG_TYPES = frozenset({"forward", "node", "xml", "json", "markdown", "card", "ark"})
CQ_TAG_RE = re.compile(r"\[CQ:([a-zA-Z0-9_.\-]+)(?:,[^\]]*)?\]")


def _get_active_config(explicit: Config | None = None) -> Config:
    global _plugin_config
    if explicit is not None:
        return explicit
    if _plugin_config is not None:
        return _plugin_config
    try:
        from nonebot import get_plugin_config as _gpc

        _plugin_config = _gpc(Config)
        return _plugin_config
    except Exception:
        return Config()


def _log_warn(msg: str) -> None:
    if _nb_logger is not None:
        _nb_logger.warning(msg)
    else:
        _std_logger.warning(msg)


def get_chat_human_prompt(
    *,
    persona_preset: str | None = None,
    enable_voice_notes: bool = False,
) -> str:
    """Return the chat-human mobile IM system layer (`enable_voice_notes=False` by default)."""
    cfg = _get_active_config()
    preset = persona_preset if persona_preset is not None else cfg.nb_speak_persona_preset
    return formatter.build_astrbot_system_prompt(
        persona_preset=preset,
        enable_voice_notes=enable_voice_notes,
    )


def plan_bot_reply(raw_text: str, *, adapter_name: str = "onebot v11", config: Config | None = None):
    cfg = _get_active_config(config)
    norm_adapter = ADAPTER_PLATFORM_MAP.get(adapter_name.strip().lower(), adapter_name.strip().lower())
    return formatter.plan_outbound_segments(
        raw_text,
        platform_name=norm_adapter,
        platform_mode=cfg.nb_speak_platform_mode,
        max_bubbles=cfg.nb_speak_max_bubbles,
        target_bubble_cjk_chars=cfg.nb_speak_target_cjk_chars,
        enable_voice_notes=bool(cfg.nb_speak_enable_voice_notes is True),
        speed_multiplier=cfg.nb_speak_speed_multiplier,
    )


def _seg_type_and_data(seg: Any) -> tuple[str | None, dict[str, Any]]:
    if isinstance(seg, dict):
        t = seg.get("type")
        d = seg.get("data")
        return (str(t) if t is not None else None, d if isinstance(d, dict) else {})
    t = getattr(seg, "type", None)
    d = getattr(seg, "data", None)
    if t is not None and isinstance(d, dict):
        return str(t), d
    return None, {}


def _make_text_like(sample_seg: Any, text: str) -> Any:
    if isinstance(sample_seg, dict):
        return {"type": "text", "data": {"text": text}}
    seg_cls = type(sample_seg)
    try:
        return seg_cls("text", {"text": text})
    except Exception:
        return {"type": "text", "data": {"text": text}}


def _wrap_segment_container(original_container: Any, segs: list[Any]) -> Any:
    if isinstance(original_container, list) and type(original_container) is not list:
        try:
            return type(original_container)(segs)
        except Exception:
            return list(segs)
    if not isinstance(original_container, list) and len(segs) == 1:
        return segs[0]
    return list(segs)


class _ParsedPayloadTarget:
    __slots__ = (
        "kind",
        "field_key",
        "nested_body",
        "feishu_json_envelope",
        "original_container",
        "sample_text_seg",
        "leading_headers",
        "tokens",
    )

    def __init__(
        self,
        *,
        kind: str,
        field_key: str,
        nested_body: bool = False,
        feishu_json_envelope: dict[str, Any] | None = None,
        original_container: Any = None,
        sample_text_seg: Any = None,
        leading_headers: list[Any] | None = None,
        tokens: list[tuple[str, Any]] | None = None,
    ) -> None:
        self.kind = kind  # "plain_str" | "cq_str" | "feishu_json" | "seg_seq"
        self.field_key = field_key
        self.nested_body = nested_body
        self.feishu_json_envelope = feishu_json_envelope
        self.original_container = original_container
        self.sample_text_seg = sample_text_seg
        self.leading_headers = leading_headers or []
        self.tokens = tokens or []


def _parse_cq_string(field_key: str, raw_str: str) -> _ParsedPayloadTarget | None:
    for m in CQ_TAG_RE.finditer(raw_str):
        if m.group(1).lower() in STRUCTURAL_SKIP_SEG_TYPES:
            return None

    leading_headers: list[str] = []
    pos = 0
    after_at = False
    while pos < len(raw_str):
        ws_match = re.match(r"^[ \t]+", raw_str[pos:]) if after_at else None
        if ws_match:
            pos += ws_match.end()
            after_at = False
            continue
        m = CQ_TAG_RE.match(raw_str, pos)
        if m and m.group(1).lower() in HEADER_SEG_TYPES:
            leading_headers.append(m.group(0))
            pos = m.end()
            after_at = m.group(1).lower() == "at"
            continue
        break

    tokens: list[tuple[str, Any]] = []
    tail = raw_str[pos:]
    last_idx = 0
    for m in CQ_TAG_RE.finditer(tail):
        if m.start() > last_idx:
            tokens.append(("text", tail[last_idx : m.start()]))
        tokens.append(("media", m.group(0)))
        last_idx = m.end()
    if last_idx < len(tail):
        tokens.append(("text", tail[last_idx:]))

    if not any(k == "text" and str(v).strip() for k, v in tokens):
        return None

    return _ParsedPayloadTarget(
        kind="cq_str",
        field_key=field_key,
        leading_headers=leading_headers,
        tokens=tokens,
    )


def _parse_segment_sequence(field_key: str, original_val: Any, seq: list[Any]) -> _ParsedPayloadTarget | None:
    if not seq:
        return None
    parsed_items: list[tuple[str, dict[str, Any], Any]] = []
    sample_text_seg: Any = None
    for seg in seq:
        s_type, s_data = _seg_type_and_data(seg)
        if not s_type or s_type.lower() in STRUCTURAL_SKIP_SEG_TYPES:
            return None
        if s_type == "text" and sample_text_seg is None:
            sample_text_seg = seg
        parsed_items.append((s_type, s_data, seg))

    if sample_text_seg is None:
        return None

    leading_headers: list[Any] = []
    cursor = 0
    after_at = False
    while cursor < len(parsed_items):
        s_type, s_data, seg_obj = parsed_items[cursor]
        low = s_type.lower()
        if low in HEADER_SEG_TYPES:
            leading_headers.append(seg_obj)
            cursor += 1
            after_at = low in ("at", "mention")
            continue
        if after_at and low == "text" and re.match(r"^[ \t]+$", str(s_data.get("text", ""))):
            cursor += 1
            after_at = False
            continue
        break

    tokens: list[tuple[str, Any]] = []
    text_buf = ""
    for i in range(cursor, len(parsed_items)):
        s_type, s_data, seg_obj = parsed_items[i]
        if s_type == "text":
            text_buf += str(s_data.get("text", ""))
        else:
            if text_buf:
                tokens.append(("text", text_buf))
                text_buf = ""
            tokens.append(("media", seg_obj))
    if text_buf:
        tokens.append(("text", text_buf))

    if not any(k == "text" and str(v).strip() for k, v in tokens):
        return None

    return _ParsedPayloadTarget(
        kind="seg_seq",
        field_key=field_key,
        original_container=original_val,
        sample_text_seg=sample_text_seg,
        leading_headers=leading_headers,
        tokens=tokens,
    )


def _inspect_payload_target(data: dict[str, Any]) -> _ParsedPayloadTarget | None:
    # 1. Feishu / Lark JSON text envelope (`{"msg_type": "text", "content": "{\"text\":\"...\"}"}` or nested `body`)
    for nested_flag, holder in ((False, data), (True, data.get("body") if isinstance(data.get("body"), dict) else None)):
        if isinstance(holder, dict) and holder.get("msg_type") == "text" and isinstance(holder.get("content"), str):
            raw_json = holder["content"].strip()
            if raw_json.startswith("{"):
                try:
                    parsed_json = json.loads(raw_json)
                except Exception:
                    return None
                if isinstance(parsed_json, dict) and isinstance(parsed_json.get("text"), str):
                    return _ParsedPayloadTarget(
                        kind="feishu_json",
                        field_key="content",
                        nested_body=nested_flag,
                        feishu_json_envelope=parsed_json,
                        tokens=[("text", parsed_json["text"])],
                    )
            return None

    # 2. Standard `message` / `text` / `content` fields across OneBot V11/V12, Telegram, QQ Official, Discord, Satori
    for key in ("message", "text", "content"):
        if key not in data:
            continue
        val = data[key]
        if isinstance(val, str):
            if "[CQ:" in val:
                return _parse_cq_string(key, val)
            return _ParsedPayloadTarget(kind="plain_str", field_key=key, tokens=[("text", val)])
        if isinstance(val, list):
            return _parse_segment_sequence(key, val, val)
        s_type, _ = _seg_type_and_data(val)
        if s_type is not None:
            return _parse_segment_sequence(key, val, [val])
    return None


def _encode_unit_value(target: _ParsedPayloadTarget, items: list[tuple[str, Any]], *, include_headers: bool) -> Any:
    if target.kind == "feishu_json":
        text_joined = "\n\n".join(str(v) for k, v in items if k == "text" and str(v))
        env = dict(target.feishu_json_envelope or {})
        env["text"] = text_joined
        return json.dumps(env, ensure_ascii=False)

    if target.kind == "plain_str":
        return "\n\n".join(str(v) for k, v in items if k == "text" and str(v))

    if target.kind == "cq_str":
        prefix = "".join(str(h) for h in target.leading_headers) if include_headers else ""
        if prefix and prefix.endswith("]") and any("CQ:at," in str(h) for h in target.leading_headers):
            prefix += " "
        parts: list[str] = []
        for k, v in items:
            parts.append(str(v))
        body = "\n\n".join(p for p in parts if p)
        return f"{prefix}{body}" if prefix else body

    # `seg_seq`: preserve OneBot V11/V12 Message / list[dict] container & rich segments
    segs: list[Any] = []
    if include_headers and target.leading_headers:
        segs.extend(target.leading_headers)
        last_h_type, _ = _seg_type_and_data(target.leading_headers[-1])
        if last_h_type and last_h_type.lower() in ("at", "mention"):
            segs.append(_make_text_like(target.sample_text_seg, " "))

    pending_texts: list[str] = []
    for k, v in items:
        if k == "text":
            if str(v):
                pending_texts.append(str(v))
        else:
            if pending_texts:
                segs.append(_make_text_like(target.sample_text_seg, "\n\n".join(pending_texts)))
                pending_texts = []
            segs.append(v)
    if pending_texts:
        segs.append(_make_text_like(target.sample_text_seg, "\n\n".join(pending_texts)))

    return _wrap_segment_container(target.original_container, segs)


def _write_target_field(payload: dict[str, Any], target: _ParsedPayloadTarget, encoded_val: Any) -> None:
    if target.nested_body and isinstance(payload.get("body"), dict):
        next_body = dict(payload["body"])
        next_body[target.field_key] = encoded_val
        payload["body"] = next_body
    else:
        payload[target.field_key] = encoded_val


def _make_voice_segment(target: _ParsedPayloadTarget, wav_path: str, adapter_name: str) -> Any | None:
    file_uri = Path(wav_path).resolve().as_uri()
    low_adapter = adapter_name.lower()
    if target.kind == "cq_str" or (target.kind == "plain_str" and "onebot" in low_adapter):
        return f"[CQ:record,file={file_uri}]"
    if target.kind == "seg_seq":
        if isinstance(target.sample_text_seg, dict):
            return {"type": "record", "data": {"file": file_uri}}
        seg_cls = type(target.sample_text_seg)
        try:
            return seg_cls("record", {"file": file_uri})
        except Exception:
            return {"type": "record", "data": {"file": file_uri}}
    return None


async def handle_calling_api_hook(
    bot: Any,
    api: str,
    data: dict[str, Any],
    *,
    config: Config | None = None,
    sleep_fn: Callable[[float], Any] = asyncio.sleep,
) -> None:
    if data.pop("_nb_speak_bypass", False) or _PACED_DISPATCH_CVAR.get():
        return

    cfg = _get_active_config(config)
    if not cfg.nb_speak_enabled:
        return

    api_norm = (api or "").strip().lower()
    if api_norm not in SEND_API_NAMES:
        return

    target = _inspect_payload_target(data)
    if target is None:
        return

    adapter_obj = getattr(bot, "adapter", None)
    adapter_name = ""
    if adapter_obj is not None and hasattr(adapter_obj, "get_name"):
        adapter_name = str(adapter_obj.get_name() or "")
    elif hasattr(bot, "type"):
        adapter_name = str(getattr(bot, "type") or "")
    resolved_adapter = adapter_name or ("feishu" if target.kind == "feishu_json" else "onebot v11")

    any_changed = False
    voice_note_text: str | None = None
    expanded_units: list[tuple[list[tuple[str, Any]], int]] = []
    media_count = sum(1 for k, _ in target.tokens if k == "media")
    text_seg_total = 0

    for tok_kind, tok_val in target.tokens:
        if tok_kind == "media":
            expanded_units.append(([("media", tok_val)], 240))
            continue
        raw_chunk = str(tok_val)
        if not raw_chunk.strip():
            continue
        plan = plan_bot_reply(raw_chunk, adapter_name=resolved_adapter, config=cfg)
        if plan.changed:
            any_changed = True
        if plan.voice_note_text and voice_note_text is None:
            voice_note_text = plan.voice_note_text
        if plan.changed and plan.segments:
            for seg in plan.segments:
                expanded_units.append(([("text", seg.text)], seg.delay_ms))
                text_seg_total += 1
        else:
            expanded_units.append(([("text", raw_chunk.strip())], 0))
            text_seg_total += 1

    if not any_changed or not expanded_units:
        return

    # Optional provider-agnostic TTS voice note (`nb_speak_enable_voice_notes=False` by default)
    temp_wav_to_clean: str | None = None
    if cfg.nb_speak_enable_voice_notes is True and voice_note_text and cfg.nb_speak_tts_api_base.strip():
        wav_path = await formatter.synthesize_openai_wav(
            voice_note_text,
            api_base=cfg.nb_speak_tts_api_base.strip(),
            api_key=cfg.nb_speak_tts_api_key.strip(),
            model=cfg.nb_speak_tts_model.strip() or "tts-1",
            voice=cfg.nb_speak_tts_voice.strip() or "alloy",
            timeout_sec=cfg.nb_speak_tts_timeout,
        )
        if wav_path and os.path.exists(wav_path):
            voice_seg = _make_voice_segment(target, wav_path, resolved_adapter)
            if voice_seg is not None:
                expanded_units.append(([("media", voice_seg)], 360))
                media_count += 1
                temp_wav_to_clean = wav_path
            else:
                try:
                    os.remove(wav_path)
                except OSError:
                    pass

    # Keep single-image + single-caption pairs together in one message
    if text_seg_total <= 1 and media_count > 0 and temp_wav_to_clean is None:
        flat_items = [item for unit_items, _ in expanded_units for item in unit_items]
        encoded_single = _encode_unit_value(target, flat_items, include_headers=True)
        _write_target_field(data, target, encoded_single)
        return

    flat_all_items = [item for unit_items, _ in expanded_units for item in unit_items]
    merged_single_shot = _encode_unit_value(target, flat_all_items, include_headers=True)

    if not cfg.nb_speak_paced_delivery or len(expanded_units) == 1:
        _write_target_field(data, target, merged_single_shot)
        return

    last_result: Any = None
    sent_count = 0
    cvar_token = _PACED_DISPATCH_CVAR.set(True)
    try:
        for idx, (unit_items, delay_ms) in enumerate(expanded_units):
            if delay_ms > 0:
                await sleep_fn(delay_ms / 1000.0)
            seg_payload = dict(data)
            if idx > 0:
                for quote_key in FIRST_BUBBLE_ONLY_PAYLOAD_KEYS:
                    seg_payload.pop(quote_key, None)
            encoded_unit = _encode_unit_value(target, unit_items, include_headers=(idx == 0))
            _write_target_field(seg_payload, target, encoded_unit)
            try:
                last_result = await bot.call_api(api, **seg_payload)
                sent_count += 1
            except Exception as exc:
                _log_warn(
                    f"[nb-speak] paced call_api({api}) failed at segment {idx + 1}/{len(expanded_units)}: {exc}"
                )
                if sent_count == 0:
                    _write_target_field(data, target, merged_single_shot)
                    return
                raise MockApiException(result=last_result) from None
    finally:
        _PACED_DISPATCH_CVAR.reset(cvar_token)
        if temp_wav_to_clean and os.path.exists(temp_wav_to_clean):
            try:
                os.remove(temp_wav_to_clean)
            except OSError:
                pass

    raise MockApiException(result=last_result)


@Bot.on_calling_api
async def _registered_nb_speak_hook(bot: Any, api: str, data: dict[str, Any]) -> None:
    await handle_calling_api_hook(bot, api, data)
