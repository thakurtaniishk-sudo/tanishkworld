
const express = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const Chat = require("../models/Chat");
const Attachment = require("../models/Attachment");
const chatAuth = require("../middleware/chatAuth");

const {
  generateAIResponse,
  streamAIResponse,
  normalizeResponseLanguage,
} = require("../services/groqService");
const {
  getStoragePath,
  getStorageRoot,
  processUploadedFile,
  selectRelevantChunks,
  validateDeclaredType,
} = require("../services/attachmentService");
const router = express.Router();

router.use(chatAuth);

const maxFileSizeMb = Number(
  process.env.ATTACHMENT_MAX_FILE_SIZE_MB || 10
);

if (
  !Number.isFinite(maxFileSizeMb) ||
  maxFileSizeMb <= 0 ||
  maxFileSizeMb > 50
) {
  throw new Error(
    "ATTACHMENT_MAX_FILE_SIZE_MB must be greater than 0 and no more than 50."
  );
}

const MAX_FILE_SIZE_BYTES = Math.floor(
  maxFileSizeMb * 1024 * 1024
);
const MAX_FILES_PER_MESSAGE = 5;

const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many AI requests. Try again later.",
  },
});

const attachmentLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many file uploads. Try again later.",
  },
});

const storageRoot = getStorageRoot();
fs.mkdirSync(storageRoot, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, storageRoot);
    },
    filename: (_req, _file, callback) => {
      callback(null, `${crypto.randomUUID()}.upload`);
    },
  }),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_FILES_PER_MESSAGE,
    fields: 0,
  },
  fileFilter: (_req, file, callback) => {
    try {
      validateDeclaredType(file);
      callback(null, true);
    } catch (error) {
      error.status = 400;
      callback(error);
    }
  },
});

function isValidId(id) {
  return mongoose.isValidObjectId(id);
}

function getPublicAttachment(attachment) {
  return {
    _id: attachment._id,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    processingStatus: attachment.processingStatus,
    createdAt: attachment.createdAt,
  };
}

async function validateUploadChat(req, res, next) {
  const chatId = req.query.chatId;

  if (!isValidId(chatId)) {
    return res.status(400).json({
      success: false,
      message: "A valid chatId is required to upload attachments.",
    });
  }

  try {
    const chat = await Chat.exists({
      _id: chatId,
      userId: req.userId,
    });

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    req.attachmentChatId = chatId;
    return next();
  } catch (error) {
    return serverError(res, error);
  }
}

