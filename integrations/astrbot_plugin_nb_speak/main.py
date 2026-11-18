"""AstrBot v4+ Star plugin entry for NB-Corp nb-speak & chat-human IM delivery physics."""

from __future__ import annotations

import asyncio
from typing import Any, List

try:
    from astrbot.api import AstrBotConfig, logger
    from astrbot.api.event import AstrMessageEvent, MessageChain, filter
    from astrbot.api.provider import ProviderRequest
    from astrbot.api.star import Context, Star
    import astrbot.api.message_components as Comp
except ModuleNotFoundError:  # Standalone unit-test fallback when AstrBot host is not installed

    class _FallbackLogger:
        def debug(self, *_args: Any, **_kwargs: Any) -> None:
            pass

        def info(self, *_args: Any, **_kwargs: Any) -> None:
            pass

        def warning(self, *_args: Any, **_kwargs: Any) -> None:
            pass

        def error(self, *_args: Any, **_kwargs: Any) -> None:
            pass

    logger = _FallbackLogger()
    AstrBotConfig = dict  # type: ignore[misc,assignment]
    AstrMessageEvent = Any  # type: ignore[misc,assignment]
    ProviderRequest = Any  # type: ignore[misc,assignment]
    Context = Any  # type: ignore[misc,assignment]

    class Star:  # type: ignore[no-redef]
        def __init__(self, context: Any = None) -> None:
            self.context = context

    class MessageChain:  # type: ignore[no-redef]
        def __init__(self, chain: List[Any] | None = None) -> None:
            self.chain: List[Any] = list(chain) if chain is not None else []

        def message(self, text: str) -> "MessageChain":
            self.chain.append(Comp.Plain(text))
            return self

    class _PlainComp:
        type = "Plain"

        def __init__(self, text: str = "") -> None:
            self.text = text

    class _RecordComp:
        type = "Record"

        def __init__(self, file: str = "", url: str = "") -> None:
            self.file = file
            self.url = url or file

    class Comp:  # type: ignore[no-redef]
        Plain = _PlainComp
        Record = _RecordComp

    class _FilterNamespace:
        @staticmethod
        def on_llm_request(*_args: Any, **_kwargs: Any):
            def _decorator(fn: Any) -> Any:
                return fn

            return _decorator

        @staticmethod
        def on_decorating_result(*_args: Any, **_kwargs: Any):
            def _decorator(fn: Any) -> Any:
                return fn

            return _decorator

        @staticmethod
        def command(*_args: Any, **_kwargs: Any):
            def _decorator(fn: Any) -> Any:
                return fn

            return _decorator

    filter = _FilterNamespace()  # type: ignore[assignment]

try:
    from .formatter import (
        PROMPT_MARKER,
        build_astrbot_system_prompt,
        plan_outbound_segments,
        synthesize_openai_wav,
    )
except ImportError:
    from formatter import (  # type: ignore[no-redef]
        PROMPT_MARKER,
        build_astrbot_system_prompt,
        plan_outbound_segments,
        synthesize_openai_wav,
    )

HEADER_COMPONENT_NAMES = frozenset({"Reply", "At", "AtAll"})


def _component_kind_name(comp: Any) -> str:
    cls_name = comp.__class__.__name__.lstrip("_")
    if cls_name.endswith("Comp"):
        cls_name = cls_name[:-4]
    raw_type = getattr(comp, "type", "")
    if isinstance(raw_type, str) and raw_type:
        return raw_type
    enum_name = getattr(raw_type, "name", "")
    if isinstance(enum_name, str) and enum_name:
        return enum_name
    return cls_name


def _is_plain_component(comp: Any) -> bool:
    if isinstance(comp, Comp.Plain):
        return True
    kind = _component_kind_name(comp).lower()
    return kind == "plain" and hasattr(comp, "text")


def _is_header_component(comp: Any) -> bool:
    return _component_kind_name(comp) in HEADER_COMPONENT_NAMES


def _resolve_platform_name(event: Any) -> str:
    getter = getattr(event, "get_platform_name", None)
    if callable(getter):
        try:
            val = getter()
            if isinstance(val, str) and val.strip():
                return val.strip().lower()
        except Exception:
            pass
    umo = getattr(event, "unified_msg_origin", "")
    if isinstance(umo, str) and ":" in umo:
        return umo.split(":", 1)[0].strip().lower()
    return ""


