const mongoose = require('mongoose');

const mouvementSchema = new mongoose.Schema({
  articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  nom: { type: String, required: true, trim: true },
  categorie: { type: String, trim: true },
  type: { type: String, enum: ['IN', 'OUT', 'ADJ'], required: true },
  quantite: { type: Number, required: true, min: 0 },
  stockAvant: { type: Number, required: true },
  stockApres: { type: Number, required: true },
  agence: { type: String, trim: true },
  beneficiaire: { type: String, trim: true },
  fonction: { type: String, trim: true },
  bus: { type: String, trim: true },
  serieDu: { type: String, trim: true },
  serieAu: { type: String, trim: true },
  motif: { type: String, trim: true },
  bon: { type: String, trim: true },
  operateur: { type: String, trim: true },
  annule: { type: Boolean, default: false },
  annuleLe: { type: Date },
  annulePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date: { type: Date, default: Date.now },
  creePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

mouvementSchema.index({ articleId: 1 });
mouvementSchema.index({ type: 1 });
mouvementSchema.index({ date: -1 });
mouvementSchema.index({ bon: 1 });
mouvementSchema.index({ agence: 1 });

module.exports = mongoose.model('Mouvement', mouvementSchema);