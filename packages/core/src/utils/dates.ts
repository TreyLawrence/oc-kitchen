export function now(): string {
  return new Date().toISOString();
}

/** Returns the Monday of the week containing the given date. */
export function weekStart(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  // Shift Sunday (0) to 7 so Monday is always the start
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.toISOString().split("T")[0];
}

/** Returns the Sunday of the week containing the given date. */
export function weekEnd(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

/** Format a date as "Week of Mon DD" for display. */
export function weekLabel(date: Date = new Date()): string {
  const start = new Date(weekStart(date));
  return `Week of ${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}
