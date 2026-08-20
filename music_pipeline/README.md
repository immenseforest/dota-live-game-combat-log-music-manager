# Copyright-safe adaptive music pipeline

This directory contains a self-contained pipeline for studying **structural**
properties of reference WAV files and rendering a new adaptive music pack. It
does not copy, resample, or emit melodies from references. Analysis output is
limited to aggregate measurements such as tempo estimate, loudness, transient
density, dynamics, and zero-crossing-based brightness.

The included sample pack is algorithmically composed from code in this
repository. It has three loopable states:

| State | Intent | Typical game use |
|---|---|---|
| `cozy` | warm, sparse, reassuring | laning, calm movement, recovery |
| `epic` | broad, rising, heroic | objectives, advantage, anticipation |
| `war` | urgent, percussive, dissonant | team fights, critical combat |

## Quick start

Python 3.10+ is sufficient; no third-party packages are required.

```powershell
python music_pipeline/scripts/compose_pack.py
python -m unittest discover -s music_pipeline/tests -v
```

Rendered files appear in `music_pipeline/rendered/`, together with
`manifest.json`. Generation is deterministic: the same source, configuration,
and seed produce byte-identical WAV files.

To analyze WAV references that you are legally allowed to inspect:

```powershell
python music_pipeline/scripts/analyze_references.py C:\path\to\wav-folder `
  --output music_pipeline/analysis_report.json
```

Only uncompressed PCM WAV input is supported. The report intentionally contains
no pitch sequence, key, fingerprint, sample excerpt, filename, or copied audio.
Use `--label` to attach a category that does not identify a particular work.

## Integration contract

`rendered/manifest.json` is the contract for a playback engine. Each state
declares its loop WAV, BPM, musical meter, bar count, intensity, recommended
crossfade, and allowed next states. Transitions should be scheduled on the next
bar boundary. `stinger_up.wav` and `stinger_down.wav` can be layered during
state changes; they contain only synthesized material.

The shipped `config/structural_profiles.json` consists of generic, human-chosen
design targets and is not a transcription of any commercial music pack.
