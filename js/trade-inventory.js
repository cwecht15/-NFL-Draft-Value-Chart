// ── Pick Inventory & Future Picks ──
// Tracks which picks each team owns (current draft + 2027/2028 future picks).
// Trades update both teams' inventories automatically.

const FUTURE_DISCOUNT = 0.85; // per-year multiplier, based on market trade data (OTC/Rich Hill)

function getFutureDiscount() {
  return FUTURE_DISCOUNT;
}

// Team-strength tiers shift where a future pick falls on the Fitz curve
const TEAM_TIERS = {
  'top10':  { label: 'Top 10',  offsets: { 1: 8,  2: 40, 3: 72, 4: 104, 5: 136, 6: 184, 7: 232 } },
  'mid':    { label: 'Mid',     offsets: { 1: 18, 2: 50, 3: 82, 4: 114, 5: 146, 6: 194, 7: 240 } },
  'late':   { label: 'Late',    offsets: { 1: 29, 2: 61, 3: 93, 4: 125, 5: 157, 6: 205, 7: 248 } },
};

// Per-team tier assignments (default: mid)
let teamTierAssignments = JSON.parse(localStorage.getItem('draft_team_tiers') || '{}');

function getTeamTier(team) {
  return teamTierAssignments[team] || 'mid';
}

function setTeamTier(team, tier) {
  teamTierAssignments[team] = tier;
  localStorage.setItem('draft_team_tiers', JSON.stringify(teamTierAssignments));
}

// Round midpoints — default (used when no team context)
const ROUND_MIDPOINTS = {
  1: 16, 2: 48, 3: 80, 4: 112, 5: 144, 6: 192, 7: 240
};

// ── Pre-existing future pick trades (real NFL trades before the 2026 draft) ──
// Each entry: { round, origTeam } means "origTeam's Nth-round pick" is owned by the key team
// Source: draftinsiders.com, Wikipedia 2027 NFL draft page

const DEFAULT_FUTURE_PICKS = {
  2027: {
    // Format: team -> [{round, orig}] — orig = original team whose pick it is
    // Trades that move picks away from their original team:
    // R1: GB→DAL, IND→NYJ, DAL→NYJ
    // R3: LA→KC
    // R4: MIN→CAR
    // R5: DAL→PIT, PIT→MIA, CAR→MIN, HST→CLV, CHI→NE
    // R6: NYJ→MIN, SF→KC, KC→NYJ, GB→PHI, NO→NE, CLV→HST, LAC→NO, NYJ→CLV(via PHI→NYJ trade)
    // R7: many trades (see below)
    _trades: [
      // Round 1
      { round: 1, from: 'GB',  to: 'DAL' },
      { round: 1, from: 'IND', to: 'NYJ' },
      { round: 1, from: 'DAL', to: 'NYJ' },
      // Round 3
      { round: 3, from: 'LA',  to: 'KC' },
      // Round 4
      { round: 4, from: 'MIN', to: 'CAR' },
      { round: 4, from: 'DAL', to: 'GB' },
      // Round 5
      { round: 5, from: 'DAL', to: 'PIT' },
      { round: 5, from: 'PIT', to: 'MIA' },
      { round: 5, from: 'CAR', to: 'MIN' },
      { round: 5, from: 'HST', to: 'CLV' },
      { round: 5, from: 'CHI', to: 'NE' },
      // Round 6
      { round: 6, from: 'NYJ', to: 'MIN' },
      { round: 6, from: 'SF',  to: 'KC' },
      { round: 6, from: 'KC',  to: 'NYJ' },
      { round: 6, from: 'GB',  to: 'PHI' },
      { round: 6, from: 'NO',  to: 'NE' },
      { round: 6, from: 'CLV', to: 'HST' },
      { round: 6, from: 'LAC', to: 'NO' },
      { round: 6, from: 'PHI', to: 'NYJ' },
      { round: 6, from: 'PHI', to: 'GB' },
      // Round 7
      { round: 7, from: 'LA',  to: 'JAX' },  // via BLT
      { round: 7, from: 'MIA', to: 'PIT' },
      { round: 7, from: 'NYG', to: 'MIA' },
      { round: 7, from: 'NO',  to: 'DEN' },
      { round: 7, from: 'KC',  to: 'SF' },
      { round: 7, from: 'PHI', to: 'MIN' },
      { round: 7, from: 'NYJ', to: 'KC' },
      { round: 7, from: 'ATL', to: 'SEA' },
      { round: 7, from: 'LAC', to: 'HST' },
      { round: 7, from: 'BLT', to: 'LAC' },
      { round: 7, from: 'BLT', to: 'PHI' },
      { round: 7, from: 'HST', to: 'DET' },
      { round: 7, from: 'PHI', to: 'CAR' },
    ]
  },
  2028: {
    _trades: [
      { round: 6, from: 'NO',  to: 'DAL' },
      { round: 7, from: 'CLV', to: 'LA' },
      { round: 7, from: 'DAL', to: 'NO' },
      { round: 7, from: 'NO',  to: 'NE' },
      { round: 7, from: 'BLT', to: 'PHI' },
      { round: 7, from: 'NYJ', to: 'LAC' },
    ]
  }
};

// Pick inventory: team -> { current: [pickNums], future: { 2027: [{round, orig}], 2028: [{round, orig}] } }
let pickInventory = {};

