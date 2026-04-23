import { UserProfileRepository } from "../repositories/user-profile.repo.js";
import { CalendarService, GcalListItem } from "../services/calendar.service.js";

interface DayAvailability {
  date: string;
  dayOfWeek: number;
  availableMinutes: number;
  canStartAt: string | null;
  mustBeReadyBy: string | null;
  events: Array<{ title: string; start?: string; end?: string }>;
  isWeekend?: boolean;
  skip?: boolean;
  reason?: string;
}

export function createCheckCalendarTool(
  profileRepo: UserProfileRepository,
  calendarService: CalendarService = new CalendarService()
) {
  return {
    name: "check_calendar",
    description:
      "Check available cooking time per evening for the week. Uses Google Calendar if connected, otherwise asks the user directly.",
    parameters: {
      type: "object",
      properties: {
        weekStart: { type: "string", description: "Monday date (YYYY-MM-DD)" },
        weekEnd: { type: "string", description: "Sunday date (YYYY-MM-DD)" },
        cookingWindowStart: {
          type: "string",
          description: "Override when user can start cooking (HH:MM, default from preferences or 17:00)",
        },
        dinnerTargetTime: {
          type: "string",
          description: "Override when dinner should be ready (HH:MM, default from preferences or 19:30)",
        },
      },
      required: ["weekStart"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const cookingWindowStart =
          params.cookingWindowStart ||
          (await profileRepo.getPreference("cooking_window_start") as string) ||
          "17:00";
        const dinnerTargetTime =
          params.dinnerTargetTime ||
          (await profileRepo.getPreference("dinner_target_time") as string) ||
          "19:30";

        const token = (await profileRepo.getPreference("google_calendar_token")) as string | null;

        if (!token) {
          // Fallback: ask the user directly
          const endLabel = params.weekEnd || "Sunday";
          respond(true, {
            ok: true,
            calendarConnected: false,
            cookingWindowStart,
            dinnerTargetTime,
            action: "ask_user",
            instructions: `Google Calendar is not connected yet. Ask the user which nights they're free to cook this week (${params.weekStart} to ${endLabel}). For each night, ask if they have any evening commitments that would limit cooking time. Use their default cooking window: start at ${cookingWindowStart}, dinner ready by ${dinnerTargetTime} (${calculateMinutes(cookingWindowStart, dinnerTargetTime)} minutes available on a free night).`,
            defaultAvailableMinutes: calculateMinutes(cookingWindowStart, dinnerTargetTime),
          });
          return;
        }

        // Connected: fetch events from Google Calendar
        const weekStartDate = params.weekStart;
        const weekEndDate = params.weekEnd || addDays(weekStartDate, 6);

        const timeMin = `${weekStartDate}T00:00:00Z`;
        const timeMax = `${weekEndDate}T23:59:59Z`;

        const gcalEvents = await calendarService.listEvents(token, timeMin, timeMax);

        const days = buildDayAvailability(
          weekStartDate,
          weekEndDate,
          gcalEvents,
          cookingWindowStart,
          dinnerTargetTime
        );

        respond(true, {
          ok: true,
          calendarConnected: true,
          days,
        });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}

/**
 * Build per-day availability from Google Calendar events.
 * For each day, determines available cooking minutes in the evening window.
 */
function buildDayAvailability(
  weekStart: string,
  weekEnd: string,
  events: GcalListItem[],
  cookingWindowStart: string,
  dinnerTargetTime: string
): DayAvailability[] {
  const days: DayAvailability[] = [];
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(weekEnd + "T00:00:00");

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    const jsDay = d.getDay(); // 0=Sun, 1=Mon, ...
    // Convert to spec's day_of_week: 0=Mon ... 6=Sun
    const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;
    const isWeekend = dayOfWeek >= 5; // Sat=5, Sun=6

    // Default window — weekends get extended morning start
    const windowStart = isWeekend ? "10:00" : cookingWindowStart;
    const windowEnd = isWeekend ? "18:00" : dinnerTargetTime;

    // Find events that overlap with the cooking window on this day
    const dayEvents = events.filter((ev) => {
      const evStart = ev.start.dateTime || ev.start.date || "";
      return evStart.startsWith(dateStr);
    });

    const formattedEvents = dayEvents.map((ev) => ({
      title: ev.summary,
      start: extractTime(ev.start.dateTime),
      end: extractTime(ev.end.dateTime),
    }));

    // Calculate available minutes considering event conflicts
    const { availableMinutes, canStartAt, mustBeReadyBy, skip, reason } =
      calculateAvailability(dateStr, dayEvents, windowStart, windowEnd);

    const day: DayAvailability = {
      date: dateStr,
      dayOfWeek,
      availableMinutes,
      canStartAt: skip ? null : canStartAt,
      mustBeReadyBy: skip ? null : mustBeReadyBy,
      events: formattedEvents,
    };

    if (isWeekend) day.isWeekend = true;
    if (skip) {
      day.skip = true;
      day.reason = reason;
    }

    days.push(day);
  }

  return days;
}

/**
 * Calculate available cooking time for a single evening.
 * Finds the largest contiguous block in the cooking window not blocked by events.
 */
function calculateAvailability(
  _dateStr: string,
  events: GcalListItem[],
  windowStart: string,
  windowEnd: string
): {
  availableMinutes: number;
  canStartAt: string;
  mustBeReadyBy: string;
  skip: boolean;
  reason?: string;
} {
  const windowStartMin = timeToMinutes(windowStart);
  const windowEndMin = timeToMinutes(windowEnd);

  // Collect events that overlap the cooking window
  const blocking: Array<{ start: number; end: number; title: string }> = [];
  for (const ev of events) {
    const evStartStr = ev.start.dateTime;
    const evEndStr = ev.end.dateTime;
    if (!evStartStr || !evEndStr) continue;

    const evStartMin = timeToMinutes(extractTime(evStartStr)!);
    const evEndMin = timeToMinutes(extractTime(evEndStr)!);

    // Does this event overlap the cooking window?
    if (evEndMin > windowStartMin && evStartMin < windowEndMin) {
      blocking.push({ start: evStartMin, end: evEndMin, title: ev.summary });
    }
  }

  if (blocking.length === 0) {
    return {
      availableMinutes: windowEndMin - windowStartMin,
      canStartAt: windowStart,
      mustBeReadyBy: windowEnd,
      skip: false,
    };
  }

  // Sort blocking events by start time
  blocking.sort((a, b) => a.start - b.start);

  // Find all gaps in the cooking window
  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = windowStartMin;
  for (const b of blocking) {
    if (b.start > cursor) {
      gaps.push({ start: cursor, end: b.start });
    }
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < windowEndMin) {
    gaps.push({ start: cursor, end: windowEndMin });
  }

  if (gaps.length === 0) {
    return {
      availableMinutes: 0,
      canStartAt: windowStart,
      mustBeReadyBy: windowEnd,
      skip: true,
      reason: "No available cooking time",
    };
  }

  // Pick the largest gap
  const best = gaps.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a), gaps[0]);
  const availableMinutes = best.end - best.start;

  return {
    availableMinutes,
    canStartAt: minutesToTime(best.start),
    mustBeReadyBy: minutesToTime(best.end),
    skip: false,
  };
}

export function calculateMinutes(start: string, end: string): number {
  return timeToMinutes(end) - timeToMinutes(start);
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function extractTime(dateTime?: string): string | undefined {
  if (!dateTime) return undefined;
  const match = dateTime.match(/T(\d{2}:\d{2})/);
  return match?.[1];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
