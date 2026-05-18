"use strict";

const STORAGE = {
  settings: "rummikub-junior-settings",
  scores: "rummikub-junior-highscores",
  profile: "rummikub-junior-profile"
};

const MUSIC_URL = "assets/audio/tile-dash.mp3";

const COLORS = [
  { key: "red", label: "Red", value: "#e52b27", shape: "heart" },
  { key: "blue", label: "Blue", value: "#149ce4", shape: "diamond" },
  { key: "yellow", label: "Yellow", value: "#f6b70d", shape: "circle" },
  { key: "green", label: "Green", value: "#4aa939", shape: "square" }
];

const THEMES = [
  { key: "classic", label: "Classic", swatch: "linear-gradient(135deg,#06aefa,#0565c9)" },
  { key: "candy", label: "Candy", swatch: "linear-gradient(135deg,#19c8ff,#fb4f92,#7a48db)" },
  { key: "forest", label: "Forest", swatch: "linear-gradient(135deg,#5cd585,#168d75,#0a5771)" },
  { key: "sunset", label: "Sunset", swatch: "linear-gradient(135deg,#ffb33b,#ee4f62,#2847a6)" },
  { key: "midnight", label: "Midnight", swatch: "linear-gradient(135deg,#2cc0f4,#2452bb,#10194d)" }
];

const DIFFICULTY = {
  easy: { label: "Easy", aiMin: 3, aiMax: 3, think: 650 },
  normal: { label: "Normal", aiMin: 3, aiMax: 4, think: 850 },
  master: { label: "Master", aiMin: 3, aiMax: 5, think: 1050 }
};

const DEFAULT_SETTINGS = {
  playerName: "HappyPlayer",
  theme: "classic",
  difficulty: "normal",
  rounds: 5,
  sound: true,
  music: true,
  motion: true,
  autoSort: true
};

const DEFAULT_PROFILE = {
  coins: 1250,
  stars: 45,
  level: 8,
  xp: 62
};

const DEFAULT_SCORES = [
  { name: "Emma", score: 12450, date: "Starter" },
  { name: "Liam", score: 9780, date: "Starter" },
  { name: "Noah", score: 7560, date: "Starter" },
  { name: "Ava", score: 5320, date: "Starter" },
  { name: "Mia", score: 4280, date: "Starter" }
];

const app = document.getElementById("app");
const modalRoot = document.getElementById("modalRoot");

let tileSerial = 1;
let audioContext = null;
let musicPlayer = null;

