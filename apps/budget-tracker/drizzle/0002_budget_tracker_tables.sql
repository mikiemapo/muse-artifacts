DROP TABLE entries;
--> statement-breakpoint
CREATE TABLE settings (
  id INTEGER PRIMARY KEY,
  paycheck_cents INTEGER NOT NULL,
  next_payday TEXT NOT NULL,
  cadence TEXT NOT NULL,
  focus_account TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount_cents INTEGER,
  due_date TEXT,
  status TEXT NOT NULL,
  priority INTEGER NOT NULL,
  category TEXT NOT NULL,
  account TEXT NOT NULL,
  note TEXT NOT NULL,
  recurring TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  sort_order INTEGER NOT NULL,
  protected INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);