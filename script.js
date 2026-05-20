"use strict";

const ROUTES = ["home", "register", "arcade"];
const REGISTRATION_KEY = "campArcadeRegistrations";
const ACTIVE_PLAYER_KEY = "campArcadeActivePlayer";
const USER_ID_KEY = "campArcadeAnonymousUserId";
const USER_EMAIL_KEY = "campArcadeUserEmail";
const EVENT_END = new Date("2026-05-11T18:00:00");
const REGISTRATION_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbx8S34G4BBimvan5igODhH5AzxMgcIekcNdVdBYJm-pE40dsavcMtFGtLUWxFe8Zi8s_g/exec";

const ARCADE_GAMES = window.CAMP_ARCADE_GAMES || [];
const ARCADE_CONFIG = window.CAMP_ARCADE_CONFIG || { pollIntervalMs: 4000 };
const VALID_GAME_IDS = new Set(ARCADE_GAMES.map((game) => game.id));

const pages = document.querySelectorAll("[data-page]");
const routeLinks = document.querySelectorAll("[data-route]");
const navLinks = document.querySelectorAll(".nav-link");
const menuToggle = document.querySelector(".menu-toggle");
const navMenu = document.querySelector(".nav-links");

const registrationForm = document.querySelector("#registration-form");
const gameFields = document.querySelector("#game-fields");
const formStatus = document.querySelector("#form-status");
const submitButton = document.querySelector("#submit-btn");

const anonymousUserId = document.querySelector("#anonymous-user-id");
const playerEmailInput = document.querySelector("#player-email");
const savePlayerButton = document.querySelector("#save-player");
const playerStatus = document.querySelector("#player-status");
const ticketCount = document.querySelector("#ticket-count");
const ticketFeedback = document.querySelector("#ticket-feedback");
const scanButton = document.querySelector("#scan-button");
const leaderboardList = document.querySelector("#leaderboard");
const userGameTickets = document.querySelector("#user-game-tickets");
const mostScannedGame = document.querySelector("#most-scanned-game");
const globalHighScore = document.querySelector("#global-high-score");
const globalHighUser = document.querySelector("#global-high-user");
const globalTotalScans = document.querySelector("#global-total-scans");
const showdownStatus = document.querySelector("#showdown-status");
const showdownWinner = document.querySelector("#showdown-winner");
const adminSecretInput = document.querySelector("#admin-secret");
const startShowdownButton = document.querySelector("#start-showdown");
const adminStatus = document.querySelector("#admin-status");
const countdown = document.querySelector("#countdown");

const scanModal = document.querySelector("#scan-modal");
const scanResult = document.querySelector("#scan-result");
const claimResult = document.querySelector("#claim-result");
const qrVideo = document.querySelector("#qr-video");
const winnerOverlay = document.querySelector("#winner-overlay");
const winnerOverlayCopy = document.querySelector("#winner-overlay-copy");
const dismissWinnerButton = document.querySelector("#dismiss-winner");

