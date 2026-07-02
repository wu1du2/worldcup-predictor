import { exactSportteryScores } from './scoreTemplate.mjs';

const regularTimeRequiredStatusPattern = /\b(AET|PEN)\b|After Extra Time|Penalties/i;

export function getSettlementScore(match) {
  const settlementHome = normalizeNullableInteger(match?.settlementHomeScore ?? match?.settlement_home_score);
  const settlementAway = normalizeNullableInteger(match?.settlementAwayScore ?? match?.settlement_away_score);
  if (Number.isInteger(settlementHome) && Number.isInteger(settlementAway)) {
    return { homeScore: settlementHome, awayScore: settlementAway };
  }

  if (requiresRegularTimeSettlement(match)) return null;

  const homeScore = normalizeNullableInteger(match?.homeScore ?? match?.home_score);
  const awayScore = normalizeNullableInteger(match?.awayScore ?? match?.away_score);
  if (Number.isInteger(homeScore) && Number.isInteger(awayScore)) {
    return { homeScore, awayScore };
  }

  return null;
}

export function isSettledMatch(match) {
  return match?.status === 'post' && Boolean(getSettlementScore(match));
}

export function formatSettlementScore(match) {
  const score = getSettlementScore(match);
  return score ? `${score.homeScore}-${score.awayScore}` : '';
}

export function isWinningScoreLabel(match, scoreLabel) {
  if (match?.status !== 'post') return false;
  const score = getSettlementScore(match);
  if (!score) return false;

  const actualScore = `${score.homeScore}-${score.awayScore}`;
  if (scoreLabel === actualScore) return true;
  if (exactSportteryScores.has(actualScore)) return false;

  if (score.homeScore > score.awayScore) return scoreLabel === '胜其他';
  if (score.homeScore === score.awayScore) return scoreLabel === '平其他';
  return scoreLabel === '负其他';
}

export function requiresRegularTimeSettlement(match) {
  const statusDetail = String(match?.statusDetail ?? match?.status_detail ?? '');
  return regularTimeRequiredStatusPattern.test(statusDetail);
}

function normalizeNullableInteger(value) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}
