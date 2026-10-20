/**
 * Middleware d'authentification JWT
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'nizar-transport-secret-key-2026-changez-moi';

/**
 * Vérifie le token JWT et attache l'utilisateur à req.user
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Accès non autorisé - token manquant' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide ou expiré' });
    }
    req.user = user;
    next();
  });
};

/**
 * Génère un token JWT
 */
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role, nom: user.nom },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

/**
 * Middleware pour restreindre l'accès aux admins seulement
 */
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
};

/**
 * Middleware pour restreindre l'accès aux admins et opérateurs
 */
const requireOperateurOrAdmin = (req, res, next) => {
  if (!['admin', 'operateur'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès réservé aux opérateurs et administrateurs' });
  }
  next();
};

module.exports = {
  authenticateToken,
  generateToken,
  requireAdmin,
  requireOperateurOrAdmin,
};