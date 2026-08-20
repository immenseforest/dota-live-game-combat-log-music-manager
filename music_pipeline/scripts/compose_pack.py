#!/usr/bin/env python3
"""Deterministically synthesize an original, CC0 adaptive game-music pack."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import struct
import wave
from pathlib import Path

RATE = 16_000
SEED = 0xD07A2026
VERSION = "1.0.0"
TAU = 2.0 * math.pi


def hz(note: int) -> float:
    return 440.0 * (2.0 ** ((note - 69) / 12.0))


def tri(phase: float) -> float:
    return 2.0 / math.pi * math.asin(math.sin(phase))


def softclip(value: float) -> float:
    return math.tanh(value * 1.15) / math.tanh(1.15)


def envelope(beat: float, attack: float = 0.06, decay: float = 0.7) -> float:
    local = beat % 1.0
    return min(1.0, local / attack) * math.exp(-local / decay)


def drum(t: float, beat: float, subdivision: float, rng: random.Random, bright: bool = False) -> float:
    phase = (beat / subdivision) % 1.0
    if phase > 0.18:
        return 0.0
    decay = math.exp(-phase * (32.0 if bright else 20.0))
    noise = rng.uniform(-1.0, 1.0)
    tone = math.sin(TAU * (75.0 - 38.0 * phase) * t)
    return decay * (0.65 * tone + (0.45 if bright else 0.18) * noise)


def render_state(name: str, bpm: int, bars: int, seed: int) -> list[float]:
    beats_total = bars * 4
    seconds = beats_total * 60.0 / bpm
    count = round(seconds * RATE)
    rng = random.Random(seed)
    # Original pitch material: suspended/open voicings avoid a melody-led texture.
    chords = {
        "cozy": [(50, 57, 62, 66), (47, 54, 59, 64), (43, 50, 57, 62), (45, 52, 59, 64)],
        "epic": [(45, 52, 57, 62), (41, 48, 53, 60), (43, 50, 55, 62), (40, 47, 52, 59)],
        "war": [(38, 45, 50, 51), (38, 44, 50, 51), (36, 43, 48, 49), (40, 46, 52, 53)],
    }[name]
    samples: list[float] = []
    for i in range(count):
        t = i / RATE
        beat = t * bpm / 60.0
        chord = chords[min(int(beat // 4), bars - 1) % len(chords)]
        pad = sum(tri(TAU * hz(n) * t + j * 0.37) for j, n in enumerate(chord)) / len(chord)
        bass_note = chord[0] - 12
        bass = math.sin(TAU * hz(bass_note) * t) * (0.55 + 0.45 * envelope(beat, 0.1, 0.9))
        if name == "cozy":
            brush_gate = math.exp(-((beat % 2.0) / 0.22))
            value = 0.35 * pad + 0.25 * bass + 0.035 * brush_gate * rng.uniform(-1, 1)
        elif name == "epic":
            pulse = math.sin(TAU * hz(chord[1] + 12) * t) * envelope(beat * 2.0, 0.04, 0.35)
            value = 0.38 * pad + 0.27 * bass + 0.15 * pulse + 0.16 * drum(t, beat, 1.0, rng)
        else:
            ostinato_note = chord[0] + (12 if int(beat * 2) % 4 in (0, 3) else 19)
            ostinato = tri(TAU * hz(ostinato_note) * t) * envelope(beat * 2, 0.025, 0.24)
            value = 0.26 * pad + 0.25 * bass + 0.23 * ostinato
            value += 0.25 * drum(t, beat, 0.5, rng, bright=int(beat * 2) % 4 == 3)
        # A short wraparound cross-blend keeps the mathematical loop boundary quiet.
        edge = min(i, count - 1 - i) / max(1, int(RATE * 0.025))
        samples.append(softclip(value * min(1.0, 0.35 + 0.65 * edge)))
    return samples


def render_stinger(up: bool, seed: int) -> list[float]:
    rng = random.Random(seed)
    seconds = 2.0
    notes = (50, 57, 62, 69) if up else (62, 57, 50, 45)
    out = []
    for i in range(round(seconds * RATE)):
        t = i / RATE
        idx = min(3, int(t / 0.35))
        local = t - idx * 0.35
        amp = math.exp(-max(0.0, local) * 3.2) if local >= 0 else 0.0
        tone = math.sin(TAU * hz(notes[idx]) * t) + 0.35 * math.sin(TAU * hz(notes[idx] + 12) * t)
        impact = rng.uniform(-1, 1) * math.exp(-t * 12.0)
        out.append(softclip((0.32 * tone * amp + 0.12 * impact) * math.exp(-max(0, t - 1.4) * 4)))
    return out


def write_wav(path: Path, samples: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = b"".join(struct.pack("<h", max(-32767, min(32767, round(v * 32767)))) for v in samples)
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(pcm)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(output: Path) -> dict:
    specs = {"cozy": (80, 4, 0.25), "epic": (96, 4, 0.62), "war": (120, 4, 0.95)}
    tracks = {}
    for index, (name, (bpm, bars, intensity)) in enumerate(specs.items()):
        filename = f"{name}_loop.wav"
        path = output / filename
        write_wav(path, render_state(name, bpm, bars, SEED + index))
        tracks[name] = {
            "file": filename, "bpm": bpm, "meter": "4/4", "bars": bars,
            "intensity": intensity, "duration_seconds": bars * 4 * 60 / bpm,
            "crossfade_ms": 120, "transition_quantization": "next_bar",
            "allowed_next": [other for other in specs if other != name], "sha256": sha256(path),
        }
    stingers = {}
    for index, name in enumerate(("up", "down")):
        filename = f"stinger_{name}.wav"
        path = output / filename
        write_wav(path, render_stinger(name == "up", SEED + 100 + index))
        stingers[name] = {"file": filename, "sha256": sha256(path)}
    manifest = {
        "schema_version": 1, "pack_id": "original_adaptive_dota_stream_pack",
        "title": "Hearth to Frontline", "generator_version": VERSION,
        "seed": SEED, "sample_rate": RATE, "channels": 1, "sample_width_bits": 16,
        "license": "CC0-1.0", "provenance": "100% synthesis; no samples, recordings, or reference melodies",
        "states": tracks, "stingers": stingers,
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "rendered")
    args = parser.parse_args()
    manifest = build(args.output)
    print(f"Rendered {len(manifest['states'])} states and {len(manifest['stingers'])} stingers to {args.output}")


if __name__ == "__main__":
    main()
