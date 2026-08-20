import test from "node:test";
import assert from "node:assert/strict";
import { deriveGsiEvents, validGsiToken } from "../src/lib/gsi.js";

test("derives match, kill, health, building, and Roshan events", () => {
  const before = { map: { game_state: "DOTA_GAMERULES_STATE_PRE_GAME" }, player: { kills: 1 }, hero: { health: 800, max_health: 1000 }, buildings: { radiant: { tower: 1200 } }, roshan: { alive: true } };
  const after = { map: { game_state: "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS" }, player: { kills: 2 }, hero: { health: 200, max_health: 1000 }, buildings: { radiant: { tower: 0 } }, roshan: { alive: false } };
  const types = deriveGsiEvents(before, after).map(event => event.type);
  assert.deepEqual(types, ["game_state", "match_start", "hero_kill", "low_health", "building_destroyed", "roshan_kill"]);
});

test("checks the configured GSI token", () => {
  assert.equal(validGsiToken({ auth: { token: "ok" } }, "ok"), true);
  assert.equal(validGsiToken({ auth: { token: "no" } }, "ok"), false);
});

test("does not replay cumulative counters as events on the first payload", () => {
  const types = deriveGsiEvents({}, {
    map: { game_state: "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS" },
    player: { kills: 12, deaths: 4 },
    hero: { health: 100, max_health: 2000 }
  }).map(event => event.type);
  assert.deepEqual(types, ["game_state", "match_start"]);
});
