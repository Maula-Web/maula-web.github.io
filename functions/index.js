/**
 * Cloud Functions - Peña Maulas PWA
 * =========================================================================
 * Proyecto Firebase: maulasweb
 * Región: europe-west1
 *
 * Funciones:
 *  1. sendThursdayReminder  — Cron jueves 14:30 UTC (16:30 Madrid)
 *                             Avisa a socios que aún no han rellenado quiniela.
 *  2. sendJornadaResults    — Trigger Firestore: jornada actualizada con 15 resultados.
 *                             Notifica a todos que ya hay resultados.
 *  3. sendManualPush        — HTTPS Callable: Fernando envía push manual a todos o a uno.
 *  4. cleanOldTokens        — Cron lunes 03:00. Limpia tokens caducados > 30 días.
 * =========================================================================
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentUpdated, onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

// ============================================================
// HELPERS COMPARTIDOS
// ============================================================

/**
 * Obtiene tokens FCM activos de push_subscriptions.
 * Filtra: permission === 'granted' && fcmToken existe.
 * @param {number|null} memberIdFilter - Si se pasa, filtra por socio concreto.
 * @returns {Array<{token, memberId, memberName, docId}>}
 */
async function getActiveTokens(memberIdFilter = null) {
    let query = db.collection('push_subscriptions')
        .where('permission', '==', 'granted');

    if (memberIdFilter !== null) {
        query = query.where('memberId', '==', memberIdFilter);
    }

    const snap = await query.get();
    const tokens = [];
    snap.forEach(doc => {
        const data = doc.data();
        if (data.fcmToken) {
            tokens.push({
                token: data.fcmToken,
                memberId: data.memberId,
                memberName: data.memberName || `Socio ${data.memberId}`,
                docId: doc.id
            });
        }
    });
    return tokens;
}

/**
 * Envía FCM a un array de tokens.
 * Elimina automáticamente tokens caducados de Firestore.
 * @returns {{ sent: number, failed: number }}
 */
async function sendToTokens(tokens, notification, extraData = {}) {
    if (!tokens || tokens.length === 0) return { sent: 0, failed: 0 };

    const messages = tokens.map(({ token }) => ({
        token,
        notification,
        data: { ...extraData },
        android: {
            priority: 'high',
            notification: { sound: 'default', channelId: 'maulas-default' }
        },
        apns: {
            payload: {
                aps: {
                    sound: 'default',
                    badge: 1,
                    contentAvailable: true,
                    mutableContent: true
                }
            },
            headers: {
                'apns-priority': '10',
                'apns-push-type': 'alert'
            }
        },
        webpush: {
            notification: {
                icon: '/icons/icon-192x192.png',
                badge: '/icons/favicon-32x32.png',
                requireInteraction: true
            },
            headers: { Urgency: 'high' }
        }
    }));

    const response = await messaging.sendEach(messages);

    // Detectar y marcar tokens caducados
    const staleDocIds = [];
    response.responses.forEach((res, idx) => {
        if (!res.success) {
            const code = res.error && res.error.code;
            const isStale = (
                code === 'messaging/registration-token-not-registered' ||
                code === 'messaging/invalid-registration-token' ||
                code === 'messaging/invalid-argument'
            );
            if (isStale) {
                staleDocIds.push(tokens[idx].docId);
            }
            console.warn(
                `[Push] Error enviando a ${tokens[idx].memberName} (${tokens[idx].memberId}):`,
                res.error && res.error.message
            );
        }
    });

    // Marcar tokens caducados para limpieza posterior
    for (const docId of staleDocIds) {
        await db.collection('push_subscriptions').doc(docId).update({
            fcmToken: null,
            permission: 'expired',
            expiredAt: new Date().toISOString()
        });
        console.log(`[Push] Token marcado como caducado: ${docId}`);
    }

    return {
        sent: response.successCount,
        failed: response.failureCount
    };
}

