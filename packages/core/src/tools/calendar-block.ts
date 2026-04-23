import { UserProfileRepository } from "../repositories/user-profile.repo.js";
import { MealPlanRepository } from "../repositories/meal-plan.repo.js";
import { RecipeRepository } from "../repositories/recipe.repo.js";
import { CalendarService } from "../services/calendar.service.js";

interface BlockedEvent {
  date: string;
  title: string;
  start: string;
  end: string;
}

interface SkippedDay {
  date: string;
  reason: string;
}

export function createBlockCookingTimeTool(
  profileRepo: UserProfileRepository,
  mealPlanRepo: MealPlanRepository,
  recipeRepo: RecipeRepository,
  calendarService: CalendarService = new CalendarService()
) {
  return {
    name: "block_cooking_time",
    description:
      "Add cooking time blocks to Google Calendar for an approved meal plan. Only cooking nights get blocks — leftover/takeout/skip nights are left open.",
    parameters: {
      type: "object",
      properties: {
        mealPlanId: { type: "string", description: "The meal plan to block time for" },
        dinnerTargetTime: {
          type: "string",
          description: "When dinner should be on the table (HH:MM, default from preferences or 19:30)",
        },
        includePrep: {
          type: "boolean",
          description: "Also block prep time for delegated prep (default true)",
        },
      },
      required: ["mealPlanId"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const token = (await profileRepo.getPreference("google_calendar_token")) as string | null;

        if (!token) {
          // No calendar connected — return the schedule for the agent to relay
          const schedule = await buildSchedule(params, profileRepo, mealPlanRepo, recipeRepo);
          if (!schedule.ok) {
            respond(false, schedule);
            return;
          }
          respond(true, {
            ok: true,
            calendarConnected: false,
            action: "tell_user",
            eventsCreated: [],
            schedule: schedule.events,
            skipped: schedule.skipped,
            instructions:
              "Google Calendar is not connected. Tell the user their cooking schedule so they can block it manually.",
          });
          return;
        }

        // Build the schedule, then create calendar events
        const schedule = await buildSchedule(params, profileRepo, mealPlanRepo, recipeRepo);
        if (!schedule.ok) {
          respond(false, schedule);
          return;
        }

        const eventsCreated: BlockedEvent[] = [];
        for (const ev of schedule.events) {
          await calendarService.createEvent(token, {
            summary: ev.title,
            start: { dateTime: `${ev.date}T${ev.start}:00` },
            end: { dateTime: `${ev.date}T${ev.end}:00` },
            description: ev.description,
            colorId: "9", // Blueberry — distinct color for cooking blocks
          });
          eventsCreated.push({
            date: ev.date,
            title: ev.title,
            start: ev.start,
            end: ev.end,
          });
        }

        respond(true, {
          ok: true,
          calendarConnected: true,
          eventsCreated,
          skipped: schedule.skipped,
        });
      } catch (error: any) {
        respond(false, { ok: false, error: error.message });
      }
    },
  };
}

interface ScheduleEvent {
  date: string;
  title: string;
  start: string;
  end: string;
  description: string;
}

async function buildSchedule(
  params: any,
  profileRepo: UserProfileRepository,
  mealPlanRepo: MealPlanRepository,
  recipeRepo: RecipeRepository
): Promise<{ ok: boolean; events: ScheduleEvent[]; skipped: SkippedDay[]; error?: string }> {
  const plan = await mealPlanRepo.getById(params.mealPlanId);
  if (!plan) {
    return { ok: false, events: [], skipped: [], error: "Meal plan not found" };
  }

  const dinnerTargetTime =
    params.dinnerTargetTime ||
    (await profileRepo.getPreference("dinner_target_time") as string) ||
    "19:30";
  const includePrep = params.includePrep !== false;

  const events: ScheduleEvent[] = [];
  const skipped: SkippedDay[] = [];

  // Group entries by day for dinner entries
  const dinnerEntries = (plan.entries as any[]).filter(
    (e: any) => e.mealType === "dinner"
  );

  for (const entry of dinnerEntries) {
    const date = dayOfWeekToDate(plan.weekStart, entry.dayOfWeek);
    const category = entry.category || "exploit";

    // Skip non-cooking nights
    if (["leftover", "skip"].includes(category)) {
      skipped.push({
        date,
        reason: `${category} night — no cooking`,
      });
      continue;
    }

    if (!entry.recipeId) {
      // Custom title entry with no recipe — skip blocking
      if (entry.customTitle) {
        skipped.push({ date, reason: `${entry.customTitle} — no recipe to time` });
      }
      continue;
    }

    const recipe = await recipeRepo.getById(entry.recipeId);
    if (!recipe) {
      skipped.push({ date, reason: "Recipe not found" });
      continue;
    }

    const prepMin = recipe.prepMinutes || 0;
    const cookMin = recipe.cookMinutes || 0;
    const totalMin = prepMin + cookMin;

    if (totalMin === 0) {
      skipped.push({ date, reason: `${recipe.title} — no time estimate` });
      continue;
    }

    // Calculate start time: dinner target minus total time
    const targetMin = timeToMinutes(dinnerTargetTime);
    const startMin = targetMin - totalMin;
    const timeLabel = prepMin > 0 ? `${prepMin}p + ${cookMin}c` : `${cookMin}c`;

    events.push({
      date,
      title: `Cook: ${recipe.title} (${timeLabel})`,
      start: minutesToTime(startMin),
      end: dinnerTargetTime,
      description: buildDescription(recipe, entry, includePrep),
    });

    // If this is a prep entry and includePrep is true, add a separate prep block
    if (category === "prep" && includePrep && prepMin > 0) {
      events.push({
        date,
        title: `Prep: ${recipe.title}`,
        start: minutesToTime(startMin),
        end: minutesToTime(startMin + prepMin),
        description: `Prep for ${recipe.title} — ${prepMin} minutes. Delegate to helper if available.`,
      });
    }
  }

  return { ok: true, events, skipped };
}

function buildDescription(recipe: any, entry: any, _includePrep: boolean): string {
  const parts: string[] = [recipe.title];

  if (recipe.prepMinutes) parts.push(`Prep: ${recipe.prepMinutes} min`);
  if (recipe.cookMinutes) parts.push(`Cook: ${recipe.cookMinutes} min`);

  // Note hands-off time in description (not blocked separately)
  if (recipe.cookMinutes && recipe.cookMinutes > 60) {
    parts.push("Note: Long cook time — may include hands-off periods");
  }

  if (entry.category === "explore") {
    parts.push("(New recipe!)");
  }

  return parts.join("\n");
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

/**
 * Convert a dayOfWeek (0=Mon...6=Sun) offset from weekStart date to an ISO date string.
 */
function dayOfWeekToDate(weekStart: string, dayOfWeek: number): string {
  const d = new Date(weekStart + "T00:00:00");
  d.setDate(d.getDate() + dayOfWeek);
  return d.toISOString().split("T")[0];
}
