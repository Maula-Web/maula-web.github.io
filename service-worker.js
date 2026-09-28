/**
 * Service Worker Unificado - Peña Maulas PWA
 * =========================================================================
 * Combina:
 * 1. App Shell Pre-caching & Offline Fallback (PWA)
 * 2. Firebase Cloud Messaging (FCM) Compat en segundo plano
 * 3. W3C Web Push Protocol (Apple APNs en iOS 16.4+ y Google FCM en Android)
 * Versión de caché: maulas-pwa-v1.57
 * =========================================================================
 */

// 0. SDKs de Firebase Messaging para escucha de notificaciones Push oficiales de Google
try {
    importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

    const firebaseConfig = {
        apiKey: "AIzaSyClk1Z8cUSWqSII_KWVyDo3oExgbg4hUDo",
        authDomain: "maulasweb.firebaseapp.com",
        projectId: "maulasweb",
        storageBucket: "maulasweb.firebasestorage.app",
        messagingSenderId: "731951291672",
        appId: "1:731951291672:web:ac053aac5aecc8774dd26d"
    };

    if (typeof firebase !== 'undefined' && firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
        const fcmMessaging = firebase.messaging();

        // Handler FCM oficial de Google en segundo plano
        fcmMessaging.onBackgroundMessage((payload) => {
            console.log('[service-worker.js] Notificación Push FCM recibida en segundo plano:', payload);

            const notificationTitle = payload.notification?.title || payload.data?.title || '⚽ Peña Maulas';
            const notificationBody = payload.notification?.body || payload.data?.body || 'Nueva notificación oficial de la Peña Maulas.';
            const targetUrl = payload.data?.url || payload.fcmOptions?.link || './';

            const notificationOptions = {
                body: notificationBody,
                icon: payload.notification?.icon || payload.data?.icon || 'icons/icon-192x192.png',
                badge: 'icons/favicon-32x32.png',
                vibrate: [300, 100, 300, 100, 300],
                tag: payload.data?.tag || 'fcm-push-' + Date.now(),
                renotify: true,
                requireInteraction: true,
                silent: false,
                actions: [
                    { action: 'open_app', title: '📲 Ver Peña Maulas' }
                ],
                data: {
                    url: targetUrl,
                    receivedAt: Date.now()
                }
            };

            return self.registration.showNotification(notificationTitle, notificationOptions);
        });
    }
} catch (e) {
    console.warn('[service-worker.js] Aviso cargando Firebase Messaging en SW:', e);
}

const CACHE_NAME = 'maulas-pwa-v1.59';

// Recursos críticos para precachear (App Shell completo)
const CORE_ASSETS = [
    './',
    'index.html',
    'dashboard_2.html',
    'pronosticos.html',
    'pronosticos_2.html',
    'jornadas.html',
    'jornadas_2.html',
    'socios.html',
    'socios_2.html',
    'resultados.html',
    'clasificacion_2.html',
    'resultados_2.html',
    'bote.html',
    'bote_2.html',
    'resumen-temporada.html',
    'resumen_2.html',
    'votaciones.html',
    'votaciones_2.html',
    'admin.html',
    'admin_2.html',
    'login.html',
    'manual.html',
    'MANUAL_COMPLETO_2026.html',
    'css/styles.css',
    'css/light-theme.css',
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
    'js/jornadas_2.js',
    'js/dashboard.js',
    'js/dashboard_2.js',
    'js/bote.js',
    'js/bote_2.js',
    'js/bote_2_data.js',
    'js/socios_2.js',
    'js/bote-engine.js',
    'js/dice-service.js',
    'js/text-importer.js',
    'js/votaciones.js',
    'js/resultados.js',
    'js/resumen-temporada.js',
    'js/telegram-service.js',
    'js/push-service.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css',
    'https://cdn.jsdelivr.net/npm/flatpickr/dist/themes/dark.css',
    'https://cdn.jsdelivr.net/npm/flatpickr',
    'https://cdn.jsdelivr.net/npm/flatpickr/dist/l10n/es.js'
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

    // B. Archivos estáticos: Stale-While-Revalidate
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
                .catch(() => {});

            return cachedResp || fetchPromise;
        })
    );
});

// =========================================================================
// 4. NOTIFICACIONES PUSH PWA (Web Push API nativa de fondo y pantalla de bloqueo)
// =========================================================================

self.addEventListener('push', (event) => {
    console.log('[Service Worker] Evento Push remoto recibido:', event);
    let payload = {
        title: '⚽ Peña Maulas',
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
            if (json.notification) {
                payload.title = json.notification.title || payload.title;
                payload.body = json.notification.body || payload.body;
                if (json.notification.icon) payload.icon = json.notification.icon;
            }
            if (json.data) {
                if (json.data.title) payload.title = json.data.title;
                if (json.data.body) payload.body = json.data.body;
                if (json.data.url) payload.url = json.data.url;
                if (json.data.icon) payload.icon = json.data.icon;
            }
        } catch (e) {
            try {
                payload.body = event.data.text() || payload.body;
            } catch (err) {}
        }
    }

    const options = {
        body: payload.body,
        icon: payload.icon || 'icons/icon-192x192.png',
        badge: payload.badge || 'icons/favicon-32x32.png',
        tag: payload.tag || 'maulas-notification',
        renotify: true,
        requireInteraction: true,
        silent: false,
        actions: [
            { action: 'open_app', title: '📲 Ver Peña Maulas' }
        ],
        data: {
            url: payload.url || './',
            receivedAt: Date.now()
        }
    };

    event.waitUntil(
        self.registration.showNotification(payload.title, options).catch((err) => {
            console.warn('[Service Worker] showNotification falló con opciones avanzadas, reintentando básico:', err);
            return self.registration.showNotification(payload.title, {
                body: payload.body,
                icon: 'icons/icon-192x192.png',
                data: { url: payload.url || './' }
            });
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Clic en notificación:', event.notification.tag, 'Acción:', event.action);
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

// Mensajería desde la aplicación para programar pruebas locales
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SCHEDULE_NOTIFICATION') {
        const delay = event.data.delay || 5000;
        const payload = event.data.payload || {
            title: '⚽ Peña Maulas (Móvil Bloqueado)',
            body: '¡Hola Fernando Lozano! Notificación local recibida.',
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
                        vibrate: [300, 100, 300, 100, 300],
                        tag: payload.tag || 'test-scheduled-' + Date.now(),
                        renotify: true,
                        requireInteraction: true,
                        silent: false,
                        actions: [
                            { action: 'open_app', title: '📲 Ver Peña Maulas' }
                        ],
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







