import { defineAction, z, type ActionsModule } from "@hatch/space-sdk";
import { asc, eq } from "drizzle-orm";
import * as schema from "./schema";

const statusSchema = z.enum(["pending", "covered", "paid", "needs_attention"]);
const recurringSchema = z.enum(["none", "monthly", "biweekly"]);
const billSchema = z.object({
  id: z.number(),
  name: z.string(),
  amountCents: z.number().nullable(),
  dueDate: z.string().nullable(),
  status: statusSchema,
  priority: z.number(),
  category: z.string(),
  account: z.string(),
  note: z.string(),
  recurring: recurringSchema,
  updatedAt: z.string(),
});
const allocationSchema = z.object({
  id: z.number(),
  label: z.string(),
  amountCents: z.number(),
  sortOrder: z.number(),
  protected: z.boolean(),
  note: z.string(),
});
const settingsSchema = z.object({
  paycheckCents: z.number(),
  nextPayday: z.string(),
  cadence: z.string(),
  focusAccount: z.string(),
});
const okSchema = z.object({ ok: z.literal(true) });

const initialBills: Array<typeof schema.bills.$inferInsert> = [
  { name: "State Farm", amountCents: 11840, dueDate: "2026-08-28", status: "needs_attention", priority: 1, category: "Insurance", account: "BofA", note: "Past due. Revisit after Oct 5; lapse risk.", recurring: "monthly", createdAt: new Date(), updatedAt: new Date() },
  { name: "Mazda Financial", amountCents: 26214, dueDate: "2026-09-29", status: "needs_attention", priority: 2, category: "Car", account: "BofA", note: "Pay from the Oct 9 paycheck. Monthly payment is $676.07; protect $338 from each check.", recurring: "monthly", createdAt: new Date(), updatedAt: new Date() },
  { name: "HFD dental", amountCents: 2456, dueDate: "2026-09-29", status: "needs_attention", priority: 3, category: "Health", account: "BofA", note: "Auto-debit failed. Balance: $181.76. Catch up after Oct 5.", recurring: "monthly", createdAt: new Date(), updatedAt: new Date() },
  { name: "Split Pay · first half", amountCents: 52499, dueDate: "2026-10-01", status: "covered", priority: 4, category: "Rent", account: "FAIRWINDS", note: "Secured through the dedicated FAIRWINDS account.", recurring: "monthly", createdAt: new Date(), updatedAt: new Date() },
  { name: "iCloud+ 200GB", amountCents: 299, dueDate: "2026-09-30", status: "needs_attention", priority: 5, category: "Subscription", account: "BofA", note: "Payment information needs attention.", recurring: "monthly", createdAt: new Date(), updatedAt: new Date() },
  { name: "Disney+ Basic", amountCents: 1199, dueDate: "2026-10-07", status: "pending", priority: 6, category: "Subscription", account: "BofA", note: "Renews monthly.", recurring: "monthly", createdAt: new Date(), updatedAt: new Date() },
  { name: "Google AI Plus", amountCents: 499, dueDate: "2026-10-09", status: "pending", priority: 7, category: "Subscription", account: "BofA", note: "Renews monthly.", recurring: "monthly", createdAt: new Date(), updatedAt: new Date() },
  { name: "Verizon", amountCents: 2670, dueDate: "2026-10-10", status: "pending", priority: 8, category: "Phone", account: "BofA", note: "Auto Pay scheduled.", recurring: "monthly", createdAt: new Date(), updatedAt: new Date() },
  { name: "Split Pay · second half", amountCents: 50000, dueDate: "2026-10-15", status: "pending", priority: 9, category: "Rent", account: "BofA", note: "Second rent installment, about two weeks after the first.", recurring: "monthly", createdAt: new Date(), updatedAt: new Date() },
  { name: "Microsoft 365", amountCents: 999, dueDate: null, status: "needs_attention", priority: 10, category: "Subscription", account: "BofA", note: "Billing problem notice; verify in the App Store.", recurring: "monthly", createdAt: new Date(), updatedAt: new Date() },
  { name: "AT&T Wireless", amountCents: null, dueDate: null, status: "needs_attention", priority: 11, category: "Phone", account: "BofA", note: "Balance and due date still need verification.", recurring: "monthly", createdAt: new Date(), updatedAt: new Date() },
  { name: "Enterprise", amountCents: 6527, dueDate: null, status: "needs_attention", priority: 12, category: "Collections", account: "BofA", note: "60 days past due; rental privileges suspended until paid.", recurring: "none", createdAt: new Date(), updatedAt: new Date() },
];

const initialAllocations: Array<typeof schema.allocations.$inferInsert> = [
  { label: "Mazda reserve", amountCents: 33800, sortOrder: 1, protected: true, note: "Move this first on payday.", createdAt: new Date(), updatedAt: new Date() },
  { label: "Rent / Split Pay", amountCents: 51200, sortOrder: 2, protected: true, note: "Half of the monthly rent lane.", createdAt: new Date(), updatedAt: new Date() },
  { label: "State Farm", amountCents: 5900, sortOrder: 3, protected: true, note: "Half of the monthly premium.", createdAt: new Date(), updatedAt: new Date() },
  { label: "HFD + subscriptions", amountCents: 2700, sortOrder: 4, protected: false, note: "Dental and small recurring charges.", createdAt: new Date(), updatedAt: new Date() },
  { label: "Phones", amountCents: 6300, sortOrder: 5, protected: false, note: "AT&T and Verizon lane.", createdAt: new Date(), updatedAt: new Date() },
  { label: "Baby + car buffer", amountCents: 12000, sortOrder: 6, protected: true, note: "Roll unused money forward.", createdAt: new Date(), updatedAt: new Date() },
  { label: "Gas, food + living", amountCents: 12000, sortOrder: 7, protected: false, note: "Flexible spending after protected lanes.", createdAt: new Date(), updatedAt: new Date() },
];

