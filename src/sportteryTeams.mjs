const sportteryTeamAliases = {
  '刚果(金)': '刚果民主共和国',
  乌兹别克: '乌兹别克斯坦',
};

export function normalizeSportteryTeamName(name) {
  return sportteryTeamAliases[name] || name;
}