async function removeStoredFile(storageKey) {
  try {
    await fs.promises.unlink(getStoragePath(storageKey));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function serverError(res, error) {
  console.error("Chat API error:", error);

  return res.status(500).json({
    success: false,
    message: "Something went wrong. Please try again.",
  });
}

// Upload private attachments for an owned conversation.
router.post(
  "/attachments",
  attachmentLimiter,
  validateUploadChat,
  upload.array("files", MAX_FILES_PER_MESSAGE),
  async (req, res) => {
    const files = req.files || [];
    const createdIds = [];
    const finalKeys = [];

    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Select at least one file to upload.",
      });
    }

    try {
      const prepared = [];

      for (const file of files) {
        let processed;
        try {
          processed = await processUploadedFile(file);
        } catch (error) {
          error.status = 400;
          throw error;
        }
        const storedName = `${crypto.randomUUID()}${processed.extension}`;
        const storageKey = storedName;
        const originalName = path
          .basename(file.originalname.replace(/\\/g, "/"))
          .replace(/[\u0000-\u001f\u007f]/g, "_")
          .slice(0, 255);

        prepared.push({
          file,
          processed,
          storedName,
          storageKey,
          originalName,
        });
      }

      const records = [];
      const existing = await Attachment.find({
        userId: req.userId,
        chatId: req.attachmentChatId,
        contentHash: {
          $in: prepared.map((item) => item.processed.contentHash),
        },
      }).lean();
      const existingByHash = new Map(
        existing.map((item) => [item.contentHash, item])
      );
      const newItems = [];
      const newHashes = new Set();
      for (const item of prepared) {
        const hash = item.processed.contentHash;
        if (!existingByHash.has(hash) && !newHashes.has(hash)) {
          newItems.push(item);
          newHashes.add(hash);
        }
      }

      for (const item of newItems) {
        const destination = getStoragePath(item.storageKey);
        await fs.promises.rename(item.file.path, destination);
        finalKeys.push(item.storageKey);
      }

      for (const item of prepared) {
        const existingAttachment = existingByHash.get(
          item.processed.contentHash
        );

        if (existingAttachment) {
          await fs.promises.unlink(item.file.path);
          records.push(getPublicAttachment(existingAttachment));
          continue;
        }

        const attachment = await Attachment.create({
          userId: req.userId,
          chatId: req.attachmentChatId,
          originalName: item.originalName,
          storedName: item.storedName,
          mimeType: item.processed.mimeType,
          fileSize: item.file.size,
          storageKey: item.storageKey,
          contentHash: item.processed.contentHash,
          extractedText: item.processed.extractedText,
          processingStatus: item.processed.processingStatus,
        });
        existingByHash.set(item.processed.contentHash, attachment);
        createdIds.push(attachment._id);
        records.push(getPublicAttachment(attachment));
      }

      return res.status(201).json({
        success: true,
        attachments: records,
      });
    } catch (error) {
      if (createdIds.length > 0) {
        await Attachment.deleteMany({
          _id: { $in: createdIds },
          userId: req.userId,
        });
      }

      await Promise.all(
        files.map(async (file) => {
          try {
            await fs.promises.unlink(file.path);
          } catch (cleanupError) {
            if (cleanupError.code !== "ENOENT") {
              console.error("Temporary attachment cleanup failed:", cleanupError);
            }
          }
        })
      );

      await Promise.all(
        finalKeys.map(async (key) => {
          try {
            await removeStoredFile(key);
          } catch (cleanupError) {
            console.error("Attachment cleanup failed:", cleanupError);
          }
        })
      );

      console.error("Attachment upload failed:", error.message);
      return res.status(error.status || 500).json({
        success: false,
        message:
          error.status
            ? error.message
            : "Unable to store the selected files.",
      });
    }
  }
);

// Download is private and ownership-scoped; no storage path is returned.
router.get("/attachments/:attachmentId", async (req, res) => {
  if (!isValidId(req.params.attachmentId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid attachment ID",
    });
  }

  try {
    const attachment = await Attachment.findOne({
      _id: req.params.attachmentId,
      userId: req.userId,
    }).lean();

    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: "Attachment not found",
      });
    }

    const filePath = getStoragePath(attachment.storageKey);
    await fs.promises.access(filePath, fs.constants.R_OK);

    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    return res.download(
      filePath,
      attachment.originalName.replace(/[\r\n"]/g, "_"),
      (error) => {
        if (error && !res.headersSent) {
          serverError(res, error);
        }
      }
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      return res.status(404).json({
        success: false,
        message: "Attachment content is no longer available.",
      });
    }

    return serverError(res, error);
  }
});

// Delete both the private content and all message references.
router.delete("/attachments/:attachmentId", async (req, res) => {
  if (!isValidId(req.params.attachmentId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid attachment ID",
    });
  }

  try {
    const attachment = await Attachment.findOneAndDelete({
      _id: req.params.attachmentId,
      userId: req.userId,
    }).lean();

    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: "Attachment not found",
      });
    }

    await Chat.updateOne(
      {
        _id: attachment.chatId,
        userId: req.userId,
        "messages.attachments.attachmentId": attachment._id,
      },
      {
        $pull: {
          "messages.$[].attachments": {
            attachmentId: attachment._id,
          },
        },
      }
    );

    await removeStoredFile(attachment.storageKey);

    return res.json({
      success: true,
      message: "Attachment deleted successfully.",
    });
  } catch (error) {
    return serverError(res, error);
  }
});

