/**
 * Firebase Cloud Messaging Service Worker - Peña Maulas PWA
 * =========================================================================
 * Escucha notificaciones Push oficiales de Google FCM en segundo plano
 * Funciona con la web y el navegador completamente cerrados o pantalla bloqueada.
 * =========================================================================
 */

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

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handler de notificaciones en segundo plano (app cerrada / móvil bloqueado)
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Notificación Push FCM recibida en segundo plano:', payload);

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

// Al pulsar sobre la notificación recibida
self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw.js] Clic en notificación FCM');
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
