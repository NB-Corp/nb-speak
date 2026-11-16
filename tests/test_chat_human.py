import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPTS_DIR = REPO_ROOT / "skills" / "chat-human" / "scripts"


def _load_module(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bubble_lint = _load_module("bubble_lint", SCRIPTS_DIR / "bubble_lint.py")
proactive_gate = _load_module("proactive_gate", SCRIPTS_DIR / "proactive_gate.py")


class BubbleLintTests(unittest.TestCase):
    def test_nb_speak_send_message_bubbles_and_voice_note_passes(self) -> None:
        payload = {
            "bubbles": [
                "Staging deploy went through, auth latency dropped to 40ms",
                "Flip prod tonight or hold till morning",
            ],
            "voice_note": {
                "text": "Dashboard stayed quiet for ten minutes straight. Totally fine waiting till morning if you already closed your laptop.",
                "emotion": "calm",
            },
            "end_turn": true_bool(),
        }
        issues = bubble_lint.lint_payload(payload)
        self.assertEqual(issues, [])

    def test_clean_multi_bubble_with_complementary_tts_passes(self) -> None:
        payload = {
            "messages": [
                {"text": "周四下午窗口约上了"},
                {
                    "text": "四页打印稿放桌面，过去签个字就行",
                    "voice_mode": "append",
                    "tts": {
                        "voice": "default",
                        "text": "外头今天风挺大的。下午出门记得带件外套呀。",
                    },
                },
            ]
        }
        issues = bubble_lint.lint_payload(payload)
        self.assertEqual(issues, [])

    def test_plain_reply_surface_preserves_coupled_lines_and_blank_line_beats(self) -> None:
        coupled = bubble_lint.parse_payload("北门丰巢07号柜\n取件码 663920", surface="plain")
        self.assertEqual(len(coupled["messages"]), 1)
        self.assertEqual(bubble_lint.lint_payload(coupled), [])

        two_beats = bubble_lint.parse_payload("错误率0.02%没动，p99降到38ms\n\n连接池也稳，直接全量吧", surface="plain")
        self.assertEqual(len(two_beats["messages"]), 2)
        self.assertEqual(bubble_lint.lint_payload(two_beats), [])

    def test_plain_reply_catches_leaked_json_and_bubble_labels(self) -> None:
        leaked_json = bubble_lint.parse_payload('{"bubbles": ["点啊"]}', surface="plain")
        codes_json = {item["code"] for item in bubble_lint.lint_payload(leaked_json)}
        self.assertIn("plain.meta_leak", codes_json)

        leaked_label = bubble_lint.parse_payload("Bubble 1: Staging is green\n\nBubble 2: Ship it", surface="plain")
        codes_label = {item["code"] for item in bubble_lint.lint_payload(leaked_label)}
        self.assertIn("plain.meta_leak", codes_label)

    def test_catches_trailing_periods_on_short_beats_and_codes(self) -> None:
        code_period = {"bubbles": ["北门丰巢07号柜，取件码663920。"]}
        codes_1 = {item["code"] for item in bubble_lint.lint_payload(code_period)}
        self.assertIn("style.trailing_period", codes_1)

        all_periods = {
            "bubbles": [
                "已确认全量完成，健康检查全部通过。",
                "连接池有异常我会直接通知你。",
            ]
        }
        codes_2 = {item["code"] for item in bubble_lint.lint_payload(all_periods)}
        self.assertIn("style.trailing_period", codes_2)

    def test_catches_system_error_and_placeholder_leaks(self) -> None:
        payload = {
            "messages": [
                {"text": "语音没发出去，这台机器的语音合成插件没配好，{{user}}先看文字"}
            ]
        }
        codes = {item["code"] for item in bubble_lint.lint_payload(payload)}
        self.assertIn("style.system_error_leak", codes)
        self.assertIn("style.placeholder_leak", codes)

    def test_catches_batch_root_tts_duplication(self) -> None:
        payload = {
            "voice_mode": "append",
            "tts": {"text": "Testing root duplication."},
            "messages": [
                {"text": "Staging is green"},
                {"text": "Ready to ship"},
            ],
        }
        codes = {item["code"] for item in bubble_lint.lint_payload(payload)}
        self.assertIn("tts.batch_root_duplication", codes)

    def test_catches_verbatim_tts_paraphrase_and_raw_tokens(self) -> None:
        payload = {
            "bubbles": [
                "Staging deploy went through, auth latency dropped to 40ms",
                "Check the report",
            ],
            "voice_note": {
                "text": "Staging deploy went through, auth latency dropped to 40.5ms at https://example.com/log"
            },
        }
        codes = {item["code"] for item in bubble_lint.lint_payload(payload)}
        self.assertIn("tts.verbatim_overlap", codes)
        self.assertIn("tts.raw_path_or_url", codes)
        self.assertIn("tts.unnormalized_numbers", codes)

    def test_catches_markdown_stage_brackets_steward_cliche_and_emoji_policy(self) -> None:
        payload = {
            "bubbles": [
                "*sighs* 向你汇报，我已经顺手替你改好啦 ✨\n1. 第一项\n2. 第二项",
                "清单也整理好啦！",
            ]
        }
        codes = {item["code"] for item in bubble_lint.lint_payload(payload, persona_emoji="deny")}
        self.assertIn("bubble.markdown_structure", codes)
        self.assertIn("style.stage_brackets", codes)
        self.assertIn("style.steward_cliche", codes)
        self.assertIn("style.unicode_emoji", codes)
        self.assertIn("style.particle_spam", codes)

        allowed_codes = {item["code"] for item in bubble_lint.lint_payload(payload, persona_emoji="allow")}
        self.assertNotIn("style.unicode_emoji", allowed_codes)


def true_bool() -> bool:
    return True


class ProactiveGateTests(unittest.TestCase):
    def test_force_trigger_cooldown_and_ack_reset(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            state_file = pathlib.Path(tmp) / "gate.json"
            rc = proactive_gate.main(
                ["--state-file", str(state_file), "check", "--ignore-quiet", "--force", "--no-stdin", "--format", "json"]
            )
            self.assertEqual(rc, 0)
            state = json.loads(state_file.read_text(encoding="utf-8"))
            self.assertEqual(state["daily_count"], 1)
            self.assertEqual(state["unanswered_streak"], 1)

            rc_cooldown = proactive_gate.main(
                ["--state-file", str(state_file), "check", "--ignore-quiet", "--prob", "1.0", "--no-stdin"]
            )
            self.assertEqual(rc_cooldown, 4)

            rc_ack = proactive_gate.main(["--state-file", str(state_file), "ack-user"])
            self.assertEqual(rc_ack, 0)
            state_after = json.loads(state_file.read_text(encoding="utf-8"))
            self.assertEqual(state_after["unanswered_streak"], 0)

    def test_silence_decay_reduces_probability(self) -> None:
        p0 = proactive_gate.compute_dynamic_probability(0.30, 7200, unanswered_streak=0)
        p2 = proactive_gate.compute_dynamic_probability(0.30, 7200, unanswered_streak=2)
        p3 = proactive_gate.compute_dynamic_probability(0.30, 7200, unanswered_streak=3)
        self.assertGreater(p0, p2)
        self.assertGreater(p2, p3)


if __name__ == "__main__":
    unittest.main()
