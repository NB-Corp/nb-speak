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


class _DummyComp:
    def __init__(self, comp_type: str, **kwargs: Any) -> None:
        self.type = comp_type
        for k, v in kwargs.items():
            setattr(self, k, v)


class _DummyEvent:
    def __init__(self, **kwargs: Any) -> None:
        for k, v in kwargs.items():
            setattr(self, k, v)


class _DummyEventContext:
    def __init__(self, event: Any, *, fail_on_reply_index: int | None = None) -> None:
        self.event = event
        self.prevented = False
        self.replied_chains: list[Any] = []
        self._fail_on_reply_index = fail_on_reply_index
        self._calls = 0

    def prevent_default(self) -> None:
        self.prevented = True

    async def reply(self, message_chain: Any, quote_origin: bool = False) -> None:
        idx = self._calls
        self._calls += 1
        if self._fail_on_reply_index is not None and idx == self._fail_on_reply_index:
            raise RuntimeError("Simulated Gewechat rate limit")
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
        idx = manifest_text.index("name: enable_voice_notes")
        block = manifest_text[idx : idx + 450]
        self.assertIn("default: false", block)
        self.assertIn("name: tts_timeout_sec", manifest_text)

        self.assertIn("kind: EventListener", listener_yaml)
        self.assertIn("attr: DefaultEventListener", listener_yaml)
        self.assertTrue((PLUGIN_ROOT / "assets" / "icon.svg").is_file())
        self.assertTrue((PLUGIN_ROOT / "assets" / "icon.png").is_file())

        plugin = NbSpeakPlugin()
        self.assertEqual(plugin.get_config(), {})

    async def test_prompt_preprocessing_injects_once_and_handles_multimodal_content_lists(self) -> None:
        listener = DefaultEventListener()
        listener.plugin = _DummyPlugin({"persona_preset": "calm_sre", "enable_voice_notes": False})

        mm_msg = _DummyEvent(role="user", content=[{"type": "image_url", "image_url": "data:image/png;base64,AA=="}])
        ev = _DummyEvent(default_prompt=[mm_msg], prompt=[])
        ctx = _DummyEventContext(ev)
        await listener.handle_prompt_preprocessing(ctx)
        self.assertEqual(len(ev.default_prompt), 2)
        self.assertIn("[nb-speak/1 · chat-human]", ev.default_prompt[1].content)
        self.assertNotIn("<voice_note>", ev.default_prompt[1].content)

        # Idempotent on repeated invocation
        await listener.handle_prompt_preprocessing(ctx)
        self.assertEqual(len(ev.default_prompt), 2)

    async def test_normal_message_responded_splits_wechat_pipe_table_preserves_rich_chain_and_recovers_on_failure(self) -> None:
        delays: list[float] = []

        async def fake_sleep(sec: float) -> None:
            delays.append(sec)

        listener = DefaultEventListener(sleep_fn=fake_sleep)
        listener.plugin = _DummyPlugin(
            {
                "platform_mode": "auto",
                "paced_delivery": True,
                "enable_voice_notes": False,
            }
        )

        # 1. Rich reply_message_chain containing Quote + At + Image alongside response_text with pipe table + SQL
        quote_comp = _DummyComp("Quote", id="q_1")
        at_comp = _DummyComp("At", target="u_88")
        img_comp = _DummyComp("Image", url="https://example.com/chart.png")

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
            reply_message_chain=[quote_comp, at_comp, img_comp],
        )
        ctx = _DummyEventContext(ev)
        await listener.handle_normal_message_responded(ctx)

        self.assertTrue(ctx.prevented)
        self.assertIsNone(ev.reply_message_chain)
        self.assertEqual(len(ctx.replied_chains), 4)

        # Bubble 1 carries Quote + At + first text beat
        b1_chain = ctx.replied_chains[0][0]
        self.assertEqual([c.type for c in b1_chain], ["Quote", "At", "Plain"])
        self.assertEqual(b1_chain[2].text, "排查完数据库索引了")
        # Bubble 2 & 3 carry KV card and SQL fence without duplicating Quote/At
        self.assertIn("- 订单库：18ms", ctx.replied_chains[1][0][0].text)
        self.assertIn("```sql\nSELECT id FROM orders WHERE status = 'paid';\n```", ctx.replied_chains[2][0][0].text)
        # Bubble 4 preserves trailing Image component
        self.assertEqual(ctx.replied_chains[3][0][0].type, "Image")
        self.assertEqual(len(delays), 3)

        # 2. Failure on Bubble 0 leaves default host pipeline intact (prevented=False, zero message loss)
        ev_fail0 = _DummyEvent(
            launcher_type="group",
            prefix="",
            response_text="第一句\n\n第二句",
            reply_message_chain=None,
        )
        ctx_fail0 = _DummyEventContext(ev_fail0, fail_on_reply_index=0)
        await listener.handle_normal_message_responded(ctx_fail0)
        self.assertFalse(ctx_fail0.prevented)

        # 3. Failure on Bubble 2 preserves unsent tail + media in ev.reply_message_chain
        ev_fail1 = _DummyEvent(
            launcher_type="group",
            prefix="",
            response_text="第一句已送达\n\n第二句遇限流\n\n第三句收尾",
            reply_message_chain=[img_comp],
        )
        ctx_fail1 = _DummyEventContext(ev_fail1, fail_on_reply_index=1)
        await listener.handle_normal_message_responded(ctx_fail1)
        self.assertTrue(ctx_fail1.prevented)
        self.assertEqual(len(ctx_fail1.replied_chains), 1)
        self.assertIsNotNone(ev_fail1.reply_message_chain)
        self.assertIn("第二句遇限流", ev_fail1.reply_message_chain[0].text)
        self.assertIn("第三句收尾", ev_fail1.reply_message_chain[0].text)
        self.assertEqual(ev_fail1.reply_message_chain[1].type, "Image")


if __name__ == "__main__":
    unittest.main()
