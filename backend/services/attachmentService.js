const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const ExcelJS = require("exceljs");
const sharp = require("sharp");

const MAX_EXTRACTED_TEXT = 200000;
const MAX_UNCOMPRESSED_ZIP_BYTES = 50 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 10000;

const MIME_TYPES = {
  ".pdf": ["application/pdf"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ".txt": ["text/plain"],
  ".md": ["text/markdown", "text/x-markdown", "text/plain"],
  ".xlsx": [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
  ".csv": [
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "text/plain",
  ],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".webp": ["image/webp"],
};

function getFileExtension(name) {
  return path.extname(name || "").toLowerCase();
}

function validateDeclaredType(file) {
  const extension = getFileExtension(file.originalname);
  const acceptedTypes = MIME_TYPES[extension];

  if (!acceptedTypes) {
    throw new Error(
      "Unsupported file type. Use PDF, DOCX, TXT, MD, XLSX, CSV, PNG, JPG, JPEG, or WEBP."
    );
  }

  if (
    file.mimetype &&
    file.mimetype !== "application/octet-stream" &&
    !acceptedTypes.includes(file.mimetype)
  ) {
    throw new Error(
      `The selected file's declared type does not match ${extension}.`
    );
  }

  return extension;
}

function findEndOfCentralDirectory(buffer) {
  const minimumOffset = Math.max(0, buffer.length - 65557);

  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error("The Office document is corrupted or invalid.");
}

function inspectZipArchive(buffer, expectedExtension) {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocd + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocd + 16);

  if (
    entryCount === 0xffff ||
    centralDirectoryOffset === 0xffffffff ||
    entryCount > MAX_ZIP_ENTRIES ||
    centralDirectoryOffset + centralDirectorySize > eocd
  ) {
    throw new Error("The Office document archive is invalid or too large.");
  }

  const names = [];
  let totalUncompressed = 0;
  let cursor = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (
      cursor + 46 > buffer.length ||
      buffer.readUInt32LE(cursor) !== 0x02014b50
    ) {
      throw new Error("The Office document is corrupted or invalid.");
    }

    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const entryLength = 46 + nameLength + extraLength + commentLength;

    if (cursor + entryLength > buffer.length) {
      throw new Error("The Office document is corrupted or invalid.");
    }

    const name = buffer
      .subarray(cursor + 46, cursor + 46 + nameLength)
      .toString("utf8");

    if (
      name.startsWith("/") ||
      name.includes("\\") ||
      name.split("/").includes("..")
    ) {
      throw new Error("The Office document contains unsafe archive paths.");
    }

    names.push(name);
    totalUncompressed += uncompressedSize;

    if (
      totalUncompressed > MAX_UNCOMPRESSED_ZIP_BYTES ||
      (uncompressedSize > 1024 * 1024 &&
        compressedSize > 0 &&
        uncompressedSize / compressedSize > 100)
    ) {
      throw new Error("The Office document expands beyond the safe size limit.");
    }

    cursor += entryLength;
  }

  const hasContentTypes = names.includes("[Content_Types].xml");
  const hasExpectedContent =
    expectedExtension === ".docx"
      ? names.includes("word/document.xml")
      : names.includes("xl/workbook.xml");

  if (!hasContentTypes || !hasExpectedContent) {
    throw new Error(
      `The file contents do not match the ${expectedExtension} extension.`
    );
  }
}

async function validateContent(buffer, extension) {
  if (extension === ".pdf") {
    if (buffer.length < 5 || buffer.subarray(0, 5).toString() !== "%PDF-") {
      throw new Error("This file is not a valid PDF.");
    }
    return;
  }

  if (extension === ".png") {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (!buffer.subarray(0, 8).equals(signature)) {
      throw new Error("This file is not a valid PNG image.");
    }
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    if (
      buffer.length < 3 ||
      buffer[0] !== 0xff ||
      buffer[1] !== 0xd8 ||
      buffer[2] !== 0xff
    ) {
      throw new Error("This file is not a valid JPEG image.");
    }
  }

  if (extension === ".webp") {
    if (
      buffer.length < 12 ||
      buffer.subarray(0, 4).toString() !== "RIFF" ||
      buffer.subarray(8, 12).toString() !== "WEBP"
    ) {
      throw new Error("This file is not a valid WEBP image.");
    }
  }

  if (
    extension === ".png" ||
    extension === ".jpg" ||
    extension === ".jpeg" ||
    extension === ".webp"
  ) {
    try {
      await sharp(buffer, {
        failOn: "error",
        limitInputPixels: 40 * 1024 * 1024,
      }).stats();
    } catch {
      throw new Error(
        "This image is corrupted or exceeds the safe image dimensions."
      );
    }
    return;
  }

  if (extension === ".docx" || extension === ".xlsx") {
    if (
      buffer.length < 4 ||
      buffer[0] !== 0x50 ||
      buffer[1] !== 0x4b ||
      ![0x03, 0x05, 0x07].includes(buffer[2]) ||
      ![0x04, 0x06, 0x08].includes(buffer[3])
    ) {
      throw new Error("This file is not a valid Office document.");
    }
    inspectZipArchive(buffer, extension);
    return;
  }

  if (buffer.includes(0)) {
    throw new Error("This file is not valid UTF-8 text.");
  }

  const text = buffer.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(buffer)) {
    throw new Error("This file is not valid UTF-8 text.");
  }
}

