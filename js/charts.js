let pickScoreChart = null;
let teamSummaryChart = null;
let capitalChart = null;
let tradeValueChart = null;
let chartData = [];
let selectedRounds = new Set([1, 2, 3, 4, 5, 6, 7]);

const NAME_SUFFIXES = new Set(['Jr', 'Jr.', 'Sr', 'Sr.', 'II', 'III', 'IV', 'V']);
function shortenPlayerName(full) {
  if (!full) return '';
  const parts = full.split(/\s+/).filter(Boolean);
  while (parts.length > 1 && NAME_SUFFIXES.has(parts[parts.length - 1])) {
    parts.pop();
  }
  if (parts.length <= 1) return full;
  return parts[0][0] + '.' + parts[parts.length - 1];
}

function getThemeColors() {
  const s = getComputedStyle(document.body);
  return {
    grid: s.getPropertyValue('--grid-line').trim(),
    text: s.getPropertyValue('--chart-text').trim(),
    tick: s.getPropertyValue('--chart-tick').trim(),
    muted: s.getPropertyValue('--text-muted').trim(),
    zero: document.body.classList.contains('light') ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.3)',
    mean: 'rgba(128,128,128,0.4)',
    labelColor: document.body.classList.contains('light') ? '#000' : '#fff',
  };
}

function updateCharts(picks) {
  chartData = [];
  for (const [pickNum, pick] of Object.entries(picks)) {
    const player = findPlayerForPick(pick);
    if (!player) continue;
    const pNum = parseInt(pickNum);
    const round = getRoundForPick(pNum);
    const pickScore = getPickScore(pNum, player.score);
    chartData.push({
      x: pickScore,
      y: player.score,
      label: player.player,
      team: pick.team,
      pick: pNum,
      round: round,
      color: TEAM_COLORS[pick.team] || '#666',
    });
  }

  const activePanel = document.querySelector('.chart-panel.active');
  if (activePanel) renderActiveChart(activePanel.id);
}

function renderActiveChart(panelId) {
  if (panelId === 'chart-pick-score') updatePickScoreChart();
  else if (panelId === 'chart-team-summary') updateTeamSummaryChart();
  else if (panelId === 'chart-draft-grades') updateDraftGrades();
  else if (panelId === 'chart-capital') updateCapitalChart();
  else if (panelId === 'chart-trade-value') updateTradeValueChart();
}

function getFilteredChartData() {
  return chartData.filter(d => selectedRounds.has(d.round));
}