// GET ALL CHATS
router.get("/", async (req, res) => {
  try {
    const chats = await Chat.find({
      userId: req.userId,
    })
      .select("_id title createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .lean();

    return res.json({
      success: true,
      chats,
    });
  } catch (error) {
    return serverError(res, error);
  }
});

// CREATE CHAT
router.post("/", async (req, res) => {
  try {
    const chat = await Chat.create({
      userId: req.userId,
      title: "New Chat",
      messages: [],
    });

    return res.status(201).json({
      success: true,
      chat,
    });
  } catch (error) {
    return serverError(res, error);
  }
});

// GET ONE CHAT
router.get("/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid chat ID",
      });
    }

    const chat = await Chat.findOne({
      _id: req.params.id,
      userId: req.userId,
    }).lean();

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    return res.json({
      success: true,
      chat,
    });
  } catch (error) {
    return serverError(res, error);
  }
});

// DELETE CHAT
router.delete("/:id", async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid chat ID",
      });
    }

    const chat = await Chat.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    const attachments = await Attachment.find({
      userId: req.userId,
      chatId: chat._id,
    })
      .select("storageKey")
      .lean();

    await Attachment.deleteMany({
      userId: req.userId,
      chatId: chat._id,
    });

    for (const attachment of attachments) {
      await removeStoredFile(attachment.storageKey);
    }

    return res.json({
      success: true,
      message: "Chat deleted successfully",
    });
  } catch (error) {
    return serverError(res, error);
  }
});

// SEND MESSAGE + SAVE CONVERSATION
router.post(
  "/:id/messages",
  messageLimiter,
  async (req, res) => {
    try {
      const { message, attachmentIds = [], language } = req.body || {};
      const responseLanguage = normalizeResponseLanguage(language);

      if (typeof language === "string" && responseLanguage === "auto") {
        return res.status(400).json({
          success: false,
          message: "Language must be English (en) or Hindi (hi).",
        });
      }

      if (!isValidId(req.params.id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid chat ID",
        });
      }

      if (!Array.isArray(attachmentIds) ||
          attachmentIds.length > MAX_FILES_PER_MESSAGE ||
          attachmentIds.some((id) => !isValidId(id)) ||
          new Set(attachmentIds.map(String)).size !== attachmentIds.length) {
        return res.status(400).json({
          success: false,
          message: "Invalid attachments. Attach up to five files per message.",
        });
      }

      if (
        (typeof message !== "string" || message.length > 4000) ||
        (!message?.trim() && attachmentIds.length === 0)
      ) {
        return res.status(400).json({
          success: false,
          message: "Message must be 1-4000 characters or include an attachment.",
        });
      }

      const chat = await Chat.findOne({
        _id: req.params.id,
        userId: req.userId,
      });

      if (!chat) {
        return res.status(404).json({
          success: false,
          message: "Chat not found",
        });
      }

      const text = message.trim() || "Please review the attached file(s).";

      const selectedAttachments = attachmentIds.length
        ? await Attachment.find({
            _id: { $in: attachmentIds },
            userId: req.userId,
            chatId: chat._id,
          }).lean()
        : [];

      if (selectedAttachments.length !== attachmentIds.length) {
        return res.status(404).json({
          success: false,
          message: "One or more attachments are unavailable in this chat.",
        });
      }

      const historicalAttachmentIds = chat.messages.flatMap((item) =>
        (item.attachments || []).map((attachment) => attachment.attachmentId)
      );
      const availableAttachments = await Attachment.find({
        _id: {
          $in: [...new Set([
            ...historicalAttachmentIds.map(String),
            ...attachmentIds.map(String),
          ])],
        },
        userId: req.userId,
        chatId: chat._id,
      })
        .select("+extractedText")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      const textAttachments = availableAttachments.filter(
        (item) => item.extractedText
      );
      const noTextNames = availableAttachments
        .filter((item) => item.processingStatus === "no_text")
        .map((item) => item.originalName);
      const imageAttachments = availableAttachments
        .filter((item) => item.mimeType.startsWith("image/"))
        .slice(0, 3);

      const contextParts = [];
      const excerpts = selectRelevantChunks(text, textAttachments);
      if (excerpts) contextParts.push(excerpts);
      if (noTextNames.length > 0) {
        contextParts.push(
          `No readable text could be extracted from: ${noTextNames.join(", ")}. These may be scanned or empty documents. Do not claim to have analyzed their contents.`
        );
      }
      if (
        !process.env.GROQ_VISION_MODEL &&
        availableAttachments.some((item) => item.mimeType.startsWith("image/"))
      ) {
        contextParts.push(
          "Image analysis is unavailable because GROQ_VISION_MODEL is not configured. Do not claim to have viewed image contents."
        );
      }

      const userMessageId = new mongoose.Types.ObjectId();
      const messageAttachments = selectedAttachments.map((item) => ({
        attachmentId: item._id,
        originalName: item.originalName,
        mimeType: item.mimeType,
        fileSize: item.fileSize,
        processingStatus: item.processingStatus,
      }));

      // History comes from the database,
      // not from untrusted frontend input.
      const history = chat.messages
        .slice(-20)
        .map((item) => ({
          role: item.role,
          content: item.content,
        }));

      const reply = await generateAIResponse(
        [
          ...history,
          {
            role: "user",
            content: text,
          },
        ],
        {
          referenceContext: contextParts.join("\n\n"),
          language: responseLanguage,
          images: process.env.GROQ_VISION_MODEL
            ? imageAttachments.map((item) => ({
                storageKey: item.storageKey,
                mimeType: item.mimeType,
                originalName: item.originalName,
              }))
            : [],
        }
      );

      // Save both messages together after AI succeeds.
      const title =
        chat.messages.length === 0
          ? text.slice(0, 40)
          : chat.title;

      // Conditional update avoids saving a reply if
      // this chat was deleted during AI generation.
      const updatedChat = await Chat.findOneAndUpdate(
        {
          _id: chat._id,
          userId: req.userId,
          updatedAt: chat.updatedAt,
        },
        {
          $push: {
            messages: {
              $each: [
                {
                  _id: userMessageId,
                  role: "user",
                  content: text,
                  attachments: messageAttachments,
                },
                { role: "assistant", content: reply },
              ],
            },
          },
          $set: {
            title,
          },
          $currentDate: {
            updatedAt: true,
          },
        },
        { new: true, runValidators: true }
      );

      if (!updatedChat) {
        return res.status(409).json({
          success: false,
          message:
            "Conversation changed or was deleted. Refresh and try again.",
        });
      }

      if (selectedAttachments.length > 0) {
        await Attachment.updateMany(
          {
            _id: { $in: selectedAttachments.map((item) => item._id) },
            userId: req.userId,
            chatId: chat._id,
          },
          { $set: { messageId: userMessageId } }
        );
      }

      return res.json({
        success: true,
        reply,
        language: responseLanguage,
        chat: updatedChat,
      });
    } catch (error) {
      console.error("Send AI message error:", error);

      const status =
        error.status === 429 ? 429 : error.status === 413 ? 413 : 502;

      return res.status(status).json({
        success: false,
        message:
          status === 429
            ? "AI rate limit reached. Try again later."
            : status === 413
            ? error.message
            : "AI service unavailable. Please retry.",
      });
    }
  }
);

