from __future__ import annotations

import asyncio
import json
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
    def __init__(
        self,
        adapter_name: str = "OneBot V11",
        *,
        fail_on_call_index: int | None = None,
    ) -> None:
        self.adapter = _FakeAdapter(adapter_name)
        self.sent_calls: list[tuple[str, dict[str, Any]]] = []
        self._fail_on_call_index = fail_on_call_index
        self._call_counter = 0

    async def call_api(self, api: str, **data: Any) -> dict[str, Any]:
        # Run the hook just like NoneBot2 BaseBot.call_api to verify ContextVar re-entrancy
        await nb_plugin.handle_calling_api_hook(self, api, data, sleep_fn=self._noop_sleep)
        idx = self._call_counter
        self._call_counter += 1
        if self._fail_on_call_index is not None and idx == self._fail_on_call_index:
            raise RuntimeError("OneBot ActionFailed: rate limited")
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

        # 3. Pure image segment array passes through untouched
        rich_data: dict[str, Any] = {
            "group_id": 10001,
            "message": [{"type": "image", "data": {"file": "https://example.com/a.png"}}],
        }
        await nb_plugin.handle_calling_api_hook(bot, "send_group_msg", rich_data)
        self.assertEqual(rich_data["message"][0]["type"], "image")

    async def test_preserves_reply_at_and_image_across_segment_lists_cq_strings_telegram_and_feishu(self) -> None:
        # 1. OneBot V11 / V12 mixed segment list: reply + at + pipe table + image
        ob_bot = _FakeBot("OneBot V11")
        mixed_seg_data: dict[str, Any] = {
            "group_id": 20002,
            "message": [
                {"type": "reply", "data": {"id": "77"}},
                {"type": "at", "data": {"qq": "9001"}},
                {"type": "text", "data": {"text": " "}},
                {"type": "text", "data": {"text": "排查完了。\n\n| 服务 | 延迟 |\n|---|---|\n| 鉴权 | 19ms |"}},
                {"type": "image", "data": {"file": "https://example.com/trace.png"}},
            ],
        }
        with self.assertRaises(nb_plugin.MockApiException):
            await nb_plugin.handle_calling_api_hook(
                ob_bot,
                "send_msg",
                mixed_seg_data,
                sleep_fn=ob_bot._noop_sleep,
            )
        self.assertEqual(len(ob_bot.sent_calls), 3)
        first_msg = ob_bot.sent_calls[0][1]["message"]
        self.assertEqual([s["type"] for s in first_msg], ["reply", "at", "text", "text"])
        self.assertEqual(first_msg[-1]["data"]["text"], "排查完了")
        # Bubble 2 & 3 do NOT repeat reply/at
        self.assertEqual(ob_bot.sent_calls[1][1]["message"], [{"type": "text", "data": {"text": "- 鉴权：19ms"}}])
        self.assertEqual(ob_bot.sent_calls[2][1]["message"][0]["type"], "image")

        # 2. CQ-code string with [CQ:reply] + [CQ:at] + [CQ:image]
        cq_bot = _FakeBot("OneBot V11")
        cq_data: dict[str, Any] = {
            "group_id": 20002,
            "message": "[CQ:reply,id=88][CQ:at,qq=9001] 结论稳了。\n\n| 节点 | 状态 |\n|---|---|\n| 缓存 | 正常 |[CQ:image,file=a.png]",
        }
        with self.assertRaises(nb_plugin.MockApiException):
            await nb_plugin.handle_calling_api_hook(cq_bot, "send_group_msg", cq_data, sleep_fn=cq_bot._noop_sleep)
        self.assertEqual(len(cq_bot.sent_calls), 3)
        self.assertEqual(cq_bot.sent_calls[0][1]["message"], "[CQ:reply,id=88][CQ:at,qq=9001] 结论稳了")
        self.assertEqual(cq_bot.sent_calls[1][1]["message"], "- 缓存：正常")
        self.assertEqual(cq_bot.sent_calls[2][1]["message"], "[CQ:image,file=a.png]")

        # 3. Telegram: keeps reply_to_message_id ONLY on bubble 1 and formats compact table as monospace code block
        tg_bot = _FakeBot("Telegram")
        tg_data: dict[str, Any] = {
            "chat_id": -100123,
            "reply_to_message_id": 555,
            "text": "Rollout complete.\n\n| Node | Latency |\n|---|---|\n| Edge | 12ms |",
        }
        with self.assertRaises(nb_plugin.MockApiException):
            await nb_plugin.handle_calling_api_hook(tg_bot, "send_message", tg_data, sleep_fn=tg_bot._noop_sleep)
        self.assertEqual(len(tg_bot.sent_calls), 2)
        self.assertEqual(tg_bot.sent_calls[0][1]["reply_to_message_id"], 555)
        self.assertNotIn("reply_to_message_id", tg_bot.sent_calls[1][1])
        self.assertTrue(tg_bot.sent_calls[1][1]["text"].startswith("```text\n"))

        # 4. Feishu / Lark: preserves valid JSON `{"text": "..."}` envelope on every bubble
        lark_bot = _FakeBot("Feishu")
        lark_data: dict[str, Any] = {
            "receive_id_type": "chat_id",
            "body": {
                "receive_id": "oc_123",
                "msg_type": "text",
                "content": json.dumps({"text": "审批已过。\n\n| 环境 | 状态 |\n|---|---|\n| 生产 | 绿灯 |"}, ensure_ascii=False),
            },
        }
        with self.assertRaises(nb_plugin.MockApiException):
            await nb_plugin.handle_calling_api_hook(lark_bot, "im/v1/messages", lark_data, sleep_fn=lark_bot._noop_sleep)
        self.assertEqual(len(lark_bot.sent_calls), 2)
        b1_json = json.loads(lark_bot.sent_calls[0][1]["body"]["content"])
        b2_json = json.loads(lark_bot.sent_calls[1][1]["body"]["content"])
        self.assertEqual(b1_json["text"], "审批已过")
        self.assertEqual(b2_json["text"], "- 生产：绿灯")

    async def test_concurrent_two_group_sends_do_not_interfere_and_mid_send_errors_recover_safely(self) -> None:
        # 1. Concurrency test: two groups sending simultaneously with real async yields
        concurrent_bot = _FakeBot("OneBot V11")

        async def tiny_sleep(_sec: float) -> None:
            await asyncio.sleep(0.005)

        async def _send_for_group(gid: int, label: str) -> Any:
            payload: dict[str, Any] = {
                "group_id": gid,
                "message": f"{label}第一句。\n\n| 组号 | 状态 |\n|---|---|\n| G{gid} | 正常 |",
            }
            try:
                await nb_plugin.handle_calling_api_hook(
                    concurrent_bot,
                    "send_group_msg",
                    payload,
                    sleep_fn=tiny_sleep,
                )
            except nb_plugin.MockApiException as exc:
                return exc.result
            return None

        r_a, r_b = await asyncio.gather(_send_for_group(10001, "甲群"), _send_for_group(20002, "乙群"))
        self.assertIsNotNone(r_a)
        self.assertIsNotNone(r_b)
        self.assertEqual(len(concurrent_bot.sent_calls), 4)
        group_10001_msgs = [c[1]["message"] for c in concurrent_bot.sent_calls if c[1]["group_id"] == 10001]
        group_20002_msgs = [c[1]["message"] for c in concurrent_bot.sent_calls if c[1]["group_id"] == 20002]
        self.assertEqual(group_10001_msgs, ["甲群第一句", "- G10001：正常"])
        self.assertEqual(group_20002_msgs, ["乙群第一句", "- G20002：正常"])

        # 2. Failure on Bubble 2 (index 1) returns Bubble 1's receipt via MockApiException instead of crashing Matcher
        flaky_bot = _FakeBot("OneBot V11", fail_on_call_index=1)
        flaky_data: dict[str, Any] = {
            "group_id": 30003,
            "message": "首泡已发出。\n\n第二泡遇风控。",
        }
        with self.assertRaises(nb_plugin.MockApiException) as exc_info:
            await nb_plugin.handle_calling_api_hook(
                flaky_bot,
                "send_group_msg",
                flaky_data,
                sleep_fn=flaky_bot._noop_sleep,
            )
        self.assertEqual(exc_info.exception.result, {"message_id": 1})
        self.assertEqual(len(flaky_bot.sent_calls), 1)
        self.assertEqual(flaky_bot.sent_calls[0][1]["message"], "首泡已发出")

        # 3. Failure on Bubble 1 (index 0) falls back to single-shot rewritten `data` without raising
        down_bot = _FakeBot("OneBot V11", fail_on_call_index=0)
        down_data: dict[str, Any] = {
            "group_id": 30003,
            "message": "（叹气）首泡直接断连。\n\n第二泡合并兜底。",
        }
        await nb_plugin.handle_calling_api_hook(
            down_bot,
            "send_group_msg",
            down_data,
            sleep_fn=down_bot._noop_sleep,
        )
        self.assertEqual(down_data["message"], "首泡直接断连\n\n第二泡合并兜底")


if __name__ == "__main__":
    unittest.main()