const state = {
  screen: "menu",
  settings: loadJSON(STORAGE.settings, DEFAULT_SETTINGS),
  profile: loadJSON(STORAGE.profile, DEFAULT_PROFILE),
  highscores: loadJSON(STORAGE.scores, DEFAULT_SCORES),
  game: null,
  modal: null,
  selectedIds: new Set(),
  toast: "",
  aiTimer: 0
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return structuredClone(fallback);
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback)) {
      return Array.isArray(parsed) ? parsed : structuredClone(fallback);
    }
    return { ...structuredClone(fallback), ...parsed };
  } catch {
    return structuredClone(fallback);
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function todayLabel() {
  const date = new Date();
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function randomId(prefix) {
  return `${prefix}-${tileSerial++}`;
}

function tile(color, value, kind = "number", copy = 0) {
  return {
    id: randomId(kind === "joker" ? "joker" : color),
    color,
    value,
    kind,
    copy
  };
}

function colorMeta(key) {
  return COLORS.find((item) => item.key === key) || COLORS[0];
}

function buildDeck() {
  const deck = [];
  for (let copy = 0; copy < 2; copy += 1) {
    for (const color of COLORS) {
      for (let value = 1; value <= 10; value += 1) {
        deck.push(tile(color.key, value, "number", copy));
      }
    }
  }
  deck.push(tile("joker", 0, "joker", 0));
  deck.push(tile("joker", 0, "joker", 1));
  deck.push(tile("joker", 0, "joker", 2));
  deck.push(tile("joker", 0, "joker", 3));
  return shuffle(deck);
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function takeMatching(deck, color, value) {
  const index = deck.findIndex((item) => item.kind === "number" && item.color === color && item.value === value);
  if (index < 0) return null;
  return deck.splice(index, 1)[0];
}

function safeTakeGroup(deck, specs) {
  const taken = [];
  for (const spec of specs) {
    const item = takeMatching(deck, spec[0], spec[1]);
    if (item) taken.push(item);
  }
  return taken;
}

function seedBoard(deck) {
  const seeds = [
    [["red", 1], ["red", 2], ["red", 3], ["red", 4]],
    [["blue", 5], ["blue", 6], ["blue", 7]],
    [["green", 2], ["green", 3], ["green", 4]],
    [["yellow", 8], ["yellow", 9], ["yellow", 10]],
    [["red", 6], ["blue", 6], ["yellow", 6]],
    [["red", 10], ["green", 10], ["yellow", 10]]
  ];
  return seeds.map((seed) => safeTakeGroup(deck, seed)).filter((group) => group.length >= 3);
}

function createPlayers() {
  return [
    { name: state.settings.playerName || "HappyPlayer", rank: "Junior Star", avatar: "robot", isHuman: true, hand: [], matchScore: 0, roundWins: 0 },
    { name: "Color AI", rank: "Junior Star", avatar: "robot", isHuman: false, hand: [], matchScore: 0, roundWins: 0 },
    { name: "Starry AI", rank: "Junior Master", avatar: "star", isHuman: false, hand: [], matchScore: 0, roundWins: 0 },
    { name: "Bloom AI", rank: "Junior Star", avatar: "bloom", isHuman: false, hand: [], matchScore: 0, roundWins: 0 }
  ];
}

function startGame() {
  const game = {
    players: createPlayers(),
    current: 0,
    deck: [],
    board: [],
    round: 1,
    rounds: Number(state.settings.rounds) || 5,
    message: "Your turn. Play a run, play a set, or draw a tile.",
    winnerIndex: null,
    final: false,
    recorded: false,
    history: []
  };
  dealRound(game, true);
  state.game = game;
  state.screen = "game";
  state.modal = null;
  state.selectedIds.clear();
  showToast("Round 1 started");
  render();
}

function dealRound(game, firstRound = false) {
  tileSerial = Math.max(tileSerial, Date.now() % 100000);
  game.deck = buildDeck();
  game.board = firstRound ? seedBoard(game.deck) : [];
  game.current = 0;
  game.winnerIndex = null;
  game.final = false;
  game.history = [];
  for (const player of game.players) {
    player.hand = game.deck.splice(0, 10);
    if (state.settings.autoSort) {
      player.hand = sortTiles(player.hand);
    }
  }
  if (!firstRound) {
    game.message = `Round ${game.round} started. Your move.`;
  }
}

function sortTiles(tiles) {
  return [...tiles].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "joker" ? 1 : -1;
    const colorOrder = COLORS.findIndex((item) => item.key === a.color) - COLORS.findIndex((item) => item.key === b.color);
    if (colorOrder !== 0) return colorOrder;
    return a.value - b.value;
  });
}

function selectedTiles() {
  if (!state.game) return [];
  return state.game.players[0].hand.filter((item) => state.selectedIds.has(item.id));
}

function playSelected() {
  const game = state.game;
  if (!game || game.current !== 0 || game.winnerIndex !== null) return;
  const selection = selectedTiles();
  if (selection.length < 3) {
    game.message = "Select at least 3 stones.";
    showToast(game.message);
    render();
    return;
  }
  const validation = validateMeld(selection);
  if (!validation.valid) {
    game.message = validation.reason;
    showToast(validation.reason);
    render();
    return;
  }
  game.board.push(orderMeld(selection, validation.type));
  removeTilesFromHand(game.players[0], selection);
  game.players[0].matchScore += scoreTiles(selection) + (validation.type === "run" ? 12 : 9);
  game.history.push(`${game.players[0].name} played a ${validation.type}.`);
  state.selectedIds.clear();
  game.message = `${validation.label} played. You can play again or end your turn.`;
  playSound(560, 0.08);
  if (game.players[0].hand.length === 0) {
    finishRound(0);
  }
  render();
}

function removeTilesFromHand(player, tiles) {
  const ids = new Set(tiles.map((item) => item.id));
  player.hand = player.hand.filter((item) => !ids.has(item.id));
}

function drawTile() {
  const game = state.game;
  if (!game || game.current !== 0 || game.winnerIndex !== null) return;
  if (game.deck.length === 0) {
    game.message = "The bag is empty. End your turn.";
    showToast(game.message);
    render();
    return;
  }
  const drawn = game.deck.shift();
  game.players[0].hand.push(drawn);
  if (state.settings.autoSort) {
    game.players[0].hand = sortTiles(game.players[0].hand);
  }
  state.selectedIds.clear();
  game.message = `You drew ${tileName(drawn)}.`;
  game.history.push(`${game.players[0].name} drew a stone.`);
  playSound(260, 0.06);
  advanceTurn();
  render();
}

function endTurn() {
  const game = state.game;
  if (!game || game.current !== 0 || game.winnerIndex !== null) return;
  state.selectedIds.clear();
  game.message = "AI players are thinking.";
  advanceTurn();
  render();
}

function advanceTurn() {
  const game = state.game;
  game.current = (game.current + 1) % game.players.length;
  if (game.current === 0) {
    game.message = "Your turn. Play a stone group or draw.";
  } else {
    game.message = `${game.players[game.current].name} is thinking.`;
  }
}

function runAITurn() {
  const game = state.game;
  if (!game || game.current === 0 || game.winnerIndex !== null || state.screen !== "game") return;
  const player = game.players[game.current];
  const ai = DIFFICULTY[state.settings.difficulty] || DIFFICULTY.normal;
  const meld = findBestMeld(player.hand, ai.aiMin, ai.aiMax);
  if (meld) {
    const validation = validateMeld(meld);
    game.board.push(orderMeld(meld, validation.type));
    removeTilesFromHand(player, meld);
    player.matchScore += scoreTiles(meld) + (validation.type === "run" ? 12 : 9);
    game.message = `${player.name} played a ${validation.type}.`;
    game.history.push(game.message);
    playSound(430, 0.06);
    if (player.hand.length === 0) {
      finishRound(game.current);
      render();
      return;
    }
  } else if (game.deck.length > 0) {
    player.hand.push(game.deck.shift());
    if (state.settings.autoSort) {
      player.hand = sortTiles(player.hand);
    }
    game.message = `${player.name} drew a stone.`;
    game.history.push(game.message);
  } else {
    game.message = `${player.name} passed.`;
    game.history.push(game.message);
  }
  advanceTurn();
  render();
}

function findBestMeld(hand, minSize = 3, maxSize = 5) {
  const limit = Math.min(maxSize, hand.length);
  let best = null;
  let bestScore = -1;
  for (let size = limit; size >= minSize; size -= 1) {
    const combos = combinations(hand, size);
    for (const combo of combos) {
      const validation = validateMeld(combo);
      if (!validation.valid) continue;
      const comboScore = scoreTiles(combo) + size * 8 + (validation.type === "run" ? 4 : 0);
      if (comboScore > bestScore) {
        best = combo;
        bestScore = comboScore;
      }
    }
    if (best) return best;
  }
  return best;
}

function combinations(items, size) {
  const output = [];
  function walk(start, picked) {
    if (picked.length === size) {
      output.push([...picked]);
      return;
    }
    for (let index = start; index <= items.length - (size - picked.length); index += 1) {
      picked.push(items[index]);
      walk(index + 1, picked);
      picked.pop();
    }
  }
  walk(0, []);
  return output;
}

function validateMeld(tiles) {
  if (tiles.length < 3) {
    return { valid: false, reason: "A group needs at least 3 stones." };
  }
  const jokers = tiles.filter((item) => item.kind === "joker");
  const normal = tiles.filter((item) => item.kind !== "joker");
  if (normal.length === 0) {
    return { valid: true, type: "set", label: "Joker set" };
  }

  const setCheck = validateSet(normal, jokers.length, tiles.length);
  if (setCheck.valid) return setCheck;

  const runCheck = validateRun(normal, jokers.length, tiles.length);
  if (runCheck.valid) return runCheck;

  return { valid: false, reason: "That is not a run or a set yet." };
}

function validateSet(normal, jokerCount, totalLength) {
  const values = new Set(normal.map((item) => item.value));
  if (values.size !== 1) {
    return { valid: false };
  }
  const colorSet = new Set(normal.map((item) => item.color));
  if (colorSet.size !== normal.length) {
    return { valid: false };
  }
  if (totalLength > COLORS.length) {
    return { valid: false };
  }
  const value = normal[0].value;
  return { valid: true, type: "set", label: `${value} set`, jokers: jokerCount };
}

function validateRun(normal, jokerCount, totalLength) {
  const colors = new Set(normal.map((item) => item.color));
  if (colors.size !== 1) {
    return { valid: false };
  }
  const values = normal.map((item) => item.value).sort((a, b) => a - b);
  if (new Set(values).size !== values.length) {
    return { valid: false };
  }
  const span = values[values.length - 1] - values[0] + 1;
  if (span > totalLength) {
    return { valid: false };
  }
  if (values[0] < 1 || values[values.length - 1] > 10) {
    return { valid: false };
  }
  return { valid: true, type: "run", label: `${colorMeta(normal[0].color).label} run`, jokers: jokerCount };
}

function orderMeld(tiles, type) {
  if (type === "set") {
    return [...tiles].sort((a, b) => {
      if (a.kind === "joker") return 1;
      if (b.kind === "joker") return -1;
      return COLORS.findIndex((item) => item.key === a.color) - COLORS.findIndex((item) => item.key === b.color);
    });
  }
  return [...tiles].sort((a, b) => {
    if (a.kind === "joker") return 1;
    if (b.kind === "joker") return -1;
    return a.value - b.value;
  });
}

function scoreTiles(tiles) {
  return tiles.reduce((sum, item) => sum + (item.kind === "joker" ? 15 : item.value), 0);
}

function tileName(item) {
  if (item.kind === "joker") return "a joker";
  return `${colorMeta(item.color).label} ${item.value}`;
}

function hint() {
  const game = state.game;
  if (!game || game.current !== 0) return;
  const meld = findBestMeld(game.players[0].hand, 3, 5);
  state.selectedIds.clear();
  if (!meld) {
    game.message = "No ready group. Draw a stone.";
    showToast(game.message);
    render();
    return;
  }
  for (const item of meld) {
    state.selectedIds.add(item.id);
  }
  const validation = validateMeld(meld);
  game.message = `Hint: play this ${validation.type}.`;
  showToast(game.message);
  playSound(680, 0.05);
  render();
}

function sortHumanHand() {
  const game = state.game;
  if (!game) return;
  game.players[0].hand = sortTiles(game.players[0].hand);
  game.message = "Your rack is sorted.";
  playSound(330, 0.05);
  render();
}

function finishRound(winnerIndex) {
  const game = state.game;
  const winner = game.players[winnerIndex];
  game.winnerIndex = winnerIndex;
  winner.roundWins += 1;
  const leftovers = game.players.reduce((sum, player, index) => {
    if (index === winnerIndex) return sum;
    return sum + scoreTiles(player.hand);
  }, 0);
  const bonus = winnerIndex === 0 ? 80 : 45;
  winner.matchScore += leftovers + bonus;
  game.message = `${winner.name} won round ${game.round}.`;
  game.final = game.round >= game.rounds;
  if (game.final) {
    finalizeMatch();
    state.modal = "final";
  } else {
    state.modal = "round";
  }
  playSound(winnerIndex === 0 ? 760 : 220, 0.18);
}

function finalizeMatch() {
  const game = state.game;
  if (!game || game.recorded) return;
  game.recorded = true;
  const human = game.players[0];
  const bestScore = Math.max(...game.players.map((player) => player.matchScore));
  const wonMatch = human.matchScore >= bestScore;
  if (wonMatch || human.matchScore > 0) {
    state.highscores.push({
      name: human.name,
      score: human.matchScore,
      date: todayLabel()
    });
    state.highscores = state.highscores
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
    saveJSON(STORAGE.scores, state.highscores);
  }
  const coinGain = wonMatch ? 250 : 90;
  const starGain = wonMatch ? 6 : 2;
  state.profile.coins += coinGain;
  state.profile.stars += starGain;
  state.profile.xp = clamp(state.profile.xp + (wonMatch ? 18 : 8), 0, 100);
  if (state.profile.xp >= 100) {
    state.profile.level += 1;
    state.profile.xp = 10;
  }
  saveJSON(STORAGE.profile, state.profile);
}

function nextRound() {
  const game = state.game;
  if (!game) return;
  if (game.final) {
    state.screen = "menu";
    state.modal = null;
    render();
    return;
  }
  game.round += 1;
  dealRound(game, false);
  state.selectedIds.clear();
  state.modal = null;
  showToast(`Round ${game.round} started`);
  render();
}

function showToast(message) {
  state.toast = message;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    state.toast = "";
    render();
  }, 2200);
}

