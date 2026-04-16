let currentPicks = {};
let currentPickNumber = 1;
// Track trade overrides: {pickNumber: newTeam}
let tradeOverrides = {};
// Track trade details: {pickNumber: {teamFrom, teamTo, picksGivenUp: [pickNums], picksReceived: [pickNums]}}
let tradeDetails = {};

function getDraftedOveralls() {
  return new Set(
    Object.values(currentPicks)
      .filter(p => p.playerOverall)
      .map(p => p.playerOverall)
  );
}

function getAvailablePlayers() {
  const drafted = getDraftedOveralls();
  return BIG_BOARD.filter(p => !drafted.has(p.overall));
}

function getCurrentPickNumber() {
  if (Object.keys(currentPicks).length === 0) return 1;
  const maxPick = Math.max(...Object.keys(currentPicks).map(Number));
  return maxPick + 1;
}

function getTradeCost(pickNum) {
  const trade = tradeDetails[pickNum];
  if (!trade) return 0;
  // "Trading up" team gives up picks (picksGivenUp + futurePicksGivenUp)
  // "Trading down" team gives up picks (picksReceived + futurePicksReceived) — these go TO the trading-up team
  // Net cost to the trading-up team = what they gave - (pick value + what they received back)
  let givenUpValue = 0;
  if (trade.picksGivenUp?.length) {
    givenUpValue += trade.picksGivenUp.reduce((sum, p) => sum + getSlotValue(p), 0);
  }
  if (trade.futurePicksGivenUp?.length) {
    givenUpValue += trade.futurePicksGivenUp.reduce((sum, fp) => {
      return sum + getFuturePickValue(fp.round, fp.year - 2026, trade.teamTo, fp.orig);
    }, 0);
  }
  let receivedValue = getSlotValue(pickNum);
  if (trade.picksReceived?.length) {
    receivedValue += trade.picksReceived.reduce((sum, p) => sum + getSlotValue(p), 0);
  }
  if (trade.futurePicksReceived?.length) {
    receivedValue += trade.futurePicksReceived.reduce((sum, fp) => {
      return sum + getFuturePickValue(fp.round, fp.year - 2026, trade.teamFrom, fp.orig);
    }, 0);
  }
  return givenUpValue - receivedValue;
}

function getTeamForPick(pickNum) {
  if (tradeOverrides[pickNum]) return tradeOverrides[pickNum];
  const order = DRAFT_ORDER[pickNum];
  return order ? order.team : null;
}

function getRoundForPick(pickNum) {
  const order = DRAFT_ORDER[pickNum];
  return order ? order.r : Math.ceil(pickNum / 32);
}

function buildInventoryTooltip(team) {
  const inv = getTeamAllPicks(team);
  const draftedPicks = new Set(Object.keys(currentPicks).map(Number));
  const remaining = inv.current.filter(p => !draftedPicks.has(p));
  let lines = [];
  lines.push(`${team} Pick Inventory`);
  lines.push(`Current: ${remaining.length ? remaining.map(p => '#' + p + ' (R' + getRoundForPick(p) + ')').join(', ') : 'None'}`);
  [2027, 2028].forEach(year => {
    const picks = inv.future[year] || [];
    if (picks.length) lines.push(`${year}: ${picks.map(fp => {
      const label = 'R' + fp.round;
      return fp.orig !== team ? label + ' (via ' + fp.orig + ')' : label;
    }).join(', ')}`);
  });
  return lines.join('\n');
}

