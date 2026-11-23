
const jwt = require("jsonwebtoken");

function chatAuth(req, res, next) {
  const authorization =
    req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Login required",
    });
  }

  try {
    const token = authorization.slice(7).trim();

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET not configured");
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET,
      { algorithms: ["HS256"] }
    );

    // Match this field with your existing login JWT.
    const userId =
      decoded.userId ||
      decoded.id ||
      decoded._id ||
      decoded.sub;

    if (
      typeof userId !== "string" ||
      !userId.trim()
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid user identity in token",
      });
    }

    req.userId = userId;

    next();
  } catch (error) {
    console.error("Chat auth failed:", error.message);

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}

module.exports = chatAuth;
