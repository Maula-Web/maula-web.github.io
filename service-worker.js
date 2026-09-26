/**
 * Service Worker - Peña Maulas PWA
 * Versión de caché: maulas-pwa-v1.0
 */

const CACHE_NAME = 'maulas-pwa-v1.3';

// Recursos críticos para precachear (App Shell completo)
const CORE_ASSETS = [
    './',
    'index.html',
    'pronosticos.html',
    'jornadas.html',
    'socios.html',
    'resultados.html',
    'bote.html',
    'bote_2.html',
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
    'js/bote_2.js',
    'js/bote-engine.js',
    'js/dice-service.js',
    'js/text-importer.js',
    'js/votaciones.js',
    'js/resultados.js',
    'js/resumen-temporada.js',
    'js/theme-editor.js',
    'js/telegram-service.js',
    'js/push-service.js',
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

// =========================================================================
// 4. NOTIFICACIONES PUSH PWA (Web Push API de fondo y pantalla de bloqueo)
// =========================================================================

self.addEventListener('push', (event) => {
    console.log('[Service Worker] Evento Push recibido:', event);
    let payload = {
        title: 'Peña Maulas ⚽',
        body: 'Nueva notificación oficial de la Peña Maulas.',
        icon: 'icons/icon-192x192.png',
        badge: 'icons/favicon-32x32.png',
        tag: 'maulas-push-' + Date.now(),
        url: './'
    };

    if (event.data) {
        try {
            const json = event.data.json();
            payload = { ...payload, ...json };
        } catch (e) {
            payload.body = event.data.text();
        }
    }

    const options = {
        body: payload.body,
        icon: payload.icon || 'icons/icon-192x192.png',
        badge: payload.badge || 'icons/favicon-32x32.png',
        vibrate: [250, 100, 250, 100, 250],
        tag: payload.tag || 'maulas-notification',
        renotify: true,
        data: {
            url: payload.url || './',
            receivedAt: Date.now()
        }
    };

    event.waitUntil(
        self.registration.showNotification(payload.title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Clic en notificación:', event.notification.tag);
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : './';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (let client of windowClients) {
                if (client.url.includes(targetUrl) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

// Mensajería desde la aplicación para programar pruebas retardadas (móvil bloqueado o app cerrada)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SCHEDULE_NOTIFICATION') {
        const delay = event.data.delay || 5000;
        const payload = event.data.payload || {
            title: '⚽ Peña Maulas (Prueba Móvil)',
            body: '¡Hola Fernando Lozano! Las notificaciones funcionan con el terminal bloqueado.',
            icon: 'icons/icon-192x192.png',
            badge: 'icons/favicon-32x32.png',
            tag: 'test-delayed'
        };

        const showPromise = new Promise((resolve) => {
            setTimeout(async () => {
                try {
                    await self.registration.showNotification(payload.title, {
                        body: payload.body,
                        icon: payload.icon || 'icons/icon-192x192.png',
                        badge: payload.badge || 'icons/favicon-32x32.png',
                        vibrate: [250, 100, 250, 100, 250],
                        tag: payload.tag || 'test-scheduled-' + Date.now(),
                        renotify: true,
                        data: { url: './' }
                    });
                } catch (err) {
                    console.error('[Service Worker] Error al mostrar notificación programada:', err);
                } finally {
                    resolve();
                }
            }, delay);
        });

        event.waitUntil(showPromise);
    }
});