function playSound(frequency, duration) {
  if (!state.settings.sound) return;
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    gain.gain.value = 0.045;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    oscillator.stop(audioContext.currentTime + duration);
  } catch {
    state.settings.sound = false;
  }
}

function getMusicPlayer() {
  if (musicPlayer) return musicPlayer;
  if (typeof Audio === "undefined") return null;
  musicPlayer = new Audio(MUSIC_URL);
  musicPlayer.loop = true;
  musicPlayer.volume = 0.34;
  musicPlayer.preload = "auto";
  return musicPlayer;
}

function syncMusic(shouldPlay = false) {
  const player = getMusicPlayer();
  if (!player) return;
  player.volume = 0.34;
  if (!state.settings.music) {
    player.pause();
    return;
  }
  if (!shouldPlay) return;
  const result = player.play();
  if (result && typeof result.catch === "function") {
    result.catch(() => {});
  }
}

function render() {
  document.body.dataset.theme = state.settings.theme;
  window.clearTimeout(state.aiTimer);
  app.innerHTML = state.screen === "game" ? renderGame() : renderMenu();
  modalRoot.innerHTML = renderModal();
  syncMusic(false);
  scheduleAI();
}

function scheduleAI() {
  const game = state.game;
  if (!game || state.screen !== "game" || state.modal || game.current === 0 || game.winnerIndex !== null) return;
  const ai = DIFFICULTY[state.settings.difficulty] || DIFFICULTY.normal;
  const delay = state.settings.motion ? ai.think : 120;
  state.aiTimer = window.setTimeout(runAITurn, delay);
}

