const multer = require("multer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const maxMb = Number(process.env.MAX_FILE_SIZE_MB || 20);
const allowed = new Set([
  ".html",".htm",".css",".js",".json",".txt",".svg",
  ".png",".jpg",".jpeg",".webp",".gif",".ico",
  ".woff",".woff2",".ttf",".map"
]);

const tempDir = path.join(__dirname, "..", "storage", "tmp");
fs.mkdirSync(tempDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, tempDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, safe);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: maxMb * 1024 * 1024, files: 50 },
  fileFilter: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.has(ext)) return cb(new Error(`File type ${ext || "unknown"} is not allowed.`));
    cb(null, true);
  }
});

module.exports = { upload, allowed };
