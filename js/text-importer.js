/**
 * TextImporterService - Importador de partidos y resultados desde texto
 * Permite interpretar texto copiado de webs como Revista Quinielista,
 * extrayendo jornada, fecha y los 15 partidos (local y visitante).
 */
class TextImporterService {
    /**
     * Decodifica entidades HTML tanto numéricas como con nombre
     * @param {string} str 
     * @returns {string}
     */
    static decodeEntities(str) {
        if (!str) return '';
        if (typeof document !== 'undefined' && typeof DOMParser !== 'undefined') {
            try {
                const doc = new DOMParser().parseFromString(str, 'text/html');
                return doc.body.textContent || '';
            } catch (e) { }
        }
        return str
            .replace(/&#(\d+);/g, (m, dec) => String.fromCharCode(dec))
            .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/&aacute;/gi, 'á')
            .replace(/&eacute;/gi, 'é')
            .replace(/&iacute;/gi, 'í')
            .replace(/&oacute;/gi, 'ó')
            .replace(/&uacute;/gi, 'ú')
            .replace(/&ntilde;/gi, 'ñ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'");
    }

    /**
     * Extrae nombres de equipo distintos de una lista de tokens de columna,
     * descartando números de partido, porcentajes, signos 1X2, etc.
     * @param {Array<string>} tokens 
     * @returns {Array<string>}
     */
    static extractDistinctTeams(tokens) {
        const distinct = [];
        for (const tok of tokens) {
            const clean = tok.trim();
            if (!clean) continue;
            // Descartar ordinales (1º, 2º), números, signos de quiniela (1, X, 2), porcentajes y guiones
            if (/^(\d+[\.,]?\d*%?|\d+[º°\.]?|[1X2]{1,2}|-|vs\.?)$/i.test(clean)) continue;
            if (!distinct.includes(clean)) {
                distinct.push(clean);
            }
        }
        return distinct;
    }

    /**
     * Analiza el texto pegado y extrae número de jornada, fecha y partidos
     * @param {string} rawText 
     * @returns {Object} Resultado del análisis
     */
    static parseMatchesText(rawText) {
        const result = {
            success: false,
            jNum: null,
            dateStr: null,
            isSunday: null,
            matches: Array(15).fill(null),
            missingIndices: [],
            warnings: [],
            errors: []
        };

        if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
            result.errors.push('No se ha proporcionado ningún texto para analizar.');
            return result;
        }

        const cleanText = this.decodeEntities(rawText);

        // 1. Extraer número de jornada
        // Patrones: "Jornada:\n8", "Jornada: 8", "Jornada 8", "Jornada nº 8"
        const jNumMatch = cleanText.match(/jornada(?:\s*n[º°])?\s*:?\s*(\d+)/i);
        if (jNumMatch) {
            result.jNum = parseInt(jNumMatch[1], 10);
        } else {
            result.errors.push('No se pudo identificar el número de jornada (ej: "Jornada: 8").');
        }

        // 2. Extraer fecha
        // Patrones: "20/09/2026", "20-09-2026", "20.09.2026", "20 de septiembre de 2026"
        let dateStr = null;
        const dateMatch = cleanText.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})/);
        if (dateMatch) {
            const d = dateMatch[1].padStart(2, '0');
            const m = dateMatch[2].padStart(2, '0');
            let y = dateMatch[3];
            if (y.length === 2) y = '20' + y;
            dateStr = `${d}/${m}/${y}`;
        } else {
            const textDateMatch = cleanText.match(/(\d{1,2})\s+de\s+([a-zñáéíóú]+)\s+de\s+(\d{4})/i);
            if (textDateMatch) {
                dateStr = `${textDateMatch[1]} de ${textDateMatch[2]} de ${textDateMatch[3]}`;
            }
        }

        if (dateStr) {
            result.dateStr = dateStr;
            const parsedDate = typeof AppUtils !== 'undefined' ? AppUtils.parseDate(dateStr) : null;
            if (parsedDate) {
                result.isSunday = typeof AppUtils !== 'undefined' ? AppUtils.isSunday(parsedDate) : (parsedDate.getDay() === 0);
                if (!result.isSunday) {
                    result.warnings.push(`La fecha ${dateStr} no cae en domingo. Recuerda que las jornadas oficiales de la Peña Maulas se juegan en domingo.`);
                }
            }
        } else {
            result.warnings.push('No se pudo extraer la fecha automáticamente. Podrás editarla antes o después de crear la jornada.');
        }

        // 3. Extraer los partidos (1 al 15)
        const rawLines = cleanText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        let p15Home = null;
        let p15Away = null;

        for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i];
            const matchNumMatch = line.match(/^(\d{1,2})[º°\.\-]?\s*(.*)$/);

            if (matchNumMatch) {
                const num = parseInt(matchNumMatch[1], 10);
                const rest = matchNumMatch[2] || '';
                const delimiter = rest.includes('\t') ? '\t' : /\s{2,}/;
                const tokens = rest.split(delimiter).map(t => t.trim()).filter(t => t);
                let distinct = this.extractDistinctTeams(tokens);

                // Alternativa: Si solo hay un token pero contiene un separador '-' o 'vs'
                if (distinct.length === 1 && (distinct[0].includes(' - ') || distinct[0].includes(' vs '))) {
                    const parts = distinct[0].split(/\s+[-–—]\s+|\s+vs\.?\s+/i);
                    if (parts.length >= 2) {
                        distinct = [parts[0].trim(), parts[1].trim()];
                    }
                }

                if (num >= 1 && num <= 14) {
                    if (distinct.length >= 2) {
                        result.matches[num - 1] = {
                            home: distinct[0],
                            away: distinct[1],
                            result: ''
                        };
                    }
                } else if (num === 15) {
                    if (distinct.length >= 2) {
                        p15Home = distinct[0];
                        p15Away = distinct[1];
                    } else if (distinct.length === 1) {
                        p15Home = distinct[0];
                        // Buscar equipo visitante en la siguiente línea no vacía (formato Revista Quinielista)
                        for (let j = i + 1; j < rawLines.length; j++) {
                            const nextLine = rawLines[j];
                            if (!nextLine) continue;
                            if (/^\d{1,2}[º°\.\-]/.test(nextLine)) break; // Es otro partido
                            const nextDelim = nextLine.includes('\t') ? '\t' : /\s{2,}/;
                            const nextTokens = nextLine.split(nextDelim).map(t => t.trim()).filter(t => t);
                            const nextDistinct = this.extractDistinctTeams(nextTokens);
                            if (nextDistinct.length >= 1) {
                                p15Away = nextDistinct[0];
                                break;
                            }
                        }
                    }
                }
            }
        }

        if (p15Home && p15Away) {
            result.matches[14] = {
                home: p15Home,
                away: p15Away,
                result: ''
            };
        }

        // Determinar partidos faltantes
        const missing = [];
        for (let i = 0; i < 15; i++) {
            if (!result.matches[i]) {
                missing.push(i + 1);
            }
        }
        result.missingIndices = missing;

        if (missing.length > 0) {
            result.warnings.push(`Faltan datos de los siguientes partidos: ${missing.map(n => n === 15 ? 'Pleno al 15' : 'P' + n).join(', ')}.`);
        }

        // Éxito si tenemos número de jornada y al menos un partido válido
        const validCount = result.matches.filter(m => m !== null).length;
        if (result.jNum && validCount >= 14) {
            result.success = true;
        } else if (validCount < 14) {
            result.errors.push(`Se han detectado ${validCount} de 15 partidos. Comprueba que el texto contenga la quiniela completa.`);
        }

        return result;
    }
}

if (typeof window !== 'undefined') {
    window.TextImporterService = TextImporterService;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TextImporterService;
}
