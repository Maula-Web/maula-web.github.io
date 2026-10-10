/**
 * js/quiniela-service.js - Servicio Cliente de Escrutinio Oficial de La Quiniela
 * ==============================================================================
 * Conecta la interfaz web con el scraper oficial para obtener en 1 clic
 * los resultados y el reparto de premios oficial de Loterías y Apuestas del Estado.
 * ==============================================================================
 */

class QuinielaService {
    /**
     * Obtiene los resultados y premios de la última jornada desde la nube o caché.
     * @returns {Promise<Object>} Datos normalizados con matches y prizes
     */
    static async fetchLatestResults() {
        let lastError = null;

        // 1. Intentar llamar a la Firebase Cloud Function (Producción / Despliegue)
        try {
            const cloudUrl = 'https://europe-west1-maulasweb.cloudfunctions.net/getQuinielaResults';
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 6000);

            const res = await fetch(cloudUrl, {
                method: 'GET',
                signal: ctrl.signal,
                headers: { 'Accept': 'application/json' }
            });
            clearTimeout(timer);

            if (res.ok) {
                const data = await res.json();
                if (data && data.matches && data.matches.length === 15) {
                    console.log('[QuinielaService] Obtenido desde Cloud Function:', data.source);
                    return this.normalizeScrapedData(data);
                }
            }
        } catch (e) {
            lastError = e;
            console.warn('[QuinielaService] Cloud Function no disponible:', e.message);
        }

        // 2. Intentar leer último escrutinio cacheado localmente (desarrollo local / GitHub Action)
        try {
            const cacheRes = await fetch('datos_auxiliares/ultimo_escrutinio_oficial.json?t=' + Date.now());
            if (cacheRes.ok) {
                const cacheData = await cacheRes.json();
                if (cacheData && cacheData.matches && cacheData.matches.length === 15) {
                    console.log('[QuinielaService] Obtenido desde caché local/sincronizado:', cacheData.source);
                    return this.normalizeScrapedData(cacheData);
                }
            }
        } catch (e) {
            console.warn('[QuinielaService] Caché local no disponible:', e.message);
        }

        throw new Error(
            'No se pudo conectar con el servicio en la nube ni la caché local. ' +
            'Por favor, utiliza la opción manual para pegar el texto de Loterías.'
        );
    }

    /**
     * Normaliza los datos al formato que esperan TextImporterService y Jornadas 2.0
     */
    static normalizeScrapedData(raw) {
        const matches = (raw.matches || []).map((m, idx) => ({
            home: m.home || `Equipo ${idx + 1}A`,
            away: m.away || `Equipo ${idx + 1}B`,
            score: m.score || '',
            result: m.result || ''
        }));

        const prizes = {
            '15': (raw.prizes && raw.prizes['15']) || 0,
            '14': (raw.prizes && raw.prizes['14']) || 0,
            '13': (raw.prizes && raw.prizes['13']) || 0,
            '12': (raw.prizes && raw.prizes['12']) || 0,
            '11': (raw.prizes && raw.prizes['11']) || 0,
            '10': (raw.prizes && raw.prizes['10']) || 0
        };

        return {
            success: true,
            source: raw.source || 'Loterías y Apuestas del Estado',
            dateStr: raw.dateStr || new Date().toLocaleDateString('es-ES'),
            matches: matches,
            prizes: prizes,
            prizesDetails: raw.prizesDetails || []
        };
    }
}

if (typeof window !== 'undefined') {
    window.QuinielaService = QuinielaService;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QuinielaService;
}