let arcadePollId = null;
let handledInitialWin = false;
let latestArcadeState = null;
let qrStream = null;
let qrScanLoop = null;
let qrDetectionBusy = false;
let winnerOverlayDismissed = false;

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function normalizeName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function isValidEmail(email) {
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setActivePlayer(name) {
  const cleanName = normalizeName(name);
  if (cleanName) {
    localStorage.setItem(ACTIVE_PLAYER_KEY, cleanName);
  }
  return cleanName;
}

function getOrCreateAnonymousUserId() {
  let userId = localStorage.getItem(USER_ID_KEY);

  if (!userId) {
    const randomId =
      window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    userId = `anon_${randomId}`;
    localStorage.setItem(USER_ID_KEY, userId);
  }

  return userId;
}

function getSavedEmail() {
  return normalizeEmail(localStorage.getItem(USER_EMAIL_KEY));
}

function setSavedEmail(email) {
  const cleanEmail = normalizeEmail(email);
  if (cleanEmail) {
    localStorage.setItem(USER_EMAIL_KEY, cleanEmail);
  } else {
    localStorage.removeItem(USER_EMAIL_KEY);
  }
  return cleanEmail;
}

function formatTickets(count) {
  const value = Number(count || 0);
  return `${value} ticket${value === 1 ? "" : "s"}`;
}

function gameName(gameId) {
  const game = ARCADE_GAMES.find((entry) => entry.id === gameId);
  return game ? game.name : gameId;
}

function routeFromHash() {
  const route = window.location.hash.replace("#", "");
  const winGameId = new URLSearchParams(window.location.search).get("win");

  if (winGameId) {
    return "arcade";
  }

  return ROUTES.includes(route) ? route : "home";
}

function navigateTo(route) {
  const nextRoute = ROUTES.includes(route) ? route : "home";

  pages.forEach((page) => {
    page.classList.toggle("is-visible", page.dataset.page === nextRoute);
  });

  navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.dataset.route === nextRoute);
  });

  if (navMenu) {
    navMenu.classList.remove("is-open");
  }

  if (menuToggle) {
    menuToggle.setAttribute("aria-expanded", "false");
  }

  if (nextRoute === "arcade") {
    void hydrateArcade().then(startArcadePolling);
  } else {
    stopArcadePolling();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setError(fieldName, message) {
  const errorElement = document.querySelector(`[data-error-for="${fieldName}"]`);
  if (errorElement) {
    errorElement.textContent = message;
  }
}

function clearErrors() {
  document.querySelectorAll(".field-error").forEach((error) => {
    error.textContent = "";
  });
}

function getFormValue(name) {
  return registrationForm && registrationForm.elements[name]
    ? registrationForm.elements[name].value.trim()
    : "";
}

function validateRegistration() {
  clearErrors();
  let isValid = true;

  const fullName = normalizeName(getFormValue("fullName"));
  const email = getFormValue("email");
  const phone = getFormValue("phone");
  const role = getFormValue("role");
  const presentGame = registrationForm.elements.presentGame.value;
  const gameNameValue = getFormValue("gameName");
  const description = getFormValue("description");

  if (fullName.length < 2) {
    setError("fullName", "Enter your full name.");
    isValid = false;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setError("email", "Enter a valid email address.");
    isValid = false;
  }

  if (!/^[0-9+\-\s()]{6,}$/.test(phone)) {
    setError("phone", "Enter a valid phone number.");
    isValid = false;
  }

  if (!role) {
    setError("role", "Choose one option.");
    isValid = false;
  }

  if (presentGame === "Yes" && gameNameValue.length < 2) {
    setError("gameName", "Add the game name.");
    isValid = false;
  }

  if (description.length < 10) {
    setError("description", "Write at least 10 characters.");
    isValid = false;
  }

  return {
    isValid,
    data: {
      fullName,
      email,
      phone,
      role,
      presentGame,
      gameName: presentGame === "Yes" ? gameNameValue : "",
      description,
      submittedAt: new Date().toISOString(),
    },
  };
}

async function submitRegistrationToGoogle() {
  if (!registrationForm || !submitButton) {
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Sending...";

  try {
    await fetch(REGISTRATION_SCRIPT_URL, {
      method: "POST",
      body: new FormData(registrationForm),
    });
    if (formStatus) {
      formStatus.textContent = "Registration saved. Your player badge is ready.";
    }
    registrationForm.reset();
    window.setTimeout(toggleGameFields);
  } catch (error) {
    if (formStatus) {
      formStatus.textContent = "Registration saved locally. Google sync failed.";
    }
    console.error("Registration sync failed:", error);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit";
  }
}

function handleRegistrationSubmit(event) {
  event.preventDefault();
  const { isValid, data } = validateRegistration();

  if (!isValid) {
    if (formStatus) {
      formStatus.textContent = "Fix the highlighted fields to save your badge.";
    }
    return;
  }

  const registrations = readStorage(REGISTRATION_KEY, []);
  registrations.push(data);
  writeStorage(REGISTRATION_KEY, registrations);
  setActivePlayer(data.fullName);
  setSavedEmail(data.email);

  if (playerEmailInput) {
    playerEmailInput.value = data.email;
  }

  void submitRegistrationToGoogle();
}

function toggleGameFields() {
  if (!registrationForm || !gameFields) {
    return;
  }

  const presenting = registrationForm.elements.presentGame.value === "Yes";
  gameFields.hidden = !presenting;

  if (!presenting && registrationForm.elements.gameName) {
    registrationForm.elements.gameName.value = "";
    setError("gameName", "");
  }
}

async function requestApi(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || "Arcade API request failed.");
  }

  return payload;
}

function setTicketMessage(message) {
  if (ticketFeedback) {
    ticketFeedback.textContent = message;
    const statusText = String(message || "").toLowerCase();
    const isError = /(invalid|locked|failed|error|not available|permission)/.test(statusText);
    ticketFeedback.dataset.status = isError ? "error" : message ? "success" : "info";
  }
}

