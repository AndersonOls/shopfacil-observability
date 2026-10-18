'use strict';

const jwt = require('jsonwebtoken');

const USERS = [
  { username: 'demo', password: 'demo' },
  { username: 'admin', password: 'admin' },
];

const TOKEN_TTL_SECONDS = 3600;

function getSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
}

function authenticate(username, password) {
  const user = USERS.find(
    (candidate) =>
      candidate.username === username && candidate.password === password,
  );
  if (!user) {
    return null;
  }
  const token = jwt.sign({ sub: user.username }, getSecret(), {
    algorithm: 'HS256',
    expiresIn: TOKEN_TTL_SECONDS,
  });
  const decoded = jwt.decode(token);
  return { token, expiresAt: decoded.exp, expiresIn: TOKEN_TTL_SECONDS };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, getSecret(), { algorithms: ['HS256'] });
  } catch (err) {
    return null;
  }
}

module.exports = { authenticate, verifyToken, USERS, TOKEN_TTL_SECONDS };
