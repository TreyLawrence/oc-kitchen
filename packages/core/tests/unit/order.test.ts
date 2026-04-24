import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../../src/db/index.js";
import { OrderRepository } from "../../src/repositories/order.repo.js";
import { GroceryRepository } from "../../src/repositories/grocery.repo.js";
import { createStartOrderTool } from "../../src/tools/order-start.js";
import { createUpdateOrderTool } from "../../src/tools/order-update.js";
import { createGetOrderTool } from "../../src/tools/order-get.js";

// Spec: specs/grocery/ordering.md

function mockRespond() {
  let result: { success: boolean; data: any } | null = null;
  const respond = (success: boolean, data: any) => {
    result = { success, data };
  };
  return { respond, getResult: () => result! };
}

describe("OrderRepository", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let orderRepo: OrderRepository;
  let groceryRepo: GroceryRepository;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    orderRepo = new OrderRepository(db);
    groceryRepo = new GroceryRepository(db);
  });

  it("creates an order", async () => {
    const list = await groceryRepo.create({ name: "Test", items: [] });
    const order = await orderRepo.create({
      groceryListId: list.id,
      store: "instacart",
    });

    expect(order.id).toBeTruthy();
    expect(order.status).toBe("pending");
    expect(order.store).toBe("instacart");
    expect(order.groceryListId).toBe(list.id);
  });

  it("gets an order by ID", async () => {
    const list = await groceryRepo.create({ name: "Test", items: [] });
    const created = await orderRepo.create({
      groceryListId: list.id,
      store: "instacart",
    });

    const order = await orderRepo.getById(created.id);
    expect(order).not.toBeNull();
    expect(order!.id).toBe(created.id);
  });

  it("returns null for missing order", async () => {
    const order = await orderRepo.getById("nonexistent");
    expect(order).toBeNull();
  });

  it("lists orders by grocery list", async () => {
    const list = await groceryRepo.create({ name: "Test", items: [] });
    await orderRepo.create({ groceryListId: list.id, store: "instacart" });
    await orderRepo.create({ groceryListId: list.id, store: "weee" });

    const orders = await orderRepo.getByGroceryListId(list.id);
    expect(orders).toHaveLength(2);
  });

  it("finds order by grocery list and store", async () => {
    const list = await groceryRepo.create({ name: "Test", items: [] });
    await orderRepo.create({ groceryListId: list.id, store: "instacart" });
    await orderRepo.create({ groceryListId: list.id, store: "weee" });

    const order = await orderRepo.getByGroceryListAndStore(
      list.id,
      "instacart",
    );
    expect(order).not.toBeNull();
    expect(order!.store).toBe("instacart");
  });

  it("updates order status and total", async () => {
    const list = await groceryRepo.create({ name: "Test", items: [] });
    const created = await orderRepo.create({
      groceryListId: list.id,
      store: "instacart",
    });

    await orderRepo.update(created.id, {
      status: "submitted",
      orderTotal: 67.43,
    });

    const order = await orderRepo.getById(created.id);
    expect(order!.status).toBe("submitted");
    expect(order!.orderTotal).toBe(67.43);
  });

  it("lists all orders in reverse chronological order", async () => {
    const list = await groceryRepo.create({ name: "Test", items: [] });
    await orderRepo.create({ groceryListId: list.id, store: "instacart" });
    await orderRepo.create({ groceryListId: list.id, store: "weee" });

    const orders = await orderRepo.list();
    expect(orders).toHaveLength(2);
  });
});

describe("start_order tool", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let orderRepo: OrderRepository;
  let groceryRepo: GroceryRepository;
  let tool: ReturnType<typeof createStartOrderTool>;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    orderRepo = new OrderRepository(db);
    groceryRepo = new GroceryRepository(db);
    tool = createStartOrderTool(orderRepo, groceryRepo);
  });

  it("starts an order for a finalized list", async () => {
    const list = await groceryRepo.create({
      name: "Week Groceries",
      items: [
        { name: "chicken thighs", quantity: 4, unit: "lbs", store: "instacart" },
        { name: "onions", quantity: 3, unit: "count", store: "instacart" },
      ],
    });
    await groceryRepo.update(list.id, { status: "finalized" });

    const { respond, getResult } = mockRespond();
    await tool.handler(
      { groceryListId: list.id, store: "instacart" },
      { respond },
    );

    const result = getResult();
    expect(result.success).toBe(true);
    expect(result.data.ok).toBe(true);
    expect(result.data.order.status).toBe("agent_running");
    expect(result.data.items).toHaveLength(2);
  });

  it("rejects ordering from a draft list", async () => {
    const list = await groceryRepo.create({ name: "Draft", items: [] });

    const { respond, getResult } = mockRespond();
    await tool.handler(
      { groceryListId: list.id, store: "instacart" },
      { respond },
    );

    const result = getResult();
    expect(result.success).toBe(false);
    expect(result.data.error).toContain("finalized");
  });

  it("rejects duplicate order for same store", async () => {
    const list = await groceryRepo.create({
      name: "Test",
      items: [{ name: "milk", quantity: 1, unit: "gallon", store: "instacart" }],
    });
    await groceryRepo.update(list.id, { status: "finalized" });

    const { respond: r1, getResult: g1 } = mockRespond();
    await tool.handler(
      { groceryListId: list.id, store: "instacart" },
      { respond: r1 },
    );
    expect(g1().success).toBe(true);

    const { respond: r2, getResult: g2 } = mockRespond();
    await tool.handler(
      { groceryListId: list.id, store: "instacart" },
      { respond: r2 },
    );
    expect(g2().success).toBe(false);
    expect(g2().data.error).toContain("already exists");
  });

  it("rejects when no items for the store", async () => {
    const list = await groceryRepo.create({
      name: "Test",
      items: [{ name: "tofu", quantity: 1, unit: "block", store: "weee" }],
    });
    await groceryRepo.update(list.id, { status: "finalized" });

    const { respond, getResult } = mockRespond();
    await tool.handler(
      { groceryListId: list.id, store: "instacart" },
      { respond },
    );

    const result = getResult();
    expect(result.success).toBe(false);
    expect(result.data.error).toContain("No items assigned");
  });

  it("warns about minimum order for weee", async () => {
    const list = await groceryRepo.create({
      name: "Test",
      items: [
        { name: "gochujang", quantity: 1, unit: "jar", store: "weee" },
      ],
    });
    await groceryRepo.update(list.id, { status: "finalized" });

    const { respond, getResult } = mockRespond();
    await tool.handler(
      { groceryListId: list.id, store: "weee" },
      { respond },
    );

    const result = getResult();
    expect(result.success).toBe(true);
    expect(result.data.warnings).toHaveLength(1);
    expect(result.data.warnings[0]).toContain("$35");
  });

  it("updates list status to ordering", async () => {
    const list = await groceryRepo.create({
      name: "Test",
      items: [{ name: "milk", quantity: 1, unit: "gallon", store: "instacart" }],
    });
    await groceryRepo.update(list.id, { status: "finalized" });

    const { respond } = mockRespond();
    await tool.handler(
      { groceryListId: list.id, store: "instacart" },
      { respond },
    );

    const updated = await groceryRepo.getById(list.id);
    expect(updated!.status).toBe("ordering");
  });
});

