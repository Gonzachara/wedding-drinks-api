const crypto = require('crypto');

let cached = null;

function getSecret() {
  if (cached) return cached;
  const env = process.env.JWT_SECRET;
  if (env && env.trim().length > 0) {
    cached = env.trim();
    return cached;
  }
  // Fallback determinístico para entornos donde no se configuró JWT_SECRET.
  // NOTA: En producción, configurar JWT_SECRET en variables de entorno.
  cached = 'dev-fallback-secret-change-me';
  return cached;
}

module.exports = { getSecret };