function buildDefaultFuturePicks(year) {
  // Start with every team owning their own 7 rounds
  const ownership = {}; // team -> [{round, orig}]
  TEAM_ABBREVS.forEach(team => {
    ownership[team] = [1,2,3,4,5,6,7].map(r => ({ round: r, orig: team }));
  });

  // Apply pre-existing trades
  const trades = DEFAULT_FUTURE_PICKS[year]?._trades || [];
  for (const t of trades) {
    // Remove from original owner
    const fromList = ownership[t.from];
    const idx = fromList.findIndex(p => p.round === t.round && p.orig === t.from);
    if (idx > -1) {
      const pick = fromList.splice(idx, 1)[0];
      // Add to new owner
      ownership[t.to].push(pick);
    }
  }

  // Sort each team's picks
  for (const team of TEAM_ABBREVS) {
    ownership[team].sort((a, b) => a.round - b.round);
  }

  return ownership;
}

function initPickInventory() {
  pickInventory = {};
  const future2027 = buildDefaultFuturePicks(2027);
  const future2028 = buildDefaultFuturePicks(2028);

  TEAM_ABBREVS.forEach(team => {
    pickInventory[team] = {
      current: [],
      future: {
        2027: future2027[team] || [],
        2028: future2028[team] || []
      }
    };
  });

  // Assign current-year picks from DRAFT_ORDER
  for (const [pickStr, info] of Object.entries(DRAFT_ORDER)) {
    const pickNum = parseInt(pickStr);
    const team = info.team;
    if (pickInventory[team]) {
      pickInventory[team].current.push(pickNum);
    }
  }

  // Apply trade overrides to current picks
  for (const [pickStr, newTeam] of Object.entries(tradeOverrides)) {
    const pickNum = parseInt(pickStr);
    const origTeam = DRAFT_ORDER[pickNum]?.team;
    if (origTeam && origTeam !== newTeam) {
      const origIdx = pickInventory[origTeam]?.current.indexOf(pickNum);
      if (origIdx > -1) pickInventory[origTeam].current.splice(origIdx, 1);
      if (pickInventory[newTeam]) {
        if (!pickInventory[newTeam].current.includes(pickNum)) {
          pickInventory[newTeam].current.push(pickNum);
        }
      }
    }
  }

  // Apply in-draft future pick trades from storage
  const savedFutureTrades = localStorage.getItem('draft_future_trades');
  if (savedFutureTrades) {
    const futureTrades = JSON.parse(savedFutureTrades);
    futureTrades.forEach(ft => {
      // ft: { from, to, year, round, orig }
      const fromList = pickInventory[ft.from]?.future[ft.year];
      const toList = pickInventory[ft.to]?.future[ft.year];
      if (fromList && toList) {
        const idx = fromList.findIndex(p => p.round === ft.round && p.orig === (ft.orig || ft.from));
        if (idx > -1) {
          const pick = fromList.splice(idx, 1)[0];
          toList.push(pick);
          toList.sort((a, b) => a.round - b.round);
        }
      }
    });
  }

  // Sort each team's current picks
  for (const team of TEAM_ABBREVS) {
    pickInventory[team].current.sort((a, b) => a - b);
  }
}

// Value a future pick. `origTeam` is the team whose draft position determines the pick's spot.
// If not provided, falls back to `team` (the current owner).
function getFuturePickValue(round, yearsOut, team, origTeam) {
  const tierTeam = origTeam || team;
  let midpoint;
  if (tierTeam) {
    const tier = getTeamTier(tierTeam);
    midpoint = TEAM_TIERS[tier]?.offsets[round] || ROUND_MIDPOINTS[round] || 192;
  } else {
    midpoint = ROUND_MIDPOINTS[round] || 192;
  }
  const baseValue = FITZ_LOOKUP[midpoint] || 400;
  return baseValue * Math.pow(getFutureDiscount(), yearsOut);
}

function getFuturePickLabel(year, round, team) {
  const yearsOut = year - 2026;
  const value = getFuturePickValue(round, yearsOut, team);
  return `${year} R${round} (est. ~${Math.round(value)})`;
}

function getTeamAvailablePicks(team) {
  const draftedPicks = new Set(Object.keys(currentPicks).map(Number));
  const inv = pickInventory[team];
  if (!inv) return { current: [], future: {} };

  return {
    current: inv.current.filter(p => !draftedPicks.has(p)),
    future: {
      2027: [...(inv.future[2027] || [])],
      2028: [...(inv.future[2028] || [])]
    }
  };
}

function getTeamAllPicks(team) {
  return pickInventory[team] || { current: [], future: { 2027: [], 2028: [] } };
}

function transferFuturePick(fromTeam, toTeam, year, round) {
  const fromList = pickInventory[fromTeam]?.future[year];
  const toList = pickInventory[toTeam]?.future[year];
  if (!fromList || !toList) return;

  const idx = fromList.findIndex(p => p.round === round);
  if (idx > -1) {
    const pick = fromList.splice(idx, 1)[0];
    toList.push(pick);
    toList.sort((a, b) => a.round - b.round);

    // Persist
    const savedFutureTrades = JSON.parse(localStorage.getItem('draft_future_trades') || '[]');
    savedFutureTrades.push({ from: fromTeam, to: toTeam, year, round, orig: pick.orig });
    localStorage.setItem('draft_future_trades', JSON.stringify(savedFutureTrades));
  }
}

function resetPickInventory() {
  localStorage.removeItem('draft_future_trades');
  localStorage.removeItem('draft_team_tiers');
  teamTierAssignments = {};
  initPickInventory();
}

// Get total remaining draft capital for a team (current undrafted + future picks)
function getTeamDraftCapital(team) {
  const inv = getTeamAvailablePicks(team);
  let total = 0;
  inv.current.forEach(p => { total += getSlotValue(p); });
  [2027, 2028].forEach(year => {
    const yearsOut = year - 2026;
    (inv.future[year] || []).forEach(fp => {
      total += getFuturePickValue(fp.round, yearsOut, team, fp.orig);
    });
  });
  return total;
}