export const Actions = {
  getDashboard: defineAction({
    request: z.object({}),
    response: z.object({ bills: z.array(billSchema), allocations: z.array(allocationSchema), settings: settingsSchema.nullable() }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const [billRows, allocationRows, settingsRows] = await Promise.all([
        db.select().from(schema.bills).orderBy(asc(schema.bills.priority), asc(schema.bills.id)),
        db.select().from(schema.allocations).orderBy(asc(schema.allocations.sortOrder), asc(schema.allocations.id)),
        db.select().from(schema.settings).limit(1),
      ]);
      const settingsRow = settingsRows[0];
      return {
        bills: billRows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
        allocations: allocationRows.map((row) => ({ id: row.id, label: row.label, amountCents: row.amountCents, sortOrder: row.sortOrder, protected: row.protected, note: row.note })),
        settings: settingsRow ? { paycheckCents: settingsRow.paycheckCents, nextPayday: settingsRow.nextPayday, cadence: settingsRow.cadence, focusAccount: settingsRow.focusAccount } : null,
      };
    },
  }),

  initializeBudget: defineAction({
    request: z.object({}),
    response: z.object({ created: z.boolean() }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const existing = await db.select({ id: schema.settings.id }).from(schema.settings).limit(1);
      if (existing.length > 0) return { created: false };
      await db.insert(schema.settings).values({ id: 1, paycheckCents: 124150, nextPayday: "2026-10-09", cadence: "Biweekly", focusAccount: "BofA", updatedAt: new Date() });
      await db.insert(schema.bills).values(initialBills);
      await db.insert(schema.allocations).values(initialAllocations);
      ctx.invalidateQueries();
      return { created: true };
    },
  }),

  saveBill: defineAction({
    request: z.object({
      id: z.number().int().positive().optional(),
      name: z.string().trim().min(1).max(80),
      amountCents: z.number().int().min(0).nullable(),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      status: statusSchema,
      priority: z.number().int().min(1).max(99),
      category: z.string().trim().min(1).max(40),
      account: z.string().trim().min(1).max(40),
      note: z.string().trim().max(300),
      recurring: recurringSchema,
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const now = new Date();
      if (args.id) {
        await db.update(schema.bills).set({ name: args.name, amountCents: args.amountCents, dueDate: args.dueDate, status: args.status, priority: args.priority, category: args.category, account: args.account, note: args.note, recurring: args.recurring, updatedAt: now }).where(eq(schema.bills.id, args.id));
        ctx.invalidateQueries();
        return { id: args.id };
      }
      const result = await db.insert(schema.bills).values({ name: args.name, amountCents: args.amountCents, dueDate: args.dueDate, status: args.status, priority: args.priority, category: args.category, account: args.account, note: args.note, recurring: args.recurring, createdAt: now, updatedAt: now }).returning({ id: schema.bills.id });
      const inserted = result[0];
      if (!inserted) throw new Error("Could not save this bill.");
      ctx.invalidateQueries();
      return { id: inserted.id };
    },
  }),

  setBillStatus: defineAction({
    request: z.object({ id: z.number().int().positive(), status: statusSchema }),
    response: okSchema,
    async handler(ctx, args): Promise<z.infer<typeof okSchema>> {
      const db = ctx.db<typeof schema>();
      await db.update(schema.bills).set({ status: args.status, updatedAt: new Date() }).where(eq(schema.bills.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  deleteBill: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: okSchema,
    async handler(ctx, args): Promise<z.infer<typeof okSchema>> {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.bills).where(eq(schema.bills.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  saveAllocation: defineAction({
    request: z.object({ id: z.number().int().positive().optional(), label: z.string().trim().min(1).max(80), amountCents: z.number().int().min(0), sortOrder: z.number().int().min(1).max(99), protected: z.boolean(), note: z.string().trim().max(200) }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const now = new Date();
      if (args.id) {
        await db.update(schema.allocations).set({ label: args.label, amountCents: args.amountCents, sortOrder: args.sortOrder, protected: args.protected, note: args.note, updatedAt: now }).where(eq(schema.allocations.id, args.id));
        ctx.invalidateQueries();
        return { id: args.id };
      }
      const result = await db.insert(schema.allocations).values({ label: args.label, amountCents: args.amountCents, sortOrder: args.sortOrder, protected: args.protected, note: args.note, createdAt: now, updatedAt: now }).returning({ id: schema.allocations.id });
      const inserted = result[0];
      if (!inserted) throw new Error("Could not save this allocation.");
      ctx.invalidateQueries();
      return { id: inserted.id };
    },
  }),

  deleteAllocation: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: okSchema,
    async handler(ctx, args): Promise<z.infer<typeof okSchema>> {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.allocations).where(eq(schema.allocations.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  saveSettings: defineAction({
    request: settingsSchema,
    response: okSchema,
    async handler(ctx, args): Promise<z.infer<typeof okSchema>> {
      const db = ctx.db<typeof schema>();
      const existing = await db.select({ id: schema.settings.id }).from(schema.settings).limit(1);
      if (existing.length > 0) {
        await db.update(schema.settings).set({ paycheckCents: args.paycheckCents, nextPayday: args.nextPayday, cadence: args.cadence, focusAccount: args.focusAccount, updatedAt: new Date() }).where(eq(schema.settings.id, 1));
      } else {
        await db.insert(schema.settings).values({ id: 1, ...args, updatedAt: new Date() });
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
} satisfies ActionsModule;
