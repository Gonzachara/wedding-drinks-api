module.exports = function(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'No hay token, autorización denegada.' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Acceso denegado. Se requiere rol de administrador.' });
  }
  next();
};
