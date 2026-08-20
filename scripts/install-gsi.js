import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaults = JSON.parse(await readFile(join(projectRoot, "config.example.json"), "utf8"));
let localConfig = {};
try { localConfig = JSON.parse(await readFile(join(projectRoot, "config.local.json"), "utf8")); } catch {}
const appConfig = { ...defaults, ...localConfig };

async function candidates() {
  if (process.env.DOTA2_DIR) return [resolve(process.env.DOTA2_DIR)];
  if (platform() === "win32") {
    const steamRoots = [
      "C:\\Program Files (x86)\\Steam\\steamapps\\common\\dota 2 beta",
      "C:\\Program Files\\Steam\\steamapps\\common\\dota 2 beta"
    ];
    for (const steam of ["C:\\Program Files (x86)\\Steam", "C:\\Program Files\\Steam"]) {
      try {
        const vdf = await readFile(join(steam, "steamapps/libraryfolders.vdf"), "utf8");
        for (const match of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
          steamRoots.push(join(match[1].replaceAll("\\\\", "\\"), "steamapps/common/dota 2 beta"));
        }
      } catch {}
    }
    return [...new Set(steamRoots)];
  }
  if (platform() === "darwin") return [join(homedir(), "Library/Application Support/Steam/steamapps/common/dota 2 beta")];
  return [
    join(homedir(), ".local/share/Steam/steamapps/common/dota 2 beta"),
    join(homedir(), ".steam/steam/steamapps/common/dota 2 beta")
  ];
}

const dotaRoot = (await candidates()).find(existsSync);
if (!dotaRoot) {
  console.error("Dota 2 was not found. Set DOTA2_DIR to the 'dota 2 beta' directory and run this command again.");
  process.exitCode = 1;
} else {
  const directory = join(dotaRoot, "game/dota/cfg/gamestate_integration");
  const destination = join(directory, "gamestate_integration_dota_dj.cfg");
  const config = `"Dota DJ Integration"\n{\n  "uri" "http://127.0.0.1:${appConfig.port}/api/gsi"\n  "timeout" "5.0"\n  "buffer" "0.1"\n  "throttle" "0.1"\n  "heartbeat" "10.0"\n  "data"\n  {\n    "provider" "1"\n    "map" "1"\n    "player" "1"\n    "hero" "1"\n    "events" "1"\n    "buildings" "1"\n    "roshan" "1"\n  }\n  "auth" { "token" "${appConfig.gsiToken}" }\n}\n`;
  await mkdir(directory, { recursive: true });
  await writeFile(destination, config, { flag: "wx" }).catch(error => {
    if (error.code === "EEXIST") throw new Error(`Configuration already exists: ${destination}`);
    throw error;
  });
  console.log(`Installed GSI configuration: ${destination}`);
}
