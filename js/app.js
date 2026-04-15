document.addEventListener('DOMContentLoaded', () => {
  // Init Firebase
  const firebaseReady = initFirebase((picks) => {
    renderDraftBoard(picks);
    updateCharts(picks);
  });

  const statusEl = document.getElementById('sync-status');
  if (firebaseReady) {
    statusEl.textContent = 'Synced';
    statusEl.classList.add('connected');
  } else {
    statusEl.textContent = 'Local only';
    statusEl.classList.add('local');
  }

  // Populate team dropdown
  const teamSelect = document.getElementById('team-select');
  TEAM_ABBREVS.forEach(team => {
    const opt = document.createElement('option');
    opt.value = team;
    opt.textContent = team;
    teamSelect.appendChild(opt);
  });

  // Refresh board from Google Sheet
  document.getElementById('refresh-board-btn').addEventListener('click', async () => {
    const btn = document.getElementById('refresh-board-btn');
    btn.disabled = true;
    btn.textContent = 'Refreshing...';
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        btn.textContent = `Updated (${data.count} players)`;
        setTimeout(() => location.reload(), 800);
      } else {
        btn.textContent = 'Error';
        console.error('Refresh failed:', data.error);
        setTimeout(() => { btn.textContent = 'Refresh Board'; btn.disabled = false; }, 3000);
      }
    } catch (e) {
      btn.textContent = 'Error';
      console.error('Refresh failed:', e);
      setTimeout(() => { btn.textContent = 'Refresh Board'; btn.disabled = false; }, 3000);
    }
  });

  // Pick form
  document.getElementById('submit-pick-btn').addEventListener('click', handleSubmitPick);
  document.getElementById('reset-draft-btn').addEventListener('click', handleResetDraft);

  // Track manual team changes so auto-fill doesn't override
  teamSelect.addEventListener('change', function() {
    this._userChanged = true;
  });

  // Player search
  const playerInput = document.getElementById('player-input');
  playerInput.addEventListener('input', () => {
    const val = playerInput.value;
    const match = BIG_BOARD.find(p => p.player === val);
    if (match) {
      document.getElementById('selected-overall').value = match.overall;
      selectPlayer(match.overall);
    } else {
      document.getElementById('selected-overall').value = '';
      document.getElementById('pick-preview').style.display = 'none';
    }
  });

  // Filters for available players
  document.getElementById('player-filter').addEventListener('input', renderAvailablePlayers);
  document.getElementById('position-filter').addEventListener('change', renderAvailablePlayers);

  // Top-level nav: Draft Board vs Charts
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.view).classList.add('active');

      // Render charts when switching to chart view
      if (tab.dataset.view === 'view-charts') {
        const activePanel = document.querySelector('.chart-panel.active');
        if (activePanel) renderActiveChart(activePanel.id);
      }
    });
  });

  // Chart sub-tabs
  document.querySelectorAll('.chart-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.chart-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.chart).classList.add('active');
      renderActiveChart(tab.dataset.chart);
    });
  });


  // Theme toggle
  const themeBtn = document.getElementById('theme-toggle');
  const savedTheme = localStorage.getItem('draft_theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light');
    themeBtn.textContent = 'Dark';
  }
  themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('light');
    const isLight = document.body.classList.contains('light');
    themeBtn.textContent = isLight ? 'Dark' : 'Light';
    localStorage.setItem('draft_theme', isLight ? 'light' : 'dark');
    // Re-render charts with new theme colors
    const activePanel = document.querySelector('.chart-panel.active');
    if (document.getElementById('view-charts').classList.contains('active') && activePanel) {
      renderActiveChart(activePanel.id);
    }
  });

  // Init round filters on charts page
  initRoundFilters();

  // Ctrl+Enter to submit
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) handleSubmitPick();
  });
});
