from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from typing import Any

TESTS_DIR = Path(__file__).resolve().parent
PLUGIN_ROOT = TESTS_DIR.parent
if str(PLUGIN_ROOT) not in sys.path:
    sys.path.insert(0, str(PLUGIN_ROOT))

from main import NbSpeakPlugin  # noqa: E402

_LISTENER_PATH = PLUGIN_ROOT / "components" / "event_listener" / "default.py"
_SPEC = importlib.util.spec_from_file_location("langbot_nb_speak_default", _LISTENER_PATH)
assert _SPEC and _SPEC.loader
_MOD = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MOD)
DefaultEventListener = _MOD.DefaultEventListener


class _DummyPlugin:
    def __init__(self, cfg: dict[str, Any] | None = None) -> None:
        self._cfg = cfg or {}

    def get_config(self) -> dict[str, Any]:
        return dict(self._cfg)


class _DummyEvent:
    def __init__(self, **kwargs: Any) -> None:
        for k, v in kwargs.items():
            setattr(self, k, v)


class _DummyEventContext:
    def __init__(self, event: Any) -> None:
        self.event = event
        self.prevented = False
        self.replied_chains: list[Any] = []

    def prevent_default(self) -> None:
        self.prevented = True

    async def reply(self, message_chain: Any, quote_origin: bool = False) -> None:
        self.replied_chains.append((message_chain, quote_origin))


class LangBotPluginTests(unittest.IsolatedAsyncioTestCase):
    def test_manifest_and_listener_yaml_obey_langbot_v4_schema_and_disable_voice_notes(self) -> None:
        manifest_text = (PLUGIN_ROOT / "manifest.yaml").read_text(encoding="utf-8")
        listener_yaml = (PLUGIN_ROOT / "components" / "event_listener" / "default.yaml").read_text(encoding="utf-8")

        self.assertIn("apiVersion: v1", manifest_text)
        self.assertIn("kind: Plugin", manifest_text)
        self.assertIn("name: langbot_plugin_nb_speak", manifest_text)
        self.assertIn("attr: NbSpeakPlugin", manifest_text)
        self.assertIn("sharedRuntime: shared-runtime-v1", manifest_text)
        self.assertIn("componentModel: stateless-v1", manifest_text)
        # Ensure enable_voice_notes defaults strictly to false
        idx = manifest_text.index("name: enable_voice_notes")
        block = manifest_text[idx : idx + 450]
        self.assertIn("default: false", block)

        self.assertIn("kind: EventListener", listener_yaml)
        self.assertIn("attr: DefaultEventListener", listener_yaml)
        self.assertTrue((PLUGIN_ROOT / "assets" / "icon.svg").is_file())
        self.assertTrue((PLUGIN_ROOT / "assets" / "icon.png").is_file())

        plugin = NbSpeakPlugin()
        self.assertEqual(plugin.get_config(), {})

    async def test_prompt_preprocessing_injects_once_without_voice_notes_by_default(self) -> None:
        listener = DefaultEventListener()
        listener.plugin = _DummyPlugin({"persona_preset": "calm_sre", "enable_voice_notes": False})

        ev = _DummyEvent(default_prompt=[], prompt=[])
        ctx = _DummyEventContext(ev)
        await listener.handle_prompt_preprocessing(ctx)
        self.assertEqual(len(ev.default_prompt), 1)
        self.assertIn("[nb-speak/1 · chat-human]", ev.default_prompt[0].content)
        self.assertNotIn("<voice_note>", ev.default_prompt[0].content)

        # Idempotent on repeated invocation
        await listener.handle_prompt_preprocessing(ctx)
        self.assertEqual(len(ev.default_prompt), 1)

    async def test_normal_message_responded_splits_wechat_pipe_table_and_protects_code_fence(self) -> None:
        delays: list[float] = []

        async def fake_sleep(sec: float) -> None:
            delays.append(sec)

        listener = DefaultEventListener(sleep_fn=fake_sleep)
        listener.plugin = _DummyPlugin({"platform_mode": "auto", "paced_delivery": True, "enable_voice_notes": False})

        raw_wall = (
            "（叹气）排查完数据库索引了。\n\n"
            "| 服务 | 延迟 |\n"
            "|---|---|\n"
            "| 订单库 | 18ms |\n\n"
            "```sql\nSELECT id FROM orders WHERE status = 'paid';\n```\n\n"
            "希望这对你有帮助！"
        )
        ev = _DummyEvent(
            launcher_type="group",
            prefix="",
            response_text=raw_wall,
            reply_message_chain=None,
        )
        ctx = _DummyEventContext(ev)
        await listener.handle_normal_message_responded(ctx)

        self.assertTrue(ctx.prevented)
        self.assertIsNone(ev.reply_message_chain)
        self.assertEqual(len(ctx.replied_chains), 3)

        sent_texts = [chain[0][0].text for chain in ctx.replied_chains]
        self.assertEqual(sent_texts[0], "排查完数据库索引了")
        self.assertIn("- 订单库：18ms", sent_texts[1])
        self.assertIn("```sql\nSELECT id FROM orders WHERE status = 'paid';\n```", sent_texts[2])
        self.assertEqual(len(delays), 3)


if __name__ == "__main__":
    unittest.main()