function renderLogo(size = "large") {
  const cls = size === "small" ? "logo-small" : "logo";
  return `
    <div class="${cls}" aria-label="Rummikub Junior">
      <div class="logo-main">Rumm<span class="logo-dot">i</span>kub</div>
      <div class="logo-sub"><span>J</span><span>u</span><span>n</span><span>ior</span></div>
      ${size === "large" ? `<div class="logo-ribbon">Play &amp; Learn</div>` : ""}
    </div>
  `;
}

function renderMenu() {
  const profile = state.profile;
  return `
    <section class="screen menu-screen">
      <div class="soft-star" style="left:9%;top:13%;transform:rotate(18deg)"></div>
      <div class="soft-star" style="right:8%;top:8%;transform:rotate(-10deg) scale(1.25)"></div>
      <div class="float-tile" style="left:2rem;top:3.3rem;--rot:-18deg;--blur:.03rem">${stoneMarkup({ kind: "number", color: "red", value: 6, id: "float1" })}</div>
      <div class="float-tile" style="right:6.4rem;top:3.1rem;--rot:15deg">${stoneMarkup({ kind: "number", color: "blue", value: 5, id: "float2" })}</div>
      <div class="float-tile" style="left:-1.4rem;top:17rem;--rot:-23deg;--blur:.07rem">${stoneMarkup({ kind: "number", color: "yellow", value: 7, id: "float3" })}</div>
      <div class="float-tile" style="left:3.8rem;bottom:13.5rem;--rot:-13deg;--blur:.08rem">${stoneMarkup({ kind: "number", color: "blue", value: 2, id: "float4" })}</div>
      <div class="brand">${renderLogo("large")}<div class="creator-credit">Von Ande Wellmann</div></div>
      <main class="menu-layout">
        <nav class="menu-panel" aria-label="Main menu">
          ${menuButton("start-game", "Play vs AI", "&#9787;", true)}
          ${menuButton("quick-match", "Quick Match", "&#127760;")}
          ${menuButton("open-highscores", "High Scores", "&#127942;")}
          ${menuButton("open-howto", "How to Play", "&#128214;")}
          ${menuButton("open-settings", "Settings", "&#9881;")}
          ${menuButton("exit-app", "Exit", "&#10162;")}
        </nav>
        <section class="showcase" aria-hidden="true">
          <div class="wood-shelf"></div>
          <div class="hero-object hero-big-tile">${heroMascotTile("bloom")}</div>
          <div class="hero-object hero-star-tile">${heroMascotTile("star")}</div>
          <div class="hero-object hero-smile-tile">${heroMascotTile("robot")}</div>
          <div class="hero-object bag hero-bag">Rummikub</div>
          <div class="mini-tiles">
            <div style="--rot:-10deg">${stoneMarkup({ kind: "number", color: "red", value: 3, id: "mini1" })}</div>
            <div style="--rot:6deg">${stoneMarkup({ kind: "number", color: "blue", value: 2, id: "mini2" })}</div>
            <div style="--rot:-5deg">${stoneMarkup({ kind: "number", color: "green", value: 4, id: "mini3" })}</div>
            <div style="--rot:9deg">${stoneMarkup({ kind: "number", color: "yellow", value: 10, id: "mini4" })}</div>
          </div>
          ${renderMiniScores()}
        </section>
      </main>
      ${renderDock(profile)}
      ${state.toast ? `<div class="message-toast">${escapeHTML(state.toast)}</div>` : ""}
    </section>
  `;
}

