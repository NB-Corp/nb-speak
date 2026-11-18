from __future__ import annotations

import asyncio
import base64
import logging
import os
import sys
from pathlib import Path
from typing import Any

PLUGIN_ROOT = Path(__file__).resolve().parents[2]
if str(PLUGIN_ROOT) not in sys.path:
    sys.path.insert(0, str(PLUGIN_ROOT))

import formatter  # noqa: E402

_logger = logging.getLogger("langbot_plugin_nb_speak")

try:
    from langbot_plugin.api.definition.components.common.event_listener import EventListener
    from langbot_plugin.api.entities import context, events
    from langbot_plugin.api.entities.builtin.platform import message as platform_message
    from langbot_plugin.api.entities.builtin.provider import message as provider_message
except ImportError:  # pragma: no cover - zero-dep unit test fallback when langbot_plugin SDK is absent

    class _PlainStub:
        def __init__(self, text: str = "") -> None:
            self.type = "Plain"
            self.text = text

    class _VoiceStub:
        def __init__(self, base64: str = "") -> None:
            self.type = "Voice"
            self.base64 = base64

    class _MessageChainStub(list):
        def __init__(self, elements: list[Any] | None = None) -> None:
            super().__init__(elements or [])

    class _ProviderMessageStub:
        def __init__(self, role: str = "system", content: Any = "") -> None:
            self.role = role
            self.content = content

    class _PlatformMessageMod:
        Plain = _PlainStub
        Voice = _VoiceStub
        MessageChain = _MessageChainStub

    class _ProviderMessageMod:
        Message = _ProviderMessageStub

    class _PromptPreProcessingStub:
        event_name = "PromptPreProcessing"

    class _NormalMessageRespondedStub:
        event_name = "NormalMessageResponded"

    class _EventsMod:
        PromptPreProcessing = _PromptPreProcessingStub
        NormalMessageResponded = _NormalMessageRespondedStub

    class EventListener:  # type: ignore[no-redef]
        def __init__(self) -> None:
            self.registered_handlers: dict[Any, list[Any]] = {}
            self.plugin: Any = None

        def handler(self, event_type: Any):
            def decorator(fn: Any) -> Any:
                self.registered_handlers.setdefault(event_type, []).append(fn)
                return fn

            return decorator

    platform_message = _PlatformMessageMod()  # type: ignore[assignment]
    provider_message = _ProviderMessageMod()  # type: ignore[assignment]
    events = _EventsMod()  # type: ignore[assignment]
    context = Any  # type: ignore[assignment]

HEADER_COMPONENT_TYPES = frozenset({"Source", "Quote", "At", "AtAll"})


def _prompt_item_has_marker(item: Any, marker: str) -> bool:
    raw_content = getattr(item, "content", None)
    if isinstance(raw_content, str):
        return marker in raw_content
    if isinstance(raw_content, list):
        for part in raw_content:
            part_text = getattr(part, "text", None)
            if part_text is None and isinstance(part, dict):
                part_text = part.get("text")
            if isinstance(part_text, str) and marker in part_text:
                return True
    return False


def _comp_type_name(comp: Any) -> str:
    raw_type = getattr(comp, "type", "")
    if isinstance(raw_type, str) and raw_type:
        return raw_type
    return comp.__class__.__name__


def _partition_existing_chain(chain: Any) -> tuple[list[Any], list[str], list[Any]]:
    headers: list[Any] = []
    plains: list[str] = []
    media: list[Any] = []
    if chain is None:
        return headers, plains, media
    try:
        items = list(chain)
    except TypeError:
        return headers, plains, media

    for comp in items:
        c_type = _comp_type_name(comp)
        if c_type == "Plain":
            txt = str(getattr(comp, "text", "") or "")
            if txt:
                plains.append(txt)
        elif not plains and not media and c_type in HEADER_COMPONENT_TYPES:
            headers.append(comp)
        else:
            media.append(comp)
    return headers, plains, media