// ======================================
// PHASE 4.1 - STREAM AI MESSAGE
// ======================================

// Prevent concurrent streaming requests for
// the same conversation within this server.
const activeStreams = new Set();

function sendStreamEvent(res, event, data) {
  if (res.destroyed || res.writableEnded) {
    return;
  }

  res.write(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  );
}

router.post(
  "/:id/messages/stream",
  messageLimiter,
  async (req, res) => {
    const { message, language } = req.body || {};
    const responseLanguage = normalizeResponseLanguage(language);

    if (typeof language === "string" && responseLanguage === "auto") {
      return res.status(400).json({
        success: false,
        message: "Language must be English (en) or Hindi (hi).",
      });
    }
    const chatId = req.params.id;

    if (!isValidId(chatId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid chat ID",
      });
    }

    if (
      typeof message !== "string" ||
      !message.trim() ||
      message.length > 4000
    ) {
      return res.status(400).json({
        success: false,
        message: "Message must be 1-4000 characters",
      });
    }

    const streamKey = `${req.userId}:${chatId}`;

    if (activeStreams.has(streamKey)) {
      return res.status(409).json({
        success: false,
        message:
          "A response is already generating for this chat.",
      });
    }

    activeStreams.add(streamKey);

    const controller = new AbortController();

    let clientDisconnected = false;
    let streamStarted = false;

    // Response close also occurs after normal completion,
    // so distinguish it from premature disconnection.
    res.on("close", () => {
      if (!res.writableEnded) {
        clientDisconnected = true;
        controller.abort();
      }
    });

    try {
      const chat = await Chat.findOne({
        _id: chatId,
        userId: req.userId,
      });

      if (!chat) {
        return res.status(404).json({
          success: false,
          message: "Chat not found",
        });
      }

      if (clientDisconnected) return;

      const text = message.trim();

      const history = chat.messages
        .slice(-20)
        .map((item) => ({
          role: item.role,
          content: item.content,
        }));

      // Start the upstream request before
      // sending HTTP 200 to the browser.
      const stream = await streamAIResponse(
        [
          ...history,
          { role: "user", content: text },
        ],
        controller.signal,
        { language: responseLanguage }
      );

      if (clientDisconnected) return;

      res.status(200);
      res.setHeader(
        "Content-Type",
        "text/event-stream; charset=utf-8"
      );
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      streamStarted = true;

      sendStreamEvent(res, "start", {
        success: true,
        chatId,
        language: responseLanguage,
      });

      let fullReply = "";

      for await (const chunk of stream) {
        if (clientDisconnected) break;

        const delta =
          chunk.choices?.[0]?.delta?.content || "";

        if (!delta) continue;

        fullReply += delta;

        sendStreamEvent(res, "delta", {
          content: delta,
        });
      }

      if (clientDisconnected) return;

      if (!fullReply.trim()) {
        throw new Error("AI returned an empty response");
      }

      const title =
        chat.messages.length === 0
          ? text.slice(0, 40)
          : chat.title;

      // Save only after generation completes.
      // Conditional update prevents saving into
      // a deleted or modified conversation.
      const updatedChat = await Chat.findOneAndUpdate(
        {
          _id: chat._id,
          userId: req.userId,
          updatedAt: chat.updatedAt,
        },
        {
          $push: {
            messages: {
              $each: [
                { role: "user", content: text },
                {
                  role: "assistant",
                  content: fullReply.trim(),
                },
              ],
            },
          },
          $set: { title },
          $currentDate: { updatedAt: true },
        },
        {
          new: true,
          runValidators: true,
        }
      );

      if (!updatedChat) {
        sendStreamEvent(res, "error", {
          message:
            "Conversation changed or was deleted. Refresh and try again.",
        });
        return;
      }

      sendStreamEvent(res, "done", {
        success: true,
        reply: fullReply.trim(),
        language: responseLanguage,
        chat: updatedChat,
      });
    } catch (error) {
      console.error(
        "Streaming AI error:",
        error.message
      );

      if (clientDisconnected) return;

      const message =
        error.status === 429
          ? "AI rate limit reached. Try again later."
          : "AI streaming failed. Please retry.";

      if (!streamStarted && !res.headersSent) {
        return res.status(
          error.status === 429 ? 429 : 502
        ).json({
          success: false,
          message,
        });
      }

      sendStreamEvent(res, "error", {
        message,
      });
    } finally {
      activeStreams.delete(streamKey);

      if (!res.writableEnded && !res.destroyed) {
        res.end();
      }
    }
  }
);

router.use(async (error, req, res, next) => {
  if (res.headersSent) return next(error);

  const files = req.files || [];
  await Promise.all(
    files.map(async (file) => {
      try {
        await fs.promises.unlink(file.path);
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") {
          console.error("Failed to clean up incomplete upload:", cleanupError);
        }
      }
    })
  );

  const isMulterError = error instanceof multer.MulterError;
  const status = isMulterError
    ? error.code === "LIMIT_FILE_SIZE" || error.code === "LIMIT_FILE_COUNT"
      ? 413
      : 400
    : error.status || 500;
  const message = isMulterError
    ? error.code === "LIMIT_FILE_SIZE"
      ? `Each file must be no larger than ${maxFileSizeMb} MB.`
      : error.code === "LIMIT_FILE_COUNT"
      ? "Attach no more than five files per message."
      : error.message
    : error.status
    ? error.message
    : "Unable to process the file upload.";

  if (status >= 500) {
    console.error("Attachment route error:", error);
  }

  return res.status(status).json({
    success: false,
    message,
  });
});


module.exports = router;
