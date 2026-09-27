/**
 * send_push.js - Utilidad Oficial de Notificaciones Push para Peña Maulas
 * =========================================================================
 * Inspecciona las suscripciones de los socios en Firestore (Apple APNs y Google FCM)
 * y facilita el envío y comprobación de notificaciones push en dispositivos móviles
 * incluso con la aplicación 100% CERRADA y la pantalla apagada.
 * =========================================================================
 * Uso:
 *   node scripts/send_push.js                   # Muestra estado y tokens de socios
 *   node scripts/send_push.js --to 6            # Inspecciona dispositivo de Fernando Lozano
 *   node scripts/send_push.js --to 8            # Inspecciona dispositivo de Heradio
 *   node scripts/send_push.js --to 6 --test     # Prepara mensaje de prueba oficial
 * =========================================================================
 */

let webpush = null;
try {
    webpush = require('web-push');
} catch (e) {}

const PROJECT_ID = 'maulasweb';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/push_subscriptions`;
const FCM_VAPID_PUBLIC_KEY = 'BOX8-fovp0YY2MfIMJjL2c76KvzwRg8EBKm-P40NcU0SDKg7Y269-J3hg5AEqRpTrq5sgmTNDTid1InSWBStiLQ';

function parseFirestoreValue(val) {
    if (!val || typeof val !== 'object') return val;
    if ('stringValue' in val) return val.stringValue;
    if ('integerValue' in val) return parseInt(val.integerValue, 10);
    if ('doubleValue' in val) return parseFloat(val.doubleValue);
    if ('booleanValue' in val) return val.booleanValue;
    if ('timestampValue' in val) return val.timestampValue;
    if ('nullValue' in val) return null;
    if ('arrayValue' in val) return (val.arrayValue.values || []).map(parseFirestoreValue);
    if ('mapValue' in val) {
        const fields = val.mapValue.fields || {};
        const res = {};
        for (const [k, v] of Object.entries(fields)) {
            res[k] = parseFirestoreValue(v);
        }
        return res;
    }
    return val;
}

async function getSubscriptions() {
    try {
        const res = await fetch(FIRESTORE_URL);
        if (!res.ok) {
            throw new Error(`Error HTTP Firestore: ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        const docs = data.documents || [];
        const subscriptions = {};

        for (const doc of docs) {
            const docId = doc.name.split('/').pop();
            const fields = doc.fields || {};
            const parsed = {};
            for (const [k, v] of Object.entries(fields)) {
                parsed[k] = parseFirestoreValue(v);
            }
            subscriptions[docId] = parsed;
        }

        return subscriptions;
    } catch (err) {
        console.error('❌ Error al obtener suscripciones de Firestore:', err.message);
        return null;
    }
}

async function main() {
    const args = process.argv.slice(2);
    let targetMember = null;
    let customMessage = '¡Prueba oficial de Peña Maulas con la app cerrada!';
    let isTest = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--to' && args[i + 1]) {
            targetMember = args[i + 1].trim();
            i++;
        } else if (args[i] === '--message' && args[i + 1]) {
            customMessage = args[i + 1];
            i++;
        } else if (args[i] === '--test') {
            isTest = true;
        } else if (args[i] === '--help' || args[i] === '-h') {
            console.log(`
Uso de send_push.js:
  node scripts/send_push.js             Listar todos los terminales registrados
  node scripts/send_push.js --to 6      Ver detalles y Token FCM de Fernando Lozano
  node scripts/send_push.js --to 8      Ver detalles y Token FCM de Heradio
  node scripts/send_push.js --to 6 --message "Texto de aviso"
            `);
            return;
        }
    }

    console.log('\n=============================================================');
    console.log('       ⚽ PEÑA MAULAS - SISTEMA DE NOTIFICACIONES PUSH       ');
    console.log('=============================================================\n');

    console.log('📡 Consultando dispositivos registrados en Firebase Firestore...');
    const subs = await getSubscriptions();

    if (!subs) {
        console.log('⚠️ No se pudieron cargar las suscripciones.');
        return;
    }

    const memberIds = Object.keys(subs);
    if (memberIds.length === 0) {
        console.log('ℹ️ No hay suscripciones registradas aún en Firestore (push_subscriptions).');
        return;
    }

    console.log(`✅ Dispositivos registrados en base de datos: ${memberIds.length}\n`);

    for (const [docId, sub] of Object.entries(subs)) {
        const id = sub.memberId || docId.replace('member_', '');
        const name = sub.memberName || 'Desconocido';
        const platform = sub.platform || (/iPhone|iPad/.test(sub.userAgent || '') ? 'iOS (iPhone)' : 'Android / Web');
        const isStandalone = sub.isStandalone ? '📱 App Instalada (PWA Standalone)' : '🌐 Navegador Web';
        const token = sub.fcmToken ? `${sub.fcmToken.substring(0, 24)}...${sub.fcmToken.slice(-12)}` : '❌ Sin Token FCM';
        const updated = sub.updatedAt || sub.fcmUpdatedAt || 'Fecha desconocida';

        console.log(`-------------------------------------------------------------`);
        console.log(`👤 Socio: [ID: ${id}] ${name}`);
        console.log(`   📱 Plataforma:  ${platform}`);
        console.log(`   📦 Modo:        ${isStandalone}`);
        console.log(`   🔑 Token FCM:   ${token}`);
        console.log(`   🕒 Actualizado: ${updated}`);

        if (targetMember && (targetMember === String(id) || targetMember.toLowerCase() === name.toLowerCase())) {
            console.log(`\n   ⭐ TOKEN COMPLETO PARA PRUEBA:`);
            console.log(`   ${sub.fcmToken}`);
            console.log(`\n   📋 Pauta para probar con la app 100% CERRADA:`);
            console.log(`   1. Copia el token completo de arriba.`);
            console.log(`   2. Abre Firebase Console: https://console.firebase.google.com/project/maulasweb/notification`);
            console.log(`   3. Pulsa "Nueva campaña" > "Mensajes de notificación de Firebase".`);
            console.log(`   4. Título: "⚽ Peña Maulas" | Texto: "${customMessage}".`);
            console.log(`   5. Pulsa "Enviar mensaje de prueba", pega el token y haz clic en "Probar".`);
            console.log(`   6. ¡El teléfono sonará y se encenderá incluso totalmente apagado o cerrado!`);
        }
    }
    console.log(`-------------------------------------------------------------\n`);
}

main();
