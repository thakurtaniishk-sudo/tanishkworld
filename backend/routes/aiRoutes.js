
const express = require("express");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const {
  generateAIResponse,
  normalizeResponseLanguage,
} = require("../services/groqService");

const router = express.Router();

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Try again later.",
  },
});

// Use existing JWT middleware if your project has one.
// This example expects HS256 JWT signed using JWT_SECRET.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Login required",
    });
  }

  try {
    const token = header.slice(7);

    req.user = jwt.verify(
      token,
      process.env.JWT_SECRET,
      { algorithms: ["HS256"] }
    );

    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}

router.post(
  "/message",
  requireAuth,
  aiLimiter,
  async (req, res) => {
    try {
      const { message, history = [], language } = req.body || {};
      const responseLanguage = normalizeResponseLanguage(language);

      if (typeof language === "string" && responseLanguage === "auto") {
        return res.status(400).json({
          success: false,
          message: "Language must be English (en) or Hindi (hi).",
        });
      }

      if (
        typeof message !== "string" ||
        !message.trim() ||
        message.length > 4000
      ) {
        return res.status(400).json({
          success: false,
          message: "Message must be 1–4000 characters",
        });
      }

      if (
        !Array.isArray(history) ||
        history.length > 20 ||
        !history.every(
          (item) =>
            item &&
            ["user", "assistant"].includes(item.role) &&
            typeof item.content === "string" &&
            item.content.length > 0 &&
            item.content.length <= 4000
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid chat history",
        });
      }

      const messages = [
        ...history,
        {
          role: "user",
          content: message.trim(),
        },
      ];

      const reply = await generateAIResponse(messages, {
        language: responseLanguage,
      });

      return res.json({
        success: true,
        reply,
        language: responseLanguage,
      });
    } catch (error) {
      console.error("Groq API error:", error.message);

      return res.status(
        error.status === 429 ? 429 : 502
      ).json({
        success: false,
        message:
          error.status === 429
            ? "AI rate limit reached. Try again later."
            : "AI service unavailable. Try again.",
      });
    }
  }
);

module.exports = router;