class DefaultEventListener(EventListener):
    """Intercepts PromptPreProcessing and NormalMessageResponded in LangBot v4+."""

    def __init__(self, *, sleep_fn: Any = None) -> None:
        super().__init__()
        self._sleep = sleep_fn or asyncio.sleep

        @self.handler(events.PromptPreProcessing)
        async def on_prompt_preprocessing(event_context: Any) -> None:
            await self.handle_prompt_preprocessing(event_context)

        @self.handler(events.NormalMessageResponded)
        async def on_normal_message_responded(event_context: Any) -> None:
            await self.handle_normal_message_responded(event_context)

    def _read_config(self) -> dict[str, Any]:
        plugin_obj = getattr(self, "plugin", None)
        if plugin_obj is not None and hasattr(plugin_obj, "get_config"):
            raw = plugin_obj.get_config()
            if isinstance(raw, dict):
                return raw
        return {}

    async def handle_prompt_preprocessing(self, event_context: Any) -> None:
        cfg = self._read_config()
        if cfg.get("inject_system_prompt", True) is False:
            return

        persona = str(cfg.get("persona_preset") or "keep_host")
        enable_voice_notes = bool(cfg.get("enable_voice_notes", False) is True)
        addition = formatter.build_astrbot_system_prompt(
            persona_preset=persona,
            enable_voice_notes=enable_voice_notes,
        ).strip()

        ev = getattr(event_context, "event", None)
        default_prompt = getattr(ev, "default_prompt", None)
        if not isinstance(default_prompt, list):
            return

        for item in default_prompt:
            if _prompt_item_has_marker(item, formatter.PROMPT_MARKER):
                return

        default_prompt.append(provider_message.Message(role="system", content=addition))

    async def handle_normal_message_responded(self, event_context: Any) -> None:
        cfg = self._read_config()
        ev = getattr(event_context, "event", None)
        if ev is None:
            return

        existing_chain = getattr(ev, "reply_message_chain", None)
        header_comps, chain_plains, media_comps = _partition_existing_chain(existing_chain)

        raw_text = str(getattr(ev, "response_text", "") or "")
        if not raw_text.strip() and chain_plains:
            raw_text = "".join(chain_plains)
        if not raw_text.strip():
            return

        prefix = str(getattr(ev, "prefix", "") or "")
        platform_mode = str(cfg.get("platform_mode") or "auto")
        try:
            max_bubbles = max(1, int(cfg.get("max_bubbles") or 4))
        except (TypeError, ValueError):
            max_bubbles = 4
        try:
            target_cjk = max(12, int(cfg.get("target_bubble_cjk_chars") or 36))
        except (TypeError, ValueError):
            target_cjk = 36
        paced_delivery = cfg.get("paced_delivery", True) is not False
        enable_voice_notes = bool(cfg.get("enable_voice_notes", False) is True)

        session_obj = getattr(ev, "session", None)
        adapter_name = str(
            getattr(session_obj, "adapter_name", "")
            or getattr(ev, "launcher_type", "")
            or "weixin_oc"
        )
        platform_hint = "weixin_oc" if adapter_name in ("person", "group", "") else adapter_name

        plan = formatter.plan_outbound_segments(
            raw_text,
            platform_name=platform_hint,
            platform_mode=platform_mode,
            max_bubbles=max_bubbles,
            target_bubble_cjk_chars=target_cjk,
            enable_voice_notes=enable_voice_notes,
        )
        if not plan.changed or not plan.segments:
            return

        if not paced_delivery or (len(plan.segments) == 1 and not plan.voice_note_text and not media_comps):
            merged_text = "\n\n".join(seg.text for seg in plan.segments)
            if prefix:
                merged_text = f"{prefix}{merged_text}"
            event_context.prevent_default()
            ev.reply_message_chain = platform_message.MessageChain(
                [*header_comps, platform_message.Plain(text=merged_text), *media_comps]
            )
            return

        # Multi-bubble / card paced delivery via EventContext.reply() with lossless tail recovery
        sent_count = 0
        try:
            for idx, seg in enumerate(plan.segments):
                if seg.delay_ms > 0:
                    await self._sleep(seg.delay_ms / 1000.0)
                out_text = f"{prefix}{seg.text}" if (idx == 0 and prefix) else seg.text
                comps = [*header_comps, platform_message.Plain(text=out_text)] if idx == 0 else [platform_message.Plain(text=out_text)]
                await event_context.reply(platform_message.MessageChain(comps))
                sent_count += 1
                if sent_count == 1:
                    event_context.prevent_default()
                    ev.reply_message_chain = None
        except Exception as exc:
            _logger.warning("[nb-speak] LangBot paced reply failed at beat %d: %s", sent_count + 1, exc)
            if sent_count == 0:
                # Nothing sent yet: leave default pipeline untouched so host delivers original message
                return
            remaining_text = "\n\n".join(s.text for s in plan.segments[sent_count:])
            fallback_comps: list[Any] = []
            if remaining_text:
                fallback_comps.append(platform_message.Plain(text=remaining_text))
            fallback_comps.extend(media_comps)
            if fallback_comps:
                ev.reply_message_chain = platform_message.MessageChain(fallback_comps)
            return

        if media_comps:
            try:
                await event_context.reply(platform_message.MessageChain(list(media_comps)))
            except Exception as exc:
                _logger.warning("[nb-speak] LangBot media follow-up failed, attaching to fallback chain: %s", exc)
                ev.reply_message_chain = platform_message.MessageChain(list(media_comps))

        tts_base = str(cfg.get("tts_api_base") or "").strip()
        if enable_voice_notes and plan.voice_note_text and tts_base:
            wav_path = await formatter.synthesize_openai_wav(
                plan.voice_note_text,
                api_base=tts_base,
                api_key=str(cfg.get("tts_api_key") or ""),
                model=str(cfg.get("tts_model") or "tts-1"),
                voice=str(cfg.get("tts_voice") or "alloy"),
                timeout_sec=cfg.get("tts_timeout_sec", 4.0),
            )
            if wav_path and os.path.exists(wav_path):
                try:
                    raw_bytes = Path(wav_path).read_bytes()
                    b64 = base64.b64encode(raw_bytes).decode("ascii")
                    await event_context.reply(
                        platform_message.MessageChain(
                            [platform_message.Voice(base64=f"data:audio/wav;base64,{b64}")]
                        )
                    )
                except Exception as exc:
                    _logger.warning("[nb-speak] Optional LangBot Voice send failed (text already delivered): %s", exc)
                finally:
                    try:
                        os.remove(wav_path)
                    except OSError:
                        pass