function menuButton(action, label, icon, primary = false) {
  return `
    <button class="menu-button ${primary ? "primary" : ""}" data-action="${action}">
      <span class="menu-icon">${icon}</span>
      <span class="menu-label">${escapeHTML(label)}</span>
      <span class="menu-arrow">&#8250;</span>
    </button>
  `;
}

function renderMiniScores() {
  const rows = state.highscores.slice(0, 5).map((score, index) => scoreRow(score, index, true)).join("");
  return `
    <aside class="menu-score-card">
      <div class="score-title"><span>&#127942;</span><span>High Scores</span></div>
      <div class="score-list">${rows}</div>
    </aside>
  `;
}

function renderGame() {
  const game = state.game;
  if (!game) return renderMenu();
  const human = game.players[0];
  const selectedCount = state.selectedIds.size;
  return `
    <section class="screen game-screen">
      <header class="game-topbar">
        ${renderLogo("small")}
        <div class="round-panel">
          <span class="round-label">Round ${game.round} / ${game.rounds}</span>
          <div class="round-stars">${renderRoundStars(human.roundWins, game.rounds)}</div>
        </div>
        <nav class="top-actions" aria-label="Game actions">
          <button class="top-button square" data-action="toggle-music"><span>${state.settings.music ? "&#9835;" : "&#9836;"}</span><span class="tooltip">${state.settings.music ? "Music off" : "Music on"}</span></button>
          <button class="top-button" data-action="open-highscores"><span>&#127942;</span><span class="label">High Scores</span></button>
          <button class="top-button" data-action="open-settings"><span>&#9881;</span><span class="label">Settings</span></button>
          <button class="top-button square" data-action="menu"><span>&#9776;</span><span class="tooltip">Menu</span></button>
        </nav>
      </header>
      <main class="table-wrap">
        <section class="wood-table" aria-label="Rummikub table">
          ${renderAIPanel(game.players[2], "top")}
          ${renderAIPanel(game.players[1], "left")}
          ${renderAIPanel(game.players[3], "right")}
          ${renderAIRack(game.players[2], "top")}
          ${renderAIRack(game.players[1], "left")}
          ${renderAIRack(game.players[3], "right")}
          ${game.current !== 0 ? `<div class="thinking">AI<br>Thinking...</div>` : ""}
          <div class="bag deck-bag">Rummikub</div>
          <div class="deck-counter"><small>Tiles Left</small><strong>${game.deck.length}</strong></div>
          <section class="meld-area" aria-label="Played groups">
            ${renderBoard(game.board)}
          </section>
          <section class="table-bottom">
            <aside class="turn-card">
              <h2>${game.current === 0 ? "Your Turn" : escapeHTML(game.players[game.current].name)}</h2>
              <p>${escapeHTML(game.message)}</p>
              <span class="turn-play" aria-hidden="true"></span>
            </aside>
            <section class="rack" aria-label="Your rack">
              <div class="rack-tiles">${human.hand.map((item) => stoneMarkup(item, { selectable: game.current === 0 })).join("")}</div>
              <div class="rack-brand">Rummikub</div>
            </section>
            <section class="action-row" aria-label="Turn controls">
              ${actionButton("draw-tile", "Draw", "&#9819;", game.current !== 0)}
              ${actionButton("hint", "Hint", "&#128161;", game.current !== 0, "hint", selectedCount ? "" : "2")}
              ${actionButton("sort", "Sort", "&#8597;", false, "sort")}
              ${actionButton("play-selected", "Play", "&#9654;", game.current !== 0 || selectedCount < 3, "play")}
              ${actionButton("end-turn", "End Turn", "&#10003;", game.current !== 0, "end")}
            </section>
          </section>
        </section>
      </main>
      ${renderDock(state.profile)}
      ${state.toast ? `<div class="message-toast">${escapeHTML(state.toast)}</div>` : ""}
    </section>
  `;
}

function renderRoundStars(wins, rounds) {
  const visible = Math.min(5, rounds);
  return Array.from({ length: visible }, (_, index) => `<span class="round-star ${index < wins ? "on" : ""}"></span>`).join("");
}

function renderAIPanel(player, position) {
  return `
    <aside class="ai-card ${position}">
      <div class="ai-avatar ${player.avatar}">${avatarFace(player.avatar)}</div>
      <div>
        <div class="ai-name">${escapeHTML(player.name)}</div>
        <div class="ai-rank"><span>&#11088;</span><span>${escapeHTML(player.rank)}</span></div>
      </div>
      <div class="ai-score">${player.hand.length}</div>
    </aside>
  `;
}

function renderAIRack(player, position) {
  const count = Math.min(player.hand.length, 10);
  return `
    <div class="ai-rack ${position}" aria-hidden="true">
      ${Array.from({ length: count }, () => `<span class="tile-back"></span>`).join("")}
    </div>
  `;
}

