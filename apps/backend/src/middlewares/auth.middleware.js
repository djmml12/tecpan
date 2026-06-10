import jwt from "jsonwebtoken";
import db from "../config/db.js";

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ success: false, message: "Token requerido" });
    }

    const parts = authHeader.split(" ");

    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return res.status(401).json({ success: false, message: "Formato de token inválido" });
    }

    const token = parts[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = Number(decoded?.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ success: false, message: "Sesion invalida" });
    }

    const result = await db.query(
      `SELECT u.id, u.username, u.name, u.role_id, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = ? AND u.is_active = 1`,
      [userId]
    );
    const user = result.rows?.[0];

    if (!user) {
      return res.status(401).json({ success: false, message: "Sesion vencida. Inicia sesion nuevamente." });
    }

    req.user = {
      ...decoded,
      id: user.id,
      username: user.username,
      name: user.name,
      role_id: user.role_id,
      role_name: user.role_name,
      role: user.role_name,
    };
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Token expirado" });
    }

    return res.status(401).json({ success: false, message: "Token inválido" });
  }
};