class NbSpeakPlugin(Star):
    """AstrBot native IM short-bubble & code/table card orchestrator."""

    def __init__(self, context: Context, config: AstrBotConfig | None = None) -> None:
        super().__init__(context)
        self.config: dict[str, Any] = config if config is not None else {}

    def _cfg_bool(self, key: str, default: bool) -> bool:
        val = self.config.get(key, default)
        if isinstance(val, bool):
            return val
        if isinstance(val, str):
            return val.strip().lower() in ("1", "true", "yes", "on")
        return bool(val)

    def _cfg_int(self, key: str, default: int) -> int:
        try:
            return int(self.config.get(key, default))
        except (TypeError, ValueError):
            return default

    def _cfg_float(self, key: str, default: float) -> float:
        try:
            return float(self.config.get(key, default))
        except (TypeError, ValueError):
            return default

    def _cfg_str(self, key: str, default: str) -> str:
        val = self.config.get(key, default)
        return str(val).strip() if val is not None else default

    @filter.on_llm_request()
    async def on_llm_request(self, event: AstrMessageEvent, req: ProviderRequest) -> None:
        """Append cache-safe static chat-human Layer 1 instructions before calling the LLM."""
        if not self._cfg_bool("enabled", True) or not self._cfg_bool("inject_system_prompt", True):
            return
        if req is None:
            return

        current_prompt = getattr(req, "system_prompt", "") or ""
        if PROMPT_MARKER in current_prompt:
            return

        addition = build_astrbot_system_prompt(
            persona_preset=self._cfg_str("persona_preset", "keep_host"),
            enable_voice_notes=self._cfg_bool("enable_voice_notes", False),
        )
        req.system_prompt = f"{current_prompt}{addition}"

    @filter.on_decorating_result()
    async def on_decorating_result(self, event: AstrMessageEvent) -> None:
        """Split >150-char replies safely, protect code blocks, and convert pipe tables for QQ/WeChat/TG."""
        if not self._cfg_bool("enabled", True):
            return
        if getattr(event, "_nb_speak_processed", False):
            return
        setattr(event, "_nb_speak_processed", True)

        result = event.get_result() if hasattr(event, "get_result") else None
        if result is None or not getattr(result, "chain", None):
            return

        if self._cfg_bool("only_llm_result", True):
            is_llm_fn = getattr(result, "is_llm_result", None)
            if callable(is_llm_fn) and not is_llm_fn():
                return

        original_chain = list(result.chain)
        header_comps: List[Any] = []
        media_comps: List[Any] = []
        plain_chunks: List[str] = []

        for comp in original_chain:
            if _is_plain_component(comp):
                text_val = getattr(comp, "text", "")
                if text_val:
                    plain_chunks.append(str(text_val))
            elif not plain_chunks and not media_comps and _is_header_component(comp):
                header_comps.append(comp)
            else:
                media_comps.append(comp)

        # Concatenate directly without injecting spaces between CJK Plain fragments
        raw_text = "".join(plain_chunks)
        if not raw_text.strip():
            return

        enable_voice_notes = self._cfg_bool("enable_voice_notes", False)
        speed = self._cfg_float("typing_speed_multiplier", 1.0)
        plan = plan_outbound_segments(
            raw_text,
            platform_name=_resolve_platform_name(event),
            platform_mode=self._cfg_str("platform_mode", "auto"),
            max_bubbles=self._cfg_int("max_bubbles", 4),
            target_bubble_cjk_chars=self._cfg_int("target_bubble_cjk_chars", 36),
            strip_short_trailing_period=self._cfg_bool("strip_short_trailing_period", True),
            enable_voice_notes=enable_voice_notes,
            speed_multiplier=speed,
        )

        if not plan.segments:
            return

        voice_comp: Any = None
        if enable_voice_notes and plan.voice_note_text:
            tts_base = self._cfg_str("tts_api_base", "")
            if tts_base:
                wav_path = await synthesize_openai_wav(
                    plan.voice_note_text,
                    api_base=tts_base,
                    api_key=self._cfg_str("tts_api_key", ""),
                    model=self._cfg_str("tts_model", "tts-1"),
                    voice=self._cfg_str("tts_voice", "alloy"),
                    timeout_sec=self._cfg_float("tts_timeout_sec", 4.0),
                )
                if wav_path:
                    voice_comp = Comp.Record(file=wav_path, url=wav_path)

        # Fast path: single segment — mutate result.chain in place with zero extra event.send() calls
        if len(plan.segments) == 1:
            if not plan.changed and voice_comp is None:
                return
            new_chain = [*header_comps, Comp.Plain(plan.segments[0].text), *media_comps]
            if voice_comp is not None:
                new_chain.append(voice_comp)
            result.chain[:] = new_chain
            return

        # Multi-segment path: send segments 0 .. N-2 via `await event.send(MessageChain(...))`
        # and keep segment N-1 (+ media + optional voice note) in `result.chain` so AstrBot's
        # native pipeline logs and delivers the closing beat with zero data-loss risk.
        typing_delay_on = self._cfg_bool("typing_delay_enabled", True)
        sent_count = 0
        try:
            for idx, seg in enumerate(plan.segments[:-1]):
                if typing_delay_on and seg.delay_ms > 0:
                    await asyncio.sleep(seg.delay_ms / 1000.0)
                comps = [*header_comps, Comp.Plain(seg.text)] if idx == 0 else [Comp.Plain(seg.text)]
                mc = MessageChain(comps) if isinstance(MessageChain, type) else comps
                await event.send(mc)
                sent_count += 1
        except Exception as exc:
            logger.error(f"[nb-speak] segmented send failed at beat {sent_count + 1}: {exc}")
            if sent_count == 0:
                result.chain[:] = original_chain
            else:
                remaining_text = "\n\n".join(s.text for s in plan.segments[sent_count:])
                result.chain[:] = [Comp.Plain(remaining_text), *media_comps]
            return

        final_seg = plan.segments[-1]
        if typing_delay_on and final_seg.delay_ms > 0:
            await asyncio.sleep(final_seg.delay_ms / 1000.0)

        tail_chain = [Comp.Plain(final_seg.text), *media_comps]
        if voice_comp is not None:
            tail_chain.append(voice_comp)
        result.chain[:] = tail_chain

    @filter.command("nbspeak")
    async def nbspeak_status(self, event: AstrMessageEvent):
        """查看当前 NB Speak 短气泡插件运行参数"""
        enabled = self._cfg_bool("enabled", True)
        mode = self._cfg_str("platform_mode", "auto")
        max_b = self._cfg_int("max_bubbles", 4)
        preset = self._cfg_str("persona_preset", "keep_host")
        voice = self._cfg_bool("enable_voice_notes", False)
        summary = (
            f"NB Speak 状态：{'已启用' if enabled else '已关闭'}\n"
            f"平台排版：{mode} · 单轮气泡上限：{max_b}\n"
            f"语气策略：{preset} · 可选语音条：{'开启' if voice else '关闭（默认）'}"
        )
        yield event.plain_result(summary)
