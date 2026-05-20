"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const { CAMP_ARCADE_GAMES } = require("../arcade-config.js");

const STATE_KEY = "camp-arcade:ticket-state:v1";
const LOCK_KEY = "camp-arcade:ticket-state-lock:v1";
const LOCK_TTL_SECONDS = 5;
const VALID_GAME_IDS = new Set(CAMP_ARCADE_GAMES.map((game) => game.id));
const DEFAULT_STATE_FILE = path.join("/tmp", "camp-arcade-ticket-state.json");
let fileMutationQueue = Promise.resolve();

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function emptyGameTickets() {
  return Object.fromEntries(CAMP_ARCADE_GAMES.map((game) => [game.id, 0]));
}

function emptyPerGameHighScores() {
  return Object.fromEntries(
    CAMP_ARCADE_GAMES.map((game) => [
      game.id,
      {
        score: 0,
        userId: null,
        email: "",
        reachedAt: null,
      },
    ])
  );
}

function createInitialState() {
  return {
    version: 1,
    users: {},
    global: {
      totalTickets: 0,
      highScore: 0,
      highScoreUserId: null,
      highScoreEmail: "",
      highScoreReachedAt: null,
      perGameHighScores: emptyPerGameHighScores(),
    },
    showdown: {
      active: false,
      lockedHighScore: 0,
      winnerUserId: null,
      winnerEmail: "",
      startedAt: null,
    },
    updatedAt: nowIso(),
  };
}

function normalizeState(rawState) {
  const base = createInitialState();
  const state = rawState && typeof rawState === "object" ? rawState : {};
  const normalized = {
    ...base,
    ...state,
    users: state.users && typeof state.users === "object" ? state.users : {},
    global: {
      ...base.global,
      ...(state.global && typeof state.global === "object" ? state.global : {}),
      perGameHighScores: {
        ...base.global.perGameHighScores,
        ...(state.global && state.global.perGameHighScores
          ? state.global.perGameHighScores
          : {}),
      },
    },
    showdown: {
      ...base.showdown,
      ...(state.showdown && typeof state.showdown === "object" ? state.showdown : {}),
    },
  };

  Object.values(normalized.users).forEach((user) => {
    user.gameTickets = {
      ...emptyGameTickets(),
      ...(user.gameTickets && typeof user.gameTickets === "object" ? user.gameTickets : {}),
    };
    user.totalTickets = Number(user.totalTickets || 0);
    user.email = user.email || "";
  });

  return normalized;
}

function validateUserId(userId) {
  if (typeof userId !== "string" || !/^[a-zA-Z0-9:_-]{6,96}$/.test(userId)) {
    const error = new Error("A valid anonymous userId is required.");
    error.statusCode = 400;
    throw error;
  }
}

function validateGameId(gameId) {
  if (!VALID_GAME_IDS.has(gameId)) {
    const error = new Error("Invalid QR code.");
    error.statusCode = 400;
    throw error;
  }
}

function normalizeEmail(email) {
  const cleanEmail = String(email || "").trim().toLowerCase();

  if (!cleanEmail) {
    return "";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) || cleanEmail.length > 160) {
    const error = new Error("Enter a valid email address.");
    error.statusCode = 400;
    throw error;
  }

  return cleanEmail;
}