function renderDraftBoard(picks) {
  currentPicks = picks;
  currentPickNumber = getCurrentPickNumber();

  // Load trade overrides and details from storage
  const savedTrades = localStorage.getItem('draft_trades');
  if (savedTrades) tradeOverrides = JSON.parse(savedTrades);
  const savedTradeDetails = localStorage.getItem('draft_trade_details');
  if (savedTradeDetails) tradeDetails = JSON.parse(savedTradeDetails);

  // Rebuild pick inventory
  initPickInventory();

  const tbody = document.getElementById('draft-board-body');
  const rows = [];

  for (let i = 1; i <= 257; i++) {
    const pick = picks[i];
    const slotValue = getSlotValue(i);
    const round = getRoundForPick(i);
    const scheduledTeam = getTeamForPick(i);

    // Round separator
    if (i === 1 || getRoundForPick(i) !== getRoundForPick(i - 1)) {
      rows.push(`<tr class="round-header"><td colspan="7">Round ${round}</td></tr>`);
    }

    if (pick) {
      const player = pick.playerOverall ? findPlayerByOverall(pick.playerOverall) : null;
      const offBoard = !player;
      const effScore = player ? player.score : SCORE_PARAMS.minScore;
      const playerName = player ? player.player : (pick.playerName || 'Off Board');
      const position = player ? player.position : '';
      const school = player ? player.school : '';
      const playerValue = getPlayerValue(effScore).toFixed(0);
      const pickScore = getPickScore(i, effScore);
      const tradeCost = getTradeCost(i);
      const netScore = pickScore - tradeCost;
      const scoreColor = getPickScoreColor(netScore);
      const scoreLabel = `${netScore > 0 ? '+' : ''}${netScore.toFixed(0)}`;
      const team = pick.team;
      const teamColor = TEAM_COLORS[team] || '#666';
      const traded = scheduledTeam && team !== scheduledTeam;
      const tradeInfo = tradeDetails[i];
      const tradeCostLabel = tradeCost ? `<div class="trade-cost-label">Trade cost: -${tradeCost.toFixed(0)}</div>` : '';

      rows.push(`
        <tr class="pick-row picked">
          <td class="pick-num">${i}</td>
          <td class="pick-team" style="box-shadow: inset 4px 0 0 ${teamColor}" title="${buildInventoryTooltip(team).replace(/"/g, '&quot;')}">
            <div class="pick-team-inner">
              <img src="logos/${team}.png" alt="${team}" class="team-logo" onerror="this.style.display='none'">
              <span>${team}</span>
              ${traded ? `<span class="traded-badge" title="Originally ${scheduledTeam}">TRADE</span><button class="btn-edit-trade" data-pick="${i}" title="Edit trade">&#9998;</button>` : ''}
            </div>
          </td>
          <td class="pick-player">
            <div class="player-name">${playerName}</div>
            <div class="player-info">${offBoard ? `Off Board | min ${effScore}` : `${position}${school ? ' - ' + school : ''} | ${player.score}${player.posRank ? ' | ' + player.posRank : ''}`}</div>
          </td>
          <td class="pick-slot-val">${slotValue.toFixed(0)}</td>
          <td class="pick-player-val">${playerValue}</td>
          <td class="pick-score" style="background-color: ${scoreColor}; color: white">
            ${scoreLabel}
            ${tradeCostLabel}
          </td>
          <td class="pick-actions">
            <button class="btn-undo" data-pick="${i}" title="Undo pick #${i}">&#x2715;</button>
          </td>
        </tr>
      `);
    } else {
      const isCurrent = i === currentPickNumber;
      const teamColor = scheduledTeam ? (TEAM_COLORS[scheduledTeam] || '#666') : '#333';
      const traded = tradeOverrides[i];
      rows.push(`
        <tr class="pick-row empty ${isCurrent ? 'current-pick' : ''}" ${isCurrent ? '' : 'style="opacity:0.5"'}>
          <td class="pick-num">${i}</td>
          <td class="pick-team" style="box-shadow: inset 4px 0 0 ${teamColor}" ${scheduledTeam ? `title="${buildInventoryTooltip(scheduledTeam).replace(/"/g, '&quot;')}"` : ''}>
            <div class="pick-team-inner">
              ${scheduledTeam ? `<img src="logos/${scheduledTeam}.png" alt="${scheduledTeam}" class="team-logo" onerror="this.style.display='none'">
              <span>${scheduledTeam}</span>` : '—'}
              ${traded ? `<span class="traded-badge">TRADE</span><button class="btn-edit-trade" data-pick="${i}" title="Edit trade">&#9998;</button>` : ''}
            </div>
          </td>
          <td class="pick-player">${isCurrent ? '<em>On the clock...</em>' : ''}</td>
          <td class="pick-slot-val">${slotValue.toFixed(0)}</td>
          <td class="pick-player-val">—</td>
          <td class="pick-score">
            <button class="btn-trade-visible" data-pick="${i}" title="Trade pick #${i}">Trade</button>
          </td>
          <td class="pick-actions"></td>
        </tr>
      `);
    }
  }

  tbody.innerHTML = rows.join('');
  document.getElementById('current-pick-display').textContent = `Pick #${currentPickNumber}`;

  // Bind trade buttons via event delegation
  tbody.querySelectorAll('[data-pick].btn-trade, [data-pick].btn-trade-visible').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleTrade(parseInt(btn.dataset.pick));
    });
  });

  // Bind undo buttons via event delegation
  tbody.querySelectorAll('.btn-undo[data-pick]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleUndo(parseInt(btn.dataset.pick));
    });
  });

  // Bind edit trade buttons
  tbody.querySelectorAll('.btn-edit-trade[data-pick]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleTrade(parseInt(btn.dataset.pick), true);
    });
  });

  // Auto-fill team in the form from draft order
  const teamSelect = document.getElementById('team-select');
  const nextTeam = getTeamForPick(currentPickNumber);
  if (nextTeam && !teamSelect._userChanged) {
    teamSelect.value = nextTeam;
  }

  // Scroll to current pick
  const currentRow = tbody.querySelector('.current-pick');
  if (currentRow) {
    currentRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  renderAvailablePlayers();
  updatePlayerDatalist();
  renderTradesLog();
}