function renderGameHighScores(games, globalState) {
  if (!leaderboardList) {
    return;
  }

  leaderboardList.innerHTML = "";
  const perGameHighScores = globalState.perGameHighScores || {};

  games.forEach((game) => {
    const score = perGameHighScores[game.id] || {};
    const row = document.createElement("li");
    const name = document.createElement("span");
    const value = document.createElement("strong");
    const winner = score.email || score.userId || "No winner yet";

    name.textContent = game.name;
    value.textContent = `${formatTickets(score.score)} - ${winner}`;
    row.append(name, value);
    leaderboardList.append(row);
  });
}

function renderUserGameTickets(games, user) {
  if (!userGameTickets) {
    return;
  }

  userGameTickets.innerHTML = "";

  games.forEach((game) => {
    const row = document.createElement("li");
    const name = document.createElement("span");
    const value = document.createElement("strong");

    name.textContent = game.name;
    value.textContent = formatTickets(user.gameTickets && user.gameTickets[game.id]);
    row.append(name, value);
    userGameTickets.append(row);
  });
}

function renderArcadeState(state) {
  latestArcadeState = state;
  const games = state.games && state.games.length ? state.games : ARCADE_GAMES;
  const user = state.user || {};
  const globalState = state.global || {};
  const showdown = state.showdown || {};

  if (anonymousUserId) {
    anonymousUserId.textContent = user.userId || getOrCreateAnonymousUserId();
  }

  if (playerEmailInput && document.activeElement !== playerEmailInput) {
    playerEmailInput.value = user.email || getSavedEmail();
  }

  if (ticketCount) {
    ticketCount.textContent = `Tickets: ${Number(user.totalTickets || 0)}`;
  }

  if (globalHighScore) {
    globalHighScore.textContent = Number(globalState.highScore || 0);
  }

  if (globalHighUser) {
    globalHighUser.textContent =
      globalState.highScoreUserId || globalState.highScoreEmail
        ? globalState.highScoreDisplay
        : "No winner yet";
  }

  if (globalTotalScans) {
    globalTotalScans.textContent = Number(globalState.totalTickets || 0);
  }

  if (mostScannedGame) {
    mostScannedGame.textContent = user.mostScannedGame
      ? `Most scanned: ${user.mostScannedGame.name} (${formatTickets(
          user.mostScannedGame.tickets
        )})`
      : "Most scanned: none yet";
  }

  if (showdownStatus) {
    showdownStatus.textContent = showdown.active
      ? `Locked at ${Number(showdown.lockedHighScore || 0)} tickets`
      : "Not locked";
    showdownStatus.dataset.state = showdown.active ? "locked" : "open";
  }

  if (showdownWinner) {
    showdownWinner.textContent = `Winner: ${
      showdown.active ? showdown.winnerDisplay : "No winner yet"
    }`;
    showdownWinner.dataset.state = showdown.active ? "locked" : "open";
  }

  if (showdownStatus) {
    const showdownPanel = showdownStatus.closest(".showdown-card");
    if (showdownPanel) {
      showdownPanel.classList.toggle("is-locked", Boolean(showdown.active));
    }
  }

  renderGameHighScores(games, globalState);
  renderUserGameTickets(games, user);

  if (winnerOverlay && winnerOverlayCopy) {
    const shouldShowWinner = Boolean(state.isShowdownWinner && !winnerOverlayDismissed);
    winnerOverlay.hidden = !shouldShowWinner;
    if (shouldShowWinner) {
      winnerOverlayCopy.textContent = `Locked score: ${Number(
        showdown.lockedHighScore || 0
      )} tickets.`;
    }
  }
}

async function loadArcadeState({ quiet = false } = {}) {
  const userId = getOrCreateAnonymousUserId();

  try {
    const state = await requestApi(`/api/state?userId=${encodeURIComponent(userId)}`);
    renderArcadeState(state);
    if (!quiet && playerStatus) {
      playerStatus.textContent = "Arcade state loaded.";
    }
    return state;
  } catch (error) {
    if (!quiet) {
      setTicketMessage(error.message);
    }
    if (playerStatus && !quiet) {
      playerStatus.textContent = "Arcade backend is not available.";
    }
    return null;
  }
}

