'use strict';

const { createHash } = require('node:crypto');

const MAX_PHOTO_BYTES = 1024 * 1024;
const MAX_ENCODED_LENGTH = Math.ceil(MAX_PHOTO_BYTES / 3) * 4;
const MAX_REQUEST_LENGTH = MAX_ENCODED_LENGTH + 8192;
const PNG_HEADER = Buffer.from('89504e470d0a1a0a', 'hex');
const PNG_END = Buffer.from('0000000049454e44ae426082', 'hex');
const JPEG_HEADER = Buffer.from('ffd8ff', 'hex');
const JPEG_END = Buffer.from('ffd9', 'hex');
const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const error = (message, statusCode = 400) => Object.assign(Error(message), { statusCode });
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const matches = (bytes, value, start) => bytes.subarray(start, start + value.length).equals(value);

function signature(bytes, mime) {
  if (mime === 'image/jpeg') {
    return bytes.length >= 16 && matches(bytes, JPEG_HEADER, 0) && matches(bytes, JPEG_END, bytes.length - 2);
  }
  if (mime === 'image/png') {
    return bytes.length >= 45 && matches(bytes, PNG_HEADER, 0) && bytes.readUInt32BE(8) === 13 &&
      bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0 &&
      matches(bytes, PNG_END, bytes.length - PNG_END.length);
  }
  return mime === 'image/webp' && bytes.length >= 21 && bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.readUInt32LE(4) + 8 === bytes.length && bytes.toString('ascii', 8, 12) === 'WEBP' &&
    ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16));
}

function parsePhoto(input) {
  if (input === undefined) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).length !== 2 || !Object.hasOwn(input, 'mime') || !Object.hasOwn(input, 'data') ||
      !MIME_TYPES.includes(input.mime) || typeof input.data !== 'string') {
    throw error('Photo invalide. Formats acceptés JPEG, PNG et WebP.');
  }
  const data = input.data.trim();
  if (data.length > MAX_ENCODED_LENGTH) throw error('La photo dépasse 1 Mio.', 413);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw error('Photo illisible.');
  const bytes = Buffer.from(data, 'base64');
  if (bytes.length > MAX_PHOTO_BYTES) throw error('La photo dépasse 1 Mio.', 413);
  const canonical = bytes.toString('base64');
  if (data !== canonical && data !== canonical.replace(/=+$/, '')) throw error('Photo illisible.');
  if (!signature(bytes, input.mime)) throw error('Le contenu de la photo ne correspond pas à son format.');
  return { bytes, meta: { mime:input.mime, size:bytes.length, sha256:sha256(bytes) } };
}

module.exports = { MAX_REQUEST_LENGTH, parsePhoto };
