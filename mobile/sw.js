/**
 * Service Worker - NTV Stock PWA
 * Gestion du cache et mode hors-ligne
 */

const CACHE_NAME = 'ntv-stock-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
];

// Installation - mise en cache des ressources statiques
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activation - nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Stratégie : Cache First pour les assets statiques, Network First pour l'API
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Requêtes API - Network First avec fallback cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cloner pour mise en cache si succès
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Assets statiques - Cache First
  event.respondWith(
    caches.match(request)
      .then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            if (response.ok && request.method === 'GET') {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          });
      })
  );
});

// Synchronisation en arrière-plan (quand le réseau revient)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-stock') {
    event.waitUntil(
      // Synchroniser les données en attente
      syncPendingData()
    );
  }
});

async function syncPendingData() {
  try {
    const pending = await getPendingOperations();
    for (const op of pending) {
      await fetch(`/api/${op.endpoint}`, {
        method: op.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(op.data),
      });
    }
    await clearPendingOperations();
  } catch (err) {
    console.error('Sync échouée :', err);
  }
}

async function getPendingOperations() { return []; }
async function clearPendingOperations() {}