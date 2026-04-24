import { describe, it, expect } from "vitest";
import { createCustomizeButcherBoxTool } from "../src/tools/customize-butcherbox.js";

// Spec: specs/grocery/ordering.md

function mockRespond() {
  const calls: { success: boolean; data: any }[] = [];
  const respond = (success: boolean, data: any) => {
    calls.push({ success, data });
  };
  return { respond, getCalls: () => calls, getLastCall: () => calls[calls.length - 1] };
}

describe("customize_butcherbox tool", () => {
  const tool = createCustomizeButcherBoxTool();

  it("has correct name and required parameters", () => {
    expect(tool.name).toBe("customize_butcherbox");
    expect(tool.parameters.required).toContain("groceryListId");
    expect(tool.parameters.required).toContain("items");
    // No checkout or store params — subscription model
    expect(tool.parameters.properties.checkout).toBeUndefined();
    expect(tool.parameters.properties.store).toBeUndefined();
  });

  it("rejects empty items array", async () => {
    const { respond, getLastCall } = mockRespond();
    await tool.handler(
      { groceryListId: "gl1", items: [] },
      { respond },
    );
    const result = getLastCall();
    expect(result.success).toBe(false);
    expect(result.data.error).toMatch(/no items/i);
  });

  it("rejects missing items", async () => {
    const { respond, getLastCall } = mockRespond();
    await tool.handler(
      { groceryListId: "gl1" },
      { respond },
    );
    const result = getLastCall();
    expect(result.success).toBe(false);
    expect(result.data.error).toMatch(/no items/i);
  });

  it("runs automation and reports progress", async () => {
    const { respond, getCalls, getLastCall } = mockRespond();
    await tool.handler(
      {
        groceryListId: "gl1",
        items: [
          { name: "ground beef", quantity: 2, unit: "lbs" },
          { name: "salmon fillets", quantity: 1, unit: "lbs" },
        ],
      },
      { respond },
    );

    const calls = getCalls();
    expect(calls.length).toBeGreaterThan(2);

    // First is logging_in
    expect(calls[0].data.status).toBe("logging_in");

    // Should check box status
    const checkCalls = calls.filter((c) => c.data.status === "checking_box");
    expect(checkCalls.length).toBe(1);

    // Should have adding progress for each item
    const addingCalls = calls.filter((c) => c.data.status === "adding");
    expect(addingCalls.length).toBe(2);

    // Final result includes subscription-specific fields
    const final = getLastCall();
    expect(final.success).toBe(true);
    expect(final.data.ok).toBe(true);
    expect(final.data.groceryListId).toBe("gl1");
    expect(final.data.contents).toEqual(["ground beef", "salmon fillets"]);
    expect(final.data.couldNotFit).toEqual([]);
    expect(final.data).toHaveProperty("cutoffDate");
    expect(final.data).toHaveProperty("nextDelivery");
  });

  it("passes groceryListId in all progress updates", async () => {
    const { respond, getCalls } = mockRespond();
    await tool.handler(
      {
        groceryListId: "gl77",
        items: [{ name: "chicken breast", quantity: 3, unit: "lbs" }],
      },
      { respond },
    );

    for (const call of getCalls()) {
      expect(call.data.groceryListId).toBe("gl77");
    }
  });
});
