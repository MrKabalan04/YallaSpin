import { shuffle } from "./utils.js";
import { confetti } from "./fx.js";

export function generateKnockoutTournament(entries, container, { homeAway = false, mode = "players", doShuffle = true, onUpdate = null } = {}) {
  const count = entries.filter(Boolean).length;
  if (count < 2) {
    container.innerHTML = "<p class='placeholder'>Need at least 2 entries for a knockout.</p>";
    return null;
  }
  const pool = [...entries].filter(Boolean);
  if (doShuffle) shuffle(pool);
  const size = Math.max(2, 2 ** Math.ceil(Math.log2(pool.length)));
  const tieCount = size / 2;
  const padded = new Array(size).fill(null);
  let idx = 0;
  for (let t = 0; t < tieCount; t++) {
    const realsLeft = pool.length - idx;
    const tiesLeft = tieCount - t;
    if (realsLeft >= tiesLeft * 2) {
      padded[t * 2] = pool[idx++];
      padded[t * 2 + 1] = pool[idx++];
    } else {
      padded[t * 2] = pool[idx++];
    }
  }

  const state = {
    homeAway,
    mode,
    initialCount: padded.length,
    participants: padded,
    rounds: [],
    thirdPlace: { teamA: null, teamB: null, goalsA: null, goalsB: null, pensA: null, pensB: null },
    activeRound: 0,
    celebrated: false
  };
  state.rounds.push(createRound(padded, homeAway, 0));
  renderKnockout(container, state, onUpdate);
  return state;
}

export function restoreKnockout(state, container, onUpdate = null) {
  normalizeState(state);
  renderKnockout(container, state, onUpdate);
  return state;
}

function normalizeState(state) {
  if (!Number.isInteger(state.activeRound)) state.activeRound = 0;
  if (typeof state.celebrated !== "boolean") state.celebrated = false;
  if (!state.thirdPlace) {
    state.thirdPlace = { teamA: null, teamB: null, goalsA: null, goalsB: null, pensA: null, pensB: null };
  }
  state.mode = state.mode || "players";
  state.rounds.forEach(round => {
    round.ties.forEach(t => {
      t.homeFrom = t.homeFrom || "";
      t.awayFrom = t.awayFrom || "";
    });
  });
  clampActive(state);
}

function clampActive(state) {
  state.activeRound = Math.min(Math.max(0, state.activeRound), state.rounds.length - 1);
}

function roundNameForCount(count) {
  if (count === 2) return "Final";
  if (count === 4) return "Semi-finals";
  if (count === 8) return "Quarter-finals";
  if (count === 16) return "Round of 16";
  return "Round of 32";
}

function createRound(participants, homeAway, depth) {
  const size = participants.length;
  const twoLegged = homeAway && size > 2;
  const ties = [];
  for (let i = 0; i < size; i += 2) {
    const home = participants[i] || null;
    const away = participants[i + 1] || null;
    ties.push({
      id: `R${depth + 1}-T${i / 2 + 1}`,
      home,
      away,
      homeFrom: "",
      awayFrom: "",
      byeSide: !home && away ? "home" : home && !away ? "away" : "",
      twoLegged,
      leg1HomeGoals: null,
      leg1AwayGoals: null,
      leg2HomeGoals: null,
      leg2AwayGoals: null,
      pensHome: null,
      pensAway: null,
      winner: null,
      loser: null
    });
  }
  return { name: roundNameForCount(size), depth, ties };
}

function primaryName(entry, mode) {
  if (!entry) return "";
  return mode === "teams"
    ? (entry.team?.name || entry.label || "")
    : (entry.label || entry.team?.name || "");
}

function secondaryName(entry, mode) {
  if (!entry) return "";
  if (mode === "teams") return entry.ownerLabel || "";
  const club = entry.team?.name || "";
  return club && club !== primaryName(entry, mode) ? club : "";
}

function validGoal(v) {
  return Number.isInteger(v) && v >= 0;
}

