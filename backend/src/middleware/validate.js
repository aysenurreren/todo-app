import Joi from "joi";
import { body, validationResult } from "express-validator";

// ── Şemalar ────────────────────────────────────────────────────
export const schemas = {
  register: Joi.object({
    email:    Joi.string().email().required(),
    password: Joi.string().min(8).required(),
  }),

  createTask: Joi.object({
    title: Joi.string().min(1).max(500).required(),
  }),

  updateTask: Joi.object({
    title:        Joi.string().min(1).max(500),
    is_completed: Joi.boolean(),
  }).min(1),
  // .min(1) → en az bir alan gönderilmeli

  login: Joi.object({
    email:    Joi.string().email().required(),
    password: Joi.string().min(1).required(),
  }),
};

// ── Middleware Factory ─────────────────────────────────────────
export const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,   // tüm hataları topla, ilkinde durma
    stripUnknown: true,  // şemada olmayan alanları temizle
  });

  if (error) {
    return res.status(400).json({
      error: "Bad Request",
      details: error.details.map((d) => d.message),
    });
  }

  req.body = value; // temizlenmiş veriyi geri yaz
  next();
};

// ── Sanitization Kuralları ─────────────────────────────────────

export const sanitizeRegister = [
  body("email")
    .trim()                    // baştaki sondaki boşlukları sil
    .normalizeEmail()          // büyük harfi küçüğe çevir, noktaları normalize et
    .escape(),                 // HTML karakterlerini etkisizleştir

  body("password")
    .trim(),                   // boşlukları temizle
];

export const sanitizeTask = [
  body("title")
    .trim()                    // boşlukları temizle
    .escape()                  // <script> gibi tehlikeli karakterleri etkisizleştir
    .stripLow(),               // kontrol karakterlerini sil (null byte vs.)
];

export const sanitizeProfile = [
  body("full_name")
    .trim()
    .escape()
    .stripLow(),
];

// ── Sanitization Sonuç Kontrolü ────────────────────────────────
export const checkSanitization = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Bad Request",
      details: errors.array().map(e => e.msg),
    });
  }
  next();
};