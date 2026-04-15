// Firebase Realtime Database sync
// Both users connect to the same draft — either can enter picks.

let db = null;

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBOMEi7e0dhVUFwEdyBH11K-4x3aL3TUM4",
  authDomain: "nfl-draft-2026-37893.firebaseapp.com",
  databaseURL: "https://nfl-draft-2026-37893-default-rtdb.firebaseio.com",
  projectId: "nfl-draft-2026-37893",
  storageBucket: "nfl-draft-2026-37893.firebasestorage.app",
  messagingSenderId: "923495071893",
  appId: "1:923495071893:web:e188031014027448a61b9c"
};

function isFirebaseConfigured() {
  return !!FIREBASE_CONFIG.apiKey && !!FIREBASE_CONFIG.databaseURL;
}

function initFirebase(onPicksUpdate) {
  if (!isFirebaseConfigured()) {
    console.log('Firebase not configured — local-only mode');
    const saved = JSON.parse(localStorage.getItem('draft_picks') || '{}');
    onPicksUpdate(saved);
    return false;
  }
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();

    // Listen for picks
    db.ref('picks').on('value', (snapshot) => {
      const picks = snapshot.val() || {};
      localStorage.setItem('draft_picks', JSON.stringify(picks));
      onPicksUpdate(picks);
    });

    // Listen for trade overrides
    db.ref('trades').on('value', (snapshot) => {
      const trades = snapshot.val() || {};
      tradeOverrides = trades;
      localStorage.setItem('draft_trades', JSON.stringify(trades));
    });

    // Listen for trade details
    db.ref('tradeDetails').on('value', (snapshot) => {
      const details = snapshot.val() || {};
      tradeDetails = details;
      localStorage.setItem('draft_trade_details', JSON.stringify(details));
    });

    // Listen for future pick trades
    db.ref('futureTrades').on('value', (snapshot) => {
      const ft = snapshot.val() || [];
      localStorage.setItem('draft_future_trades', JSON.stringify(ft));
    });

    return true;
  } catch (e) {
    console.error('Firebase init failed:', e);
    const saved = JSON.parse(localStorage.getItem('draft_picks') || '{}');
    onPicksUpdate(saved);
    return false;
  }
}

function syncTrades() {
  if (!db) return;
  db.ref('trades').set(tradeOverrides);
  db.ref('tradeDetails').set(tradeDetails);
  const ft = JSON.parse(localStorage.getItem('draft_future_trades') || '[]');
  db.ref('futureTrades').set(ft);
}

function submitPick(pickNumber, team, playerOverall, playerName, isOffBoard) {
  const pickData = {
    team,
    playerOverall: playerOverall || null,
    playerName: playerName || null,
    isOffBoard: isOffBoard || false,
    timestamp: Date.now(),
  };

  if (db) {
    db.ref(`picks/${pickNumber}`).set(pickData);
  } else {
    const saved = JSON.parse(localStorage.getItem('draft_picks') || '{}');
    saved[pickNumber] = pickData;
    localStorage.setItem('draft_picks', JSON.stringify(saved));
  }

  return pickData;
}

function undoPick(pickNumber) {
  if (db) {
    db.ref(`picks/${pickNumber}`).remove();
  } else {
    const saved = JSON.parse(localStorage.getItem('draft_picks') || '{}');
    delete saved[pickNumber];
    localStorage.setItem('draft_picks', JSON.stringify(saved));
  }
}

function resetDraft() {
  if (db) {
    db.ref('picks').remove();
    db.ref('trades').remove();
    db.ref('tradeDetails').remove();
    db.ref('futureTrades').remove();
  }
  localStorage.removeItem('draft_picks');
}
