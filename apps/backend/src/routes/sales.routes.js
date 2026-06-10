import { Router } from "express";
import {
  createSale,
  getOpenSales,
  getPaidSales,
  getSaleById,
  updateSale,
  paySale,
  paySaleWithTip,
  cancelSale,
} from "../controllers/sales.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { authorize } from "../middlewares/role.middleware.js";

const router = Router();

router.post("/", authMiddleware, createSale);
router.get("/open", authMiddleware, getOpenSales);
router.get("/paid", authMiddleware, getPaidSales);
router.get("/:id", authMiddleware, getSaleById);
router.patch("/:id", authMiddleware, updateSale);
router.post("/:id/pay", authMiddleware, paySale);
router.post("/:id/pay-with-tip", authMiddleware, paySaleWithTip);
router.post("/:id/cancel", authMiddleware, authorize("admin", "supervisor"), cancelSale);

export default router;
