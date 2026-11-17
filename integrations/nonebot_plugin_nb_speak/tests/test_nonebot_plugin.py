from __future__ import annotations

import sys
import unittest
from pathlib import Path
from typing import Any

TESTS_DIR = Path(__file__).resolve().parent
PKG_ROOT = TESTS_DIR.parent
if str(PKG_ROOT) not in sys.path:
    sys.path.insert(0, str(PKG_ROOT))

import nonebot_plugin_nb_speak as nb_plugin  # noqa: E402
from nonebot_plugin_nb_speak.config import Config  # noqa: E402


class _FakeAdapter:
    def __init__(self, name: str = "OneBot V11") -> None:
        self._name = name

    def get_name(self) -> str:
        return self._name


class _FakeBot:
    def __init__(self, adapter_name: str = "OneBot V11") -> None:
        self.adapter = _FakeAdapter(adapter_name)
        self.sent_calls: list[tuple[str, dict[str, Any]]] = []

    async def call_api(self, api: str, **data: Any) -> dict[str, Any]:
        # Run the hook just like NoneBot2 Bot.call_api to verify zero recursion on _nb_speak_bypass
        await nb_plugin.handle_calling_api_hook(self, api, data, sleep_fn=self._noop_sleep)
        self.sent_calls.append((api, dict(data)))
        return {"message_id": len(self.sent_calls)}

    @staticmethod
    async def _noop_sleep(_sec: float) -> None:
        return None


class NoneBotPluginTests(unittest.IsolatedAsyncioTestCase):
    def test_plugin_metadata_and_pyproject_obey_nonebot_store_rules(self) -> None:
        pyproject = (PKG_ROOT / "pyproject.toml").read_text(encoding="utf-8")
        self.assertIn('name = "nonebot-plugin-nb-speak"', pyproject)
        self.assertEqual(nb_plugin.__plugin_meta__.type, "application")
        self.assertEqual(nb_plugin.__plugin_meta__.homepage, "https://github.com/NB-Corp/nb-speak")
        self.assertIsNone(nb_plugin.__plugin_meta__.supported_adapters)

        cfg = Config()
        self.assertFalse(cfg.nb_speak_enable_voice_notes)
        self.assertNotIn("<voice_note>", nb_plugin.get_chat_human_prompt())

    async def test_single_beat_rewrites_in_place_and_multi_segment_paces_via_mock_api_exception(self) -> None:
        bot = _FakeBot("OneBot V11")

        # 1. Single short beat with trailing formal period -> cleaned in-place without MockApiException
        single_data: dict[str, Any] = {"group_id": 10001, "message": "服务已经恢复正常。"}
        await nb_plugin.handle_calling_api_hook(bot, "send_group_msg", single_data)
        self.assertEqual(single_data["message"], "服务已经恢复正常")
        self.assertEqual(len(bot.sent_calls), 0)

        # 2. Multi-segment wall with raw pipe table -> raises MockApiException and dispatches paced segments
        delays: list[float] = []

        async def record_sleep(sec: float) -> None:
            delays.append(sec)

        wall_data: dict[str, Any] = {
            "group_id": 10001,
            "message": "（微笑）压测跑完了。\n\n| 节点 | QPS |\n|---|---|\n| 网关 | 4200 |\n\n如有问题请随时告诉我！",
        }
        with self.assertRaises(nb_plugin.MockApiException) as ctx_exc:
            await nb_plugin.handle_calling_api_hook(
                bot,
                "send_group_msg",
                wall_data,
                sleep_fn=record_sleep,
            )

        self.assertEqual(ctx_exc.exception.result, {"message_id": 2})
        self.assertEqual(len(bot.sent_calls), 2)
        self.assertEqual(bot.sent_calls[0][1]["message"], "压测跑完了")
        self.assertNotIn("_nb_speak_bypass", bot.sent_calls[0][1])
        self.assertEqual(bot.sent_calls[1][1]["message"], "- 网关：4200")
        self.assertEqual(len(delays), 2)

        # 3. Rich non-text segment arrays (e.g. image) pass through untouched
        rich_data: dict[str, Any] = {
            "group_id": 10001,
            "message": [{"type": "image", "data": {"file": "https://example.com/a.png"}}],
        }
        await nb_plugin.handle_calling_api_hook(bot, "send_group_msg", rich_data)
        self.assertEqual(rich_data["message"][0]["type"], "image")


if __name__ == "__main__":
    unittest.main()
