CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text,
	"companion_id" text NOT NULL,
	"activity" text NOT NULL,
	"date" text NOT NULL,
	"start_time" text NOT NULL,
	"duration_hours" numeric NOT NULL,
	"safe_spot_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"customer_fee_cents" integer,
	"platform_fee_cents" integer,
	"total_cents" integer NOT NULL,
	"companion_payout_cents" integer,
	"platform_revenue_cents" integer,
	"deposit_cents" integer DEFAULT 1000 NOT NULL,
	"deposit_payment_intent_id" text,
	"deposit_paid_at" timestamp,
	"full_payment_intent_id" text,
	"authorized_at" timestamp,
	"confirmed_at" timestamp,
	"completed_at" timestamp,
	"cancelled_at" timestamp,
	"stripe_payment_intent_id" text,
	"stripe_connect_account_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companion_stripe_accounts" (
	"companion_id" text PRIMARY KEY NOT NULL,
	"stripe_account_id" text NOT NULL,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favor_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"companion_id" text NOT NULL,
	"activity" text NOT NULL,
	"preferred_date" text NOT NULL,
	"preferred_duration_hours" numeric NOT NULL,
	"location_type" text,
	"accessibility_needs" text,
	"dress_code" text,
	"additional_questions" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
