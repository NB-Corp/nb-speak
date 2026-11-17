from __future__ import annotations

try:
    from langbot_plugin.api.definition.plugin import BasePlugin
except ImportError:  # pragma: no cover - standalone unit-test fallback outside LangBot runtime

    class BasePlugin:  # type: ignore[no-redef]
        def __init__(self) -> None:
            self._config: dict = {}

        def get_config(self) -> dict:
            return dict(self._config)


class NbSpeakPlugin(BasePlugin):
    """LangBot v4+ plugin entry for NB Speak (human IM bubbles & pipe-table gate)."""

    def __init__(self) -> None:
        super().__init__()

    async def initialize(self) -> None:
        return None