function computeTieWinner(tie) {
  if (tie.home && !tie.away) return { winner: tie.home, loser: null };
  if (!tie.home && tie.away) return { winner: tie.away, loser: null };
  if (!tie.home || !tie.away) return null;

  if (!tie.twoLegged) {
    if (!validGoal(tie.leg1HomeGoals) || !validGoal(tie.leg1AwayGoals)) return null;
    if (tie.leg1HomeGoals > tie.leg1AwayGoals) return { winner: tie.home, loser: tie.away };
    if (tie.leg1AwayGoals > tie.leg1HomeGoals) return { winner: tie.away, loser: tie.home };
    return penWinner(tie);
  }

  if (![tie.leg1HomeGoals, tie.leg1AwayGoals, tie.leg2HomeGoals, tie.leg2AwayGoals].every(validGoal)) return null;
  const h = tie.leg1HomeGoals + tie.leg2AwayGoals;
  const a = tie.leg1AwayGoals + tie.leg2HomeGoals;
  if (h > a) return { winner: tie.home, loser: tie.away };
  if (a > h) return { winner: tie.away, loser: tie.home };
  return penWinner(tie);
}

function penWinner(tie) {
  if (validGoal(tie.pensHome) && validGoal(tie.pensAway) && tie.pensHome !== tie.pensAway) {
    return tie.pensHome > tie.pensAway ? { winner: tie.home, loser: tie.away } : { winner: tie.away, loser: tie.home };
  }
  return null;
}

function aggregateScore(tie) {
  if (!tie.twoLegged) return null;
  if (![tie.leg1HomeGoals, tie.leg1AwayGoals, tie.leg2HomeGoals, tie.leg2AwayGoals].every(validGoal)) return null;
  return {
    h: tie.leg1HomeGoals + tie.leg2AwayGoals,
    a: tie.leg1AwayGoals + tie.leg2HomeGoals
  };
}

function pensNeeded(tie) {
  if (!tie.home || !tie.away) return false;
  let level = false;
  if (!tie.twoLegged) {
    level = validGoal(tie.leg1HomeGoals) && validGoal(tie.leg1AwayGoals) && tie.leg1HomeGoals === tie.leg1AwayGoals;
  } else {
    const agg = aggregateScore(tie);
    level = !!agg && agg.h === agg.a;
  }
  return level || validGoal(tie.pensHome) || validGoal(tie.pensAway);
}

function recompute(state) {
  const maxRounds = Math.log2(state.initialCount);

  for (let r = 0; r < state.rounds.length; r++) {
    const round = state.rounds[r];
    const winners = [];

    round.ties.forEach(tie => {
      const res = computeTieWinner(tie);
      tie.winner = res ? res.winner : null;
      tie.loser = res ? res.loser : null;
      if (res) winners.push(res.winner);
    });

    const complete = round.ties.length > 0 && winners.length === round.ties.length;
    const hasNext = r + 1 < state.rounds.length;

    if (complete && winners.length > 1) {
      if (hasNext) {
        linkRound(state.rounds[r + 1], winners);
      } else if (state.rounds.length < maxRounds) {
        const nextRound = createRound(new Array(winners.length).fill(null), state.homeAway, state.rounds.length);
        linkRound(nextRound, winners);
        state.rounds.push(nextRound);
      }
    } else if (hasNext) {
      state.rounds[r + 1].ties.forEach(t => {
        t.home = null;
        t.away = null;
        t.winner = null;
        t.loser = null;
        t.leg1HomeGoals = null;
        t.leg1AwayGoals = null;
        t.leg2HomeGoals = null;
        t.leg2AwayGoals = null;
        t.pensHome = null;
        t.pensAway = null;
      });
    }
  }

  updateThirdPlace(state);

  const cur = state.rounds[state.activeRound];
  if (cur && cur.ties.length && cur.ties.every(t => t.winner) && state.activeRound < state.rounds.length - 1) {
    state.activeRound++;
  }
}

function linkRound(round, winners) {
  round.ties.forEach((t, i) => {
    const h = winners[i * 2] || null;
    const a = winners[i * 2 + 1] || null;
    const changed = (t.home?.id ?? null) !== (h?.id ?? null) || (t.away?.id ?? null) !== (a?.id ?? null);
    t.home = h;
    t.away = a;
    t.byeSide = "";
    t.homeFrom = `Winner M${i * 2 + 1}`;
    t.awayFrom = `Winner M${i * 2 + 2}`;
    if (changed) {
      t.leg1HomeGoals = null;
      t.leg1AwayGoals = null;
      t.leg2HomeGoals = null;
      t.leg2AwayGoals = null;
      t.pensHome = null;
      t.pensAway = null;
      t.winner = null;
      t.loser = null;
    }
  });
}

