import { describe, it, expect } from "vitest";
import { createOrderWeeeTool } from "../src/tools/order-weee.js";

// Spec: specs/grocery/ordering.md

function mockRespond() {
  const calls: { success: boolean; data: any }[] = [];
  const respond = (success: boolean, data: any) => {
    calls.push({ success, data });
  };
  return { respond, getCalls: () => calls, getLastCall: () => calls[calls.length - 1] };
}

describe("order_weee tool", () => {
  const tool = createOrderWeeeTool();

  it("has correct name and required parameters", () => {
    expect(tool.name).toBe("order_weee");
    expect(tool.parameters.required).toContain("groceryListId");
    expect(tool.parameters.required).toContain("items");
    expect(tool.parameters.properties.checkout).toBeDefined();
    // No store parameter — Weee! is a single store
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
        checkout: false,
        items: [
          { name: "gochugaru", quantity: 1, unit: "count" },
          { name: "tofu", quantity: 2, unit: "count" },
          { name: "rice noodles", quantity: 1, unit: "count" },
        ],
      },
      { respond },
    );

    const calls = getCalls();
    expect(calls.length).toBeGreaterThan(2);

    // First call is logging_in (no store field — Weee! only)
    expect(calls[0].data.status).toBe("logging_in");

    // Should have progress for each item
    const searchCalls = calls.filter((c) => c.data.status === "searching");
    expect(searchCalls.length).toBe(3);

    // Final result
    const final = getLastCall();
    expect(final.success).toBe(true);
    expect(final.data.ok).toBe(true);
    expect(final.data.groceryListId).toBe("gl1");
    expect(final.data.itemsAdded).toBe(3);
    expect(final.data.itemsMissing).toEqual([]);
  });

  it("passes groceryListId in all progress updates", async () => {
    const { respond, getCalls } = mockRespond();
    await tool.handler(
      {
        groceryListId: "gl99",
        items: [{ name: "miso paste", quantity: 1, unit: "count" }],
      },
      { respond },
    );

    for (const call of getCalls()) {
      expect(call.data.groceryListId).toBe("gl99");
    }
  });
});
