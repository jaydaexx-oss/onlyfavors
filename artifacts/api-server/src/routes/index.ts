import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import marketplaceRouter from "./marketplace";
import stripeRouter from "./stripe";
import paymentsRouter from "./payments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(marketplaceRouter);
router.use(stripeRouter);
router.use(paymentsRouter);

export default router;
