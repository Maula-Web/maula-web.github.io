/**
 * scripts/thursday_reminder_cron.js - Cron de Recordatorio de Quiniela
 * =========================================================================
 * Se ejecuta automáticamente desde GitHub Actions todos los jueves a las 16:30
 * (o manualmente vía workflow_dispatch).
 *
 * Funcionalidad:
 * 1. Conecta con Firestore de maulasweb mediante Service Account.
 * 2. Identifica la jornada activa cuyos 15 partidos aún no tienen resultado.
 * 3. Comprueba qué socios activos NO han enviado sus pronósticos.
 * 4. Obtiene los tokens FCM oficiales de esos socios desde 'push_subscriptions'.
 * 5. Envía la notificación push nativa de alta prioridad (Apple APNs / Google FCM).
 * 6. Registra el envío en 'push_log'.
 * =========================================================================
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

// 1. Inicialización de Firebase Admin
function initFirebase() {
    const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountRaw) {
        console.error('\n❌ ERROR: Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT.');
        console.error('Por favor, genera una clave privada en Firebase Console:');
        console.error('Project Settings > Service accounts > Generate new private key');
        console.error('Y añádela en GitHub Secrets con el nombre: FIREBASE_SERVICE_ACCOUNT\n');
        process.exit(1);
    }

    let serviceAccount;
    try {
        serviceAccount = JSON.parse(serviceAccountRaw);
    } catch (e) {
        console.error('❌ Error al parsear FIREBASE_SERVICE_ACCOUNT como JSON:', e.message);
        process.exit(1);
    }

    const app = initializeApp({
        credential: cert(serviceAccount)
    });

    return {
        db: getFirestore(app),
        messaging: getMessaging(app)
    };
}


// =========================================================================
// FUNCIONES AUXILIARES: TELEGRAM Y PIG
// =========================================================================
function normalizeTeamName(name) {
    if (!name) return '';
    return name.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

function getPigClub(name) {
    if (!name) return null;
    const norm = normalizeTeamName(name);
    if (/^(realmadrid|rmadrid)$/.test(norm)) return 'REAL_MADRID';
    if (/^(barcelona|fcbarcelona|barca)$/.test(norm)) return 'BARCELONA';
    if (/^(atleticomadrid|atletico|atmadrid)$/.test(norm)) return 'ATLETICO_MADRID';
    return null;
}

function hasPigMatch(matches) {
    if (!Array.isArray(matches)) return false;
    return matches.some(m => {
        if (!m || !m.home || !m.away) return false;
        const c1 = getPigClub(m.home);
        const c2 = getPigClub(m.away);
        return c1 && c2 && c1 !== c2;
    });
}

async function sendTelegramReminder(db, targetJornada, todayMadridStr, isManualRun) {
    console.log('\n-------------------------------------------------------------');
    console.log('  📢 COMPROBANDO RECORDATORIO SEMANAL DE TELEGRAM');
    console.log('-------------------------------------------------------------');

    try {
        const tgDoc = await db.collection('config').doc('telegram').get();
        if (!tgDoc.exists) {
            console.log('ℹ️ No existe configuración de Telegram en Firestore.');
            return;
        }
        const tg = tgDoc.data();
        if (!tg.enabled || !tg.reminderEnabled || !tg.token || !tg.chatId) {
            console.log('ℹ️ Recordatorios de Telegram deshabilitados en configuración.');
            return;
        }

        const remDoc = await db.collection('config').doc('reminder').get();
        const rem = remDoc.exists ? remDoc.data() : {};

        // Deduplicación estricta para Telegram: un solo mensaje por jueves
        if (!isManualRun) {
            if (targetJornada.thursdayReminderDate === todayMadridStr) {
                console.log(`ℹ️ Recordatorio de Telegram para Jornada ${targetJornada.number} ya enviado hoy (${todayMadridStr}). Omitiendo.`);
                return;
            }

            const tgLogSnap = await db.collection('push_log')
                .where('type', '==', 'telegram_thursday_reminder')
                .where('jornada', '==', targetJornada.number)
                .get();

            const alreadySentTelegram = !tgLogSnap.empty && tgLogSnap.docs.some(d => {
                const data = d.data();
                const sentAt = data.sentAt ? new Date(data.sentAt).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }) : null;
                return sentAt === todayMadridStr || data.dateStr === todayMadridStr;
            });

            if (alreadySentTelegram) {
                console.log(`ℹ️ Ya existe registro en push_log del recordatorio Telegram de hoy para Jornada ${targetJornada.number}. Omitiendo.`);
                return;
            }
        }

        let msg = rem.message || '¡¡Por fin es jueves!! 🐸\n\nNo olvidéis rellenar la quiniela de la Jornada {jornada}.\n🔗 [Peña Maulas](https://maula-web.github.io/login.html)';
        msg = msg.replace('{jornada}', targetJornada.number);

        if (hasPigMatch(targetJornada.matches)) {
            const pigWarning = '\n\n⚠️ *¡ATENCIÓN! Esta jornada hay PIG 🐷 (Partido de Interés General).* ¡Recuerda sellar también el PIG 🐷!';
            if (msg.includes('\n🔗')) {
                msg = msg.replace('\n🔗', pigWarning + '\n🔗');
            } else {
                msg += pigWarning;
            }
        }

        console.log(`🚀 Enviando recordatorio semanal a Telegram (Jornada ${targetJornada.number})...`);
        const url = `https://api.telegram.org/bot${tg.token}/sendMessage`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: tg.chatId,
                text: msg,
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            })
        });

        const resData = await res.json();
        if (resData.ok) {
            console.log(`✅ Mensaje de Telegram enviado con éxito (Message ID: ${resData.result?.message_id}).`);

            if (targetJornada._docId) {
                await db.collection('jornadas').doc(targetJornada._docId).update({
                    thursdayReminderSent: true,
                    thursdayReminderDate: todayMadridStr
                });
            }

            await db.collection('push_log').add({
                type: 'telegram_thursday_reminder',
                jornada: targetJornada.number,
                dateStr: todayMadridStr,
                sentAt: new Date().toISOString(),
                source: isManualRun ? 'manual-dispatch' : 'github-actions-cron',
                messageId: resData.result?.message_id
            });
            console.log('📝 Registro de Telegram guardado en push_log.');
        } else {
            console.error('❌ Error al enviar mensaje a Telegram:', resData.description || resData);
        }
    } catch (err) {
        console.error('❌ Error en sendTelegramReminder:', err.message);
    }
}

async function main() {
    console.log('\n=============================================================');
    console.log('  ⚽ PEÑA MAULAS - RECORDATORIO AUTOMÁTICO DE QUINIELA JUEVES ');
    console.log('=============================================================\n');

    // Comprobación de ventana de ejecución en horario de Madrid
    const isManualRun = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' || process.argv.includes('--force');
    const madridDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
    const madridDay = madridDate.getDay(); // 4 = Jueves
    const madridHour = madridDate.getHours();
    const madridMin = madridDate.getMinutes();
    const todayMadridStr = madridDate.toLocaleDateString('es-ES');

    if (!isManualRun) {
        // Debe ser jueves
        if (madridDay !== 4) {
            console.log(`ℹ️ Hoy no es jueves en Madrid (día de la semana: ${madridDay}). Omitiendo.`);
            return;
        }

        // Ventana flexible: de 16:00 a 17:15 (permite compensar colas y retrasos de runners en GitHub Actions)
        if (madridHour < 16 || (madridHour === 17 && madridMin > 15) || madridHour > 17) {
            console.log(`ℹ️ Hora actual en Madrid: ${madridHour}:${String(madridMin).padStart(2, '0')}. Fuera de la ventana permitida (16:00 - 17:15). Omitiendo.`);
            return;
        }
    }

    const { db, messaging } = initFirebase();

    // 2. Buscar jornada activa pendiente de resultados
    console.log('📅 Buscando jornada activa...');
    const jornadasSnap = await db.collection('jornadas')
        .where('active', '==', true)
        .get();

    const activeJornadas = [];
    jornadasSnap.forEach(doc => {
        activeJornadas.push({ ...doc.data(), _docId: doc.id });
    });
    activeJornadas.sort((a, b) => (parseInt(a.number || a.id) || 0) - (parseInt(b.number || b.id) || 0));

    const isFinished = (j) => {
        if (j.status === 'closed' || j.status === 'completed' || j.finalizada === true) return true;
        if (!j.matches || !Array.isArray(j.matches) || j.matches.length === 0) return false;
        const filledResults = j.matches.filter(m => {
            if (!m || !m.result) return false;
            const r = String(m.result).trim().toLowerCase();
            return r !== '' && r !== '-' && r !== 'por definir';
        }).length;
        return filledResults >= 14;
    };

    let targetJornada = null;
    for (const j of activeJornadas) {
        if (!isFinished(j)) {
            targetJornada = j;
            break;
        }
    }

    if (!targetJornada) {
        console.log('ℹ️ No hay ninguna jornada activa pendiente de rellenar. Finalizando sin envíos.');
        return;
    }

    const jornadaNum = targetJornada.number;
    console.log(`✅ Jornada activa seleccionada: Jornada ${jornadaNum} (Fecha: ${targetJornada.date || 'Sin fecha'})`);

    // Recordatorio general por canal de Telegram (broadcast único semanal)
    await sendTelegramReminder(db, targetJornada, todayMadridStr, isManualRun);

    // Comprobar si ya se envió hoy para esta jornada (evita envíos duplicados si hay reintentos programados)
    if (!isManualRun) {
        const alreadySentSnap = await db.collection('push_log')
            .where('type', '==', 'thursday_reminder_cron')
            .where('jornada', '==', jornadaNum)
            .get();

        const alreadySentToday = !alreadySentSnap.empty && alreadySentSnap.docs.some(d => {
            const data = d.data();
            const sentAt = data.sentAt ? new Date(data.sentAt).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }) : null;
            return sentAt === todayMadridStr || data.dateStr === todayMadridStr;
        });

        if (alreadySentToday) {
            console.log(`ℹ️ El recordatorio push para la Jornada ${jornadaNum} ya se envió hoy (${todayMadridStr}). Omitiendo para no duplicar.`);
            return;
        }
    }

    // 3. Obtener socios que YA han enviado sus pronósticos válidos
    // En Firestore los pronósticos se guardan con jId (ID único de jornada) o jornadaId, y mId o memberId
    const jIdStr = String(targetJornada.id);
    const jNumStr = String(jornadaNum);

    const pronosticosSnap = await db.collection('pronosticos').get();
    const submittedMemberIds = new Set();
    pronosticosSnap.forEach(doc => {
        const data = doc.data();
        const pJId = String(data.jId !== undefined && data.jId !== null ? data.jId : (data.jornadaId !== undefined && data.jornadaId !== null ? data.jornadaId : data.jornada || ''));
        if (pJId === jIdStr || pJId === jNumStr) {
            const pMId = String(data.mId !== undefined && data.mId !== null ? data.mId : (data.memberId !== undefined && data.memberId !== null ? data.memberId : ''));
            const hasSelection = data.selection && Array.isArray(data.selection) &&
                data.selection.some(s => s && String(s).trim() !== '' && String(s) !== '-');
            if (pMId && hasSelection) {
                submittedMemberIds.add(pMId);
            }
        }
    });

    console.log(`📋 Pronósticos válidos ya recibidos para Jornada ${jornadaNum}: ${submittedMemberIds.size} socios.`);

    // 4. Obtener todos los socios
    const membersSnap = await db.collection('members').get();

    const pendingMembers = [];
    membersSnap.forEach(doc => {
        const m = doc.data();
        if (m.active === false) return; // descartar solo si está explícitamente inactivo
        const mid = String(m.id || doc.id);
        if (!submittedMemberIds.has(mid)) {
            pendingMembers.push({
                id: m.id || doc.id,
                name: m.name || m.phone || `Socio ${m.id || doc.id}`
            });
        }
    });

    console.log(`⚠️ Socios que AÚN NO han rellenado (${pendingMembers.length}):`);
    pendingMembers.forEach(p => console.log(`   - [ID: ${p.id}] ${p.name}`));

    if (pendingMembers.length === 0) {
        console.log('\n🎉 ¡Todos los socios ya han enviado su quiniela! No se requiere recordatorio.');
        return;
    }

    // 5. Obtener tokens FCM de los socios pendientes
    const pendingIdStrings = pendingMembers.map(p => String(p.id));
    const subsSnap = await db.collection('push_subscriptions')
        .where('permission', '==', 'granted')
        .get();

    const targetTokens = [];
    subsSnap.forEach(doc => {
        const data = doc.data();
        const mid = String(data.memberId || doc.id.replace('member_', ''));
        if (pendingIdStrings.includes(mid) && data.fcmToken) {
            targetTokens.push({
                token: data.fcmToken,
                memberId: data.memberId,
                memberName: data.memberName || `Socio ${data.memberId}`,
                docId: doc.id
            });
        }
    });

    console.log(`\n📲 Dispositivos móviles a notificar con Token FCM: ${targetTokens.length}`);

    if (targetTokens.length === 0) {
        console.log('ℹ️ Ningún socio pendiente tiene token FCM registrado en push_subscriptions.');
        return;
    }

    // 6. Preparar y despachar mensajes FCM de alta prioridad
    const title = '⏰ ¡Plazo cierra hoy a las 17:00!';
    const body = `Jornada ${jornadaNum}: aún no has rellenado tu quiniela. ¡Te queda poco tiempo!`;

    const messages = targetTokens.map(({ token }) => ({
        token,
        notification: {
            title,
            body
        },
        data: {
            type: 'reminder',
            jornada: String(jornadaNum),
            url: 'pronosticos_2.html',
            timestamp: String(Date.now())
        },
        android: {
            priority: 'high',
            notification: {
                sound: 'default',
                channelId: 'maulas-default'
            }
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
                requireInteraction: true,
                vibrate: [300, 100, 300, 100, 300]
            },
            headers: {
                Urgency: 'high'
            }
        }
    }));

    console.log('🚀 Enviando notificaciones push a través de Firebase Cloud Messaging...');
    const response = await messaging.sendEach(messages);

    console.log(`\n📊 RESULTADO DEL ENVÍO:`);
    console.log(`   ✅ Enviadas con éxito: ${response.successCount}`);
    console.log(`   ❌ Fallos:             ${response.failureCount}`);

    // Detectar tokens caducados
    const staleDocs = [];
    response.responses.forEach((res, idx) => {
        if (!res.success) {
            const code = res.error && res.error.code;
            console.warn(`   ⚠️ Error en destinatario ${targetTokens[idx].memberName}:`, res.error && res.error.message);
            if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
                staleDocs.push(targetTokens[idx].docId);
            }
        } else {
            console.log(`   📲 Entregada a: ${targetTokens[idx].memberName}`);
        }
    });

    // Limpiar tokens caducados de Firestore
    for (const docId of staleDocs) {
        await db.collection('push_subscriptions').doc(docId).update({
            fcmToken: null,
            permission: 'expired',
            expiredAt: new Date().toISOString()
        });
        console.log(`🧹 Marcado token caducado: ${docId}`);
    }

    // 7. Registrar en push_log para auditoría y control de deduplicación
    await db.collection('push_log').add({
        type: 'thursday_reminder_cron',
        jornada: jornadaNum,
        dateStr: todayMadridStr,
        pendingMembersCount: pendingMembers.length,
        tokensTargeted: targetTokens.length,
        sent: response.successCount,
        failed: response.failureCount,
        sentAt: new Date().toISOString(),
        source: isManualRun ? 'manual-dispatch' : 'github-actions'
    });

    console.log('\n📝 Registro guardado en push_log de Firestore.');
    console.log('🏁 Proceso finalizado correctamente.\n');
}

main().catch(err => {
    console.error('❌ Error fatal en recordatorio de quiniela:', err);
    process.exit(1);
});
