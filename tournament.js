import { getLastAssignments } from "./teampicker.js";
import { generateGroups, renderGroups, computeTable } from "./groups.js";
import { generateKnockoutTournament, restoreKnockout } from "./knockout.js";
import { shuffle, loadJSON, saveJSON, removeKey } from "./utils.js";

const CUP_KEY = "fc26-cup-state";
let state = null;

export function initTournament() {
  const setupMsgEl = document.getElementById("tournament-setup-message");
  const hintEl = document.getElementById("tournament-hint");
  const previewEl = document.getElementById("participant-preview");
  const groupsHomeAwayEl = document.getElementById("groups-home-away");
  const knockoutHomeAwayEl = document.getElementById("knockout-home-away");
  const useLastBtn = document.getElementById("tournament-use-last");
  const clearBtn = document.getElementById("tournament-clear");
  const groupsCard = document.getElementById("groups-card");
  const groupsContainer = document.getElementById("groups-container");
  const legendEl = document.getElementById("groups-legend");
  const groupsFooter = document.getElementById("groups-footer");
  const drawBtn = document.getElementById("draw-knockout-btn");
  const knockoutCard = document.getElementById("knockout-card");
  const knockoutContainer = document.getElementById("knockout-container");
  const cupSetupCard = document.getElementById("cup-setup-card");
  const cupSubEl = document.getElementById("cup-setup-sub");
  const cupToggleBtn = document.getElementById("cup-setup-toggle");

  const FORMAT_NAMES = { knockout: "Knockout", groups: "League Night", "groups-knockout": "Champions" };
  const SETUP_SUB_DEFAULT = "Built from your squads in step 2";

  function setSetupCollapsed(collapsed) {
    cupSetupCard.classList.toggle("is-collapsed", collapsed);
    cupToggleBtn.setAttribute("aria-expanded", String(!collapsed));
    cupToggleBtn.textContent = collapsed ? "Edit Setup" : "Hide";
    if (collapsed && state) {
      const unit = state.mode === "teams" ? "teams" : "players";
      cupSubEl.textContent = `${FORMAT_NAMES[state.type] || state.type} \u00b7 ${state.participants.length} ${unit}`;
    } else {
      cupSubEl.textContent = SETUP_SUB_DEFAULT;
    }
  }

  function spotlight(el) {
    if (!el) return;
    el.classList.remove("spotlight");
    void el.offsetWidth;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("spotlight");
  }

  cupToggleBtn.addEventListener("click", () => {
    setSetupCollapsed(!cupSetupCard.classList.contains("is-collapsed"));
  });

  function readFormat() {
    const checked = document.querySelector("input[name='tournament-type']:checked");
    return checked ? checked.value : "knockout";
  }

  function setFormat(v) {
    const el = document.querySelector(`input[name='tournament-type'][value="${v}"]`);
    if (el) el.checked = true;
  }

  function showMessage(text, kind = "") {
    setupMsgEl.textContent = text;
    setupMsgEl.classList.remove("message--error", "message--success");
    if (kind === "error") {
      setupMsgEl.classList.add("message--error");
      setSetupCollapsed(false);
    }
    if (kind === "success") setupMsgEl.classList.add("message--success");
  }

  function save() {
    if (state) saveJSON(CUP_KEY, state);
  }

  function resetView() {
    groupsCard.classList.add("hidden");
    knockoutCard.classList.add("hidden");
    groupsFooter.classList.add("hidden");
    legendEl.innerHTML = "";
    groupsContainer.innerHTML = "";
    knockoutContainer.innerHTML = "";
  }

  function updateHint() {
    if (!hintEl) return;
    const last = getLastAssignments();
    previewEl.innerHTML = "";
    if (!Array.isArray(last) || last.length === 0) {
      hintEl.classList.remove("ready");
      hintEl.innerHTML = "<span>No squads yet &mdash; spin squads in step 2 first.</span>";
      return;
    }
    const multiTeamMode = last.some(p => Array.isArray(p.allTeams) && p.allTeams.length > 1);
    const totalTeams = last.reduce((sum, p) => sum + (p.allTeams?.length || 0), 0);
    hintEl.classList.add("ready");
    hintEl.innerHTML = multiTeamMode
      ? `<span><strong>${totalTeams} teams</strong> ready (${last.length} players, multiple clubs each).</span>`
      : `<span><strong>${last.length} players</strong> ready, one club each.</span>`;

    const names = multiTeamMode
      ? last.flatMap(p => (p.allTeams || []).map(t => t.name))
      : last.map(p => p.label);
    names.slice(0, 12).forEach(n => {
      const c = document.createElement("span");
      c.className = "p-chip";
      c.textContent = n;
      previewEl.appendChild(c);
    });
    if (names.length > 12) {
      const more = document.createElement("span");
      more.className = "p-chip p-chip--more";
      more.textContent = `+${names.length - 12}`;
      previewEl.appendChild(more);
    }
  }

  function ensureParticipants() {
    const last = getLastAssignments();
    if (!Array.isArray(last) || last.length === 0) return null;

    const multiTeamMode = last.some(p => Array.isArray(p.allTeams) && p.allTeams.length > 1);
    const participants = [];

    if (!multiTeamMode) {
      last.forEach(p => {
        participants.push({
          id: String(p.id),
          label: p.label,
          team: p.team,
          ownerId: p.id,
          ownerLabel: p.label
        });
      });
      return { participants, mode: "players" };
    }

    last.forEach(player => {
      const teams =
        Array.isArray(player.allTeams) && player.allTeams.length > 0
          ? player.allTeams
          : player.team
            ? [player.team]
            : [];
      teams.forEach((team, idx) => {
        participants.push({
          id: `${player.id}-${idx + 1}`,
          label: team.name,
          team,
          ownerId: player.id,
          ownerLabel: player.label
        });
      });
    });
    return { participants, mode: "teams" };
  }

  function layout() {
    const t = state.type;
    groupsCard.classList.toggle("hidden", t === "knockout");
    knockoutCard.classList.toggle("hidden", t === "groups");
    groupsFooter.classList.toggle("hidden", t !== "groups-knockout");
    legendEl.innerHTML = t === "groups-knockout"
      ? '<div class="qual-legend">Top two of each group cross over: A1 v B2, B1 v A2</div>'
      : "";
    if (t === "knockout") groupsContainer.innerHTML = "";
    if (t === "groups") knockoutContainer.innerHTML = "";
  }

  function markDrawn() {
    drawBtn.disabled = true;
    drawBtn.textContent = "Bracket Drawn - Reset Cup to Redraw";
  }

  function markUndrawn() {
    drawBtn.disabled = false;
    drawBtn.textContent = "Draw Knockout From Standings";
  }

  function buildMissing() {
    const koOpts = {
      homeAway: state.knockoutHomeAway,
      mode: state.mode,
      doShuffle: false,
      onUpdate: save
    };

    if (state.type !== "knockout") {
      if (!state.groups) {
        state.groups = generateGroups(state.participants, state.type, {
          homeAndAway: state.groupsHomeAway,
          ordered: true
        });
      }
      renderGroups(state.groups, groupsContainer, state.mode, {
        onChange: save,
        highlightQuals: state.type === "groups-knockout"
      });
    }

    if (state.type === "knockout") {
      if (state.knockout) {
        restoreKnockout(state.knockout, knockoutContainer, save);
      } else {
        state.knockout = generateKnockoutTournament(state.participants, knockoutContainer, koOpts);
        save();
      }
    } else if (state.type === "groups-knockout") {
      if (state.knockout) {
        restoreKnockout(state.knockout, knockoutContainer, save);
        markDrawn();
      } else {
        knockoutContainer.innerHTML =
          "<p class='placeholder'>Play your group games, then hit <strong>Draw Knockout From Standings</strong>.</p>";
        markUndrawn();
      }
    }
  }

  function renderFresh() {
    state.groups = null;
    state.knockout = null;
    layout();
    buildMissing();
    save();
  }

  function syncControls() {
    setFormat(state.type);
    groupsHomeAwayEl.checked = !!state.groupsHomeAway;
    knockoutHomeAwayEl.checked = !!state.knockoutHomeAway;
  }

  function qualifiersFromGroups(groups) {
    const sorted = [...groups].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const out = [];
    const entryAt = (g, row) => g.teams.find(t => t.id === row.playerId);

    for (let i = 0; i < sorted.length; i += 2) {
      const A = sorted[i];
      const B = sorted[i + 1];

      if (!B) {
        const tA = computeTable(A);
        if (tA.some(r => r.played > 0) && tA[0]) {
          const e = entryAt(A, tA[0]);
          if (e) out.push(e);
        }
        continue;
      }

      const tA = computeTable(A);
      const tB = computeTable(B);
      if (!tA.some(r => r.played > 0) && !tB.some(r => r.played > 0)) continue;

      const a1 = entryAt(A, tA[0]);
      const b2 = entryAt(B, tB[1]);
      const b1 = entryAt(B, tB[0]);
      const a2 = entryAt(A, tA[1]);
      [a1, b2, b1, a2].forEach(e => { if (e) out.push(e); });
    }
    return out;
  }

  useLastBtn.addEventListener("click", () => {
    const built = ensureParticipants();
    if (!built) {
      showMessage("No squads found. Spin squads in step 2 first.", "error");
      return;
    }
    shuffle(built.participants);
    state = {
      type: readFormat(),
      mode: built.mode,
      participants: built.participants,
      groupsHomeAway: groupsHomeAwayEl.checked,
      knockoutHomeAway: knockoutHomeAwayEl.checked,
      groups: null,
      knockout: null
    };
    renderFresh();
    setSetupCollapsed(true);
    showMessage(
      `${built.participants.length} ${built.mode === "teams" ? "teams" : "players"} in the draw.`,
      "success"
    );
    spotlight(state.type === "knockout" ? knockoutCard : groupsCard);
  });

  document.querySelectorAll("input[name='tournament-type']").forEach(radio => {
    radio.addEventListener("change", () => {
      if (!state) return;
      state.type = readFormat();
      renderFresh();
      showMessage("Cup rebuilt with the new format.", "success");
    });
  });

  groupsHomeAwayEl.addEventListener("change", () => {
    if (!state) return;
    state.groupsHomeAway = groupsHomeAwayEl.checked;
    state.groups = null;
    if (state.type !== "knockout") state.knockout = null;
    layout();
    buildMissing();
    save();
    showMessage("Group stage rebuilt.", "success");
  });

  knockoutHomeAwayEl.addEventListener("change", () => {
    if (!state) return;
    state.knockoutHomeAway = knockoutHomeAwayEl.checked;
    state.knockout = null;
    layout();
    buildMissing();
    save();
    showMessage("Knockout rebuilt.", "success");
  });

  drawBtn.addEventListener("click", () => {
    if (!state || !state.groups || state.knockout) return;
    const qualified = qualifiersFromGroups(state.groups);
    if (qualified.length < 2) {
      showMessage("Not enough group results yet - play some games first.", "error");
      return;
    }
    state.knockout = generateKnockoutTournament(qualified, knockoutContainer, {
      homeAway: state.knockoutHomeAway,
      mode: state.mode,
      doShuffle: false,
      onUpdate: save
    });
    state.knockout.fromGroups = true;
    markDrawn();
    save();
    spotlight(knockoutCard);
  });

  clearBtn.addEventListener("click", () => {
    state = null;
    removeKey(CUP_KEY);
    resetView();
    setSetupCollapsed(false);
    showMessage("Cup cleared.", "success");
  });

  window.addEventListener("fc26:session", updateHint);

  const saved = loadJSON(CUP_KEY);
  if (saved && Array.isArray(saved.participants) && saved.participants.length > 0) {
    state = saved;
    if (!Array.isArray(state.groups)) state.groups = null;
    if (!state.knockout || typeof state.knockout !== "object") state.knockout = null;
    try {
      syncControls();
      layout();
      buildMissing();
      setSetupCollapsed(true);
    } catch {
      state = null;
      removeKey(CUP_KEY);
      resetView();
      setSetupCollapsed(false);
    }
  } else {
    resetView();
  }

  updateHint();
}
