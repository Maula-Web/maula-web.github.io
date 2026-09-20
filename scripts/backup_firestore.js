/**
 * backup_firestore.js
 * Script para descargar una copia completa de todas las colecciones de Firebase Firestore
 * de la Peña Maulas en formato JSON legible y estructurado.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'maulasweb';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const COLLECTIONS = [
    'members',
    'jornadas',
    'pronosticos',
    'bote',
    'ingresos',
    'cierres_vuelta',
    'repartos',
    'votaciones',
    'logs',
    'config',
    'documents',
    'docs',
    'maulas_members',
    'maulas_jornadas',
    'maulas_pronosticos',
    'maulas_logs',
    'maulas_docs'
];

/**
 * Convierte un valor de Firestore REST a tipo JS estándar
 */
function parseFirestoreValue(val) {
    if (!val || typeof val !== 'object') return val;
    if ('stringValue' in val) return val.stringValue;
    if ('integerValue' in val) return parseInt(val.integerValue, 10);
    if ('doubleValue' in val) return parseFloat(val.doubleValue);
    if ('booleanValue' in val) return val.booleanValue;
    if ('timestampValue' in val) return val.timestampValue;
    if ('nullValue' in val) return null;
    if ('arrayValue' in val) {
        const values = val.arrayValue.values || [];
        return values.map(parseFirestoreValue);
    }
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

/**
 * Convierte un documento Firestore completo a objeto JS
 */
function parseFirestoreDocument(doc) {
    const id = doc.name ? doc.name.split('/').pop() : null;
    const data = { _id: id };
    if (doc.createTime) data._createTime = doc.createTime;
    if (doc.updateTime) data._updateTime = doc.updateTime;

    const fields = doc.fields || {};
    for (const [key, val] of Object.entries(fields)) {
        data[key] = parseFirestoreValue(val);
    }
    return data;
}

/**
 * Descarga todos los documentos de una colección manejando paginación
 */
async function fetchCollection(collectionName) {
    let documents = [];
    let pageToken = '';

    while (true) {
        let url = `${BASE_URL}/${collectionName}?pageSize=300`;
        if (pageToken) {
            url += `&pageToken=${encodeURIComponent(pageToken)}`;
        }

        try {
            const resp = await fetch(url);
            if (!resp.ok) {
                if (resp.status === 404) {
                    return [];
                }
                const errText = await resp.text();
                throw new Error(`HTTP ${resp.status}: ${errText}`);
            }

            const data = await resp.json();
            if (data.documents && Array.isArray(data.documents)) {
                documents.push(...data.documents);
            }

            if (data.nextPageToken) {
                pageToken = data.nextPageToken;
            } else {
                break;
            }
        } catch (err) {
            console.error(`  ⚠️ Error descargando '${collectionName}':`, err.message);
            break;
        }
    }

    return documents;
}

async function runBackup() {
    console.log("==================================================");
    console.log("📦 INICIANDO COPIA DE SEGURIDAD DE FIREBASE FIRESTORE");
    console.log(`Proyecto: ${PROJECT_ID}`);
    console.log("==================================================");

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const backupDir = path.resolve(__dirname, '..', `BACKUP_DATOS_${dateStr}`);

    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const summary = {
        projectId: PROJECT_ID,
        backupDate: now.toISOString(),
        backupDir: backupDir,
        collections: {}
    };

    let totalDocs = 0;

    for (const col of COLLECTIONS) {
        process.stdout.write(`Descargando '${col}'... `);
        const rawDocs = await fetchCollection(col);

        if (rawDocs.length === 0) {
            console.log("0 documentos (vacía o no existe)");
            summary.collections[col] = { count: 0 };
            continue;
        }

        const parsedDocs = rawDocs.map(parseFirestoreDocument);
        totalDocs += parsedDocs.length;

        // Guardar archivo JSON estructurado y limpio
        const filePath = path.join(backupDir, `${col}.json`);
        fs.writeFileSync(filePath, JSON.stringify(parsedDocs, null, 2), 'utf8');

        console.log(`✅ ${parsedDocs.length} documentos guardados en ${col}.json`);
        summary.collections[col] = {
            count: parsedDocs.length,
            file: `${col}.json`
        };
    }

    // Guardar resumen
    summary.totalDocuments = totalDocs;
    const summaryPath = path.join(backupDir, 'resumen_backup.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

    console.log("==================================================");
    console.log(`🎉 COPIA DE SEGURIDAD COMPLETADA CON ÉXITO`);
    console.log(`Total documentos descargados: ${totalDocs}`);
    console.log(`Directorio de respaldo: ${backupDir}`);
    console.log("==================================================");
}

runBackup().catch(err => {
    console.error("❌ Error general en la copia de seguridad:", err);
    process.exit(1);
});
