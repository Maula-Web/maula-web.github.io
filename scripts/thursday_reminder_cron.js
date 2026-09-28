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

async function main() {
    console.log('\n=============================================================');
    console.log('  ⚽ PEÑA MAULAS - RECORDATORIO AUTOMÁTICO DE QUINIELA JUEVES ');
    console.log('=============================================================\n');

    // Comprobación de hora local en Madrid (para ajustar horario de verano/invierno si es automático)
    const isManualRun = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' || process.argv.includes('--force');
    if (!isManualRun) {
        const madridDateStr = new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' });
        const madridHour = new Date(madridDateStr).getHours();
        if (madridHour !== 16) {
            console.log(`ℹ️ Hora actual en Madrid: ${madridHour}:xx. El recordatorio solo se ejecuta a las 16:xx. Omitiendo.`);
            return;
        }
    }

    const { db, messaging } = initFirebase();

    // 2. Buscar jornada activa pendiente de resultados
    console.log('📅 Buscando jornada activa...');
    const jornadasSnap = await db.collection('jornadas')
        .where('active', '==', true)
        .orderBy('number', 'asc')
        .get();

    let targetJornada = null;
    jornadasSnap.forEach(doc => {
        if (targetJornada) return;
        const j = doc.data();
        const matches = j.matches || [];
        const filled = matches.filter(m => m.result && m.result !== '').length;
        if (filled < 15) {
            targetJornada = j;
        }
    });

    if (!targetJornada) {
        console.log('ℹ️ No hay ninguna jornada activa pendiente de rellenar. Finalizando sin envíos.');
        return;
    }

    const jornadaNum = targetJornada.number;
    console.log(`✅ Jornada activa seleccionada: Jornada ${jornadaNum} (Fecha: ${targetJornada.date || 'Sin fecha'})`);

    // 3. Obtener socios que YA han enviado sus pronósticos
    const pronosticosSnap = await db.collection('pronosticos')
        .where('jornada', '==', jornadaNum)
        .get();

    const submittedMemberIds = new Set();
    pronosticosSnap.forEach(doc => {
        const mid = doc.data().memberId;
        if (mid !== undefined && mid !== null) {
            submittedMemberIds.add(String(mid));
        }
    });

    console.log(`📋 Pronósticos ya recibidos para Jornada ${jornadaNum}: ${submittedMemberIds.size} socios.`);

    // 4. Obtener todos los socios activos
    const membersSnap = await db.collection('members')
        .where('active', '==', true)
        .get();

    const pendingMembers = [];
    membersSnap.forEach(doc => {
        const m = doc.data();
        const mid = String(m.id);
        if (!submittedMemberIds.has(mid)) {
            pendingMembers.push({
                id: m.id,
                name: m.name || m.phone || `Socio ${m.id}`
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
    const pendingIds = pendingMembers.map(p => Number(p.id));
    const subsSnap = await db.collection('push_subscriptions')
        .where('permission', '==', 'granted')
        .get();

    const targetTokens = [];
    subsSnap.forEach(doc => {
        const data = doc.data();
        const mid = Number(data.memberId);
        if (pendingIds.includes(mid) && data.fcmToken) {
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

    // 7. Registrar en push_log para auditoría
    await db.collection('push_log').add({
        type: 'thursday_reminder_cron',
        jornada: jornadaNum,
        pendingMembersCount: pendingMembers.length,
        tokensTargeted: targetTokens.length,
        sent: response.successCount,
        failed: response.failureCount,
        sentAt: new Date().toISOString(),
        source: 'github-actions'
    });

    console.log('\n📝 Registro guardado en push_log de Firestore.');
    console.log('🏁 Proceso finalizado correctamente.\n');
}

main().catch(err => {
    console.error('❌ Error fatal en recordatorio de quiniela:', err);
    process.exit(1);
});
