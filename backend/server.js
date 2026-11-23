
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const passwordRoutes = require("./routes/passwordRoutes");
const aiRoutes = require("./routes/aiRoutes");
const chatRoutes = require("./routes/chatRoutes");
const cleanupStaleAttachments = require("./services/attachmentCleanup");

// Import User Routes
const userRoutes = require("./routes/userRoutes");

// Create Express App
const app = express();

// Middleware
app.use(cors({
  origin: "http://localhost:5173"
}));

app.use(express.json());

app.use("/api/ai", aiRoutes);
app.use("/api/chats", chatRoutes);

app.use("/api/auth", passwordRoutes);

// API Routes
app.use("/api/users", userRoutes);

// Test Route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "TanishkWorld Backend is Running!"
  });
});

// Server Port
const PORT = process.env.PORT || 5000;

// MongoDB Connection + Start Server
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB Connected Successfully!");

    await cleanupStaleAttachments().catch((error) => {
      console.error("Initial attachment cleanup failed:", error);
    });

    const cleanupTimer = setInterval(() => {
      cleanupStaleAttachments().catch((error) => {
        console.error("Scheduled attachment cleanup failed:", error);
      });
    }, 6 * 60 * 60 * 1000);
    cleanupTimer.unref();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error("Server Error:", error.message);
    process.exit(1);
  }
};

startServer();
