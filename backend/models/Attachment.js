const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
      index: true,
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    originalName: {
      type: String,
      required: true,
      maxlength: 255,
    },
    storedName: {
      type: String,
      required: true,
      unique: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
      min: 1,
    },
    storageKey: {
      type: String,
      required: true,
      unique: true,
    },
    contentHash: {
      type: String,
      required: true,
    },
    extractedText: {
      type: String,
      select: false,
      maxlength: 200000,
      default: "",
    },
    processingStatus: {
      type: String,
      enum: [
        "ready",
        "no_text",
        "vision_ready",
        "vision_unavailable",
      ],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

attachmentSchema.index({ userId: 1, chatId: 1, createdAt: -1 });
attachmentSchema.index(
  { userId: 1, chatId: 1, contentHash: 1 },
  { unique: true }
);
attachmentSchema.index({ messageId: 1, createdAt: 1 });

module.exports =
  mongoose.models.Attachment ||
  mongoose.model("Attachment", attachmentSchema);