function updatePickScoreChart() {
  const canvas = document.getElementById('pick-score-chart');
  if (!canvas) return;

  const filtered = getFilteredChartData();
  if (!filtered.length) {
    if (pickScoreChart) pickScoreChart.destroy();
    pickScoreChart = null;
    return;
  }

  // Preload logos
  const logoImages = {};
  const uniqueTeams = [...new Set(filtered.map(d => d.team))];
  const promises = uniqueTeams.map(team => {
    const img = new Image();
    img.src = `logos/${team}.png`;
    return new Promise(resolve => {
      img.onload = () => { logoImages[team] = img; resolve(); };
      img.onerror = () => resolve();
    });
  });

  Promise.all(promises).then(() => {
    if (pickScoreChart) pickScoreChart.destroy();

    const tc = getThemeColors();
    const meanX = filtered.reduce((s, d) => s + d.x, 0) / filtered.length;

    // Scale markers to point count so a full round doesn't overlap
    const n = filtered.length;
    const pointRadius = n <= 10 ? 20 : n <= 24 ? 16 : n <= 48 ? 12 : 9;
    const logoSize = Math.round(pointRadius * 1.4);
    const fontSize = n <= 24 ? 10 : n <= 48 ? 9 : 8;
    const labelOffset = pointRadius + 2;

    pickScoreChart = new Chart(canvas, {
      type: 'scatter',
      data: {
        datasets: [{
          data: filtered.map(d => ({ x: d.x, y: d.y })),
          pointBackgroundColor: filtered.map(d => d.color),
          pointBorderColor: 'rgba(255,255,255,0.3)',
          pointBorderWidth: 1,
          pointRadius: pointRadius,
          pointHoverRadius: pointRadius + 4,
        }]
      },
      plugins: [{
        id: 'teamLogos',
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          const meta = chart.getDatasetMeta(0);
          const chartArea = chart.chartArea;
          ctx.save();

          // First pass: draw logos / point fills
          meta.data.forEach((point, i) => {
            const d = filtered[i];
            if (!d) return;
            const logo = logoImages[d.team];
            const half = logoSize / 2;
            if (logo) {
              ctx.drawImage(logo, point.x - half, point.y - half, logoSize, logoSize);
            } else {
              ctx.fillStyle = '#fff';
              ctx.font = `bold ${fontSize}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(d.team, point.x, point.y);
            }
          });

          // Second pass: place labels. Labels collide with other labels AND with
          // point markers, so crowded clusters push labels outward until they
          // find free space. Try 8 directions at growing distances; if the
          // chosen position is far from the point, draw a leader line.
          ctx.font = `bold ${fontSize}px sans-serif`;
          const pad = 2;

          // Seed occupancy with every point's marker region so labels don't
          // land on top of neighboring points.
          const placed = meta.data.map(pt => ({
            x: pt.x - logoSize / 2 - pad,
            y: pt.y - logoSize / 2 - pad,
            w: logoSize + 2 * pad,
            h: logoSize + 2 * pad,
          }));

          // 8 unit-vector directions around the point
          const directions = [
            { ux:  1, uy:  0, align: 'left',   baseline: 'middle' },
            { ux: -1, uy:  0, align: 'right',  baseline: 'middle' },
            { ux:  0.71, uy: -0.71, align: 'left',   baseline: 'bottom' },
            { ux: -0.71, uy: -0.71, align: 'right',  baseline: 'bottom' },
            { ux:  0.71, uy:  0.71, align: 'left',   baseline: 'top'    },
            { ux: -0.71, uy:  0.71, align: 'right',  baseline: 'top'    },
            { ux:  0, uy: -1, align: 'center', baseline: 'bottom' },
            { ux:  0, uy:  1, align: 'center', baseline: 'top'    },
          ];

          // Distances to try (in multiples of labelOffset). Reach far when the
          // cluster is dense.
          const distanceSteps = [1, 1.8, 3, 4.5, 6.5, 9, 12];

          function labelBox(px, py, w, h, dx, dy, align, baseline) {
            let x;
            if (align === 'left') x = px + dx;
            else if (align === 'right') x = px + dx - w;
            else x = px + dx - w / 2;
            let y;
            if (baseline === 'top') y = py + dy;
            else if (baseline === 'bottom') y = py + dy - h;
            else y = py + dy - h / 2;
            return { x: x - pad, y: y - pad, w: w + 2 * pad, h: h + 2 * pad };
          }

          function rectsOverlap(a, b) {
            return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
          }

          function inBounds(b) {
            return b.x >= chartArea.left && b.x + b.w <= chartArea.right &&
                   b.y >= chartArea.top  && b.y + b.h <= chartArea.bottom;
          }

          // Place points with the most extreme x first (edges are easier), leaving
          // the crowded center for last where space is tightest.
          const order = meta.data.map((pt, i) => ({ pt, i }))
            .filter(o => filtered[o.i] && filtered[o.i].label)
            .sort((a, b) => Math.abs(filtered[b.i].x) - Math.abs(filtered[a.i].x));

          for (const { pt, i } of order) {
            const d = filtered[i];
            const text = shortenPlayerName(d.label);
            const w = ctx.measureText(text).width;
            const h = fontSize;

            let chosen = null;
            // Try each distance step, sweeping all 8 directions at that distance,
            // so near placements are preferred over far ones.
            outer: for (const step of distanceSteps) {
              for (const dir of directions) {
                const dx = dir.ux * labelOffset * step;
                const dy = dir.uy * labelOffset * step;
                const box = labelBox(pt.x, pt.y, w, h, dx, dy, dir.align, dir.baseline);
                if (!inBounds(box)) continue;
                if (placed.some(p => rectsOverlap(p, box))) continue;
                chosen = { dx, dy, dir, box, step };
                break outer;
              }
            }
            if (!chosen) {
              const dir = directions[0];
              const dx = dir.ux * labelOffset, dy = dir.uy * labelOffset;
              chosen = { dx, dy, dir, box: labelBox(pt.x, pt.y, w, h, dx, dy, dir.align, dir.baseline), step: 1 };
            }

            // Leader line for labels placed more than one step away
            if (chosen.step > 1) {
              ctx.strokeStyle = tc.muted || 'rgba(128,128,128,0.5)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              // Start line at edge of the marker, end near the label box
              const len = Math.hypot(chosen.dx, chosen.dy);
              const sx = pt.x + (chosen.dx / len) * (logoSize / 2);
              const sy = pt.y + (chosen.dy / len) * (logoSize / 2);
              const ex = pt.x + chosen.dx - (chosen.dx / len) * 2;
              const ey = pt.y + chosen.dy - (chosen.dy / len) * 2;
              ctx.moveTo(sx, sy);
              ctx.lineTo(ex, ey);
              ctx.stroke();
            }

            ctx.fillStyle = tc.labelColor;
            ctx.textAlign = chosen.dir.align;
            ctx.textBaseline = chosen.dir.baseline;
            ctx.fillText(text, pt.x + chosen.dx, pt.y + chosen.dy);
            placed.push(chosen.box);
          }

          ctx.restore();
        }
      }],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const d = filtered[ctx.dataIndex];
                return `${d.label} (${d.team}) R${d.round} Pick #${d.pick} | Score: ${d.x > 0 ? '+' : ''}${d.x.toFixed(0)}`;
              }
            }
          },
          annotation: {
            annotations: {
              meanX: {
                type: 'line', xMin: meanX, xMax: meanX,
                borderColor: tc.mean, borderDash: [5, 5], borderWidth: 1,
              },
              zeroLine: {
                type: 'line', xMin: 0, xMax: 0,
                borderColor: tc.zero, borderWidth: 2,
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: 'Pick Score (+ = Good Value, - = Reach)', color: tc.text, font: { size: 14 } },
            grid: { color: tc.grid },
            ticks: { color: tc.tick },
          },
          y: {
            title: { display: true, text: 'Big Board Score', color: tc.text, font: { size: 14 } },
            grid: { color: tc.grid },
            ticks: { color: tc.tick },
          }
        }
      }
    });
  });
}

function updateTeamSummaryChart() {
  const canvas = document.getElementById('team-summary-chart');
  if (!canvas) return;

  const filtered = getFilteredChartData();

  const teamScores = {};
  for (const d of filtered) {
    if (!teamScores[d.team]) teamScores[d.team] = { total: 0, picks: 0 };
    teamScores[d.team].total += d.x;
    teamScores[d.team].picks++;
  }

  const sorted = Object.entries(teamScores).sort((a, b) => b[1].total - a[1].total);
  if (!sorted.length) {
    if (teamSummaryChart) teamSummaryChart.destroy();
    teamSummaryChart = null;
    return;
  }

  if (teamSummaryChart) teamSummaryChart.destroy();

  // Set canvas container height to fit all teams
  const minHeight = sorted.length * 28 + 80;
  canvas.parentElement.style.minHeight = minHeight + 'px';
  canvas.style.height = Math.max(minHeight, canvas.parentElement.offsetHeight) + 'px';

  const tc = getThemeColors();
  teamSummaryChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: sorted.map(([team]) => team),
      datasets: [{
        data: sorted.map(([, s]) => Math.round(s.total)),
        backgroundColor: sorted.map(([team]) => TEAM_COLORS[team] || '#666'),
        borderColor: sorted.map(([team]) => TEAM_COLORS[team] || '#666'),
        borderWidth: 1,
        barThickness: Math.max(12, Math.min(24, Math.floor(500 / sorted.length))),
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { left: 40 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const [team, s] = sorted[ctx.dataIndex];
              return `${team}: ${s.total > 0 ? '+' : ''}${Math.round(s.total)} (${s.picks} pick${s.picks > 1 ? 's' : ''})`;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Total Pick Score', color: tc.text, font: { size: 13 } },
          grid: { color: tc.grid },
          ticks: { color: tc.tick },
        },
        y: {
          ticks: { color: tc.text, font: { size: 11, weight: 'bold' }, autoSkip: false },
          grid: { display: false },
        }
      }
    }
  });
}

