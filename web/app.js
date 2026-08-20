const cueNode = document.querySelector("#cue");
const orb = document.querySelector("#orb");
const intensityNode = document.querySelector("#intensity");
const meter = document.querySelector("#meter-fill");
const status = document.querySelector("#status");
const feed = document.querySelector("#feed");
const audioToggle = document.querySelector("#audio-toggle");

let manifest;
let config;
let audioEnabled = false;
let currentCue;
let activeSlot = 0;
const players = [new Audio(), new Audio()];
players.forEach(player => { player.loop = true; player.preload = "auto"; player.volume = 0; });
const stingerPlayer = new Audio();
stingerPlayer.preload = "auto";

function renderState(state) {
  cueNode.textContent = state.cue.toUpperCase();
  orb.dataset.cue = state.cue;
  intensityNode.textContent = Math.round(state.intensity);
  meter.style.width = `${state.intensity}%`;
  status.textContent = state.matchActive ? `Live match · ${state.cue} layer` : "Waiting for a live match · cozy layer";
}

function addFeed(event) {
  if (feed.firstElementChild?.textContent === "No combat events yet.") feed.replaceChildren();
  const item = document.createElement("li");
  item.textContent = `${new Date(event.at).toLocaleTimeString()} · ${event.type.replaceAll("_", " ")}`;
  feed.prepend(item);
  while (feed.children.length > 8) feed.lastElementChild.remove();
}

function fade(player, from, to, seconds) {
  const started = performance.now();
  const duration = Math.max(100, seconds * 1000);
  const step = now => {
    const progress = Math.min(1, (now - started) / duration);
    player.volume = Math.max(0, Math.min(1, from + (to - from) * progress));
    if (progress < 1) requestAnimationFrame(step);
    else if (to === 0) player.pause();
  };
  requestAnimationFrame(step);
}

function tracksForCue(cue) {
  if (manifest?.cues?.[cue]) return manifest.cues[cue];
  if (manifest?.states?.[cue]) return [manifest.states[cue]];
  return [];
}

async function playStinger(previousCue, cue) {
  if (!previousCue || !manifest?.stingers) return;
  const ranks = { cozy: 0, epic: 1, war: 2 };
  const direction = ranks[cue] > ranks[previousCue] ? "up" : "down";
  const entry = manifest.stingers[direction];
  if (!entry?.file) return;
  stingerPlayer.src = new URL(entry.file, new URL(config.packManifest, location.origin)).href;
  stingerPlayer.volume = .7;
  await stingerPlayer.play();
}

async function playCue(cue, previousCue) {
  currentCue = cue;
  const tracks = tracksForCue(cue);
  if (!audioEnabled || tracks.length === 0) return;
  const nextSlot = 1 - activeSlot;
  const next = players[nextSlot];
  const old = players[activeSlot];
  const track = tracks[Math.floor(Math.random() * tracks.length)];
  const src = new URL(track.file, new URL(config.packManifest, location.origin)).href;
  if (next.src !== src) next.src = src;
  next.currentTime = Number(track.loopStart ?? 0);
  await next.play();
  fade(next, 0, Number(track.gain ?? 0.78), config.crossfadeSeconds);
  fade(old, old.volume, 0, config.crossfadeSeconds);
  activeSlot = nextSlot;
  playStinger(previousCue, cue).catch(() => {});
}

audioToggle.addEventListener("click", async () => {
  audioEnabled = !audioEnabled;
  audioToggle.textContent = audioEnabled ? "Mute audio" : "Start audio";
  if (audioEnabled) await playCue(currentCue ?? "cozy");
  else players.forEach(player => fade(player, player.volume, 0, .5));
});

document.querySelectorAll("[data-event]").forEach(button => button.addEventListener("click", () => {
  fetch("/api/simulate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: button.dataset.event }) });
}));

const initial = await fetch("/api/state").then(response => response.json());
config = initial.config;
manifest = await fetch(config.packManifest).then(response => response.ok ? response.json() : null).catch(() => null);
renderState(initial.state);
currentCue = initial.state.cue;
initial.recentEvents.slice().reverse().forEach(addFeed);

const stream = new EventSource("/api/events");
stream.addEventListener("state", event => renderState(JSON.parse(event.data)));
stream.addEventListener("combat", event => {
  const payload = JSON.parse(event.data);
  renderState(payload.state);
  addFeed(payload.event);
});
stream.addEventListener("cue", event => {
  const transition = JSON.parse(event.data);
  renderState(transition.state);
  playCue(transition.cue, transition.previousCue).catch(error => { status.textContent = `Audio error: ${error.message}`; });
});
stream.onerror = () => { status.textContent = "DJ service disconnected. Reconnecting…"; };
