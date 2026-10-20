const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { generateToken, requireAdmin } = require('../middleware/auth');

// POST /api/auth/register - Créer un utilisateur (admin uniquement)
router.post('/register', async (req, res) => {
  try {
    const { nom, email, motDePasse, role, agence, operateur } = req.body;

    if (!nom || !email || !motDePasse) {
      return res.status(400).json({ error: 'Nom, email et mot de passe requis' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(motDePasse, salt);

    const user = await User.create({
      nom,
      email,
      motDePasse: hash,
      role: role || 'operateur',
      agence: agence || '',
      operateur: operateur || nom,
    });

    const token = generateToken(user);

    res.status(201).json({
      message: 'Utilisateur créé avec succès',
      token,
      user: {
        id: user._id,
        nom: user.nom,
        email: user.email,
        role: user.role,
        agence: user.agence,
        operateur: user.operateur,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login - Connexion
router.post('/login', async (req, res) => {
  try {
    const { email, motDePasse } = req.body;

    if (!email || !motDePasse) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const isMatch = await bcrypt.compare(motDePasse, user.motDePasse);
    if (!isMatch) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    if (!user.actif) {
      return res.status(403).json({ error: 'Compte désactivé' });
    }

    user.derniereConnexion = new Date();
    await user.save();

    const token = generateToken(user);

    res.json({
      message: 'Connexion réussie',
      token,
      user: {
        id: user._id,
        nom: user.nom,
        email: user.email,
        role: user.role,
        agence: user.agence,
        operateur: user.operateur,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me - Profil de l'utilisateur connecté
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Token requis' });

    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'nizar-transport-secret-key-2026-changez-moi');

    const user = await User.findById(decoded.id).select('-motDePasse');
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });

    res.json({ user });
  } catch (err) {
    res.status(401).json({ error: 'Token invalide' });
  }
});

// GET /api/auth/users - Liste des utilisateurs (admin)
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-motDePasse').sort({ creeLe: -1 });
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/users/:id - Supprimer un utilisateur (admin)
router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    res.json({ message: 'Utilisateur supprimé' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;