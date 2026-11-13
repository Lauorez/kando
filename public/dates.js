export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function shiftDay(day, offset) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + offset);
  const result = localDay(date);
  return isDay(result) ? result : day;
}
