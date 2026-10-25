/**
 * PEÑA MAULAS - IN-APP ALERTS SERVICE (v1.0)
 * =========================================================================
 * Sistema oficial de avisos programados y alertas emergentes (Modal Popup).
 * Notifica a los socios al entrar a la web según reglas de negocio:
 * 1. Alerta de Saldo Deudor en el Bote.
 * 2. Alerta de Pronóstico Pendiente antes del cierre.
 * 3. Alerta de Responsabilidad Semanal (Sellador / Dobles).
 *
 * Configurable desde el panel de administración (admin_2.html):
 * - Activación individual de cada aviso.
 * - Textos personalizables con variables: {nombre}, {saldo}, {jornada}, {responsabilidad}.
 * - Control de frecuencia:
 *   * 'always': Cada vez que entra a la web.
 *   * 'once_per_session': Una vez por sesión.
 *   * 'once_per_day': Una vez cada 24 horas.
 *   * 'once_per_week': Una vez cada 7 días.
 *   * 'once_ever': Una sola vez en total.
 * =========================================================================
 */
(function() {
    'use strict';

    const STORAGE_KEY = 'maulas_in_app_alerts_config';

    const DEFAULT_CONFIG = {
        deuda: {
            id: 'deuda',
            enabled: true,
            frequency: 'always',
            threshold: 0.00,
            icon: '⚠️',
            badge: 'AVISO FINANCIERO',
            badgeColor: 'rose',
            title: '⚠️ Saldo Deudor en el Bote',
            message: 'Hola {nombre}, tienes un saldo deudor de {saldo} en tu hucha de la peña. Recuerda hacer una transferencia o Bizum a Marcelo para regularizar tu cuenta y tener derecho al reparto de premios.',
            btnText: 'Ver mi Bote',
            btnUrl: 'bote_2.html',
            btnCancelText: 'Entendido'
        },
        pronostico: {
            id: 'pronostico',
            enabled: true,
            frequency: 'once_per_day',
            icon: '⚽',
            badge: 'RECORDATORIO QUINIELA',
            badgeColor: 'amber',
            title: '⚽ ¡Tienes tu Quiniela Pendiente!',
            message: 'Hola {nombre}, aún no has enviado tu pronóstico para la Jornada {jornada}. ¡No te quedes sin jugar tu quiniela semanal antes del cierre!',
            btnText: 'Rellenar Pronóstico',
            btnUrl: 'pronosticos_2.html?openEditor=true',
            btnCancelText: 'Más tarde'
        },
        responsabilidad: {
            id: 'responsabilidad',
            enabled: true,
            frequency: 'once_per_session',
            icon: '👑',
            badge: 'RESPONSABILIDAD OFICIAL',
            badgeColor: 'purple',
            title: '👑 Tarea Oficial de la Semana',
            message: '¡Atención {nombre}! Esta semana eres el responsable oficial de {responsabilidad} en la Jornada {jornada}. Recuerda validar y sellar el boleto a tiempo.',
            btnText: 'Ver Detalles',
            btnUrl: 'pronosticos_2.html',
            btnCancelText: 'Entendido'
        }
    };

    class InAppAlertsService {
        constructor() {
            this.config = this.loadCachedConfig();
            this.activeModal = null;
            this.initRemoteConfig();
        }

        loadCachedConfig() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    return {
                        deuda: { ...DEFAULT_CONFIG.deuda, ...(parsed.deuda || {}) },
                        pronostico: { ...DEFAULT_CONFIG.pronostico, ...(parsed.pronostico || {}) },
                        responsabilidad: { ...DEFAULT_CONFIG.responsabilidad, ...(parsed.responsabilidad || {}) }
                    };
                }
            } catch (e) {
                console.warn('[InAppAlerts] Error cargando caché de configuración:', e);
            }
            return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        }

        async initRemoteConfig() {
            try {
                if (window.DataService && typeof window.DataService.getDoc === 'function') {
                    const remote = await window.DataService.getDoc('config', 'in_app_alerts');
                    if (remote) {
                        this.config = {
                            deuda: { ...DEFAULT_CONFIG.deuda, ...(remote.deuda || {}) },
                            pronostico: { ...DEFAULT_CONFIG.pronostico, ...(remote.pronostico || {}) },
                            responsabilidad: { ...DEFAULT_CONFIG.responsabilidad, ...(remote.responsabilidad || {}) }
                        };
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
                    }
                }
            } catch (e) {
                // Silencioso en offline
            }
        }

        getConfig() {
            return this.config;
        }

        async saveConfig(newConfig) {
            this.config = {
                deuda: { ...DEFAULT_CONFIG.deuda, ...(newConfig.deuda || {}) },
                pronostico: { ...DEFAULT_CONFIG.pronostico, ...(newConfig.pronostico || {}) },
                responsabilidad: { ...DEFAULT_CONFIG.responsabilidad, ...(newConfig.responsabilidad || {}) }
            };
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
                if (window.DataService && typeof window.DataService.save === 'function') {
                    await window.DataService.save('config', {
                        id: 'in_app_alerts',
                        ...this.config,
                        updatedAt: new Date().toISOString()
                    });
                }
                return true;
            } catch (e) {
                console.error('[InAppAlerts] Error guardando configuración:', e);
                return false;
            }
        }

        canShowAlert(key, frequency, userId) {
            if (!userId) return false;
            const uid = String(userId);

            if (frequency === 'always') {
                return true;
            }

            if (frequency === 'once_per_session') {
                const sKey = `maulas_alert_${key}_session_${uid}`;
                return !sessionStorage.getItem(sKey);
            }

            if (frequency === 'once_per_day') {
                const dKey = `maulas_alert_${key}_last_${uid}`;
                const last = parseInt(localStorage.getItem(dKey) || '0', 10);
                return (Date.now() - last) >= (24 * 60 * 60 * 1000);
            }

            if (frequency === 'once_per_week') {
                const wKey = `maulas_alert_${key}_last_${uid}`;
                const last = parseInt(localStorage.getItem(wKey) || '0', 10);
                return (Date.now() - last) >= (7 * 24 * 60 * 60 * 1000);
            }

            if (frequency === 'once_ever') {
                const eKey = `maulas_alert_${key}_ever_${uid}`;
                return !localStorage.getItem(eKey);
            }

            return true;
        }

        markAlertShown(key, frequency, userId) {
            if (!userId) return;
            const uid = String(userId);
            const now = Date.now().toString();

            if (frequency === 'once_per_session') {
                sessionStorage.setItem(`maulas_alert_${key}_session_${uid}`, now);
            } else if (frequency === 'once_per_day' || frequency === 'once_per_week') {
                localStorage.setItem(`maulas_alert_${key}_last_${uid}`, now);
            } else if (frequency === 'once_ever') {
                localStorage.setItem(`maulas_alert_${key}_ever_${uid}`, now);
            }
        }

        interpolate(template, variables = {}) {
            let res = String(template || '');
            Object.keys(variables).forEach(k => {
                const regex = new RegExp(`\\{${k}\\}`, 'g');
                res = res.replace(regex, variables[k]);
            });
            return res;
        }

        /**
         * Renderiza e inyecta el modal emergente en el DOM
         */
        showModal(options) {
            let modal = document.getElementById('in-app-alert-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'in-app-alert-modal';
                modal.className = 'fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md transition-opacity duration-200 select-none';
                document.body.appendChild(modal);
            }

            const icon = options.icon || '💬';
            const badge = options.badge || 'AVISO';
            const title = options.title || 'Aviso de la Peña';
            const message = options.message || '';
            const btnText = options.btnText || 'Ver Detalles';
            const btnUrl = options.btnUrl || '#';
            const btnCancelText = options.btnCancelText || 'Entendido';
            const badgeColor = options.badgeColor || 'amber';

            let badgeClasses = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
            let iconBgClasses = 'from-amber-400 to-amber-600 shadow-amber-500/25 border-amber-300/40';
            let btnMainClasses = 'from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 shadow-amber-500/25';

            if (badgeColor === 'rose') {
                badgeClasses = 'bg-rose-500/20 text-rose-400 border-rose-500/30';
                iconBgClasses = 'from-rose-500 to-rose-700 shadow-rose-500/30 border-rose-400/40';
                btnMainClasses = 'from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 shadow-rose-500/25';
            } else if (badgeColor === 'purple') {
                badgeClasses = 'bg-purple-500/20 text-purple-400 border-purple-500/30';
                iconBgClasses = 'from-purple-500 to-purple-700 shadow-purple-500/30 border-purple-400/40';
                btnMainClasses = 'from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 shadow-purple-500/25';
            } else if (badgeColor === 'emerald') {
                badgeClasses = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
                iconBgClasses = 'from-emerald-400 to-emerald-600 shadow-emerald-500/25 border-emerald-300/40';
                btnMainClasses = 'from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 shadow-emerald-500/25';
            }

            modal.innerHTML = `
                <div class="glass-panel w-full max-w-md p-6 sm:p-7 border border-slate-700/80 rounded-3xl bg-slate-900/95 shadow-2xl relative text-center space-y-4 animate-scale-up" onclick="event.stopPropagation()">
                    
                    <!-- Botón de Cerrar Superior Derecho -->
                    <button type="button" onclick="window.InAppAlerts.closeModal()" class="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center absolute top-4 right-4 text-xs font-bold transition-all" title="Cerrar aviso">
                        ✕
                    </button>

                    <!-- Icono Principal con Glow -->
                    <div class="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br ${iconBgClasses} border flex items-center justify-center text-3xl shadow-xl transform -translate-y-2">
                        ${icon}
                    </div>

                    <!-- Insignia de Categoría -->
                    <div>
                        <span class="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${badgeClasses}">
                            ${badge}
                        </span>
                    </div>

                    <!-- Título -->
                    <h3 class="text-lg sm:text-xl font-extrabold text-white tracking-tight leading-snug">
                        ${title}
                    </h3>

                    <!-- Mensaje -->
                    <div class="text-xs sm:text-sm text-slate-300 leading-relaxed font-normal px-2">
                        ${message}
                    </div>

                    <!-- Botones de Acción -->
                    <div class="space-y-2 pt-2">
                        <a href="${btnUrl}" onclick="window.InAppAlerts.closeModal()" class="w-full py-3 rounded-xl bg-gradient-to-r ${btnMainClasses} text-slate-950 font-black text-xs sm:text-sm shadow-lg flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer">
                            <span>🚀</span> ${btnText}
                        </a>
                        <button type="button" onclick="window.InAppAlerts.closeModal()" class="w-full py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs transition active:scale-95 border border-slate-700/80 cursor-pointer">
                            ${btnCancelText}
                        </button>
                    </div>

                </div>
            `;

            modal.style.display = 'flex';
            this.activeModal = modal;

            // Cerrar con Escape
            const onKeyDown = (e) => {
                if (e.key === 'Escape') {
                    this.closeModal();
                    document.removeEventListener('keydown', onKeyDown);
                }
            };
            document.addEventListener('keydown', onKeyDown);

            // Cerrar al hacer clic en el backdrop
            modal.onclick = () => this.closeModal();
        }

        closeModal() {
            const modal = document.getElementById('in-app-alert-modal');
            if (modal) {
                modal.style.display = 'none';
                modal.innerHTML = '';
            }
            this.activeModal = null;
        }

        /**
         * Previsualización para el panel de administración
         */
        previewAlert(key) {
            const cfg = this.config[key] || DEFAULT_CONFIG[key];
            if (!cfg) return;

            const sampleVars = {
                nombre: 'Fernando',
                saldo: '-15,90 €',
                jornada: '17',
                responsabilidad: key === 'responsabilidad' ? 'Sellar la Quiniela en la Administración' : 'Hacer los Dobles'
            };

            const interpolatedMsg = this.interpolate(cfg.message, sampleVars);
            const interpolatedTitle = this.interpolate(cfg.title, sampleVars);

            this.showModal({
                icon: cfg.icon,
                badge: cfg.badge,
                badgeColor: cfg.badgeColor,
                title: interpolatedTitle,
                message: interpolatedMsg,
                btnText: cfg.btnText,
                btnUrl: '#',
                btnCancelText: cfg.btnCancelText
            });
        }

        /**
         * Evaluación y activación de alertas para el socio conectado
         */
        evaluateAndShow(context = {}) {
            const userMember = context.userMember;
            if (!userMember || !userMember.id) return;

            const uid = String(userMember.id);
            const name = userMember.name || 'Socio';
            const userSaldo = typeof context.userSaldo === 'number' ? context.userSaldo : 0;
            const nextJ = context.nextJornada;
            const jNum = nextJ && nextJ.number ? String(nextJ.number) : 'en juego';
            const hasSubmitted = !!context.hasSubmittedPrediction;
            const isSealer = !!context.isSealer;
            const isDobles = !!context.isDoblesResponsable;

            // Formato de saldo con coma decimal
            const formattedSaldo = (window.AppUtils && window.AppUtils.formatEuro)
                ? window.AppUtils.formatEuro(userSaldo)
                : `${userSaldo.toFixed(2).replace('.', ',')} €`;

            // Detectar si el socio es el Tesorero (Marcelo regulariza en repartos, no le salta alerta de deuda)
            const isTesorero = uid === '14' || (name.toLowerCase().includes('marcelo') && !name.toLowerCase().includes('mor'));

            // 1. PRIORIDAD 1: ALERTA DE SALDO DEUDOR
            const cfgDeuda = this.config.deuda;
            if (cfgDeuda && cfgDeuda.enabled && !isTesorero) {
                const threshold = typeof cfgDeuda.threshold === 'number' ? cfgDeuda.threshold : 0.00;
                if (userSaldo < (threshold - 0.009)) {
                    if (this.canShowAlert('deuda', cfgDeuda.frequency, uid)) {
                        this.markAlertShown('deuda', cfgDeuda.frequency, uid);
                        const msg = this.interpolate(cfgDeuda.message, { nombre: name, saldo: formattedSaldo });
                        const title = this.interpolate(cfgDeuda.title, { nombre: name, saldo: formattedSaldo });
                        setTimeout(() => {
                            this.showModal({
                                icon: cfgDeuda.icon,
                                badge: cfgDeuda.badge,
                                badgeColor: cfgDeuda.badgeColor,
                                title: title,
                                message: msg,
                                btnText: cfgDeuda.btnText,
                                btnUrl: cfgDeuda.btnUrl,
                                btnCancelText: cfgDeuda.btnCancelText
                            });
                        }, 600);
                        return; // Solo una alerta por conexión
                    }
                }
            }

            // 2. PRIORIDAD 2: ALERTA DE RESPONSABILIDAD SEMANAL (Sellador / Dobles)
            const cfgResp = this.config.responsabilidad;
            if (cfgResp && cfgResp.enabled && (isSealer || isDobles)) {
                if (this.canShowAlert('responsabilidad', cfgResp.frequency, uid)) {
                    this.markAlertShown('responsabilidad', cfgResp.frequency, uid);
                    let respText = 'Sellar la Quiniela Oficial en la Administración';
                    if (isSealer && isDobles) respText = 'Sellar la Quiniela y confeccionar los Dobles';
                    else if (isDobles) respText = 'Confeccionar la Quiniela de Dobles de la Peña';

                    const msg = this.interpolate(cfgResp.message, {
                        nombre: name,
                        responsabilidad: respText,
                        jornada: jNum
                    });
                    const title = this.interpolate(cfgResp.title, {
                        nombre: name,
                        responsabilidad: respText,
                        jornada: jNum
                    });

                    setTimeout(() => {
                        this.showModal({
                            icon: cfgResp.icon,
                            badge: cfgResp.badge,
                            badgeColor: cfgResp.badgeColor,
                            title: title,
                            message: msg,
                            btnText: cfgResp.btnText,
                            btnUrl: cfgResp.btnUrl,
                            btnCancelText: cfgResp.btnCancelText
                        });
                    }, 600);
                    return;
                }
            }

            // 3. PRIORIDAD 3: ALERTA DE PRONÓSTICO PENDIENTE
            const cfgPron = this.config.pronostico;
            if (cfgPron && cfgPron.enabled && !hasSubmitted && nextJ) {
                // Solo alertar si la jornada aún no ha comenzado o se puede pronosticar
                if (this.canShowAlert('pronostico', cfgPron.frequency, uid)) {
                    this.markAlertShown('pronostico', cfgPron.frequency, uid);
                    const msg = this.interpolate(cfgPron.message, { nombre: name, jornada: jNum });
                    const title = this.interpolate(cfgPron.title, { nombre: name, jornada: jNum });

                    setTimeout(() => {
                        this.showModal({
                            icon: cfgPron.icon,
                            badge: cfgPron.badge,
                            badgeColor: cfgPron.badgeColor,
                            title: title,
                            message: msg,
                            btnText: cfgPron.btnText,
                            btnUrl: cfgPron.btnUrl,
                            btnCancelText: cfgPron.btnCancelText
                        });
                    }, 600);
                    return;
                }
            }
        }
    }

    window.InAppAlerts = new InAppAlertsService();

})();
