'use strict';

const crypto = require('crypto');

function slugify(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function generateUniqueSlug(text, suffixBytes = 3) {
  const base = slugify(text) || 'kwendela';
  const suffix = crypto.randomBytes(suffixBytes).toString('hex');
  return `${base}-${suffix}`;
}

module.exports = {
  slugify,
  generateUniqueSlug
};