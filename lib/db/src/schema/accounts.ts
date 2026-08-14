import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export type AccountPrefs = {
  emailBookingUpdates?: boolean;
  emailNewsletter?: boolean;
  showSavedCount?: boolean;
};

/**
 * One account per email. Roles live in `account_roles` — never in
 * client-editable metadata.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text("email").notNull(),
    displayName: text("display_name"),
    prefs: jsonb("prefs").$type<AccountPrefs>().notNull().default(sql`'{}'::jsonb`),
    ageConfirmedAt: timestamp("age_confirmed_at"),
    suspendedAt: timestamp("suspended_at"),
    suspensionReason: text("suspension_reason"),
    bannedAt: timestamp("banned_at"),
    deactivatedAt: timestamp("deactivated_at"),
    deletedAt: timestamp("deleted_at"),
    riskLevel: text("risk_level").notNull().default("standard"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("accounts_email_idx").on(table.email)],
);

/** Protected roles: customer | companion | admin. Written only by the server. */
export const accountRoles = pgTable(
  "account_roles",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    role: text("role").notNull(),
    grantedAt: timestamp("granted_at").defaultNow().notNull(),
    grantedBy: text("granted_by"),
  },
  (table) => [uniqueIndex("account_roles_account_role_idx").on(table.accountId, table.role)],
);

export const otpChallenges = pgTable("otp_challenges", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  purpose: text("purpose").notNull().default("login"),
  attempts: integer("attempts").notNull().default(0),
  consumedAt: timestamp("consumed_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  tokenHash: text("token_hash").notNull(),
  revokedAt: timestamp("revoked_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const platformSettings = pgTable("platform_settings", {
  id: text("id").primaryKey().default("default"),
  platformFeePercent: integer("platform_fee_percent").notNull().default(20),
  accessFeeCents: integer("access_fee_cents").notNull().default(0),
  accessFeeEnabled: boolean("access_fee_enabled").notNull().default(false),
  accessFeeLabel: text("access_fee_label").notNull().default("Messaging access"),
  announcementMessage: text("announcement_message").notNull().default(""),
  announcementKind: text("announcement_kind").notNull().default("info"),
  announcementActive: boolean("announcement_active").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
