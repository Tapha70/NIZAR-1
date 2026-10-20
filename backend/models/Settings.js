const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  societe: { type: String, default: 'Nizar Transport Voyageurs' },
  operateur: { type: String, default: '' },
  prefixe: { type: String, default: 'NTV', uppercase: true },
  devise: { type: String, default: 'FCFA' },
  agences: [{ type: String, trim: true }],
  categories: [{ type: String, trim: true }],
  unites: [{ type: String, trim: true }],
  bonSeq: { type: Number, default: 1 },
  ficheSeq: { type: Number, default: 1 },
  printFiche: { type: Boolean, default: true },
  derniereAgence: { type: String, trim: true },
  derniereModification: { type: Date, default: Date.now },
  modifiePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Un seul document de settings (singleton)
settingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({
      societe: 'Nizar Transport Voyageurs',
      agences: ['Niamey (Siège)', 'Dosso', 'Maradi', 'Zinder', 'Tahoua', 'Agadez', 'Diffa', 'Tillabéri'],
      categories: ['Carnets', 'Billets', 'Bons', 'Documents de transport', 'Fournitures de bureau'],
      unites: ['Unité', 'Carnet', 'Bloc', 'Paquet', 'Rame', 'Boîte', 'Rouleau', 'Lot'],
    });
  }
  return settings;
};

module.exports = mongoose.model('Settings', settingsSchema);