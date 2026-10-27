'use strict';
// Salted one-way password hashing (NFR-004). Passwords are never stored or logged in clear text.
const { scryptSync, randomBytes, timingSafeEqual } = require('node:crypto');

function hashPassword(raw) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(raw), salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(raw, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[2], 'hex');
  const actual = scryptSync(String(raw), parts[1], 32);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

module.exports = { hashPassword, verifyPassword };
