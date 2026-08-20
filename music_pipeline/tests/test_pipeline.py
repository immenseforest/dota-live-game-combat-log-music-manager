import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = ROOT / "scripts" / "compose_pack.py"
ANALYZE = ROOT / "scripts" / "analyze_references.py"


class PipelineTests(unittest.TestCase):
    def render(self, folder: Path) -> dict:
        subprocess.run([sys.executable, str(COMPOSE), "--output", str(folder)], check=True, capture_output=True)
        return json.loads((folder / "manifest.json").read_text(encoding="utf-8"))

    def test_rendered_pack_contract_and_audio(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            manifest = self.render(output)
            self.assertEqual(set(manifest["states"]), {"cozy", "epic", "war"})
            self.assertEqual(manifest["license"], "CC0-1.0")
            self.assertIn("no samples", manifest["provenance"])
            for item in list(manifest["states"].values()) + list(manifest["stingers"].values()):
                path = output / item["file"]
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), item["sha256"])
                with wave.open(str(path), "rb") as wav:
                    self.assertEqual((wav.getnchannels(), wav.getsampwidth(), wav.getframerate()), (1, 2, 16_000))
                    self.assertGreater(wav.getnframes(), 16_000)

    def test_generation_is_deterministic(self):
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            a, b = self.render(Path(first)), self.render(Path(second))
            self.assertEqual(a, b)

    def test_no_reference_audio_is_shipped(self):
        wavs = {path.name for path in ROOT.rglob("*.wav")}
        self.assertEqual(wavs, {"cozy_loop.wav", "epic_loop.wav", "war_loop.wav", "stinger_up.wav", "stinger_down.wav"})

    def test_analyzer_retains_only_safe_aggregate_fields(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            self.render(folder)
            report_path = folder / "report.json"
            subprocess.run(
                [sys.executable, str(ANALYZE), str(folder / "cozy_loop.wav"), "--output", str(report_path)],
                check=True,
                capture_output=True,
            )
            report = json.loads(report_path.read_text(encoding="utf-8"))
            serialized = json.dumps(report).lower()
            self.assertEqual(report["source_count"], 1)
            self.assertNotIn("cozy_loop", serialized)
            for forbidden in ("pitch", "melody", "chroma", "fingerprint", "key_signature"):
                self.assertNotIn(f'"{forbidden}"', serialized)
            self.assertGreater(report["measurements"][0]["duration_seconds"], 1)


if __name__ == "__main__":
    unittest.main()