// ============================================================
// 1. RECORDATORIO JUEVES — Cron 14:30 UTC (16:30 Madrid)
//    Solo avisa a socios que NO han rellenado la quiniela.
// ============================================================
exports.sendThursdayReminder = onSchedule(
    {
        schedule: '30 14 * * 4',   // Jueves 14:30 UTC = 16:30 Madrid (CEST)
        timeZone: 'Europe/Madrid',
        region: 'europe-west1'
    },
    async () => {
        console.log('[sendThursdayReminder] Iniciando recordatorio de quiniela...');

        // 1. Buscar la próxima jornada activa sin los 15 resultados
        const jornadasSnap = await db.collection('jornadas')
            .where('active', '==', true)
            .orderBy('number', 'asc')
            .get();

        let targetJornada = null;
        jornadasSnap.forEach(doc => {
            if (targetJornada) return;
            const j = doc.data();
            const filled = (j.matches || []).filter(m => m.result && m.result !== '').length;
            if (filled < 15) targetJornada = j;
        });

        if (!targetJornada) {
            console.log('[sendThursdayReminder] No hay jornada activa con quiniela abierta.');
            return;
        }

        const jornadaNum = targetJornada.number;
        console.log(`[sendThursdayReminder] Jornada objetivo: ${jornadaNum}`);

        // 2. Socios que ya rellenaron
        const pronosticosSnap = await db.collection('pronosticos')
            .where('jornada', '==', jornadaNum)
            .get();
        const submittedIds = new Set();
        pronosticosSnap.forEach(doc => {
            const mid = doc.data().memberId;
            if (mid !== undefined) submittedIds.add(String(mid));
        });

        // 3. Socios activos que NO rellenaron
        const membersSnap = await db.collection('members')
            .where('active', '==', true)
            .get();
        const pendingMemberIds = [];
        membersSnap.forEach(doc => {
            const m = doc.data();
            if (!submittedIds.has(String(m.id))) {
                pendingMemberIds.push(m.id);
            }
        });

        console.log(
            `[sendThursdayReminder] ${pendingMemberIds.length} socios sin quiniela:`,
            pendingMemberIds
        );

        if (pendingMemberIds.length === 0) {
            console.log('[sendThursdayReminder] Todos los socios ya rellenaron. No se envía nada.');
            return;
        }

        // 4. Tokens de los socios pendientes
        const allTokens = await getActiveTokens();
        const targetTokens = allTokens.filter(t => {
            const mid = Number(t.memberId);
            return pendingMemberIds.includes(mid) || pendingMemberIds.includes(String(t.memberId));
        });

        console.log(`[sendThursdayReminder] Tokens objetivo: ${targetTokens.length}`);

        if (targetTokens.length === 0) {
            console.log('[sendThursdayReminder] Ningún socio pendiente tiene token activo.');
            return;
        }

        // 5. Enviar
        const result = await sendToTokens(
            targetTokens,
            {
                title: '⏰ ¡Plazo cierra a las 17:00!',
                body: `Jornada ${jornadaNum}: aún no has rellenado tu quiniela. ¡Te queda poco tiempo!`
            },
            {
                type: 'reminder',
                jornada: String(jornadaNum),
                url: 'pronosticos_2.html'
            }
        );

        // 6. Log en Firestore
        await db.collection('push_log').add({
            type: 'thursday_reminder',
            jornada: jornadaNum,
            pendingCount: pendingMemberIds.length,
            tokensTargeted: targetTokens.length,
            sent: result.sent,
            failed: result.failed,
            sentAt: new Date().toISOString()
        });

        console.log(
            `[sendThursdayReminder] Completado. Enviadas: ${result.sent}, Fallidas: ${result.failed}`
        );
    }
);

// ============================================================
// 2. RESULTADOS DE JORNADA — Trigger Firestore
//    Se dispara cuando una jornada alcanza los 15 resultados.
// ============================================================
exports.sendJornadaResults = onDocumentUpdated(
    {
        document: 'jornadas/{jornadaId}',
        region: 'europe-west1'
    },
    async (event) => {
        const before = event.data.before.data();
        const after = event.data.after.data();

        const filledBefore = (before.matches || [])
            .filter(m => m.result && m.result !== '').length;
        const filledAfter = (after.matches || [])
            .filter(m => m.result && m.result !== '').length;

        // Solo notificar cuando se completan los 15 resultados por primera vez
        if (filledBefore >= 15 || filledAfter < 15) return;

        // Evitar doble envío
        if (after.resultNotificationSent) {
            console.log(`[sendJornadaResults] Jornada ${after.number}: ya notificada anteriormente.`);
            return;
        }

        console.log(`[sendJornadaResults] Jornada ${after.number} completada. Notificando a todos...`);

        const tokens = await getActiveTokens();
        if (tokens.length === 0) {
            console.log('[sendJornadaResults] Sin tokens activos. Nada que enviar.');
            return;
        }

        const result = await sendToTokens(
            tokens,
            {
                title: `🏆 Resultados Jornada ${after.number}`,
                body: '¡Ya están los resultados! Comprueba tu puntuación en la clasificación.'
            },
            {
                type: 'results',
                jornada: String(after.number),
                url: 'clasificacion_2.html'
            }
        );

        // Marcar jornada para no re-notificar en futuras ediciones
        await event.data.after.ref.update({ resultNotificationSent: true });

        await db.collection('push_log').add({
            type: 'jornada_results',
            jornada: after.number,
            sent: result.sent,
            failed: result.failed,
            sentAt: new Date().toISOString()
        });

        console.log(
            `[sendJornadaResults] Completado. Enviadas: ${result.sent}, Fallidas: ${result.failed}`
        );
    }
);