async function submitScan(gameId) {
  if (!VALID_GAME_IDS.has(gameId)) {
    setTicketMessage("Invalid QR code.");
    return null;
  }

  const userId = getOrCreateAnonymousUserId();
  const email = getSavedEmail();

  try {
    const state = await requestApi("/api/scan", {
      method: "POST",
      body: JSON.stringify({
        userId,
        email,
        gameId,
      }),
    });
    renderArcadeState(state);
    setTicketMessage(state.message || `+1 ticket for ${gameName(gameId)}`);
    return state;
  } catch (error) {
    setTicketMessage(error.message);
    return null;
  }
}

function extractGameIdFromQrValue(value) {
  const rawValue = String(value || "").trim();

  if (VALID_GAME_IDS.has(rawValue)) {
    return rawValue;
  }

  try {
    const url = new URL(rawValue, window.location.origin);
    return url.searchParams.get("win") || "";
  } catch {
    return "";
  }
}

function clearWinParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete("win");
  if (!url.hash) {
    url.hash = "arcade";
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

async function handleWinningUrl() {
  if (handledInitialWin) {
    return;
  }

  handledInitialWin = true;
  const gameId = new URLSearchParams(window.location.search).get("win");

  if (!gameId) {
    await loadArcadeState({ quiet: true });
    return;
  }

  if (!VALID_GAME_IDS.has(gameId)) {
    setTicketMessage("Invalid QR code.");
    await loadArcadeState({ quiet: true });
    clearWinParam();
    return;
  }

  await submitScan(gameId);
  clearWinParam();
}

async function hydrateArcade() {
  if (!ticketCount) {
    return;
  }

  const userId = getOrCreateAnonymousUserId();
  const savedEmail = getSavedEmail();

  if (anonymousUserId) {
    anonymousUserId.textContent = userId;
  }

  if (playerEmailInput && !playerEmailInput.value) {
    playerEmailInput.value = savedEmail;
  }

  const wasAlreadyHandled = handledInitialWin;
  await handleWinningUrl();

  if (wasAlreadyHandled) {
    await loadArcadeState({ quiet: true });
  }
}

function startArcadePolling() {
  if (arcadePollId || !ticketCount) {
    return;
  }

  arcadePollId = window.setInterval(() => {
    void loadArcadeState({ quiet: true });
  }, ARCADE_CONFIG.pollIntervalMs || 4000);
}

function stopArcadePolling() {
  if (arcadePollId) {
    window.clearInterval(arcadePollId);
    arcadePollId = null;
  }
}

async function savePlayerFromDashboard() {
  const email = normalizeEmail(playerEmailInput ? playerEmailInput.value : "");

  if (!isValidEmail(email)) {
    if (playerStatus) {
      playerStatus.textContent = "Enter a valid email or leave it blank.";
    }
    return;
  }

  setSavedEmail(email);

  try {
    const state = await requestApi("/api/user", {
      method: "POST",
      body: JSON.stringify({
        userId: getOrCreateAnonymousUserId(),
        email,
      }),
    });
    renderArcadeState(state);
    if (playerStatus) {
      playerStatus.textContent = state.message || "Email saved.";
    }
  } catch (error) {
    if (playerStatus) {
      playerStatus.textContent = "Email saved on this device. Backend sync failed.";
    }
  }
}

async function startShowdownFromDashboard() {
  const secret = adminSecretInput ? adminSecretInput.value : "";

  if (!secret) {
    if (adminStatus) {
      adminStatus.textContent = "Enter the admin secret.";
    }
    return;
  }

  if (adminStatus) {
    adminStatus.textContent = "Locking showdown...";
  }

  try {
    const state = await requestApi("/api/admin/showdown", {
      method: "POST",
      body: JSON.stringify({ secret }),
    });
    renderArcadeState(state);
    if (adminStatus) {
      adminStatus.textContent = state.message || "Showdown locked.";
    }
    if (adminSecretInput) {
      adminSecretInput.value = "";
    }
  } catch (error) {
    if (adminStatus) {
      adminStatus.textContent = error.message;
    }
  }
}

function stopQrCamera() {
  if (qrScanLoop) {
    window.clearInterval(qrScanLoop);
    qrScanLoop = null;
  }

  if (qrStream) {
    qrStream.getTracks().forEach((track) => track.stop());
    qrStream = null;
  }

  if (qrVideo) {
    qrVideo.hidden = true;
    qrVideo.srcObject = null;
  }

  if (scanModal) {
    scanModal.classList.remove("has-camera");
  }

  qrDetectionBusy = false;
}

async function handleDetectedQr(rawValue) {
  const gameId = extractGameIdFromQrValue(rawValue);
  stopQrCamera();

  if (!gameId || !VALID_GAME_IDS.has(gameId)) {
    if (scanResult) {
      scanResult.textContent = "Invalid QR code.";
    }
    if (claimResult) {
      claimResult.hidden = false;
      claimResult.focus();
    }
    return;
  }

  if (scanResult) {
    scanResult.textContent = `Scanned ${gameName(gameId)}...`;
  }

  const state = await submitScan(gameId);

  if (scanResult) {
    scanResult.textContent = state ? state.message : "Scan failed.";
  }

  if (claimResult) {
    claimResult.hidden = false;
    claimResult.focus();
  }
}

async function openScanModal() {
  if (!scanModal || !scanResult || !claimResult) {
    return;
  }

  stopQrCamera();
  scanResult.textContent = "Scanning camp code...";
  claimResult.hidden = true;
  scanModal.classList.add("is-open");
  scanModal.setAttribute("aria-hidden", "false");

  if (!("BarcodeDetector" in window) || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    scanResult.textContent = "Camera QR scanning is not available in this browser.";
    claimResult.hidden = false;
    return;
  }

  try {
    qrStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    qrVideo.srcObject = qrStream;
    qrVideo.hidden = false;
    scanModal.classList.add("has-camera");
    await qrVideo.play();

    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    qrScanLoop = window.setInterval(async () => {
      if (qrDetectionBusy || !qrVideo || qrVideo.readyState < 2) {
        return;
      }

      qrDetectionBusy = true;
      try {
        const codes = await detector.detect(qrVideo);
        if (codes.length) {
          await handleDetectedQr(codes[0].rawValue);
        }
      } catch (error) {
        scanResult.textContent = "QR scanner stopped.";
        stopQrCamera();
        claimResult.hidden = false;
      } finally {
        qrDetectionBusy = false;
      }
    }, 450);
  } catch (error) {
    stopQrCamera();
    scanResult.textContent = "Camera permission was not granted.";
    claimResult.hidden = false;
  }
}

function closeScanModal() {
  stopQrCamera();
  if (scanModal) {
    scanModal.classList.remove("is-open");
    scanModal.setAttribute("aria-hidden", "true");
  }
}

function updateCountdown() {
  if (!countdown) {
    return;
  }

  const now = new Date();
  const remaining = Math.max(0, EVENT_END.getTime() - now.getTime());
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const values = [days, hours, minutes, seconds];

  countdown.querySelectorAll("strong").forEach((slot, index) => {
    slot.textContent = String(values[index]).padStart(2, "0");
  });
}

routeLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    const route = link.dataset.route;
    const href = link.getAttribute("href") || "";

    if (ROUTES.includes(route) && href.startsWith("#")) {
      event.preventDefault();
      window.location.hash = route;
      navigateTo(route);
    }
  });
});

