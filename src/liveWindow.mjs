export function buildLiveDateWindow(now = new Date(), daysAhead = 2) {
  const from = getChinaDate(now);
  const dates = [];
  for (let offset = 0; offset <= daysAhead; offset += 1) {
    dates.push(addChinaDateDays(from, offset));
  }
  return {
    from,
    to: dates[dates.length - 1],
    dates,
  };
}

function getChinaDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addChinaDateDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return getChinaDate(date);
}