// ============================================================
// 3. ENVÍO MANUAL — HTTPS Callable (solo Fernando, memberId 6)
//    Parámetros: { callerMemberId, title, body, targetMemberId?, url? }
//    targetMemberId: null → todos los socios; número → solo ese socio
// ============================================================
exports.sendManualPush = onCall(
    { region: 'europe-west1' },
    async (request) => {
        const { callerMemberId, title, body, targetMemberId = null, url = 'dashboard_2.html' } = request.data;

        // Validar que es Fernando (ID 6)
        if (String(callerMemberId) !== '6') {
            throw new HttpsError(
                'permission-denied',
                'Solo el administrador (Fernando Lozano) puede enviar notificaciones manuales.'
            );
        }

        if (!title || !body) {
            throw new HttpsError('invalid-argument', 'title y body son obligatorios.');
        }

        const memberIdNum = targetMemberId !== null ? Number(targetMemberId) : null;
        const tokens = await getActiveTokens(memberIdNum);

        if (tokens.length === 0) {
            throw new HttpsError(
                'not-found',
                targetMemberId
                    ? `El socio ${targetMemberId} no tiene dispositivo suscrito.`
                    : 'No hay ningún dispositivo suscrito activo.'
            );
        }

        console.log(
            `[sendManualPush] Fernando envía a ${targetMemberId || 'TODOS'}: "${title}"`
        );

        const result = await sendToTokens(
            tokens,
            { title, body },
            { type: 'manual', url }
        );

        await db.collection('push_log').add({
            type: 'manual',
            title,
            body,
            targetMemberId: targetMemberId || 'all',
            tokensTargeted: tokens.length,
            sent: result.sent,
            failed: result.failed,
            sentAt: new Date().toISOString(),
            sentBy: callerMemberId
        });

        return { ok: true, sent: result.sent, failed: result.failed };
    }
);

// ============================================================
// 4. DISPATCH INMEDIATO DESDE COLA FIRESTORE (fcm_queue)
//    Cualquier inserción en fcm_queue dispara el push nativo FCM
// ============================================================
exports.sendFromFCMQueue = onDocumentCreated(
    {
        document: 'fcm_queue/{msgId}',
        region: 'europe-west1'
    },
    async (event) => {
        const snap = event.data;
        if (!snap) return;
        const data = snap.data();
        if (!data || data.status === 'sent' || data.status === 'processing') return;

        await snap.ref.update({ status: 'processing' });

        const title = data.title || '⚽ Peña Maulas';
        const body = data.body || '';
        const targetMemberId = (data.targetMemberId && data.targetMemberId !== 'all')
            ? Number(data.targetMemberId)
            : null;

        const tokens = await getActiveTokens(targetMemberId);
        if (tokens.length === 0) {
            console.log('[sendFromFCMQueue] No hay tokens para el destinatario.');
            await snap.ref.update({ status: 'no_tokens', processedAt: new Date().toISOString() });
            return;
        }

        const result = await sendToTokens(
            tokens,
            { title, body },
            {
                type: data.type || 'manual',
                url: data.url || 'dashboard_2.html',
                nonce: data.nonce || String(Date.now())
            }
        );

        await snap.ref.update({
            status: 'sent',
            sentCount: result.sent,
            failedCount: result.failed,
            processedAt: new Date().toISOString()
        });

        console.log(`[sendFromFCMQueue] Enviadas: ${result.sent}, Fallidas: ${result.failed}`);
    }
);

// ============================================================
// 5. LIMPIEZA SEMANAL — Cron lunes 03:00 Madrid
//    Elimina entradas con tokens caducados hace más de 30 días.
// ============================================================
exports.cleanOldTokens = onSchedule(
    {
        schedule: '0 3 * * 1',    // Lunes 03:00
        timeZone: 'Europe/Madrid',
        region: 'europe-west1'
    },
    async () => {
        console.log('[cleanOldTokens] Iniciando limpieza de tokens caducados...');

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const snap = await db.collection('push_subscriptions')
            .where('permission', '==', 'expired')
            .get();

        let deleted = 0;
        const batch = db.batch();

        snap.forEach(doc => {
            const data = doc.data();
            if (data.expiredAt && data.expiredAt < thirtyDaysAgo) {
                batch.delete(doc.ref);
                deleted++;
            }
        });

        if (deleted > 0) {
            await batch.commit();
        }

        console.log(`[cleanOldTokens] Eliminados ${deleted} tokens caducados.`);
    }
);