// ── Draft Grades ──
function getDraftGrade(surplus) {
  if (surplus >= 400) return { letter: 'A+', color: '#1a7a1a' };
  if (surplus >= 250) return { letter: 'A',  color: '#2d9e2d' };
  if (surplus >= 100) return { letter: 'B+', color: '#5cb85c' };
  if (surplus >= 0)   return { letter: 'B',  color: '#8bc34a' };
  if (surplus >= -100) return { letter: 'C+', color: '#f0ad4e' };
  if (surplus >= -200) return { letter: 'C',  color: '#e87c3a' };
  if (surplus >= -350) return { letter: 'D',  color: '#d9534f' };
  return { letter: 'F', color: '#a00' };
}

function updateDraftGrades() {
  const container = document.getElementById('draft-grades-container');
  if (!container) return;

  const filtered = getFilteredChartData();
  const teamScores = {};
  for (const d of filtered) {
    if (!teamScores[d.team]) teamScores[d.team] = { total: 0, picks: 0, weighted: 0 };
    // Weight earlier picks more: slot value as weight
    const slotVal = getSlotValue(d.pick);
    teamScores[d.team].total += d.x;
    teamScores[d.team].picks++;
    teamScores[d.team].weighted += d.x * (slotVal / 1000); // normalize weight
  }

  const sorted = Object.entries(teamScores).sort((a, b) => b[1].weighted - a[1].weighted);

  if (!sorted.length) {
    container.innerHTML = '<div class="no-picks-msg">No picks yet</div>';
    return;
  }

  const html = sorted.map(([team, s]) => {
    const grade = getDraftGrade(s.weighted);
    const teamColor = TEAM_COLORS[team] || '#666';
    const avg = s.picks > 0 ? (s.total / s.picks).toFixed(0) : 0;
    return `
      <div class="grade-card" data-team="${team}" title="Click for full report">
        <div class="grade-letter" style="background:${grade.color}">${grade.letter}</div>
        <div class="grade-team" style="border-left:4px solid ${teamColor}">
          <img src="logos/${team}.png" alt="${team}" class="team-logo" onerror="this.style.display='none'">
          <strong>${team}</strong>
        </div>
        <div class="grade-stats">
          <span>Surplus: <strong style="color:${s.total >= 0 ? 'var(--text-value)' : 'var(--btn-danger)'}">${s.total > 0 ? '+' : ''}${Math.round(s.total)}</strong></span>
          <span>Avg: ${avg > 0 ? '+' : ''}${avg}</span>
          <span>${s.picks} pick${s.picks !== 1 ? 's' : ''}</span>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = html;

  container.querySelectorAll('.grade-card[data-team]').forEach(card => {
    card.addEventListener('click', () => openTeamReport(card.dataset.team));
  });
}

// ── Team Draft Report ──
function computeTeamReport(team) {
  // Picks this team made
  const madePicks = [];
  for (const [pickStr, pick] of Object.entries(currentPicks)) {
    if (pick.team !== team) continue;
    const pNum = parseInt(pickStr);
    const player = findPlayerForPick(pick);
    const slotVal = getSlotValue(pNum);
    const effScore = player ? player.score : SCORE_PARAMS.minScore;
    const playerVal = getPlayerValue(effScore);
    const pickScore = playerVal - slotVal;
    madePicks.push({
      pickNum: pNum,
      round: getRoundForPick(pNum),
      player,
      playerName: player ? player.player : (pick.playerName || 'Off Board'),
      offBoard: !player,
      slotVal,
      playerVal,
      pickScore,
    });
  }
  madePicks.sort((a, b) => a.pickNum - b.pickNum);

  // Trades involving this team
  const trades = [];
  for (const [pickStr, trade] of Object.entries(tradeDetails)) {
    const { teamFrom, teamTo } = trade;
    if (teamFrom !== team && teamTo !== team) continue;
    const pNum = parseInt(pickStr);

    let givenUpValue = 0;
    (trade.picksGivenUp || []).forEach(p => { givenUpValue += getSlotValue(p); });
    (trade.futurePicksGivenUp || []).forEach(fp => {
      givenUpValue += getFuturePickValue(fp.round, fp.year - 2026, teamTo, fp.orig);
    });
    let receivedValue = getSlotValue(pNum);
    (trade.picksReceived || []).forEach(p => { receivedValue += getSlotValue(p); });
    (trade.futurePicksReceived || []).forEach(fp => {
      receivedValue += getFuturePickValue(fp.round, fp.year - 2026, teamFrom, fp.orig);
    });

    const isAcquirer = teamTo === team;
    // Net from this team's perspective: positive = this team gained value
    const net = isAcquirer ? (receivedValue - givenUpValue) : (givenUpValue - receivedValue);
    trades.push({
      pickNum: pNum,
      role: isAcquirer ? 'acquired' : 'traded away',
      counterparty: isAcquirer ? teamFrom : teamTo,
      sent: isAcquirer
        ? [...(trade.picksGivenUp || []).map(p => `#${p}`), ...(trade.futurePicksGivenUp || []).map(fp => `'${(fp.year+'').slice(2)} R${fp.round}${fp.orig && fp.orig !== team ? ' via ' + fp.orig : ''}`)]
        : [`#${pNum}`, ...(trade.picksReceived || []).map(p => `#${p}`), ...(trade.futurePicksReceived || []).map(fp => `'${(fp.year+'').slice(2)} R${fp.round}${fp.orig && fp.orig !== team ? ' via ' + fp.orig : ''}`)],
      received: isAcquirer
        ? [`#${pNum}`, ...(trade.picksReceived || []).map(p => `#${p}`), ...(trade.futurePicksReceived || []).map(fp => `'${(fp.year+'').slice(2)} R${fp.round}${fp.orig && fp.orig !== team ? ' via ' + fp.orig : ''}`)]
        : [...(trade.picksGivenUp || []).map(p => `#${p}`), ...(trade.futurePicksGivenUp || []).map(fp => `'${(fp.year+'').slice(2)} R${fp.round}${fp.orig && fp.orig !== team ? ' via ' + fp.orig : ''}`)],
      sentTotal: isAcquirer ? givenUpValue : receivedValue,
      receivedTotal: isAcquirer ? receivedValue : givenUpValue,
      net,
    });
  }
  trades.sort((a, b) => a.pickNum - b.pickNum);

  // Remaining picks (current + future)
  const inv = getTeamAvailablePicks(team);

  // Totals
  const totalSurplus = madePicks.reduce((s, p) => s + p.pickScore, 0);
  const tradeNet = trades.reduce((s, t) => s + t.net, 0);
  const weighted = madePicks.reduce((s, p) => s + p.pickScore * (p.slotVal / 1000), 0);
  const grade = getDraftGrade(weighted);

  return { team, madePicks, trades, inv, totalSurplus, tradeNet, weighted, grade };
}

