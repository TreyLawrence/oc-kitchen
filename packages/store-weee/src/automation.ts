export interface WeeeItem {
  name: string;
  quantity: number;
  unit: string;
}

export interface AutomationConfig {
  checkout: boolean;
}

export interface AutomationResult {
  itemsAdded: string[];
  itemsMissing: string[];
  total: number | null;
}

export type ProgressCallback = (update: Record<string, unknown>) => void;

/**
 * Drive Weee! browser automation via computer-use.
 *
 * Currently a scaffold — returns a structured plan of what the automation
 * would do. The actual Playwright + computer-use loop comes in a follow-up PR.
 */
export async function runWeeeAutomation(
  items: WeeeItem[],
  config: AutomationConfig,
  onProgress: ProgressCallback,
): Promise<AutomationResult> {
  onProgress({ status: "logging_in" });

  for (const item of items) {
    onProgress({ status: "searching", item: item.name });
    onProgress({
      status: "added",
      item: item.name,
      found: `${item.name} (${item.quantity} ${item.unit})`,
      price: null,
    });
  }

  onProgress({
    status: "cart_ready",
    total: null,
    itemsAdded: items.length,
    itemsMissing: 0,
  });

  return {
    itemsAdded: items.map((i) => i.name),
    itemsMissing: [],
    total: null,
  };
}