function renderBoard(groups) {
  if (!groups.length) {
    return `<div class="empty-board">Play a run or a set to start the table.</div>`;
  }
  return groups.map((group) => `
    <div class="meld-row">${group.map((item) => stoneMarkup(item)).join("")}</div>
  `).join("");
}

function renderDock(profile) {
  return `
    <footer class="dock">
      <section class="profile">
        <div class="avatar-ring"><span class="avatar-face"></span></div>
        <div>
          <div class="profile-name">${escapeHTML(state.settings.playerName || "HappyPlayer")}</div>
          <div class="profile-rank"><span>&#11088;</span><span>Junior Star</span></div>
          <div class="dock-credit">Von Ande Wellmann</div>
          <div class="xp-track"><span class="xp-fill" style="--xp:${clamp(profile.xp, 0, 100)}%"></span></div>
        </div>
        <div class="level-star">${profile.level}</div>
      </section>
      <section class="wallet">
        <div class="wallet-pill"><span class="coin-icon">$</span><span>${formatNumber(profile.coins)}</span><button class="plus-button" data-action="bonus">+</button></div>
        <div class="wallet-pill"><span class="star-icon"></span><span>${formatNumber(profile.stars)}</span><button class="plus-button" data-action="bonus">+</button></div>
        <div class="wallet-pill"><span class="crown-icon">&#9813;</span><span>Level ${profile.level}</span></div>
      </section>
      <nav class="dock-actions" aria-label="Player rewards">
        <button class="dock-icon" data-action="bonus"><span>&#127873;</span><span class="badge">1</span><span class="tooltip">Gift</span></button>
        <button class="dock-icon" data-action="toggle-music"><span>${state.settings.music ? "&#9835;" : "&#9836;"}</span><span class="tooltip">${state.settings.music ? "Music off" : "Music on"}</span></button>
        <button class="dock-icon" data-action="open-highscores"><span>&#128197;</span><span class="tooltip">Scores</span></button>
        <button class="dock-icon" data-action="open-settings"><span>&#128101;</span><span class="tooltip">Profile</span></button>
      </nav>
    </footer>
  `;
}

function actionButton(action, label, icon, disabled = false, extraClass = "", notification = "") {
  return `
    <button class="action-button ${extraClass}" data-action="${action}" ${disabled ? "disabled" : ""}>
      ${notification ? `<span class="notif">${notification}</span>` : ""}
      <span class="action-icon">${icon}</span>
      <span class="action-text">${escapeHTML(label)}</span>
    </button>
  `;
}

function avatarFace(kind) {
  if (kind === "star") {
    return `<span class="face"></span>`;
  }
  if (kind === "bloom") {
    return `<span class="face"></span>`;
  }
  return `<span class="face"></span>`;
}

function heroMascotTile(kind) {
  if (kind === "star") {
    return `
      <div class="stone joker-tile joker-crown">
        <div class="joker-face">
          <span class="crown-shape"></span>
          <span class="face"></span>
        </div>
      </div>
    `;
  }
  if (kind === "bloom") {
    return `
      <div class="stone" style="--tile-color:#e52b27">
        <span class="tile-emblem"></span>
        <span class="tile-value">8</span>
        <span class="pip"></span>
      </div>
    `.replace("stone\"", "stone shape-flower\"");
  }
  return stoneMarkup({ kind: "joker", color: "joker", value: 0, id: "hero-robot" });
}

function stoneMarkup(item, options = {}) {
  const selectable = options.selectable === true;
  const selected = state.selectedIds.has(item.id);
  if (item.kind === "joker") {
    return `
      <button class="stone joker-tile ${item.copy % 2 ? "joker-crown" : ""} ${selected ? "selected" : ""}"
        ${selectable ? `data-action="select-tile" data-id="${escapeHTML(item.id)}"` : "tabindex=\"-1\""}
        aria-label="Joker stone">
        <span class="joker-face">
          ${item.copy % 2 ? `<span class="crown-shape"></span>` : ""}
          <span class="face"></span>
        </span>
        <span class="pip"></span>
      </button>
    `;
  }
  const meta = colorMeta(item.color);
  return `
    <button class="stone shape-${meta.shape} ${selected ? "selected" : ""}" style="--tile-color:${meta.value}"
      ${selectable ? `data-action="select-tile" data-id="${escapeHTML(item.id)}"` : "tabindex=\"-1\""}
      aria-label="${escapeHTML(meta.label)} ${item.value} stone">
      <span class="tile-emblem"></span>
      <span class="tile-value">${item.value}</span>
      <span class="pip"></span>
    </button>
  `;
}

function renderModal() {
  if (!state.modal) return "";
  if (state.modal === "settings") return renderSettingsModal();
  if (state.modal === "scores") return renderScoresModal();
  if (state.modal === "howto") return renderHowToModal();
  if (state.modal === "round") return renderRoundModal(false);
  if (state.modal === "final") return renderRoundModal(true);
  if (state.modal === "exit") return renderExitModal();
  if (state.modal === "bonus") return renderBonusModal();
  return "";
}

function modalShell(title, icon, body, actions = "", wide = false) {
  return `
    <div class="modal-backdrop">
      <section class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${escapeHTML(title)}">
        <header class="modal-header">
          <h2><span>${icon}</span><span>${escapeHTML(title)}</span></h2>
          <button class="close-button" data-action="close-modal" aria-label="Close">&times;</button>
        </header>
        <div class="modal-body">${body}</div>
        ${actions ? `<footer class="modal-actions">${actions}</footer>` : ""}
      </section>
    </div>
  `;
}

