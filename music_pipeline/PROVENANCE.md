# Provenance and copyright-safety record

## Included composition

- Every audible sample is produced mathematically at render time using sine,
  triangle, filtered deterministic noise, or short synthesized impulses.
- No recording, sample library, MIDI file, score, model output, or commercial
  game asset is embedded or required.
- Notes, rhythms, voicings, sound design, transitions, and arrangement are
  authored in `scripts/compose_pack.py` specifically for this project.
- Randomness uses Python's local pseudorandom generator with a fixed seed. It
  is used only for percussion/noise and small timing/color variations.
- Rendered audio is CC0, so streamers may use, alter, monetize, and redistribute
  it without attribution. Keeping attribution is appreciated but not required.

## Reference-analysis boundary

The optional analyzer computes only low-dimensional, non-expressive aggregate
facts: duration, sample rate, RMS/dynamic range, transient density, approximate
tempo, and brightness proxy. It explicitly does not export audio, chroma,
pitch/key, note sequences, spectral fingerprints, stems, or source names.

Users must have lawful access to any files they analyze. Analysis reports should
be treated as research/design inputs, not proof of clearance. Do not add
commercial reference audio to this repository.

## Reproducibility

Run `python music_pipeline/scripts/compose_pack.py`. The generated manifest
records the seed, generator version, per-file SHA-256 digest, and synthesis-only
provenance declaration. Tests render twice and require identical hashes.
