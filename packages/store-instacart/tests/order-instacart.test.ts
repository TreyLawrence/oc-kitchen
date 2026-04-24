import { describe, it, expect } from "vitest";
import { createOrderInstacartTool } from "../src/tools/order-instacart.js";

// Spec: specs/grocery/ordering.md

function mockRespond() {
  const calls: { success: boolean; data: any }[] = [];
  const respond = (success: boolean, data: any) => {
    calls.push({ success, data });
  };
  return { respond, getCalls: () => calls, getLastCall: () => calls[calls.length - 1] };
}

describe("order_instacart tool", () => {
  const tool = createOrderInstacartTool();

  it("has correct name and required parameters", () => {
    expect(tool.name).toBe("order_instacart");
    expect(tool.parameters.required).toContain("groceryListId");
    expect(tool.parameters.required).toContain("items");
    expect(tool.parameters.properties.store).toBeDefined();
    expect(tool.parameters.properties.checkout).toBeDefined();
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
        store: "wegmans",
        checkout: false,
        items: [
          { name: "chicken thighs", quantity: 4, unit: "lbs" },
          { name: "yellow onions", quantity: 3, unit: "count" },
        ],
      },
      { respond },
    );

    const calls = getCalls();
    // Should have progress updates + final result
    expect(calls.length).toBeGreaterThan(2);

    // First call is logging_in
    expect(calls[0].data.status).toBe("logging_in");
    expect(calls[0].data.store).toBe("wegmans");

    // Should have search/add progress for each item
    const searchCalls = calls.filter((c) => c.data.status === "searching");
    expect(searchCalls.length).toBe(2);

    const addedCalls = calls.filter((c) => c.data.status === "added");
    expect(addedCalls.length).toBe(2);

    // Final result
    const final = getLastCall();
    expect(final.success).toBe(true);
    expect(final.data.ok).toBe(true);
    expect(final.data.groceryListId).toBe("gl1");
    expect(final.data.store).toBe("wegmans");
    expect(final.data.itemsAdded).toBe(2);
    expect(final.data.itemsMissing).toEqual([]);
  });

  it("defaults store to wegmans", async () => {
    const { respond, getCalls } = mockRespond();
    await tool.handler(
      {
        groceryListId: "gl1",
        items: [{ name: "milk", quantity: 1, unit: "count" }],
      },
      { respond },
    );

    const loginCall = getCalls().find((c) => c.data.status === "logging_in");
    expect(loginCall!.data.store).toBe("wegmans");

    const finalCall = getCalls()[getCalls().length - 1];
    expect(finalCall.data.store).toBe("wegmans");
  });

  it("passes groceryListId in all progress updates", async () => {
    const { respond, getCalls } = mockRespond();
    await tool.handler(
      {
        groceryListId: "gl42",
        items: [{ name: "eggs", quantity: 1, unit: "count" }],
      },
      { respond },
    );

    const calls = getCalls();
    for (const call of calls) {
      expect(call.data.groceryListId).toBe("gl42");
    }
  });
});
