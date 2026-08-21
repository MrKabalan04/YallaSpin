import { shuffle } from "./utils.js";

export function generateGroups(entries, mode, { homeAndAway = false, ordered = false } = {}) {
  const n = entries.length;
  if (n === 0) return [];
  let groupCount = (mode === "groups") ? 1 : (n <= 4 ? 1 : Math.max(2, Math.round(n / 4)));
  const groups = [];
  for (let i = 0; i < groupCount; i++) {
    groups.push({ id: String.fromCharCode(65 + i), teams: [], matches: [] });
  }
  const list = [...entries];
  if (!ordered) shuffle(list);
  list.forEach((e, idx) => groups[idx % groupCount].teams.push(e));
  groups.forEach(group => group.matches = buildGroupMatches(group.teams, group.id, homeAndAway));
  return groups;
}

function createRoundRobinRounds(teams) {
  if (teams.length === 0) return [];
  let list = [...teams];
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds = [];
  for (let roundIndex = 0; roundIndex < n - 1; roundIndex++) {
    const roundMatches = [];
    for (let i = 0; i < n / 2; i++) {
      const t1 = list[i];
      const t2 = list[n - 1 - i];
      if (t1 && t2) roundMatches.push({ home: t1, away: t2 });
    }
    rounds.push(roundMatches);
    const first = list[0];
    const rest = list.slice(1);
    rest.unshift(rest.pop());
    list = [first, ...rest];
  }
  return rounds;
}

function buildGroupMatches(teams, groupId, homeAndAway) {
  const matches = [];
  if (teams.length < 2) return matches;
  const firstLegRounds = createRoundRobinRounds(teams);
  firstLegRounds.forEach((round, rIdx) => {
    round.forEach((pair, mIdx) => {
      matches.push({
        id: `G${groupId}-R${rIdx + 1}M${mIdx + 1}`,
        home: pair.home,
        away: pair.away,
        homeGoals: null,
        awayGoals: null,
        leg: 1
      });
    });
  });
  if (homeAndAway) {
    const startR = firstLegRounds.length + 1;
    firstLegRounds.forEach((round, rIdx) => {
      round.forEach((pair, mIdx) => {
        matches.push({
          id: `G${groupId}-R${startR + rIdx}M${mIdx + 1}`,
          home: pair.away,
          away: pair.home,
          homeGoals: null,
          awayGoals: null,
          leg: 2
        });
      });
    });
  }
  return matches;
}

export function computeTable(group) {
  const stats = new Map();
  function ensure(e) {
    if (!stats.has(e.id)) {
      stats.set(e.id, {
        playerId: e.id,
        label: e.team?.name || e.label,
        played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0
      });
    }
    return stats.get(e.id);
  }
  group.matches.forEach(m => {
    const hg = m.homeGoals;
    const ag = m.awayGoals;
    if (!Number.isInteger(hg) || !Number.isInteger(ag) || hg < 0 || ag < 0) return;
    const h = ensure(m.home);
    const a = ensure(m.away);
    h.played++; a.played++;
    h.gf += hg; h.ga += ag;
    a.gf += ag; a.ga += hg;
    if (hg > ag) { h.w++; a.l++; h.pts += 3; }
    else if (ag > hg) { a.w++; h.l++; a.pts += 3; }
    else { h.d++; a.d++; h.pts += 1; a.pts += 1; }
  });
  group.teams.forEach(e => ensure(e));
  return Array.from(stats.values()).map(s => ({ ...s, gd: s.gf - s.ga }))
    .sort((a, b) => (b.pts - a.pts) || (b.gd - a.gd) || (b.gf - a.gf) || a.label.localeCompare(b.label));
}

function primaryLabel(entry, mode) {
  return entry.team?.name || entry.label || "";
}

function secondaryLabel(entry, mode) {
  if (!entry) return "";
  if (mode === "teams") return entry.ownerLabel || "";
  return "";
}

function fillCell(cell, entry, mode) {
  cell.innerHTML = '<span class="team-main"></span><span class="team-sub"></span>';
  const main = cell.querySelector(".team-main");
  const sub = cell.querySelector(".team-sub");
  main.textContent = primaryLabel(entry, mode) || "\u2014";
  const sec = secondaryLabel(entry, mode);
  sub.textContent = sec;
  sub.style.display = sec ? "" : "none";
}