function openTeamReport(team) {
  const modal = document.getElementById('team-report-modal');
  const content = document.getElementById('team-report-content');
  const r = computeTeamReport(team);
  const teamColor = TEAM_COLORS[team] || '#666';

  const picksRows = r.madePicks.length ? r.madePicks.map(p => {
    const color = getPickScoreColor(p.pickScore);
    const label = `${p.pickScore > 0 ? '+' : ''}${Math.round(p.pickScore)}`;
    const details = p.offBoard
      ? '<em>Off Board (min value)</em>'
      : `${p.player.position} - ${p.player.school} | Score ${p.player.score}${p.player.posRank ? ' | ' + p.player.posRank : ''}`;
    return `
      <tr>
        <td>#${p.pickNum}</td>
        <td>R${p.round}</td>
        <td><strong>${p.playerName}</strong><div class="report-sub">${details}</div></td>
        <td class="num">${p.slotVal.toFixed(0)}</td>
        <td class="num">${p.playerVal.toFixed(0)}</td>
        <td class="num" style="color:${color};font-weight:bold">${label}</td>
      </tr>`;
  }).join('') : `<tr><td colspan="6" class="report-empty">No picks yet</td></tr>`;

  const tradesRows = r.trades.length ? r.trades.map(t => {
    const cpColor = TEAM_COLORS[t.counterparty] || '#666';
    const netColor = t.net > 0 ? 'var(--text-value)' : t.net < 0 ? 'var(--btn-danger)' : 'var(--text-secondary)';
    return `
      <tr>
        <td>#${t.pickNum}</td>
        <td>${t.role} <span style="color:${cpColor}">${t.counterparty}</span></td>
        <td>Sent: ${t.sent.join(', ') || '—'} <span class="report-sub">(${Math.round(t.sentTotal)})</span></td>
        <td>Got: ${t.received.join(', ') || '—'} <span class="report-sub">(${Math.round(t.receivedTotal)})</span></td>
        <td class="num" style="color:${netColor};font-weight:bold">${t.net > 0 ? '+' : ''}${Math.round(t.net)}</td>
      </tr>`;
  }).join('') : `<tr><td colspan="5" class="report-empty">No trades</td></tr>`;

  const remainingCurrent = inv => inv.current.map(p => `#${p} (R${getRoundForPick(p)}, ${Math.round(getSlotValue(p))})`).join(', ');
  const remainingFuture = (year, inv) => {
    const picks = inv.future[year] || [];
    if (!picks.length) return '';
    const yearsOut = year - 2026;
    return picks.map(fp => {
      const via = fp.orig && fp.orig !== team ? ` via ${fp.orig}` : '';
      const v = Math.round(getFuturePickValue(fp.round, yearsOut, team, fp.orig));
      return `${year} R${fp.round}${via} (~${v})`;
    }).join(', ');
  };
  const capital = Math.round(getTeamDraftCapital(team));

  content.innerHTML = `
    <div class="team-report-header" style="border-color:${teamColor}">
      <div class="team-report-grade" style="background:${r.grade.color}">${r.grade.letter}</div>
      <div class="team-report-title">
        <img src="logos/${team}.png" alt="${team}" onerror="this.style.display='none'">
        <h2 style="color:${teamColor}">${team} Draft Report</h2>
      </div>
      <div class="team-report-summary">
        <div><span class="report-label">Picks made</span><strong>${r.madePicks.length}</strong></div>
        <div><span class="report-label">Pick surplus</span><strong style="color:${r.totalSurplus >= 0 ? 'var(--text-value)' : 'var(--btn-danger)'}">${r.totalSurplus > 0 ? '+' : ''}${Math.round(r.totalSurplus)}</strong></div>
        <div><span class="report-label">Trade net</span><strong style="color:${r.tradeNet >= 0 ? 'var(--text-value)' : 'var(--btn-danger)'}">${r.tradeNet > 0 ? '+' : ''}${Math.round(r.tradeNet)}</strong></div>
        <div><span class="report-label">Remaining capital</span><strong>${capital.toLocaleString()}</strong></div>
      </div>
    </div>

    <section class="report-section">
      <h3>Picks</h3>
      <table class="report-table">
        <thead><tr><th>#</th><th>R</th><th>Player</th><th class="num">Slot</th><th class="num">Value</th><th class="num">Score</th></tr></thead>
        <tbody>${picksRows}</tbody>
      </table>
    </section>

    <section class="report-section">
      <h3>Trades</h3>
      <table class="report-table">
        <thead><tr><th>Pick</th><th>Action</th><th>Sent</th><th>Received</th><th class="num">Net</th></tr></thead>
        <tbody>${tradesRows}</tbody>
      </table>
    </section>

    <section class="report-section">
      <h3>Remaining Draft Capital</h3>
      <div class="report-list">
        <div><strong>2026 current:</strong> ${remainingCurrent(r.inv) || '<em>None</em>'}</div>
        ${remainingFuture(2027, r.inv) ? `<div><strong>2027:</strong> ${remainingFuture(2027, r.inv)}</div>` : ''}
        ${remainingFuture(2028, r.inv) ? `<div><strong>2028:</strong> ${remainingFuture(2028, r.inv)}</div>` : ''}
      </div>
    </section>
  `;

  modal.style.display = 'flex';
}

