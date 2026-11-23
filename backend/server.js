
require("dotenv").config();

const dns = require("node:dns");

// Fix MongoDB Atlas SRV DNS resolution in local development.
// Preserve the hosting provider's DNS settings in production.
if (process.env.NODE_ENV !== "production") {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const passwordRoutes = require("./routes/passwordRoutes");
const aiRoutes = require("./routes/aiRoutes");
const chatRoutes = require("./routes/chatRoutes");
const cleanupStaleAttachments = require("./services/attachmentCleanup");
const userRoutes = require("./routes/userRoutes");

// Create Express App
const app = express();

// CORS Configuration
const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL,
]
  .filter(Boolean)
  .map((origin) => origin.replace(/\/$/, ""));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
  })
);

// Middleware
app.use(express.json());

// AI Routes
app.use("/api/ai", aiRoutes);

// Chat Routes
app.use("/api/chats", chatRoutes);

// Authentication Routes
app.use("/api/auth", passwordRoutes);

// User Routes
app.use("/api/users", userRoutes);

// Health Check Route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "TanishkWorld Backend is Running!",
  });
});

// Server Port
const PORT = process.env.PORT || 5000;

// MongoDB Connection + Start Server
const startServer = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error(
        "MONGO_URI is missing from environment variables"
      );
    }

    console.log("Connecting to MongoDB Atlas...");

    if (process.env.NODE_ENV !== "production") {
      console.log("DNS Servers:", dns.getServers());
    }

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
    });

    console.log("MongoDB Connected Successfully!");

    // Initial Attachment Cleanup
    try {
      await cleanupStaleAttachments();
      console.log("Initial attachment cleanup completed");
    } catch (error) {
      console.error(
        "Initial attachment cleanup failed:",
        error.message
      );
    }

    // Scheduled Attachment Cleanup - Every 6 Hours
    const cleanupTimer = setInterval(() => {
      cleanupStaleAttachments().catch((error) => {
        console.error(
          "Scheduled attachment cleanup failed:",
          error.message
        );
      });
    }, 6 * 60 * 60 * 1000);

    cleanupTimer.unref();

    // Start Express Server
    app.listen(PORT, "0.0.0.0", () => {
      console.log("--------------------------------");
      console.log("TanishkWorld Backend Started");
      console.log(`Server running on port ${PORT}`);
      console.log("MongoDB Status: Connected");
      console.log("--------------------------------");
    });
  } catch (error) {
    console.error("Server Startup Failed!");
    console.error("Error Name:", error.name);
    console.error("Error Message:", error.message);

    if (error.code) {
      console.error("Error Code:", error.code);
    }

    process.exit(1);
  }
};

startServer();