function renderSettingsModal() {
  const s = state.settings;
  const themeButtons = THEMES.map((theme) => `
    <button class="theme-chip ${s.theme === theme.key ? "active" : ""}" data-action="set-theme" data-theme="${theme.key}">
      <span class="theme-swatch" style="background:${theme.swatch}"></span>
      <span>${escapeHTML(theme.label)}</span>
    </button>
  `).join("");
  const difficultyButtons = Object.entries(DIFFICULTY).map(([key, value]) => `
    <button class="chip ${s.difficulty === key ? "active" : ""}" data-action="set-difficulty" data-difficulty="${key}">
      ${escapeHTML(value.label)}
    </button>
  `).join("");
  const body = `
    <div class="settings-grid">
      <section class="settings-card">
        <h3>Player</h3>
        <label class="field">
          <span>Name</span>
          <input type="text" data-setting="playerName" maxlength="18" value="${escapeHTML(s.playerName)}">
        </label>
        <label class="field">
          <span>Rounds</span>
          <select data-setting="rounds">
            ${[3, 5, 7].map((rounds) => `<option value="${rounds}" ${Number(s.rounds) === rounds ? "selected" : ""}>${rounds}</option>`).join("")}
          </select>
        </label>
      </section>
      <section class="settings-card">
        <h3>Difficulty</h3>
        <div class="segmented">${difficultyButtons}</div>
      </section>
      <section class="settings-card">
        <h3>Themes</h3>
        <div class="theme-grid">${themeButtons}</div>
      </section>
      <section class="settings-card">
        <h3>Options</h3>
        ${toggleLine("sound", "Sound", s.sound)}
        ${toggleLine("music", "Game music", s.music)}
        ${toggleLine("motion", "Motion", s.motion)}
        ${toggleLine("autoSort", "Auto sort racks", s.autoSort)}
      </section>
    </div>
  `;
  const actions = `
    <button class="modal-button yellow" data-action="reset-data">Reset Data</button>
    <button class="modal-button green" data-action="save-settings">Done</button>
  `;
  return modalShell("Settings", "&#9881;", body, actions, true);
}

function toggleLine(key, label, checked) {
  return `
    <label class="toggle-line">
      <span>${escapeHTML(label)}</span>
      <span class="switch">
        <input type="checkbox" data-setting="${key}" ${checked ? "checked" : ""}>
        <span></span>
      </span>
    </label>
  `;
}

function renderScoresModal() {
  const rows = state.highscores.slice(0, 10).map((score, index) => scoreRow(score, index, false)).join("");
  const body = `<div class="score-card"><div class="score-list">${rows}</div></div>`;
  const actions = `<button class="modal-button yellow" data-action="clear-scores">Clear Scores</button>`;
  return modalShell("High Scores", "&#127942;", body, actions);
}

function scoreRow(score, index, compact) {
  const rankClass = index === 0 ? "gold" : index === 1 ? "silver" : index === 2 ? "bronze" : "";
  const suffix = compact ? "" : `<span>${escapeHTML(score.date || "")}</span>`;
  return `
    <div class="score-row">
      <span class="rank ${rankClass}">${index + 1}</span>
      <span>${escapeHTML(score.name)}</span>
      <strong>${formatNumber(score.score)}</strong>
      ${suffix}
    </div>
  `;
}

function renderHowToModal() {
  const body = `
    <div class="howto-grid">
      <section class="howto-card">
        <h3>Runs</h3>
        <div class="meld-row">${["red", "red", "red"].map((color, index) => stoneMarkup({ kind: "number", color, value: index + 2, id: `how-run-${index}` })).join("")}</div>
        <p>Same color, counting up, 3 or more stones.</p>
      </section>
      <section class="howto-card">
        <h3>Sets</h3>
        <div class="meld-row">${["red", "blue", "green"].map((color, index) => stoneMarkup({ kind: "number", color, value: 7, id: `how-set-${index}` })).join("")}</div>
        <p>Same number, different colors, 3 or 4 stones.</p>
      </section>
      <section class="howto-card">
        <h3>Jokers</h3>
        <div class="meld-row">${[stoneMarkup({ kind: "number", color: "yellow", value: 8, id: "how-j1" }), stoneMarkup({ kind: "joker", color: "joker", value: 0, id: "how-j2" }), stoneMarkup({ kind: "number", color: "yellow", value: 10, id: "how-j3" })].join("")}</div>
        <p>Jokers fill one missing stone in a run or set.</p>
      </section>
    </div>
  `;
  return modalShell("How to Play", "&#128214;", body);
}

function renderRoundModal(final) {
  const game = state.game;
  if (!game) return "";
  const winner = game.players[game.winnerIndex];
  const sorted = [...game.players].sort((a, b) => b.matchScore - a.matchScore);
  const body = `
    <div class="round-summary">
      <h3>${escapeHTML(final ? "Match Complete" : `Round ${game.round} Complete`)}</h3>
      ${sorted.map((player) => `
        <div class="result-row ${player === winner ? "winner" : ""}">
          <span>${escapeHTML(player.name)} ${player === winner ? "won this round" : ""}</span>
          <span>${player.roundWins} &#11088;</span>
          <strong>${formatNumber(player.matchScore)}</strong>
        </div>
      `).join("")}
    </div>
  `;
  const actions = final
    ? `<button class="modal-button" data-action="open-highscores">High Scores</button><button class="modal-button green" data-action="menu">Main Menu</button>`
    : `<button class="modal-button green" data-action="next-round">Next Round</button>`;
  return modalShell(final ? "Match Results" : "Round Results", final ? "&#9813;" : "&#11088;", body, actions);
}

