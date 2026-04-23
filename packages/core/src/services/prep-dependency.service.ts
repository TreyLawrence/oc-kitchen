export interface PrepHint {
  keyword: string;
  leadTimeHours: number;
  snippet: string;
}

const SNIPPET_RADIUS = 40;

/**
 * Scans recipe instructions for advance-prep keywords and returns
 * structured hints the agent can use to schedule prep entries.
 */
export function detectPrepDependencies(instructions: string): PrepHint[] {
  const hints: PrepHint[] = [];
  const text = instructions.toLowerCase();

  // "overnight" + context verb (marinade, brine, soak, rest, rise, etc.)
  const overnightRe =
    /(?:marinate|brine|soak|rest|refrigerate|rise|ferment|chill|sit|proof)\s+(?:\w+\s+)*?overnight|overnight\s+(?:marinade|brine|soak|rest|rise|ferment|chill|proof)/g;
  for (const m of text.matchAll(overnightRe)) {
    hints.push({
      keyword: "overnight",
      leadTimeHours: 12,
      snippet: extractSnippet(instructions, m.index!),
    });
  }

  // "the day before" / "day ahead" / "a day in advance"
  const dayBeforeRe = /the day before|day ahead|a day in advance/g;
  for (const m of text.matchAll(dayBeforeRe)) {
    hints.push({
      keyword: "the day before",
      leadTimeHours: 24,
      snippet: extractSnippet(instructions, m.index!),
    });
  }

  // "make ahead" / "made ahead" / "prepare ahead" / "prep ahead"
  const makeAheadRe = /(?:make|made|prepare|prepared|prep)\s+ahead/g;
  for (const m of text.matchAll(makeAheadRe)) {
    hints.push({
      keyword: "make ahead",
      leadTimeHours: 12,
      snippet: extractSnippet(instructions, m.index!),
    });
  }

  // "for X hours" / "X hours before" / "X hours ahead" / "X hours in advance"
  // Also: "rest for X hours", "marinate for X hours", "marinate the pork for X hours", etc.
  const hoursRe =
    /(?:for\s+)?(\d+)\s+hours?\s+(?:before|ahead|in advance)|(?:rest|rise|marinate|chill|brine|ferment|soak|refrigerate|proof|sit)\s+(?:\w+\s+)*?(?:for\s+)?(\d+)\s+hours?/g;
  for (const m of text.matchAll(hoursRe)) {
    const hours = parseInt(m[1] || m[2], 10);
    if (hours >= 4) {
      hints.push({
        keyword: `${hours} hours`,
        leadTimeHours: hours,
        snippet: extractSnippet(instructions, m.index!),
      });
    }
  }

  return hints;
}

function extractSnippet(text: string, matchIndex: number): string {
  const start = Math.max(0, matchIndex - SNIPPET_RADIUS);
  const end = Math.min(text.length, matchIndex + SNIPPET_RADIUS);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  return snippet;
}
