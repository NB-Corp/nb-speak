from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

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


if __name__ == "__main__":
    unittest.main()