function renderExitModal() {
  const body = `<p style="margin:0;font-weight:900">Your progress is saved in this browser.</p>`;
  const actions = `<button class="modal-button" data-action="close-modal">Keep Playing</button><button class="modal-button yellow" data-action="menu">Main Menu</button>`;
  return modalShell("Exit", "&#10162;", body, actions);
}

function renderBonusModal() {
  const body = `<p style="margin:0;font-weight:900">Daily bonus added: 100 coins and 2 stars.</p>`;
  const actions = `<button class="modal-button green" data-action="close-modal">Done</button>`;
  return modalShell("Gift", "&#127873;", body, actions);
}

function updateSetting(key, value) {
  if (key === "playerName") {
    state.settings.playerName = value.trim().slice(0, 18) || "HappyPlayer";
    if (state.game) {
      state.game.players[0].name = state.settings.playerName;
    }
  } else if (key === "rounds") {
    state.settings.rounds = Number(value);
  } else if (key === "sound" || key === "music" || key === "motion" || key === "autoSort") {
    state.settings[key] = Boolean(value);
  }
  saveJSON(STORAGE.settings, state.settings);
  syncMusic(key === "music" && Boolean(value));
}

function resetData() {
  state.settings = structuredClone(DEFAULT_SETTINGS);
  state.profile = structuredClone(DEFAULT_PROFILE);
  state.highscores = structuredClone(DEFAULT_SCORES);
  saveJSON(STORAGE.settings, state.settings);
  saveJSON(STORAGE.profile, state.profile);
  saveJSON(STORAGE.scores, state.highscores);
  state.game = null;
  state.screen = "menu";
  state.modal = null;
  showToast("Saved data reset");
  render();
}

function clearScores() {
  state.highscores = structuredClone(DEFAULT_SCORES);
  saveJSON(STORAGE.scores, state.highscores);
  showToast("High scores reset");
  render();
}

function claimBonus() {
  state.profile.coins += 100;
  state.profile.stars += 2;
  saveJSON(STORAGE.profile, state.profile);
  state.modal = "bonus";
  playSound(760, 0.08);
  render();
}

app.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  syncMusic(true);
  const action = button.dataset.action;
  if (action === "select-tile") {
    const id = button.dataset.id;
    if (state.selectedIds.has(id)) {
      state.selectedIds.delete(id);
    } else {
      state.selectedIds.add(id);
    }
    playSound(490, 0.03);
    render();
    return;
  }
  handleAction(action, button);
});

modalRoot.addEventListener("click", (event) => {
  const modal = event.target.closest(".modal");
  const button = event.target.closest("[data-action]");
  if (!button && modal) return;
  if (!button && event.target.classList.contains("modal-backdrop")) {
    state.modal = null;
    render();
    return;
  }
  if (!button || button.disabled) return;
  event.stopPropagation();
  syncMusic(true);
  handleAction(button.dataset.action, button);
});

modalRoot.addEventListener("input", (event) => {
  const input = event.target.closest("[data-setting]");
  if (!input) return;
  if (input.type !== "text") return;
  updateSetting(input.dataset.setting, input.value);
});

modalRoot.addEventListener("change", (event) => {
  const input = event.target.closest("[data-setting]");
  if (!input) return;
  if (input.type === "checkbox") {
    updateSetting(input.dataset.setting, input.checked);
  } else {
    updateSetting(input.dataset.setting, input.value);
  }
  render();
});

function handleAction(action, button) {
  switch (action) {
    case "start-game":
    case "quick-match":
      startGame();
      break;
    case "open-highscores":
      state.modal = "scores";
      render();
      break;
    case "open-settings":
      state.modal = "settings";
      render();
      break;
    case "open-howto":
      state.modal = "howto";
      render();
      break;
    case "exit-app":
      state.modal = "exit";
      render();
      break;
    case "menu":
      state.screen = "menu";
      state.modal = null;
      state.selectedIds.clear();
      render();
      break;
    case "draw-tile":
      drawTile();
      break;
    case "end-turn":
      endTurn();
      break;
    case "play-selected":
      playSelected();
      break;
    case "hint":
      hint();
      break;
    case "sort":
      sortHumanHand();
      break;
    case "next-round":
      nextRound();
      break;
    case "set-theme":
      state.settings.theme = button.dataset.theme;
      saveJSON(STORAGE.settings, state.settings);
      playSound(620, 0.05);
      render();
      break;
    case "set-difficulty":
      state.settings.difficulty = button.dataset.difficulty;
      saveJSON(STORAGE.settings, state.settings);
      render();
      break;
    case "toggle-music":
      state.settings.music = !state.settings.music;
      saveJSON(STORAGE.settings, state.settings);
      syncMusic(state.settings.music);
      render();
      break;
    case "save-settings":
    case "close-modal":
      state.modal = null;
      render();
      break;
    case "reset-data":
      resetData();
      break;
    case "clear-scores":
      clearScores();
      break;
    case "bonus":
      claimBonus();
      break;
    default:
      break;
  }
}

render();
