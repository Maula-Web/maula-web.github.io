/**
 * Service Worker - Peña Maulas PWA
 * Versión de caché: maulas-pwa-v1.0
 */

const CACHE_NAME = 'maulas-pwa-v1.1';

// Recursos críticos para precachear (App Shell completo)
const CORE_ASSETS = [
    './',
    'index.html',
    'pronosticos.html',
    'jornadas.html',
    'socios.html',
    'resultados.html',
    'bote.html',
    'resumen-temporada.html',
    'votaciones.html',
    'admin.html',
    'login.html',
    'theme-editor.html',
    'manual.html',
    'MANUAL_COMPLETO_2026.html',
    'css/styles.css',
    'css/resumen-styles.css',
    'manifest.json',
    'apple-touch-icon.png',
    'apple-touch-icon-precomposed.png',
    'favicon.ico',
    'LOGO_MAULAS.png',
    'LOGO_MAULAS_VERDE.png',
    'icons/icon-192x192.png',
    'icons/icon-512x512.png',
    'icons/icon-maskable-192x192.png',
    'icons/icon-maskable-512x512.png',
    'icons/favicon-32x32.png',
    'icons/favicon-16x16.png',
    'js/auth.js',
    'js/db-service.js',
    'js/firebase-init.js',
    'js/scoring.js',
    'js/utils.js',
    'js/frases.js',
    'js/pronosticos.js',
    'js/jornadas.js',
    'js/dashboard.js',
    'js/bote.js',
    'js/bote-engine.js',
    'js/dice-service.js',
    'js/text-importer.js',
    'js/votaciones.js',
    'js/resultados.js',
    'js/resumen-temporada.js',
    'js/theme-editor.js',
    'js/telegram-service.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

// 1. Instalación: Precachear recursos del App Shell de manera resiliente
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log('[Service Worker] Precacheando App Shell de Peña Maulas...');
            const results = await Promise.allSettled(
                CORE_ASSETS.map((asset) => cache.add(asset))
            );
            const failed = results.filter((r) => r.status === 'rejected');
            if (failed.length > 0) {
                console.warn(`[Service Worker] ${failed.length} recursos no pudieron precachearse.`);
            } else {
                console.log('[Service Worker] Todos los recursos precacheados con éxito.');
            }
        })
    );
});

// 2. Activación: Limpieza de versiones antiguas de caché
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(
                keyList.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[Service Worker] Eliminando caché antigua:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. Fetch: Estrategia de red y caché inteligente
self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // Solo interceptar peticiones GET
    if (req.method !== 'GET') return;

    // Ignorar extensiones del navegador u otros protocolos
    if (!url.protocol.startsWith('http')) return;

    // NO interceptar peticiones a la API directa de Firestore DB ni a Telegram
    // Firestore gestiona su propia persistencia offline mediante IndexedDB
    if (
        url.hostname === 'firestore.googleapis.com' ||
        url.hostname.endsWith('.firestore.googleapis.com') ||
        url.pathname.includes('google.firestore') ||
        url.hostname.includes('api.telegram.org') ||
        url.hostname.includes('web.telegram.org')
    ) {
        return;
    }

    // A. Navegación HTML: Network-First con fallback a Caché
    if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(req)
                .then((networkResp) => {
                    if (networkResp && networkResp.status === 200) {
                        const copy = networkResp.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
                    }
                    return networkResp;
                })
                .catch(async () => {
                    const cached = await caches.match(req);
                    if (cached) return cached;
                    return caches.match('index.html');
                })
        );
        return;
    }

    // B. Archivos estáticos (CSS, JS, imágenes, fuentes, iconos): Stale-While-Revalidate
    event.respondWith(
        caches.match(req).then((cachedResp) => {
            const fetchPromise = fetch(req)
                .then((networkResp) => {
                    if (networkResp && (networkResp.status === 200 || networkResp.type === 'opaque')) {
                        const copy = networkResp.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
                    }
                    return networkResp;
                })
                .catch(() => {
                    // Si falla la red (offline), la promesa falla pero devolvemos cachedResp si existe
                });

            return cachedResp || fetchPromise;
        })
    );
});
