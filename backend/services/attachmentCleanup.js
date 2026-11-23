const fs = require("fs");
const path = require("path");

const Attachment = require("../models/Attachment");
const {
  getStoragePath,
  getStorageRoot,
} = require("./attachmentService");

const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const TEMP_MAX_AGE_MS = 60 * 60 * 1000;
const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function removeFile(storageKey) {
  try {
    await fs.promises.unlink(getStoragePath(storageKey));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function cleanupStaleAttachments() {
  const pendingCutoff = new Date(Date.now() - PENDING_MAX_AGE_MS);
  const pending = await Attachment.find({
    messageId: null,
    createdAt: { $lt: pendingCutoff },
  })
    .select("_id storageKey")
    .lean();

  if (pending.length > 0) {
    await Attachment.deleteMany({
      _id: { $in: pending.map((item) => item._id) },
    });

    await Promise.all(
      pending.map((item) => removeFile(item.storageKey))
    );
  }

  const active = await Attachment.find()
    .select("storageKey")
    .lean();
  const activeKeys = new Set(active.map((item) => item.storageKey));
  const root = getStorageRoot();
  const entries = await fs.promises.readdir(root, {
    withFileTypes: true,
  });
  const now = Date.now();

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const filePath = path.join(root, entry.name);
    const stats = await fs.promises.stat(filePath);
    const temporary = entry.name.endsWith(".upload");
    const storedKey = entry.name;
    const expiredTemporary =
      temporary && now - stats.mtimeMs > TEMP_MAX_AGE_MS;
    const orphanedStoredFile =
      !temporary &&
      !activeKeys.has(storedKey) &&
      now - stats.mtimeMs > ORPHAN_MAX_AGE_MS;

    if (expiredTemporary || orphanedStoredFile) {
      await fs.promises.unlink(filePath);
    }
  }
}

module.exports = cleanupStaleAttachments;
