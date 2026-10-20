const express = require('express');
const router = express.Router();
const Article = require('../models/Article');
const Mouvement = require('../models/Mouvement');
const Settings = require('../models/Settings');

// GET /api/articles - Lister les articles (avec filtres et recherche)
router.get('/', async (req, res) => {
  try {
    const { search, categorie, actif, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (search) {
      filter.$text = { $search: search };
    }
    if (categorie) filter.categorie = categorie;
    if (actif !== undefined) filter.actif = actif === 'true';

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const articles = await Article.find(filter)
      .sort({ nom: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Article.countDocuments(filter);

    res.json({ articles, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/articles/:id - Détail d'un article
router.get('/:id', async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ error: 'Article non trouvé' });

    // Derniers mouvements
    const mouvements = await Mouvement.find({ articleId: article._id })
      .sort({ date: -1 })
      .limit(10);

    res.json({ article, mouvements });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/articles - Créer un article
router.post('/', async (req, res) => {
  try {
    const {
      code, nom, categorie, unite, quantite, seuil, prix,
      emplacement, description, alias, agence, codeGenere, creePar
    } = req.body;

    if (!code || !nom || !categorie) {
      return res.status(400).json({ error: 'Code, nom et catégorie requis' });
    }

    // Vérifier que le code n'existe pas déjà
    const existing = await Article.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(409).json({ error: 'Ce code-barres existe déjà' });
    }

    const article = await Article.create({
      code: code.toUpperCase(),
      nom,
      categorie,
      unite: unite || 'Unité',
      quantite: quantite || 0,
      seuil: seuil || 5,
      prix: prix || 0,
      emplacement: emplacement || '',
      description: description || '',
      alias: alias || [],
      agence: agence || '',
      codeGenere: codeGenere || false,
      creePar: creePar || null,
      majPar: creePar || null,
    });

    // Créer un mouvement d'entrée si stock initial
    if (quantite && quantite > 0) {
      await Mouvement.create({
        articleId: article._id,
        code: article.code,
        nom: article.nom,
        categorie: article.categorie,
        type: 'IN',
        quantite,
        stockAvant: 0,
        stockApres: quantite,
        agence,
        motif: 'Stock initial',
        operateur: creePar || 'Système',
        creePar: creePar || null,
        date: new Date(),
      });
    }

    res.status(201).json({ message: 'Article créé', article });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/articles/:id - Modifier un article
router.put('/:id', async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ error: 'Article non trouvé' });

    // Vérifier unicité du code si modifié
    if (req.body.code && req.body.code.toUpperCase() !== article.code) {
      const existing = await Article.findOne({ code: req.body.code.toUpperCase() });
      if (existing) return res.status(409).json({ error: 'Ce code-barres existe déjà' });
    }

    const updates = { ...req.body, majLe: new Date(), majPar: req.body.majPar || null };
    if (updates.code) updates.code = updates.code.toUpperCase();

    Object.assign(article, updates);
    await article.save();

    res.json({ message: 'Article modifié', article });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/articles/:id - Supprimer un article
router.delete('/:id', async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ error: 'Article non trouvé' });

    // Marquer comme inactif plutôt que supprimer (conserve l'historique)
    article.actif = false;
    article.majLe = new Date();
    await article.save();

    res.json({ message: 'Article désactivé (historique conservé)' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/articles/:id/stock - Stock actuel d'un article
router.get('/:id/stock', async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ error: 'Article non trouvé' });

    res.json({
      id: article._id,
      code: article.code,
      nom: article.nom,
      quantite: article.quantite,
      unite: article.unite,
      seuil: article.seuil,
      statut: article.quantite <= 0 ? 'rupture' : article.quantite <= article.seuil ? 'bas' : 'ok',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;