function capText(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .slice(0, MAX_EXTRACTED_TEXT)
    .trim();
}

async function extractSpreadsheet(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  if (!workbook.worksheets.length) {
    throw new Error("The Excel workbook does not contain any worksheets.");
  }

  const sheets = [];

  for (const worksheet of workbook.worksheets) {
    const rows = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values
        .slice(1)
        .map((value) => {
          if (value && typeof value === "object") {
            if ("text" in value) return value.text;
            if ("result" in value) return value.result;
            return JSON.stringify(value);
          }
          return value == null ? "" : String(value);
        });
      rows.push(values.join("\t"));
    });

    sheets.push(`Sheet: ${worksheet.name}\n${rows.join("\n")}`);
  }

  return sheets.join("\n\n");
}

async function extractText(filePath, extension) {
  if (extension === ".pdf") {
    const result = await pdfParse(await fs.promises.readFile(filePath));
    return result.text || "";
  }

  if (extension === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || "";
  }

  if (extension === ".xlsx") {
    return extractSpreadsheet(filePath);
  }

  if (extension === ".txt" || extension === ".md" || extension === ".csv") {
    return fs.promises.readFile(filePath, "utf8");
  }

  return "";
}

async function processUploadedFile(file) {
  if (!file.size) {
    throw new Error("Empty files cannot be attached.");
  }

  const extension = validateDeclaredType(file);
  const buffer = await fs.promises.readFile(file.path);
  await validateContent(buffer, extension);
  const contentHash = crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");

  if (extension === ".png" || extension === ".jpg" ||
      extension === ".jpeg" || extension === ".webp") {
    return {
      extension,
      contentHash,
      mimeType: MIME_TYPES[extension][0],
      extractedText: "",
      processingStatus: process.env.GROQ_VISION_MODEL
        ? "vision_ready"
        : "vision_unavailable",
    };
  }

  let extractedText;
  try {
    extractedText = capText(await extractText(file.path, extension));
  } catch {
    throw new Error(
      `Could not read this ${extension} file. It may be corrupted or password-protected.`
    );
  }

  return {
    extension,
    contentHash,
    mimeType: MIME_TYPES[extension][0],
    extractedText,
    processingStatus: extractedText ? "ready" : "no_text",
  };
}

function getStorageRoot() {
  return path.resolve(
    process.env.ATTACHMENT_STORAGE_DIR ||
      path.join(__dirname, "..", "private_uploads")
  );
}

function getStoragePath(storageKey) {
  if (!/^[a-f0-9-]{36}\.(pdf|docx|txt|md|xlsx|csv|png|jpe?g|webp)$/i.test(storageKey)) {
    throw new Error("Invalid private attachment key");
  }

  const root = getStorageRoot();
  const resolved = path.resolve(root, storageKey);

  if (path.dirname(resolved) !== root) {
    throw new Error("Invalid private attachment path");
  }

  return resolved;
}

function splitIntoChunks(text, size = 1800, overlap = 240) {
  const chunks = [];
  const content = text || "";

  for (let start = 0; start < content.length; start += size - overlap) {
    chunks.push(content.slice(start, start + size));
  }

  return chunks;
}

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "and", "are", "based", "can", "could",
  "document", "explain", "file", "find", "from", "give", "have", "help",
  "important", "into", "key", "me", "more", "please", "this", "that", "the",
  "their", "there", "these", "they", "what", "when", "where", "which", "with",
  "would", "you", "your", "summarize", "summary", "attached",
]);

function selectRelevantChunks(question, attachments, maxCharacters = 18000) {
  const terms = new Set(
    (question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])
      .filter((term) => !STOP_WORDS.has(term))
  );
  const candidates = [];

  for (const attachment of attachments) {
    for (const [index, text] of splitIntoChunks(attachment.extractedText).entries()) {
      const lower = text.toLowerCase();
      let score = index === 0 ? 1 : 0;

      for (const term of terms) {
        if (lower.includes(term)) score += 1;
      }

      candidates.push({
        name: attachment.originalName,
        text,
        score,
        index,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.index - b.index);

  const selected = [];
  let used = 0;
  const perFile = new Map();

  for (const chunk of candidates) {
    if ((perFile.get(chunk.name) || 0) >= 3) continue;

    const entry = `File: ${chunk.name}\n${chunk.text}`;
    if (used + entry.length > maxCharacters) continue;

    selected.push(entry);
    used += entry.length;
    perFile.set(chunk.name, (perFile.get(chunk.name) || 0) + 1);
  }

  return selected.join("\n\n---\n\n");
}

module.exports = {
  getFileExtension,
  getStoragePath,
  getStorageRoot,
  processUploadedFile,
  selectRelevantChunks,
  validateDeclaredType,
};
