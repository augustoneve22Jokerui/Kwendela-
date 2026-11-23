'use strict';

const fs = require('fs');
const ApiError = require('../utils/ApiError');
const {
  imageUpload,
  mediaUpload,
  documentUpload,
  getPublicUploadUrl
} = require('../config/multer');

function readFileHeaderBytes(filePath, length = 12) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const bytesRead = fs.readSync(fd, buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

function matchesMagicBytes(filePath, mimeType) {
  try {
    const header = readFileHeaderBytes(filePath, 16);

    switch (mimeType) {
      case 'image/jpeg':
        return header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
      case 'image/png':
        return (
          header.length >= 8 &&
          header[0] === 0x89 &&
          header[1] === 0x50 &&
          header[2] === 0x4e &&
          header[3] === 0x47
        );
      case 'image/webp':
        return (
          header.length >= 12 &&
          header.subarray(0, 4).toString('ascii') === 'RIFF' &&
          header.subarray(8, 12).toString('ascii') === 'WEBP'
        );
      case 'application/pdf':
        return header.length >= 4 && header.subarray(0, 4).toString('ascii') === '%PDF';
      case 'video/mp4':
        return header.length >= 8 && header.subarray(4, 8).toString('ascii') === 'ftyp';
      case 'video/webm':
        return (
          header.length >= 4 &&
          header[0] === 0x1a &&
          header[1] === 0x45 &&
          header[2] === 0xdf &&
          header[3] === 0xa3
        );
      default:
        return false;
    }
  } catch (_err) {
    return false;
  }
}

function cleanupFiles(files = []) {
  for (const file of files) {
    if (file && file.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (_err) {
        // Ignorar falha de limpeza em ficheiro temporário
      }
    }
  }
}

function formatUploadedFile(file) {
  return {
    originalName: file.originalname,
    filename: file.filename,
    mimeType: file.mimetype,
    size: file.size,
    path: file.path,
    url: getPublicUploadUrl(file.path)
  };
}

function wrapMulterMiddleware(multerMiddleware, subdir = 'general') {
  return function uploadMiddleware(req, res, next) {
    req.uploadSubdir = subdir;

    multerMiddleware(req, res, (err) => {
      if (err) {
        return next(err);
      }

      const files = [];
      if (req.file) {
        files.push(req.file);
      }
      if (Array.isArray(req.files)) {
        files.push(...req.files);
      } else if (req.files && typeof req.files === 'object') {
        for (const group of Object.values(req.files)) {
          if (Array.isArray(group)) {
            files.push(...group);
          }
        }
      }

      for (const file of files) {
        if (!matchesMagicBytes(file.path, file.mimetype)) {
          cleanupFiles(files);
          return next(
            ApiError.badRequest(
              'O conteúdo real do ficheiro não corresponde ao formato permitido.',
              null,
              'INVALID_FILE_SIGNATURE'
            )
          );
        }
      }

      if (req.file) {
        req.uploadedFile = formatUploadedFile(req.file);
      }

      if (files.length > 0) {
        req.uploadedFiles = files.map(formatUploadedFile);
      } else {
        req.uploadedFiles = [];
      }

      return next();
    });
  };
}

function uploadSingleImage(fieldName = 'image', subdir = 'images') {
  return wrapMulterMiddleware(imageUpload.single(fieldName), subdir);
}

function uploadMultipleImages(fieldName = 'images', maxCount = 8, subdir = 'images') {
  return wrapMulterMiddleware(imageUpload.array(fieldName, maxCount), subdir);
}

function uploadSingleMedia(fieldName = 'media', subdir = 'media') {
  return wrapMulterMiddleware(mediaUpload.single(fieldName), subdir);
}

function uploadMultipleMedia(fieldName = 'media', maxCount = 10, subdir = 'media') {
  return wrapMulterMiddleware(mediaUpload.array(fieldName, maxCount), subdir);
}

function uploadDocument(fieldName = 'document', subdir = 'documents') {
  return wrapMulterMiddleware(documentUpload.single(fieldName), subdir);
}

module.exports = {
  uploadSingleImage,
  uploadMultipleImages,
  uploadSingleMedia,
  uploadMultipleMedia,
  uploadDocument,
  cleanupFiles
};