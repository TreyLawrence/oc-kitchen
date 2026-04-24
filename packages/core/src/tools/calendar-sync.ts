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

const COOKING_BLOCK_PREFIX = /^(Cook|Prep): /;

export function createSyncCookingCalendarTool(
  profileRepo: UserProfileRepository,
  mealPlanRepo: MealPlanRepository,
  recipeRepo: RecipeRepository,
  calendarService: CalendarService = new CalendarService()
) {
  return {
    name: "sync_cooking_calendar",
    description:
      "Sync Google Calendar cooking blocks to match the current state of a meal plan. Call this after updating a meal plan that has calendar blocks — it deletes stale blocks and creates new ones.",
    parameters: {
      type: "object",
      properties: {
        mealPlanId: {
          type: "string",
          description: "The meal plan to sync calendar blocks for",
        },
        dinnerTargetTime: {
          type: "string",
          description:
            "When dinner should be on the table (HH:MM, default from preferences or 19:30)",
        },
      },
      required: ["mealPlanId"],
    },
    handler: async (params: any, { respond }: any) => {
      try {
        const plan = await mealPlanRepo.getById(params.mealPlanId);
        if (!plan) {
          respond(false, { ok: false, error: "Meal plan not found" });
          return;
        }

        const token = (await profileRepo.getPreference(
          "google_calendar_token"
        )) as string | null;

        const schedule = await buildSchedule(
          params,
          plan,
          profileRepo,
          recipeRepo
        );

        if (!token) {
          respond(true, {
            ok: true,
            calendarConnected: false,
            schedule: schedule.events,
            skipped: schedule.skipped,
            instructions:
              "Google Calendar is not connected. Tell the user their updated cooking schedule.",
          });
          return;
        }

        // Delete existing cooking blocks for this plan's week
        const existing = await calendarService.listEvents(
          token,
          `${plan.weekStart}T00:00:00`,
          `${plan.weekEnd}T23:59:59`
        );

        const cookingBlocks = existing.filter((ev) =>
          COOKING_BLOCK_PREFIX.test(ev.summary)
        );

        for (const block of cookingBlocks) {
          await calendarService.deleteEvent(token, block.id);
        }

        // Create new events from current plan state
        const eventsCreated: BlockedEvent[] = [];
        for (const ev of schedule.events) {
          await calendarService.createEvent(token, {
            summary: ev.title,
            start: { dateTime: `${ev.date}T${ev.start}:00` },
            end: { dateTime: `${ev.date}T${ev.end}:00` },
            description: ev.description,
            colorId: "9",
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
          eventsDeleted: cookingBlocks.length,
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
  plan: any,
  profileRepo: UserProfileRepository,
  recipeRepo: RecipeRepository
): Promise<{ events: ScheduleEvent[]; skipped: SkippedDay[] }> {
  const dinnerTargetTime =
    params.dinnerTargetTime ||
    ((await profileRepo.getPreference("dinner_target_time")) as string) ||
    "19:30";

  const events: ScheduleEvent[] = [];
  const skipped: SkippedDay[] = [];

  const dinnerEntries = (plan.entries as any[]).filter(
    (e: any) => e.mealType === "dinner"
  );

  for (const entry of dinnerEntries) {
    const date = dayOfWeekToDate(plan.weekStart, entry.dayOfWeek);
    const category = entry.category || "exploit";

    if (["leftover", "skip"].includes(category)) {
      skipped.push({ date, reason: `${category} night — no cooking` });
      continue;
    }

    if (!entry.recipeId) {
      if (entry.customTitle) {
        skipped.push({
          date,
          reason: `${entry.customTitle} — no recipe to time`,
        });
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

    const targetMin = timeToMinutes(dinnerTargetTime);
    const startMin = targetMin - totalMin;
    const timeLabel =
      prepMin > 0 ? `${prepMin}p + ${cookMin}c` : `${cookMin}c`;

    events.push({
      date,
      title: `Cook: ${recipe.title} (${timeLabel})`,
      start: minutesToTime(startMin),
      end: dinnerTargetTime,
      description: buildDescription(recipe, entry),
    });
  }

  return { events, skipped };
}

function buildDescription(recipe: any, entry: any): string {
  const parts: string[] = [recipe.title];
  if (recipe.prepMinutes) parts.push(`Prep: ${recipe.prepMinutes} min`);
  if (recipe.cookMinutes) parts.push(`Cook: ${recipe.cookMinutes} min`);
  if (entry.category === "explore") parts.push("(New recipe!)");
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

function dayOfWeekToDate(weekStart: string, dayOfWeek: number): string {
  const d = new Date(weekStart + "T00:00:00");
  d.setDate(d.getDate() + dayOfWeek);
  return d.toISOString().split("T")[0];
}