function renderTradesLog() {
  const container = document.getElementById('trades-log');
  if (!container) return;

  const tradeEntries = Object.entries(tradeDetails);
  if (!tradeEntries.length) {
    container.innerHTML = '<div class="trade-log-empty">No trades yet</div>';
    return;
  }

  // Sort by pick number
  tradeEntries.sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

  const html = tradeEntries.map(([pickStr, trade]) => {
    const pickNum = parseInt(pickStr);
    const { teamFrom, teamTo } = trade;
    const teamToColor = TEAM_COLORS[teamTo] || '#666';
    const teamFromColor = TEAM_COLORS[teamFrom] || '#666';

    // Calculate what teamTo sends and receives
    let toSends = [];
    let toSendsTotal = 0;
    (trade.picksGivenUp || []).forEach(p => {
      const v = getSlotValue(p);
      toSends.push(`#${p}`);
      toSendsTotal += v;
    });
    (trade.futurePicksGivenUp || []).forEach(fp => {
      const v = getFuturePickValue(fp.round, fp.year - 2026, teamTo, fp.orig);
      const viaLabel = fp.orig && fp.orig !== teamTo ? ` via ${fp.orig}` : '';
      toSends.push(`'${(fp.year+'').slice(2)} R${fp.round}${viaLabel}`);
      toSendsTotal += v;
    });

    let fromSends = [`#${pickNum}`];
    let fromSendsTotal = getSlotValue(pickNum);
    (trade.picksReceived || []).forEach(p => {
      const v = getSlotValue(p);
      fromSends.push(`#${p}`);
      fromSendsTotal += v;
    });
    (trade.futurePicksReceived || []).forEach(fp => {
      const v = getFuturePickValue(fp.round, fp.year - 2026, teamFrom, fp.orig);
      const viaLabel = fp.orig && fp.orig !== teamFrom ? ` via ${fp.orig}` : '';
      fromSends.push(`'${(fp.year+'').slice(2)} R${fp.round}${viaLabel}`);
      fromSendsTotal += v;
    });

    // Net from teamTo's perspective: positive = overpaid, negative = got a deal
    const toNet = toSendsTotal - fromSendsTotal;
    const toWon = toNet <= 0;
    const winnerTeam = toWon ? teamTo : teamFrom;
    const winnerColor = TEAM_COLORS[winnerTeam] || '#666';
    const diff = Math.abs(Math.round(toNet));
    const verdictLabel = diff === 0 ? 'Even trade'
      : `${winnerTeam} gains +${diff}`;
    const verdictColor = diff === 0 ? 'var(--text-secondary)' : 'var(--text-value)';

    return `
      <div class="trade-log-card" data-pick="${pickNum}" title="Click to edit">
        <div class="trade-log-header">
          <span class="trade-log-pick">Pick #${pickNum}</span>
        </div>
        <div class="trade-log-side">
          <img src="logos/${teamTo}.png" alt="${teamTo}" onerror="this.style.display='none'">
          <strong style="color:${teamToColor}">${teamTo}</strong>
          <span>${toSends.join(', ')}</span>
          <span class="trade-log-val">${Math.round(toSendsTotal)}</span>
        </div>
        <div class="trade-log-side">
          <img src="logos/${teamFrom}.png" alt="${teamFrom}" onerror="this.style.display='none'">
          <strong style="color:${teamFromColor}">${teamFrom}</strong>
          <span>${fromSends.join(', ')}</span>
          <span class="trade-log-val">${Math.round(fromSendsTotal)}</span>
        </div>
        <div class="trade-log-verdict" style="color:${verdictColor}">${verdictLabel}</div>
      </div>`;
  }).join('');

  container.innerHTML = html;

  // Click to edit trade
  container.querySelectorAll('.trade-log-card[data-pick]').forEach(card => {
    card.addEventListener('click', () => {
      handleTrade(parseInt(card.dataset.pick), true);
    });
  });
}

