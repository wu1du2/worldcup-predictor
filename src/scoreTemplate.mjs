export const sportteryScoreTemplate = [
  '1-0', '2-0', '2-1', '3-0', '3-1', '3-2',
  '4-0', '4-1', '4-2', '5-0', '5-1', '5-2', '胜其他',
  '0-0', '1-1', '2-2', '3-3', '平其他',
  '0-1', '0-2', '1-2', '0-3', '1-3', '2-3',
  '0-4', '1-4', '2-4', '0-5', '1-5', '2-5', '负其他',
];

export const exactSportteryScores = new Set(
  sportteryScoreTemplate.filter((score) => /^\d+-\d+$/.test(score)),
);
