from __future__ import annotations

try:
    from pydantic import BaseModel, Field
except ImportError:  # pragma: no cover - bare stdlib fallback

    class BaseModel:  # type: ignore[no-redef]
        def __init__(self, **kwargs: object) -> None:
            for k, v in self.__class__.__dict__.items():
                if not k.startswith("_") and not callable(v):
                    setattr(self, k, v)
            for k, v in kwargs.items():
                setattr(self, k, v)

    def Field(default: object = None, **_kwargs: object) -> object:  # type: ignore[misc]
        return default


class Config(BaseModel):
    """Configuration for nonebot-plugin-nb-speak (`nb_speak_enable_voice_notes` off by default)."""

    nb_speak_enabled: bool = Field(default=True)
    nb_speak_persona_preset: str = Field(default="neutral_peer")
    nb_speak_platform_mode: str = Field(default="auto")
    nb_speak_max_bubbles: int = Field(default=4)
    nb_speak_target_cjk_chars: int = Field(default=36)
    nb_speak_paced_delivery: bool = Field(default=True)
    nb_speak_speed_multiplier: float = Field(default=1.0)
    nb_speak_enable_voice_notes: bool = Field(default=False)
    nb_speak_tts_api_base: str = Field(default="")
    nb_speak_tts_api_key: str = Field(default="")
    nb_speak_tts_model: str = Field(default="tts-1")
    nb_speak_tts_voice: str = Field(default="alloy")
    nb_speak_tts_timeout: float = Field(default=4.0)
