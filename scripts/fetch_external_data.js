const fs = require('fs');
const https = require('https');
const path = require('path');

// Fuentes alternativas para los resultados (RSS)
const RSS_SOURCES = [
    'https://www.loteriasyapuestas.es/es/la-quiniela/resultados/.formatoRSS',
    'https://servicios.abc.es/loteria/quiniela/rss.xml',
    'http://api.elpais.com/ws/LoteriaQuiniela/1.0/'
];

// PDF oficial (intentaremos via proxy si falla directo)
const PDF_URL = 'https://www.loteriasyapuestas.es/f/loterias/documentos/Quiniela/Calendarios/Proximas_jornadas_deportivas.pdf';

const DATA_DIR = path.join(__dirname, '../datos_auxiliares');
const RSS_PATH = path.join(DATA_DIR, 'rss_cache.xml');
const PDF_PATH = path.join(DATA_DIR, 'proximas_jornadas.pdf');
const METADATA_PATH = path.join(DATA_DIR, 'external_data_metadata.json');

async function downloadFile(url, dest, useProxy = false) {
    if (useProxy) {
        url = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    }

    return new Promise((resolve, reject) => {
        console.log(`Downloading ${url}${useProxy ? ' (via Proxy)' : ''}...`);

        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'es-ES,es;q=0.9',
                'Cache-Control': 'no-cache'
            },
            timeout: 20000
        };

        const request = https.get(url, options, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                return downloadFile(response.headers.location, dest, false).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                return reject(new Error(`Status ${response.statusCode}`));
            }

            const file = fs.createWriteStream(dest);
            response.pipe(file);

            file.on('finish', () => {
                file.close();
                console.log(`Success: ${path.basename(dest)}`);
                resolve();
            });
        });

        request.on('error', reject);
        request.on('timeout', () => { request.destroy(); reject(new Error('Timeout')); });
    });
}

async function main() {
    const results = { rss: false, pdf: false, timestamp: new Date().toISOString() };

    // Intentar RSS (Secuencialmente hasta que uno funcione)
    for (const url of RSS_SOURCES) {
        try {
            await downloadFile(url, RSS_PATH);
            results.rss = true;
            console.log('✅ RSS Downloaded');
            break;
        } catch (e) {
            console.warn(`❌ RSS Source failed (${url}): ${e.message}`);
        }
    }

    // Intentar PDF (Directo y luego via Proxy)
    try {
        await downloadFile(PDF_URL, PDF_PATH);
        results.pdf = true;
        console.log('✅ PDF Downloaded (Direct)');
    } catch (e) {
        console.warn(`❌ PDF Direct failed: ${e.message}. Trying via Proxy...`);
        try {
            await downloadFile(PDF_URL, PDF_PATH, true);
            results.pdf = true;
            console.log('✅ PDF Downloaded (Proxy)');
        } catch (e2) {
            console.error(`❌ PDF Proxy failed: ${e2.message}`);
        }
    }

    fs.writeFileSync(METADATA_PATH, JSON.stringify(results, null, 2));
    if (!results.rss && !results.pdf) process.exit(1);
}

main();
