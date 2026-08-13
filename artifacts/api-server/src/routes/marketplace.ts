import { Router, type IRouter } from "express";
import {
  CreateBookingIntentBody,
  GetAdminOverviewResponse,
  GetCompanionDashboardResponse,
  GetCompanionParams,
  GetCustomerDashboardResponse,
  GetSafetyResourcesResponse,
  ListCompanionsQueryParams,
  ListSafeSpotsQueryParams,
} from "@workspace/api-zod";
import {
  getApprovedCompanion,
  getApprovedCompanions,
  getSafeSpots,
} from "../lib/supabase";

const router: IRouter = Router();

router.get("/companions", async (req, res) => {
  const query = ListCompanionsQueryParams.parse(req.query);
  try {
    const rows = await getApprovedCompanions();
    const companions = rows
      .filter((row) => {
        if (query.city && !row.city.toLowerCase().includes(query.city.toLowerCase())) {
          return false;
        }
        if (
          query.activity &&
          !row.activities.some((activity) =>
            activity.toLowerCase().includes(query.activity!.toLowerCase()),
          )
        ) {
          return false;
        }
        if (query.language && !row.languages.includes(query.language)) {
          return false;
        }
        if (query.maxRate !== undefined && row.hourly_rate > query.maxRate) {
          return false;
        }
        if (query.instantBook !== undefined && row.instant_book !== query.instantBook) {
          return false;
        }
        return true;
      })
      .map((row) => ({
        id: row.id,
        displayName: row.display_name,
        city: row.city,
        serviceArea: row.service_area,
        activities: row.activities,
        languages: row.languages,
        hourlyRate: row.hourly_rate,
        responseTime: row.response_time,
        rating: row.rating,
        reviewCount: row.review_count,
        verified: row.verified,
        instantBook: row.instant_book,
        biography: row.biography ?? null,
        boundaries: row.boundaries ?? [],
        photoUrl: row.photo_url ?? null,
      }));
    req.log.info({ count: companions.length }, "Listed approved companions");
    res.json(companions);
  } catch (error) {
    req.log.error({ err: error }, "Unable to read approved companions");
    res.status(503).json({ error: "Companion directory is temporarily unavailable" });
  }
});

router.get("/companions/:id", async (req, res) => {
  const { id } = GetCompanionParams.parse(req.params);
  try {
    const [row] = await getApprovedCompanion(id);
    if (!row) {
      res.status(404).json({ error: "Companion not found" });
      return;
    }
    res.json({
      id: row.id,
      displayName: row.display_name,
      city: row.city,
      serviceArea: row.service_area,
      activities: row.activities,
      languages: row.languages,
      hourlyRate: row.hourly_rate,
      responseTime: row.response_time,
      rating: row.rating,
      reviewCount: row.review_count,
      verified: row.verified,
      instantBook: row.instant_book,
      biography: row.biography ?? null,
      boundaries: row.boundaries ?? [],
      photoUrl: row.photo_url ?? null,
    });
  } catch (error) {
    req.log.error({ err: error }, "Unable to read companion profile");
    res.status(503).json({ error: "Companion profile is temporarily unavailable" });
  }
});

router.get("/dashboard/customer", (req, res) => {
  req.log.info("Customer dashboard requires authentication");
  res.status(401).json({ error: "Authentication required" });
});

router.get("/dashboard/companion", (req, res) => {
  req.log.info("Companion dashboard requires authentication");
  res.status(401).json({ error: "Authentication required" });
});

router.get("/admin/overview", (req, res) => {
  req.log.warn("Admin overview requires server-verified admin role");
  res.status(401).json({ error: "Authentication required" });
});

router.get("/safety", (_req, res) => {
  const data = GetSafetyResourcesResponse.parse({
    title: "Your safety comes first",
    emergencyGuidance:
      "If you are in immediate danger, contact local emergency services. OnlyFavors is not an emergency response service.",
    principles: [
      "Meet in a public SafeSpot and keep your own transportation plan.",
      "Share a timed safety plan with someone you trust.",
      "Keep payments and messages on OnlyFavors.",
      "Respect stated boundaries and report concerns early.",
    ],
  });
  res.json(data);
});

router.get("/safespots", async (req, res) => {
  const query = ListSafeSpotsQueryParams.parse(req.query);
  try {
    const rows = await getSafeSpots(query.city);
    res.json(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        city: row.city,
        addressHint: row.address_hint,
        openLate: row.open_late,
      })),
    );
  } catch (error) {
    req.log.error({ err: error }, "Unable to read SafeSpots");
    res.status(503).json({ error: "SafeSpots are temporarily unavailable" });
  }
});

router.post("/bookings", (req, res) => {
  CreateBookingIntentBody.parse(req.body);
  req.log.info("Booking intent requires authentication");
  res.status(401).json({ error: "Authentication required" });
});

export default router;