'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('./env');

const ALLOWED_IMAGE_MIMES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp']
]);

const ALLOWED_VIDEO_MIMES = new Map([
  ['video/mp4', '.mp4'],
  ['video/webm', '.webm']
]);

const ALLOWED_DOCUMENT_MIMES = new Map([
  ['application/pdf', '.pdf'],
  ['image/jpeg', '.jpg'],
  ['image/png', '.png']
]);

const ALLOWED_MEDIA_MIMES = new Map([
  ...ALLOWED_IMAGE_MIMES,
  ...ALLOWED_VIDEO_MIMES
]);

function ensureUploadSubdir(subdir) {
  const safeSubdir = String(subdir || 'general').replace(/[^a-zA-Z0-9_-]/g, '');
  const targetDir = path.join(env.upload.dir, safeSubdir);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  return targetDir;
}

function createDiskStorage(subdirResolver, allowedMimeMap) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const subdir =
          typeof subdirResolver === 'function' ? subdirResolver(req, file) : subdirResolver;
        const targetDir = ensureUploadSubdir(subdir);
        cb(null, targetDir);
      } catch (err) {
        cb(err);
      }
    },
    filename: (req, file, cb) => {
      const extFromMime = allowedMimeMap.get(file.mimetype);
      const originalExt = path.extname(file.originalname || '').toLowerCase();
      const safeExt = extFromMime || originalExt || '';
      const uniqueName = `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${safeExt}`;
      cb(null, uniqueName);
    }
  });
}

function createFileFilter(allowedMimeMap) {
  return (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const expectedExt = allowedMimeMap.get(file.mimetype);

    if (!expectedExt) {
      const err = new Error('Tipo de ficheiro não permitido.');
      err.statusCode = 400;
      err.code = 'INVALID_FILE_TYPE';
      return cb(err);
    }

    const validJpgAlias =
      file.mimetype === 'image/jpeg' && (ext === '.jpg' || ext === '.jpeg');

    if (ext && ext !== expectedExt && !validJpgAlias) {
      const err = new Error('A extensão do ficheiro não corresponde ao conteúdo declarado.');
      err.statusCode = 400;
      err.code = 'FILE_EXTENSION_MISMATCH';
      return cb(err);
    }

    return cb(null, true);
  };
}

function createUploader({ subdir = 'general', allowedMimes = ALLOWED_IMAGE_MIMES, maxSizeBytes = env.upload.maxSizeBytes } = {}) {
  return multer({
    storage: createDiskStorage(subdir, allowedMimes),
    fileFilter: createFileFilter(allowedMimes),
    limits: {
      fileSize: maxSizeBytes,
      files: 10
    }
  });
}

function getPublicUploadUrl(filePath) {
  if (!filePath) return null;
  const relative = path.relative(path.resolve(process.cwd(), 'public'), filePath);
  if (relative.startsWith('..')) {
    return null;
  }
  return '/' + relative.split(path.sep).join('/');
}

function removeUploadedFileByUrl(publicUrl) {
  if (!publicUrl || typeof publicUrl !== 'string' || !publicUrl.startsWith('/uploads/')) {
    return false;
  }
  const resolved = path.resolve(process.cwd(), 'public', publicUrl.slice(1));
  if (!resolved.startsWith(env.upload.dir)) {
    return false;
  }
  if (fs.existsSync(resolved)) {
    fs.unlinkSync(resolved);
    return true;
  }
  return false;
}

const imageUpload = createUploader({
  subdir: (req) => req.uploadSubdir || 'images',
  allowedMimes: ALLOWED_IMAGE_MIMES
});

const mediaUpload = createUploader({
  subdir: (req) => req.uploadSubdir || 'media',
  allowedMimes: ALLOWED_MEDIA_MIMES,
  maxSizeBytes: env.upload.maxSizeBytes * 5
});

const documentUpload = createUploader({
  subdir: (req) => req.uploadSubdir || 'documents',
  allowedMimes: ALLOWED_DOCUMENT_MIMES
});

module.exports = {
  ALLOWED_IMAGE_MIMES,
  ALLOWED_VIDEO_MIMES,
  ALLOWED_DOCUMENT_MIMES,
  ALLOWED_MEDIA_MIMES,
  createUploader,
  imageUpload,
  mediaUpload,
  documentUpload,
  getPublicUploadUrl,
  removeUploadedFileByUrl
};