const patterns = [
  {
    type: "roshan_kill",
    regex: /roshan\s+(?:has been|was)\s+killed/i,
    build: (_match, line) => ({ type: "roshan_kill", raw: line })
  },
  {
    type: "hero_kill",
    regex: /npc_dota_hero_([a-z0-9_]+)\s+was killed by\s+npc_dota_hero_([a-z0-9_]+)/i,
    build: ([, victim, attacker], line) => ({ type: "hero_kill", attacker, victim, raw: line })
  },
  {
    type: "hero_kill",
    regex: /npc_dota_hero_([a-z0-9_]+)\s+(?:killed|has killed)\s+npc_dota_hero_([a-z0-9_]+)/i,
    build: ([, attacker, victim], line) => ({ type: "hero_kill", attacker, victim, raw: line })
  },
  {
    type: "building_destroyed",
    regex: /(tower|barracks|ancient)\s+(?:has been|was)\s+(?:destroyed|killed)/i,
    build: ([, building], line) => ({ type: "building_destroyed", building: building.toLowerCase(), raw: line })
  },
  {
    type: "buyback",
    regex: /(?:npc_dota_hero_)?([a-z0-9_]+).*(?:buyback|bought back)/i,
    build: ([, hero], line) => ({ type: "buyback", hero, raw: line })
  },
  {
    type: "teamfight",
    regex: /\b(teamfight|team fight)\b/i,
    build: (_match, line) => ({ type: "teamfight", raw: line })
  }
];

export function parseCombatLogLine(line) {
  const normalized = String(line ?? "").trim();
  if (!normalized) return null;
  for (const pattern of patterns) {
    const match = normalized.match(pattern.regex);
    if (match) return { ...pattern.build(match, normalized), source: "combat_log", at: Date.now() };
  }
  return null;
}

export function parseCombatLogChunk(chunk) {
  return String(chunk ?? "").split(/\r?\n/).map(parseCombatLogLine).filter(Boolean);
}
