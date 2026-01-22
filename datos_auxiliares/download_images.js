const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const data = {
    "primera": [
        { "name": "Alaves", "src": "http://www.lafutbolteca.com/wp-content/uploads/2020/08/Escudo-Deportivo-Alav%C3%A9s-S.A.D..jpg" },
        { "name": "Athletic", "src": "http://www.lafutbolteca.com/wp-content/uploads/2010/01/ATHLETIC-150x150.jpg" },
        { "name": "Atletico", "src": "http://www.lafutbolteca.com/wp-content/uploads/2024/08/ATL%C3%89TICO-150x150.jpg" },
        { "name": "Barcelona", "src": "http://www.lafutbolteca.com/wp-content/uploads/2009/11/BARCELONA-150x150.jpg" },
        { "name": "Betis", "src": "http://www.lafutbolteca.com/wp-content/uploads/2010/01/REAL-BETIS-150x150.jpg" },
        { "name": "Celta", "src": "http://www.lafutbolteca.com/wp-content/uploads/2010/01/CELTA-150x150.jpg" },
        { "name": "Elche", "src": "http://www.lafutbolteca.com/wp-content/uploads/2010/01/ELCHE-150x150.jpg" },
        { "name": "Espanyol", "src": "http://www.lafutbolteca.com/wp-content/uploads/2009/11/ESPANYOL-150x150.jpg" },
        { "name": "Getafe", "src": "http://www.lafutbolteca.com/wp-content/uploads/2010/01/GETAFE-150x150.jpg" },
        { "name": "Girona", "src": "http://www.lafutbolteca.com/wp-content/uploads/2022/08/Escudo-Girona-FC-2022.jpg" },
        { "name": "Levante", "src": "http://www.lafutbolteca.com/wp-content/uploads/2010/01/LEVANTE-150x150.jpg" },
        { "name": "Mallorca", "src": "http://www.lafutbolteca.com/wp-content/uploads/2009/11/MALLORCA-150x150.jpg" },
        { "name": "Osasuna", "src": "http://www.lafutbolteca.com/wp-content/uploads/2009/11/OSASUNA-150x150.jpg" },
        { "name": "Oviedo", "src": "http://www.lafutbolteca.com/wp-content/uploads/2009/11/REAL-OVIEDO-150x150.jpg" },
        { "name": "Rayo_V", "src": "http://www.lafutbolteca.com/wp-content/uploads/2010/01/RAYO-VALLECANO-150x150.jpg" },
        { "name": "Real_Madrid", "src": "http://www.lafutbolteca.com/wp-content/uploads/2009/11/REAL-MADRID-150x150.jpg" },
        { "name": "R_Sociedad", "src": "http://www.lafutbolteca.com/wp-content/uploads/2009/11/REAL-SOCIEDAD-150x150.jpg" },
        { "name": "Sevilla", "src": "http://www.lafutbolteca.com/wp-content/uploads/2009/11/SEVILLA-150x150.jpg" },
        { "name": "Valencia", "src": "http://www.lafutbolteca.com/wp-content/uploads/2010/01/VALENCIA-150x150.jpg" },
        { "name": "Villarreal", "src": "http://www.lafutbolteca.com/wp-content/uploads/2009/11/VILLARREAL-150x150.jpg" }
    ],
    "segunda": [
        { "name": "Albacete", "src": "http://www.lafutbolteca.com/wp-content/uploads/2010/01/ALBACETE-150x150.jpg" },
        { "name": "Almeria", "src": "http://www.lafutbolteca.com/wp-content/uploads/2020/10/ALMERIA.jpg" },
        { "name": "Andorra", "src": "http://www.lafutbolteca.com/wp-content/uploads/2021/08/ANDORRA-150x150.jpg" },
        { "name": "Burgos", "src": "http://www.lafutbolteca.com/wp-content/uploads/2011/09/BURGOS-150x150.jpg" },
        { "name": "Cadiz", "src": "http://www.lafutbolteca.com/wp-content/uploads/2010/01/CADIZ-150x150.jpg" },
        { "name": "Castellon", "src": "http://www.lafutbolteca.com/wp-content/uploads/2010/01/CASTELLON-150x150.jpg" },
        { "name": "Ceuta", "src": "http://www.lafutbolteca.com/wp-content/uploads/2020/05/Escudo-AgD-Ceuta-FC-150x150.jpg" },
        { "name": "Cordoba", "src": "http://www.lafutbolteca.com/wp-content/uploads/2010/01/CORDOBA-150x150.jpg" },
        { "name": "Cultural", "src": "http://www.lafutbolteca.com/wp-content/uploads/2009/11/CULTURAL-150x150.jpg" },
        { "name": "Deportivo", "src": "http://www.lafutbolteca.com/wp-content/uploads/2022/12/DEPORTIVO-150x150.jpg" },
        { "name": "Eibar", "src": "http://www.lafutbolteca.com/wp-content/uploads/2009/11/EIBAR-150x150.jpg" },
        { "name": "Granada", "src": "http://www.lafutbolteca.com/wp-content/uploads/2009/11/GRANADA-150x150.jpg" },
        { "name": "Huesca", "src": "http://www.lafutbolteca.com/wp-content/uploads/2010/01/HUESCA-150x150.jpg" },
        { "name": "Las_Palmas", "src": "http://www.lafutbolteca.com/wp-content/uploads/2010/01/LAS-PALMAS-150x150.jpg" },
        { "name": "Leganes", "src": "http://www.lafutbolteca.com/wp-content/uploads/2009/11/LEGANES-150x150.jpg" },
        { "name": "Malaga", "src": "http://www.lafutbolteca.com/wp-content/uploads/2009/11/MALAGA-150x150.jpg" },
        { "name": "Mirandes", "src": "http://www.lafutbolteca.com/wp-content/uploads/2009/11/MIRANDES-150x150.jpg" },
        { "name": "Racing", "src": "http://www.lafutbolteca.com/wp-content/uploads/2009/11/REAL-RACING-150x150.jpg" },
        { "name": "R_Sdad_B", "src": "http://www.lafutbolteca.com/wp-content/uploads/2010/07/REAL-SOCIEDAD-B-150x150.jpg" },
        { "name": "Sporting", "src": "http://www.lafutbolteca.com/wp-content/uploads/2009/11/REAL-SPORTING-150x150.jpg" },
        { "name": "Valladolid", "src": "http://www.lafutbolteca.com/wp-content/uploads/2024/08/Escudo-Real-Valladolid-CF.jpg" },
        { "name": "Zaragoza", "src": "http://www.lafutbolteca.com/wp-content/uploads/2010/01/REAL-ZARAGOZA-150x150.jpg" }
    ]
};

const downloadImage = (url, filepath) => {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, (res) => {
            if (res.statusCode === 200) {
                res.pipe(fs.createWriteStream(filepath))
                    .on('error', reject)
                    .once('close', () => resolve(filepath));
            } else {
                res.resume();
                reject(new Error(`Request Failed With a Status Code: ${res.statusCode}`));
            }
        }).on('error', reject);
    });
};

const processDownloads = async () => {
    for (const division of Object.keys(data)) {
        const dir = path.join(__dirname, 'escudos', division);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        console.log(`Downloading ${division} division images...`);

        for (const team of data[division]) {
            const filename = team.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.jpg';
            const filepath = path.join(dir, filename);
            try {
                await downloadImage(team.src, filepath);
                console.log(`Downloaded: ${team.name}`);
            } catch (e) {
                console.error(`Failed to download ${team.name}: ${e.message}`);
            }
        }
    }
    console.log('All downloads completed.');
};

processDownloads();