function ensureUser(state, userId, email = "") {
  validateUserId(userId);
  const timestamp = nowIso();

  if (!state.users[userId]) {
    state.users[userId] = {
      userId,
      email: "",
      totalTickets: 0,
      gameTickets: emptyGameTickets(),
      highScoreReachedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  const user = state.users[userId];
  user.gameTickets = {
    ...emptyGameTickets(),
    ...(user.gameTickets || {}),
  };

  if (email) {
    user.email = email;
    updateStoredEmailReferences(state, userId, email);
  }

  return user;
}

function updateStoredEmailReferences(state, userId, email) {
  if (state.global.highScoreUserId === userId) {
    state.global.highScoreEmail = email;
  }

  Object.values(state.global.perGameHighScores || {}).forEach((score) => {
    if (score.userId === userId) {
      score.email = email;
    }
  });

  if (state.showdown.winnerUserId === userId) {
    state.showdown.winnerEmail = email;
  }
}

function displayUser(userId, email = "") {
  return email || userId || "No winner yet";
}

function getMostScannedGame(user) {
  let bestGame = null;
  let bestCount = 0;

  CAMP_ARCADE_GAMES.forEach((game) => {
    const count = Number(user.gameTickets[game.id] || 0);
    if (count > bestCount) {
      bestGame = game;
      bestCount = count;
    }
  });

  if (!bestGame) {
    return null;
  }

  return {
    gameId: bestGame.id,
    name: bestGame.name,
    tickets: bestCount,
  };
}

function publicState(state, userId = "") {
  const user = userId && state.users[userId] ? state.users[userId] : null;
  const safeUser = user
    ? {
        userId: user.userId,
        email: user.email || "",
        totalTickets: Number(user.totalTickets || 0),
        gameTickets: { ...emptyGameTickets(), ...(user.gameTickets || {}) },
        mostScannedGame: getMostScannedGame(user),
        highScoreReachedAt: user.highScoreReachedAt || null,
      }
    : {
        userId,
        email: "",
        totalTickets: 0,
        gameTickets: emptyGameTickets(),
        mostScannedGame: null,
        highScoreReachedAt: null,
      };

  const showdown = {
    ...state.showdown,
    winnerDisplay: displayUser(state.showdown.winnerUserId, state.showdown.winnerEmail),
  };

  return {
    ok: true,
    games: clone(CAMP_ARCADE_GAMES),
    user: safeUser,
    global: {
      ...state.global,
      highScoreDisplay: displayUser(
        state.global.highScoreUserId,
        state.global.highScoreEmail
      ),
    },
    showdown,
    isShowdownWinner: Boolean(
      state.showdown.active && state.showdown.winnerUserId && state.showdown.winnerUserId === userId
    ),
    storageMode: storageMode(),
    updatedAt: state.updatedAt || null,
  };
}

function hasKvConfig() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function storageMode() {
  return hasKvConfig() ? "vercel-kv" : "local-file";
}

function shouldRequireKv() {
  return Boolean(process.env.VERCEL || process.env.NODE_ENV === "production");
}

async function kvCommand(command) {
  if (!hasKvConfig()) {
    const error = new Error(
      "Vercel KV is not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN."
    );
    error.statusCode = 500;
    throw error;
  }

  const response = await fetch(process.env.KV_REST_API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const result = await response.json().catch(() => null);

  if (!response.ok || !result || result.error) {
    const error = new Error(result && result.error ? result.error : "KV command failed.");
    error.statusCode = 502;
    throw error;
  }

  return result.result;
}

async function readKvState() {
  const raw = await kvCommand(["GET", STATE_KEY]);
  return normalizeState(raw ? JSON.parse(raw) : createInitialState());
}

async function writeKvState(state) {
  await kvCommand(["SET", STATE_KEY, JSON.stringify(state)]);
}

async function acquireKvLock() {
  const token = crypto.randomUUID();
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    const result = await kvCommand(["SET", LOCK_KEY, token, "NX", "EX", String(LOCK_TTL_SECONDS)]);
    if (result === "OK") {
      return token;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  const error = new Error("Ticket store is busy. Try again.");
  error.statusCode = 503;
  throw error;
}

async function releaseKvLock(token) {
  const script =
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
  await kvCommand(["EVAL", script, "1", LOCK_KEY, token]);
}

async function withKvState(mutator) {
  const token = await acquireKvLock();
  try {
    const state = await readKvState();
    const result = await mutator(state);
    state.updatedAt = nowIso();
    await writeKvState(state);
    return result;
  } finally {
    await releaseKvLock(token).catch(() => {});
  }
}

async function readFileState() {
  const stateFile = process.env.ARCADE_STATE_FILE || DEFAULT_STATE_FILE;
  try {
    const raw = await fs.readFile(stateFile, "utf8");
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT") {
      return createInitialState();
    }
    throw error;
  }
}

async function writeFileState(state) {
  const stateFile = process.env.ARCADE_STATE_FILE || DEFAULT_STATE_FILE;
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
}

async function withFileState(mutator) {
  const runMutation = async () => {
    const state = await readFileState();
    const result = await mutator(state);
    state.updatedAt = nowIso();
    await writeFileState(state);
    return result;
  };
  const result = fileMutationQueue.then(runMutation, runMutation);
  fileMutationQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function withState(mutator) {
  if (hasKvConfig()) {
    return withKvState(mutator);
  }

  if (shouldRequireKv()) {
    const error = new Error(
      "Persistent storage is not configured. Add Vercel KV environment variables before deployment."
    );
    error.statusCode = 500;
    throw error;
  }

  return withFileState(mutator);
}

async function getStateForUser(userId) {
  validateUserId(userId);
  return withState(async (state) => publicState(state, userId));
}

async function saveUserEmail(userId, email) {
  const cleanEmail = normalizeEmail(email);

  return withState(async (state) => {
    const user = ensureUser(state, userId, cleanEmail);
    user.updatedAt = nowIso();
    return {
      ...publicState(state, userId),
      message: cleanEmail ? "Email saved." : "Email cleared.",
    };
  });
}

async function applyScan({ userId, email = "", gameId }) {
  validateGameId(gameId);
  const cleanEmail = normalizeEmail(email);

  return withState(async (state) => {
    const user = ensureUser(state, userId, cleanEmail);
    const game = CAMP_ARCADE_GAMES.find((entry) => entry.id === gameId);
    const timestamp = nowIso();

    user.totalTickets = Number(user.totalTickets || 0) + 1;
    user.gameTickets[gameId] = Number(user.gameTickets[gameId] || 0) + 1;
    user.updatedAt = timestamp;
    state.global.totalTickets = Number(state.global.totalTickets || 0) + 1;

    // During showdown, scans still count for users and total scans, but all
    // high-score tables stay locked so the showdown winner cannot change.
    if (!state.showdown.active) {
      if (user.totalTickets > Number(state.global.highScore || 0)) {
        state.global.highScore = user.totalTickets;
        state.global.highScoreUserId = user.userId;
        state.global.highScoreEmail = user.email || "";
        state.global.highScoreReachedAt = timestamp;
        user.highScoreReachedAt = timestamp;
      }

      const gameScore = state.global.perGameHighScores[gameId] || {
        score: 0,
        userId: null,
        email: "",
        reachedAt: null,
      };

      if (user.gameTickets[gameId] > Number(gameScore.score || 0)) {
        state.global.perGameHighScores[gameId] = {
          score: user.gameTickets[gameId],
          userId: user.userId,
          email: user.email || "",
          reachedAt: timestamp,
        };
      }
    }

    return {
      ...publicState(state, userId),
      message: state.showdown.active
        ? `Showdown is locked. Ticket counted for ${game.name}.`
        : `+1 ticket for ${game.name}`,
      scannedGame: clone(game),
    };
  });
}

async function startShowdown() {
  return withState(async (state) => {
    if (!state.showdown.active) {
      state.showdown = {
        active: true,
        lockedHighScore: Number(state.global.highScore || 0),
        winnerUserId: state.global.highScoreUserId || null,
        winnerEmail: state.global.highScoreEmail || "",
        startedAt: nowIso(),
      };
    }

    return {
      ...publicState(state, ""),
      message: "Showdown locked.",
    };
  });
}

async function resetState() {
  return withState(async (state) => {
    const nextState = createInitialState();
    Object.keys(state).forEach((key) => {
      delete state[key];
    });
    Object.assign(state, nextState);
    return {
      ...publicState(state, ""),
      message: "Arcade ticket state reset.",
    };
  });
}

module.exports = {
  VALID_GAME_IDS,
  applyScan,
  getStateForUser,
  resetState,
  saveUserEmail,
  startShowdown,
};
