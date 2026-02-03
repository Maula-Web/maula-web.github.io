const fs = require('fs');
const https = require('https');
const path = require('path');

/**
 * Script "Blindado" para descargar resultados de La Quiniela
 * Priorizando El País por su estabilidad y archivos históricos.
 */

const RSS_SOURCES = [
    // 1. El País (Página de resultados con históricos)
    'https://servicios.elpais.com/sorteos/quiniela/',
    // 2. ABC (RSS Clásico)
    'https://servicios.abc.es/loteria/quiniela/rss.xml',
    // 3. Oficial (Backup)
    'https://www.loteriasyapuestas.es/es/la-quiniela/resultados/.formatoRSS'
];

const PDF_URL = 'https://www.loteriasyapuestas.es/f/loterias/documentos/Quiniela/Calendarios/Proximas_jornadas_deportivas.pdf';

const DATA_DIR = path.join(__dirname, '../datos_auxiliares');
const RSS_PATH = path.join(DATA_DIR, 'rss_cache.xml');
const PDF_PATH = path.join(DATA_DIR, 'proximas_jornadas.pdf');
const METADATA_PATH = path.join(DATA_DIR, 'external_data_metadata.json');

// Asegurar que el directorio existe
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

async function downloadFile(url, dest, useProxy = false) {
    let finalUrl = url;
    if (useProxy) {
        finalUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    }

    return new Promise((resolve, reject) => {
        console.log(`Descargando: ${url}${useProxy ? ' (via Proxy)' : ''}...`);

        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'es-ES,es;q=0.9',
                'Cache-Control': 'no-cache'
            },
            timeout: 15000
        };

        const request = https.get(finalUrl, options, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                console.log(`Redirigiendo a: ${response.headers.location}`);
                return downloadFile(response.headers.location, dest, false).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                return reject(new Error(`Status ${response.statusCode}`));
            }

            const file = fs.createWriteStream(dest);
            response.pipe(file);

            file.on('finish', () => {
                file.close();
                const stats = fs.statSync(dest);
                console.log(`Guardado: ${path.basename(dest)} (${stats.size} bytes)`);
                resolve();
            });
        });

        request.on('error', reject);
        request.on('timeout', () => { request.destroy(); reject(new Error('Timeout')); });
    });
}

async function main() {
    const results = {
        rss: false,
        pdf: false,
        timestamp: new Date().toISOString(),
        source: null
    };

    // 1. Intentar descargar Resultados (RSS o HTML de El País)
    for (const url of RSS_SOURCES) {
        try {
            await downloadFile(url, RSS_PATH);
            results.rss = true;
            results.source = url;
            break;
        } catch (e) {
            console.warn(`Fallo Directo (${url}): ${e.message}. Probando Proxy...`);
            try {
                await downloadFile(url, RSS_PATH, true);
                results.rss = true;
                results.source = url;
                break;
            } catch (e2) {
                console.error(`Fallo Proxy (${url}): ${e2.message}`);
            }
        }
    }

    // 2. Intentar descargar PDF
    try {
        await downloadFile(PDF_URL, PDF_PATH);
        results.pdf = true;
    } catch (e) {
        console.warn(`Fallo PDF Directo: ${e.message}. Probando Proxy...`);
        try {
            await downloadFile(PDF_URL, PDF_PATH, true);
            results.pdf = true;
        } catch (e2) {
            console.error(`Fallo PDF Proxy: ${e2.message}`);
        }
    }

    fs.writeFileSync(METADATA_PATH, JSON.stringify(results, null, 2));

    if (results.rss || results.pdf) {
        console.log('✅ Actualización completada.');
    } else {
        console.error('❌ Error crítico: Todas las fuentes han fallado.');
        process.exit(1);
    }
}

main();
