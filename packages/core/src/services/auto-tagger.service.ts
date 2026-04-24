import { UserProfileRepository } from "../repositories/user-profile.repo.js";

export interface TypedTag {
  tag: string;
  type: "duration" | "equipment" | "cuisine" | "seasonal" | "user";
}

/**
 * Auto-generates equipment and duration tags for recipes.
 * Returns typed tag objects ({ tag, type }). User-provided tags are preserved;
 * old auto-tags (duration, equipment) are stripped and regenerated.
 * Legacy plain-string tags are migrated to type "user".
 */
export class AutoTaggerService {
  constructor(private profileRepo: UserProfileRepository) {}

  async generateTags(recipe: {
    title: string;
    instructions: string;
    prepMinutes?: number | null;
    cookMinutes?: number | null;
    tags?: TypedTag[] | string[];
  }): Promise<TypedTag[]> {
    // Normalize incoming tags — migrate legacy strings to user type
    const existingTags = this.normalizeTags(recipe.tags);

    // Keep only user, cuisine, and seasonal tags (auto-tags get regenerated)
    const preserved = existingTags.filter(
      (t) => t.type !== "duration" && t.type !== "equipment"
    );

    const autoTags: TypedTag[] = [];

    // Duration tags
    const totalMinutes = (recipe.prepMinutes || 0) + (recipe.cookMinutes || 0);
    if (totalMinutes > 0) {
      if (totalMinutes < 30) {
        autoTags.push({ tag: "quick", type: "duration" });
      } else if (totalMinutes < 60) {
        autoTags.push({ tag: "weeknight", type: "duration" });
      } else if (totalMinutes >= 120) {
        autoTags.push({ tag: "project", type: "duration" });
      }
    }

    // Equipment tags — match recipe text against user's equipment
    const profile = await this.profileRepo.getFullProfile();
    const text = `${recipe.title} ${recipe.instructions}`.toLowerCase();

    for (const equip of profile.equipment) {
      const equipName = equip.name.toLowerCase();
      if (text.includes(equipName)) {
        autoTags.push({ tag: equipName, type: "equipment" });
      }
    }

    // Merge: preserved tags + auto tags, deduplicate by tag+type
    const seen = new Set<string>();
    const result: TypedTag[] = [];

    for (const t of [...preserved, ...autoTags]) {
      const key = `${t.type}:${t.tag}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(t);
      }
    }

    return result;
  }

  /**
   * Normalize tags input — handles both typed objects and legacy plain strings.
   */
  private normalizeTags(tags?: TypedTag[] | string[]): TypedTag[] {
    if (!tags || tags.length === 0) return [];

    return tags.map((t) => {
      if (typeof t === "string") {
        return { tag: t, type: "user" as const };
      }
      return t;
    });
  }
}
