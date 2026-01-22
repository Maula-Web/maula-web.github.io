
// Wrapper for seeding initial data from previous local hardcoded files
const CloudSeeder = {
    run: async function (dbService) {
        console.log("CloudSeeder: Starting full seed...");

        // 1. Seed Jornadas (Matches)
        await this.seedJornadas(dbService);

        // 2. Seed Pronosticos (Predictions)
        await this.seedPronosticos(dbService);

        console.log("CloudSeeder: Finished.");
    },

    seedJornadas: async function (dbService) {
        console.log("Seeding Jornadas...");
        const jornadasData = [
            {
                num: 1, date: '17/08/2025',
                matches: [
                    { h: 'Girona', a: 'Rayo Vallecano', r: '2' }, { h: 'Villarreal', a: 'R. Oviedo', r: '1' }, { h: 'Alavés', a: 'Levante', r: '1' },
                    { h: 'Mallorca', a: 'Barcelona', r: '2' }, { h: 'Valencia', a: 'Real Sociedad', r: 'X' }, { h: 'Celta', a: 'Getafe', r: '2' },
                    { h: 'Athletic Club', a: 'Sevilla', r: '1' }, { h: 'Espanyol', a: 'At. Madrid', r: '1' }, { h: 'Racing Santander', a: 'Castellón', r: '1' },
                    { h: 'Málaga', a: 'Eibar', r: 'X' }, { h: 'Granada', a: 'Deportivo', r: '2' }, { h: 'Cádiz', a: 'Mirandés', r: '1' },
                    { h: 'Huesca', a: 'Leganés', r: 'X' }, { h: 'Las Palmas', a: 'Andorra', r: 'X' }, { h: 'Elche', a: 'Betis', r: '1-1' }
                ]
            },
            {
                num: 2, date: '24/08/2025',
                matches: [
                    { h: 'Mallorca', a: 'Celta', r: 'X' }, { h: 'At. Madrid', a: 'Elche', r: 'X' }, { h: 'Levante', a: 'Barcelona', r: '2' },
                    { h: 'Osasuna', a: 'Valencia', r: '1' }, { h: 'Real Sociedad', a: 'Espanyol', r: 'X' }, { h: 'Villarreal', a: 'Girona', r: '1' },
                    { h: 'R. Oviedo', a: 'Real Madrid', r: '2' }, { h: 'Athletic Club', a: 'Rayo Vallecano', r: '1' }, { h: 'Mirandés', a: 'Huesca', r: '2' },
                    { h: 'Ceuta', a: 'Sporting', r: '2' }, { h: 'R. Zaragoza', a: 'Andorra', r: '2' }, { h: 'Deportivo', a: 'Burgos', r: 'X' },
                    { h: 'Cultural Leonesa', a: 'Almería', r: '2' }, { h: 'Albacete', a: 'Racing Santander', r: '2' }, { h: 'Sevilla', a: 'Getafe', r: '1-2' }
                ]
            },
            {
                num: 3, date: '31/08/2025',
                matches: [
                    { h: 'Alavés', a: 'At. Madrid', r: 'X' }, { h: 'R. Oviedo', a: 'Real Sociedad', r: '1' }, { h: 'Girona', a: 'Sevilla', r: '2' },
                    { h: 'Real Madrid', a: 'Mallorca', r: '1' }, { h: 'Celta', a: 'Villarreal', r: 'X' }, { h: 'Betis', a: 'Athletic Club', r: '2' },
                    { h: 'Espanyol', a: 'Osasuna', r: '1' }, { h: 'Racing Santander', a: 'Ceuta', r: '1' }, { h: 'Valladolid', a: 'Córdoba', r: 'X' },
                    { h: 'Castellón', a: 'Zaragoza', r: 'X' }, { h: 'Andorra', a: 'Burgos', r: '1' }, { h: 'Cádiz', a: 'Albacete', r: '1' },
                    { h: 'Las Palmas', a: 'Málaga', r: '2' }, { h: 'Granada', a: 'Mirandés', r: '2' }, { h: 'Rayo Vallecano', a: 'Barcelona', r: '1-1' }
                ]
            },
            {
                num: 5, date: '14/09/2025',
                matches: [
                    { h: 'Alavés', a: 'At. Madrid', r: 'X' }, { h: 'R. Oviedo', a: 'Real Sociedad', r: '1' }, { h: 'Girona', a: 'Sevilla', r: '2' },
                    { h: 'Real Madrid', a: 'Mallorca', r: '1' }, { h: 'Celta', a: 'Villarreal', r: '2' }, { h: 'Betis', a: 'Athletic Club', r: '1' },
                    { h: 'Espanyol', a: 'Osasuna', r: '1' }, { h: 'Racing Santander', a: 'Ceuta', r: '1' }, { h: 'Valladolid', a: 'Córdoba', r: '1' },
                    { h: 'Castellón', a: 'R. Zaragoza', r: 'X' }, { h: 'Andorra', a: 'Burgos', r: '1' }, { h: 'Cádiz', a: 'Albacete', r: '1' },
                    { h: 'Las Palmas', a: 'Málaga', r: 'X' }, { h: 'Granada', a: 'Mirandés', r: 'X' }, { h: 'Rayo Vallecano', a: 'Barcelona', r: '1' }
                ]
            },
            {
                num: 7, date: '21/09/2025',
                matches: [
                    { h: 'Alavés', a: 'Sevilla', r: '2' }, { h: 'Barcelona', a: 'Getafe', r: '1' }, { h: 'Betis', a: 'Real Sociedad', r: '1' },
                    { h: 'Elche', a: 'R. Oviedo', r: '1' }, { h: 'Girona', a: 'Levante', r: '2' }, { h: 'Mallorca', a: 'At. Madrid', r: 'X' },
                    { h: 'Rayo Vallecano', a: 'Celta', r: 'X' }, { h: 'Real Madrid', a: 'Espanyol', r: '1' }, { h: 'Villarreal', a: 'Osasuna', r: '1' },
                    { h: 'Albacete', a: 'Valladolid', r: '1' }, { h: 'Córdoba', a: 'Racing De Santander', r: 'X' }, { h: 'Deportivo', a: 'Huesca', r: '1' },
                    { h: 'Almería', a: 'Sporting', r: '1' }, { h: 'Málaga', a: 'Cádiz', r: '2' }, { h: 'Valencia', a: 'Athletic Club', r: '2-0' }
                ]
            },
            {
                num: 9, date: '28/09/2025',
                matches: [
                    { h: 'Getafe', a: 'Levante', r: 'X' }, { h: 'Mallorca', a: 'Alavés', r: '1' }, { h: 'Villarreal', a: 'Athletic Club', r: '1' },
                    { h: 'Rayo Vallecano', a: 'Sevilla', r: '2' }, { h: 'Elche', a: 'Celta', r: '1' }, { h: 'Betis', a: 'Osasuna', r: '1' },
                    { h: 'Barcelona', a: 'Real Sociedad', r: '1' }, { h: 'Valencia', a: 'R. Oviedo', r: '1' }, { h: 'Eibar', a: 'Deportivo', r: 'X' },
                    { h: 'Racing Santander', a: 'Andorra', r: '2' }, { h: 'Las Palmas', a: 'Almería', r: '2' }, { h: 'Burgos', a: 'Málaga', r: '1' },
                    { h: 'Cádiz', a: 'Ceuta', r: 'X' }, { h: 'Sporting', a: 'Albacete', r: '2' }, { h: 'At. Madrid', a: 'Real Madrid', r: 'M-2' }
                ]
            },
            {
                num: 11, date: '05/10/2025',
                matches: [
                    { h: 'R. Oviedo', a: 'Levante', r: '2' }, { h: 'Girona', a: 'Valencia', r: '1' }, { h: 'Athletic Club', a: 'Mallorca', r: '1' },
                    { h: 'Real Madrid', a: 'Villarreal', r: '1' }, { h: 'Sevilla', a: 'Barcelona', r: '1' }, { h: 'Alavés', a: 'Elche', r: '1' },
                    { h: 'Espanyol', a: 'Betis', r: '2' }, { h: 'Real Sociedad', a: 'Rayo Vallecano', r: '2' }, { h: 'Deportivo', a: 'Almería', r: 'X' },
                    { h: 'Andorra', a: 'Leganés', r: '2' }, { h: 'Huesca', a: 'Burgos', r: '1' }, { h: 'R. Zaragoza', a: 'Córdoba', r: '2' },
                    { h: 'Racing Santander', a: 'Málaga', r: '1' }, { h: 'Las Palmas', a: 'Cádiz', r: '1' }, { h: 'Celta', a: 'At. Madrid', r: '1-1' }
                ]
            },
            {
                num: 14, date: '19/10/2025',
                matches: [
                    { h: 'Sevilla', a: 'Mallorca', r: '2' }, { h: 'Barcelona', a: 'Girona', r: '1' }, { h: 'Villarreal', a: 'Betis', r: 'X' },
                    { h: 'At. Madrid', a: 'Osasuna', r: '1' }, { h: 'Elche', a: 'Athletic Club', r: 'X' }, { h: 'Celta', a: 'Real Sociedad', r: 'X' },
                    { h: 'Levante', a: 'Rayo Vallecano', r: '2' }, { h: 'Getafe', a: 'Real Madrid', r: '2' }, { h: 'R. Zaragoza', a: 'Cultural Leonesa', r: '2' },
                    { h: 'Leganés', a: 'Málaga', r: '1' }, { h: 'Castellón', a: 'Albacete', r: '2' }, { h: 'Valladolid', a: 'Sporting', r: '2' },
                    { h: 'Racing Santander', a: 'Deportivo', r: '1' }, { h: 'Córdoba', a: 'Almería', r: 'X' }, { h: 'Alavés', a: 'Valencia', r: '0-0' }
                ]
            },
            {
                num: 16, date: '26/10/2025',
                matches: [
                    { h: 'Girona', a: 'R. Oviedo', r: 'X' }, { h: 'Espanyol', a: 'Elche', r: '1' }, { h: 'Athletic Club', a: 'Getafe', r: '2' },
                    { h: 'Valencia', a: 'Villarreal', r: '2' }, { h: 'Mallorca', a: 'Levante', r: 'X' }, { h: 'Osasuna', a: 'Celta', r: '2' },
                    { h: 'Rayo Vallecano', a: 'Alavés', r: '1' }, { h: 'Betis', a: 'At. Madrid', r: '2' }, { h: 'Granada', a: 'Cádiz', r: 'X' },
                    { h: 'Mirandés', a: 'Racing Santander', r: '2' }, { h: 'Málaga', a: 'Andorra', r: '1' }, { h: 'Sporting', a: 'R. Zaragoza', r: '1' },
                    { h: 'Almería', a: 'Castellón', r: '1' }, { h: 'Deportivo', a: 'Valladolid', r: 'X' }, { h: 'Real Madrid', a: 'Barcelona', r: '2-1' }
                ]
            },
            {
                num: 17, date: '02/11/2025',
                matches: [
                    { h: 'Villarreal', a: 'Rayo Vallecano', r: '1' }, { h: 'At. Madrid', a: 'Sevilla', r: '1' }, { h: 'Real Madrid', a: 'Valencia', r: '1' },
                    { h: 'Levante', a: 'Celta', r: '2' }, { h: 'Alavés', a: 'Espanyol', r: '1' }, { h: 'Barcelona', a: 'Elche', r: '1' },
                    { h: 'Betis', a: 'Mallorca', r: '1' }, { h: 'R. Oviedo', a: 'Osasuna', r: 'X' }, { h: 'Leganés', a: 'Burgos', r: '2' },
                    { h: 'Almería', a: 'Eibar', r: '1' }, { h: 'Andorra', a: 'Cádiz', r: 'X' }, { h: 'Sporting', a: 'Las Palmas', r: 'X' },
                    { h: 'Castellón', a: 'Málaga', r: '1' }, { h: 'R. Zaragoza', a: 'Deportivo', r: '2' }, { h: 'Real Sociedad', a: 'Athletic Club', r: 'M-2' }
                ]
            },
            {
                num: 19, date: '09/11/2025',
                matches: [
                    { h: 'Girona', a: 'Alavés', r: '1' }, { h: 'Sevilla', a: 'Osasuna', r: '1' }, { h: 'At. Madrid', a: 'Levante', r: '1' },
                    { h: 'Espanyol', a: 'Villarreal', r: '2' }, { h: 'Athletic Club', a: 'R. Oviedo', r: '1' }, { h: 'Valencia', a: 'Betis', r: 'X' },
                    { h: 'Mallorca', a: 'Getafe', r: '1' }, { h: 'Celta', a: 'Barcelona', r: '2' }, { h: 'Huesca', a: 'Andorra', r: 'X' },
                    { h: 'Málaga', a: 'Córdoba', r: 'X' }, { h: 'Las Palmas', a: 'Racing De Santander', r: '1' }, { h: 'Ceuta', a: 'Almería', r: 'X' },
                    { h: 'Granada', a: 'R. Zaragoza', r: '1' }, { h: 'Cádiz', a: 'Valladolid', r: 'X' }, { h: 'Rayo Vallecano', a: 'Real Madrid', r: '0-0' }
                ]
            },
            {
                num: 22, date: '23/11/2025',
                matches: [
                    { h: 'Alavés', a: 'Celta', r: '2' }, { h: 'Barcelona', a: 'Athletic Club', r: '1' }, { h: 'Osasuna', a: 'Real Sociedad', r: '2' },
                    { h: 'Villarreal', a: 'Mallorca', r: '1' }, { h: 'R. Oviedo', a: 'Rayo Vallecano', r: 'X' }, { h: 'Betis', a: 'Girona', r: 'X' },
                    { h: 'Getafe', a: 'At. Madrid', r: '2' }, { h: 'Elche', a: 'Real Madrid', r: 'X' }, { h: 'Leganés', a: 'Almería', r: '2' },
                    { h: 'Granada', a: 'Córdoba', r: 'X' }, { h: 'Deportivo', a: 'Ceuta', r: '1' }, { h: 'Huesca', a: 'Sporting', r: '1' },
                    { h: 'Burgos', a: 'Racing Santander', r: '2' }, { h: 'Málaga', a: 'Mirandés', r: '1' }, { h: 'Espanyol', a: 'Sevilla', r: '2-1' }
                ]
            },
            {
                num: 24, date: '30/11/2025',
                matches: [
                    { h: 'Mallorca', a: 'Osasuna', r: 'X' }, { h: 'Barcelona', a: 'Alavés', r: '1' }, { h: 'Levante', a: 'Athletic Club', r: '2' },
                    { h: 'At. Madrid', a: 'R. Oviedo', r: '1' }, { h: 'Real Sociedad', a: 'Villarreal', r: '2' }, { h: 'Sevilla', a: 'Betis', r: '2' },
                    { h: 'Celta', a: 'Espanyol', r: '2' }, { h: 'Girona', a: 'Real Madrid', r: 'X' }, { h: 'Ceuta', a: 'Burgos', r: '1' },
                    { h: 'Albacete', a: 'Deportivo', r: '2' }, { h: 'Valladolid', a: 'Málaga', r: 'X' }, { h: 'R. Zaragoza', a: 'Leganés', r: '1' },
                    { h: 'Córdoba', a: 'Cádiz', r: '2' }, { h: 'Castellón', a: 'Las Palmas', r: '1' }, { h: 'Rayo Vallecano', a: 'Valencia', r: '1-1' }
                ]
            },
            {
                num: 26, date: '07/12/2025',
                matches: [
                    { h: 'Villarreal', a: 'Getafe', r: '1' }, { h: 'Alavés', a: 'Real Sociedad', r: '1' }, { h: 'Betis', a: 'Barcelona', r: '2' },
                    { h: 'Elche', a: 'Girona', r: '1' }, { h: 'Valencia', a: 'Sevilla', r: 'X' }, { h: 'Espanyol', a: 'Rayo Vallecano', r: '' },
                    { h: 'Real Madrid', a: 'Celta', r: '' }, { h: 'Osasuna', a: 'Levante', r: '' }, { h: 'Andorra', a: 'Almería', r: '2' },
                    { h: 'Huesca', a: 'Valladolid', r: '2' }, { h: 'Cádiz', a: 'Racing Santander', r: '2' }, { h: 'Leganés', a: 'Córdoba', r: 'X' },
                    { h: 'Deportivo', a: 'Castellón', r: '' }, { h: 'Granada', a: 'Ceuta', r: '' }, { h: 'Athletic Club', a: 'At. Madrid', r: '1-0' }
                ]
            }
        ];

        for (const jd of jornadasData) {
            // Processing logic similar to jornadas.js
            const parts = jd.date.split('/');
            const dObj = new Date(parts[2], parts[1] - 1, parts[0]);
            const dateStr = dObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

            let cleanMatches = Array(15).fill(null).map(() => ({ home: '', away: '', result: '' }));
            if (jd.matches && jd.matches.length > 0) {
                jd.matches.forEach((m, i) => {
                    if (i < 15) cleanMatches[i] = { home: m.h, away: m.a, result: m.r };
                });
            }

            const jornadaObj = {
                id: Date.now() + jd.num,
                number: jd.num,
                season: '2025-2026',
                date: dateStr,
                matches: cleanMatches,
                active: true
            };

            // Force ID = Number for consistency
            jornadaObj.id = jd.num;

            await dbService.save('jornadas', jornadaObj);
        }

        // FUTURE GENERATION (From Dec 2025 to May 2026)
        console.log("Seeding Future Jornadas...");
        let futureDate = new Date(2025, 11, 14); // Dec 14
        let futureNum = 27; // Continue numbering
        const seasonEnd = new Date(2026, 4, 30);

        while (futureDate <= seasonEnd) {
            let cleanMatches = Array(15).fill(null).map(() => ({ home: '', away: '', result: '' }));
            const isXmas = (futureDate.getMonth() === 11 && futureDate.getDate() > 21) || (futureDate.getMonth() === 0 && futureDate.getDate() < 4);

            if (!isXmas) {
                const dStr = futureDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

                const jObj = {
                    id: futureNum,
                    number: futureNum,
                    season: '2025-2026',
                    date: dStr,
                    matches: cleanMatches,
                    active: true
                };

                await dbService.save('jornadas', jObj);
                futureNum++;
            }
            futureDate.setDate(futureDate.getDate() + 7); // Next Sunday
        }
    },

    seedPronosticos: async function (dbService) {
        // Wait for HISTORICAL_DATA (up to 5s)
        if (!window.HISTORICAL_DATA) {
            console.error("CloudSeeder: HISTORICAL_DATA not found even after script load.");
            alert("Error Crítico: No se encontraron los datos históricos para la importación.");
            return;
        }

        console.log("Seeding Pronosticos...");

        for (const hData of window.HISTORICAL_DATA) {
            const jornadaNum = hData.jornada_num;
            const predictionsMap = hData.predictions;

            for (const [memberId, preds] of Object.entries(predictionsMap)) {
                if (!preds) continue;

                // Matches App ID format: {jId}_{mId}
                const docId = `${jornadaNum}_${memberId}`;

                // Matches App Data Structure: jId, mId, selection
                const record = {
                    id: docId,
                    jId: parseInt(jornadaNum),
                    mId: parseInt(memberId),
                    selection: preds,
                    timestamp: new Date().toISOString()
                };

                await dbService.db.collection('pronosticos').doc(docId).set(record);
            }
        }
    }
};

window.CloudSeeder = CloudSeeder;
