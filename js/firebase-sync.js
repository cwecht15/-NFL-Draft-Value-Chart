// Firebase Realtime Database sync
// Both users connect to the same draft — either can enter picks.

let db = null;

const FIREBASE_CONFIG = {
  // PASTE YOUR FIREBASE CONFIG HERE
  // apiKey: "...",
  // authDomain: "...",
  // databaseURL: "...",
  // projectId: "...",
  // storageBucket: "...",
  // messagingSenderId: "...",
  // appId: "..."
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
    db.ref('picks').on('value', (snapshot) => {
      const picks = snapshot.val() || {};
      localStorage.setItem('draft_picks', JSON.stringify(picks));
      onPicksUpdate(picks);
    });
    return true;
  } catch (e) {
    console.error('Firebase init failed:', e);
    const saved = JSON.parse(localStorage.getItem('draft_picks') || '{}');
    onPicksUpdate(saved);
    return false;
  }
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
  }
  localStorage.removeItem('draft_picks');
}