window.addEventListener("hashchange", () => navigateTo(routeFromHash()));

if (menuToggle) {
  menuToggle.addEventListener("click", () => {
    const isOpen = navMenu.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

if (registrationForm) {
  registrationForm.addEventListener("submit", handleRegistrationSubmit);
  registrationForm.addEventListener("reset", () => {
    window.setTimeout(() => {
      clearErrors();
      toggleGameFields();
      if (formStatus) {
        formStatus.textContent = "";
      }
    });
  });

  Array.from(registrationForm.elements.presentGame).forEach((input) => {
    input.addEventListener("change", toggleGameFields);
  });
}

if (savePlayerButton) {
  savePlayerButton.addEventListener("click", savePlayerFromDashboard);
}

if (scanButton) {
  scanButton.addEventListener("click", openScanModal);
}

if (startShowdownButton) {
  startShowdownButton.addEventListener("click", startShowdownFromDashboard);
}

if (claimResult) {
  claimResult.addEventListener("click", closeScanModal);
}

if (dismissWinnerButton && winnerOverlay) {
  dismissWinnerButton.addEventListener("click", () => {
    winnerOverlayDismissed = true;
    winnerOverlay.hidden = true;
  });
}

document.querySelectorAll("[data-close-modal]").forEach((control) => {
  control.addEventListener("click", closeScanModal);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && scanModal && scanModal.classList.contains("is-open")) {
    closeScanModal();
  }
});

navigateTo(routeFromHash());
toggleGameFields();
updateCountdown();
window.setInterval(updateCountdown, 1000);
