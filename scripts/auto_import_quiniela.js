/**
 * scripts/auto_import_quiniela.js - Importador automático de Resultados y Premios
 * ==============================================================================
 * Puede ejecutarse:
 * 1. Desde GitHub Actions (los domingos noche / lunes mañana).
 * 2. Desde la consola local: `node scripts/auto_import_quiniela.js`
 * 3. Con doble clic en Windows usando `actualizar_quiniela.bat`.
 * ==============================================================================
 */

const { fetchLatestQuiniela } = require('../functions/quinielaScraper');
const fs = require('fs');
const path = require('path');

async function run() {
    console.log('====================================================');
    console.log('⚽ PEÑA MAULAS - AUTO-IMPORTADOR OFICIAL DE QUINIELA');
    console.log('====================================================');
    console.log('🔍 Consultando fuentes oficiales en internet (El País / RTVE)...');

    try {
        const scraped = await fetchLatestQuiniela();
        console.log(`\n✅ Datos obtenidos con éxito desde: ${scraped.source}`);
        console.log(`📅 Fecha de jornada: ${scraped.dateStr}`);
        console.log(`🔢 Partidos escrutados: ${scraped.matches.length}/15`);

        console.log('\n--- PARTIDOS Y RESULTADOS ---');
        scraped.matches.forEach((m, idx) => {
            const numLabel = idx === 14 ? 'P15' : String(m.num).padStart(2, ' ');
            console.log(`  [${numLabel}] ${(m.home + ' vs ' + m.away).padEnd(35, ' ')} -> ${m.result}`);
        });

        console.log('\n--- REPARTO OFICIAL DE PREMIOS ---');
        if (scraped.prizesDetails && scraped.prizesDetails.length > 0) {
            scraped.prizesDetails.forEach(p => {
                console.log(`  • ${p.label.padEnd(20, ' ')} : ${p.winners} acertantes | ${p.amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`);
            });
        } else {
            Object.keys(scraped.prizes).forEach(k => {
                console.log(`  • Cat ${k}: ${scraped.prizes[k]} €`);
            });
        }

        // Si existe configuración de Firebase Admin, conectar y actualizar Firestore
        let serviceAccount = null;
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            try {
                serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            } catch (e) {
                console.warn('⚠️ No se pudo parsear FIREBASE_SERVICE_ACCOUNT');
            }
        }

        if (serviceAccount) {
            const { initializeApp, cert } = require('firebase-admin/app');
            const { getFirestore } = require('firebase-admin/firestore');

            const app = initializeApp({ credential: cert(serviceAccount) });
            const db = getFirestore(app);

            console.log('\n📡 Conectando con Firestore...');
            const snap = await db.collection('jornadas').where('active', '==', true).get();

            let targetDoc = null;
            let targetData = null;

            snap.forEach(doc => {
                const j = doc.data();
                const filled = (j.matches || []).filter(m => m.result && m.result !== '').length;
                if (filled < 15 && !targetDoc) {
                    targetDoc = doc;
                    targetData = j;
                }
            });

            if (targetDoc) {
                console.log(`📝 Actualizando Jornada ${targetData.number} (${targetDoc.id})...`);
                const updatedMatches = (targetData.matches || []).map((m, idx) => {
                    const sc = scraped.matches[idx];
                    return {
                        ...m,
                        result: (sc && sc.result) ? sc.result : (m.result || '')
                    };
                });

                await targetDoc.ref.update({
                    matches: updatedMatches,
                    prizes: scraped.prizes || {},
                    prizesDetails: scraped.prizesDetails || [],
                    autoImportedAt: new Date().toISOString(),
                    importedSource: scraped.source
                });
                console.log(`🎉 ¡Jornada ${targetData.number} actualizada en Firestore con éxito!`);
            } else {
                console.log('ℹ️ No hay jornadas activas pendientes de resultados en Firestore.');
            }
        } else {
            // Guardar copia local en JSON por seguridad
            const outDir = path.join(__dirname, '../datos_auxiliares');
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
            const outFile = path.join(outDir, 'ultimo_escrutinio_oficial.json');
            fs.writeFileSync(outFile, JSON.stringify(scraped, null, 2), 'utf-8');
            console.log(`\n💾 Escrutinio guardado localmente en: ${outFile}`);
        }

        console.log('\n✨ Proceso de resultados completado.');

        // =========================================================================
        // PASO 2: COMPROBAR E INCORPORAR PRÓXIMAS JORNADAS (REGLAS: DOMINGO + 1ª DIV)
        // =========================================================================
        console.log('\n----------------------------------------------------');
        console.log('📅 COMPROBANDO PRÓXIMAS JORNADAS OFICIALES...');
        console.log('----------------------------------------------------');

        const { fetchUpcomingQuinielaJornadas } = require('../functions/quinielaScraper');
        if (typeof fetchUpcomingQuinielaJornadas === 'function') {
            const upcomingList = await fetchUpcomingQuinielaJornadas();
            console.log(`ℹ️ Detectadas ${upcomingList.length} jornadas válidas en el calendario (domingo + 1ª división).`);

            if (serviceAccount && upcomingList.length > 0) {
                const { getFirestore } = require('firebase-admin/firestore');
                const db = getFirestore();
                const allSnap = await db.collection('jornadas').get();
                const existingNumbers = new Set();
                allSnap.forEach(doc => {
                    const data = doc.data();
                    if (data && data.number) existingNumbers.add(parseInt(data.number, 10));
                });

                for (const uJ of upcomingList) {
                    if (!existingNumbers.has(uJ.number)) {
                        console.log(`🆕 Incorporando automáticamente nueva Jornada ${uJ.number} (${uJ.dateStr})...`);
                        const newDocRef = db.collection('jornadas').doc();
                        await newDocRef.set({
                            id: Date.now() + uJ.number,
                            number: uJ.number,
                            season: uJ.season || '2026-2027',
                            date: uJ.dateStr,
                            active: true,
                            matches: uJ.matches,
                            prizes: {},
                            autoCreated: true,
                            createdAt: new Date().toISOString()
                        });
                        console.log(`✅ Jornada ${uJ.number} guardada en Firestore.`);
                    } else {
                        console.log(`✓ Jornada ${uJ.number} ya existe en Firestore.`);
                    }
                }
            }

            // Guardar copia local en JSON
            const outDir = path.join(__dirname, '../datos_auxiliares');
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
            const outFile = path.join(outDir, 'proximas_jornadas_cache.json');
            fs.writeFileSync(outFile, JSON.stringify(upcomingList, null, 2), 'utf-8');
            console.log(`💾 Calendario de próximas jornadas guardado en: ${outFile}`);
        }

        console.log('\n✨ Auto-importación total completada con éxito.');
    } catch (err) {
        console.error('\n❌ ERROR durante la ejecución:', err.message);
        process.exit(1);
    }
}

run();
