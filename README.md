# Dota DJ

An open-source, local adaptive-music engine for Dota 2 streams. Dota DJ listens to live Game State Integration (GSI) updates and optional combat-log text, estimates the intensity of the match, and crossfades between **cozy**, **epic**, and **war** music cues.

The app never uploads match data or audio. It binds to `127.0.0.1`, runs without cloud services, and is designed for music that you own or are licensed to broadcast.

## What works

- Live Dota 2 GSI ingestion with token validation
- Optional tailing or HTTP ingestion of text combat logs
- Detection of match state, kills, deaths, low health, building damage/destruction, Roshan, buybacks, and rapid teamfight activity
- Intensity scoring with decay and automatic `cozy` → `epic` → `war` transitions
- Sample-pack manifest support and gapless two-player Web Audio crossfades
- Local control panel, manual event simulator, live event feed, and transparent OBS overlay
- No runtime npm dependencies
- Deterministic unit tests and an HTTP end-to-end path

## Quick start

Requirements: [Node.js 20+](https://nodejs.org/) and Dota 2.

```powershell
npm run install:gsi
npm start
```

Open <http://127.0.0.1:31982>, click **Start audio**, and use the test buttons to verify the transitions. Restart Dota 2 after installing the GSI file.

On Windows, after the one-time GSI install, `start-windows.cmd` starts the server and opens the control panel. If Steam is installed in a nonstandard library, set `DOTA2_DIR` to the `dota 2 beta` directory before running `npm run install:gsi`.

On Linux, Dota may require the Steam launch option `-gamestateintegration`. Valve’s public issue trackers report that GSI behavior can vary on Linux; the optional combat-log adapter and simulator remain available for testing.

## OBS setup

1. Start Dota DJ.
2. In OBS, add a **Browser Source** using `http://127.0.0.1:31982/` for the full control surface or `http://127.0.0.1:31982/overlay.html` for the transparent status overlay.
3. Enable browser-source audio control if you want OBS to capture the music independently of desktop audio.
4. Click **Start audio** once in the full control surface. Browser autoplay policy requires this explicit first interaction.

For a production stream, keep the full control panel open locally and use the small overlay only if you want viewers to see the current music intensity.

## Add your own cleared music

Place tracks under `music/custom/` (ignored by Git so personal licensed files are not accidentally published), then create a manifest:

```json
{
  "formatVersion": 1,
  "title": "My stream-safe pack",
  "license": "Your license or provenance note",
  "cues": {
    "cozy": [{ "file": "cozy-loop.wav", "gain": 0.75 }],
    "epic": [{ "file": "epic-loop.wav", "gain": 0.78 }],
    "war": [{ "file": "war-loop.wav", "gain": 0.8 }]
  }
}
```

Copy `config.example.json` to `config.local.json` and set `packManifest` to `/music/custom/manifest.json`. Supported browser formats are WAV, MP3, Ogg, FLAC, and any other format supported by the selected browser.

## Optional combat-log input

GSI is the primary supported input because it is structured and does not depend on console wording. For a local text log, set an absolute `combatLogPath` in `config.local.json`. The tailer recognizes common hero-kill, Roshan, building, buyback, and teamfight lines.

Another local tool can submit log text directly:

```powershell
Invoke-RestMethod http://127.0.0.1:31982/api/combat-log `
  -Method Post -ContentType application/json `
  -Body '{"line":"npc_dota_hero_axe killed npc_dota_hero_lina"}'
```

## Configuration

`config.local.json` overrides `config.example.json` and is intentionally ignored by Git.

| Key | Purpose |
| --- | --- |
| `host` | Bind address; keep `127.0.0.1` unless you understand the network exposure |
| `port` | Local web and GSI port |
| `gsiToken` | Shared local token written into the Dota GSI config |
| `combatLogPath` | Optional absolute path to a text combat log |
| `packManifest` | Browser URL for the selected pack manifest |
| `decayPerSecond` | How quickly combat intensity settles |
| `crossfadeSeconds` | Music transition duration |

After changing `port` or `gsiToken`, reinstall the GSI config so Dota and Dota DJ agree.

## Development and test

```powershell
npm test
npm start
```

The architecture is deliberately small:

- `src/lib/gsi.js` converts GSI snapshots into canonical combat events.
- `src/lib/combat-log.js` parses optional text log lines.
- `src/lib/dj-engine.js` turns events into a decaying intensity and cue.
- `src/server.js` hosts the local API, SSE stream, UI, overlay, and audio files.
- `music_pipeline/` contains the original-music analysis/composition pipeline.

## Copyright and streaming safety

Dota DJ does **not** make copyrighted Dota music packs stream-safe. Do not add or redistribute Valve recordings, commercial music-pack files, extracted game audio, or imitations of protected melodies. Use the included original generated sample pack, your own compositions, public-domain material, or tracks whose license explicitly permits your broadcast and monetization use.

The project’s source code is MIT licensed. Each music pack must carry its own license and provenance metadata; the software license does not grant rights to third-party audio. This is practical project guidance, not legal advice.

## Telemetry notes

Dota 2’s public GSI surface is lightly documented compared with Counter-Strike’s. The installer follows the configuration layout demonstrated in Valve’s official issue trackers: `game/dota/cfg/gamestate_integration/gamestate_integration_*.cfg`, a local HTTP URI, selected `data` providers, and an `auth` token. Payload parsing is defensive because fields differ between playing, spectating, patches, and platforms.
