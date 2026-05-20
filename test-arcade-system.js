"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");

const testStateFile = path.join(os.tmpdir(), `camp-arcade-test-${process.pid}.json`);
process.env.ARCADE_STATE_FILE = testStateFile;
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;
delete process.env.VERCEL;

const { CAMP_ARCADE_GAMES } = require("../arcade-config.js");
const { applyScan, getStateForUser, resetState, startShowdown } = require("../lib/arcade-store.js");

async function scanMany(userId, gameId, count, email = "") {
  let state = null;
  for (let index = 0; index < count; index += 1) {
    state = await applyScan({ userId, gameId, email });
  }
  return state;
}

async function run() {
  await resetState();

  assert.equal(CAMP_ARCADE_GAMES.length, 15, "there should be 15 configured games");

  for (const game of CAMP_ARCADE_GAMES) {
    const state = await applyScan({ userId: "anon_allgames", gameId: game.id });
    assert.equal(state.user.gameTickets[game.id], 1, `${game.id} should count`);
  }

  await resetState();
  await scanMany("anon_player_one", "game-1", 2, "one@example.com");
  let state = await scanMany("anon_player_one", "game-2", 1, "one@example.com");
  assert.equal(state.user.totalTickets, 3, "user total should include all games");
  assert.equal(state.user.gameTickets["game-1"], 2, "repeat scan should count");
  assert.equal(state.user.mostScannedGame.gameId, "game-1", "most scanned game should be game-1");
  assert.equal(state.global.totalTickets, 3, "global total should update");
  assert.equal(state.global.highScore, 3, "global high score should update");
  assert.equal(state.global.highScoreEmail, "one@example.com", "high scorer email should be stored");

  state = await scanMany("anon_player_two", "game-3", 3, "two@example.com");
  assert.equal(state.global.highScore, 3, "tie should not replace high score");
  assert.equal(state.global.highScoreEmail, "one@example.com", "first user to tie score should stay");

  state = await scanMany("anon_player_two", "game-3", 1, "two@example.com");
  assert.equal(state.global.highScore, 4, "new higher score should replace high score");
  assert.equal(state.global.highScoreEmail, "two@example.com", "new high scorer should be stored");

  const showdown = await startShowdown();
  assert.equal(showdown.showdown.active, true, "showdown should lock");
  assert.equal(showdown.showdown.lockedHighScore, 4, "showdown should lock current high score");
  assert.equal(showdown.showdown.winnerEmail, "two@example.com", "showdown winner should be current leader");

  state = await scanMany("anon_player_one", "game-1", 5, "one@example.com");
  assert.equal(state.user.totalTickets, 8, "scans after showdown still count for users");
  assert.equal(state.global.totalTickets, 12, "scans after showdown still count globally");
  assert.equal(state.global.highScore, 4, "locked high score should not change");
  assert.equal(state.showdown.winnerEmail, "two@example.com", "locked winner should not change");

  const winnerState = await getStateForUser("anon_player_two");
  const otherState = await getStateForUser("anon_player_one");
  assert.equal(winnerState.isShowdownWinner, true, "winner should be flagged");
  assert.equal(otherState.isShowdownWinner, false, "other users should not be flagged");

  fs.rmSync(testStateFile, { force: true });
  console.log("Arcade system tests passed.");
}

run().catch((error) => {
  fs.rmSync(testStateFile, { force: true });
  console.error(error);
  process.exit(1);
});