function closeTeamReport() {
  document.getElementById('team-report-modal').style.display = 'none';
}

// ── Draft Capital Remaining ──
function updateCapitalChart() {
  const canvas = document.getElementById('capital-chart');
  if (!canvas) return;

  const teamCapitals = [];
  for (const team of TEAM_ABBREVS) {
    const capital = getTeamDraftCapital(team);
    if (capital > 0) teamCapitals.push({ team, capital });
  }

  teamCapitals.sort((a, b) => b.capital - a.capital);

  if (!teamCapitals.length) {
    if (capitalChart) capitalChart.destroy();
    capitalChart = null;
    return;
  }

  if (capitalChart) capitalChart.destroy();

  const barSize = 22;
  const minHeight = teamCapitals.length * (barSize + 10) + 80;
  canvas.parentElement.style.minHeight = minHeight + 'px';
  canvas.style.height = Math.max(minHeight, canvas.parentElement.offsetHeight) + 'px';

  const tc = getThemeColors();
  capitalChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: teamCapitals.map(d => d.team),
      datasets: [{
        data: teamCapitals.map(d => Math.round(d.capital)),
        backgroundColor: teamCapitals.map(d => TEAM_COLORS[d.team] || '#666'),
        borderColor: teamCapitals.map(d => TEAM_COLORS[d.team] || '#666'),
        borderWidth: 1,
        barThickness: barSize,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const d = teamCapitals[ctx.dataIndex];
              return `${d.team}: ${Math.round(d.capital).toLocaleString()} total value`;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Remaining Draft Capital (Fitz Value)', color: tc.text, font: { size: 13 } },
          grid: { color: tc.grid },
          ticks: { color: tc.tick },
        },
        y: {
          ticks: { color: tc.text, font: { size: 11, weight: 'bold' }, autoSkip: false },
          grid: { display: false },
        }
      }
    }
  });
}

