const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');

// GET /api/settings - Récupérer les paramètres
router.get('/', async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings - Mettre à jour les paramètres
router.put('/', async (req, res) => {
  try {
    const updates = req.body;
    const settings = await Settings.getSettings();

    Object.assign(settings, updates, { derniereModification: new Date() });
    await settings.save();

    res.json({ message: 'Paramètres enregistrés', settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/reset - Réinitialiser aux valeurs par défaut
router.post('/reset', async (req, res) => {
  try {
    await Settings.deleteMany({});
    const settings = await Settings.getSettings();
    res.json({ message: 'Paramètres réinitialisés', settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;