"""End-to-end unit & mock-AstrBot integration tests for astrbot_plugin_nb_speak (pytest + unittest)."""

from __future__ import annotations

import asyncio
import json
import os
import pathlib
import sys
import unittest
from typing import Any, List

PLUGIN_DIR = pathlib.Path(__file__).resolve().parents[1]
REPO_ROOT = PLUGIN_DIR.parents[1]
if str(PLUGIN_DIR) not in sys.path:
    sys.path.insert(0, str(PLUGIN_DIR))

import bubble_lint as plugin_bubble_lint  # noqa: E402
import formatter  # noqa: E402
import main as plugin_main  # noqa: E402


class FakeReplyComp:
    type = "Reply"

    def __init__(self, msg_id: str) -> None:
        self.id = msg_id


class FakeAtComp:
    type = "At"

    def __init__(self, qq: str) -> None:
        self.qq = qq


class FakeImageComp:
    type = "Image"

    def __init__(self, url: str) -> None:
        self.url = url


class FakeProviderRequest:
    def __init__(self, system_prompt: str = "你是灰之魔女伊蕾娜。") -> None:
        self.system_prompt = system_prompt


class FakeMessageResult:
    def __init__(self, chain: List[Any], *, llm_result: bool = True) -> None:
        self.chain = chain
        self._llm_result = llm_result

    def is_llm_result(self) -> bool:
        return self._llm_result


class FakeAstrMessageEvent:
    def __init__(
        self,
        chain: List[Any],
        *,
        platform_name: str = "aiocqhttp",
        llm_result: bool = True,
        fail_on_send_index: int | None = None,
    ) -> None:
        self._result = FakeMessageResult(chain, llm_result=llm_result)
        self._platform_name = platform_name
        self.unified_msg_origin = f"{platform_name}:GroupMessage:10001"
        self.sent_batches: List[List[Any]] = []
        self._fail_on_send_index = fail_on_send_index

    def get_platform_name(self) -> str:
        return self._platform_name

    def get_result(self) -> FakeMessageResult:
        return self._result

    def plain_result(self, text: str) -> FakeMessageResult:
        return FakeMessageResult([plugin_main.Comp.Plain(text)], llm_result=False)

    async def send(self, message_chain: Any) -> None:
        idx = len(self.sent_batches)
        if self._fail_on_send_index is not None and idx == self._fail_on_send_index:
            raise RuntimeError("Simulated OneBot network timeout")
        comps = getattr(message_chain, "chain", message_chain)
        self.sent_batches.append(list(comps))


