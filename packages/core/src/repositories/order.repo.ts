import { eq, desc, and } from "drizzle-orm";
import { groceryOrders } from "../db/schema.js";
import { newId } from "../utils/ids.js";
import { now } from "../utils/dates.js";

interface CreateOrderInput {
  groceryListId: string;
  store: string;
  agentRunId?: string;
}

interface UpdateOrderInput {
  status?: string;
  agentRunId?: string;
  orderTotal?: number;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

export class OrderRepository {
  constructor(private db: any) {}

  async create(input: CreateOrderInput) {
    const id = newId();
    const timestamp = now();

    this.db
      .insert(groceryOrders)
      .values({
        id,
        groceryListId: input.groceryListId,
        store: input.store,
        status: "pending",
        agentRunId: input.agentRunId ?? null,
        orderTotal: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    return this.db
      .select()
      .from(groceryOrders)
      .where(eq(groceryOrders.id, id))
      .get()!;
  }

  async getById(id: string) {
    return (
      this.db
        .select()
        .from(groceryOrders)
        .where(eq(groceryOrders.id, id))
        .get() ?? null
    );
  }

  async getByGroceryListId(groceryListId: string) {
    return this.db
      .select()
      .from(groceryOrders)
      .where(eq(groceryOrders.groceryListId, groceryListId))
      .orderBy(desc(groceryOrders.createdAt))
      .all();
  }

  async getByGroceryListAndStore(groceryListId: string, store: string) {
    return (
      this.db
        .select()
        .from(groceryOrders)
        .where(
          and(
            eq(groceryOrders.groceryListId, groceryListId),
            eq(groceryOrders.store, store),
          ),
        )
        .get() ?? null
    );
  }

  async list() {
    return this.db
      .select()
      .from(groceryOrders)
      .orderBy(desc(groceryOrders.createdAt))
      .all();
  }

  async update(id: string, input: UpdateOrderInput) {
    const timestamp = now();
    const data: any = { updatedAt: timestamp };

    if (input.status !== undefined) data.status = input.status;
    if (input.agentRunId !== undefined) data.agentRunId = input.agentRunId;
    if (input.orderTotal !== undefined) data.orderTotal = input.orderTotal;
    if (input.errorMessage !== undefined)
      data.errorMessage = input.errorMessage;
    if (input.startedAt !== undefined) data.startedAt = input.startedAt;
    if (input.completedAt !== undefined) data.completedAt = input.completedAt;

    this.db
      .update(groceryOrders)
      .set(data)
      .where(eq(groceryOrders.id, id))
      .run();
  }
}
