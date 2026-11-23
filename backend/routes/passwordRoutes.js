
const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");

const User = require("../models/user");
const PasswordReset = require("../models/PasswordReset");
const {
  sendPasswordResetOTP,
} = require("../config/mailer");

const router = express.Router();

const OTP_EXPIRY = 10 * 60 * 1000;
const RESET_EXPIRY = 5 * 60 * 1000;
const RESEND_COOLDOWN = 60 * 1000;
const MAX_ATTEMPTS = 5;

const GENERIC_MESSAGE =
  "If the email is registered, a verification code will be sent.";

const normalizeEmail = (email) =>
  typeof email === "string"
    ? email.trim().toLowerCase()
    : "";

const validEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
  email.length <= 254;

const otpHash = (userId, otp) => {
  const secret = process.env.OTP_SECRET;

  if (!secret) {
    throw new Error("OTP_SECRET is missing");
  }

  return crypto
    .createHmac("sha256", secret)
    .update(`${userId}:${otp}`)
    .digest("hex");
};

const hashToken = (token) =>
  crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

const sameHash = (a, b) => {
  const first = Buffer.from(a, "hex");
  const second = Buffer.from(b, "hex");

  return (
    first.length === second.length &&
    crypto.timingSafeEqual(first, second)
  );
};

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Try again later.",
  },
});

router.use(limiter);

// SEND OTP / RESEND OTP
async function issueOTP(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!validEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address",
      });
    }

    const user = await User.findOne({ email });

    // Do not reveal whether the account exists.
    if (!user) {
      return res.status(200).json({
        success: true,
        message: GENERIC_MESSAGE,
      });
    }

    const existing = await PasswordReset.findOne({
      userId: user._id,
    });

    if (
      existing &&
      Date.now() - existing.lastSentAt.getTime() <
        RESEND_COOLDOWN
    ) {
      return res.status(200).json({
        success: true,
        message: GENERIC_MESSAGE,
      });
    }

    const otp = crypto
      .randomInt(100000, 1000000)
      .toString();

    const recordData = {
      otpHash: otpHash(user._id.toString(), otp),
      otpExpiresAt: new Date(Date.now() + OTP_EXPIRY),
      attempts: 0,
      lastSentAt: new Date(),
      verified: false,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
    };

    // Claim cooldown before sending to prevent duplicate emails.
    const now = new Date();
    const cutoff = new Date(
      Date.now() - RESEND_COOLDOWN
    );

    const claimed = await PasswordReset.findOneAndUpdate(
      {
        userId: user._id,
        $or: [
          { lastSentAt: { $lte: cutoff } },
          { lastSentAt: { $exists: false } },
        ],
      },
      { $set: recordData },
      { new: true }
    );

    if (!claimed) {
      try {
        await PasswordReset.create({
          userId: user._id,
          ...recordData,
        });
      } catch (error) {
        if (error.code === 11000) {
          return res.status(200).json({
            success: true,
            message: GENERIC_MESSAGE,
          });
        }
        throw error;
      }
    }

    try {
      await sendPasswordResetOTP(user.email, otp);
    } catch (mailError) {
      console.error("SMTP delivery failed:", mailError.message);

      // Invalidate only the OTP issued by this request.
      await PasswordReset.deleteOne({
        userId: user._id,
        otpHash: recordData.otpHash,
      });

      return res.status(503).json({
        success: false,
        message: "Email service unavailable. Try again later.",
      });
    }

    return res.status(200).json({
      success: true,
      message: GENERIC_MESSAGE,
    });
  } catch (error) {
    console.error("Issue OTP error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to process request",
    });
  }
}

router.post("/forgot-password", issueOTP);
router.post("/resend-otp", issueOTP);

// VERIFY OTP
router.post("/verify-otp", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = req.body?.otp;

    if (
      !validEmail(email) ||
      typeof otp !== "string" ||
      !/^\d{6}$/.test(otp)
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid email and 6-digit OTP required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    // Atomically increment attempts before comparison.
    const record = await PasswordReset.findOneAndUpdate(
      {
        userId: user._id,
        verified: false,
        otpExpiresAt: { $gt: new Date() },
        attempts: { $lt: MAX_ATTEMPTS },
      },
      { $inc: { attempts: 1 } },
      { new: true }
    );

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    const providedHash = otpHash(
      user._id.toString(),
      otp
    );

    if (!sameHash(record.otpHash, providedHash)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    const resetToken = crypto
      .randomBytes(32)
      .toString("hex");

    const verifiedRecord =
      await PasswordReset.findOneAndUpdate(
        {
          _id: record._id,
          verified: false,
          otpExpiresAt: { $gt: new Date() },
        },
        {
          $set: {
            verified: true,
            resetTokenHash: hashToken(resetToken),
            resetTokenExpiresAt: new Date(
              Date.now() + RESET_EXPIRY
            ),
          },
        },
        { new: true }
      );

    if (!verifiedRecord) {
      return res.status(400).json({
        success: false,
        message: "OTP already used or expired",
      });
    }

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      resetToken,
    });
  } catch (error) {
    console.error("Verify OTP error:", error);

    return res.status(500).json({
      success: false,
      message: "OTP verification failed",
    });
  }
});

// RESET PASSWORD
router.post("/reset-password", async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body || {};

    if (
      typeof resetToken !== "string" ||
      !/^[a-f0-9]{64}$/.test(resetToken) ||
      typeof newPassword !== "string" ||
      newPassword.length < 8 ||
      newPassword.length > 128
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid reset token and 8-128 character password required",
      });
    }

    // Consume reset token once.
    const record = await PasswordReset.findOneAndUpdate(
      {
        resetTokenHash: hashToken(resetToken),
        verified: true,
        resetTokenExpiresAt: { $gt: new Date() },
      },
      {
        $set: {
          verified: false,
          resetTokenHash: null,
          resetTokenExpiresAt: null,
        },
      },
      { new: true }
    );

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    const hashedPassword = await bcrypt.hash(
      newPassword,
      12
    );

    const updatedUser = await User.findByIdAndUpdate(
      record.userId,
      { $set: { password: hashedPassword } },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(400).json({
        success: false,
        message: "Unable to reset password",
      });
    }

    await PasswordReset.deleteOne({
      _id: record._id,
    });

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset password error:", error);

    return res.status(500).json({
      success: false,
      message: "Password reset failed",
    });
  }
});

module.exports = router;