function updateThirdPlace(state) {
  if (state.initialCount < 4) {
    state.thirdPlace.teamA = null;
    state.thirdPlace.teamB = null;
    return;
  }
  const semi = state.rounds.find(r => r.name === "Semi-finals");
  if (!semi) return;
  const losers = semi.ties.map(t => t.loser).filter(Boolean);
  if (losers.length === 2) {
    state.thirdPlace.teamA = losers[0];
    state.thirdPlace.teamB = losers[1];
  } else {
    state.thirdPlace.teamA = null;
    state.thirdPlace.teamB = null;
  }
}

function champion(state) {
  const maxRounds = Math.log2(state.initialCount);
  if (state.rounds.length !== maxRounds) return null;
  const finalRound = state.rounds[maxRounds - 1];
  return finalRound?.ties[0]?.winner || null;
}

function renderKnockout(container, state, onUpdate) {
  clampActive(state);

  const activeEl = document.activeElement;
  const prevFocusId = activeEl && container.contains(activeEl) ? activeEl.id : "";
  const prevBracket = container.querySelector(".bracket");
  const prevScroll = prevBracket ? prevBracket.scrollLeft : 0;

  container.innerHTML = "";

  const champ = champion(state);
  if (champ && !state.celebrated) {
    state.celebrated = true;
    confetti(true);
  }

  if (champ) {
    const banner = document.createElement("div");
    banner.className = "champion-banner";
    const sub = state.mode === "teams"
      ? (champ.ownerLabel ? `Played by ${champ.ownerLabel}` : "")
      : (champ.team?.name || "");
    banner.innerHTML = `
      <div class="champion-kicker">Champion</div>
      <div class="champion-name"></div>
      ${sub ? '<div class="champion-sub"></div>' : ""}
    `;
    banner.querySelector(".champion-name").textContent = primaryName(champ, state.mode);
    if (sub) banner.querySelector(".champion-sub").textContent = sub;
    container.appendChild(banner);
  }

  const nav = document.createElement("div");
  nav.className = "bracket-nav";
  nav.innerHTML = '<span class="bracket-nav-label">Round</span>';
  const chips = document.createElement("div");
  chips.className = "round-chips";
  state.rounds.forEach((round, i) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "round-chip" + (i === state.activeRound ? " active" : "");
    chip.textContent = round.name;
    chip.addEventListener("click", () => {
      if (state.activeRound !== i) {
        state.activeRound = i;
        container.querySelectorAll(".round-chip").forEach((c, ci) => c.classList.toggle("active", ci === i));
      }
      const col = container.querySelectorAll(".bracket-col")[i];
      if (col) col.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    });
    chips.appendChild(chip);
  });
  nav.appendChild(chips);
  container.appendChild(nav);

  const bracket = document.createElement("div");
  bracket.className = "bracket";
  const maxRounds = Math.log2(state.initialCount);

  state.rounds.forEach((round, rIdx) => {
    const col = document.createElement("div");
    col.className = "bracket-col" + (rIdx === state.activeRound ? " active" : "");

    const title = document.createElement("div");
    title.className = "bracket-col-title";
    title.textContent = round.name;
    col.appendChild(title);

    const tiesWrap = document.createElement("div");
    tiesWrap.className = "bracket-ties";
    const isFinalRound = rIdx === state.rounds.length - 1 && state.rounds.length === maxRounds;

    round.ties.forEach((tie, idx) => {
      tiesWrap.appendChild(buildTieCard(tie, idx, isFinalRound, state, container, onUpdate));
    });

    col.appendChild(tiesWrap);
    bracket.appendChild(col);
  });

  container.appendChild(bracket);

  if (state.thirdPlace.teamA && state.thirdPlace.teamB) {
    container.appendChild(buildThirdPlace(state, onUpdate));
  }

  if (prevScroll) bracket.scrollLeft = prevScroll;
  if (prevFocusId) {
    const el = container.querySelector(`#${CSS.escape(prevFocusId)}`);
    if (el) {
      el.focus();
      const len = el.value.length;
      try { el.setSelectionRange(len, len); } catch { /* ignore */ }
    }
  }

  if (onUpdate) onUpdate();
}

