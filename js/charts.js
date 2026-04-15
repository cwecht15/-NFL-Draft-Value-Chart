let pickScoreChart = null;
let teamSummaryChart = null;
let capitalChart = null;
let tradeValueChart = null;
let chartData = [];
let selectedRounds = new Set([1, 2, 3, 4, 5, 6, 7]);

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
    if (!pick.playerOverall) continue;
    const player = findPlayerByOverall(pick.playerOverall);
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

    pickScoreChart = new Chart(canvas, {
      type: 'scatter',
      data: {
        datasets: [{
          data: filtered.map(d => ({ x: d.x, y: d.y })),
          pointBackgroundColor: filtered.map(d => d.color),
          pointBorderColor: 'rgba(255,255,255,0.3)',
          pointBorderWidth: 1,
          pointRadius: 20,
          pointHoverRadius: 24,
        }]
      },
      plugins: [{
        id: 'teamLogos',
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          const meta = chart.getDatasetMeta(0);
          ctx.save();
          meta.data.forEach((point, i) => {
            const d = filtered[i];
            if (!d) return;
            const logo = logoImages[d.team];
            if (logo) {
              ctx.drawImage(logo, point.x - 14, point.y - 14, 28, 28);
            } else {
              ctx.fillStyle = '#fff';
              ctx.font = 'bold 10px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(d.team, point.x, point.y);
            }
            // Draw abbreviated name next to point
            if (d.label) {
              const parts = d.label.split(' ');
              const shortName = parts.length > 1
                ? parts[0][0] + '.' + parts[parts.length - 1]
                : d.label;
              ctx.fillStyle = tc.labelColor;
              ctx.font = 'bold 10px sans-serif';
              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillText(shortName, point.x + 18, point.y);
            }
          });
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
      <div class="grade-card">
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
