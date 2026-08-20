function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function walkBuildings(value, path = [], output = new Map()) {
  if (!value || typeof value !== "object") return output;
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (typeof child === "number") output.set(nextPath.join("."), child);
    else walkBuildings(child, nextPath, output);
  }
  return output;
}

function collectNamedEvents(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (typeof value.event_type === "string") output.push(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === "object") collectNamedEvents(child, output);
  }
  return output;
}

function normalizeNamedEvent(event) {
  const name = String(event.event_type).toLowerCase();
  if (name.includes("kill") && name.includes("roshan")) return { type: "roshan_kill", details: event };
  if (name.includes("kill")) return { type: "hero_kill", details: event };
  if (name.includes("buyback")) return { type: "buyback", details: event };
  if (name.includes("tower") || name.includes("barracks") || name.includes("building")) {
    return { type: "building_destroyed", details: event };
  }
  return { type: "game_event", name, details: event };
}

export function deriveGsiEvents(previous = {}, current = {}) {
  const events = [];
  const now = Date.now();
  const emit = event => events.push({ ...event, source: "gsi", at: now });

  const previousState = previous.map?.game_state;
  const currentState = current.map?.game_state;
  if (currentState && currentState !== previousState) {
    emit({ type: "game_state", previous: previousState ?? null, state: currentState });
    if (/GAME_IN_PROGRESS/i.test(currentState)) emit({ type: "match_start" });
    if (/POST_GAME/i.test(currentState)) emit({ type: "match_end", winner: current.map?.win_team ?? null });
  }

  const hasPlayerBaseline = previous.player && typeof previous.player === "object";
  const killDelta = hasPlayerBaseline ? number(current.player?.kills) - number(previous.player?.kills) : 0;
  const deathDelta = hasPlayerBaseline ? number(current.player?.deaths) - number(previous.player?.deaths) : 0;
  for (let index = 0; index < Math.max(0, killDelta); index += 1) emit({ type: "hero_kill", perspective: "player" });
  for (let index = 0; index < Math.max(0, deathDelta); index += 1) emit({ type: "hero_death", perspective: "player" });

  const health = number(current.hero?.health);
  const maxHealth = number(current.hero?.max_health);
  const previousHealth = number(previous.hero?.health);
  if (maxHealth > 0 && number(previous.hero?.max_health) > 0 && health / maxHealth <= 0.25 && previousHealth / number(previous.hero.max_health) > 0.25) {
    emit({ type: "low_health", ratio: health / maxHealth });
  }

  const oldBuildings = walkBuildings(previous.buildings);
  const newBuildings = walkBuildings(current.buildings);
  for (const [key, value] of newBuildings) {
    const oldValue = oldBuildings.get(key);
    if (oldValue == null || value >= oldValue) continue;
    if (value <= 0 && oldValue > 0) emit({ type: "building_destroyed", building: key });
    else if (oldValue - value >= 100) emit({ type: "building_damaged", building: key, delta: oldValue - value });
  }

  const oldRoshan = previous.roshan?.alive;
  const newRoshan = current.roshan?.alive;
  if (oldRoshan === true && newRoshan === false) emit({ type: "roshan_kill" });

  const beforeNamed = new Set(collectNamedEvents(previous.events).map(event => JSON.stringify(event)));
  for (const named of collectNamedEvents(current.events)) {
    if (!beforeNamed.has(JSON.stringify(named))) emit(normalizeNamedEvent(named));
  }

  return events;
}

export function validGsiToken(payload, expectedToken) {
  return !expectedToken || payload?.auth?.token === expectedToken;
}