function buildTieCard(tie, idx, isFinalRound, state, container, onUpdate) {
  const mode = state.mode;
  const card = document.createElement("div");
  card.className = "tie-card" + (tie.winner ? " tie-card--done" : "") + (tie.byeSide ? " tie-card--bye" : "");

  const head = document.createElement("div");
  head.className = "tie-head";
  head.innerHTML = `<span class="tie-badge">M${idx + 1}</span>${tie.twoLegged ? '<span class="tie-flag">Two legs</span>' : ""}`;
  card.appendChild(head);

  if (tie.byeSide) {
    const entry = tie.byeSide === "away" ? tie.home : tie.away;
    const row = document.createElement("div");
    row.className = "tie-leg";

    const cell = document.createElement("div");
    fillTeamCell(cell, entry, "", mode, true);

    const mid = document.createElement("div");
    mid.className = "score-cluster";

    const byeCell = document.createElement("div");
    byeCell.className = "team-cell team-cell--right";
    byeCell.innerHTML = '<span class="team-main team-main--tbd">Bye</span>';

    if (tie.byeSide === "home") {
      row.append(byeCell, mid, cell);
    } else {
      row.append(cell, mid, byeCell);
    }
    card.appendChild(row);

    const adv = document.createElement("div");
    adv.className = "tie-winner";
    adv.textContent = `Advances \u00b7 ${primaryName(entry, mode)}`;
    card.appendChild(adv);
    return card;
  }

  const addLeg = (legKey, hEntry, aEntry, hVal, aVal, hFrom, aFrom) => {
    const leg = document.createElement("div");
    leg.className = "tie-leg";

    const hCell = document.createElement("div");
    hCell.className = "team-cell";
    const aCell = document.createElement("div");
    aCell.className = "team-cell team-cell--right";

    const cluster = document.createElement("div");
    cluster.className = "score-cluster";
    cluster.innerHTML = `
      <input type="number" min="0" inputmode="numeric" class="score-input h" id="${tie.id}-${legKey}-h" value="${hVal ?? ""}">
      <span class="match-dash">-</span>
      <input type="number" min="0" inputmode="numeric" class="score-input a" id="${tie.id}-${legKey}-a" value="${aVal ?? ""}">
    `;

    leg.append(hCell, cluster, aCell);
    card.appendChild(leg);

    fillTeamCell(hCell, hEntry, hFrom, mode, tie.winner && tie.winner === hEntry);
    fillTeamCell(aCell, aEntry, aFrom, mode, tie.winner && tie.winner === aEntry);

    cluster.querySelector(".h").addEventListener("input", e => {
      tie[`${legKey}HomeGoals`] = e.target.value === "" ? null : parseInt(e.target.value);
      refresh(state, container, onUpdate);
    });
    cluster.querySelector(".a").addEventListener("input", e => {
      tie[`${legKey}AwayGoals`] = e.target.value === "" ? null : parseInt(e.target.value);
      refresh(state, container, onUpdate);
    });
  };

  addLeg("leg1", tie.home, tie.away, tie.leg1HomeGoals, tie.leg1AwayGoals, tie.homeFrom, tie.awayFrom);

  if (tie.twoLegged) {
    addLeg("leg2", tie.away, tie.home, tie.leg2HomeGoals, tie.leg2AwayGoals, "", "");
    const agg = aggregateScore(tie);
    if (agg) {
      const aggLine = document.createElement("div");
      aggLine.className = "tie-agg";
      aggLine.textContent = `Agg ${agg.h} - ${agg.a}`;
      card.appendChild(aggLine);
    }
  }

  if (pensNeeded(tie)) {
    const pens = document.createElement("div");
    pens.className = "tie-pens";
    pens.innerHTML = `
      <label>Pens</label>
      <input type="number" min="0" inputmode="numeric" class="score-input ph" id="${tie.id}-ph" value="${tie.pensHome ?? ""}">
      <span class="match-dash">-</span>
      <input type="number" min="0" inputmode="numeric" class="score-input pa" id="${tie.id}-pa" value="${tie.pensAway ?? ""}">
    `;
    card.appendChild(pens);
    pens.querySelector(".ph").addEventListener("input", e => {
      tie.pensHome = e.target.value === "" ? null : parseInt(e.target.value);
      refresh(state, container, onUpdate);
    });
    pens.querySelector(".pa").addEventListener("input", e => {
      tie.pensAway = e.target.value === "" ? null : parseInt(e.target.value);
      refresh(state, container, onUpdate);
    });
  }

  if (tie.winner) {
    const bannerEl = document.createElement("div");
    bannerEl.className = "tie-winner";
    bannerEl.textContent = `${isFinalRound ? "Champion" : "Advances"} \u00b7 ${primaryName(tie.winner, mode)}`;
    card.appendChild(bannerEl);
  }

  return card;
}

