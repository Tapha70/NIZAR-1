const express = require('express');
const router = express.Router();
const Article = require('../models/Article');
const Mouvement = require('../models/Mouvement');
const Settings = require('../models/Settings');

// GET /api/sync/pull - Récupérer les données depuis le serveur (pour mobile/desktop hors-ligne)
router.get('/pull', async (req, res) => {
  try {
    const { depuis } = req.query; // timestamp ISO pour sync incrémentale

    const filter = depuis ? { majLe: { $gt: new Date(depuis) } } : {};

    const articles = await Article.find(filter).sort({ majLe: 1 });
    const mouvements = await Mouvement.find(filter).sort({ date: 1 });
    const settings = await Settings.getSettings();

    res.json({
      articles,
      mouvements,
      settings,
      serveurHorodatage: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/push - Envoyer les modifications locales vers le serveur
router.post('/push', async (req, res) => {
  try {
    const { articles, mouvements, clientHorodatage } = req.body;

    // Traiter les articles
    if (articles && Array.isArray(articles)) {
      for (const a of articles) {
        if (a._id) {
          // Mise à jour
          await Article.findByIdAndUpdate(a._id, { ...a, majLe: new Date() });
        } else {
          // Création
          await Article.create({ ...a, creeLe: new Date(), majLe: new Date() });
        }
      }
    }

    // Traiter les mouvements
    if (mouvements && Array.isArray(mouvements)) {
      for (const m of mouvements) {
        if (m._id) {
          await Mouvement.findByIdAndUpdate(m._id, { ...m, date: new Date(m.date || Date.now()) });
        } else {
          await Mouvement.create({ ...m, date: new Date(m.date || Date.now()) });
        }
      }
    }

    res.json({ message: 'Synchronisation réussie', serveurHorodatage: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;