function renderAvailablePlayers() {
  const container = document.getElementById('available-players');
  const filter = document.getElementById('player-filter')?.value?.toLowerCase() || '';
  const posFilter = document.getElementById('position-filter')?.value || '';
  const available = getAvailablePlayers();

  const filtered = available.filter(p => {
    const matchesName = p.player.toLowerCase().includes(filter) || p.school.toLowerCase().includes(filter);
    const matchesPos = !posFilter || p.position === posFilter;
    return matchesName && matchesPos;
  });

  const html = filtered.slice(0, 50).map(p => {
    const value = getPlayerValue(p.score).toFixed(0);
    return `
      <div class="available-player" onclick="selectPlayer(${p.overall})">
        <span class="ap-rank">#${p.overall}</span>
        <span class="ap-name">${p.player}</span>
        <span class="ap-pos">${p.position}</span>
        <span class="ap-score">${p.score}</span>
        <span class="ap-value">${value}</span>
      </div>
    `;
  }).join('');

  container.innerHTML = html || '<div class="no-players">No matching players</div>';
}

function updatePlayerDatalist() {
  const datalist = document.getElementById('player-options');
  if (!datalist) return;
  const available = getAvailablePlayers();
  datalist.innerHTML = available.map(p =>
    `<option value="${p.player}">#${p.overall} ${p.player} - ${p.position}, ${p.school} (${p.score})</option>`
  ).join('');
}

function showOffBoardPreview(name) {
  const preview = document.getElementById('pick-preview');
  const slotVal = getSlotValue(currentPickNumber);
  const minScore = SCORE_PARAMS.minScore;
  const playerVal = getPlayerValue(minScore);
  const pickScore = playerVal - slotVal;
  preview.innerHTML = `
    <div class="preview-line"><strong>${name}</strong> <em>(Off Board — min value)</em></div>
    <div class="preview-line">Board Score: ${minScore} (min) | Player Value: ${playerVal.toFixed(0)}</div>
    <div class="preview-line">Slot Value: ${slotVal.toFixed(0)} | Pick Score: <span style="color:${getPickScoreColor(pickScore)};font-weight:bold">${pickScore > 0 ? '+' : ''}${pickScore.toFixed(0)} (${getPickScoreLabel(pickScore)})</span></div>
  `;
  preview.style.display = 'block';
}

function selectPlayer(overall) {
  const player = findPlayerByOverall(overall);
  if (!player) return;
  document.getElementById('player-input').value = player.player;
  document.getElementById('selected-overall').value = overall;

  const preview = document.getElementById('pick-preview');
  const slotVal = getSlotValue(currentPickNumber);
  const playerVal = getPlayerValue(player.score);
  const pickScore = playerVal - slotVal;
  preview.innerHTML = `
    <div class="preview-line"><strong>${player.player}</strong> - ${player.position}, ${player.school}</div>
    <div class="preview-line">Board Score: ${player.score} | Player Value: ${playerVal.toFixed(0)}</div>
    <div class="preview-line">Slot Value: ${slotVal.toFixed(0)} | Pick Score: <span style="color:${getPickScoreColor(pickScore)};font-weight:bold">${pickScore > 0 ? '+' : ''}${pickScore.toFixed(0)} (${getPickScoreLabel(pickScore)})</span></div>
  `;
  preview.style.display = 'block';
}

function handleSubmitPick() {
  const team = document.getElementById('team-select').value;
  const playerInput = document.getElementById('player-input').value;
  const selectedOverall = document.getElementById('selected-overall').value;

  if (!team) { alert('Select a team'); return; }
  if (!playerInput) { alert('Select a player'); return; }

  let playerOverall = null;
  let playerName = null;
  let isOffBoard = false;

  if (selectedOverall) {
    playerOverall = parseInt(selectedOverall);
  } else {
    const match = BIG_BOARD.find(p => p.player.toLowerCase() === playerInput.toLowerCase());
    if (match) {
      playerOverall = match.overall;
    } else {
      playerName = playerInput;
      isOffBoard = true;
    }
  }

  const pickData = submitPick(currentPickNumber, team, playerOverall, playerName, isOffBoard);

  if (!isFirebaseConfigured()) {
    currentPicks[currentPickNumber] = pickData;
    renderDraftBoard(currentPicks);
    if (typeof updateCharts === 'function') updateCharts(currentPicks);
  }

  // Reset form
  document.getElementById('player-input').value = '';
  document.getElementById('selected-overall').value = '';
  document.getElementById('pick-preview').style.display = 'none';
  document.getElementById('team-select')._userChanged = false;
}

function handleUndo(pickNumber) {
  if (!confirm(`Undo pick #${pickNumber}?`)) return;
  undoPick(pickNumber);

  if (!isFirebaseConfigured()) {
    delete currentPicks[pickNumber];
    renderDraftBoard(currentPicks);
    if (typeof updateCharts === 'function') updateCharts(currentPicks);
  }
}