function fillTeamCell(cell, entry, placeholder, mode, isWinner) {
  cell.innerHTML = '<span class="team-main"></span><span class="team-sub"></span>';
  const main = cell.querySelector(".team-main");
  const sub = cell.querySelector(".team-sub");

  if (entry) {
    main.textContent = primaryName(entry, mode) || "\u2014";
    if (isWinner) main.classList.add("team-main--winner");
    const sec = secondaryName(entry, mode);
    sub.textContent = sec;
    sub.style.display = sec ? "" : "none";
  } else {
    main.textContent = placeholder || "TBD";
    main.classList.add("team-main--tbd");
    sub.style.display = "none";
  }
}

function buildThirdPlace(state, onUpdate) {
  const tp = state.thirdPlace;
  const mode = state.mode;
  const section = document.createElement("div");
  section.className = "third-place tie-card";

  const title = document.createElement("div");
  title.className = "tie-head";
  title.innerHTML = '<span class="tie-badge" style="color: var(--cyan)">Third Place Play-off</span>';
  section.appendChild(title);

  const leg = document.createElement("div");
  leg.className = "tie-leg";
  const aCell = document.createElement("div");
  aCell.className = "team-cell";
  const bCell = document.createElement("div");
  bCell.className = "team-cell team-cell--right";
  const cluster = document.createElement("div");
  cluster.className = "score-cluster";
  cluster.innerHTML = `
    <input type="number" min="0" inputmode="numeric" class="score-input ta" id="tp-a" value="${tp.goalsA ?? ""}">
    <span class="match-dash">-</span>
    <input type="number" min="0" inputmode="numeric" class="score-input tb" id="tp-b" value="${tp.goalsB ?? ""}">
  `;
  leg.append(aCell, cluster, bCell);
  section.appendChild(leg);
  fillTeamCell(aCell, tp.teamA, "", mode, false);
  fillTeamCell(bCell, tp.teamB, "", mode, false);

  const showPens = () => {
    const level = validGoal(tp.goalsA) && validGoal(tp.goalsB) && tp.goalsA === tp.goalsB;
    const hasPens = validGoal(tp.pensA) || validGoal(tp.pensB);
    return level || hasPens;
  };

  let pensRow = null;
  const ensurePens = () => {
    if (!showPens() || pensRow) return;
    pensRow = document.createElement("div");
    pensRow.className = "tie-pens";
    pensRow.innerHTML = `
      <label>Pens</label>
      <input type="number" min="0" inputmode="numeric" class="score-input" id="tp-pa" value="${tp.pensA ?? ""}">
      <span class="match-dash">-</span>
      <input type="number" min="0" inputmode="numeric" class="score-input" id="tp-pb" value="${tp.pensB ?? ""}">
    `;
    section.insertBefore(pensRow, section.querySelector(".tie-winner"));
    bindPen("#tp-pa", "pensA");
    bindPen("#tp-pb", "pensB");
  };

  const syncBanner = () => {
    const winner = thirdPlaceWinner(tp);
    let bannerEl = section.querySelector(".tie-winner");
    if (winner) {
      if (!bannerEl) {
        bannerEl = document.createElement("div");
        bannerEl.className = "tie-winner";
        section.appendChild(bannerEl);
      }
      bannerEl.textContent = `Third place \u00b7 ${primaryName(winner, mode)}`;
    } else if (bannerEl) {
      bannerEl.remove();
    }
    if (onUpdate) onUpdate();
  };

  const bindScore = (sel, key) => {
    cluster.querySelector(sel).addEventListener("input", e => {
      tp[key] = e.target.value === "" ? null : parseInt(e.target.value);
      ensurePens();
      syncBanner();
    });
  };

  const bindPen = (sel, key) => {
    pensRow.querySelector(sel).addEventListener("input", e => {
      tp[key] = e.target.value === "" ? null : parseInt(e.target.value);
      syncBanner();
    });
  };

  bindScore("#tp-a", "goalsA");
  bindScore("#tp-b", "goalsB");
  ensurePens();

  return section;
}

function thirdPlaceWinner(tp) {
  if (!tp.teamA || !tp.teamB) return null;
  if (!validGoal(tp.goalsA) || !validGoal(tp.goalsB)) return null;
  if (tp.goalsA > tp.goalsB) return tp.teamA;
  if (tp.goalsB > tp.goalsA) return tp.teamB;
  if (validGoal(tp.pensA) && validGoal(tp.pensB) && tp.pensA !== tp.pensB) {
    return tp.pensA > tp.pensB ? tp.teamA : tp.teamB;
  }
  return null;
}

function refresh(state, container, onUpdate) {
  recompute(state);
  renderKnockout(container, state, onUpdate);
}
