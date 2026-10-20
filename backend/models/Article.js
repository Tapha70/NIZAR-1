const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, uppercase: true },
  nom: { type: String, required: true, trim: true },
  categorie: { type: String, required: true, trim: true },
  unite: { type: String, required: true, trim: true, default: 'Unité' },
  quantite: { type: Number, required: true, default: 0, min: 0 },
  seuil: { type: Number, default: 5, min: 0 },
  prix: { type: Number, default: 0, min: 0 },
  emplacement: { type: String, trim: true },
  description: { type: String, trim: true },
  alias: [{ type: String, trim: true, uppercase: true }],
  codeGenere: { type: Boolean, default: false },
  agence: { type: String, trim: true }, // agence propriétaire
  actif: { type: Boolean, default: true },
  creeLe: { type: Date, default: Date.now },
  majLe: { type: Date, default: Date.now },
  creePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  majPar: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Index pour recherche rapide
articleSchema.index({ code: 1 });
articleSchema.index({ nom: 'text', code: 'text' });
articleSchema.index({ categorie: 1 });
articleSchema.index({ actif: 1 });

module.exports = mongoose.model('Article', articleSchema);