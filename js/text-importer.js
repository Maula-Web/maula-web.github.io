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

    /**
     * Analiza el texto copiado de la web oficial de Loterías y Apuestas del Estado,
     * extrayendo jornada, fecha, los 15 resultados (signos 1X2 / Pleno al 15) y los premios.
     * @param {string} rawText 
     * @returns {Object} Resultado del análisis
     */
    static parseResultsText(rawText) {
        const result = {
            success: false,
            jNum: null,
            dateStr: null,
            isSunday: null,
            matches: Array(15).fill(null),
            prizes: {
                '15': 0,
                '14': 0,
                '13': 0,
                '12': 0,
                '11': 0,
                '10': 0
            },
            prizesDetails: [],
            warnings: [],
            errors: []
        };

        if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
            result.errors.push('No se ha proporcionado ningún texto para analizar.');
            return result;
        }

        const cleanHtml = this.decodeEntities(rawText);
        // Limpiar enlaces markdown ej: [Texto](url) -> Texto\n
        const cleanText = cleanHtml.replace(/\[(.*?)\]\([^\)]*\)/g, '$1\n');

        // 1. Extraer número de jornada
        // Ej: "La Quiniela Jornada 7ª", "Jornada 7", "Jornada: 7", "Jornada nº 7"
        const jNumMatch = cleanText.match(/jornada(?:\s*n[º°ª])?\s*:?\s*(\d+)/i) || cleanText.match(/jornada\s*(\d+)/i);
        if (jNumMatch) {
            result.jNum = parseInt(jNumMatch[1], 10);
        } else {
            result.errors.push('No se pudo identificar el número de jornada (ej: "Jornada 7ª").');
        }

        // 2. Extraer fecha
        // Ej: "16/09/2026", "16-09-2026", "16 de septiembre de 2026"
        const dateMatch = cleanText.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})/);
        if (dateMatch) {
            const d = dateMatch[1].padStart(2, '0');
            const m = dateMatch[2].padStart(2, '0');
            let y = dateMatch[3];
            if (y.length === 2) y = '20' + y;
            result.dateStr = `${d}/${m}/${y}`;
        } else {
            const textDateMatch = cleanText.match(/(\d{1,2})\s+de\s+([a-zñáéíóú]+)\s+de\s+(\d{4})/i);
            if (textDateMatch) {
                result.dateStr = `${textDateMatch[1]} de ${textDateMatch[2]} de ${textDateMatch[3]}`;
            }
        }

        if (result.dateStr) {
            const parsedDate = typeof AppUtils !== 'undefined' ? AppUtils.parseDate(result.dateStr) : null;
            if (parsedDate) {
                result.isSunday = typeof AppUtils !== 'undefined' ? AppUtils.isSunday(parsedDate) : (parsedDate.getDay() === 0);
                if (!result.isSunday) {
                    result.warnings.push(`La fecha ${result.dateStr} no cae en domingo. Recuerda que las jornadas oficiales se juegan en domingo.`);
                }
            }
        }

        // Dividir en líneas limpias
        const lines = cleanText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

        // 3. Identificar índices de encabezados de cada partido (1 al 14, y P-15 / 15.)
        const matchHeaderIndices = [];
        for (let num = 1; num <= 15; num++) {
            const isP15 = num === 15;
            let idx = -1;

            if (!isP15) {
                idx = lines.findIndex(l => {
                    return new RegExp(`(?:^|\\D)${num}\\.(?:\\s|$)`).test(l) || l === `${num}.` || l === `${num}`;
                });
            } else {
                idx = lines.findIndex(l => /^p[-_]?15\b/i.test(l) || /^pleno\s*al\s*15\b/i.test(l));
                if (idx === -1) {
                    idx = lines.findIndex(l => /(?:^|\D)15\.(?:\s|$)/.test(l) || l === '15.');
                }
            }
            matchHeaderIndices.push({ num, idx });
        }

        // Procesar cada partido
        for (let i = 0; i < 15; i++) {
            const { num, idx } = matchHeaderIndices[i];
            if (idx === -1) continue;

            const nextHeader = matchHeaderIndices[i + 1];
            const nextIdx = nextHeader && nextHeader.idx !== -1 ? nextHeader.idx : lines.findIndex((l, li) => li > idx && /categor[ií]as/i.test(l));
            const blockEnd = (nextIdx !== -1 && nextIdx > idx) ? nextIdx : Math.min(idx + 6, lines.length);

            const blockLines = lines.slice(idx + 1, blockEnd);

            let home = '';
            let away = '';
            let score = '';
            let sign = '';

            // Localizar línea de equipos: "Equipo 1 (m) - Equipo 2 (m)"
            for (const l of blockLines) {
                if (l.includes(' - ') || l.includes(' vs ') || l.includes(' – ') || l.includes(' — ')) {
                    const delim = l.includes(' - ') ? ' - ' : (l.includes(' vs ') ? ' vs ' : (l.includes(' – ') ? ' – ' : ' — '));
                    const parts = l.split(delim);
                    // Eliminar (m) masculino y normalizar (F) femenino
                    home = parts[0]
                        .replace(/\s*\(\s*m\s*\)/gi, '')
                        .replace(/\s*\(\s*f(?:em)?\s*\)/gi, ' (F)')
                        .trim();
                    away = parts[1]
                        .replace(/\s*\(\s*m\s*\)/gi, '')
                        .replace(/\s*\(\s*f(?:em)?\s*\)/gi, ' (F)')
                        .trim();
                    break;
                }
            }

            // Localizar marcador: "2 - 1"
            for (const l of blockLines) {
                if (/^\d+\s*[-–—]\s*\d+$/.test(l)) {
                    score = l.replace(/\s+/g, ' ').replace(/[–—]/g, '-').trim();
                    break;
                }
            }

            // Localizar signo oficial de quiniela (1, X, 2 o formato 1-M para P15)
            const isP15 = num === 15;
            for (const l of blockLines) {
                if (isP15) {
                    const p15M = l.match(/^([012M]\s*[-–—]\s*[012M])$/i);
                    if (p15M) {
                        sign = p15M[1].replace(/\s+/g, '').replace(/[–—]/g, '-').toUpperCase();
                        break;
                    }
                } else {
                    if (/^[1X2]$/i.test(l)) {
                        sign = l.trim().toUpperCase();
                        break;
                    }
                }
            }

            // Derivación de respaldo si el signo no venía explícito pero sí el marcador
            if (!sign && score) {
                const parts = score.split('-').map(s => parseInt(s.trim(), 10));
                if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                    if (isP15) {
                        const toPlenoGoal = g => g >= 3 ? 'M' : String(g);
                        sign = `${toPlenoGoal(parts[0])}-${toPlenoGoal(parts[1])}`;
                    } else {
                        sign = parts[0] > parts[1] ? '1' : (parts[0] < parts[1] ? '2' : 'X');
                    }
                }
            }

            result.matches[num - 1] = {
                home: home || `Equipo ${num}A`,
                away: away || `Equipo ${num}B`,
                score: score,
                result: sign
            };
        }

        // 4. Extraer Premios por Categoría
        const parseEuro = (str) => {
            if (!str) return 0;
            const match = str.match(/([\d\.,]+)\s*€?/);
            if (!match) return 0;
            const clean = match[1].replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.');
            const val = parseFloat(clean);
            return isNaN(val) ? 0 : val;
        };

        const catDefs = [
            { cat: '15', label: 'Pleno al 15', regex: /pleno\s*al\s*15/i },
            { cat: '14', label: '1ª (14 Aciertos)', regex: /1[ªa]?\s*\(\s*14\s*aciertos\s*\)|14\s*aciertos/i },
            { cat: '13', label: '2ª (13 Aciertos)', regex: /2[ªa]?\s*\(\s*13\s*aciertos\s*\)|13\s*aciertos/i },
            { cat: '12', label: '3ª (12 Aciertos)', regex: /3[ªa]?\s*\(\s*12\s*aciertos\s*\)|12\s*aciertos/i },
            { cat: '11', label: '4ª (11 Aciertos)', regex: /4[ªa]?\s*\(\s*11\s*aciertos\s*\)|11\s*aciertos/i },
            { cat: '10', label: '5ª (10 Aciertos)', regex: /5[ªa]?\s*\(\s*10\s*aciertos\s*\)|10\s*aciertos/i }
        ];

        catDefs.forEach(({ cat, label, regex }) => {
            let foundAmount = 0;
            let foundWinners = 0;

            for (let idx = 0; idx < lines.length; idx++) {
                const line = lines[idx];
                if (regex.test(line)) {
                    if (line.includes('€')) {
                        const euroMatch = line.match(/([\d\.,]+)\s*€/);
                        if (euroMatch) foundAmount = parseEuro(euroMatch[0]);
                        const beforeEuro = line.substring(0, line.lastIndexOf('€')).replace(regex, '').trim();
                        const winMatch = beforeEuro.match(/(\d+(?:\.\d+)*)/);
                        if (winMatch) foundWinners = parseInt(winMatch[1].replace(/\./g, ''), 10);
                    } else {
                        for (let j = idx + 1; j < Math.min(idx + 6, lines.length); j++) {
                            const nextLine = lines[j];
                            if (catDefs.some(cd => cd.cat !== cat && cd.regex.test(nextLine))) break;

                            if (nextLine.includes('€')) {
                                foundAmount = parseEuro(nextLine);
                                break;
                            } else if (/^\d+(?:\.\d+)*$/.test(nextLine)) {
                                foundWinners = parseInt(nextLine.replace(/\./g, ''), 10);
                            }
                        }
                    }
                    break;
                }
            }

            result.prizes[cat] = foundAmount;
            result.prizesDetails.push({
                category: cat,
                label: label,
                winners: foundWinners,
                amount: foundAmount
            });
        });

        // Validar integridad
        const validMatchesCount = result.matches.filter(m => m && m.result).length;
        if (result.jNum && validMatchesCount >= 14) {
            result.success = true;
        } else {
            result.errors.push(`Se detectaron signos válidos para ${validMatchesCount} de 15 partidos.`);
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
