import { describe, it, expect, beforeEach } from "vitest";
import { createIntegrationHarness, type IntegrationHarness } from "./helpers/harness.js";

/**
 * Helper: create a grocery list and finalize it so it can be used with start_order.
 * Returns the grocery list with items.
 */
async function createFinalizedGroceryList(
  h: IntegrationHarness,
  name: string,
  items: Array<{ name: string; quantity?: number; unit?: string; category?: string; store?: string }>,
) {
  const createResult = await h.call("create_grocery_list", { name, items });
  expect(createResult.success).toBe(true);
  const listId = createResult.data.list.id;

  const finalizeResult = await h.call("update_grocery_list", {
    id: listId,
    status: "finalized",
  });
  expect(finalizeResult.success).toBe(true);

  return finalizeResult.data.list;
}

describe("order workflow integration tests", () => {
  let h: IntegrationHarness;

  beforeEach(() => {
    h = createIntegrationHarness();
  });

  describe("start_order", () => {
    it("creates an order from a finalized grocery list", async () => {
      const list = await createFinalizedGroceryList(h, "Weekly groceries", [
        { name: "chicken thighs", quantity: 2, unit: "lbs", store: "instacart" },
        { name: "broccoli", quantity: 1, unit: "head", store: "instacart" },
      ]);

      const result = await h.call("start_order", {
        groceryListId: list.id,
        store: "instacart",
      });

      expect(result.success).toBe(true);
      expect(result.data.ok).toBe(true);
      expect(result.data.order).toBeTruthy();
      expect(result.data.order.groceryListId).toBe(list.id);
      expect(result.data.order.store).toBe("instacart");
      expect(result.data.order.status).toBe("agent_running");
      expect(result.data.order.startedAt).toBeTruthy();
      expect(result.data.items).toHaveLength(2);
      expect(result.data.warnings).toEqual([]);
    });

    it("transitions grocery list status to ordering", async () => {
      const list = await createFinalizedGroceryList(h, "Order test", [
        { name: "rice", quantity: 5, unit: "lbs", store: "instacart" },
      ]);

      await h.call("start_order", {
        groceryListId: list.id,
        store: "instacart",
      });

      const updatedList = await h.call("get_grocery_list", { id: list.id });
      expect(updatedList.data.list.status).toBe("ordering");
    });

    it("accepts an optional agentRunId", async () => {
      const list = await createFinalizedGroceryList(h, "Agent run test", [
        { name: "tofu", quantity: 1, unit: "block", store: "instacart" },
      ]);

      const result = await h.call("start_order", {
        groceryListId: list.id,
        store: "instacart",
        agentRunId: "run_abc123",
      });

      expect(result.success).toBe(true);
      expect(result.data.order.agentRunId).toBe("run_abc123");
    });

    it("rejects order for nonexistent grocery list", async () => {
      const result = await h.call("start_order", {
        groceryListId: "nonexistent_id",
        store: "instacart",
      });

      expect(result.success).toBe(false);
      expect(result.data.ok).toBe(false);
      expect(result.data.error).toMatch(/not found/i);
    });

    it("rejects order for a draft (non-finalized) grocery list", async () => {
      const createResult = await h.call("create_grocery_list", {
        name: "Draft list",
        items: [{ name: "milk", store: "instacart" }],
      });
      const listId = createResult.data.list.id;

      const result = await h.call("start_order", {
        groceryListId: listId,
        store: "instacart",
      });

      expect(result.success).toBe(false);
      expect(result.data.ok).toBe(false);
      expect(result.data.error).toMatch(/finalized/i);
    });

    it("rejects duplicate order for same store and grocery list", async () => {
      const list = await createFinalizedGroceryList(h, "Dupe test", [
        { name: "eggs", quantity: 12, unit: "count", store: "instacart" },
      ]);

      const first = await h.call("start_order", {
        groceryListId: list.id,
        store: "instacart",
      });
      expect(first.success).toBe(true);

      const second = await h.call("start_order", {
        groceryListId: list.id,
        store: "instacart",
      });
      expect(second.success).toBe(false);
      expect(second.data.error).toMatch(/already exists/i);
    });

    it("rejects order when no items match the requested store", async () => {
      const list = await createFinalizedGroceryList(h, "Wrong store", [
        { name: "salmon", quantity: 1, unit: "lb", store: "butcherbox" },
      ]);

      const result = await h.call("start_order", {
        groceryListId: list.id,
        store: "instacart",
      });

      expect(result.success).toBe(false);
      expect(result.data.error).toMatch(/no items/i);
    });

    it("returns a warning for small Weee! orders", async () => {
      const list = await createFinalizedGroceryList(h, "Small Weee order", [
        { name: "doubanjiang", quantity: 1, unit: "jar", store: "weee" },
        { name: "soy sauce", quantity: 1, unit: "bottle", store: "weee" },
      ]);

      const result = await h.call("start_order", {
        groceryListId: list.id,
        store: "weee",
      });

      expect(result.success).toBe(true);
      expect(result.data.warnings.length).toBeGreaterThan(0);
      expect(result.data.warnings[0]).toMatch(/minimum/i);
    });
  });

  describe("get_order", () => {
    it("retrieves an order by ID", async () => {
      const list = await createFinalizedGroceryList(h, "Get test", [
        { name: "butter", quantity: 1, unit: "lb", store: "instacart" },
      ]);

      const startResult = await h.call("start_order", {
        groceryListId: list.id,
        store: "instacart",
      });
      const orderId = startResult.data.order.id;

      const getResult = await h.call("get_order", { id: orderId });

      expect(getResult.success).toBe(true);
      expect(getResult.data.ok).toBe(true);
      expect(getResult.data.order.id).toBe(orderId);
      expect(getResult.data.order.store).toBe("instacart");
      expect(getResult.data.order.groceryListId).toBe(list.id);
      expect(getResult.data.order.status).toBe("agent_running");
    });

    it("returns error for nonexistent order ID", async () => {
      const result = await h.call("get_order", { id: "fake_order_id" });

      expect(result.success).toBe(false);
      expect(result.data.ok).toBe(false);
      expect(result.data.error).toMatch(/not found/i);
    });

    it("lists orders by grocery list ID", async () => {
      const list = await createFinalizedGroceryList(h, "Multi-store list", [
        { name: "chicken breast", quantity: 2, unit: "lbs", store: "instacart" },
        { name: "short ribs", quantity: 3, unit: "lbs", store: "butcherbox" },
      ]);

      await h.call("start_order", { groceryListId: list.id, store: "instacart" });
      await h.call("start_order", { groceryListId: list.id, store: "butcherbox" });

      const result = await h.call("get_order", { groceryListId: list.id });

      expect(result.success).toBe(true);
      expect(result.data.orders).toHaveLength(2);
      const stores = result.data.orders.map((o: any) => o.store);
      expect(stores).toContain("instacart");
      expect(stores).toContain("butcherbox");
    });

    it("lists all orders when no filters provided", async () => {
      const list1 = await createFinalizedGroceryList(h, "List 1", [
        { name: "rice", quantity: 5, unit: "lbs", store: "instacart" },
      ]);
      const list2 = await createFinalizedGroceryList(h, "List 2", [
        { name: "noodles", quantity: 2, unit: "packs", store: "weee" },
      ]);

      await h.call("start_order", { groceryListId: list1.id, store: "instacart" });
      await h.call("start_order", { groceryListId: list2.id, store: "weee" });

      const result = await h.call("get_order", {});

      expect(result.success).toBe(true);
      expect(result.data.orders).toHaveLength(2);
    });
  });

  describe("update_order", () => {
    it("updates order status to submitted with completedAt", async () => {
      const list = await createFinalizedGroceryList(h, "Update test", [
        { name: "olive oil", quantity: 1, unit: "bottle", store: "instacart" },
      ]);

      const startResult = await h.call("start_order", {
        groceryListId: list.id,
        store: "instacart",
      });
      const orderId = startResult.data.order.id;

      const updateResult = await h.call("update_order", {
        id: orderId,
        status: "submitted",
        orderTotal: 45.99,
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data.ok).toBe(true);
      expect(updateResult.data.order.status).toBe("submitted");
      expect(updateResult.data.order.orderTotal).toBe(45.99);
      expect(updateResult.data.order.completedAt).toBeTruthy();
    });

    it("updates order status to failed with error message", async () => {
      const list = await createFinalizedGroceryList(h, "Fail test", [
        { name: "flour", quantity: 5, unit: "lbs", store: "instacart" },
      ]);

      const startResult = await h.call("start_order", {
        groceryListId: list.id,
        store: "instacart",
      });
      const orderId = startResult.data.order.id;

      const updateResult = await h.call("update_order", {
        id: orderId,
        status: "failed",
        errorMessage: "Payment declined",
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data.order.status).toBe("failed");
      expect(updateResult.data.order.errorMessage).toBe("Payment declined");
      expect(updateResult.data.order.completedAt).toBeTruthy();
    });

    it("updates order status to delivered with completedAt", async () => {
      const list = await createFinalizedGroceryList(h, "Delivered test", [
        { name: "sugar", quantity: 2, unit: "lbs", store: "instacart" },
      ]);

      const startResult = await h.call("start_order", {
        groceryListId: list.id,
        store: "instacart",
      });
      const orderId = startResult.data.order.id;

      await h.call("update_order", { id: orderId, status: "submitted" });

      const deliverResult = await h.call("update_order", {
        id: orderId,
        status: "delivered",
      });

      expect(deliverResult.success).toBe(true);
      expect(deliverResult.data.order.status).toBe("delivered");
      expect(deliverResult.data.order.completedAt).toBeTruthy();
    });

    it("does not set completedAt for non-terminal statuses", async () => {
      const list = await createFinalizedGroceryList(h, "Non-terminal test", [
        { name: "salt", quantity: 1, unit: "box", store: "instacart" },
      ]);

      // Create order directly via repo so we can test pending -> agent_running without start_order
      const order = await h.repos.order.create({
        groceryListId: list.id,
        store: "instacart",
      });

      // pending is the initial status from repo.create; update to agent_running
      const updateResult = await h.call("update_order", {
        id: order.id,
        status: "agent_running",
      });

      expect(updateResult.success).toBe(true);
      expect(updateResult.data.order.status).toBe("agent_running");
      expect(updateResult.data.order.completedAt).toBeNull();
    });

    it("returns error for nonexistent order ID", async () => {
      const result = await h.call("update_order", {
        id: "fake_order_id",
        status: "submitted",
      });

      expect(result.success).toBe(false);
      expect(result.data.error).toMatch(/not found/i);
    });
  });

  describe("check_butcherbox_cutoff", () => {
    it("returns not_subscribed when no subscription preference is set", async () => {
      const result = await h.call("check_butcherbox_cutoff", {});

      expect(result.success).toBe(true);
      expect(result.data.ok).toBe(true);
      expect(result.data.status).toBe("not_subscribed");
    });

    it("returns no_cutoff_set when subscribed but no cutoff date", async () => {
      await h.repos.userProfile.setPreference("butcherbox_subscription", "true");

      const result = await h.call("check_butcherbox_cutoff", {});

      expect(result.success).toBe(true);
      expect(result.data.status).toBe("no_cutoff_set");
    });

    it("returns ok when cutoff is more than 3 days away", async () => {
      await h.repos.userProfile.setPreference("butcherbox_subscription", "true");
      // Set cutoff 10 days from now
      const future = new Date();
      future.setDate(future.getDate() + 10);
      const cutoffDate = future.toISOString().split("T")[0];
      await h.repos.userProfile.setPreference("butcherbox_cutoff_date", cutoffDate);
      await h.repos.userProfile.setPreference("butcherbox_delivery_date", "2026-05-15");

      const result = await h.call("check_butcherbox_cutoff", {});

      expect(result.success).toBe(true);
      expect(result.data.status).toBe("ok");
      expect(result.data.cutoffDate).toBe(cutoffDate);
      expect(result.data.deliveryDate).toBe("2026-05-15");
      expect(result.data.daysUntilCutoff).toBeGreaterThan(3);
    });

    it("returns past when cutoff date has passed", async () => {
      await h.repos.userProfile.setPreference("butcherbox_subscription", "true");
      // Set cutoff 5 days ago
      const past = new Date();
      past.setDate(past.getDate() - 5);
      const cutoffDate = past.toISOString().split("T")[0];
      await h.repos.userProfile.setPreference("butcherbox_cutoff_date", cutoffDate);

      const result = await h.call("check_butcherbox_cutoff", {});

      expect(result.success).toBe(true);
      expect(result.data.status).toBe("past");
      expect(result.data.daysUntilCutoff).toBeLessThan(0);
    });

    it("returns response with expected shape fields", async () => {
      await h.repos.userProfile.setPreference("butcherbox_subscription", "true");
      const future = new Date();
      future.setDate(future.getDate() + 2);
      const cutoffDate = future.toISOString().split("T")[0];
      await h.repos.userProfile.setPreference("butcherbox_cutoff_date", cutoffDate);

      const result = await h.call("check_butcherbox_cutoff", {});

      expect(result.success).toBe(true);
      expect(result.data.status).toBe("upcoming");
      expect(result.data.cutoffDate).toBe(cutoffDate);
      expect(result.data).toHaveProperty("daysUntilCutoff");
      expect(result.data).toHaveProperty("mealPlanProteins");
      expect(Array.isArray(result.data.mealPlanProteins)).toBe(true);
    });
  });

  describe("multiple independent orders", () => {
    it("creates separate orders for different grocery lists", async () => {
      const list1 = await createFinalizedGroceryList(h, "Weeknight dinners", [
        { name: "pasta", quantity: 1, unit: "lb", store: "instacart" },
        { name: "marinara", quantity: 1, unit: "jar", store: "instacart" },
      ]);
      const list2 = await createFinalizedGroceryList(h, "BBQ prep", [
        { name: "brisket", quantity: 5, unit: "lbs", store: "butcherbox" },
      ]);

      const order1 = await h.call("start_order", {
        groceryListId: list1.id,
        store: "instacart",
      });
      const order2 = await h.call("start_order", {
        groceryListId: list2.id,
        store: "butcherbox",
      });

      expect(order1.success).toBe(true);
      expect(order2.success).toBe(true);
      expect(order1.data.order.id).not.toBe(order2.data.order.id);
      expect(order1.data.order.groceryListId).toBe(list1.id);
      expect(order2.data.order.groceryListId).toBe(list2.id);

      // Updating one order doesn't affect the other
      await h.call("update_order", {
        id: order1.data.order.id,
        status: "submitted",
        orderTotal: 12.50,
      });

      const getOrder2 = await h.call("get_order", { id: order2.data.order.id });
      expect(getOrder2.data.order.status).toBe("agent_running");
      expect(getOrder2.data.order.orderTotal).toBeNull();
    });

    it("allows different stores for the same grocery list", async () => {
      const list = await createFinalizedGroceryList(h, "Mixed stores", [
        { name: "chicken", quantity: 2, unit: "lbs", store: "instacart" },
        { name: "soy sauce", quantity: 1, unit: "bottle", store: "weee" },
        { name: "ribeye", quantity: 2, unit: "lbs", store: "butcherbox" },
      ]);

      const instacartOrder = await h.call("start_order", {
        groceryListId: list.id,
        store: "instacart",
      });
      const weeeOrder = await h.call("start_order", {
        groceryListId: list.id,
        store: "weee",
      });
      const bbOrder = await h.call("start_order", {
        groceryListId: list.id,
        store: "butcherbox",
      });

      expect(instacartOrder.success).toBe(true);
      expect(weeeOrder.success).toBe(true);
      expect(bbOrder.success).toBe(true);

      // Each order only includes its store's items
      expect(instacartOrder.data.items).toHaveLength(1);
      expect(instacartOrder.data.items[0].name).toBe("chicken");
      expect(weeeOrder.data.items).toHaveLength(1);
      expect(weeeOrder.data.items[0].name).toBe("soy sauce");
      expect(bbOrder.data.items).toHaveLength(1);
      expect(bbOrder.data.items[0].name).toBe("ribeye");

      // Listing by grocery list ID returns all 3
      const allOrders = await h.call("get_order", { groceryListId: list.id });
      expect(allOrders.data.orders).toHaveLength(3);
    });
  });
});
