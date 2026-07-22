import Joi from "joi";

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