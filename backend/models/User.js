const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  nom: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  motDePasse: { type: String, required: true },
  role: { type: String, enum: ['admin', 'operateur', 'lecteur'], default: 'operateur' },
  agence: { type: String, trim: true },
  operateur: { type: String, trim: true }, // nom affiché
  actif: { type: Boolean, default: true },
  derniereConnexion: { type: Date },
  creeLe: { type: Date, default: Date.now },
}, { timestamps: true });

userSchema.index({ email: 1 });
userSchema.index({ role: 1 });

module.exports = mongoose.model('User', userSchema);