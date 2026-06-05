/**
 * SCRIPT DE MIGRACIÓN A TEMPORADA 2026-2027
 * ==========================================
 * Instrucciones:
 *   1. Abrir admin.html en el navegador (con sesión iniciada)
 *   2. Abrir la consola del desarrollador (F12 → Console)
 *   3. Pegar y ejecutar este script
 *
 * ESTE SCRIPT NO BORRA NINGÚN DATO HISTÓRICO.
 * Solo actualiza la configuración de temporada activa y el bote.
 */

(async function migrarTemporada() {
    console.log('🚀 Iniciando migración a temporada 2026-2027...');

    try {
        // 1. Actualizar temporada activa en Firestore
        await db.collection('config').doc('active_season').set({
            id: '2026-2027',
            updatedAt: new Date().toISOString()
        });
        console.log('✅ active_season → 2026-2027');

        // 2. Actualizar bote_config (temporada y bote inicial a 0)
        //    Si el documento ya existe, hacemos update; si no, set.
        const boteConfigRef = db.collection('config').doc('bote_config');
        const boteConfigSnap = await boteConfigRef.get();

        if (boteConfigSnap.exists) {
            await boteConfigRef.update({
                temporadaActual: '2026-2027',
                boteInicial: 0
            });
        } else {
            await boteConfigRef.set({
                id: 'bote_config',
                temporadaActual: '2026-2027',
                boteInicial: 0,
                costeColumna: 0.75,
                costeDobles: 12.00,
                aportacionSemanal: 1.50
            });
        }
        console.log('✅ bote_config → temporadaActual: 2026-2027, boteInicial: 0');

        // 3. Verificación: mostrar lo que hay en Firestore ahora
        const activeSeason = await db.collection('config').doc('active_season').get();
        const boteConfig = await db.collection('config').doc('bote_config').get();

        console.log('📋 Estado actual en Firestore:');
        console.log('   active_season:', activeSeason.data());
        console.log('   bote_config:', boteConfig.data());

        console.log('');
        console.log('🎉 Migración completada con éxito.');
        console.log('   → Recarga la página para que surta efecto.');
        console.log('   → Los datos históricos de 2025-2026 siguen accesibles en el selector de temporadas.');

    } catch (e) {
        console.error('❌ Error en la migración:', e);
        console.error('   Asegúrate de ejecutar este script desde admin.html con sesión iniciada.');
    }
})();