describe("update_order tool", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let orderRepo: OrderRepository;
  let groceryRepo: GroceryRepository;
  let tool: ReturnType<typeof createUpdateOrderTool>;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    orderRepo = new OrderRepository(db);
    groceryRepo = new GroceryRepository(db);
    tool = createUpdateOrderTool(orderRepo);
  });

  it("updates order status and total", async () => {
    const list = await groceryRepo.create({ name: "Test", items: [] });
    const order = await orderRepo.create({
      groceryListId: list.id,
      store: "instacart",
    });

    const { respond, getResult } = mockRespond();
    await tool.handler(
      { id: order.id, status: "submitted", orderTotal: 67.43 },
      { respond },
    );

    const result = getResult();
    expect(result.success).toBe(true);
    expect(result.data.order.status).toBe("submitted");
    expect(result.data.order.orderTotal).toBe(67.43);
  });

  it("auto-sets completedAt on terminal status", async () => {
    const list = await groceryRepo.create({ name: "Test", items: [] });
    const order = await orderRepo.create({
      groceryListId: list.id,
      store: "instacart",
    });

    const { respond, getResult } = mockRespond();
    await tool.handler({ id: order.id, status: "submitted" }, { respond });

    const result = getResult();
    expect(result.data.order.completedAt).toBeTruthy();
  });

  it("records error message on failure", async () => {
    const list = await groceryRepo.create({ name: "Test", items: [] });
    const order = await orderRepo.create({
      groceryListId: list.id,
      store: "instacart",
    });

    const { respond, getResult } = mockRespond();
    await tool.handler(
      { id: order.id, status: "failed", errorMessage: "Login failed" },
      { respond },
    );

    const result = getResult();
    expect(result.data.order.status).toBe("failed");
    expect(result.data.order.errorMessage).toBe("Login failed");
  });

  it("rejects update for nonexistent order", async () => {
    const { respond, getResult } = mockRespond();
    await tool.handler({ id: "fake", status: "submitted" }, { respond });

    expect(getResult().success).toBe(false);
    expect(getResult().data.error).toContain("not found");
  });
});

describe("get_order tool", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let orderRepo: OrderRepository;
  let groceryRepo: GroceryRepository;
  let tool: ReturnType<typeof createGetOrderTool>;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    orderRepo = new OrderRepository(db);
    groceryRepo = new GroceryRepository(db);
    tool = createGetOrderTool(orderRepo);
  });

  it("gets order by ID", async () => {
    const list = await groceryRepo.create({ name: "Test", items: [] });
    const order = await orderRepo.create({
      groceryListId: list.id,
      store: "instacart",
    });

    const { respond, getResult } = mockRespond();
    await tool.handler({ id: order.id }, { respond });

    const result = getResult();
    expect(result.success).toBe(true);
    expect(result.data.order.id).toBe(order.id);
  });

  it("lists orders by grocery list", async () => {
    const list = await groceryRepo.create({ name: "Test", items: [] });
    await orderRepo.create({ groceryListId: list.id, store: "instacart" });
    await orderRepo.create({ groceryListId: list.id, store: "weee" });

    const { respond, getResult } = mockRespond();
    await tool.handler({ groceryListId: list.id }, { respond });

    const result = getResult();
    expect(result.success).toBe(true);
    expect(result.data.orders).toHaveLength(2);
  });

  it("lists all orders when no filter", async () => {
    const list = await groceryRepo.create({ name: "Test", items: [] });
    await orderRepo.create({ groceryListId: list.id, store: "instacart" });

    const { respond, getResult } = mockRespond();
    await tool.handler({}, { respond });

    const result = getResult();
    expect(result.success).toBe(true);
    expect(result.data.orders).toHaveLength(1);
  });

  it("returns error for nonexistent order", async () => {
    const { respond, getResult } = mockRespond();
    await tool.handler({ id: "fake" }, { respond });

    expect(getResult().success).toBe(false);
  });
});
