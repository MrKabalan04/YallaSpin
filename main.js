import { initTeamPicker, updatePlayersFromWheel } from "./teampicker.js?v=8";
import { initTournament } from "./tournament.js?v=8";
import { SpinWheel, WHEEL_COLORS } from "./wheel.js?v=8";
import { confetti } from "./fx.js?v=8";
import { loadJSON, saveJSON } from "./utils.js?v=8";

const WHEEL_KEY = "fc26-wheel-state";
const MUTE_KEY = "fc26-wheel-muted";

function initTabs() {
  const tabBtns = document.querySelectorAll("#mode-tabs button");
  const tabContents = document.querySelectorAll("main");

  function setMode(targetTab) {
    tabContents.forEach(content => {
      content.classList.toggle("hidden", content.id !== `tab-${targetTab}`);
    });
    tabBtns.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.tab === targetTab);
    });
  }

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => setMode(btn.dataset.tab));
  });

  setMode("wheel");
  return { setMode };
}

function initWheelUI(tabs) {
  const playerInputsContainer = document.getElementById("player-inputs");
  const quickAddInput = document.getElementById("quick-add");
  const addPlayerBtn = document.getElementById("add-player-btn");
  const spinWheelBtn = document.getElementById("spin-wheel-btn");
  const instantShuffleBtn = document.getElementById("instant-shuffle-btn");
  const clearPlayersBtn = document.getElementById("clear-players-btn");
  const muteSoundBtn = document.getElementById("mute-sound-btn");
  const winnerResults = document.getElementById("winner-results");
  const winnerList = document.getElementById("winner-list");
  const copyOrderBtn = document.getElementById("copy-order-btn");
  const clearWheelBtn = document.getElementById("clear-wheel-btn");
  const modal = document.getElementById("winner-modal");
  const modalName = document.getElementById("modal-winner-name");
  const modalRank = document.getElementById("modal-winner-rank");
  const modalSub = document.getElementById("modal-winner-sub");
  const closeModalBtn = document.getElementById("close-modal-btn");

  const saved = loadJSON(WHEEL_KEY);
  let players = Array.isArray(saved?.players) && saved.players.length
    ? saved.players
    : ["Player 1", "Player 2"];
  let results = Array.isArray(saved?.results) ? saved.results : [];
  let renderedWinners = 0;
  let muted = !!loadJSON(MUTE_KEY);

  function persist() {
    saveJSON(WHEEL_KEY, { players, results });
  }

  function updateSpinState() {
    if (players.length === 0 && results.length > 0) {
      spinWheelBtn.disabled = true;
      spinWheelBtn.textContent = "All Ranks Assigned";
    } else if (players.length < 2) {
      spinWheelBtn.disabled = true;
      spinWheelBtn.textContent = "Spin Order";
    } else {
      spinWheelBtn.disabled = false;
      spinWheelBtn.textContent = results.length ? "Spin Next Pick" : "Spin Order";
    }
    instantShuffleBtn.disabled = players.length < 2;
    clearPlayersBtn.disabled = players.length === 0 && results.length === 0;
  }

  function showWinnerModal(name, rank, total) {
    modalName.textContent = name;
    modalRank.textContent = `#${rank}`;
    const suffix = rank === 1 ? "kicks things off" : rank === total ? "closes out the night" : "steps up next";
    modalSub.textContent = suffix;
    closeModalBtn.textContent = "Continue";
    modal.classList.remove("hidden");
  }

  function closeModal() {
    modal.classList.add("hidden");
  }

  closeModalBtn.addEventListener("click", () => {
    closeModal();
    if (players.length === 0) {
      closeModalBtn.textContent = "Continue";
      tabs.setMode("picker");
    }
  });

  modal.addEventListener("click", e => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });

  const wheel = new SpinWheel("wheel-canvas", {
    players,
    muted,
    onFinish: winner => {
      results.push(winner);
      const idx = players.indexOf(winner);
      if (idx > -1) players.splice(idx, 1);

      if (players.length === 1) {
        results.push(players[0]);
        players = [];
      }

      wheel.setPlayers(players);
      renderOrderList();
      persist();
      updatePlayersFromWheel(results);
      confetti(results.length === getTotalCount());
      showWinnerModal(winner, results.length, getTotalCount());

      if (players.length === 0) {
        closeModalBtn.textContent = "Start Picking Squads";
        updateSpinState();
      }
    }
  });

  function getTotalCount() {
    return players.length + results.length;
  }

  function renderRoster() {
    playerInputsContainer.innerHTML = "";
    players.forEach((player, index) => {
      const row = document.createElement("div");
      row.className = "roster-item";
      row.style.animationDelay = `${index * 0.03}s`;

      const dot = document.createElement("span");
      dot.className = "roster-dot";
      dot.style.background = WHEEL_COLORS[index % WHEEL_COLORS.length];

      const input = document.createElement("input");
      input.type = "text";
      input.value = player;
      input.placeholder = `Player ${index + 1}`;
      input.maxLength = 24;
      input.addEventListener("input", e => {
        players[index] = e.target.value;
        wheel.setPlayers(players);
        persist();
      });

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn-ghost-danger";
      removeBtn.innerHTML = "&times;";
      removeBtn.title = `Remove ${player || "player"}`;
      removeBtn.addEventListener("click", () => {
        players.splice(index, 1);
        renderRoster();
        persist();
        updatePlayersFromWheel([...results]);
      });

      row.append(dot, input, removeBtn);
      playerInputsContainer.appendChild(row);
    });
    applyListCap(playerInputsContainer);
    wheel.setPlayers(players);
    updateSpinState();
  }

  function applyListCap(list) {
    const rows = list.children;
    if (getComputedStyle(list).display === "grid") {
      if (rows.length < 10) {
        list.style.maxHeight = "";
        return;
      }
      const r0 = rows[0].getBoundingClientRect();
      const r4 = rows[4].getBoundingClientRect();
      const stride = r4.top - r0.top;
      if (!(stride > 0)) return;
      list.style.maxHeight = `${Math.ceil(stride * 4 + r0.height + 4)}px`;
      return;
    }
    if (rows.length < 6) {
      list.style.maxHeight = "";
      return;
    }
    const top0 = rows[0].getBoundingClientRect().top;
    const bottom4 = rows[3].getBoundingClientRect().bottom;
    if (!(bottom4 - top0 > 0)) return;
    list.style.maxHeight = `${Math.ceil(bottom4 - top0 + 4)}px`;
  }

  function renderOrderList() {
    if (results.length === 0) {
      winnerResults.classList.add("hidden");
      renderedWinners = 0;
      return;
    }
    winnerResults.classList.remove("hidden");
    if (winnerList.children.length !== renderedWinners || renderedWinners > results.length) {
      winnerList.innerHTML = "";
      renderedWinners = 0;
    }
    const before = renderedWinners;
    for (let i = before; i < results.length; i++) {
      const row = document.createElement("div");
      row.className = "order-row";
      row.style.animationDelay = `${Math.min(i, 20) * 0.05}s`;
      row.innerHTML = `
        <span class="order-num">${i + 1}</span>
        <span class="order-name"></span>
      `;
      if (i >= 3) {
        const hue = (110 + i * 137.508) % 360;
        const badge = row.querySelector(".order-num");
        badge.style.setProperty("--hi", `hsl(${((hue + 14) % 360).toFixed(1)} 90% 76%)`);
        badge.style.setProperty("--lo", `hsl(${hue.toFixed(1)} 82% 62%)`);
      }
      row.querySelector(".order-name").textContent = results[i];
      winnerList.appendChild(row);
    }
    renderedWinners = results.length;
    applyListCap(winnerList);
    if (results.length > before) {
      const orderRows = winnerList.querySelectorAll(".order-row");
      if (orderRows.length) orderRows[orderRows.length - 1].scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function addPlayer() {
    const name = quickAddInput.value.trim() || `Player ${getTotalCount() + 1}`;
    players.push(name.slice(0, 24));
    quickAddInput.value = "";
    quickAddInput.focus();
    if (players.length === 1 && results.length > 0) {
      results = [];
      renderedWinners = 0;
      winnerList.innerHTML = "";
      winnerResults.classList.add("hidden");
    }
    renderRoster();
    const rows = playerInputsContainer.querySelectorAll(".roster-item");
    if (rows.length) rows[rows.length - 1].scrollIntoView({ block: "nearest", behavior: "smooth" });
    persist();
  }

  addPlayerBtn.addEventListener("click", addPlayer);

  quickAddInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      addPlayer();
    }
  });

  instantShuffleBtn.addEventListener("click", () => {
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [players[i], players[j]] = [players[j], players[i]];
    }
    results = [...players];
    players = [];
    wheel.setPlayers([]);
    renderOrderList();
    persist();
    updatePlayersFromWheel(results);
    confetti(true);
    updateSpinState();
  });

  clearPlayersBtn.addEventListener("click", () => {
    players = [];
    results = [];
    renderRoster();
    renderOrderList();
    persist();
    updatePlayersFromWheel([]);
  });

  spinWheelBtn.addEventListener("click", () => {
    if (players.length >= 2) wheel.spin();
  });

  muteSoundBtn.classList.toggle("on", !muted);
  muteSoundBtn.addEventListener("click", () => {
    muted = !muted;
    wheel.setMuted(muted);
    saveJSON(MUTE_KEY, muted);
    muteSoundBtn.classList.toggle("on", !muted);
  });

  copyOrderBtn.addEventListener("click", async () => {
    const text = results.map((n, i) => `${i + 1}. ${n}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      copyOrderBtn.textContent = "Copied!";
    } catch {
      copyOrderBtn.textContent = "Copy failed";
    }
    setTimeout(() => (copyOrderBtn.textContent = "Copy Order"), 1500);
  });

  clearWheelBtn.addEventListener("click", () => {
    players = [...results];
    results = [];
    renderRoster();
    renderOrderList();
    persist();
    updatePlayersFromWheel([]);
    updateSpinState();
  });

  renderRoster();
  renderOrderList();

  if (results.length > 0) {
    updatePlayersFromWheel(results);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const tabs = initTabs();
  initWheelUI(tabs);
  initTeamPicker();
  initTournament();
});