// ── Trade Value by Team ──
function updateTradeValueChart() {
  const canvas = document.getElementById('trade-value-chart');
  if (!canvas) return;

  // For each trade, compute net value for both teams
  const teamTradeValue = {};

  for (const [pickStr, trade] of Object.entries(tradeDetails)) {
    const pickNum = parseInt(pickStr);
    const { teamFrom, teamTo } = trade;
    if (!teamFrom || !teamTo) continue;

    // What teamTo (acquiring team) sent
    let sentValue = 0;
    if (trade.picksGivenUp?.length) {
      sentValue += trade.picksGivenUp.reduce((s, p) => s + getSlotValue(p), 0);
    }
    if (trade.futurePicksGivenUp?.length) {
      sentValue += trade.futurePicksGivenUp.reduce((s, fp) => s + getFuturePickValue(fp.round, fp.year - 2026, teamTo, fp.orig), 0);
    }

    // What teamFrom (trading down team) sent (the pick + any extras)
    let receivedValue = getSlotValue(pickNum);
    if (trade.picksReceived?.length) {
      receivedValue += trade.picksReceived.reduce((s, p) => s + getSlotValue(p), 0);
    }
    if (trade.futurePicksReceived?.length) {
      receivedValue += trade.futurePicksReceived.reduce((s, fp) => s + getFuturePickValue(fp.round, fp.year - 2026, teamFrom, fp.orig), 0);
    }

    // teamTo net = what they received - what they sent
    const teamToNet = receivedValue - sentValue;
    // teamFrom net = what they received - what they sent
    const teamFromNet = sentValue - receivedValue;

    if (!teamTradeValue[teamTo]) teamTradeValue[teamTo] = { net: 0, trades: 0 };
    teamTradeValue[teamTo].net += teamToNet;
    teamTradeValue[teamTo].trades++;

    if (!teamTradeValue[teamFrom]) teamTradeValue[teamFrom] = { net: 0, trades: 0 };
    teamTradeValue[teamFrom].net += teamFromNet;
    teamTradeValue[teamFrom].trades++;
  }

  const sorted = Object.entries(teamTradeValue).sort((a, b) => b[1].net - a[1].net);

  if (!sorted.length) {
    if (tradeValueChart) tradeValueChart.destroy();
    tradeValueChart = null;
    canvas.parentElement.querySelector('.no-trades-msg')?.remove();
    const msg = document.createElement('div');
    msg.className = 'no-trades-msg';
    msg.textContent = 'No trades yet';
    msg.style.cssText = 'color:var(--text-secondary);font-style:italic;padding:40px;text-align:center;';
    canvas.parentElement.appendChild(msg);
    return;
  }

  canvas.parentElement.querySelector('.no-trades-msg')?.remove();

  if (tradeValueChart) tradeValueChart.destroy();

  const minHeight = sorted.length * 32 + 80;
  canvas.parentElement.style.minHeight = minHeight + 'px';
  canvas.style.height = Math.max(minHeight, canvas.parentElement.offsetHeight) + 'px';

  const tc = getThemeColors();
  tradeValueChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: sorted.map(([team]) => team),
      datasets: [{
        data: sorted.map(([, s]) => Math.round(s.net)),
        backgroundColor: sorted.map(([, s]) => s.net >= 0 ? 'rgba(92,184,92,0.7)' : 'rgba(217,83,79,0.7)'),
        borderColor: sorted.map(([, s]) => s.net >= 0 ? '#5cb85c' : '#d9534f'),
        borderWidth: 1,
        barThickness: 22,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const [team, s] = sorted[ctx.dataIndex];
              return `${team}: ${s.net > 0 ? '+' : ''}${Math.round(s.net)} value (${s.trades} trade${s.trades !== 1 ? 's' : ''})`;
            }
          }
        },
        annotation: {
          annotations: {
            zeroLine: {
              type: 'line', xMin: 0, xMax: 0,
              borderColor: tc.zero || 'rgba(255,255,255,0.3)', borderWidth: 2,
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Net Trade Value (+ = gained value)', color: tc.text, font: { size: 13 } },
          grid: { color: tc.grid },
          ticks: { color: tc.tick },
        },
        y: {
          ticks: { color: tc.text, font: { size: 11, weight: 'bold' }, autoSkip: false },
          grid: { display: false },
        }
      }
    }
  });
}

// Round filter handling
function initRoundFilters() {
  const container = document.getElementById('round-filters');
  if (!container) return;
  for (let r = 1; r <= 7; r++) {
    const label = document.createElement('label');
    label.className = 'round-filter';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.value = r;
    cb.addEventListener('change', () => {
      if (cb.checked) selectedRounds.add(r);
      else selectedRounds.delete(r);
      const activePanel = document.querySelector('.chart-panel.active');
      if (activePanel) renderActiveChart(activePanel.id);
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(` R${r}`));
    container.appendChild(label);
  }
}
