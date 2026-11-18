from __future__ import annotations

import asyncio
import http.server
import importlib.util
import socketserver
import threading
import time
import unittest
from pathlib import Path
from typing import Any

TESTS_DIR = Path(__file__).resolve().parent
FILTER_PATH = TESTS_DIR.parent / "nb_speak_filter.py"

_SPEC = importlib.util.spec_from_file_location("nb_speak_openwebui_filter", FILTER_PATH)
assert _SPEC and _SPEC.loader
_MOD = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MOD)
Filter = _MOD.Filter


class OpenWebUIFilterTests(unittest.TestCase):
    def test_header_docstring_and_valves_defaults(self) -> None:
        raw_source = FILTER_PATH.read_text(encoding="utf-8")
        self.assertIn("title: NB Speak — Human IM Bubbles & Table Gate", raw_source)
        self.assertIn("author: NB-Corp", raw_source)
        self.assertIn("author_url: https://github.com/NB-Corp/nb-speak", raw_source)
        self.assertIn("version: 0.2.0", raw_source)

        flt = Filter()
        self.assertFalse(flt.valves.enable_voice_notes)
        self.assertTrue(flt.valves.enabled)
        self.assertLessEqual(flt.valves.tts_timeout_sec, 8.0)

        uv = Filter.UserValves()
        self.assertIsNone(uv.enabled)
        self.assertIsNone(uv.enable_voice_notes)
        self.assertEqual(uv.persona, "inherit")
        self.assertEqual(uv.table_mode, "inherit")

    def test_inlet_injects_once_and_outlet_converts_pipe_tables_and_protects_code(self) -> None:
        flt = Filter()
        body = {
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": "Compare Redis vs Postgres for session locks"}],
        }
        inlet_res = flt.inlet(body)
        self.assertEqual(len(inlet_res["messages"]), 2)
        self.assertEqual(inlet_res["messages"][0]["role"], "system")
        self.assertIn("[nb-speak/1 · chat-human]", inlet_res["messages"][0]["content"])
        self.assertNotIn("<voice_note>", inlet_res["messages"][0]["content"])

        # Idempotent on second pass
        inlet_twice = flt.inlet(inlet_res)
        self.assertEqual(len(inlet_twice["messages"]), 2)

        assistant_wall = (
            "*sighs* Bubble 1: ### Lock Comparison\n\n"
            "Redis wins on pure sub-millisecond TTL leases.\n\n"
            "| Engine | Lease Latency |\n"
            "|---|---|\n"
            "| Redis | 0.4ms |\n"
            "| Postgres | 2.8ms |\n\n"
            "```sql\nSELECT pg_try_advisory_lock(42);\n```\n\n"
            "Let me know if you need anything else!"
        )
        reply_body = {
            "messages": [
                *inlet_res["messages"],
                {"role": "assistant", "content": assistant_wall},
            ]
        }
        outlet_res = flt.outlet(reply_body)
        cleaned = outlet_res["messages"][-1]["content"]
        self.assertNotIn("*sighs*", cleaned)
        self.assertNotIn("Bubble 1:", cleaned)
        self.assertNotIn("Let me know if you need anything", cleaned)
        self.assertNotIn("|---|", cleaned)
        self.assertIn("- Redis: 0.4ms", cleaned)
        self.assertIn("```sql\nSELECT pg_try_advisory_lock(42);\n```", cleaned)

        # Idempotent on second outlet pass
        outlet_twice = flt.outlet(outlet_res)
        self.assertEqual(outlet_twice["messages"][-1]["content"], cleaned)

    def test_multimodal_content_lists_preserved_without_type_error_or_image_loss(self) -> None:
        flt = Filter()
        img_part = {
            "type": "image_url",
            "image_url": {"url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB"},
        }
        multimodal_body = {
            "model": "gpt-4o",
            "messages": [
                {
                    "role": "system",
                    "content": [
                        {"type": "text", "text": "You are an architecture reviewer."},
                        {"type": "cache_control", "ephemeral": True},
                    ],
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Inspect this latency flamegraph."},
                        img_part,
                    ],
                },
            ],
        }

        after_inlet = flt.inlet(multimodal_body)
        # System message remains a list[dict], never flattened via str(list)
        sys_parts = after_inlet["messages"][0]["content"]
        self.assertIsInstance(sys_parts, list)
        self.assertEqual(len(sys_parts), 3)
        self.assertEqual(sys_parts[1], {"type": "cache_control", "ephemeral": True})
        self.assertIn("[nb-speak/1 · chat-human]", sys_parts[2]["text"])

        # User multimodal image array stays 100% intact
        user_parts = after_inlet["messages"][1]["content"]
        self.assertIsInstance(user_parts, list)
        self.assertEqual(user_parts[1], img_part)

        # Second inlet call detects marker inside multimodal system list and skips duplicate injection
        after_inlet_2 = flt.inlet(after_inlet)
        self.assertEqual(len(after_inlet_2["messages"][0]["content"]), 3)

        # Multimodal assistant reply with both image output and raw Markdown pipe table
        assistant_mm = {
            "messages": [
                *after_inlet["messages"],
                {
                    "role": "assistant",
                    "content": [
                        img_part,
                        {
                            "type": "text",
                            "text": "（微笑）瓶颈在锁竞争。\n\n| 阶段 | 耗时 |\n|---|---|\n| 锁等待 | 190ms |\n\n希望这对你有帮助！",
                        },
                    ],
                },
            ]
        }
        after_outlet = flt.outlet(assistant_mm)
        out_parts = after_outlet["messages"][-1]["content"]
        self.assertIsInstance(out_parts, list)
        self.assertEqual(out_parts[0], img_part)
        self.assertEqual(out_parts[1]["text"], "瓶颈在锁竞争\n\n- 锁等待: 190ms")

    def test_user_valves_override_and_web_clean_table_mode_and_code_fence_safety(self) -> None:
        flt = Filter()
        flt.valves.max_bubbles = 2
        flt.valves.emit_status = True

        # 1. Per-user disabled UserValves completely bypasses inlet/outlet
        raw_body = {
            "messages": [
                {"role": "assistant", "content": "| Col A | Col B |\n|---|---|\n| 1 | 2 |"},
            ]
        }
        disabled_user = {"id": "u_off", "valves": Filter.UserValves(enabled=False)}
        self.assertIs(flt.outlet(raw_body, __user__=disabled_user), raw_body)

        # 2. web_clean keeps compact <=3-col tables intact while converting wide tables to KV cards
        web_user = {"id": "u_web", "valves": Filter.UserValves(persona="sharp_lead", table_mode="web_clean")}
        inlet_sharp = flt.inlet({"messages": [{"role": "user", "content": "hi"}]}, __user__=web_user)
        self.assertIn("decisive tech lead", inlet_sharp["messages"][0]["content"])

        emitted: list[dict[str, Any]] = []

        async def async_emitter(ev: dict[str, Any]) -> None:
            emitted.append(ev)

        async def _run_outlet_with_async_emitter() -> dict[str, Any]:
            res = flt.outlet(
                {
                    "messages": [
                        {
                            "role": "assistant",
                            "content": (
                                "第一段结论先给。\n\n"
                                "第二段补充背景。\n\n"
                                "```sql\nSELECT 1;\n```\n\n"
                                "第三段收尾建议。\n\n"
                                "| A | B |\n|---|---|\n| x | y |\n\n"
                                "| Service | Region | Primary | Replica | Rollback |\n"
                                "|---|---|---|---|---|\n"
                                "| AuthGateway | ap-east-1 | 18ms | 22ms | instant-flag |"
                            ),
                        }
                    ]
                },
                __user__=web_user,
                __event_emitter__=async_emitter,
            )
            await asyncio.sleep(0)
            return res

        out = asyncio.run(_run_outlet_with_async_emitter())
        rendered = out["messages"][-1]["content"]
        # Overflow beat merged into beat 2 BEFORE code card, never glued onto ``` closing fence!
        self.assertIn("```sql\nSELECT 1;\n```", rendered)
        self.assertNotIn("```；", rendered)
        self.assertIn("第二段补充背景；第三段收尾建议", rendered)
        # Compact 2-col table kept as clean GFM table, wide 5-col table converted to KV card
        self.assertIn("| A | B |", rendered)
        self.assertIn("- AuthGateway — Region: ap-east-1", rendered)
        self.assertEqual(len(emitted), 1)
        self.assertTrue(emitted[0]["data"]["done"])

    def test_optional_tts_hard_timeout_and_error_fallback_preserve_text(self) -> None:
        class _TtsHandler(http.server.BaseHTTPRequestHandler):
            mode = "ok"

            def do_POST(self) -> None:  # noqa: N802
                _ = self.rfile.read(int(self.headers.get("Content-Length", "0")))
                if self.mode == "slow":
                    time.sleep(1.5)
                    return
                if self.mode == "500":
                    self.send_response(500)
                    self.end_headers()
                    return
                self.send_response(200)
                self.send_header("Content-Type", "audio/wav")
                self.end_headers()
                self.wfile.write(b"RIFF\x24\x00\x00\x00WAVEfmt ")

            def log_message(self, *_args: Any) -> None:
                return

        with socketserver.TCPServer(("127.0.0.1", 0), _TtsHandler) as httpd:
            port = httpd.server_address[1]
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            try:
                flt = Filter()
                flt.valves.enable_voice_notes = True
                flt.valves.tts_api_base = f"http://127.0.0.1:{port}/v1"
                flt.valves.tts_timeout_sec = 99.0  # Must clamp strictly to <= 8.0s

                eff = flt._resolve_settings(None)
                self.assertEqual(eff.tts_timeout_sec, 8.0)

                msg_body = {
                    "messages": [
                        {
                            "role": "assistant",
                            "content": "金丝雀已经稳了。<voice_note>盯着大盘二十分钟零报错，放心去吃饭吧</voice_note>",
                        }
                    ]
                }

                # 1. 200 OK -> embeds inline <audio> player alongside clean text
                _TtsHandler.mode = "ok"
                ok_out = flt.outlet(msg_body)
                self.assertIn("金丝雀已经稳了", ok_out["messages"][-1]["content"])
                self.assertIn("<audio controls src=\"data:audio/wav;base64,", ok_out["messages"][-1]["content"])

                # 2. HTTP 500 -> instant pure-text fallback, zero crash or leaked tag
                _TtsHandler.mode = "500"
                err_out = flt.outlet(msg_body)
                self.assertEqual(err_out["messages"][-1]["content"], "金丝雀已经稳了")

                # 3. Hung server -> hard timeout aborts promptly and returns pure text intact
                _TtsHandler.mode = "slow"
                flt.valves.tts_timeout_sec = 0.25
                t0 = time.monotonic()
                slow_out = flt.outlet(msg_body)
                elapsed = time.monotonic() - t0
                self.assertLess(elapsed, 0.9)
                self.assertEqual(slow_out["messages"][-1]["content"], "金丝雀已经稳了")
            finally:
                httpd.shutdown()


if __name__ == "__main__":
    unittest.main()
