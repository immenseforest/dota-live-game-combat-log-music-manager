import test from "node:test";
import assert from "node:assert/strict";
import { DjEngine } from "../src/lib/dj-engine.js";

test("moves from cozy to epic and war as combat escalates", () => {
  let now = 0;
  const dj = new DjEngine({ clock: () => now, decayPerSecond: 1 });
  assert.equal(dj.handle({ type: "match_start" }).cue, "cozy");
  assert.equal(dj.handle({ type: "hero_kill" }).cue, "epic");
  dj.handle({ type: "hero_kill" });
  assert.equal(dj.handle({ type: "hero_kill" }).cue, "war");
  now += 80_000;
  assert.equal(dj.tick().cue, "cozy");
});

test("match end returns to the cozy idle layer", () => {
  const dj = new DjEngine();
  dj.handle({ type: "match_start" });
  dj.handle({ type: "teamfight" });
  assert.equal(dj.handle({ type: "match_end" }).cue, "cozy");
  assert.equal(dj.snapshot().matchActive, false);
});
