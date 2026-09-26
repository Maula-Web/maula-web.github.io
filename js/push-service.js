/**
 * Push Notification Service - Peña Maulas PWA
 * =========================================================================
 * Módulo exclusivo de pruebas de notificaciones Push para Fernando Lozano (ID: 6)
 * Permite validar notificaciones nativas en directo y con pantalla bloqueada / web cerrada.
 * =========================================================================
 */

const PushService = {
    initialized: false,
    timerInterval: null,

    /**
     * Comprueba si el usuario autenticado es Fernando Lozano
     */
    isTargetUser() {
        try {
            const userStr = sessionStorage.getItem('maulas_user');
            if (!userStr) return false;
            const user = JSON.parse(userStr);
            const uid = String(user.id || '');
            const email = (user.email || '').toLowerCase().trim();
            const name = (user.name || '').toLowerCase().trim();
            const phone = (user.phone || '').toLowerCase().trim();

            return (
                uid === '6' ||
                email === 'lozano@maulas.com' ||
                name.includes('fernando lozano') ||
                (name.includes('lozano') && !name.includes('ram')) ||
                phone.includes('lozano')
            );
        } catch (e) {
            return false;
        }
    },

    /**
     * Inicialización del servicio
     */
    async init() {
        if (!this.isTargetUser()) {
            return;
        }

        if (this.initialized) return;
        this.initialized = true;

        console.log('[PushService] Inicializando laboratorio de notificaciones para Fernando Lozano (ID 6)...');

        // Inyectar estilos específicos
        this.injectStyles();

        // Inyectar botón flotante y modal en el DOM
        this.injectUI();

        // Registrar o verificar Service Worker
        await this.ensureServiceWorker();
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
            console.log('[PushService] Service Worker activo y listo:', reg.scope);
            return reg;
        } catch (e) {
            console.warn('[PushService] Error esperando Service Worker ready:', e);
            return null;
        }
    },

    /**
     * Solicita permisos de notificación al sistema operativo / navegador
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
                // Registrar suscripción en Firestore si es posible
                this.registerSubscriptionInFirestore();
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
     * Lanza una notificación inmediata en directo
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
            // Fallback a constructor Notification si Service Worker falla
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
     * Programa una notificación con retardo (para probar con móvil bloqueado o web cerrada)
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

        // 1. Enviar orden al Service Worker para que despierte el móvil
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

        // 2. Feedback visual interactivo para que Fernando bloquee el móvil
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
     * Guarda la suscripción Web Push en Firestore (para envíos remotos futuros)
     */
    async registerSubscriptionInFirestore() {
        try {
            if (!('serviceWorker' in navigator)) return;
            const reg = await navigator.serviceWorker.ready;
            if (!reg.pushManager) return;

            let sub = await reg.pushManager.getSubscription();
            
            // Si Firestore está disponible
            const db = window.db || (window.DataService && window.DataService.db);
            if (db) {
                const subData = {
                    memberId: 6,
                    memberName: 'Fernando Lozano',
                    updatedAt: new Date().toISOString(),
                    userAgent: navigator.userAgent,
                    isStandalone: window.matchMedia('(display-mode: standalone)').matches || !!window.navigator.standalone,
                    subscription: sub ? JSON.parse(JSON.stringify(sub)) : null
                };
                await db.collection('push_subscriptions').doc('member_6').set(subData, { merge: true });
                console.log('[PushService] Suscripción registrada en Firestore con éxito.');
            }
        } catch (err) {
            console.warn('[PushService] Aviso guardando suscripción:', err);
        }
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
                    <span>Permisos de notificación concedidos</span>
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
                    Para probar, pulsa en el candado 🔒 de la barra de navegación del móvil y activa "Notificaciones".
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
                    Debes conceder permiso para que tu móvil reciba alertas.
                </div>
            `;
            if (permBtn) permBtn.style.display = 'block';
            if (actionArea) actionArea.style.display = 'none';
        }
    },

    /**
     * Muestra el modal de pruebas
     */
    openModal() {
        const modal = document.getElementById('modal-push-lab');
        if (modal) {
            modal.style.display = 'flex';
            this.updateUIStatus();
        }
    },

    /**
     * Cierra el modal de pruebas
     */
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

    /**
     * Mensaje flotante tipo Toast
     */
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

    /**
     * Inyecta estilos CSS aislados
     */
    injectStyles() {
        if (document.getElementById('push-service-styles')) return;

        const style = document.createElement('style');
        style.id = 'push-service-styles';
        style.textContent = `
            /* Botón Flotante Push (Fernando Lozano) */
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

            /* Modal Push Lab */
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
                max-width: 480px;
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
                padding: 22px;
                display: flex;
                flex-direction: column;
                gap: 16px;
                max-height: 80vh;
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

    /**
     * Inyecta la UI en el DOM
     */
    injectUI() {
        if (document.getElementById('modal-push-lab')) return;

        // 1. Botón Flotante
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
                                Socio: Fernando Lozano (ID: 6) &bull; Peña Maulas
                            </div>
                        </div>
                    </div>
                    <button onclick="PushService.closeModal()" style="background:none; border:none; color:#94a3b8; font-size:1.4rem; cursor:pointer; padding:4px 8px;">✕</button>
                </div>

                <div class="push-modal-body">
                    <!-- Estado de Permisos -->
                    <div id="push-permission-status" class="push-status-card">
                        <!-- Populated by JS -->
                    </div>

                    <!-- Botón Solicitar Permiso (si está en 'default') -->
                    <button id="push-btn-grant-permission" class="push-btn-primary" onclick="PushService.requestPermission()" style="display:none;">
                        🔔 Activar Permiso de Notificaciones
                    </button>

                    <!-- Zona de Pruebas -->
                    <div id="push-action-buttons" style="display:none; flex-direction:column; gap:12px;">
                        <div style="font-size:0.85rem; color:#cbd5e1; font-weight:600; margin-bottom:-4px;">
                            Selecciona una prueba:
                        </div>

                        <!-- Prueba 1: Inmediata -->
                        <button class="push-btn-secondary push-btn-trigger" onclick="PushService.sendImmediateTest()">
                            <span style="font-size:1.2rem;">⚡</span>
                            <div style="text-align:left;">
                                <div style="font-size:0.92rem; font-weight:bold;">1. Probar Notificación Inmediata</div>
                                <div style="font-size:0.75rem; color:#94a3b8; font-weight:normal;">Suena y vibra ahora mismo en tu teléfono</div>
                            </div>
                        </button>

                        <!-- Prueba 2: Retardo 5 segundos (Móvil bloqueado / app cerrada) -->
                        <button class="push-btn-primary push-btn-trigger" onclick="PushService.scheduleDelayedTest(5)">
                            <span style="font-size:1.2rem;">⏱️</span>
                            <div style="text-align:left;">
                                <div style="font-size:0.92rem; font-weight:bold;">2. Probar en 5 segundos (Móvil Bloqueado)</div>
                                <div style="font-size:0.75rem; color:#ffedd5; font-weight:normal;">Pulsa y bloquea la pantalla o sal al escritorio</div>
                            </div>
                        </button>

                        <!-- Prueba 3: Retardo 10 segundos -->
                        <button class="push-btn-secondary push-btn-trigger" onclick="PushService.scheduleDelayedTest(10)" style="opacity:0.9;">
                            <span style="font-size:1.2rem;">⏳</span>
                            <div style="text-align:left;">
                                <div style="font-size:0.92rem; font-weight:bold;">3. Probar en 10 segundos (Con más tiempo)</div>
                                <div style="font-size:0.75rem; color:#94a3b8; font-weight:normal;">Para bloquear el móvil con total calma</div>
                            </div>
                        </button>
                    </div>

                    <!-- Caja de cuenta atrás interactiva -->
                    <div id="push-countdown-display" style="display:none; text-align:center; padding:16px; background:rgba(255, 145, 0, 0.08); border:1px dashed #ff9100; border-radius:12px;">
                        <!-- Dinámico -->
                    </div>

                    <!-- Instrucciones breves -->
                    <div style="background:rgba(15, 23, 42, 0.5); border-left:3px solid #ff9100; padding:10px 14px; border-radius:0 8px 8px 0; font-size:0.78rem; color:#94a3b8; line-height:1.45;">
                        <strong style="color:#f8fafc;">💡 ¿Cómo probar con la web cerrada?</strong><br>
                        Pulsa el botón de <strong>5 o 10 segundos</strong>, apaga la pantalla de tu teléfono inmediatamente con el botón lateral o sal al inicio. Tu móvil vibrará y te mostrará la notificación en la pantalla de bloqueo.
                    </div>

                    <!-- Ayuda: Despertar pantalla en móvil -->
                    <div style="background:rgba(30, 41, 59, 0.4); border:1px solid rgba(255, 255, 255, 0.08); padding:12px; border-radius:10px; font-size:0.78rem; color:#cbd5e1; line-height:1.45;">
                        <div style="font-weight:700; color:#ffd700; display:flex; align-items:center; gap:6px; margin-bottom:6px;">
                            <span>💡</span> ¿Por qué no se enciende la pantalla sola al llegar?
                        </div>
                        Tu móvil <strong>sí recibe la notificación</strong> y la coloca en la bandeja de notificaciones. Que la pantalla física se encienda ("despierte") depende del ajuste de privacidad de tu sistema operativo:
                        <ul style="margin:6px 0 0 16px; padding:0; color:#94a3b8;">
                            <li><strong>Ajuste Pantalla de Bloqueo:</strong> En <em>Ajustes &gt; Pantalla de bloqueo</em>, activa <strong>"Despertar pantalla al recibir notificaciones"</strong> o "Pantalla ambiente".</li>
                            <li><strong>Prioridad de Notificación:</strong> Mantén pulsada la notificación de Peña Maulas cuando llegue &gt; pulsa el icono de engranaje ⚙️ &gt; cámbiala de "Silencioso" a <strong>"Prioridad / Sonido y emergente en pantalla"</strong>.</li>
                            <li><strong>Instalar PWA:</strong> Si añades la web a la pantalla de inicio ("Instalar app"), el sistema la dota de un canal de notificaciones propio independiente del navegador.</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalBackdrop);
    }
};

// Exponer en window para acceso global
window.PushService = PushService;

// Auto-inicialización cuando el DOM esté listo si es Fernando Lozano
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PushService.init());
} else {
    PushService.init();
}
