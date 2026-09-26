/**
 * Push Notification Service - Peña Maulas PWA
 * =========================================================================
 * - Rol 'sender': Fernando Lozano (ID: 6)
 *   Dispone del laboratorio de pruebas propio y del sistema para enviar notificaciones a Heradio.
 * - Rol 'receiver_heradio': Heradio (ID: 8)
 *   Solo ve la solicitud de permiso (si aún no lo tiene) y escucha las notificaciones que Fernando le envíe.
 * =========================================================================
 */

const PushService = {
    initialized: false,
    timerInterval: null,
    heradioUnsubscribe: null,

    /**
     * Determina el rol del usuario conectado
     */
    getUserRole() {
        try {
            let userStr = sessionStorage.getItem('maulas_user');
            if (!userStr) {
                userStr = localStorage.getItem('maulas_user');
                if (userStr) sessionStorage.setItem('maulas_user', userStr);
            }

            // Fallback por parámetro en URL si entra como evaluador o prueba directa
            if (!userStr) {
                const params = new URLSearchParams(window.location.search);
                const ev = (params.get('evaluador') || params.get('user') || params.get('socio') || '').toLowerCase();
                if (ev === '6' || ev === 'fernando' || ev === 'lozano') {
                    const u = { id: 6, name: 'Fernando Lozano', email: 'lozano@maulas.com', phone: 'Lozano' };
                    sessionStorage.setItem('maulas_user', JSON.stringify(u));
                    localStorage.setItem('maulas_user', JSON.stringify(u));
                    return 'sender';
                }
                if (ev === '8' || ev === 'heradio') {
                    const u = { id: 8, name: 'Heradio', email: 'heradio@maulas.com', phone: 'Heradio' };
                    sessionStorage.setItem('maulas_user', JSON.stringify(u));
                    localStorage.setItem('maulas_user', JSON.stringify(u));
                    return 'receiver_heradio';
                }
                return null;
            }

            const user = JSON.parse(userStr);
            const uid = String(user.id || '');
            const email = (user.email || '').toLowerCase().trim();
            const name = (user.name || '').toLowerCase().trim();
            const phone = (user.phone || '').toLowerCase().trim();

            // 1. Fernando Lozano (Emisor / Administrador de pruebas)
            if (
                uid === '6' ||
                email === 'lozano@maulas.com' ||
                name.includes('fernando lozano') ||
                (name.includes('lozano') && !name.includes('ram')) ||
                phone.includes('lozano')
            ) {
                return 'sender';
            }

            // 2. Heradio (Receptor de pruebas)
            if (
                uid === '8' ||
                email === 'heradio@maulas.com' ||
                name.includes('heradio')
            ) {
                return 'receiver_heradio';
            }

            return null;
        } catch (e) {
            return null;
        }
    },

    /**
     * Inicialización del servicio según el rol
     */
    async init() {
        const role = this.getUserRole();
        if (!role) return;

        if (this.initialized) return;
        this.initialized = true;

        console.log(`[PushService] Inicializando servicio con rol: ${role}`);

        await this.ensureServiceWorker();

        if (role === 'sender') {
            // FERNANDO LOZANO: Inyectar interfaz completa
            this.injectStyles();
            this.injectUI();
            this.registerSubscriptionInFirestore(6, 'Fernando Lozano');
        } else if (role === 'receiver_heradio') {
            // HERADIO: Solo gestionar permisos y escucha de mensajes
            this.initHeradioReceiver();
        }
    },

    /**
     * Asegura que el Service Worker esté registrado y activo
     */
    async ensureServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.warn('[PushService] Service Worker no soportado en este navegador.');
            return null;
        }

        try {
            const reg = await navigator.serviceWorker.ready;
            console.log('[PushService] Service Worker activo:', reg.scope);
            return reg;
        } catch (e) {
            console.warn('[PushService] Error esperando Service Worker ready:', e);
            return null;
        }
    },

    // =========================================================================
    // FLUJO PARA HERADIO (ID 8) - SIMPLE Y DISCRETO
    // =========================================================================

    async initHeradioReceiver() {
        const perm = ('Notification' in window) ? Notification.permission : 'unsupported';

        if (perm === 'granted') {
            // Permiso ya concedido: registrar presencia y escuchar notificaciones entrantes
            await this.registerSubscriptionInFirestore(8, 'Heradio');
            this.startHeradioInboxListener();
        } else if (perm === 'default') {
            // Permiso pendiente: mostrar banner elegante y discreto en la web
            this.injectHeradioPermissionBanner();
        }
    },

    injectHeradioPermissionBanner() {
        if (document.getElementById('heradio-push-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'heradio-push-banner';
        banner.style.cssText = `
            position: fixed;
            top: 15px;
            left: 50%;
            transform: translateX(-50%);
            width: calc(100% - 30px);
            max-width: 520px;
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            border: 1.5px solid #ff9100;
            border-radius: 14px;
            padding: 14px 18px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.6);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            color: #f8fafc;
            font-family: inherit;
            animation: push-modal-in 0.3s ease-out;
        `;

        banner.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-size:1.6rem;">⚽</span>
                <div>
                    <div style="font-weight:700; font-size:0.95rem; color:#ffd700;">
                        Notificaciones Peña Maulas
                    </div>
                    <div style="font-size:0.8rem; color:#cbd5e1; margin-top:2px;">
                        Hola Heradio, activa las notificaciones para recibir avisos de quinielas y premios en tu móvil.
                    </div>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <button id="heradio-btn-permit" style="
                    background: linear-gradient(135deg, #ff9100 0%, #ea580c 100%);
                    color: #fff;
                    border: none;
                    border-radius: 8px;
                    padding: 8px 14px;
                    font-weight: 700;
                    font-size: 0.82rem;
                    cursor: pointer;
                    white-space: nowrap;
                ">Activar</button>
                <button onclick="document.getElementById('heradio-push-banner').remove()" style="
                    background: none;
                    border: none;
                    color: #94a3b8;
                    font-size: 1.2rem;
                    cursor: pointer;
                    padding: 4px;
                ">✕</button>
            </div>
        `;

        document.body.appendChild(banner);

        document.getElementById('heradio-btn-permit').onclick = async () => {
            await this.requestPermissionForHeradio();
        };
    },

    async requestPermissionForHeradio() {
        if (!('Notification' in window)) {
            alert('Este navegador no soporta notificaciones nativas.');
            return;
        }

        try {
            const permission = await Notification.requestPermission();
            const banner = document.getElementById('heradio-push-banner');
            if (banner) banner.remove();

            if (permission === 'granted') {
                await this.registerSubscriptionInFirestore(8, 'Heradio');
                this.startHeradioInboxListener();

                // Notificación inmediata de bienvenida en el móvil de Heradio
                const reg = await navigator.serviceWorker.ready;
                reg.showNotification('⚽ Peña Maulas', {
                    body: '¡Hola Heradio! Ya tienes las notificaciones activadas para recibir avisos de la peña.',
                    icon: 'icons/icon-192x192.png',
                    badge: 'icons/favicon-32x32.png',
                    vibrate: [300, 100, 300, 100, 300],
                    requireInteraction: true,
                    silent: false,
                    tag: 'heradio-welcome',
                    data: { url: './' }
                });
            } else if (permission === 'denied') {
                alert('Has bloqueado los permisos de notificación. Si deseas activarlos, hazlo en los ajustes del navegador.');
            }
        } catch (e) {
            console.error('[PushService] Error pidiendo permisos a Heradio:', e);
        }
    },

    startHeradioInboxListener() {
        const db = window.db || (window.DataService && window.DataService.db);
        if (!db) {
            console.warn('[PushService] Firestore no disponible para el listener de Heradio.');
            return;
        }

        console.log('[PushService] Heradio escuchando notificaciones en push_inbox/member_8...');

        let lastSeenNonce = localStorage.getItem('last_seen_heradio_nonce') || '';

        if (this.heradioUnsubscribe) this.heradioUnsubscribe();

        this.heradioUnsubscribe = db.collection('push_inbox').doc('member_8').onSnapshot((doc) => {
            if (!doc.exists) return;
            const data = doc.data();
            if (!data || !data.nonce || data.nonce === lastSeenNonce) return;

            // Comprobar antigüedad: si tiene más de 15 minutos, ignorar
            const now = Date.now();
            if (data.timestamp && (now - data.timestamp > 900000)) return;

            lastSeenNonce = data.nonce;
            localStorage.setItem('last_seen_heradio_nonce', lastSeenNonce);

            console.log('[PushService] Notificación entrante para Heradio:', data);

            // 1. Alerta visual inmediata en la pantalla de Heradio
            this.showIncomingAlertToHeradio(data.title || '⚽ Peña Maulas (Fernando)', data.body || '');

            // 2. Notificación nativa en la barra/bloqueo de Android
            const showNotificationNative = async () => {
                const title = data.title || '⚽ Peña Maulas';
                const options = {
                    body: data.body || 'Notificación oficial de la Peña Maulas.',
                    icon: 'icons/icon-192x192.png',
                    badge: 'icons/favicon-32x32.png',
                    vibrate: [300, 100, 300, 100, 300],
                    tag: 'inbox-' + data.nonce,
                    requireInteraction: true,
                    silent: false,
                    actions: [
                        { action: 'open_app', title: '📲 Ver Peña Maulas' }
                    ],
                    data: { url: './' }
                };

                try {
                    const reg = await Promise.race([
                        navigator.serviceWorker.ready,
                        new Promise((_, reject) => setTimeout(() => reject(new Error('SW ready timeout')), 2500))
                    ]);
                    await reg.showNotification(title, options);
                    console.log('[PushService] Notificación nativa mostrada vía Service Worker');
                } catch (e) {
                    console.warn('[PushService] Service Worker demorado, usando Notification fallback:', e);
                    try {
                        new Notification(title, options);
                    } catch (err2) {
                        console.error('[PushService] Fallback nativo falló:', err2);
                    }
                }
            };

            showNotificationNative();
        }, (err) => {
            console.warn('[PushService] Error en listener de Heradio:', err);
        });
    },

    /**
     * Muestra una alerta visual destacada en la pantalla de Heradio
     */
    showIncomingAlertToHeradio(title, body) {
        if ('vibrate' in navigator) {
            try { navigator.vibrate([300, 100, 300, 100, 300]); } catch(e){}
        }

        let alertBox = document.getElementById('heradio-incoming-alert');
        if (!alertBox) {
            alertBox = document.createElement('div');
            alertBox.id = 'heradio-incoming-alert';
            alertBox.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                width: calc(100% - 32px);
                max-width: 500px;
                background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
                border: 2px solid #ff9100;
                border-radius: 16px;
                padding: 16px 20px;
                box-shadow: 0 15px 40px rgba(0,0,0,0.8), 0 0 25px rgba(255,145,0,0.3);
                z-index: 100000;
                color: #fff;
                font-family: inherit;
                animation: push-modal-in 0.3s ease-out;
            `;
            document.body.appendChild(alertBox);
        }

        alertBox.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:1.4rem;">🔔</span>
                    <strong style="color:#ffd700; font-size:1rem;">${title}</strong>
                </div>
                <button onclick="document.getElementById('heradio-incoming-alert').remove()" style="background:none; border:none; color:#94a3b8; font-size:1.3rem; cursor:pointer; padding:0 4px;">✕</button>
            </div>
            <div style="font-size:0.95rem; color:#f8fafc; line-height:1.4;">
                ${body}
            </div>
        `;

        setTimeout(() => {
            const el = document.getElementById('heradio-incoming-alert');
            if (el) el.remove();
        }, 15000);
    },

    // =========================================================================
    // FLUJO PARA FERNANDO LOZANO (ID 6) - PANEL COMPLETO DE EMISIÓN
    // =========================================================================

    /**
     * Comprueba en Firestore el estado de permisos y conexión de Heradio
     */
    async checkHeradioStatus() {
        const statusElem = document.getElementById('heradio-status-info');
        if (!statusElem) return;

        statusElem.innerHTML = `<span style="color:#94a3b8;">Verificando estado de Heradio...</span>`;

        try {
            const db = window.db || (window.DataService && window.DataService.db);
            if (!db) {
                statusElem.innerHTML = `<span style="color:#f87171;">Base de datos no conectada.</span>`;
                return;
            }

            const doc = await db.collection('push_subscriptions').doc('member_8').get();
            if (doc.exists && doc.data().permission === 'granted') {
                const data = doc.data();
                const lastUpdated = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'reciente';
                statusElem.innerHTML = `
                    <div style="display:flex; align-items:center; gap:8px; color:#4ade80; font-weight:700;">
                        <span>🟢 Heradio tiene notificaciones ACTIVADAS</span>
                    </div>
                    <div style="font-size:0.75rem; color:#94a3b8; margin-top:2px;">
                        Dispositivo sincronizado (${lastUpdated}) &bull; Listo para recibir tus pruebas.
                    </div>
                `;
            } else {
                statusElem.innerHTML = `
                    <div style="display:flex; align-items:center; gap:8px; color:#fbbf24; font-weight:700;">
                        <span>🟡 Heradio aún no ha aceptado permisos</span>
                    </div>
                    <div style="font-size:0.75rem; color:#94a3b8; margin-top:2px;">
                        En cuanto Heradio entre a la web desde su móvil, le aparecerá el botón para activarlas.
                    </div>
                `;
            }
        } catch (e) {
            console.error('[PushService] Error consultando estado de Heradio:', e);
            statusElem.innerHTML = `<span style="color:#f87171;">Error al consultar estado de Heradio.</span>`;
        }
    },

    /**
     * Envía una notificación a Heradio a través de Firestore
     */
    async sendNotificationToHeradio(customText = null) {
        const msgInput = document.getElementById('heradio-push-message');
        const sendBtn = document.getElementById('heradio-btn-send');
        const message = (customText || (msgInput ? msgInput.value : '')).trim();

        if (!message) {
            alert('Por favor escribe un mensaje para Heradio.');
            return;
        }

        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = `⏳ Enviando a Heradio...`;
        }

        try {
            const db = window.db || (window.DataService && window.DataService.db);
            if (!db) throw new Error('Firestore no está disponible');

            const payload = {
                title: '⚽ Peña Maulas (Fernando Lozano)',
                body: message,
                senderId: 6,
                senderName: 'Fernando Lozano',
                targetMemberId: 8,
                targetName: 'Heradio',
                timestamp: Date.now(),
                nonce: Date.now() + '_' + Math.random().toString(36).substring(7)
            };

            await db.collection('push_inbox').doc('member_8').set(payload);

            this.showToast('✅ ¡Notificación enviada a Heradio!');
            const alertBox = document.getElementById('heradio-send-feedback');
            if (alertBox) {
                alertBox.style.display = 'block';
                alertBox.innerHTML = `
                    <div style="color:#4ade80; font-weight:bold; font-size:0.85rem;">
                        ✅ Notificación enviada al móvil de Heradio con éxito.
                    </div>
                    <div style="color:#cbd5e1; font-size:0.75rem; margin-top:2px;">
                        Mensaje: "${message}"
                    </div>
                `;
                setTimeout(() => { alertBox.style.display = 'none'; }, 6000);
            }
        } catch (e) {
            console.error('[PushService] Error enviando notificación a Heradio:', e);
            alert('Error al enviar notificación a Heradio: ' + e.message);
        } finally {
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = `🚀 Enviar Notificación a Heradio Ahora`;
            }
        }
    },

    /**
     * Guarda la suscripción Web Push en Firestore
     */
    async registerSubscriptionInFirestore(memberId, memberName) {
        try {
            const db = window.db || (window.DataService && window.DataService.db);
            if (!db) return;

            const isStandalone = window.matchMedia('(display-mode: standalone)').matches || !!window.navigator.standalone;
            const subData = {
                memberId: memberId,
                memberName: memberName,
                permission: ('Notification' in window) ? Notification.permission : 'unsupported',
                updatedAt: new Date().toISOString(),
                userAgent: navigator.userAgent,
                isStandalone: isStandalone
            };

            await db.collection('push_subscriptions').doc(`member_${memberId}`).set(subData, { merge: true });
            console.log(`[PushService] Estado de suscripción registrado para ${memberName} (ID: ${memberId})`);
        } catch (err) {
            console.warn('[PushService] Aviso guardando suscripción:', err);
        }
    },

    /**
     * Solicita permisos de notificación al sistema operativo / navegador (para Fernando)
     */
    async requestPermission() {
        if (!('Notification' in window)) {
            alert('Este navegador no soporta notificaciones nativas.');
            return 'unsupported';
        }

        try {
            const permission = await Notification.requestPermission();
            this.updateUIStatus();

            if (permission === 'granted') {
                this.registerSubscriptionInFirestore(6, 'Fernando Lozano');
                return 'granted';
            } else if (permission === 'denied') {
                alert('Los permisos de notificación han sido bloqueados. Debes activarlos manualmente en los ajustes de tu navegador o del móvil.');
                return 'denied';
            }
            return permission;
        } catch (e) {
            console.error('[PushService] Error solicitando permisos:', e);
            return 'error';
        }
    },

    /**
     * Lanza una notificación inmediata en directo (Fernando)
     */
    async sendImmediateTest() {
        if (!('Notification' in window)) {
            alert('Tu navegador no admite notificaciones.');
            return;
        }

        if (Notification.permission !== 'granted') {
            const perm = await this.requestPermission();
            if (perm !== 'granted') return;
        }

        try {
            const reg = await navigator.serviceWorker.ready;
            const title = '⚽ Peña Maulas (Directo)';
            const options = {
                body: '¡Hola Fernando Lozano! Las notificaciones nativas en tu móvil funcionan correctamente.',
                icon: 'icons/icon-192x192.png',
                badge: 'icons/favicon-32x32.png',
                vibrate: [300, 100, 300, 100, 300],
                tag: 'maulas-direct-' + Date.now(),
                renotify: true,
                requireInteraction: true,
                silent: false,
                actions: [
                    { action: 'open_app', title: '📲 Ver Peña Maulas' }
                ],
                data: {
                    url: './',
                    timestamp: Date.now()
                }
            };

            await reg.showNotification(title, options);
            this.showToast('✅ Notificación enviada a tu barra de avisos');
        } catch (e) {
            console.error('[PushService] Error en notificación inmediata:', e);
            try {
                new Notification('⚽ Peña Maulas (Directo)', {
                    body: '¡Hola Fernando Lozano! Notificación de prueba recibida.',
                    icon: 'icons/icon-192x192.png'
                });
                this.showToast('✅ Notificación enviada (fallback)');
            } catch (err2) {
                alert('No se pudo mostrar la notificación: ' + e.message);
            }
        }
    },

    /**
     * Programa una notificación con retardo (móvil bloqueado o web cerrada)
     */
    async scheduleDelayedTest(seconds = 5) {
        if (!('Notification' in window)) {
            alert('Tu navegador no admite notificaciones.');
            return;
        }

        if (Notification.permission !== 'granted') {
            const perm = await this.requestPermission();
            if (perm !== 'granted') return;
        }

        const countdownElem = document.getElementById('push-countdown-display');
        const triggerBtns = document.querySelectorAll('.push-btn-trigger');
        triggerBtns.forEach(b => b.disabled = true);

        const payload = {
            title: '⚽ Peña Maulas (Móvil Bloqueado)',
            body: '¡Prueba superada, Fernando! Esta notificación ha llegado con tu móvil bloqueado o la web cerrada.',
            icon: 'icons/icon-192x192.png',
            badge: 'icons/favicon-32x32.png',
            tag: 'maulas-scheduled-' + Date.now(),
            requireInteraction: true,
            silent: false,
            actions: [
                { action: 'open_app', title: '📲 Ver Peña Maulas' }
            ],
            url: './'
        };

        try {
            if (navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'SCHEDULE_NOTIFICATION',
                    delay: seconds * 1000,
                    payload: payload
                });
            } else {
                const reg = await navigator.serviceWorker.ready;
                if (reg.active) {
                    reg.active.postMessage({
                        type: 'SCHEDULE_NOTIFICATION',
                        delay: seconds * 1000,
                        payload: payload
                    });
                }
            }
        } catch (e) {
            console.warn('[PushService] Error enviando mensaje a SW:', e);
        }

        let remaining = seconds;
        if (countdownElem) {
            countdownElem.style.display = 'block';
            countdownElem.innerHTML = `
                <div style="font-size:1.1rem; font-weight:bold; color:#ff9100; margin-bottom:6px;">
                    ⏱️ ¡APAGA LA PANTALLA O SAL AL ESCRITORIO YA!
                </div>
                <div style="font-size:2.2rem; font-weight:900; color:#ffd700; margin:8px 0;">
                    ${remaining}s
                </div>
                <div style="font-size:0.85rem; color:#cbd5e1;">
                    El Service Worker mantendrá la cuenta atrás en segundo plano y despertará tu terminal.
                </div>
            `;
        }

        if (this.timerInterval) clearInterval(this.timerInterval);

        this.timerInterval = setInterval(() => {
            remaining--;
            if (remaining > 0) {
                if (countdownElem) {
                    countdownElem.querySelector('div:nth-child(2)').textContent = `${remaining}s`;
                }
            } else {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
                if (countdownElem) {
                    countdownElem.innerHTML = `
                        <div style="color:#4ade80; font-weight:bold; font-size:1.1rem;">
                            🔔 ¡Notificación disparada por el sistema!
                        </div>
                        <div style="font-size:0.85rem; color:#94a3b8; margin-top:4px;">
                            Revisa el panel de notificaciones de tu teléfono.
                        </div>
                    `;
                }
                triggerBtns.forEach(b => b.disabled = false);
            }
        }, 1000);
    },

    /**
     * Cambiar de pestaña en el modal de Fernando
     */
    switchTab(tabId) {
        document.querySelectorAll('.push-tab-content').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.push-tab-btn').forEach(btn => {
            btn.style.borderColor = 'transparent';
            btn.style.color = '#94a3b8';
            btn.style.background = 'rgba(30, 41, 59, 0.4)';
        });

        const targetContent = document.getElementById(`tab-content-${tabId}`);
        const targetBtn = document.getElementById(`tab-btn-${tabId}`);

        if (targetContent) targetContent.style.display = 'flex';
        if (targetBtn) {
            targetBtn.style.borderColor = '#ff9100';
            targetBtn.style.color = '#ffd700';
            targetBtn.style.background = 'rgba(255, 145, 0, 0.15)';
        }

        if (tabId === 'heradio') {
            this.checkHeradioStatus();
        }
    },

    /**
     * Rellenar plantilla en el mensaje a Heradio
     */
    setHeradioTemplate(text) {
        const input = document.getElementById('heradio-push-message');
        if (input) input.value = text;
    },

    /**
     * Actualiza el estado visual del panel modal
     */
    updateUIStatus() {
        const statusBox = document.getElementById('push-permission-status');
        const permBtn = document.getElementById('push-btn-grant-permission');
        const actionArea = document.getElementById('push-action-buttons');

        if (!statusBox) return;

        const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || !!window.navigator.standalone;

        if (perm === 'granted') {
            statusBox.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; color:#4ade80; font-weight:bold;">
                    <span style="font-size:1.3rem;">✅</span>
                    <span>Permisos de notificación concedidos en tu móvil</span>
                </div>
                <div style="font-size:0.8rem; color:#94a3b8; margin-top:4px;">
                    ${isStandalone ? '📱 Modo PWA / App instalada detectado' : '🌐 Ejecutándose en navegador web'}
                </div>
            `;
            if (permBtn) permBtn.style.display = 'none';
            if (actionArea) actionArea.style.display = 'flex';
        } else if (perm === 'denied') {
            statusBox.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; color:#f87171; font-weight:bold;">
                    <span style="font-size:1.3rem;">❌</span>
                    <span>Permiso bloqueado en este dispositivo</span>
                </div>
                <div style="font-size:0.8rem; color:#cbd5e1; margin-top:4px; line-height:1.4;">
                    Para probar, pulsa en el candado 🔒 de la barra del navegador y activa "Notificaciones".
                </div>
            `;
            if (permBtn) permBtn.style.display = 'none';
            if (actionArea) actionArea.style.display = 'none';
        } else {
            statusBox.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; color:#fbbf24; font-weight:bold;">
                    <span style="font-size:1.3rem;">⚠️</span>
                    <span>Permiso pendiente de autorización</span>
                </div>
                <div style="font-size:0.8rem; color:#94a3b8; margin-top:4px;">
                    Debes conceder permiso para que tu propio móvil reciba alertas.
                </div>
            `;
            if (permBtn) permBtn.style.display = 'block';
            if (actionArea) actionArea.style.display = 'none';
        }
    },

    openModal() {
        const modal = document.getElementById('modal-push-lab');
        if (modal) {
            modal.style.display = 'flex';
            this.updateUIStatus();
            this.checkHeradioStatus();
        }
    },

    closeModal() {
        const modal = document.getElementById('modal-push-lab');
        if (modal) {
            modal.style.display = 'none';
        }
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        const countdownElem = document.getElementById('push-countdown-display');
        if (countdownElem) countdownElem.style.display = 'none';
        const triggerBtns = document.querySelectorAll('.push-btn-trigger');
        triggerBtns.forEach(b => b.disabled = false);
    },

    showToast(message) {
        let toast = document.getElementById('push-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'push-toast';
            toast.style.cssText = `
                position: fixed;
                bottom: 80px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(15, 23, 42, 0.95);
                color: #fff;
                padding: 10px 20px;
                border-radius: 30px;
                font-size: 0.9rem;
                font-weight: 600;
                box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                border: 1px solid rgba(255, 145, 0, 0.4);
                z-index: 100000;
                pointer-events: none;
                transition: opacity 0.3s ease;
            `;
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.opacity = '1';
        setTimeout(() => {
            toast.style.opacity = '0';
        }, 3500);
    },

    injectStyles() {
        if (document.getElementById('push-service-styles')) return;

        const style = document.createElement('style');
        style.id = 'push-service-styles';
        style.textContent = `
            .push-float-btn {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 99990;
                background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
                border: 1.5px solid #ff9100;
                color: #ffd700;
                padding: 10px 18px;
                border-radius: 50px;
                display: flex;
                align-items: center;
                gap: 10px;
                font-family: inherit;
                font-size: 0.85rem;
                font-weight: 700;
                cursor: pointer;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), 0 0 12px rgba(255, 145, 0, 0.3);
                transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                user-select: none;
            }
            .push-float-btn:hover {
                transform: translateY(-3px) scale(1.03);
                border-color: #ffd700;
                box-shadow: 0 12px 30px rgba(0, 0, 0, 0.7), 0 0 20px rgba(255, 215, 0, 0.4);
            }
            .push-float-btn .bell-icon {
                font-size: 1.25rem;
                animation: push-bell-ring 3s infinite;
            }
            @keyframes push-bell-ring {
                0%, 80%, 100% { transform: rotate(0); }
                82% { transform: rotate(-15deg); }
                86% { transform: rotate(15deg); }
                90% { transform: rotate(-10deg); }
                94% { transform: rotate(10deg); }
                98% { transform: rotate(0); }
            }

            .push-modal-backdrop {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.85);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: 99995;
                align-items: center;
                justify-content: center;
                padding: 16px;
                box-sizing: border-box;
            }
            .push-modal-card {
                background: #0f172a;
                border: 1px solid rgba(255, 145, 0, 0.35);
                border-radius: 18px;
                width: 100%;
                max-width: 520px;
                box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8), 0 0 35px rgba(255, 145, 0, 0.15);
                color: #f8fafc;
                font-family: inherit;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                animation: push-modal-in 0.25s ease-out;
            }
            @keyframes push-modal-in {
                from { opacity: 0; transform: scale(0.92); }
                to { opacity: 1; transform: scale(1); }
            }
            .push-modal-header {
                padding: 18px 22px;
                background: linear-gradient(90deg, #1e293b, #0f172a);
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .push-modal-body {
                padding: 20px 22px;
                display: flex;
                flex-direction: column;
                gap: 16px;
                max-height: 82vh;
                overflow-y: auto;
            }
            .push-status-card {
                background: rgba(30, 41, 59, 0.6);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 12px;
                padding: 14px 16px;
            }
            .push-btn-primary {
                background: linear-gradient(135deg, #ff9100 0%, #ea580c 100%);
                color: #ffffff;
                border: none;
                border-radius: 10px;
                padding: 12px 18px;
                font-weight: 700;
                font-size: 0.95rem;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                box-shadow: 0 4px 15px rgba(234, 88, 12, 0.35);
                transition: all 0.2s;
            }
            .push-btn-primary:hover:not(:disabled) {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(234, 88, 12, 0.5);
            }
            .push-btn-secondary {
                background: rgba(30, 41, 59, 0.8);
                color: #e2e8f0;
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 10px;
                padding: 12px 18px;
                font-weight: 700;
                font-size: 0.95rem;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                transition: all 0.2s;
            }
            .push-btn-secondary:hover:not(:disabled) {
                background: rgba(51, 65, 85, 0.9);
                border-color: #ff9100;
                color: #ffd700;
            }
            .push-btn-primary:disabled, .push-btn-secondary:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
            }

            @media (max-width: 600px) {
                .push-float-btn span.label {
                    display: none;
                }
                .push-float-btn {
                    padding: 12px;
                    border-radius: 50%;
                    bottom: 18px;
                    right: 18px;
                }
            }
        `;
        document.head.appendChild(style);
    },

    injectUI() {
        if (document.getElementById('modal-push-lab')) return;

        // 1. Botón Flotante para Fernando
        const floatBtn = document.createElement('div');
        floatBtn.className = 'push-float-btn';
        floatBtn.title = 'Laboratorio de Notificaciones Push (Fernando Lozano)';
        floatBtn.onclick = () => this.openModal();
        floatBtn.innerHTML = `
            <span class="bell-icon">🔔</span>
            <span class="label">Probar Push (Lozano)</span>
        `;
        document.body.appendChild(floatBtn);

        // 2. Modal
        const modalBackdrop = document.createElement('div');
        modalBackdrop.id = 'modal-push-lab';
        modalBackdrop.className = 'push-modal-backdrop';
        modalBackdrop.onclick = (e) => {
            if (e.target === modalBackdrop) this.closeModal();
        };

        modalBackdrop.innerHTML = `
            <div class="push-modal-card">
                <div class="push-modal-header">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:1.4rem;">📲</span>
                        <div>
                            <div style="font-weight:800; font-size:1.05rem; color:#ffd700; letter-spacing:0.5px;">
                                NOTIFICACIONES PUSH MÓVIL
                            </div>
                            <div style="font-size:0.75rem; color:#94a3b8;">
                                Administrador de pruebas: Fernando Lozano (ID: 6)
                            </div>
                        </div>
                    </div>
                    <button onclick="PushService.closeModal()" style="background:none; border:none; color:#94a3b8; font-size:1.4rem; cursor:pointer; padding:4px 8px;">✕</button>
                </div>

                <!-- Barra de pestañas -->
                <div style="display:flex; border-bottom:1px solid rgba(255,255,255,0.08); background:rgba(15,23,42,0.8); padding:6px 12px 0 12px; gap:8px;">
                    <button id="tab-btn-heradio" class="push-tab-btn" onclick="PushService.switchTab('heradio')" style="
                        flex:1;
                        padding:10px 8px;
                        background:rgba(255, 145, 0, 0.15);
                        border:none;
                        border-bottom:2px solid #ff9100;
                        color:#ffd700;
                        font-weight:700;
                        font-size:0.85rem;
                        cursor:pointer;
                        border-radius:8px 8px 0 0;
                    ">
                        👤 Enviar a Heradio
                    </button>
                    <button id="tab-btn-self" class="push-tab-btn" onclick="PushService.switchTab('self')" style="
                        flex:1;
                        padding:10px 8px;
                        background:rgba(30, 41, 59, 0.4);
                        border:none;
                        border-bottom:2px solid transparent;
                        color:#94a3b8;
                        font-weight:700;
                        font-size:0.85rem;
                        cursor:pointer;
                        border-radius:8px 8px 0 0;
                    ">
                        📱 Mi Dispositivo
                    </button>
                </div>

                <div class="push-modal-body">
                    <!-- ================= PESTAÑA: ENVIAR A HERADIO ================= -->
                    <div id="tab-content-heradio" class="push-tab-content" style="display:flex; flex-direction:column; gap:14px;">
                        <!-- Estado de Heradio en Firestore -->
                        <div id="heradio-status-info" class="push-status-card">
                            <span style="color:#94a3b8;">Comprobando suscripción de Heradio...</span>
                        </div>

                        <!-- Formulario de Envío -->
                        <div style="display:flex; flex-direction:column; gap:8px;">
                            <label style="font-size:0.85rem; color:#cbd5e1; font-weight:700;">
                                Mensaje a enviar a Heradio:
                            </label>
                            <textarea id="heradio-push-message" rows="3" style="
                                width:100%;
                                background:rgba(30, 41, 59, 0.7);
                                border:1px solid rgba(255, 255, 255, 0.15);
                                border-radius:10px;
                                color:#fff;
                                padding:10px;
                                font-family:inherit;
                                font-size:0.9rem;
                                box-sizing:border-box;
                                resize:none;
                            ">¡Hola Heradio! Esto es una prueba de notificación en tu móvil de la Peña Maulas.</textarea>
                        </div>

                        <!-- Plantillas rápidas -->
                        <div style="display:flex; flex-wrap:wrap; gap:6px;">
                            <button onclick="PushService.setHeradioTemplate('¡Hola Heradio! Prueba de notificación recibida en tu móvil.')" style="
                                background:rgba(51, 65, 85, 0.6);
                                border:1px solid rgba(255,255,255,0.1);
                                border-radius:16px;
                                color:#cbd5e1;
                                font-size:0.75rem;
                                padding:4px 10px;
                                cursor:pointer;
                            ">👋 Saludo de prueba</button>
                            <button onclick="PushService.setHeradioTemplate('¡Heradio! Se ha sellado la quiniela de esta jornada en la peña.')" style="
                                background:rgba(51, 65, 85, 0.6);
                                border:1px solid rgba(255,255,255,0.1);
                                border-radius:16px;
                                color:#cbd5e1;
                                font-size:0.75rem;
                                padding:4px 10px;
                                cursor:pointer;
                            ">⚽ Quiniela sellada</button>
                            <button onclick="PushService.setHeradioTemplate('¡Heradio, hay premio en la jornada! Revisa la clasificación.')" style="
                                background:rgba(51, 65, 85, 0.6);
                                border:1px solid rgba(255,255,255,0.1);
                                border-radius:16px;
                                color:#cbd5e1;
                                font-size:0.75rem;
                                padding:4px 10px;
                                cursor:pointer;
                            ">💰 ¡Hay premio!</button>
                        </div>

                        <!-- Botón de Envío -->
                        <button id="heradio-btn-send" class="push-btn-primary" onclick="PushService.sendNotificationToHeradio()">
                            🚀 Enviar Notificación a Heradio Ahora
                        </button>

                        <div id="heradio-send-feedback" style="display:none; padding:12px; background:rgba(34, 197, 94, 0.15); border:1px solid #22c55e; border-radius:10px;">
                        </div>

                        <div style="background:rgba(15, 23, 42, 0.5); border-left:3px solid #ff9100; padding:10px 14px; border-radius:0 8px 8px 0; font-size:0.78rem; color:#cbd5e1; line-height:1.45;">
                            <strong style="color:#ffd700;">💡 Pauta para la prueba con Heradio:</strong><br>
                            Pídele a Heradio que <strong>tenga la web de la peña abierta</strong> en la pantalla de su móvil (o en segundo plano en Chrome). En cuanto pulses "Enviar", su móvil vibrará y le saldrá el aviso en pantalla y en su barra de notificaciones.<br>
                            <span style="color:#94a3b8; font-size:0.75rem;">(Si Heradio cierra por completo el navegador o apaga la pantalla, la notificación le saltará en cuanto vuelva a abrir la web).</span>
                        </div>
                    </div>

                    <!-- ================= PESTAÑA: MI DISPOSITIVO (FERNANDO) ================= -->
                    <div id="tab-content-self" class="push-tab-content" style="display:none; flex-direction:column; gap:14px;">
                        <!-- Estado de Permisos -->
                        <div id="push-permission-status" class="push-status-card">
                            <!-- Populated by JS -->
                        </div>

                        <!-- Botón Solicitar Permiso (si está en 'default') -->
                        <button id="push-btn-grant-permission" class="push-btn-primary" onclick="PushService.requestPermission()" style="display:none;">
                            🔔 Activar Permiso de Notificaciones en este dispositivo
                        </button>

                        <!-- Zona de Pruebas Propias -->
                        <div id="push-action-buttons" style="display:none; flex-direction:column; gap:10px;">
                            <button class="push-btn-secondary push-btn-trigger" onclick="PushService.sendImmediateTest()">
                                <span style="font-size:1.2rem;">⚡</span>
                                <div style="text-align:left;">
                                    <div style="font-size:0.92rem; font-weight:bold;">1. Notificación Inmediata</div>
                                    <div style="font-size:0.75rem; color:#94a3b8; font-weight:normal;">Suena y vibra ahora mismo en tu teléfono</div>
                                </div>
                            </button>

                            <button class="push-btn-primary push-btn-trigger" onclick="PushService.scheduleDelayedTest(5)">
                                <span style="font-size:1.2rem;">⏱️</span>
                                <div style="text-align:left;">
                                    <div style="font-size:0.92rem; font-weight:bold;">2. Probar en 5 segundos (Móvil Bloqueado)</div>
                                    <div style="font-size:0.75rem; color:#ffedd5; font-weight:normal;">Pulsa y apaga la pantalla o sal al escritorio</div>
                                </div>
                            </button>

                            <button class="push-btn-secondary push-btn-trigger" onclick="PushService.scheduleDelayedTest(10)" style="opacity:0.9;">
                                <span style="font-size:1.2rem;">⏳</span>
                                <div style="text-align:left;">
                                    <div style="font-size:0.92rem; font-weight:bold;">3. Probar en 10 segundos</div>
                                    <div style="font-size:0.75rem; color:#94a3b8; font-weight:normal;">Para bloquear el móvil con más calma</div>
                                </div>
                            </button>
                        </div>

                        <!-- Cuenta atrás interactiva -->
                        <div id="push-countdown-display" style="display:none; text-align:center; padding:16px; background:rgba(255, 145, 0, 0.08); border:1px dashed #ff9100; border-radius:12px;">
                        </div>

                        <!-- Ayuda despertar pantalla -->
                        <div style="background:rgba(30, 41, 59, 0.4); border:1px solid rgba(255, 255, 255, 0.08); padding:12px; border-radius:10px; font-size:0.78rem; color:#cbd5e1; line-height:1.45;">
                            <div style="font-weight:700; color:#ffd700; margin-bottom:4px;">
                                💡 Para que tu pantalla se encienda sola al llegar:
                            </div>
                            En <em>Ajustes del móvil &gt; Pantalla de bloqueo</em>, activa <strong>"Despertar pantalla al recibir notificaciones"</strong>. Y en la notificación, cámbiala a modo <strong>"Prioridad / Ventana emergente"</strong>.
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalBackdrop);
    }
};

// Exponer en window para acceso global
window.PushService = PushService;

// Auto-inicialización cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PushService.init());
} else {
    PushService.init();
}
