const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOADS_DIR = process.env.UPLOADS_DIR
  || path.join(__dirname, '..', 'data', 'contracts');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Separate subdir per kind: uploaded contracts vs. addendum PDFs.
    const sub = req.uploadSubdir || 'uploads';
    const dir = path.join(UPLOADS_DIR, sub);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const id = crypto.randomUUID();
    const ext = path.extname(file.originalname || '').toLowerCase() || '.pdf';
    cb(null, `${id}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  // PDF only — we're storing legal docs
  const ok = file.mimetype === 'application/pdf'
    || /\.pdf$/i.test(file.originalname || '');
  if (!ok) return cb(new Error('only_pdf_allowed'));
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB per contract PDF
});

function withSubdir(sub) {
  return (req, res, next) => {
    req.uploadSubdir = sub;
    next();
  };
}

module.exports = { upload, withSubdir, UPLOADS_DIR };
