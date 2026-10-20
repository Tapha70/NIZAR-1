/**
 * Nizar Transport Voyageurs - Backend API
 * Gestion de stock avec synchronisation temps réel (Socket.io)
 * Serveur Node.js + Express + MongoDB
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Import des routes
const authRoutes = require('./routes/auth');
const articleRoutes = require('./routes/articles');
const mouvementRoutes = require('./routes/mouvements');
const bonRoutes = require('./routes/bons');
const ficheRoutes = require('./routes/fiches');
const settingsRoutes = require('./routes/settings');
const syncRoutes = require('./routes/sync');

// Import des middlewares
const { authenticateToken } = require('./middleware/auth');
const { errorHandler } = require('./middleware/error');

// Connexion à MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`✅ MongoDB connecté : ${conn.connection.host}`);
  } catch (err) {
    console.error('❌ Erreur connexion MongoDB :', err.message);
    process.exit(1);
  }
};

// Initialisation Express
const app = express();
const server = http.createServer(app);

// Socket.io pour synchronisation temps réel
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Middlewares globaux
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limite par IP
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rendre io accessible dans les routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/mouvements', mouvementRoutes);
app.use('/api/bons', bonRoutes);
app.use('/api/fiches', ficheRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/sync', syncRoutes);

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Gestion des erreurs 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// Middleware d'erreur global
app.use(errorHandler);

// Événements Socket.io
io.on('connection', (socket) => {
  console.log('🔌 Client connecté :', socket.id);

  // Rejoindre une "room" utilisateur pour notifications ciblées
  socket.on('join-user', (userId) => {
    socket.join(`user-${userId}`);
    console.log(`📡 Utilisateur ${userId} rejoint sa room`);
  });

  // Notifier qu'une modification a eu lieu
  socket.on('data-changed', (data) => {
    // Diffuser à tous les autres clients connectés
    socket.broadcast.emit('data-updated', {
      ...data,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client déconnecté :', socket.id);
  });
});

// Démarrage du serveur
const PORT = process.env.PORT || 5000;
connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log(`📊 Environnement : ${process.env.NODE_ENV || 'development'}`);
  });
});

module.exports = { app, server, io };