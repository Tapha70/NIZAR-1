const express = require('express');
const router = express.Router();
const Mouvement = require('../models/Mouvement');

// GET /api/bons - Liste des bons de sortie
router.get('/', async (req, res) => {
  try {
    const { dateDebut, dateFin, agence, page = 1, limit = 50 } = req.query;
    const filter = { type: 'OUT', annule: false };

    if (agence) filter.agence = agence;
    if (dateDebut || dateFin) {
      filter.date = {};
      if (dateDebut) filter.date.$gte = new Date(dateDebut);
      if (dateFin) filter.date.$lte = new Date(dateFin);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const mouvements = await Mouvement.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Grouper par bon
    const bonsMap = {};
    mouvements.forEach((m) => {
      if (!bonsMap[m.bon]) {
        bonsMap[m.bon] = {
          bon: m.bon,
          date: m.date,
          agence: m.agence,
          beneficiaire: m.beneficiaire,
          operateur: m.operateur,
          lignes: [],
          totalQte: 0,
        };
      }
      bonsMap[m.bon].lignes.push(m);
      bonsMap[m.bon].totalQte += m.quantite;
    });

    const bons = Object.values(bonsMap).sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ bons, total: bons.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bons/:bon - Détail d'un bon (toutes ses lignes)
router.get('/:bon', async (req, res) => {
  try {
    const lignes = await Mouvement.find({ bon: req.params.bon, type: 'OUT', annule: false })
      .sort({ date: 1 });

    if (!lignes.length) return res.status(404).json({ error: 'Bon non trouvé' });

    const bon = {
      numero: lignes[0].bon,
      date: lignes[0].date,
      agence: lignes[0].agence,
      beneficiaire: lignes[0].beneficiaire,
      fonction: lignes[0].fonction,
      bus: lignes[0].bus,
      motif: lignes[0].motif,
      operateur: lignes[0].operateur,
      lignes,
      totalQte: lignes.reduce((s, l) => s + l.quantite, 0),
    };

    res.json({ bon });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;