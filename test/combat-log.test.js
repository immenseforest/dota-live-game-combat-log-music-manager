import test from "node:test";
import assert from "node:assert/strict";
import { parseCombatLogLine, parseCombatLogChunk } from "../src/lib/combat-log.js";

test("parses hero kills and strategic events", () => {
  const kill = parseCombatLogLine("npc_dota_hero_axe killed npc_dota_hero_lina");
  assert.deepEqual({ type: kill.type, attacker: kill.attacker, victim: kill.victim }, { type: "hero_kill", attacker: "axe", victim: "lina" });
  const passiveKill = parseCombatLogLine("npc_dota_hero_lina was killed by npc_dota_hero_axe");
  assert.deepEqual({ attacker: passiveKill.attacker, victim: passiveKill.victim }, { attacker: "axe", victim: "lina" });
  assert.equal(parseCombatLogLine("Roshan has been killed by the Radiant").type, "roshan_kill");
  assert.equal(parseCombatLogLine("Dire tower has been destroyed").type, "building_destroyed");
  assert.equal(parseCombatLogChunk("Roshan was killed\nnoise\nteamfight").length, 2);
});
