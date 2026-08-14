import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { bookings } from "./bookings";

export const trustedContacts = pgTable("trusted_contacts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  relation: text("relation"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const checkIns = pgTable("check_ins", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  bookingId: text("booking_id")
    .notNull()
    .references(() => bookings.id),
  accountId: text("account_id").references(() => accounts.id),
  venue: text("venue"),
  kind: text("kind").notNull().default("arrival"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const incidentReports = pgTable("incident_reports", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  reporterId: text("reporter_id").references(() => accounts.id),
  subjectAccountId: text("subject_account_id"),
  companionId: text("companion_id"),
  bookingId: text("booking_id"),
  reportType: text("report_type").notNull(),
  detail: text("detail").notNull(),
  urgent: boolean("urgent").notNull().default(false),
  status: text("status").notNull().default("open"),
  riskLevel: text("risk_level").notNull().default("standard"),
  resolutionNote: text("resolution_note"),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reviews = pgTable("reviews", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  bookingId: text("booking_id")
    .notNull()
    .references(() => bookings.id),
  companionId: text("companion_id").notNull(),
  customerId: text("customer_id").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  href: text("href").notNull().default("/"),
  audience: text("audience").notNull().default("customer"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const adminAuditLog = pgTable("admin_audit_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
