import LEAGUES from "./data/leagues.js";
import TEAMS from "./data/teams.js";
import National from "./data/national_teams.js";
import { shuffle, loadJSON, saveJSON } from "./utils.js";
import { confetti } from "./fx.js";

const ALL_TEAMS = [...TEAMS, ...National];
const STORAGE_KEY = "fc26-team-picker-settings";
const SESSION_KEY = "fc26-last-session";

let lastAssignments = [];
let customPlayerLabels = [];
let sessionVisualRefresh = null;

const CREST_THEMES = [
  ["#0e3a2a", "#1d7a57"],
  ["#3a1030", "#8a2560"],
  ["#0f2f4a", "#2268a3"],
  ["#42280e", "#96601f"],
  ["#2a1040", "#6533a3"],
  ["#0e3a3a", "#1a8a80"]
];

function localCrest(team) {
  const name = String(team?.name || "").trim() || "FC";
  const words = name.split(/\s+/).filter(Boolean);
  let initials = words.map(w => w[0]).join("").slice(0, 3).toUpperCase();
  if (words.length === 1 && words[0].length >= 3) initials = words[0].slice(0, 3).toUpperCase();
  let hash = 0;
  for (let c = 0; c < name.length; c++) hash = (hash * 31 + name.charCodeAt(c)) >>> 0;
  const [dark, light] = CREST_THEMES[hash % CREST_THEMES.length];
  const fs = initials.length > 2 ? 16 : initials.length === 2 ? 19 : 22;
  const shield = "M32 3 L59 11 V37 C59 52 47 63 32 69 C17 63 5 52 5 37 V11 Z";
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 72'>` +
    `<defs><clipPath id='hl'><rect x='0' y='0' width='32' height='72'/></clipPath></defs>` +
    `<path d='${shield}' fill='${light}'/>` +
    `<path d='${shield}' fill='${dark}' clip-path='url(#hl)'/>` +
    `<path d='M5 11 L32 3 L59 11 L59 17 L32 9 L5 17 Z' fill='rgba(255,255,255,0.16)'/>` +
    `<text x='32' y='43' font-family='Arial Black,Arial,sans-serif' font-size='${fs}' font-weight='900' text-anchor='middle' fill='#ffffff' stroke='rgba(0,0,0,0.35)' stroke-width='0.75' paint-order='stroke'>${initials}</text>` +
    `<path d='${shield}' fill='none' stroke='rgba(255,255,255,0.3)' stroke-width='1.5'/>` +
    `</svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

function applyPlayOrder() {
  if (!Array.isArray(customPlayerLabels) || customPlayerLabels.length === 0) return;
  if (!Array.isArray(lastAssignments) || lastAssignments.length === 0) return;
  const order = customPlayerLabels.map(n => String(n ?? "").trim());
  lastAssignments.sort((a, b) => {
    const ia = order.indexOf(String(a.label ?? "").trim());
    const ib = order.indexOf(String(b.label ?? "").trim());
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
  });
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function announceSession() {
  window.dispatchEvent(new CustomEvent("fc26:session", {
    detail: { count: lastAssignments.length }
  }));
}

export function getLastAssignments() {
  return lastAssignments;
}

export function updatePlayersFromWheel(names) {
  const playerCountEl = document.getElementById("player-count");
  if (names.length > 0 && playerCountEl) {
    playerCountEl.value = names.length;
    playerCountEl.dispatchEvent(new Event("input"));
  }
  customPlayerLabels = [...names];
  if (lastAssignments.length > 0) {
    applyPlayOrder();
    if (sessionVisualRefresh) sessionVisualRefresh();
  }
}

export function initTeamPicker() {
  const leagueListEl = document.getElementById("league-list");
  const selectAllLeaguesBtn = document.getElementById("select-all-leagues");
  const clearLeaguesBtn = document.getElementById("clear-leagues");
  const playerCountEl = document.getElementById("player-count");
  const teamsPerPlayerEl = document.getElementById("teams-per-player");
  const ratingMinEl = document.getElementById("rating-min");
  const ratingMaxEl = document.getElementById("rating-max");
  const onePerLeagueEl = document.getElementById("one-per-league");
  const generateBtn = document.getElementById("generate-btn");
  const clearSettingsBtn = document.getElementById("clear-settings-btn");
  const resultsEl = document.getElementById("results");
  const messageEl = document.getElementById("message");

  const leagueCounts = new Map();
  ALL_TEAMS.forEach(t => leagueCounts.set(t.leagueId, (leagueCounts.get(t.leagueId) || 0) + 1));

  LEAGUES.forEach(league => {
    const label = document.createElement("label");
    label.className = "league-chip";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = league.id;

    const name = document.createElement("span");
    name.textContent = league.name;

    const count = document.createElement("span");
    count.className = "chip-count";
    count.textContent = leagueCounts.get(league.id) || 0;

    label.append(checkbox, name, count);
    leagueListEl.appendChild(label);
  });

  const ratingValues = [];
  for (let i = 1; i <= 10; i++) ratingValues.push(i * 0.5);

  ratingValues.forEach(val => {
    const optMin = document.createElement("option");
    optMin.value = String(val);
    optMin.textContent = `${val.toFixed(1)}+`;
    ratingMinEl.appendChild(optMin);

    const optMax = document.createElement("option");
    optMax.value = String(val);
    optMax.textContent = `${val.toFixed(1)}+`;
    ratingMaxEl.appendChild(optMax);
  });

  ratingMinEl.value = "4.5";
  ratingMaxEl.value = "5";

  const saved = loadJSON(STORAGE_KEY);
  if (saved) {
    if (typeof saved.playerCount === "number") playerCountEl.value = String(saved.playerCount);
    if (typeof saved.teamsPerPlayer === "number") teamsPerPlayerEl.value = String(saved.teamsPerPlayer);
    if (saved.minRating != null && ratingMinEl.querySelector(`option[value="${saved.minRating}"]`)) {
      ratingMinEl.value = String(saved.minRating);
    }
    if (saved.maxRating != null && ratingMaxEl.querySelector(`option[value="${saved.maxRating}"]`)) {
      ratingMaxEl.value = String(saved.maxRating);
    }
    if (typeof saved.onlyOnePerLeague === "boolean") onePerLeagueEl.checked = saved.onlyOnePerLeague;
    if (Array.isArray(saved.selectedLeagueIds)) {
      const set = new Set(saved.selectedLeagueIds);
      leagueListEl.querySelectorAll("input[type=checkbox]")
        .forEach(cb => (cb.checked = set.has(cb.value)));
    }
  } else {
    leagueListEl.querySelectorAll("input[type=checkbox]")
      .forEach(cb => (cb.checked = true));
  }

  const savedSession = loadJSON(SESSION_KEY);
  if (savedSession && Array.isArray(savedSession.assignments) && savedSession.assignments.length > 0) {
    lastAssignments = savedSession.assignments;
    customPlayerLabels = Array.isArray(savedSession.labels) ? savedSession.labels : [];
    sanitizeLabels(lastAssignments);
    applyPlayOrder();
    sessionVisualRefresh = () => {
      renderResults();
      saveSession();
      announceSession();
    };
    renderResults();
    announceSession();
  }

  function sanitizeLabels(assignments) {
    const seen = new Set();
    const used = new Set(assignments.map(a => String(a.label || "").trim()));
    assignments.forEach((a, i) => {
      let label = String(a.label || "").trim() || `Player ${i + 1}`;
      if (/^Player \d+$/.test(label) && seen.has(label)) {
        let n = 1;
        while (used.has(`Player ${n}`)) n++;
        label = `Player ${n}`;
      }
      seen.add(label);
      used.add(label);
      a.label = label;
      const custom = String(customPlayerLabels[i] ?? "").trim();
      if (!custom) customPlayerLabels[i] = label;
    });
  }

  function getSelectedLeagueIds() {
    return Array.from(leagueListEl.querySelectorAll("input[type=checkbox]:checked")).map(cb => cb.value);
  }

  function showMessage(text, type = "") {
    messageEl.textContent = text;
    messageEl.className = "message";
    if (type === "error") messageEl.classList.add("message--error");
    if (type === "success") messageEl.classList.add("message--success");
  }

  function persistSettings() {
    saveJSON(STORAGE_KEY, {
      selectedLeagueIds: getSelectedLeagueIds(),
      playerCount: Number(playerCountEl.value) || 0,
      teamsPerPlayer: Number(teamsPerPlayerEl.value) || 1,
      minRating: parseFloat(ratingMinEl.value),
      maxRating: parseFloat(ratingMaxEl.value),
      onlyOnePerLeague: onePerLeagueEl.checked
    });
  }

  function saveSession() {
    saveJSON(SESSION_KEY, {
      labels: customPlayerLabels,
      assignments: lastAssignments
    });
    announceSession();
  }

  function buildPool() {
    return ALL_TEAMS.filter(t =>
      getSelectedLeagueIds().includes(t.leagueId) &&
      t.stars >= parseFloat(ratingMinEl.value) &&
      t.stars <= parseFloat(ratingMaxEl.value)
    );
  }

  function resetGenerateBtn() {
    generateBtn.disabled = false;
    generateBtn.textContent = "Spin Squads";
  }

  leagueListEl.addEventListener("change", persistSettings);
  playerCountEl.addEventListener("input", persistSettings);
  teamsPerPlayerEl.addEventListener("input", persistSettings);
  ratingMinEl.addEventListener("change", persistSettings);
  ratingMaxEl.addEventListener("change", persistSettings);
  onePerLeagueEl.addEventListener("change", persistSettings);

  selectAllLeaguesBtn.addEventListener("click", () => {
    leagueListEl.querySelectorAll("input[type=checkbox]").forEach(cb => (cb.checked = true));
    persistSettings();
  });

  clearLeaguesBtn.addEventListener("click", () => {
    leagueListEl.querySelectorAll("input[type=checkbox]").forEach(cb => (cb.checked = false));
    persistSettings();
  });

  clearSettingsBtn.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SESSION_KEY);
    location.reload();
  });

  generateBtn.addEventListener("click", async () => {
    const selectedLeagueIds = getSelectedLeagueIds();
    const playerCount = Number(playerCountEl.value);
    const teamsPerPlayer = Number(teamsPerPlayerEl.value) || 1;
    const minRating = parseFloat(ratingMinEl.value);
    const maxRating = parseFloat(ratingMaxEl.value);
    const onlyOnePerLeague = onePerLeagueEl.checked;

    if (!Number.isFinite(minRating) || !Number.isFinite(maxRating)) {
      showMessage("Pick a valid rating range.", "error");
      return;
    }
    if (!Number.isFinite(playerCount) || playerCount < 2) {
      showMessage("You need at least 2 players.", "error");
      return;
    }
    if (!Number.isFinite(teamsPerPlayer) || teamsPerPlayer < 1) {
      showMessage("Teams per player must be at least 1.", "error");
      return;
    }
    if (selectedLeagueIds.length === 0) {
      showMessage("Pick at least one league.", "error");
      return;
    }
    if (onlyOnePerLeague && teamsPerPlayer > 1) {
      showMessage("One team per league only works with 1 team per player.", "error");
      return;
    }

    generateBtn.disabled = true;

    let pool = ALL_TEAMS.filter(t =>
      selectedLeagueIds.includes(t.leagueId) &&
      t.stars >= minRating &&
      t.stars <= maxRating
    );

    if (pool.length === 0) {
      showMessage("No teams match this rating range. Widen it up.", "error");
      resetGenerateBtn();
      return;
    }

    const totalTeamsNeeded = playerCount * teamsPerPlayer;
    const fullLabels = Array.isArray(customPlayerLabels) && customPlayerLabels.length >= playerCount
      ? customPlayerLabels
      : null;
    const labelFor = i => {
      if (fullLabels) {
        const name = String(fullLabels[i] || "").trim();
        if (name) return name.slice(0, 24);
      }
      return `Player ${i + 1}`;
    };
    const prev = Array.isArray(lastAssignments) ? lastAssignments : [];
    const newPlayers = new Array(playerCount);
    const lockedTeamsFlat = [];

    for (let i = 0; i < playerCount; i++) {
      const prevP = prev[i];
      if (prevP && prevP.isLocked && Array.isArray(prevP.allTeams) && prevP.allTeams.length === teamsPerPlayer) {
        newPlayers[i] = { ...prevP, id: i + 1, label: labelFor(i) };
        lockedTeamsFlat.push(...prevP.allTeams);
      }
    }

    if (lockedTeamsFlat.length > 0) {
      pool = pool.filter(t => !lockedTeamsFlat.some(lt => lt.name === t.name && lt.leagueId === t.leagueId));
    }

    if (!onlyOnePerLeague && pool.length + lockedTeamsFlat.length < totalTeamsNeeded) {
      showMessage(`Not enough teams in this pool (${pool.length + lockedTeamsFlat.length} available).`, "error");
      resetGenerateBtn();
      return;
    }

    let assignError = null;

    if (onlyOnePerLeague) {
      const leagueToTeams = new Map();
      for (const team of pool) {
        if (!leagueToTeams.has(team.leagueId)) leagueToTeams.set(team.leagueId, []);
        leagueToTeams.get(team.leagueId).push(team);
      }
      const availableLeagues = Array.from(leagueToTeams.keys());
      shuffle(availableLeagues);

      for (let i = 0; i < playerCount; i++) {
        if (newPlayers[i]) continue;
        const lid = availableLeagues.pop();
        if (!lid) {
          assignError = "Not enough distinct leagues for everyone.";
          break;
        }
        const tList = leagueToTeams.get(lid);
        const randTeam = tList[Math.floor(Math.random() * tList.length)];
        newPlayers[i] = {
          id: i + 1,
          label: labelFor(i),
          team: randTeam,
          allTeams: [randTeam],
          isLocked: false
        };
      }
    } else {
      const remaining = [...pool];
      shuffle(remaining);
      for (let i = 0; i < playerCount; i++) {
        if (newPlayers[i]) continue;
        const chunk = remaining.splice(0, teamsPerPlayer);
        if (chunk.length < teamsPerPlayer) {
          assignError = "Ran out of teams mid-spin.";
          break;
        }
        newPlayers[i] = {
          id: i + 1,
          label: labelFor(i),
          team: chunk[0],
          allTeams: chunk,
          isLocked: false
        };
      }
    }

    if (assignError) {
      showMessage(assignError, "error");
      resetGenerateBtn();
      return;
    }

    lastAssignments = newPlayers;
    renderResults();
    saveSession();
    showMessage("Squads locked in!", "success");
    confetti(true);
    resetGenerateBtn();
  });

  function rerollPlayer(index) {
    const player = lastAssignments[index];
    if (!player || player.isLocked) return;

    const teamsPerPlayer = Number(teamsPerPlayerEl.value) || 1;
    const onlyOnePerLeague = onePerLeagueEl.checked;
    let pool = buildPool();

    const usedKeys = new Set();
    const usedLeagues = new Set();
    lastAssignments.forEach((p, i) => {
      if (i === index) return;
      (p.allTeams || []).forEach(t => {
        usedKeys.add(`${t.name}|${t.leagueId}`);
        usedLeagues.add(t.leagueId);
      });
    });
    pool = pool.filter(t => !usedKeys.has(`${t.name}|${t.leagueId}`));

    let chunk = null;

    if (onlyOnePerLeague) {
      pool = pool.filter(t => !usedLeagues.has(t.leagueId));
      const byLeague = new Map();
      pool.forEach(t => {
        if (!byLeague.has(t.leagueId)) byLeague.set(t.leagueId, []);
        byLeague.get(t.leagueId).push(t);
      });
      const leagues = Array.from(byLeague.keys());
      if (leagues.length === 0) {
        showMessage("No fresh leagues left to reroll into.", "error");
        return;
      }
      const lid = leagues[Math.floor(Math.random() * leagues.length)];
      const list = byLeague.get(lid);
      chunk = [list[Math.floor(Math.random() * list.length)]];
    } else {
      shuffle(pool);
      chunk = pool.slice(0, teamsPerPlayer);
      if (chunk.length < teamsPerPlayer) {
        showMessage("Not enough teams left to reroll.", "error");
        return;
      }
    }

    player.team = chunk[0];
    player.allTeams = chunk;
    saveSession();
    updateCard(index);
  }

  function updateCard(index) {
    const player = lastAssignments[index];
    const existing = resultsEl.children[index];
    if (!player || !existing || !existing.classList.contains("fut-card")) {
      renderResults();
      return;
    }
    const fresh = buildCard(player, index, true);
    resultsEl.replaceChild(fresh, existing);
    fresh.classList.add("flash");
    setTimeout(() => fresh.classList.remove("flash"), 550);
  }

  function renderResults() {
    resultsEl.innerHTML = "";

    if (!lastAssignments.length) {
      resultsEl.innerHTML = '<p class="placeholder">Set your filters and hit <strong>SPIN SQUADS</strong></p>';
      return;
    }

    lastAssignments.forEach((player, index) => {
      resultsEl.appendChild(buildCard(player, index, false));
    });
  }

  function buildCard(player, index, swap) {
    const firstTeam = player.allTeams[0];
    const extraTeams = player.allTeams.slice(1);
    const card = document.createElement("div");
    card.className =
      "fut-card" +
      (player.isLocked ? " fut-card--locked" : "") +
      (swap ? " fut-card--swap" : "");
    if (!swap) card.style.animationDelay = `${index * 0.07}s`;

    const logoUrl = localCrest(firstTeam);

    card.innerHTML = `
      <div class="fut-headrow">
        <div class="fut-rank-chip">#${index + 1}</div>
        <div class="fut-stars">${firstTeam?.stars ? firstTeam.stars.toFixed(1) + "<small>&#9733;</small>" : ""}</div>
      </div>
      <div class="fut-identity">
        <img class="fut-crest" src="${esc(logoUrl)}" alt="${esc(firstTeam?.name || "FC")} crest" loading="lazy">
        <div class="fut-idtext">
          <div class="fut-team">${esc(firstTeam?.name || "Unknown")}</div>
          <div class="fut-league">${esc(firstTeam?.leagueName || "")}</div>
        </div>
      </div>
      <div class="fut-owner"><span>${esc(player.label)}</span></div>
      ${extraTeams.length ? `<div class="fut-extra">+${extraTeams.length} more &middot; ${extraTeams.map(t => esc(t.name)).join(" / ")}</div>` : ""}
      <div class="fut-footer">
        <button type="button" class="lock-btn ${player.isLocked ? "lock-btn--active" : ""}">
          ${player.isLocked ? "Locked" : "Lock In"}
        </button>
        ${player.isLocked ? "" : '<button type="button" class="reroll-btn">Reroll</button>'}
      </div>
    `;

    card.querySelector(".lock-btn").addEventListener("click", () => {
      player.isLocked = !player.isLocked;
      saveSession();
      updateCard(index);
    });

    const rerollBtn = card.querySelector(".reroll-btn");
    if (rerollBtn) {
      rerollBtn.addEventListener("click", () => rerollPlayer(index));
    }

    return card;
  }
}
