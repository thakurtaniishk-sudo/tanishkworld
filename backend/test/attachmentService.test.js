const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const ExcelJS = require("exceljs");
const sharp = require("sharp");

const {
  processUploadedFile,
  selectRelevantChunks,
} = require("../services/attachmentService");

let tempDirectory;

test.before(async () => {
  tempDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "tanishkworld-attachments-")
  );
});

test.after(async () => {
  await fs.rm(tempDirectory, { recursive: true, force: true });
});

async function writeUpload(name, content, mimeType) {
  const filePath = path.join(tempDirectory, name);
  await fs.writeFile(filePath, content);
  const stats = await fs.stat(filePath);

  return {
    path: filePath,
    originalname: name,
    mimetype: mimeType,
    size: stats.size,
  };
}

test("extracts UTF-8 CSV content for attachment context", async () => {
  const file = await writeUpload(
    "quarterly.csv",
    Buffer.from("quarter,revenue\nQ1,125000\nQ2,150000"),
    "text/csv"
  );

  const result = await processUploadedFile(file);

  assert.equal(result.processingStatus, "ready");
  assert.match(result.extractedText, /125000/);
  assert.equal(result.mimeType, "text/csv");
});

test("rejects a MIME type that does not match the extension", async () => {
  const file = await writeUpload(
    "notes.txt",
    Buffer.from("plain text"),
    "application/pdf"
  );

  await assert.rejects(
    processUploadedFile(file),
    /declared type does not match/
  );
});

test("rejects corrupt PDFs and binary text", async () => {
  const corruptPdf = await writeUpload(
    "broken.pdf",
    Buffer.from("%PDF-"),
    "application/pdf"
  );
  await assert.rejects(
    processUploadedFile(corruptPdf),
    /Could not read this .pdf file/
  );

  const binaryText = await writeUpload(
    "binary.txt",
    Buffer.from([0xff, 0x00, 0xfe]),
    "text/plain"
  );
  await assert.rejects(processUploadedFile(binaryText), /valid UTF-8 text/);
});

test("extracts worksheet rows from a valid XLSX upload", async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Sales");
  worksheet.addRows([
    ["Product", "Units"],
    ["Notebook", 42],
  ]);
  const filePath = path.join(tempDirectory, "sales.xlsx");
  await workbook.xlsx.writeFile(filePath);
  const stats = await fs.stat(filePath);

  const result = await processUploadedFile({
    path: filePath,
    originalname: "sales.xlsx",
    mimetype:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: stats.size,
  });

  assert.equal(result.processingStatus, "ready");
  assert.match(result.extractedText, /Notebook\t42/);
});

test("validates image decoding before marking it vision-ready", async () => {
  const image = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: "#7357e8",
    },
  })
    .png()
    .toBuffer();
  const file = await writeUpload("sample.png", image, "image/png");
  const previousVisionModel = process.env.GROQ_VISION_MODEL;
  process.env.GROQ_VISION_MODEL = "";

  try {
    const result = await processUploadedFile(file);
    assert.equal(result.processingStatus, "vision_unavailable");
  } finally {
    if (previousVisionModel === undefined) {
      delete process.env.GROQ_VISION_MODEL;
    } else {
      process.env.GROQ_VISION_MODEL = previousVisionModel;
    }
  }
});

test("selects document chunks that match the user's question", () => {
  const text = `${"Routine notes ".repeat(160)}\nRevenue exceeded expectations in Q4.`;
  const context = selectRelevantChunks("What was the Q4 revenue?", [
    { originalName: "report.txt", extractedText: text },
  ]);

  assert.match(context, /Revenue exceeded expectations in Q4/);
});

test("keeps legacy chat messages valid without attachment references", async () => {
  const Chat = require("../models/Chat");
  const chat = new Chat({
    userId: "user-123",
    messages: [{ role: "user", content: "Old message" }],
  });

  await chat.validate();
  assert.deepEqual(chat.messages[0].attachments, []);
});
