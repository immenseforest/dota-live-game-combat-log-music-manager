#!/usr/bin/env python3
"""Extract non-melodic aggregate structural measurements from PCM WAV files."""

from __future__ import annotations

import argparse
import json
import math
import statistics
import wave
from pathlib import Path


def _mono_samples(raw: bytes, channels: int, width: int) -> list[int]:
    if channels not in (1, 2):
        raise ValueError("Only mono and stereo PCM WAV files are supported")
    if width not in (1, 2, 3, 4):
        raise ValueError("Only 8, 16, 24, and 32-bit PCM WAV files are supported")
    scale = 1 << (width * 8 - 1)
    values = []
    for offset in range(0, len(raw) - width + 1, width):
        sample = int.from_bytes(raw[offset : offset + width], "little", signed=width != 1)
        if width == 1:
            sample -= 128
        values.append(int(sample * 32768 / scale))
    if channels == 1:
        return values
    return [(values[index] + values[index + 1]) // 2 for index in range(0, len(values) - 1, 2)]


def _rms(samples: list[int]) -> float:
    return math.sqrt(sum(sample * sample for sample in samples) / max(1, len(samples)))


def analyze(path: Path) -> dict[str, float | int]:
    with wave.open(str(path), "rb") as wav:
        if wav.getcomptype() != "NONE":
            raise ValueError("compressed WAV is not supported")
        rate, channels, width, frames = (
            wav.getframerate(), wav.getnchannels(), wav.getsampwidth(), wav.getnframes()
        )
        samples = _mono_samples(wav.readframes(frames), channels, width)

    window = max(1, rate // 20)  # 50 ms
    chunks = [samples[i : i + window] for i in range(0, len(samples), window) if len(samples[i : i + window]) >= 2]
    rms = [max(1, _rms(chunk)) for chunk in chunks]
    db = [20.0 * math.log10(value / 32768.0) for value in rms]
    flux = [max(0.0, rms[i] - rms[i - 1]) for i in range(1, len(rms))]
    threshold = statistics.mean(flux) + statistics.pstdev(flux) if flux else float("inf")
    onsets = [i for i, value in enumerate(flux, 1) if value > threshold and (i < 2 or flux[i - 2] <= threshold)]
    intervals = [(b - a) / 20.0 for a, b in zip(onsets, onsets[1:]) if 0.25 <= (b - a) / 20.0 <= 1.5]
    bpm = 60.0 / statistics.median(intervals) if intervals else 0.0
    while bpm and bpm < 70:
        bpm *= 2
    while bpm > 180:
        bpm /= 2
    crossings = sum(1 for first, second in zip(samples, samples[1:]) if (first < 0 <= second) or (first >= 0 > second))
    duration = frames / rate
    return {
        "duration_seconds": round(duration, 3),
        "sample_rate": rate,
        "channels": channels,
        "rms_dbfs": round(statistics.mean(db), 2),
        "dynamic_range_db": round(statistics.quantiles(db, n=10)[-1] - statistics.quantiles(db, n=10)[0], 2) if len(db) >= 10 else 0.0,
        "transients_per_second": round(len(onsets) / max(duration, 0.001), 2),
        "tempo_bpm_estimate": round(bpm, 1),
        "brightness_zero_crossings_per_second": round(crossings / max(duration, 0.001), 1),
    }


def aggregate(items: list[dict[str, float | int]]) -> dict[str, float]:
    keys = ("rms_dbfs", "dynamic_range_db", "transients_per_second", "tempo_bpm_estimate", "brightness_zero_crossings_per_second")
    return {key: round(statistics.median(float(item[key]) for item in items), 2) for key in keys}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="PCM WAV file or directory")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--label", default="anonymous_reference_group")
    args = parser.parse_args()
    paths = [args.input] if args.input.is_file() else sorted(args.input.glob("*.wav"))
    if not paths:
        raise SystemExit("No WAV files found")
    measurements = [analyze(path) for path in paths]
    report = {
        "schema_version": 1,
        "label": args.label,
        "source_count": len(paths),
        "privacy": "No source names, audio, pitches, melodies, keys, or fingerprints retained.",
        "aggregate_medians": aggregate(measurements),
        "measurements": measurements,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote structural report for {len(paths)} source(s): {args.output}")


if __name__ == "__main__":
    main()
