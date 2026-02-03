const fs = require('fs');
const https = require('https');
const path = require('path');

const RSS_URL = 'https://www.loteriasyapuestas.es/es/la-quiniela/resultados/.formatoRSS';
const PDF_URL = 'https://www.loteriasyapuestas.es/f/loterias/documentos/Quiniela/Calendarios/Proximas_jornadas_deportivas.pdf';

const RSS_PATH = path.join(__dirname, '../datos_auxiliares/rss_cache.xml');
const PDF_PATH = path.join(__dirname, '../datos_auxiliares/proximas_jornadas.pdf');
const METADATA_PATH = path.join(__dirname, '../datos_auxiliares/external_data_metadata.json');

async function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        console.log(`Downloading ${url} to ${dest}...`);
        const file = fs.createWriteStream(dest);
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        };

        https.get(url, options, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    console.log(`Successfully downloaded ${path.basename(dest)}`);
                    resolve();
                });
            } else {
                file.close();
                fs.unlinkSync(dest); // Delete partial file
                console.error(`Failed to download ${url}: Status ${response.statusCode}`);
                reject(new Error(`Status ${response.statusCode}`));
            }
        }).on('error', (err) => {
            fs.unlinkSync(dest);
            console.error(`Error downloading ${url}: ${err.message}`);
            reject(err);
        });
    });
}

async function main() {
    const results = {
        rss: false,
        pdf: false,
        timestamp: new Date().toISOString()
    };

    try {
        await downloadFile(RSS_URL, RSS_PATH);
        results.rss = true;
    } catch (e) {
        console.error('RSS download failed, but continuing...');
    }

    try {
        await downloadFile(PDF_URL, PDF_PATH);
        results.pdf = true;
    } catch (e) {
        console.error('PDF download failed.');
    }

    fs.writeFileSync(METADATA_PATH, JSON.stringify(results, null, 2));
    console.log('Update finished.');
}

main();
