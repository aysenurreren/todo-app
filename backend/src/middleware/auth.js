import jwt from "jsonwebtoken";
import { isTokenActive } from "../db/redis.js";

export const authenticate = async (req, res, next) => {
  try {
    // 1. Header var mı?
    const authHeader = req.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // 2. Token'ı ayıkla
    const token = authHeader.slice(7);

    // 3. JWT imzasını ve süresini doğrula
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // 4. Redis'te aktif mi?
    const aktif = await isTokenActive(payload.jti);
    if (!aktif) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // 5. Kullanıcı bilgisini request'e ekle
    req.user = {
      id: payload.sub,
      email: payload.email,
      jti: payload.jti,
    };

    next();
  } catch (err) {
    console.error("[Auth Middleware] Hata:", err.message);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

