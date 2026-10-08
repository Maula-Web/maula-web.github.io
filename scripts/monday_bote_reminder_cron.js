/**
 * scripts/monday_bote_reminder_cron.js - Cron de Recordatorio de Saldo en Bote
 * ==============================================================================
 * Se ejecuta automáticamente desde GitHub Actions todos los lunes a las 09:00
 * hora peninsular (o manualmente vía workflow_dispatch en la pestaña Actions).
 *
 * Funcionalidad:
 * 1. Conecta con Firestore de maulasweb mediante Service Account.
 * 2. Carga datos contables y calcula el saldo neto acumulado de cada socio (BoteEngine).
 * 3. Filtra socios activos con saldo inferior a 5,00 € (< 5.00).
 * 4. Obtiene los tokens FCM de los dispositivos de esos socios.
 * 5. Envía la notificación push personalizada:
 *    "Te queda poco saldo en el bote de los Maulas (X,XX €). Recuerda hacer un Bizum a Marcelo."
 * 6. Registra el resultado en 'push_log'.
 * ==============================================================================
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const BoteEngine = require('../js/bote-engine');

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

// Formateador de moneda en español (ej: 3,50 € o -1,20 €)
function formatCurrency(val) {
    const num = Number(val) || 0;
    return num.toLocaleString('es-ES', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + ' €';
}

async function main() {
    console.log('\n=============================================================');
    console.log('  🪙 PEÑA MAULAS - RECORDATORIO AUTOMÁTICO DE SALDO DEL BOTE ');
    console.log('=============================================================\n');

    // Comprobación de hora local en Madrid si se ejecuta de forma programada por cron
    const isManualRun = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' || process.argv.includes('--force');
    const madridDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
    const madridDay = madridDate.getDay(); // 1 = Lunes
    const madridHour = madridDate.getHours();
    const todayMadridStr = madridDate.toLocaleDateString('es-ES');

    if (!isManualRun) {
        if (madridDay !== 1) {
            console.log(`ℹ️ Hoy no es lunes en Madrid (día ${madridDay}). Omitiendo.`);
            return;
        }
        // Ventana flexible matinal entre 09:00 y 11:30 para compensar colas de GitHub Actions
        if (madridHour < 9 || (madridHour === 11 && madridDate.getMinutes() > 30) || madridHour > 11) {
            console.log(`ℹ️ Hora actual en Madrid: ${madridHour}:xx. Fuera de la ventana matinal (09:00 - 11:30). Omitiendo.`);
            return;
        }
    }

    const { db, messaging } = initFirebase();

    // 2. Cargar configuración de Bote
    let config = {
        costeColumna: 0.75,
        costeDobles: 12.00,
        aportacionSemanal: 1.50,
        costeExtraExento: 0.20,
        boteInicial: 738.68,
        penalizacionMaula: 1.00,
        penalizacionPIG: 1.00,
        temporadaActual: '2026-2027'
    };

    try {
        const configDoc = await db.collection('config').doc('bote_config').get();
        if (configDoc.exists) {
            config = { ...config, ...configDoc.data() };
            console.log('⚙️ Configuración del bote cargada desde Firestore (config/bote_config).');
        }
    } catch (e) {
        console.warn('⚠️ No se pudo leer config/bote_config, usando configuración predeterminada.');
    }

    // 3. Cargar colecciones contables necesarias para calcular el saldo real
    console.log('📊 Leyendo colecciones contables de Firestore...');
    const [
        membersSnap,
        jornadasSnap,
        pronosticosSnap,
        pronosticosExtraSnap,
        repartosSnap,
        cierresVueltaSnap,
        ingresosSnap,
        cashPaymentsSnap
    ] = await Promise.all([
        db.collection('members').get(),
        db.collection('jornadas').get(),
        db.collection('pronosticos').get(),
        db.collection('pronosticos_extra').get().catch(() => ({ docs: [] })),
        db.collection('repartos').get().catch(() => ({ docs: [] })),
        db.collection('cierres_vuelta').get().catch(() => ({ docs: [] })),
        db.collection('ingresos').get().catch(() => ({ docs: [] })),
        db.collection('reembolsos_efectivo').get().catch(() => ({ docs: [] }))
    ]);

    const members = [];
    membersSnap.forEach(doc => {
        const d = doc.data();
        members.push({ ...d, id: d.id || doc.id });
    });

    const activeSeason = config.temporadaActual || '2026-2027';
    const jornadas = [];
    jornadasSnap.forEach(doc => {
        const d = doc.data();
        if ((d.season || '2026-2027') === activeSeason) {
            jornadas.push({ ...d, id: d.id || doc.id });
        }
    });

    const pronosticos = [];
    pronosticosSnap.forEach(doc => pronosticos.push(doc.data()));

    const pronosticosExtra = [];
    (pronosticosExtraSnap.docs || []).forEach(doc => pronosticosExtra.push(doc.data()));

    const repartos = [];
    (repartosSnap.docs || []).forEach(doc => repartos.push(doc.data()));

    const cierresVuelta = [];
    (cierresVueltaSnap.docs || []).forEach(doc => cierresVuelta.push(doc.data()));

    const ingresos = [];
    (ingresosSnap.docs || []).forEach(doc => ingresos.push(doc.data()));

    const cashPayments = [];
    (cashPaymentsSnap.docs || []).forEach(doc => cashPayments.push(doc.data()));

    console.log(`✅ Datos leídos: ${members.length} socios, ${jornadas.length} jornadas, ${pronosticos.length} pronósticos.`);

    // 4. Calcular movimientos mediante BoteEngine
    const engine = new BoteEngine(config);
    const movements = engine.calculateAllMovements(
        members,
        jornadas,
        pronosticos,
        pronosticosExtra,
        repartos,
        cierresVuelta,
        ingresos,
        cashPayments
    );

    // Obtener último saldo acumulado de cada socio
    const memberBalances = new Map();
    members.forEach(m => {
        const midStr = String(m.id);
        const mMovements = movements.filter(mov => String(mov.memberId) === midStr);
        let finalBalance = 0;
        if (mMovements.length > 0) {
            finalBalance = mMovements[mMovements.length - 1].boteAcumulado || 0;
        }
        memberBalances.set(midStr, {
            id: m.id,
            name: m.name || `Socio ${m.id}`,
            active: m.active !== false,
            balance: finalBalance
        });
    });

    // 5. Filtrar socios con menos de 5,00 €
    const UMBRAL_ALERTA = 5.00;
    const targetMembers = [];
    for (const [mid, data] of memberBalances.entries()) {
        if (!data.active) continue;
        // Se excluye al propio Marcelo (ID 14) de recibir auto-aviso de Bizum a sí mismo si fuera el caso
        if (String(data.id) === '14' || (data.name && data.name.toLowerCase().includes('marcelo'))) {
            continue;
        }
        if (data.balance < UMBRAL_ALERTA) {
            targetMembers.push(data);
        }
    }

    console.log(`\n🔍 Socios activos con saldo menor a ${formatCurrency(UMBRAL_ALERTA)} (${targetMembers.length}):`);
    targetMembers.forEach(s => {
        console.log(`   - [ID: ${s.id}] ${s.name}: ${formatCurrency(s.balance)}`);
    });

    if (targetMembers.length === 0) {
        console.log('\n🎉 ¡Ningún socio tiene saldo por debajo de 5,00 €! No se requieren notificaciones.');
        return;
    }

    // 6. Obtener tokens FCM suscritos
    const targetIds = targetMembers.map(t => String(t.id));
    const subsSnap = await db.collection('push_subscriptions')
        .where('permission', '==', 'granted')
        .get();

    const notificationsToSend = [];
    subsSnap.forEach(doc => {
        const sub = doc.data();
        const mid = String(sub.memberId || doc.id.replace('member_', ''));
        if (targetIds.includes(mid) && sub.fcmToken) {
            const memberInfo = targetMembers.find(t => String(t.id) === mid);
            if (memberInfo) {
                notificationsToSend.push({
                    token: sub.fcmToken,
                    docId: doc.id,
                    memberId: mid,
                    memberName: memberInfo.name,
                    balance: memberInfo.balance
                });
            }
        }
    });

    console.log(`\n📲 Dispositivos móviles registrados a notificar: ${notificationsToSend.length}`);

    if (notificationsToSend.length === 0) {
        console.log('ℹ️ Ninguno de los socios con saldo bajo tiene token FCM registrado en push_subscriptions.');
        return;
    }

    // 7. Preparar y despachar mensajes FCM
    const messages = notificationsToSend.map(item => {
        const saldoFormateado = formatCurrency(item.balance);
        const title = '🪙 Aviso de Bote - Peña Maulas';
        const body = `Te queda poco saldo en el bote de los Maulas (${saldoFormateado}). Recuerda hacer un Bizum a Marcelo.`;

        return {
            token: item.token,
            notification: {
                title,
                body
            },
            data: {
                type: 'bote_low_balance',
                memberId: String(item.memberId),
                balance: String(item.balance),
                url: 'bote_2.html',
                timestamp: String(Date.now())
            },
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'maulas-bote'
                }
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1,
                        contentAvailable: true
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
                    vibrate: [200, 100, 200]
                },
                headers: {
                    Urgency: 'high'
                }
            }
        };
    });

    console.log('🚀 Despachando notificaciones push a través de Firebase Cloud Messaging...');
    const response = await messaging.sendEach(messages);

    console.log(`\n📊 RESULTADO DEL ENVÍO:`);
    console.log(`   ✅ Enviadas con éxito: ${response.successCount}`);
    console.log(`   ❌ Fallos:             ${response.failureCount}`);

    // Detección de tokens obsoletos
    const staleDocs = [];
    response.responses.forEach((res, idx) => {
        if (!res.success) {
            const code = res.error && res.error.code;
            console.warn(`   ⚠️ Error en socio ${notificationsToSend[idx].memberName}:`, res.error && res.error.message);
            if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
                staleDocs.push(notificationsToSend[idx].docId);
            }
        } else {
            console.log(`   📲 Entregada a: ${notificationsToSend[idx].memberName} (${formatCurrency(notificationsToSend[idx].balance)})`);
        }
    });

    // Limpieza de tokens en Firestore
    for (const docId of staleDocs) {
        await db.collection('push_subscriptions').doc(docId).update({
            fcmToken: null,
            permission: 'expired',
            expiredAt: new Date().toISOString()
        });
        console.log(`🧹 Token caducado limpiado: ${docId}`);
    }

    // 8. Registro de auditoría en push_log
    await db.collection('push_log').add({
        type: 'monday_bote_reminder_cron',
        threshold: UMBRAL_ALERTA,
        affectedMembersCount: targetMembers.length,
        devicesTargeted: notificationsToSend.length,
        sent: response.successCount,
        failed: response.failureCount,
        sentAt: new Date().toISOString(),
        source: 'github-actions'
    });

    console.log('\n📝 Registro guardado en push_log de Firestore.');
    console.log('🏁 Proceso finalizado correctamente.\n');
}

main().catch(err => {
    console.error('❌ Error fatal en recordatorio de bote:', err);
    process.exit(1);
});