function handleTrade(pickNumber, isEdit) {
  // For edits, the "currentTeam" is the original owner (teamFrom), not the current override
  const currentTeam = isEdit && tradeDetails[pickNumber]
    ? tradeDetails[pickNumber].teamFrom
    : getTeamForPick(pickNumber);
  const modal = document.getElementById('trade-modal');
  const content = document.getElementById('trade-modal-content');
  const slotVal = getSlotValue(pickNumber);

  // When editing, temporarily undo the existing trade so picks reappear in inventories
  let savedTrade = null;
  if (isEdit && tradeDetails[pickNumber]) {
    savedTrade = JSON.parse(JSON.stringify(tradeDetails[pickNumber]));
    const td = savedTrade;

    // Undo current pick overrides
    delete tradeOverrides[pickNumber];
    (td.picksGivenUp || []).forEach(p => { delete tradeOverrides[p]; });
    (td.picksReceived || []).forEach(p => { delete tradeOverrides[p]; });

    // Undo future pick transfers — reverse them in localStorage
    const savedFutureTrades = JSON.parse(localStorage.getItem('draft_future_trades') || '[]');
    const filteredFutureTrades = savedFutureTrades.filter(ft => {
      // Remove future trades that were part of this trade
      const isGiven = (td.futurePicksGivenUp || []).some(fp =>
        fp.year === ft.year && fp.round === ft.round && ft.from === td.teamTo && ft.to === td.teamFrom);
      const isReceived = (td.futurePicksReceived || []).some(fp =>
        fp.year === ft.year && fp.round === ft.round && ft.from === td.teamFrom && ft.to === td.teamTo);
      return !isGiven && !isReceived;
    });
    localStorage.setItem('draft_future_trades', JSON.stringify(filteredFutureTrades));

    // Remove the trade detail and rebuild inventory
    delete tradeDetails[pickNumber];
    localStorage.setItem('draft_trades', JSON.stringify(tradeOverrides));
    localStorage.setItem('draft_trade_details', JSON.stringify(tradeDetails));
    initPickInventory();
  }

  // Step 1: Select the team trading UP to this pick
  function showStep1() {
    document.getElementById('trade-modal-title').textContent = `Trade Pick #${pickNumber} (Value: ${slotVal.toFixed(0)})`;

    content.innerHTML = `
      <p class="modal-subtitle">Currently owned by <strong>${currentTeam || '?'}</strong>. Who is trading up to get this pick?</p>
      <div class="modal-team-grid" id="trade-team-grid">
        ${TEAM_ABBREVS.map(team => `
          <button class="modal-team-btn ${team === currentTeam ? 'current' : ''}" data-team="${team}"
                  style="border-color: ${TEAM_COLORS[team] || '#666'}">
            <img src="logos/${team}.png" alt="${team}" class="modal-team-logo" onerror="this.style.display='none'">
            <span>${team}</span>
          </button>
        `).join('')}
      </div>
    `;

    content.querySelectorAll('.modal-team-btn').forEach(btn => {
      btn.addEventListener('click', () => showStep2(btn.dataset.team));
    });
  }

  // Step 2: Select picks from both teams' inventories
  function showStep2(newTeam) {
    const newTeamColor = TEAM_COLORS[newTeam] || '#666';
    const currentTeamColor = TEAM_COLORS[currentTeam] || '#666';

    // Selections for the team trading UP (newTeam gives these)
    const givenCurrentPicks = new Set();
    const givenFuturePicks = []; // {year, round}
    // Selections for the team trading DOWN (currentTeam gives these, in addition to the pick itself)
    const receivedCurrentPicks = new Set();
    const receivedFuturePicks = []; // {year, round}

    // Pre-populate from saved trade when editing
    if (isEdit && savedTrade) {
      (savedTrade.picksGivenUp || []).forEach(p => givenCurrentPicks.add(p));
      (savedTrade.futurePicksGivenUp || []).forEach(fp => givenFuturePicks.push({ year: fp.year, round: fp.round, orig: fp.orig }));
      (savedTrade.picksReceived || []).forEach(p => receivedCurrentPicks.add(p));
      (savedTrade.futurePicksReceived || []).forEach(fp => receivedFuturePicks.push({ year: fp.year, round: fp.round, orig: fp.orig }));
    }

    function buildTeamChecklist(team, selectedCurrent, selectedFuture, idPrefix) {
      const available = getTeamAvailablePicks(team);
      const discount = getFutureDiscount();

      const currentPicksHtml = available.current
        .filter(p => p !== pickNumber) // exclude the pick being traded
        .map(p => {
          const round = getRoundForPick(p);
          const val = getSlotValue(p);
          const checked = selectedCurrent.has(p) ? 'checked' : '';
          return `
            <label class="trade-pick-option" data-pick="${p}">
              <input type="checkbox" class="trade-pick-cb" data-side="${idPrefix}" data-type="current" data-pick="${p}" ${checked}>
              <span class="trade-pick-info">
                <span class="trade-pick-num">#${p}</span>
                <span class="trade-pick-round">R${round}</span>
                <span class="trade-pick-val">${val.toFixed(0)}</span>
              </span>
            </label>`;
        }).join('');

      let futurePicksHtml = '';
      [2027, 2028].forEach(year => {
        const yearsOut = year - 2026;
        const picks = available.future[year] || [];
        if (picks.length === 0) return;
        const pct = Math.round(Math.pow(discount, yearsOut) * 100);
        futurePicksHtml += `<div class="trade-future-year-label">${year} Picks (${pct}% value)</div>`;
        picks.forEach(fp => {
          const round = fp.round;
          const orig = fp.orig || team;
          const origLabel = orig !== team ? ` (via ${orig})` : '';
          const val = getFuturePickValue(round, yearsOut, team, orig);
          const checked = selectedFuture.some(sf => sf.year === year && sf.round === round && (sf.orig || team) === orig) ? 'checked' : '';
          futurePicksHtml += `
            <label class="trade-pick-option future" data-year="${year}" data-round="${round}">
              <input type="checkbox" class="trade-pick-cb" data-side="${idPrefix}" data-type="future" data-year="${year}" data-round="${round}" data-orig="${orig}" ${checked}>
              <span class="trade-pick-info">
                <span class="trade-pick-num">${year} R${round}${origLabel}</span>
                <span class="trade-pick-val">~${Math.round(val)}</span>
              </span>
            </label>`;
        });
      });

      return { currentPicksHtml, futurePicksHtml };
    }

    function render() {
      const upSide = buildTeamChecklist(newTeam, givenCurrentPicks, givenFuturePicks, 'given');
      const downSide = buildTeamChecklist(currentTeam, receivedCurrentPicks, receivedFuturePicks, 'received');

      content.innerHTML = `
        <p class="modal-subtitle">
          <strong style="color:${newTeamColor}">${newTeam}</strong> acquires pick <strong>#${pickNumber}</strong> from <strong style="color:${currentTeamColor}">${currentTeam}</strong>.
        </p>
        <div class="trade-settings-row" id="tier-settings-row" style="display:none"></div>
        <div class="trade-two-sides">
          <div class="trade-side">
            <div class="trade-side-header" style="border-color:${newTeamColor}">
              <img src="logos/${newTeam}.png" alt="${newTeam}" class="modal-team-logo" onerror="this.style.display='none'">
              <strong>${newTeam} sends:</strong>
            </div>
            <div class="trade-picks-checklist" id="trade-given-checklist">
              ${upSide.currentPicksHtml || '<div class="no-picks-msg">No current-year picks</div>'}
              ${upSide.futurePicksHtml}
            </div>
          </div>
          <div class="trade-side">
            <div class="trade-side-header" style="border-color:${currentTeamColor}">
              <img src="logos/${currentTeam}.png" alt="${currentTeam}" class="modal-team-logo" onerror="this.style.display='none'">
              <strong>${currentTeam} sends:</strong>
            </div>
            <div class="trade-side-auto">Pick #${pickNumber} (${slotVal.toFixed(0)})</div>
            <div class="trade-picks-checklist" id="trade-received-checklist">
              ${downSide.currentPicksHtml || '<div class="no-picks-msg">No additional picks</div>'}
              ${downSide.futurePicksHtml}
            </div>
          </div>
        </div>
        <div class="trade-summary" id="trade-summary">
          <div class="trade-summary-empty">Select picks to see trade value</div>
        </div>
        <div class="trade-actions">
          <button class="btn-submit" id="trade-confirm" disabled>Confirm Trade</button>
          <button class="modal-cancel" id="trade-back">Back</button>
        </div>
      `;

      // Bind checkboxes
      content.querySelectorAll('.trade-pick-cb').forEach(cb => {
        cb.addEventListener('change', updatePreview);
      });

      document.getElementById('trade-confirm').addEventListener('click', handleConfirm);
      document.getElementById('trade-back').addEventListener('click', showStep1);

      updatePreview();
    }

    function updatePreview() {
      givenCurrentPicks.clear();
      givenFuturePicks.length = 0;
      receivedCurrentPicks.clear();
      receivedFuturePicks.length = 0;

      content.querySelectorAll('.trade-pick-cb:checked').forEach(cb => {
        const side = cb.dataset.side;
        if (side === 'given') {
          if (cb.dataset.type === 'current') givenCurrentPicks.add(parseInt(cb.dataset.pick));
          else givenFuturePicks.push({ year: parseInt(cb.dataset.year), round: parseInt(cb.dataset.round), orig: cb.dataset.orig });
        } else {
          if (cb.dataset.type === 'current') receivedCurrentPicks.add(parseInt(cb.dataset.pick));
          else receivedFuturePicks.push({ year: parseInt(cb.dataset.year), round: parseInt(cb.dataset.round), orig: cb.dataset.orig });
        }
      });

      const summaryEl = document.getElementById('trade-summary');
      const confirmBtn = document.getElementById('trade-confirm');
      const totalSelected = givenCurrentPicks.size + givenFuturePicks.length + receivedCurrentPicks.size + receivedFuturePicks.length;

      if (totalSelected === 0) {
        summaryEl.innerHTML = '<div class="trade-summary-empty">Select picks to see trade value</div>';
        confirmBtn.disabled = true;
        return;
      }

      confirmBtn.disabled = false;

      // Show tier settings only for orig teams of selected future picks
      const tierRow = document.getElementById('tier-settings-row');
      const allSelectedFuture = [...givenFuturePicks, ...receivedFuturePicks];
      if (allSelectedFuture.length > 0 && tierRow) {
        const tierTeams = new Set();
        allSelectedFuture.forEach(fp => { if (fp.orig) tierTeams.add(fp.orig); });
        tierRow.style.display = '';
        tierRow.innerHTML = `
          <div class="trade-settings-title">Team Strength (for future pick valuation)</div>
          ${[...tierTeams].map(team => {
            const tier = getTeamTier(team);
            const color = TEAM_COLORS[team] || '#666';
            return `
              <div class="trade-setting">
                <span class="trade-setting-label" style="color:${color}">${team}:</span>
                <div class="trade-preset-btns">
                  ${Object.entries(TEAM_TIERS).map(([key, t]) =>
                    `<button class="trade-preset-btn ${key === tier ? 'active' : ''}" data-team="${team}" data-tier="${key}">${t.label}</button>`
                  ).join('')}
                </div>
              </div>`;
          }).join('')}`;
        tierRow.querySelectorAll('.trade-preset-btn[data-tier]').forEach(btn => {
          btn.addEventListener('click', () => {
            setTeamTier(btn.dataset.team, btn.dataset.tier);
            render();
            updatePreview();
          });
        });
      } else if (tierRow) {
        tierRow.style.display = 'none';
      }

      // Calculate what newTeam sends
      let givenLines = [];
      let givenTotal = 0;
      givenCurrentPicks.forEach(p => {
        const v = getSlotValue(p);
        givenTotal += v;
        givenLines.push(`#${p} (${v.toFixed(0)})`);
      });
      givenFuturePicks.forEach(fp => {
        const v = getFuturePickValue(fp.round, fp.year - 2026, newTeam, fp.orig);
        givenTotal += v;
        const origLabel = fp.orig && fp.orig !== newTeam ? ` via ${fp.orig}` : '';
        givenLines.push(`${fp.year} R${fp.round}${origLabel} (~${Math.round(v)})`);
      });

      // Calculate what currentTeam sends (pick + extras)
      let receivedLines = [`#${pickNumber} (${slotVal.toFixed(0)})`];
      let receivedTotal = slotVal;
      receivedCurrentPicks.forEach(p => {
        const v = getSlotValue(p);
        receivedTotal += v;
        receivedLines.push(`#${p} (${v.toFixed(0)})`);
      });
      receivedFuturePicks.forEach(fp => {
        const v = getFuturePickValue(fp.round, fp.year - 2026, currentTeam, fp.orig);
        receivedTotal += v;
        const origLabel = fp.orig && fp.orig !== currentTeam ? ` via ${fp.orig}` : '';
        receivedLines.push(`${fp.year} R${fp.round}${origLabel} (~${Math.round(v)})`);
      });

      const tradeCost = givenTotal - receivedTotal;
      const costColor = tradeCost > 0 ? 'var(--btn-danger)' : 'var(--text-value)';

      summaryEl.innerHTML = `
        <div class="trade-summary-line"><strong>${newTeam}</strong> sends: ${givenLines.join(' + ')} = <strong>${Math.round(givenTotal)}</strong></div>
        <div class="trade-summary-line"><strong>${currentTeam}</strong> sends: ${receivedLines.join(' + ')} = <strong>${Math.round(receivedTotal)}</strong></div>
        <div class="trade-summary-line">Net for ${newTeam}: <strong style="color:${costColor}">${tradeCost > 0 ? '+' : ''}${Math.round(tradeCost)}</strong>
          ${tradeCost > 0 ? '(overpay)' : tradeCost < 0 ? '(bargain)' : '(even)'}
        </div>
      `;
    }

    function handleConfirm() {
      const picksGiven = [...givenCurrentPicks];
      const picksReceived = [...receivedCurrentPicks];

      // Save trade override — newTeam gets the pick
      tradeOverrides[pickNumber] = newTeam;

      // Reassign current picks that change hands
      picksGiven.forEach(p => { tradeOverrides[p] = currentTeam; });
      picksReceived.forEach(p => { tradeOverrides[p] = newTeam; });
      localStorage.setItem('draft_trades', JSON.stringify(tradeOverrides));

      // Save trade details
      tradeDetails[pickNumber] = {
        teamFrom: currentTeam,
        teamTo: newTeam,
        picksGivenUp: picksGiven,
        futurePicksGivenUp: givenFuturePicks.map(fp => ({ year: fp.year, round: fp.round, orig: fp.orig })),
        picksReceived: picksReceived,
        futurePicksReceived: receivedFuturePicks.map(fp => ({ year: fp.year, round: fp.round, orig: fp.orig })),
      };
      localStorage.setItem('draft_trade_details', JSON.stringify(tradeDetails));

      // Transfer future picks
      givenFuturePicks.forEach(fp => { transferFuturePick(newTeam, currentTeam, fp.year, fp.round); });
      receivedFuturePicks.forEach(fp => { transferFuturePick(currentTeam, newTeam, fp.year, fp.round); });

      if (typeof db !== 'undefined' && db) {
        db.ref(`trades/${pickNumber}`).set(newTeam);
        db.ref(`tradeDetails/${pickNumber}`).set(tradeDetails[pickNumber]);
        picksGiven.forEach(p => db.ref(`trades/${p}`).set(currentTeam));
        picksReceived.forEach(p => db.ref(`trades/${p}`).set(newTeam));
      }

      // Sync trades to Firebase and rebuild
      syncTrades();
      initPickInventory();
      modal.style.display = 'none';
      renderDraftBoard(currentPicks);
    }

    render();
  }

  if (isEdit && tradeDetails[pickNumber]) {
    showStep2(tradeDetails[pickNumber].teamTo);
  } else {
    showStep1();
  }
  modal.style.display = 'flex';

  function cancelTrade() {
    modal.style.display = 'none';
    // If we were editing, restore the original trade
    if (savedTrade) {
      tradeDetails[pickNumber] = savedTrade;
      tradeOverrides[pickNumber] = savedTrade.teamTo;
      (savedTrade.picksGivenUp || []).forEach(p => { tradeOverrides[p] = savedTrade.teamFrom; });
      (savedTrade.picksReceived || []).forEach(p => { tradeOverrides[p] = savedTrade.teamTo; });
      localStorage.setItem('draft_trades', JSON.stringify(tradeOverrides));
      localStorage.setItem('draft_trade_details', JSON.stringify(tradeDetails));
      // Re-add future pick transfers
      const ft = JSON.parse(localStorage.getItem('draft_future_trades') || '[]');
      (savedTrade.futurePicksGivenUp || []).forEach(fp => {
        ft.push({ from: savedTrade.teamTo, to: savedTrade.teamFrom, year: fp.year, round: fp.round, orig: fp.orig });
      });
      (savedTrade.futurePicksReceived || []).forEach(fp => {
        ft.push({ from: savedTrade.teamFrom, to: savedTrade.teamTo, year: fp.year, round: fp.round, orig: fp.orig });
      });
      localStorage.setItem('draft_future_trades', JSON.stringify(ft));
      syncTrades();
      initPickInventory();
      renderDraftBoard(currentPicks);
    }
  }

  document.getElementById('trade-cancel').onclick = cancelTrade;
  modal.onclick = (e) => { if (e.target === modal) cancelTrade(); };
}

function handleResetDraft() {
  if (!confirm('Reset entire draft? This cannot be undone.')) return;
  resetDraft();
  tradeOverrides = {};
  tradeDetails = {};
  currentPicks = {};
  localStorage.removeItem('draft_trades');
  localStorage.removeItem('draft_trade_details');
  localStorage.removeItem('draft_future_trades');
  localStorage.removeItem('draft_team_tiers');
  resetPickInventory();
  renderDraftBoard({});
  if (typeof updateCharts === 'function') updateCharts({});
}
