import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./lib/webhookHandlers";

const app: Express = express();

// ─── Stripe webhook — must be registered BEFORE express.json() ───────────────
// Stripe requires the raw request body as a Buffer for signature verification.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }

    if (!Buffer.isBuffer(req.body)) {
      logger.error(
        "Webhook body is not a Buffer — express.json() may have run first",
      );
      res.status(500).json({ error: "Webhook processing error" });
      return;
    }

    const sig = Array.isArray(signature) ? signature[0] : signature;

    try {
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "Stripe webhook processing failed");
      // Return 400 so Stripe knows not to retry an unrecoverable error;
      // return 200 for transient failures that should be retried.
      res.status(400).json({ error: message });
    }
  },
);
// ─────────────────────────────────────────────────────────────────────────────

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Restrict CORS to the app's own domain(s); fall back to open only in dev
app.use(cors({
  origin: (origin, callback) => {
    if (process.env.NODE_ENV === "development" || !origin) {
      callback(null, true); return;
    }
    const allowed = (process.env["REPLIT_DOMAINS"] ?? "")
      .split(",")
      .map((d) => `https://${d.trim()}`)
      .filter(Boolean);
    if (allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
