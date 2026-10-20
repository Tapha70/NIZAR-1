const express = require('express');
const router = express.Router();
const Mouvement = require('../models/Mouvement');
const Settings = require('../models/Settings');

// Générer numéro de fiche
const genFiche = async () => {
  const settings = await Settings.getSettings();
  const fiche = `FR-${new Date().getFullYear()}-${String(settings.ficheSeq++).padStart(4, '0')}`;
  await settings.save();
  return fiche;
};

// GET /api/fiches - Liste des fiches possibles (groupement par demandeur)
router.get('/', async (req, res) => {
  try {
    const { demandeur, dateDebut, dateFin, page = 1, limit = 50 } = req.query;
    const filter = { type: 'OUT', annule: false };

    if (demandeur) filter.beneficiaire = demandeur;
    if (dateDebut || dateFin) {
      filter.date = {};
      if (dateDebut) filter.date.$gte = new Date(dateDebut);
      if (dateFin) filter.date.$lte = new Date(dateFin);
    }

    const mouvements = await Mouvement.find(filter).sort({ date: -1 });

    // Grouper par bon pour la vue fiches
    const fichesMap = {};
    mouvements.forEach((m) => {
      if (!fichesMap[m.bon || 'sans-bon']) {
        fichesMap[m.bon || 'sans-bon'] = {
          bon: m.bon || 'Sans bon',
          demandeur: m.beneficiaire,
          date: m.date,
          lignes: [],
          totalQte: 0,
        };
      }
      fichesMap[m.bon || 'sans-bon'].lignes.push(m);
      fichesMap[m.bon || 'sans-bon'].totalQte += m.quantite;
    });

    const fiches = Object.values(fichesMap)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice((parseInt(page) - 1) * parseInt(limit), parseInt(page) * parseInt(limit));

    res.json({ fiches, total: Object.values(fichesMap).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/fiches/generer - Générer une nouvelle fiche de réception
router.post('/generer', async (req, res) => {
  try {
    const { beneficiaire, fonction, agence, bus, motif, date } = req.body;

    if (!beneficiaire) {
      return res.status(400).json({ error: 'Bénéficiaire requis' });
    }

    const numero = await genFiche();

    const fiche = {
      numero,
      date: date ? new Date(date) : new Date(),
      beneficiaire,
      fonction: fonction || '',
      agence: agence || '',
      bus: bus || '',
      motif: motif || '',
      lignes: [],
      totalQte: 0,
    };

    res.status(201).json({ message: 'Fiche créée', fiche });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;