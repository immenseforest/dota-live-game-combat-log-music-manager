import { EventEmitter } from "node:events";

const impact = {
  match_start: 6,
  hero_kill: 28,
  hero_death: 24,
  low_health: 20,
  building_damaged: 12,
  building_destroyed: 38,
  roshan_kill: 46,
  buyback: 32,
  teamfight: 55,
  match_end: -100
};

function cueFor(score, matchActive) {
  if (!matchActive) return "cozy";
  if (score >= 68) return "war";
  if (score >= 24) return "epic";
  return "cozy";
}

export class DjEngine extends EventEmitter {
  constructor({ decayPerSecond = 0.9, clock = () => Date.now() } = {}) {
    super();
    this.decayPerSecond = decayPerSecond;
    this.clock = clock;
    this.score = 0;
    this.matchActive = false;
    this.cue = "cozy";
    this.lastUpdated = clock();
    this.recentCombat = [];
  }

  decay() {
    const now = this.clock();
    const elapsed = Math.max(0, (now - this.lastUpdated) / 1000);
    this.score = Math.max(0, this.score - elapsed * this.decayPerSecond);
    this.lastUpdated = now;
  }

  handle(event) {
    this.decay();
    if (event.type === "match_start") this.matchActive = true;
    if (event.type === "match_end") this.matchActive = false;

    const weight = impact[event.type] ?? 0;
    this.score = weight < 0 ? 0 : Math.min(100, this.score + weight);

    if (["hero_kill", "hero_death", "buyback", "building_destroyed"].includes(event.type)) {
      const cutoff = this.clock() - 14_000;
      this.recentCombat = [...this.recentCombat.filter(time => time >= cutoff), this.clock()];
      if (this.recentCombat.length >= 3) this.score = Math.max(this.score, 72);
    }

    const previousCue = this.cue;
    this.cue = cueFor(this.score, this.matchActive);
    const snapshot = this.snapshot();
    this.emit("event", { event, state: snapshot });
    if (previousCue !== this.cue) this.emit("cue", { cue: this.cue, previousCue, state: snapshot, trigger: event.type });
    return snapshot;
  }

  tick() {
    this.decay();
    const previousCue = this.cue;
    this.cue = cueFor(this.score, this.matchActive);
    if (previousCue !== this.cue) this.emit("cue", { cue: this.cue, previousCue, state: this.snapshot(), trigger: "decay" });
    return this.snapshot();
  }

  snapshot() {
    return {
      cue: this.cue,
      intensity: Math.round(this.score * 10) / 10,
      matchActive: this.matchActive,
      updatedAt: new Date(this.lastUpdated).toISOString()
    };
  }
}
