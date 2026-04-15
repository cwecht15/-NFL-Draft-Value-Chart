function getSlotValue(pickNumber) {
  return FITZ_LOOKUP[pickNumber] || 0;
}

function getPlayerValue(score) {
  const { minScore, maxScore, minValue, maxValue, k } = SCORE_PARAMS;
  const scoreRange = maxScore - minScore;
  const valueRange = maxValue - minValue;
  return (Math.exp(k * (score - minScore)) - 1) / (Math.exp(k * scoreRange) - 1) * valueRange + minValue;
}

function getPickScore(pickNumber, score) {
  return getPlayerValue(score) - getSlotValue(pickNumber);
}

function findPlayerByOverall(overall) {
  return BIG_BOARD.find(p => p.overall === overall);
}

function getPickScoreColor(pickScore) {
  if (pickScore > 200) return '#1a7a1a';
  if (pickScore > 100) return '#2d9e2d';
  if (pickScore > 0) return '#5cb85c';
  if (pickScore > -100) return '#f0ad4e';
  if (pickScore > -200) return '#e87c3a';
  return '#d9534f';
}

function getPickScoreLabel(pickScore) {
  if (pickScore > 200) return 'GREAT VALUE';
  if (pickScore > 100) return 'GOOD VALUE';
  if (pickScore > 0) return 'FAIR';
  if (pickScore > -100) return 'SLIGHT REACH';
  if (pickScore > -200) return 'REACH';
  return 'BIG REACH';
}
