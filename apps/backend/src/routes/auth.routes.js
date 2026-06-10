import express from "express";
import rateLimit from "express-rate-limit";
import { login } from "../controllers/auth.controller.js";

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Demasiados intentos de acceso. Intenta en 15 minutos." },
});

router.post("/login", loginLimiter, login);

export default router;
