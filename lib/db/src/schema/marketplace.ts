import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts";

export const companionProfiles = pgTable("companion_profiles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  displayName: text("display_name").notNull(),
  city: text("city").notNull(),
  serviceArea: text("service_area").notNull(),
  activities: jsonb("activities").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  languages: jsonb("languages").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  hourlyRate: integer("hourly_rate").notNull(),
  dayRate: integer("day_rate"),
  responseTime: text("response_time").notNull().default("Usually within a day"),
  rating: numeric("rating").notNull().default("0"),
  reviewCount: integer("review_count").notNull().default(0),
  verified: boolean("verified").notNull().default(false),
  approved: boolean("approved").notNull().default(false),
  instantBook: boolean("instant_book").notNull().default(false),
  paused: boolean("paused").notNull().default(false),
  availableToday: boolean("available_today").notNull().default(false),
  biography: text("biography"),
  boundaries: jsonb("boundaries").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  photoUrl: text("photo_url"),
  stripeAccountId: text("stripe_account_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const companionApplications = pgTable("companion_applications", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  accountId: text("account_id").references(() => accounts.id),
  displayName: text("display_name").notNull(),
  email: text("email").notNull(),
  city: text("city").notNull(),
  bio: text("bio").notNull(),
  activities: jsonb("activities").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  languages: jsonb("languages").$type<string[]>().notNull().default(sql`'["English"]'::jsonb`),
  hourlyRate: integer("hourly_rate").notNull().default(60),
  status: text("status").notNull().default("pending"),
  reviewNote: text("review_note"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const serviceAreas = pgTable("service_areas", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  companionId: text("companion_id")
    .notNull()
    .references(() => companionProfiles.id),
  label: text("label").notNull(),
  city: text("city").notNull(),
  radiusKm: integer("radius_km").notNull().default(8),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const availabilityWindows = pgTable("availability_windows", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  companionId: text("companion_id")
    .notNull()
    .references(() => companionProfiles.id),
  weekday: integer("weekday").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const safespots = pgTable("safespots", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  category: text("category").notNull(),
  city: text("city").notNull(),
  addressHint: text("address_hint").notNull(),
  openLate: boolean("open_late").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const safespotApplications = pgTable("safespot_applications", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  type: text("type").notNull().default("other"),
  contactEmail: text("contact_email").notNull(),
  contactName: text("contact_name"),
  description: text("description"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const savedCompanions = pgTable("saved_companions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  companionId: text("companion_id")
    .notNull()
    .references(() => companionProfiles.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
