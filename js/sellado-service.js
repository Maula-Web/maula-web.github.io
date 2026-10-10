/**
 * SELLADO SERVICE - PEÑA LOS MAULAS
 * Gestión centralizada de ensamblado de apuestas, envío automático y registro de historial.
 * Restringido de momento exclusivamente a Fernando Lozano (id === '6' o email/nombre Fernando Lozano).
 */

(function () {
    'use strict';

    const SelladoService = {
        _isSending: false,

        /**
         * Comprueba si el usuario autenticado es Fernando Lozano
         */
        isFernando() {
            try {
                const raw = sessionStorage.getItem('maulas_user') || localStorage.getItem('maulas_user');
                if (!raw) return false;
                const user = JSON.parse(raw);
                const uid = String(user.id || '');
                const umail = (user.email || '').toLowerCase().trim();
                const uname = (user.name || '').toLowerCase().trim();
                return uid === '6' ||
                    umail === 'lozano@maulas.com' ||
                    umail.includes('fernandolozano') ||
                    umail.includes('fernando') ||
                    uname.includes('fernando lozano') ||
                    (uname.includes('lozano') && !uname.includes('ram'));
            } catch (e) {
                return false;
            }
        },

        /**
         * Obtiene la configuración de sellado (Webhook y destino) con fallback a localStorage
         */
        async getConfig() {
            let webhookUrl = '';
            let destinoEmail = '';

            try {
                if (window.DataService && window.DataService.getDoc) {
                    const cfg = await window.DataService.getDoc('config', 'sellado').catch(() => null);
                    if (cfg) {
                        webhookUrl = cfg.webhookUrl || '';
                        destinoEmail = cfg.destinoEmail || '';
                    }
                }
            } catch (e) {}

            if (!webhookUrl) {
                webhookUrl = localStorage.getItem('maulas_gas_webhook') || '';
            }
            if (!destinoEmail) {
                destinoEmail = localStorage.getItem('maulas_destino_email') || '';
            }

            return { webhookUrl, destinoEmail };
        },

        /**
         * Guarda la configuración de sellado en Firestore (y sincroniza en localStorage)
         */
        async saveConfig(webhookUrl, destinoEmail) {
            const cleanWebhook = (webhookUrl || '').trim();
            const cleanDestino = (destinoEmail || '').trim();

            localStorage.setItem('maulas_gas_webhook', cleanWebhook);
            localStorage.setItem('maulas_destino_email', cleanDestino);

            if (window.DataService && window.DataService.save) {
                try {
                    await window.DataService.save('config', {
                        id: 'sellado',
                        webhookUrl: cleanWebhook,
                        destinoEmail: cleanDestino,
                        updatedAt: new Date().toISOString()
                    });
                } catch (e) {
                    console.warn('[SelladoService] Error guardando config en Firestore:', e);
                }
            }
        },

        /**
         * Genera el identificador canónico: MAULAS-[TEMPORADA]-[YYYYMMDD_HHMM]-J[XX]
         */
        generarTicketId(jornadaNum, seasonStr = '2026-2027', date = new Date()) {
            const digits = (seasonStr || '2026-2027').replace(/\D/g, '');
            let seasonCode = '2627';
            if (digits.length === 8) {
                seasonCode = digits.slice(2, 4) + digits.slice(6, 8);
            } else if (digits.length === 4) {
                seasonCode = digits;
            }

            const jPad = String(jornadaNum).padStart(2, '0');
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            const hh = String(date.getHours()).padStart(2, '0');
            const min = String(date.getMinutes()).padStart(2, '0');
            const timestamp = `${yyyy}${mm}${dd}_${hh}${min}`;

            return `MAULAS-${seasonCode}-${timestamp}-J${jPad}`;
        },

        /**
         * Normaliza el Pleno al 15 a 2 caracteres
         */
        formatP15(val) {
            if (!val) return '10';
            const str = String(val).trim().toUpperCase();
            if (str.includes('-')) {
                const parts = str.split('-');
                return (parts[0] || '1') + (parts[1] || '0');
            }
            if (str.length >= 2) return str.slice(0, 2);
            return (str + '0').slice(0, 2);
        },

        /**
         * Desarrolla las 16 apuestas de la quiniela de dobles
         */
        desarrollarDobles(selection, isReduced = false, p15 = '10') {
            const multiIndices = [];
            selection.slice(0, 14).forEach((sel, idx) => {
                if (sel && String(sel).trim().length > 1) multiIndices.push(idx);
            });

            // Reducida Oficial 2 (7 dobles = 16 apuestas)
            if (multiIndices.length === 7 && isReduced && window.ScoringSystem && window.ScoringSystem.reducciones && window.ScoringSystem.reducciones['R2']) {
                const matrix = window.ScoringSystem.reducciones['R2'];
                return matrix.map((betRow, bIdx) => {
                    const betSigns = selection.slice(0, 14).map((sel, idx) => {
                        const mPos = multiIndices.indexOf(idx);
                        if (mPos !== -1) {
                            const mSign = betRow[mPos];
                            return (mSign === '1') ? sel[0] : (sel[1] || sel[0]);
                        }
                        return String(sel || '1')[0];
                    });
                    return betSigns.join('') + p15;
                });
            }

            // Directo
            const opciones = selection.slice(0, 14).map(s => {
                const str = String(s || '1').trim();
                return str.length > 0 ? str.split('') : ['1'];
            });

            const resultado = [];
            function cartesian(index = 0, current = []) {
                if (index === 14) {
                    resultado.push(current.join('') + p15);
                    return;
                }
                for (const char of opciones[index]) {
                    cartesian(index + 1, [...current, char]);
                    if (resultado.length >= 16 && multiIndices.length > 4) break;
                }
            }
            cartesian();
            return resultado.slice(0, 16);
        },

        /**
         * Compila las 35 apuestas exactas de la peña a partir de los datos de Firestore
         */
        compilar35Apuestas(jornada, members, pronosticos, pronosticosExtra) {
            const jIdStr = String(jornada.id);
            const jNum = jornada.number;

            // 1. Obtener quiniela de dobles y su P15 oficial
            const pExtra = (pronosticosExtra || []).find(p =>
                String(p.jId !== undefined && p.jId !== null ? p.jId : p.jornadaId) === jIdStr &&
                p.selection && p.selection.some(s => s && String(s).trim() !== '' && String(s) !== '-')
            );

            if (!pExtra || !pExtra.selection) {
                return { ok: false, reason: 'Falta rellenar la Quiniela de Dobles' };
            }

            const p15Oficial = this.formatP15(pExtra.selection[14]);
            const dobles16 = this.desarrollarDobles(pExtra.selection, pExtra.isReduced !== false, p15Oficial);

            // 2. Comprobar 19 socios
            const activeMembers = (members || []).filter(m => m && m.active !== false).slice(0, 19);
            const simples19 = [];

            for (const m of activeMembers) {
                const mIdStr = String(m.id);
                const p = (pronosticos || []).find(pred => {
                    const pj = String(pred.jId !== undefined && pred.jId !== null ? pred.jId : pred.jornadaId || '');
                    const pm = String(pred.mId !== undefined && pred.mId !== null ? pred.mId : pred.memberId || '');
                    return pj === jIdStr && pm === mIdStr;
                });

                if (!p || !p.selection || !Array.isArray(p.selection)) {
                    return { ok: false, reason: `Falta el pronóstico de ${m.name || 'Socio ' + m.id}` };
                }

                // Validar que tenga los 14 signos
                const signos14 = p.selection.slice(0, 14).map(s => {
                    const c = String(s || '').trim().toUpperCase();
                    return ['1', 'X', '2'].includes(c) ? c : null;
                });

                if (signos14.some(s => s === null)) {
                    return { ok: false, reason: `El pronóstico de ${m.name || 'Socio ' + m.id} está incompleto` };
                }

                // Todas las apuestas simples en el fichero oficial llevan el P15 canónico de Dobles
                simples19.push(signos14.join('') + p15Oficial);
            }

            if (simples19.length !== 19 || dobles16.length !== 16) {
                return { ok: false, reason: `Conteo inválido: ${simples19.length} simples + ${dobles16.length} dobles` };
            }

            const todasLas35 = [...simples19, ...dobles16];
            const fileContent = todasLas35.join('\r\n');

            return {
                ok: true,
                p15Oficial: p15Oficial,
                simples19: simples19,
                dobles16: dobles16,
                fileContent: fileContent,
                totalApuestas: todasLas35.length
            };
        },

        /**
         * Envía las 35 apuestas reales a través de Google Apps Script
         */
        async enviarSelladoReal(jornada, fileContent, p15Oficial, ticketId) {
            const cfg = await this.getConfig();
            if (!cfg.webhookUrl) {
                throw new Error('No se ha configurado la URL del Webhook de Google Apps Script');
            }
            if (!cfg.destinoEmail) {
                throw new Error('No se ha configurado el email de la administración de lotería');
            }

            const fileName = `${ticketId}.txt`;
            const subject = `[${ticketId}] Sellado Jornada ${jornada.number} - 35 Apuestas (P15: ${p15Oficial})`;
            const body = `Hola,\n\nSe adjunta el archivo oficial con los pronósticos de la Peña Los Maulas para la Jornada ${jornada.number}.\n\n- Referencia de sellado: ${ticketId}\n- Total apuestas: 35 columnas simples (Soporte Digital / ASD)\n- Pleno al 15 oficial: ${p15Oficial}\n- Importe oficial: 26,25 € (a descontar del saldo en depósito)\n\nRogamos validación en Terminal Oficial SELAE y confirmación con resguardo indicando esta misma referencia.\n\nSaludos,\nPeña Los Maulas`;

            const payload = {
                to: cfg.destinoEmail,
                subject: subject,
                body: body,
                fileName: fileName,
                fileContent: fileContent,
                ticketId: ticketId,
                jornada: jornada.number
            };

            const res = await fetch(cfg.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });

            let data = null;
            try {
                data = await res.json();
            } catch (e) {
                if (res.ok) data = { ok: true };
            }

            if (!data || !data.ok) {
                throw new Error((data && data.error) ? data.error : `HTTP ${res.status}`);
            }

            return {
                ok: true,
                ticketId: ticketId,
                destino: cfg.destinoEmail,
                sentAt: new Date().toISOString()
            };
        },

        /**
         * Verifica si se cumplen las condiciones y, de ser así, ejecuta el auto-envío
         */
        async verificarYAutoEnviar(jornadaId) {
            if (this._isSending) return { ok: false, reason: 'Operación en curso' };
            if (!window.DataService) return { ok: false, reason: 'No DataService' };

            this._isSending = true;

            try {
                const jornadas = await window.DataService.getAll('jornadas');
                const jornada = jornadas.find(j => String(j.id) === String(jornadaId) || String(j.number) === String(jornadaId));
                if (!jornada) return { ok: false, reason: 'Jornada no encontrada' };

                // Comprobar si ya fue enviada
                const selladosPrevios = await window.DataService.getAll('sellados').catch(() => []);
                const yaSellado = selladosPrevios.find(s => String(s.jornada) === String(jornada.number));
                if (yaSellado && yaSellado.estado !== 'ERROR') {
                    console.log(`[SelladoService] Jornada ${jornada.number} ya fue enviada previamente (${yaSellado.ticketId}).`);
                    return { ok: false, reason: 'Jornada ya enviada', sellado: yaSellado };
                }

                const members = await window.DataService.getAll('members');
                const pronosticos = await window.DataService.getAll('pronosticos');
                const pronosticosExtra = await window.DataService.getAll('pronosticos_extra') || [];

                const compilacion = this.compilar35Apuestas(jornada, members, pronosticos, pronosticosExtra);
                if (!compilacion.ok) {
                    console.log(`[SelladoService] Condiciones aún no completas para Jornada ${jornada.number}: ${compilacion.reason}`);
                    return { ok: false, reason: compilacion.reason };
                }

                console.log(`🚀 [SelladoService] ¡CONDICIONES CUMPLIDAS! Disparando auto-envío para Jornada ${jornada.number}...`);

                const ticketId = this.generarTicketId(jornada.number, jornada.season || '2026-2027');
                const envioRes = await this.enviarSelladoReal(jornada, compilacion.fileContent, compilacion.p15Oficial, ticketId);

                // Registrar en Firestore (colección 'sellados')
                const registroSellado = {
                    id: ticketId,
                    ticketId: ticketId,
                    jornada: parseInt(jornada.number, 10),
                    temporada: jornada.season || '2026-2027',
                    p15Oficial: compilacion.p15Oficial,
                    apuestas: 35,
                    importe: 26.25,
                    destino: envioRes.destino,
                    enviadoEn: envioRes.sentAt,
                    estado: 'ENVIADO',
                    driveFolderUrl: 'https://drive.google.com/drive/search?q=RESGUARDOS%20QUINIELAS%20MAULAS',
                    resguardoDriveUrl: null,
                    respuestaLotero: null
                };

                await window.DataService.save('sellados', registroSellado);

                // Marcar jornada
                jornada.selladoTicketId = ticketId;
                jornada.selladoEnviado = true;
                await window.DataService.save('jornadas', jornada);

                // Notificar por Telegram si está configurado
                if (window.TelegramService && window.TelegramService.sendRaw) {
                    try {
                        const tgConfig = await window.DataService.getDoc('config', 'telegram').catch(() => null);
                        if (tgConfig && tgConfig.token && tgConfig.chatId) {
                            const msgTg = `🚀 *¡QUINIELLA DE 35 APUESTAS ENVIADA A LA ADMINISTRACIÓN!*\n\n- *Jornada:* ${jornada.number}\n- *Referencia:* \`${ticketId}\`\n- *Pleno al 15:* ${compilacion.p15Oficial}\n- *Importe:* 26,25 €\n\nEsperando validación oficial de SELAE y resguardo.`;
                            await window.TelegramService.sendRaw(tgConfig.token, tgConfig.chatId, msgTg);
                        }
                    } catch (te) {
                        console.warn('[SelladoService] Error enviando aviso Telegram de sellado:', te);
                    }
                }

                return { ok: true, ticketId: ticketId, registro: registroSellado };
            } catch (err) {
                console.error('[SelladoService] Error en verificarYAutoEnviar:', err);
                return { ok: false, error: err.message };
            } finally {
                this._isSending = false;
            }
        },

        /**
         * Obtiene todos los registros del historial de sellados (Firestore + localStorage sync)
         */
        async obtenerHistorial() {
            const map = new Map();

            // 1. Leer de Firestore
            if (window.DataService && window.DataService.getAll) {
                try {
                    const list = await window.DataService.getAll('sellados').catch(() => []);
                    (list || []).forEach(item => {
                        if (item && (item.ticketId || item.jornada)) {
                            const key = String(item.ticketId || `j_${item.jornada}`);
                            map.set(key, item);
                        }
                    });
                } catch (e) {}
            }

            // 2. Complementar con los registros de sellado guardados en localStorage
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith('maulas_sellado_j_')) {
                        const raw = localStorage.getItem(k);
                        if (raw) {
                            try {
                                const rec = JSON.parse(raw);
                                if (rec && rec.ticketId) {
                                    if (!map.has(rec.ticketId)) {
                                        map.set(rec.ticketId, {
                                            id: rec.ticketId,
                                            ticketId: rec.ticketId,
                                            jornada: rec.jornada,
                                            p15Oficial: rec.p15 || '10',
                                            apuestas: 35,
                                            importe: 26.25,
                                            destino: rec.destino,
                                            enviadoEn: rec.enviadoEn,
                                            estado: rec.status === 'CONFIRMADO' ? 'CONFIRMADO' : 'ENVIADO',
                                            driveFolderUrl: 'https://drive.google.com/drive/search?q=RESGUARDOS%20QUINIELAS%20MAULAS',
                                            resguardoDriveUrl: (rec.respuesta && rec.respuesta.attachments && rec.respuesta.attachments[0] && (rec.respuesta.attachments[0].driveUrl || rec.respuesta.attachments[0].dataUri)) || null,
                                            respuestaLotero: rec.respuesta || null,
                                            rectificadoEn: rec.rectificadoEn || null
                                        });
                                    }
                                }
                            } catch (errJson) {}
                        }
                    }
                }
            } catch (errLs) {}

            const merged = Array.from(map.values());
            return merged.sort((a, b) => (parseInt(b.jornada, 10) || 0) - (parseInt(a.jornada, 10) || 0));
        },

        /**
         * Renderiza el modal interactivo con el Historial de Sellados (exclusivo Fernando)
         */
        async mostrarModalHistorial() {
            if (!this.isFernando()) return;

            let modal = document.getElementById('modal-historial-sellados');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'modal-historial-sellados';
                modal.className = 'fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4';
                modal.innerHTML = `
                    <div class="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl text-slate-200">
                        <!-- Header -->
                        <div class="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <span class="text-xl">🧾</span>
                                <div>
                                    <h3 class="text-base font-extrabold text-white leading-tight">Historial de Sellados y Resguardos</h3>
                                    <p class="text-[11px] text-slate-400">Control de boletos expedidos y archivo en Google Drive</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                <a id="btn-drive-folder-global" href="https://drive.google.com/drive/search?q=RESGUARDOS%20QUINIELAS%20MAULAS" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition flex items-center gap-1.5">
                                    <span>📁</span> Abrir Carpeta en Drive
                                </a>
                                <button onclick="document.getElementById('modal-historial-sellados').classList.add('hidden')" class="text-slate-400 hover:text-white p-1 px-2.5 rounded-lg hover:bg-slate-800 text-sm font-bold transition">✕</button>
                            </div>
                        </div>

                        <!-- Content List -->
                        <div id="historial-sellados-list" class="p-4 overflow-y-auto space-y-3 flex-1 text-xs">
                            <div class="text-center py-8 text-slate-400">Cargando historial de sellados...</div>
                        </div>

                        <!-- Footer -->
                        <div class="p-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                            <span>Exclusivo: Fernando Lozano (Administrador)</span>
                            <span class="font-mono text-emerald-400">35 apuestas • 26,25 €</span>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
            }

            modal.classList.remove('hidden');

            const listEl = document.getElementById('historial-sellados-list');
            if (listEl) {
                listEl.innerHTML = `<div class="text-center py-6 text-slate-400"><span class="animate-spin inline-block text-lg">⏳</span> Cargando registros...</div>`;
                const records = await this.obtenerHistorial();

                if (records.length === 0) {
                    listEl.innerHTML = `
                        <div class="text-center py-10 space-y-2 bg-slate-950/40 rounded-xl border border-slate-800">
                            <p class="text-slate-400 text-sm font-medium">Aún no hay registros de sellado en esta temporada.</p>
                            <p class="text-slate-500 text-xs">Los boletos se registrarán automáticamente en cuanto se completen los 19 pronósticos y la de dobles.</p>
                            <div class="pt-2">
                                <a href="sandbox_sellado.html" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-300 font-bold border border-emerald-500/40">
                                    <span>🧪</span> Ir al Sandbox de Sellado
                                </a>
                            </div>
                        </div>
                    `;
                    return;
                }

                listEl.innerHTML = records.map(r => {
                    const isConfirmado = r.estado === 'CONFIRMADO';
                    const badgeClass = isConfirmado ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-blue-500/20 text-blue-400 border-blue-500/40';
                    const fechaTxt = r.enviadoEn ? new Date(r.enviadoEn).toLocaleString() : 'Fecha no disp.';
                    const driveUrl = r.resguardoDriveUrl || r.driveFolderUrl || 'https://drive.google.com/drive/search?q=RESGUARDOS%20QUINIELAS%20MAULAS';
                    const rectificadoTag = r.rectificadoEn ? `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">✏️ Rectificado</span>` : '';

                    return `
                        <div class="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div class="space-y-1">
                                <div class="flex items-center gap-2">
                                    <span class="px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-800 text-white border border-slate-700">Jornada ${r.jornada}</span>
                                    <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${badgeClass}">
                                        ${isConfirmado ? '🟢 Resguardo Confirmado' : '🔵 Enviado (Esperando)'}
                                    </span>
                                    ${rectificadoTag}
                                    <span class="text-[11px] font-mono text-slate-400">${r.ticketId}</span>
                                </div>
                                <div class="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <span>📅 ${fechaTxt}</span>
                                    <span>⚽ P15: <strong class="text-amber-300 font-mono">${r.p15Oficial || '10'}</strong></span>
                                    <span>💶 ${r.importe || 26.25} € (${r.apuestas || 35} apuestas)</span>
                                </div>
                            </div>

                            <div class="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                                <a href="${driveUrl}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold border border-amber-500/40 flex items-center gap-1 transition">
                                    <span>📁</span> Drive
                                </a>
                                ${r.resguardoDriveUrl ? `
                                <a href="${r.resguardoDriveUrl}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/40 text-emerald-300 text-xs font-bold border border-emerald-500/40 flex items-center gap-1 transition">
                                    <span>🧾</span> Ver Resguardo
                                </a>` : ''}
                                <button onclick="SelladoService.reconsultarRectificacion('${r.ticketId}', ${r.jornada})" class="px-2.5 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600/40 text-blue-300 text-xs font-bold border border-blue-500/40 flex items-center gap-1 transition" title="Consultar si la administración ha enviado un correo con resguardo corregido">
                                    <span>🔄</span> Re-consultar Gmail
                                </button>
                                <button onclick="SelladoService.abrirModalSubidaManual('${r.ticketId}', ${r.jornada})" class="px-2.5 py-1.5 rounded-lg bg-purple-600/30 hover:bg-purple-600/40 text-purple-300 text-xs font-bold border border-purple-500/40 flex items-center gap-1 transition" title="Subir manualmente una foto/PDF de corrección">
                                    <span>📤</span> Sustituir
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        },

        /**
         * Re-consulta Gmail buscando correos posteriores (rectificaciones) y abre comparador
         */
        async reconsultarRectificacion(ticketId, jornadaNum) {
            const cfg = await this.getConfig();
            if (!cfg.webhookUrl) {
                alert('No hay Webhook configurado. Configúralo en el Sandbox de Sellado.');
                return;
            }

            const btnList = document.querySelectorAll(`button[onclick*="${ticketId}"]`);
            btnList.forEach(b => { b.disabled = true; b.innerHTML = '<span>⏳</span> Consultando...'; });

            try {
                const res = await fetch(cfg.webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        action: 'check_reply',
                        ticketId: ticketId,
                        jornada: jornadaNum,
                        isTest: false
                    })
                });

                const data = await res.json();
                if (!data || !data.ok) {
                    throw new Error((data && data.error) ? data.error : 'Error en consulta');
                }

                if (!data.hasReply) {
                    alert(`No se detectaron nuevas respuestas en el correo para la Jornada ${jornadaNum}.\n\nSi el lotero te lo envió por otro canal (ej. WhatsApp), puedes usar el botón "📤 Sustituir" para cargarlo manualmente.`);
                    return;
                }

                const nuevoAdjunto = (data.attachments && data.attachments[0]) || null;
                if (!nuevoAdjunto) {
                    alert(`Se encontró respuesta en Gmail de: ${data.from},\npero no incluye ningún archivo adjunto nuevo.`);
                    return;
                }

                // Cargar registro actual
                const sellados = await this.obtenerHistorial();
                const actual = sellados.find(s => s.ticketId === ticketId || String(s.jornada) === String(jornadaNum));

                this.mostrarModalComparativaSustitucion(actual, data, nuevoAdjunto);

            } catch (err) {
                alert('Error al re-consultar Gmail: ' + err.message);
            } finally {
                btnList.forEach(b => { b.disabled = false; b.innerHTML = '<span>🔄</span> Re-consultar Gmail'; });
            }
        },

        /**
         * Modal de Previsualización Comparativa (Anterior vs Nuevo)
         */
        mostrarModalComparativaSustitucion(registroActual, respuestaGmail, nuevoAdjunto) {
            let modalComp = document.getElementById('modal-comparativa-resguardo');
            if (modalComp) modalComp.remove();

            const imgActual = (registroActual && registroActual.resguardoDriveUrl) || '';
            const imgNueva = nuevoAdjunto.dataUri || nuevoAdjunto.driveUrl || '';

            modalComp = document.createElement('div');
            modalComp.id = 'modal-comparativa-resguardo';
            modalComp.className = 'fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-5';
            modalComp.innerHTML = `
                <div class="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[95vh] flex flex-col overflow-hidden shadow-2xl text-slate-200">
                    <!-- Header -->
                    <div class="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-xl">⚖️</span>
                            <div>
                                <h3 class="text-base font-extrabold text-white">Revisión de Corrección de Resguardo</h3>
                                <p class="text-[11px] text-slate-400">Jornada ${registroActual ? registroActual.jornada : ''} • Compara antes de sustituir</p>
                            </div>
                        </div>
                        <button onclick="document.getElementById('modal-comparativa-resguardo').remove()" class="text-slate-400 hover:text-white p-1 px-2.5 rounded-lg hover:bg-slate-800 text-sm font-bold transition">✕ Cancelar</button>
                    </div>

                    <!-- Mensaje del Lotero -->
                    <div class="p-3 bg-blue-950/20 border-b border-blue-500/20 text-xs space-y-1">
                        <div class="flex items-center justify-between">
                            <span class="text-slate-400">Remitente: <strong class="text-slate-200">${respuestaGmail.from || ''}</strong></span>
                            <span class="text-[11px] text-slate-400 font-mono">${respuestaGmail.date ? new Date(respuestaGmail.date).toLocaleString() : ''}</span>
                        </div>
                        <div class="text-[11px] text-slate-300 italic max-h-16 overflow-y-auto bg-slate-950/50 p-2 rounded border border-slate-800">
                            "${respuestaGmail.body || 'Nuevo correo recibido sin texto adicional.'}"
                        </div>
                    </div>

                    <!-- Comparador 2 Columnas -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 overflow-y-auto flex-1 text-xs">
                        <!-- Columna Izquierda: Anterior -->
                        <div class="space-y-2 flex flex-col">
                            <div class="flex items-center justify-between pb-1 border-b border-slate-800">
                                <span class="font-bold text-rose-400 flex items-center gap-1"><span>❌</span> Resguardo Anterior</span>
                                <span class="text-[10px] text-slate-500 font-mono">Actual en sistema</span>
                            </div>
                            <div class="flex-1 bg-black/40 rounded-xl border border-slate-800 p-2 flex items-center justify-center min-h-[220px]">
                                ${imgActual ? `<img src="${imgActual}" class="max-h-[300px] object-contain rounded" onerror="this.outerHTML='<p class=\\'text-slate-500 italic text-center\\'>Vista previa no disponible.<br><a href=\\'${imgActual}\\' target=\\'_blank\\' class=\\'text-blue-400 underline\\'>Abrir enlace anterior</a></p>'">` : `<p class="text-slate-500 italic">No había resguardo previo registrado.</p>`}
                            </div>
                        </div>

                        <!-- Columna Derecha: Nuevo recibido -->
                        <div class="space-y-2 flex flex-col">
                            <div class="flex items-center justify-between pb-1 border-b border-emerald-500/30">
                                <span class="font-bold text-emerald-400 flex items-center gap-1"><span>✅</span> Nuevo Resguardo Recibido</span>
                                <span class="text-[10px] text-emerald-300 font-mono">${nuevoAdjunto.name || ''}</span>
                            </div>
                            <div class="flex-1 bg-black/40 rounded-xl border border-emerald-500/30 p-2 flex items-center justify-center min-h-[220px]">
                                ${imgNueva ? `<img src="${imgNueva}" class="max-h-[300px] object-contain rounded">` : `<p class="text-slate-500 italic">Adjunto no visualizable directamente.<br><a href="${nuevoAdjunto.driveUrl}" target="_blank" class="text-emerald-400 underline">Abrir en Google Drive</a></p>`}
                            </div>
                        </div>
                    </div>

                    <!-- Footer con Botón de Sustitución -->
                    <div class="p-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-3">
                        <button onclick="document.getElementById('modal-comparativa-resguardo').remove()" class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition">
                            Descartar y Mantener Anterior
                        </button>
                        <button id="btn-confirmar-sustitucion-resguardo" class="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-600/30 transition flex items-center gap-2">
                            <span>✅</span> Confirmar y Sustituir por el Nuevo Resguardo
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modalComp);

            document.getElementById('btn-confirmar-sustitucion-resguardo').onclick = async () => {
                await SelladoService.aplicarSustitucionResguardo(registroActual, respuestaGmail, nuevoAdjunto);
            };
        },

        /**
         * Aplica la sustitución en Firestore y actualiza el modal
         */
        async aplicarSustitucionResguardo(registroActual, respuestaGmail, nuevoAdjunto) {
            const btn = document.getElementById('btn-confirmar-sustitucion-resguardo');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<span>⏳</span> Guardando sustitución...';
            }

            try {
                const nowIso = new Date().toISOString();
                const nuevoRegistro = {
                    ...registroActual,
                    estado: 'CONFIRMADO',
                    rectificadoEn: nowIso,
                    resguardoAnteriorUrl: registroActual.resguardoDriveUrl || null,
                    resguardoDriveUrl: nuevoAdjunto.driveUrl || nuevoAdjunto.dataUri || registroActual.resguardoDriveUrl,
                    respuestaLotero: {
                        from: respuestaGmail.from,
                        date: respuestaGmail.date,
                        body: respuestaGmail.body,
                        attachmentsCount: respuestaGmail.attachmentsCount,
                        rectificado: true
                    }
                };

                await window.DataService.save('sellados', nuevoRegistro);

                const modalComp = document.getElementById('modal-comparativa-resguardo');
                if (modalComp) modalComp.remove();

                alert(`✅ RESGUARDO SUSTITUIDO CON ÉXITO\n\nSe ha actualizado el resguardo oficial para la Jornada ${registroActual.jornada}.\nEl enlace anterior ha quedado archivado en el histórico.`);

                // Recargar lista del historial
                this.mostrarModalHistorial();
            } catch (err) {
                alert('Error al aplicar la sustitución: ' + err.message);
                if (btn) btn.disabled = false;
            }
        },

        /**
         * Modal de Subida Manual para sustituir el resguardo (ej. si llega por WhatsApp)
         */
        abrirModalSubidaManual(ticketId, jornadaNum) {
            let modalManual = document.getElementById('modal-subida-manual-resguardo');
            if (modalManual) modalManual.remove();

            modalManual = document.createElement('div');
            modalManual.id = 'modal-subida-manual-resguardo';
            modalManual.className = 'fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4';
            modalManual.innerHTML = `
                <div class="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl text-slate-200">
                    <div class="flex items-center justify-between pb-2 border-b border-slate-800">
                        <div class="flex items-center gap-2">
                            <span class="text-xl">📤</span>
                            <h3 class="text-sm font-extrabold text-white">Sustituir Resguardo Manualmente</h3>
                        </div>
                        <button onclick="document.getElementById('modal-subida-manual-resguardo').remove()" class="text-slate-400 hover:text-white text-xs font-bold">✕</button>
                    </div>

                    <p class="text-xs text-slate-300">Selecciona el nuevo archivo de resguardo (imagen o PDF) recibido como corrección para la <strong>Jornada ${jornadaNum}</strong>.</p>

                    <div class="space-y-3">
                        <input type="file" id="input-archivo-resguardo-manual" accept="image/*,application/pdf" class="w-full text-xs text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-600/30 file:text-blue-300 hover:file:bg-blue-600/40 cursor-pointer">
                        <div id="preview-subida-manual" class="hidden p-2 rounded-lg bg-black/40 border border-slate-800 flex items-center justify-center max-h-40 overflow-hidden"></div>
                    </div>

                    <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-800 text-xs">
                        <button onclick="document.getElementById('modal-subida-manual-resguardo').remove()" class="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 transition">Cancelar</button>
                        <button id="btn-guardar-subida-manual" class="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition">Guardar Sustitución</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modalManual);

            const fileInp = document.getElementById('input-archivo-resguardo-manual');
            const prevBox = document.getElementById('preview-subida-manual');

            fileInp.onchange = () => {
                const file = fileInp.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (e) => {
                    prevBox.classList.remove('hidden');
                    if (file.type.startsWith('image/')) {
                        prevBox.innerHTML = `<img src="${e.target.result}" class="max-h-36 object-contain rounded">`;
                    } else {
                        prevBox.innerHTML = `<span class="text-slate-300 font-bold">📄 ${file.name}</span>`;
                    }
                };
                reader.readAsDataURL(file);
            };

            document.getElementById('btn-guardar-subida-manual').onclick = async () => {
                const file = fileInp.files[0];
                if (!file) {
                    alert('Por favor selecciona un archivo primero.');
                    return;
                }

                const reader = new FileReader();
                reader.onload = async (e) => {
                    const dataUri = e.target.result;
                    const sellados = await SelladoService.obtenerHistorial();
                    const actual = sellados.find(s => s.ticketId === ticketId || String(s.jornada) === String(jornadaNum));
                    if (actual) {
                        actual.resguardoAnteriorUrl = actual.resguardoDriveUrl || null;
                        actual.resguardoDriveUrl = dataUri;
                        actual.rectificadoEn = new Date().toISOString();
                        actual.estado = 'CONFIRMADO';
                        await window.DataService.save('sellados', actual);
                    }
                    modalManual.remove();
                    alert(`✅ Resguardo de Jornada ${jornadaNum} sustituido con éxito.`);
                    SelladoService.mostrarModalHistorial();
                };
                reader.readAsDataURL(file);
            };
        },

        /**
         * Inyecta el botón de Historial exclusivamente para Fernando Lozano en la barra superior
         */
        inyectarBotonSiEsFernando() {
            if (!this.isFernando()) return;

            const existingBtn = document.getElementById('btn-historial-sellados-fl');
            if (existingBtn) {
                existingBtn.style.display = 'inline-flex';
                return;
            }

            const targetHeader = document.querySelector('.header-actions .action-buttons') || document.querySelector('.header-actions');
            if (targetHeader && !document.getElementById('btn-historial-sellados-fl')) {
                const btn = document.createElement('button');
                btn.id = 'btn-historial-sellados-fl';
                btn.className = 'btn-action';
                btn.style.backgroundColor = '#059669'; // Emerald
                btn.style.borderColor = '#10b981';
                btn.style.color = '#ffffff';
                btn.style.fontWeight = 'bold';
                btn.innerHTML = '🧾 Historial Sellados';
                btn.title = 'Historial de boletos y resguardos en Drive (Exclusivo Fernando)';
                btn.onclick = (e) => {
                    e.preventDefault();
                    SelladoService.mostrarModalHistorial();
                };

                targetHeader.insertBefore(btn, targetHeader.firstChild);
            }
        }
    };

    window.SelladoService = SelladoService;

    // Inyección condicional en carga de página con reintentos para asegurar render tras autenticación
    function intentarInyeccion() {
        SelladoService.inyectarBotonSiEsFernando();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            intentarInyeccion();
            setTimeout(intentarInyeccion, 300);
            setTimeout(intentarInyeccion, 1000);
        });
    } else {
        intentarInyeccion();
        setTimeout(intentarInyeccion, 300);
        setTimeout(intentarInyeccion, 1000);
    }
})();
