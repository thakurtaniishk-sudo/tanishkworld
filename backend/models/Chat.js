
const mongoose = require("mongoose");

const attachmentReferenceSchema = new mongoose.Schema(
  {
    attachmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attachment",
      required: true,
    },
    originalName: {
      type: String,
      required: true,
      maxlength: 255,
    },
    mimeType: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    processingStatus: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 20000,
    },
    attachments: {
      type: [attachmentReferenceSchema],
      default: [],
    },
  },
  {
    _id: true,
    timestamps: true,
  }
);

const chatSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: "New Chat",
      trim: true,
      maxlength: 100,
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

chatSchema.index({ userId: 1, updatedAt: -1 });

module.exports =
  mongoose.models.Chat ||
  mongoose.model("Chat", chatSchema);
