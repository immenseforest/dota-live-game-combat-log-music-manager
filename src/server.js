import http from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DjEngine } from "./lib/dj-engine.js";
import { deriveGsiEvents, validGsiToken } from "./lib/gsi.js";
import { parseCombatLogChunk, parseCombatLogLine } from "./lib/combat-log.js";
import { LogTail } from "./lib/log-tail.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaults = JSON.parse(await readFile(join(root, "config.example.json"), "utf8"));
const localConfig = existsSync(join(root, "config.local.json"))
  ? JSON.parse(await readFile(join(root, "config.local.json"), "utf8"))
  : {};
const config = { ...defaults, ...localConfig };
const engine = new DjEngine(config);
let previousGsi = {};
const clients = new Set();
const recentEvents = [];

function publish(kind, payload) {
  const message = `event: ${kind}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) client.write(message);
}

function ingest(event) {
  const state = engine.handle(event);
  recentEvents.unshift({ ...event, state });
  recentEvents.splice(50);
  publish("combat", { event, state });
}

engine.on("cue", transition => publish("cue", transition));
setInterval(() => {
  const state = engine.tick();
  publish("state", state);
}, 1000).unref();

if (config.combatLogPath) {
  const tail = new LogTail(config.combatLogPath);
  tail.on("line", line => {
    const event = parseCombatLogLine(line);
    if (event) ingest(event);
  });
  tail.on("error", error => publish("warning", { message: `Combat log unavailable: ${error.message}` }));
  await tail.start();
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac"
};

async function bodyJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 1_000_000) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function json(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

function safeAssetPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = decoded === "/"
    ? "web/index.html"
    : decoded.startsWith("/music/sample-pack/")
      ? `music_pipeline/rendered/${decoded.slice("/music/sample-pack/".length)}`
      : decoded.startsWith("/music/")
        ? decoded.slice(1)
        : `web/${decoded.slice(1)}`;
  const candidate = resolve(root, normalize(relative));
  return candidate === root || candidate.startsWith(`${root}${sep}`) ? candidate : null;
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (request.method === "GET" && url.pathname === "/api/state") {
      return json(response, 200, { state: engine.tick(), config: { packManifest: config.packManifest, crossfadeSeconds: config.crossfadeSeconds }, recentEvents });
    }
    if (request.method === "GET" && url.pathname === "/api/events") {
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      response.write(`event: state\ndata: ${JSON.stringify(engine.snapshot())}\n\n`);
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/gsi") {
      const payload = await bodyJson(request);
      if (!validGsiToken(payload, config.gsiToken)) return json(response, 401, { error: "Invalid GSI token" });
      const events = deriveGsiEvents(previousGsi, payload);
      previousGsi = payload;
      events.forEach(ingest);
      return json(response, 200, { accepted: true, events: events.length, state: engine.snapshot() });
    }
    if (request.method === "POST" && url.pathname === "/api/combat-log") {
      const payload = await bodyJson(request);
      const events = parseCombatLogChunk(payload.text ?? payload.line ?? "");
      events.forEach(ingest);
      return json(response, 200, { accepted: true, events: events.length });
    }
    if (request.method === "POST" && url.pathname === "/api/simulate") {
      const payload = await bodyJson(request);
      const allowed = new Set(["match_start", "hero_kill", "hero_death", "low_health", "building_damaged", "building_destroyed", "roshan_kill", "buyback", "teamfight", "match_end"]);
      if (!allowed.has(payload.type)) return json(response, 400, { error: "Unsupported event type" });
      ingest({ type: payload.type, source: "simulator", at: Date.now() });
      return json(response, 200, engine.snapshot());
    }

    if (request.method !== "GET") return json(response, 404, { error: "Not found" });
    const assetPath = safeAssetPath(url.pathname);
    if (!assetPath || !existsSync(assetPath)) return json(response, 404, { error: "Not found" });
    response.writeHead(200, { "content-type": mime[extname(assetPath).toLowerCase()] ?? "application/octet-stream" });
    createReadStream(assetPath).pipe(response);
  } catch (error) {
    json(response, 500, { error: error.message });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Dota DJ listening at http://${config.host}:${config.port}`);
  console.log(`GSI endpoint: http://${config.host}:${config.port}/api/gsi`);
});
