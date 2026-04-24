export interface ButcherBoxItem {
  name: string;
  quantity: number;
  unit: string;
}

export interface AutomationResult {
  contents: string[];
  couldNotFit: string[];
  cutoffDate: string | null;
  nextDelivery: string | null;
}

export type ProgressCallback = (update: Record<string, unknown>) => void;

/**
 * Drive ButcherBox browser automation via computer-use.
 *
 * ButcherBox is a subscription service — the agent customizes the upcoming box
 * by swapping/adding items before the monthly cutoff date.
 *
 * Currently a scaffold — returns a structured plan of what the automation
 * would do. The actual Playwright + computer-use loop comes in a follow-up PR.
 */
export async function runButcherBoxAutomation(
  items: ButcherBoxItem[],
  onProgress: ProgressCallback,
): Promise<AutomationResult> {
  onProgress({ status: "logging_in" });
  onProgress({
    status: "checking_box",
    cutoffDate: null,
    currentContents: [],
  });

  for (const item of items) {
    onProgress({
      status: "adding",
      item: `${item.name} (${item.quantity} ${item.unit})`,
    });
  }

  onProgress({
    status: "box_ready",
    cutoffDate: null,
    contents: items.map((i) => i.name),
    nextDelivery: null,
  });

  return {
    contents: items.map((i) => i.name),
    couldNotFit: [],
    cutoffDate: null,
    nextDelivery: null,
  };
}
