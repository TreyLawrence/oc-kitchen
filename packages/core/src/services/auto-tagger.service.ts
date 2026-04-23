import { UserProfileRepository } from "../repositories/user-profile.repo.js";

/**
 * Auto-generates equipment and duration tags for recipes.
 * User-provided tags are preserved and merged.
 */
export class AutoTaggerService {
  constructor(private profileRepo: UserProfileRepository) {}

  async generateTags(recipe: {
    title: string;
    instructions: string;
    prepMinutes?: number | null;
    cookMinutes?: number | null;
    tags?: string[];
  }): Promise<string[]> {
    const tags = new Set<string>(recipe.tags || []);

    // Duration tags
    const totalMinutes = (recipe.prepMinutes || 0) + (recipe.cookMinutes || 0);
    if (totalMinutes > 0) {
      if (totalMinutes < 30) {
        tags.add("quick");
      } else if (totalMinutes < 60) {
        tags.add("weeknight");
      } else if (totalMinutes >= 120) {
        tags.add("project");
      }
    }

    // Equipment tags — match recipe text against user's equipment
    const profile = await this.profileRepo.getFullProfile();
    const text = `${recipe.title} ${recipe.instructions}`.toLowerCase();

    for (const equip of profile.equipment) {
      const equipName = equip.name.toLowerCase();
      if (text.includes(equipName)) {
        tags.add(equipName);
      }
    }

    return Array.from(tags);
  }
}