class AstrBotPluginNbSpeakTests(unittest.TestCase):
    def test_metadata_schema_and_skill_sync_parity(self) -> None:
        meta_text = (PLUGIN_DIR / "metadata.yaml").read_text(encoding="utf-8")
        self.assertIn("name: astrbot_plugin_nb_speak", meta_text)
        self.assertIn('astrbot_version: ">=4.16.0"', meta_text)

        schema = json.loads((PLUGIN_DIR / "_conf_schema.json").read_text(encoding="utf-8"))
        self.assertIs(schema["enable_voice_notes"]["default"], False)
        self.assertIs(schema["tts_api_key"]["secret"], True)
        self.assertEqual(schema["persona_preset"]["default"], "keep_host")
        self.assertLessEqual(schema["tts_timeout_sec"]["default"], 8.0)
        self.assertEqual(schema["tts_timeout_sec"]["slider"]["max"], 8.0)

        canonical_lint = (REPO_ROOT / "skills" / "chat-human" / "scripts" / "bubble_lint.py").read_text(encoding="utf-8")
        bundled_lint = (PLUGIN_DIR / "bubble_lint.py").read_text(encoding="utf-8")
        self.assertEqual(bundled_lint, canonical_lint)
        self.assertTrue((PLUGIN_DIR / "skills" / "chat-human" / "SKILL.md").is_file())

    def test_breaks_past_150_char_cliff_without_slicing_code_fences_or_urls(self) -> None:
        long_reply = (
            "（叹气）好的！我来向你汇报一下今天下午线上订单接口慢查询的具体原因和完整修复步骤。"
            "首先是因为分页偏移量在大表上扫描了超过四十万行历史记录，导致主库读延迟飙到了四点二秒；"
            "其次我们可以直接在业务低峰或者白天在线无锁补建复合索引，参考文档 https://docs.example.com/db?page=1.2&mode=fast 即可。\n\n"
            "```sql\n"
            "-- 注释里有句号。还有问号？绝不能切碎！\n"
            "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_created\n"
            "  ON orders (tenant_id, created_at DESC);\n"
            "```\n\n"
            "建完索引再把深翻页改成游标分页就彻底稳了。希望这对你有帮助！"
        )
        self.assertGreater(len(long_reply), 180)

        plan = formatter.plan_outbound_segments(
            long_reply,
            platform_name="aiocqhttp",
            max_bubbles=4,
            target_bubble_cjk_chars=38,
        )

        self.assertTrue(plan.changed)
        self.assertGreaterEqual(len(plan.bubbles), 2)
        self.assertLessEqual(len(plan.bubbles), 4)
        self.assertEqual(len(plan.cards), 1)

        # Code block stays 100% intact despite internal Chinese periods and question marks
        code_card = plan.cards[0]
        self.assertIn("CREATE INDEX CONCURRENTLY", code_card)
        self.assertIn("-- 注释里有句号。还有问号？绝不能切碎！", code_card)

        joined_bubbles = "\n".join(plan.bubbles)
        self.assertNotIn("（叹气）", joined_bubbles)
        self.assertNotIn("希望这对你有帮助", joined_bubbles)
        self.assertIn("https://docs.example.com/db?page=1.2&mode=fast", joined_bubbles)

        error_codes = [i["code"] for i in plan.lint_issues if i["level"] == "error"]
        self.assertEqual(error_codes, [])

    def test_converts_pipe_tables_to_kv_on_qq_wechat_and_monospace_on_telegram(self) -> None:
        raw_with_table = (
            "两种建索引方式对比如下。\n\n"
            "| 方案 | 耗时 | 锁表 |\n"
            "|---|---|---|\n"
            "| 普通索引 | 38ms | 是 |\n"
            "| CONCURRENTLY | 38ms | 否 |"
        )

        qq_plan = formatter.plan_outbound_segments(raw_with_table, platform_name="weixin_oc")
        self.assertEqual(len(qq_plan.cards), 1)
        self.assertNotIn("|---|", qq_plan.cards[0])
        self.assertIn("- CONCURRENTLY — 耗时: 38ms · 锁表: 否", qq_plan.cards[0])
        # Trailing period on short opening beat stripped automatically
        self.assertEqual(qq_plan.bubbles, ["两种建索引方式对比如下"])

        tg_plan = formatter.plan_outbound_segments(raw_with_table, platform_name="telegram")
        self.assertEqual(len(tg_plan.cards), 1)
        self.assertTrue(tg_plan.cards[0].startswith("```text\n"))
        self.assertNotIn("|---|", tg_plan.cards[0])

    def test_preserves_coupled_pickup_code_and_strips_dangerous_code_period(self) -> None:
        coupled = formatter.plan_outbound_segments("北门丰巢07号柜\n取件码 663920。")
        self.assertEqual(len(coupled.segments), 1)
        self.assertEqual(coupled.segments[0].text, "北门丰巢07号柜\n取件码 663920")
        self.assertEqual(plugin_bubble_lint.lint_payload({"bubbles": coupled.bubbles}), [])

    def test_on_llm_request_injects_idempotent_cache_friendly_prompt_and_respects_host_persona(self) -> None:
        plugin = plugin_main.NbSpeakPlugin(context=None, config={"persona_preset": "keep_host"})
        req = FakeProviderRequest("你是傲娇魔女伊蕾娜。")

        asyncio.run(plugin.on_llm_request(None, req))
        self.assertIn("你是傲娇魔女伊蕾娜。", req.system_prompt)
        self.assertIn(formatter.PROMPT_MARKER, req.system_prompt)
        self.assertNotIn("语气基线：", req.system_prompt)

        # Second call on the same request is a strict no-op (idempotent)
        snapshot = req.system_prompt
        asyncio.run(plugin.on_llm_request(None, req))
        self.assertEqual(req.system_prompt, snapshot)

    def test_on_decorating_result_dispatches_via_event_send_preserves_headers_and_final_chain(self) -> None:
        plugin = plugin_main.NbSpeakPlugin(
            context=None,
            config={
                "enabled": True,
                "platform_mode": "auto",
                "max_bubbles": 4,
                "typing_delay_enabled": False,
                "enable_voice_notes": False,
            },
        )

        event = FakeAstrMessageEvent(
            [
                FakeReplyComp("msg_101"),
                FakeAtComp("905617992"),
                plugin_main.Comp.Plain("错误率 0.02% 没动，p99 降到 38ms。\n\n"),
                plugin_main.Comp.Plain("| 节点 | 状态 |\n|---|---|\n| 华东1 | 正常 |\n\n"),
                plugin_main.Comp.Plain("连接池水位也稳，直接推全量吧。<voice_note>早点下班休息</voice_note>"),
                FakeImageComp("https://example.com/chart.png"),
            ],
            platform_name="aiocqhttp",
        )

        asyncio.run(plugin.on_decorating_result(event))

        # 3 segments total: bubble 1 + KV table card sent via event.send(), final bubble + Image kept in result.chain
        self.assertEqual(len(event.sent_batches), 2)

        # First batch carries Reply + At + Bubble 1 (without trailing period)
        first_batch = event.sent_batches[0]
        self.assertIsInstance(first_batch[0], FakeReplyComp)
        self.assertIsInstance(first_batch[1], FakeAtComp)
        self.assertEqual(first_batch[2].text, "错误率 0.02% 没动，p99 降到 38ms")

        # Second batch carries converted QQ KV card without Reply/At duplication
        second_batch = event.sent_batches[1]
        self.assertEqual(len(second_batch), 1)
        self.assertIn("- 华东1：正常", second_batch[0].text)

        # Final result.chain holds Bubble 2 (with <voice_note> stripped because enable_voice_notes=False) + trailing Image
        final_chain = event.get_result().chain
        self.assertEqual(len(final_chain), 2)
        self.assertEqual(final_chain[0].text, "连接池水位也稳，直接推全量吧")
        self.assertIsInstance(final_chain[1], FakeImageComp)

    def test_on_decorating_result_recovers_without_losing_messages_if_send_raises(self) -> None:
        plugin = plugin_main.NbSpeakPlugin(
            context=None,
            config={"enabled": True, "typing_delay_enabled": False},
        )

        # Case A: failure on first segment restores original_chain intact
        ev_first_fail = FakeAstrMessageEvent(
            [plugin_main.Comp.Plain("第一句短话\n\n第二句短话")],
            fail_on_send_index=0,
        )
        asyncio.run(plugin.on_decorating_result(ev_first_fail))
        self.assertEqual(len(ev_first_fail.get_result().chain), 1)
        self.assertIn("第一句短话", ev_first_fail.get_result().chain[0].text)
        self.assertIn("第二句短话", ev_first_fail.get_result().chain[0].text)

        # Case B: failure on second segment keeps remaining unsent segments in result.chain
        ev_mid_fail = FakeAstrMessageEvent(
            [plugin_main.Comp.Plain("第一句已发出\n\n第二句遇抖动\n\n第三句收尾")],
            fail_on_send_index=1,
        )
        asyncio.run(plugin.on_decorating_result(ev_mid_fail))
        self.assertEqual(len(ev_mid_fail.sent_batches), 1)
        self.assertEqual(ev_mid_fail.sent_batches[0][0].text, "第一句已发出")
        recovered_tail = ev_mid_fail.get_result().chain[0].text
        self.assertIn("第二句遇抖动", recovered_tail)
        self.assertIn("第三句收尾", recovered_tail)

    def test_skips_non_llm_command_results_and_supports_nbspeak_status_command(self) -> None:
        plugin = plugin_main.NbSpeakPlugin(context=None, config={"only_llm_result": True})
        cmd_event = FakeAstrMessageEvent(
            [plugin_main.Comp.Plain("| 命令 | 说明 |\n|---|---|\n| /help | 帮助 |")],
            llm_result=False,
        )
        asyncio.run(plugin.on_decorating_result(cmd_event))
        self.assertEqual(len(cmd_event.sent_batches), 0)
        self.assertIn("|---|", cmd_event.get_result().chain[0].text)

        async def _collect_cmd() -> List[Any]:
            out = []
            async for item in plugin.nbspeak_status(cmd_event):
                out.append(item)
            return out

        replies = asyncio.run(_collect_cmd())
        self.assertEqual(len(replies), 1)
        self.assertIn("关闭（默认）", replies[0].chain[0].text)

    def test_opt_in_voice_note_synthesizes_wav_record_and_degrades_silently_on_error(self) -> None:
        plugin = plugin_main.NbSpeakPlugin(
            context=None,
            config={
                "enabled": True,
                "typing_delay_enabled": False,
                "enable_voice_notes": True,
                "tts_api_base": "http://127.0.0.1:9/v1",  # unreachable port -> must degrade silently
            },
        )
        ev_fail_tts = FakeAstrMessageEvent(
            [plugin_main.Comp.Plain("周四下午约上了<voice_note>外面风挺大的记得带外套</voice_note>")]
        )
        asyncio.run(plugin.on_decorating_result(ev_fail_tts))
        chain = ev_fail_tts.get_result().chain
        self.assertEqual(len(chain), 1)
        self.assertEqual(chain[0].text, "周四下午约上了")

        # Mock synthesize_openai_wav returning a real temp wav path
        fd, fake_wav = os.path.join(PLUGIN_DIR, "_tmp_test.wav"), None
        tmp_wav = pathlib.Path(PLUGIN_DIR) / "_tmp_test_voice.wav"
        tmp_wav.write_bytes(b"RIFF\x24\x00\x00\x00WAVEfmt ")
        orig_synth = plugin_main.synthesize_openai_wav

        async def _mock_synth(*_a: Any, **_kw: Any) -> str:
            return str(tmp_wav)

        plugin_main.synthesize_openai_wav = _mock_synth
        try:
            ev_ok_tts = FakeAstrMessageEvent(
                [plugin_main.Comp.Plain("周四下午约上了<voice_note>外面风挺大的记得带外套</voice_note>")]
            )
            asyncio.run(plugin.on_decorating_result(ev_ok_tts))
            ok_chain = ev_ok_tts.get_result().chain
            self.assertEqual(len(ok_chain), 2)
            self.assertEqual(ok_chain[0].text, "周四下午约上了")
            self.assertEqual(ok_chain[1].file, str(tmp_wav))
        finally:
            plugin_main.synthesize_openai_wav = orig_synth
            tmp_wav.unlink(missing_ok=True)

    def test_concurrent_multi_session_isolation_and_english_decimal_splitting(self) -> None:
        # 1. English multi-sentence paragraph splits cleanly without breaking decimals or URLs
        en_wall = (
            "Canary held steady at 0.02% error rate on v4.16.0 across https://api.example.com/v1?ratio=0.5 today. "
            "Replica lag stayed below 12ms throughout the traffic ramp and CPU never crossed forty percent. "
            "Connection pool headroom looks completely healthy so we can promote full production traffic right now."
        )
        en_plan = formatter.plan_outbound_segments(en_wall, platform_name="telegram", max_bubbles=4)
        self.assertGreaterEqual(len(en_plan.bubbles), 2)
        self.assertIn("0.02%", en_plan.bubbles[0])
        self.assertIn("v4.16.0", en_plan.bubbles[0])
        self.assertIn("https://api.example.com/v1?ratio=0.5", en_plan.bubbles[0])

        # 2. Concurrent multi-session isolation on a single shared Star instance
        plugin = plugin_main.NbSpeakPlugin(
            context=None,
            config={
                "enabled": True,
                "platform_mode": "auto",
                "max_bubbles": 4,
                "typing_delay_enabled": True,
                "typing_speed_multiplier": 50.0,
                "enable_voice_notes": False,
            },
        )

        ev_qq = FakeAstrMessageEvent(
            [
                FakeReplyComp("r_qq"),
                FakeAtComp("1001"),
                FakeAtComp("1002"),
                plugin_main.Comp.Plain("甲群排查完了。\n\n| 服务 | 状态 |\n|---|---|\n| 网关 | 正常 |"),
            ],
            platform_name="aiocqhttp",
        )
        ev_tg = FakeAstrMessageEvent(
            [
                plugin_main.Comp.Plain("TG rollout green.\n\n| Node | P99 |\n|---|---|\n| Edge | 9ms |"),
            ],
            platform_name="telegram",
        )
        ev_flaky = FakeAstrMessageEvent(
            [plugin_main.Comp.Plain("丙群第一句\n\n丙群第二句保底")],
            platform_name="weixin_oc",
            fail_on_send_index=0,
        )

        async def _run_all() -> None:
            await asyncio.gather(
                plugin.on_decorating_result(ev_qq),
                plugin.on_decorating_result(ev_tg),
                plugin.on_decorating_result(ev_flaky),
            )

        asyncio.run(_run_all())

        # QQ session preserved Reply + both At headers strictly on bubble 1 and KV card on bubble 2
        self.assertEqual(len(ev_qq.sent_batches), 1)
        self.assertEqual(len(ev_qq.sent_batches[0]), 4)
        self.assertEqual(ev_qq.sent_batches[0][-1].text, "甲群排查完了")
        self.assertIn("- 网关：正常", ev_qq.get_result().chain[0].text)

        # Telegram session got monospace code table independently without QQ KV leak
        self.assertEqual(len(ev_tg.sent_batches), 1)
        self.assertEqual(ev_tg.sent_batches[0][0].text, "TG rollout green")
        self.assertTrue(ev_tg.get_result().chain[0].text.startswith("```text\n"))

        # Flaky session recovered full original chain without affecting QQ or TG
        self.assertIn("丙群第一句", ev_flaky.get_result().chain[0].text)
        self.assertIn("丙群第二句保底", ev_flaky.get_result().chain[0].text)


if __name__ == "__main__":
    unittest.main()