export function renderGroups(groups, container, mode, { onChange = null, highlightQuals = false } = {}) {
  container.innerHTML = "";

  groups.forEach(group => {
    const slot = document.createElement("div");
    slot.className = "group-slot";

    const groupCard = document.createElement("div");
    groupCard.className = "group-card";

    const title = document.createElement("div");
    title.className = "group-title";
    title.textContent = `Group ${group.id}`;
    groupCard.appendChild(title);

    const hasSecondLeg = group.matches.some(m => m.leg === 2);
    const matchList = document.createElement("div");
    matchList.className = "match-list";

    const leg1Rounds = hasSecondLeg
      ? new Set(group.matches.filter(m => m.leg === 1).map(m => m.id.match(/R(\d+)M/)[1])).size
      : 0;

    let lastSectionKey = "";
    group.matches.forEach(match => {
      const roundNum = Number(match.id.match(/R(\d+)M/)[1]);
      const mdNum = match.leg === 2 ? roundNum - leg1Rounds : roundNum;
      const sectionKey = `${match.leg}-${mdNum}`;
      if (sectionKey !== lastSectionKey) {
        lastSectionKey = sectionKey;
        const label = document.createElement("div");
        label.className = "round-label";
        label.textContent = hasSecondLeg
          ? `${match.leg === 1 ? "First Leg" : "Second Leg"} \u00b7 Matchday ${mdNum}`
          : `Matchday ${mdNum}`;
        matchList.appendChild(label);
      }

      const row = document.createElement("div");
      row.className = "match-row";

      const hCell = document.createElement("div");
      hCell.className = "team-cell";
      const aCell = document.createElement("div");
      aCell.className = "team-cell team-cell--right";

      const cluster = document.createElement("div");
      cluster.className = "score-cluster";
      cluster.innerHTML = `
        <input type="number" min="0" inputmode="numeric" class="score-input home" value="${match.homeGoals ?? ""}" aria-label="Home goals">
        <span class="match-dash">-</span>
        <input type="number" min="0" inputmode="numeric" class="score-input away" value="${match.awayGoals ?? ""}" aria-label="Away goals">
      `;

      row.append(hCell, cluster, aCell);

      if (hasSecondLeg && match.leg === 2) {
        const legChip = document.createElement("span");
        legChip.className = "leg-chip";
        legChip.textContent = "2nd leg";
        row.appendChild(legChip);
      }

      matchList.appendChild(row);

      fillCell(hCell, match.home, mode);
      fillCell(aCell, match.away, mode);

      const hInput = cluster.querySelector(".home");
      const aInput = cluster.querySelector(".away");
      const update = () => {
        match.homeGoals = hInput.value === "" ? null : parseInt(hInput.value);
        match.awayGoals = aInput.value === "" ? null : parseInt(aInput.value);
        renderTable();
        if (onChange) onChange();
      };
      hInput.addEventListener("input", update);
      aInput.addEventListener("input", update);
    });

    groupCard.appendChild(matchList);

    const tableWrap = document.createElement("div");
    tableWrap.className = "standings-wrap";
    groupCard.appendChild(tableWrap);

    const entryById = new Map();
    group.teams.forEach(e => entryById.set(e.id, e));

    const renderTable = () => {
      const stats = computeTable(group);
      tableWrap.innerHTML = `
        <div class="standings-title">Table</div>
        <table class="standings">
          <thead>
            <tr>
              <th class="pos">#</th>
              <th class="club">Club</th>
              <th>P</th>
              <th>W</th>
              <th>D</th>
              <th>L</th>
              <th>GD</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      `;
      const tbody = tableWrap.querySelector("tbody");
      stats.forEach((s, idx) => {
        const tr = document.createElement("tr");
        if (highlightQuals && idx < 2) tr.classList.add("qualifies");

        const tdPos = document.createElement("td");
        tdPos.className = "pos";
        tdPos.textContent = idx + 1;

        const tdClub = document.createElement("td");
        const cell = document.createElement("div");
        cell.className = "team-cell";
        const main = document.createElement("span");
        main.className = "team-main";
        main.textContent = s.label;
        cell.appendChild(main);
        const entry = entryById.get(s.playerId);
        const sec = entry ? secondaryLabel(entry, mode) : "";
        if (sec) {
          const sub = document.createElement("span");
          sub.className = "team-sub";
          sub.textContent = sec;
          cell.appendChild(sub);
        }
        tdClub.appendChild(cell);

        tr.append(tdPos, tdClub);

        const tdP = document.createElement("td"); tdP.textContent = s.played;
        const tdW = document.createElement("td"); tdW.textContent = s.w;
        const tdD = document.createElement("td"); tdD.textContent = s.d;
        const tdL = document.createElement("td"); tdL.textContent = s.l;
        const gdCls = s.gd > 0 ? "gd-pos" : s.gd < 0 ? "gd-neg" : "";
        const tdGd = document.createElement("td");
        tdGd.className = gdCls;
        tdGd.textContent = s.gd > 0 ? "+" + s.gd : s.gd;
        const tdPts = document.createElement("td");
        tdPts.className = "pts";
        tdPts.textContent = s.pts;

        tr.append(tdP, tdW, tdD, tdL, tdGd, tdPts);
        tbody.appendChild(tr);
      });
    };
    renderTable();

    slot.appendChild(groupCard);
    container.appendChild(slot);
  });
}
