const express = require('express');
const router = express.Router();
const Mouvement = require('../models/Mouvement');
const Article = require('../models/Article');
const Settings = require('../models/Settings');

// Générer numéro de bon
const genBon = async () => {
  const settings = await Settings.getSettings();
  const bon = `BS-${new Date().getFullYear()}-${String(settings.bonSeq++).padStart(4, '0')}`;
  await settings.save();
  return bon;
};

// GET /api/mouvements - Lister les mouvements
router.get('/', async (req, res) => {
  try {
    const { search, type, agence, dateDebut, dateFin, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (type) filter.type = type;
    if (agence) filter.agence = agence;
    if (dateDebut || dateFin) {
      filter.date = {};
      if (dateDebut) filter.date.$gte = new Date(dateDebut);
      if (dateFin) filter.date.$lte = new Date(dateFin);
    }
    if (search) {
      filter.$text = { $search: search };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const mouvements = await Mouvement.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Mouvement.countDocuments(filter);

    res.json({ mouvements, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mouvements - Créer un mouvement (entrée/sortie/ajustement)
router.post('/', async (req, res) => {
  try {
    const {
      articleId, type, quantite, agence, beneficiaire, fonction, bus,
      serieDu, serieAu, motif, operateur, date, bon
    } = req.body;

    const article = await Article.findById(articleId);
    if (!article) return res.status(404).json({ error: 'Article non trouvé' });

    const avant = article.quantite || 0;
    let apres;

    if (type === 'IN') apres = avant + quantite;
    else if (type === 'OUT') {
      if (quantite > avant) {
        return res.status(400).json({ error: 'Stock insuffisant' });
      }
      apres = avant - quantite;
    } else if (type === 'ADJ') apres = quantite; // ajustement direct
    else return res.status(400).json({ error: 'Type invalide' });

    let numeroBon = bon;
    if (type === 'OUT' && !numeroBon) {
      numeroBon = await genBon();
    }

    const mouvement = await Mouvement.create({
      articleId,
      code: article.code,
      nom: article.nom,
      categorie: article.categorie,
      type,
      quantite,
      stockAvant: avant,
      stockApres: apres,
      agence: agence || '',
      beneficiaire: beneficiaire || '',
      fonction: fonction || '',
      bus: bus || '',
      serieDu: serieDu || '',
      serieAu: serieAu || '',
      motif: motif || '',
      bon: numeroBon || '',
      operateur: operateur || '',
      date: date ? new Date(date) : new Date(),
      creePar: req.user ? req.user.id : null,
    });

    // Mettre à jour l'article
    article.quantite = apres;
    article.majLe = new Date();
    article.majPar = req.user ? req.user.id : null;
    await article.save();

    res.status(201).json({ message: 'Mouvement enregistré', mouvement, article });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mouvements/:id - Détail d'un mouvement
router.get('/:id', async (req, res) => {
  try {
    const mouvement = await Mouvement.findById(req.params.id);
    if (!mouvement) return res.status(404).json({ error: 'Mouvement non trouvé' });
    res.json({ mouvement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/mouvements/:id/annuler - Annuler un mouvement (contre-passation)
router.put('/:id/annuler', async (req, res) => {
  try {
    const mouvement = await Mouvement.findById(req.params.id);
    if (!mouvement) return res.status(404).json({ error: 'Mouvement non trouvé' });
    if (mouvement.annule) return res.status(400).json({ error: 'Déjà annulé' });

    const article = await Article.findById(mouvement.articleId);
    if (!article) return res.status(404).json({ error: 'Article introuvable' });

    // Créer mouvement inverse
    let typeInverse, qteInverse;
    if (mouvement.type === 'IN') {
      typeInverse = 'OUT';
      qteInverse = mouvement.quantite;
      if (qteInverse > article.quantite) {
        return res.status(400).json({ error: 'Stock insuffisant pour annuler' });
      }
    } else if (mouvement.type === 'OUT') {
      typeInverse = 'IN';
      qteInverse = mouvement.quantite;
    } else {
      typeInverse = 'ADJ';
      qteInverse = article.quantite - (mouvement.stockApres - mouvement.stockAvant);
    }

    const avant = article.quantite;
    let apres;
    if (typeInverse === 'IN') apres = avant + qteInverse;
    else if (typeInverse === 'OUT') apres = avant - qteInverse;
    else apres = qteInverse;

    await Mouvement.create({
      articleId: mouvement.articleId,
      code: mouvement.code,
      nom: mouvement.nom,
      categorie: mouvement.categorie,
      type: typeInverse,
      quantite: qteInverse,
      stockAvant: avant,
      stockApres: apres,
      agence: mouvement.agence,
      beneficiaire: mouvement.beneficiaire,
      fonction: mouvement.fonction,
      bus: mouvement.bus,
      motif: `Annulation du ${mouvement.type} du ${new Date(mouvement.date).toLocaleDateString('fr-FR')}`,
      bon: mouvement.bon,
      operateur: req.user ? req.user.nom : 'Système',
      date: new Date(),
      creePar: req.user ? req.user.id : null,
    });

    article.quantite = apres;
    article.majLe = new Date();
    await article.save();

    mouvement.annule = true;
    mouvement.annuleLe = new Date();
    mouvement.annulePar = req.user ? req.user.id : null;
    await mouvement.save();

    res.json({ message: 'Mouvement annulé', mouvement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;