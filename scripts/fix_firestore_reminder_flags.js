const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountRaw) {
    console.error('❌ Falta FIREBASE_SERVICE_ACCOUNT');
    process.exit(1);
}

let serviceAccount;
try {
    serviceAccount = JSON.parse(serviceAccountRaw);
} catch (e) {
    console.error('❌ Error parseando service account:', e.message);
    process.exit(1);
}

const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

async function run() {
    console.log('🔄 Actualizando marcas de recordatorio en Firestore...');
    const madridDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
    const todayMadridStr = madridDate.toLocaleDateString('es-ES');

    // 1. Marcar todas las jornadas activas con thursdayReminderSent: true y thursdayReminderDate
    const snap = await db.collection('jornadas').where('active', '==', true).get();
    console.log(`Encontradas ${snap.size} jornadas activas.`);
    for (const doc of snap.docs) {
        const j = doc.data();
        await doc.ref.update({
            thursdayReminderSent: true,
            thursdayReminderDate: todayMadridStr
        });
        console.log(`✅ Jornada ${j.number || doc.id} actualizada: thursdayReminderSent=true, thursdayReminderDate=${todayMadridStr}`);
    }

    // 2. Registrar en push_log para garantizar bloqueo de duplicados
    await db.collection('push_log').add({
        type: 'telegram_thursday_reminder',
        jornada: 20,
        dateStr: todayMadridStr,
        sentAt: new Date().toISOString(),
        source: 'hotfix-flag-cleanup',
        notes: 'Marcado preventivo global para bloquear reenvios desde navegadores'
    });

    await db.collection('push_log').add({
        type: 'telegram_thursday_reminder',
        jornada: 21,
        dateStr: todayMadridStr,
        sentAt: new Date().toISOString(),
        source: 'hotfix-flag-cleanup',
        notes: 'Marcado preventivo global para bloquear reenvios desde navegadores'
    });

    console.log('🏁 Limpieza completada con éxito.');
}

run().then(() => process.exit(0)).catch(err => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});
