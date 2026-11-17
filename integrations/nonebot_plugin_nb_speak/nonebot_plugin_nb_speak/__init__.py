from __future__ import annotations

import asyncio
from typing import Any, Callable

from . import formatter
from .config import Config

try:
    from nonebot import get_plugin_config
    from nonebot.adapters import Bot
    from nonebot.exception import MockApiException
    from nonebot.plugin import PluginMetadata

    _plugin_config = get_plugin_config(Config)
except Exception:  # pragma: no cover - standalone import / unit-test mode without an initialized NoneBot driver

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

SEND_API_NAMES = frozenset(
    {
        "send_msg",
        "send_private_msg",
        "send_group_msg",
        "send_message",
        "message_create",
        "post_messages",
        "post_dms",
    }
)

ADAPTER_PLATFORM_MAP = {
    "onebot v11": "aiocqhttp",
    "onebot v12": "aiocqhttp",
    "qq": "qq_official",
    "telegram": "telegram",
    "feishu": "lark",
    "ding": "dingtalk",
    "discord": "discord",
    "satori": "satori",
    "wechat": "weixin_oc",
}


def get_chat_human_prompt(
    *,
    persona_preset: str = "neutral_peer",
    enable_voice_notes: bool = False,
) -> str:
    """Return the chat-human mobile IM system layer (`enable_voice_notes=False` by default)."""
    return formatter.build_astrbot_system_prompt(
        persona_preset=persona_preset,
        enable_voice_notes=enable_voice_notes,
    )


def plan_bot_reply(raw_text: str, *, adapter_name: str = "onebot v11", config: Config | None = None):
    cfg = config or _plugin_config
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


def _extract_pure_text_field(data: dict[str, Any]) -> tuple[str, str] | None:
    for key in ("message", "text", "content"):
        if key not in data:
            continue
        val = data[key]
        if isinstance(val, str):
            return key, val
        # Support NoneBot Message / list of plain-text segments without touching rich media/at/image segments
        if isinstance(val, list) and val:
            texts: list[str] = []
            for seg in val:
                seg_type = getattr(seg, "type", None) or (seg.get("type") if isinstance(seg, dict) else None)
                if seg_type != "text":
                    return None
                seg_data = getattr(seg, "data", None) or (seg.get("data") if isinstance(seg, dict) else {})
                texts.append(str(seg_data.get("text", "")))
            return key, "".join(texts)
    return None


async def handle_calling_api_hook(
    bot: Any,
    api: str,
    data: dict[str, Any],
    *,
    config: Config | None = None,
    sleep_fn: Callable[[float], Any] = asyncio.sleep,
) -> None:
    # Pop internal bypass marker first so upstream adapters never see an unknown field
    if data.pop("_nb_speak_bypass", False):
        return

    cfg = config or _plugin_config
    if not cfg.nb_speak_enabled:
        return

    api_norm = (api or "").strip().lower()
    if api_norm not in SEND_API_NAMES:
        return

    extracted = _extract_pure_text_field(data)
    if extracted is None:
        return
    field_key, raw_text = extracted
    if not raw_text.strip():
        return

    adapter_obj = getattr(bot, "adapter", None)
    adapter_name = ""
    if adapter_obj is not None and hasattr(adapter_obj, "get_name"):
        adapter_name = str(adapter_obj.get_name() or "")
    elif hasattr(bot, "type"):
        adapter_name = str(getattr(bot, "type") or "")

    plan = plan_bot_reply(raw_text, adapter_name=adapter_name or "onebot v11", config=cfg)
    if not plan.changed or not plan.segments:
        return

    if not cfg.nb_speak_paced_delivery or len(plan.segments) == 1:
        data[field_key] = "\n\n".join(seg.text for seg in plan.segments)
        return

    # Multi-segment paced delivery: send each bubble/card sequentially and cancel original unsplit call
    last_result: Any = None
    for seg in plan.segments:
        if seg.delay_ms > 0:
            await sleep_fn(seg.delay_ms / 1000.0)
        seg_payload = dict(data)
        seg_payload[field_key] = seg.text
        seg_payload["_nb_speak_bypass"] = True
        last_result = await bot.call_api(api, **seg_payload)

    raise MockApiException(result=last_result)


@Bot.on_calling_api
async def _registered_nb_speak_hook(bot: Any, api: str, data: dict[str, Any]) -> None:
    await handle_calling_api_hook(bot, api, data)
