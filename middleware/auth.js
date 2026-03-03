const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getSecret } = require('../utils/jwtSecret');

module.exports = function(req, res, next) {
  const token = req.header('x-auth-token');

  if (!token) {
    return res.status(401).json({ message: 'No hay token, autorización denegada.' });
  }

  try {
    const secret = getSecret();
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'El token no es válido.' });
  }
};
