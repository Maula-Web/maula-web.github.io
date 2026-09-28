/**
 * Utility functions for Dates, Teams and Formats.
 * Centralizes logic used across Jornadas, RSS Import, and PDF Import.
 */

var AppUtils = window.AppUtils || {

    currentTeams: null, // Dynamic list from Firestore
    activeSeason: '2026-2027',

    // --- DATE HELPERS ---

    months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],

    /**
     * Checks if a string contains a date-like month text
     */
    isDateString(str) {
        if (!str) return false;
        const low = str.toLowerCase();
        return this.months.some(m => low.includes(m));
    },

    _dateCache: new Map(),

    /**
     * Parsing flexible date strings to Date object
     * Supports: "dd/mm/yyyy", "dd de mes de yyyy", "dd mes yyyy"
     */
    parseDate(dateStr) {
        if (!dateStr) return null;
        if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
        if (typeof dateStr === 'number') return new Date(dateStr);
        if (typeof dateStr !== 'string') return null;

        const trimmed = dateStr.trim();
        if (trimmed.toLowerCase() === 'por definir') return null;

        if (this._dateCache && this._dateCache.has(trimmed)) {
            const cached = this._dateCache.get(trimmed);
            return cached ? new Date(cached.getTime()) : null;
        }

        let parsed = null;
        try {
            // 1. Try standard YYYY-MM-DD or YYYY/MM/DD (e.g. 2026-08-01, 2026-09-22)
            const isoMatch = trimmed.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
            if (isoMatch) {
                const year = parseInt(isoMatch[1], 10);
                const month = parseInt(isoMatch[2], 10) - 1;
                const day = parseInt(isoMatch[3], 10);
                return this._cacheDate(trimmed, new Date(year, month, day));
            }

            // 2. Try standard DD/MM/YYYY or DD-MM-YYYY (e.g. 16-08-2026, 23/08/2026)
            const dmyMatch = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
            if (dmyMatch) {
                const day = parseInt(dmyMatch[1], 10);
                const month = parseInt(dmyMatch[2], 10) - 1;
                const year = parseInt(dmyMatch[3], 10);
                return this._cacheDate(trimmed, new Date(year, month, day));
            }

            // 3. Flexible 3-part separator fallback
            if (trimmed.match(/\d+[\/-]\d+[\/-]\d+/)) {
                const parts = trimmed.split(/[\/-]/);
                if (parts.length === 3) {
                    if (parts[0].length === 4) {
                        return this._cacheDate(trimmed, new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)));
                    } else {
                        return this._cacheDate(trimmed, new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)));
                    }
                }
            }

            // 4. Try text format "24 de agosto de 2025"
            let clean = trimmed.toLowerCase()
                .replace(/\(.*\)/, '') // remove (text)
                .replace(/\bde\b/g, '') // remove 'de'
                .replace(/,/g, '')      // remove commas
                .replace(/\s+/g, ' ')   // normalize spaces
                .trim();

            const parts = clean.split(' ');
            if (parts.length >= 2) {
                // Find day (digits)
                const day = parseInt(parts.find(p => /^\d{1,2}$/.test(p)));
                // Find year (4 digits)
                const year = parseInt(parts.find(p => /^\d{4}$/.test(p)) || new Date().getFullYear());
                // Find month
                const monthIdx = (this.months || ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']).findIndex(m => clean.includes(m));

                if (!isNaN(day) && monthIdx !== -1) {
                    return this._cacheDate(trimmed, new Date(year, monthIdx, day));
                }
            }

            // 5. Native Date parse fallback (e.g. ISO string with time)
            const fallback = new Date(trimmed);
            if (!isNaN(fallback.getTime())) {
                return this._cacheDate(trimmed, fallback);
            }
        } catch (e) { console.warn('Date parse error', e); }
        return this._cacheDate(trimmed, null);
    },

    _cacheDate(key, d) {
        if (!this._dateCache) this._dateCache = new Map();
        if (this._dateCache.size > 500) this._dateCache.clear();
        this._dateCache.set(key, d);
        return d ? new Date(d.getTime()) : null;
    },

    /**
     * Checks if a date is Sunday (Day 0)
     */
    isSunday(dateObj) {
        return dateObj && dateObj.getDay() === 0;
    },

    /**
     * Logic to extract the Sunday date from a range like "3-4 de enero"
     */
    extractSundayFromRange(dateStr) {
        if (!dateStr) return '';

        // 1. Range across months: "31 enero - 1 febrero"
        const matchAcrossMonths = dateStr.match(/(\d{1,2})\s+([a-zñáéíóúü]+)\s*[-–]\s*(\d{1,2})\s+([a-zñáéíóúü]+)/i);
        if (matchAcrossMonths) {
            // We want the part after the hyphen: "1 de febrero"
            return `${matchAcrossMonths[3]} de ${matchAcrossMonths[4]}`;
        }

        // 2. Range within same month: "3-4 de enero"
        const matchSameMonth = dateStr.match(/(\d{1,2})[-–\/](\d{1,2})/);
        if (matchSameMonth) {
            // Replaces the range "3-4" with just "4" (Sun)
            return dateStr.replace(matchSameMonth[0], matchSameMonth[2]);
        }

        return dateStr;
    },

    // --- TEAM HELPERS ---

    /**
     * Normalizes a team name for comparison (lowercase, unaccented)
     */
    normalizeName(name) {
        if (!name) return '';
        return name.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
            .replace(/[^a-z0-9]/g, ""); // Remove non-alphanumeric
    },

    /**
     * Formatting: Capitalizes words and handles special spacing
     * "at. madrid" -> "At. Madrid"
     */
    formatTeamName(name) {
        if (!name) return '';
        let fixed = name.toLowerCase().trim();

        // Remove known artifacts
        fixed = fixed.replace(/\s+p$/, '').replace(/\s+jornada$/, '');

        // Capitalize
        return fixed.replace(/(?:^|\s|\.)\S/g, a => a.toUpperCase());
    },

    /**
     * Calculates the forecast deadline for a jornada.
     * Rule: Thursday 17:00 (3 days before the Sunday match).
     * @param {string|Date} dateStr - The jornada date (Sunday).
     * @returns {Date|null} The deadline Date object, or null if dateStr is invalid.
     */
    calculateDeadline(dateStr) {
        const d = dateStr instanceof Date ? dateStr : this.parseDate(dateStr);
        if (!d) return null;
        const deadline = new Date(d.getTime());
        deadline.setDate(d.getDate() - 3); // Jueves si la jornada es domingo
        deadline.setHours(17, 0, 0, 0);
        return deadline;
    },

    /**
     * Checks if a team string is likely a 1st Division Team (LaLiga EA)
     * Used for filtering
     */
    isLaLigaTeam(name) {
        // Lista de equipos de Primera División 2026-2027
        // Bajan: Real Oviedo, Girona, Mallorca
        // Suben: Real Racing Club, RC Deportivo, Málaga CF
        const keywords = [
            'real madrid', 'barcelona', 'atlético', 'at. madrid', 'sevilla', 'betis',
            'real sociedad', 'athletic', 'valencia', 'villarreal', 'osasuna',
            'celta', 'rayo', 'getafe', 'alavés', 'espanyol', 'elche',
            'levante', 'bilbao', 'racing', 'deportivo', 'málaga', 'malaga'
        ];
        const norm = this.normalizeName(name);
        // Simple inclusion check on normalized strings
        return keywords.some(k => norm.includes(this.normalizeName(k)));
    },

    /**
     * Returns the logo path for a given team name
     * Central repository of paths
     */
    getTeamLogo(teamName) {
        if (!teamName) return '';
        const t = teamName.toLowerCase().trim();

        const map = {
            'alavés': 'escudos/primera/Deportivo-Alavés-S.A.D..png',
            'alaves': 'escudos/primera/Deportivo-Alavés-S.A.D..png',
            'almeria': 'escudos/segunda/ALMERIA.png',
            'almería': 'escudos/segunda/ALMERIA.png',
            'athletic club': 'escudos/primera/ATHLETIC_BILBAO-150x150.png',
            'athletic': 'escudos/primera/ATHLETIC_BILBAO-150x150.png',
            'atlético de madrid': 'escudos/primera/ATLÉTICO_MADRID-150x150.png?v=4',
            'at. madrid': 'escudos/primera/ATLÉTICO_MADRID-150x150.png?v=4',
            'atlético': 'escudos/primera/ATLÉTICO_MADRID-150x150.png?v=4',
            'barcelona': 'escudos/primera/BARCELONA-150x150.png',
            'real betis': 'escudos/primera/REAL-BETIS-150x150.png',
            'betis': 'escudos/primera/REAL-BETIS-150x150.png',
            'celta de vigo': 'escudos/primera/CELTA-150x150.png',
            'celta': 'escudos/primera/CELTA-150x150.png',
            'elche': 'escudos/primera/ELCHE-150x150.png',
            'espanyol': 'escudos/primera/ESPANYOL-150x150.png',
            'getafe': 'escudos/primera/GETAFE-150x150.png',
            'girona': 'escudos/segunda/Girona-FC-2022.png',
            'las palmas': 'escudos/segunda/LAS-PALMAS-150x150.png',
            'ud las palmas': 'escudos/segunda/LAS-PALMAS-150x150.png',
            'levante': 'escudos/primera/LEVANTE-150x150.png',
            'mallorca': 'escudos/segunda/MALLORCA-150x150.png',
            'osasuna': 'escudos/primera/OSASUNA-150x150.png',
            'rayo vallecano': 'escudos/primera/RAYO-VALLECANO-150x150.png',
            'rayo': 'escudos/primera/RAYO-VALLECANO-150x150.png',
            'rayo v.': 'escudos/primera/RAYO-VALLECANO-150x150.png',
            'rayo v': 'escudos/primera/RAYO-VALLECANO-150x150.png',
            'real madrid': 'escudos/primera/REAL-MADRID-150x150.png',
            'r. madrid': 'escudos/primera/REAL-MADRID-150x150.png',
            'r.madrid': 'escudos/primera/REAL-MADRID-150x150.png',
            'real sociedad': 'escudos/primera/REAL-SOCIEDAD-150x150.png',
            'r. sociedad': 'escudos/primera/REAL-SOCIEDAD-150x150.png',
            'r.sociedad': 'escudos/primera/REAL-SOCIEDAD-150x150.png',
            'sevilla': 'escudos/primera/SEVILLA-150x150.png',
            'valencia': 'escudos/primera/VALENCIA-150x150.png',
            'real valladolid': 'escudos/segunda/Real-Valladolid-CF.png',
            'valladolid': 'escudos/segunda/Real-Valladolid-CF.png',
            'r. valladolid': 'escudos/segunda/Real-Valladolid-CF.png',
            'r.valladolid': 'escudos/segunda/Real-Valladolid-CF.png',
            'villarreal': 'escudos/primera/VILLARREAL-150x150.png',
            'albacete': 'escudos/segunda/ALBACETE-150x150.png',
            'andorra': 'escudos/segunda/ANDORRA-150x150.png',
            'burgos': 'escudos/segunda/BURGOS-150x150.png',
            'cádiz': 'escudos/segunda/CADIZ-150x150.png',
            'cadiz': 'escudos/segunda/CADIZ-150x150.png',
            'castellón': 'escudos/segunda/CASTELLON-150x150.png',
            'ceuta': 'escudos/segunda/AD-Ceuta-FC-150x150.png',
            'córdoba': 'escudos/segunda/CORDOBA-150x150.png',
            'cordoba': 'escudos/segunda/CORDOBA-150x150.png',
            'cultural leonesa': 'escudos/segunda/CULTURAL-150x150.png',
            'deportivo': 'escudos/primera/DEPORTIVO-150x150.png',
            'eibar': 'escudos/segunda/EIBAR-150x150.png',
            'eldense': 'escudos/segunda/Eldense.png',
            'celta fortuna': 'escudos/segunda/CELTA-FORTUNA150x150.png',
            'celta b': 'escudos/segunda/CELTA-FORTUNA150x150.png',
            'granada': 'escudos/segunda/GRANADA-150x150.png',
            'leganés': 'escudos/segunda/LEGANES-150x150.png',
            'leganes': 'escudos/segunda/LEGANES-150x150.png',
            'málaga': 'escudos/primera/MALAGA-150x150.png',
            'malaga': 'escudos/primera/MALAGA-150x150.png',
            'racing santander': 'escudos/primera/REAL-RACING-150x150.png',
            'real oviedo': 'escudos/segunda/REAL-OVIEDO-150x150.png',
            'oviedo': 'escudos/segunda/REAL-OVIEDO-150x150.png',
            'real sporting': 'escudos/segunda/REAL-SPORTING-150x150.png',
            'sporting': 'escudos/segunda/REAL-SPORTING-150x150.png',
            'tenerife': 'escudos/segunda/CD Tenerife.png',
            'cd tenerife': 'escudos/segunda/CD Tenerife.png',
            'sabadell': 'escudos/segunda/CD Sabadell.png',
            'cd sabadell': 'escudos/segunda/CD Sabadell.png',
            'alcorcón': 'escudos/OTROS/ALCORCON.png',
            'alcorcon': 'escudos/OTROS/ALCORCON.png',
            'racing de ferrol': 'escudos/OTROS/FERROL.png',
            'racing ferrol': 'escudos/OTROS/FERROL.png',
            'ferrol': 'escudos/OTROS/FERROL.png',
            'hércules': 'escudos/OTROS/HERCULES.png',
            'hercules': 'escudos/OTROS/HERCULES.png',
            'ibiza': 'escudos/OTROS/Ibiza.png',
            'ud ibiza': 'escudos/OTROS/Ibiza.png',
            'marbella': 'escudos/OTROS/MARBELLA.png',
            'mérida': 'escudos/OTROS/Merida.png',
            'merida': 'escudos/OTROS/Merida.png',
            'ourense': 'escudos/OTROS/Ourense.png',
            'ponferradina': 'escudos/OTROS/PONFERRADINA.png',
            'real sociedad b': 'escudos/OTROS/REAL-SOCIEDAD-B.png',
            'sanse': 'escudos/OTROS/REAL-SOCIEDAD-B.png',
            'pontevedra': 'escudos/OTROS/pontevedra.png',
            'zamora': 'escudos/OTROS/zamora.png',

            // Femeninos
            'badalona (f)': 'escudos/Femeninos/Badalona (f).png',
            'badalona w. (f)': 'escudos/Femeninos/Badalona (f).png',
            'badalona w.': 'escudos/Femeninos/Badalona (f).png',
            'badalona w': 'escudos/Femeninos/Badalona (f).png',
            'badalona': 'escudos/Femeninos/Badalona (f).png',
            'levante badalona': 'escudos/Femeninos/Badalona (f).png',
            'levante badalona (f)': 'escudos/Femeninos/Badalona (f).png',

            'logroño (f)': 'escudos/Femeninos/Logroño (f).png',
            'logrono (f)': 'escudos/Femeninos/Logroño (f).png',
            'logroño': 'escudos/Femeninos/Logroño (f).png',
            'logrono': 'escudos/Femeninos/Logroño (f).png',
            'dux logroño': 'escudos/Femeninos/Logroño (f).png',
            'dux logroño (f)': 'escudos/Femeninos/Logroño (f).png',
            'dux logrono': 'escudos/Femeninos/Logroño (f).png',
            'dux logrono (f)': 'escudos/Femeninos/Logroño (f).png',

            'madrid cff (f)': 'escudos/Femeninos/Madrid CFF (f).png',
            'madrid cff': 'escudos/Femeninos/Madrid CFF (f).png',
            'madrid c.f.f. (f)': 'escudos/Femeninos/Madrid CFF (f).png',
            'madrid c.f.f.': 'escudos/Femeninos/Madrid CFF (f).png',
            'madrid cf (f)': 'escudos/Femeninos/Madrid CFF (f).png',
            'madrid cf': 'escudos/Femeninos/Madrid CFF (f).png',
            'madrid fem': 'escudos/Femeninos/Madrid CFF (f).png'
        };

        // 1. Direct match
        if (map[t]) return map[t];

        // 2. Fuzzy match (contains unique keyword)
        const entries = Object.entries(map);
        const fuzzyMatch = entries.find(([key]) => t.includes(key) || key.includes(t));
        return fuzzyMatch ? fuzzyMatch[1] : '';
    },

    /**
     * Returns true if a team name represents a female team.
     * Handles all real-world variations:
     * - Parenthesized or bracketed: "(F)", "(f)", "( F )", "(Fem)", "(fem.)", "[F]", etc.
     * - Explicit keywords: "Femenino", "Femenina", "Femení", "Fem", "Féminas"
     * - Trailing suffix: " F", " f", " - F", " / F", " F." (e.g. "R.Madrid F", "Barcelona f", "At.Madrid F")
     */
    isFemaleTeam(name) {
        if (!name) return false;
        const s = String(name).trim();
        // 1. Parentheses or brackets containing F or Fem: (F), (f), (Fem), [F], etc.
        if (/[\(\[\{]\s*f(?:em[a-z]*)?\.?\s*[\)\]\}]/i.test(s)) return true;
        // 2. Trailing F: e.g. 'R.Madrid F', 'R.Madrid f', 'At.Madrid F.', 'Madrid CCF F'
        if (/(?:[\s\-_/]+)f\.?$/i.test(s)) return true;
        // 3. Normalized text check for words: femenino, femenina, femeni, feminas, fem
        const unaccented = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (/\b(?:femenin[oa]s?|femeni|feminas|fem)\b/i.test(unaccented)) return true;
        return false;
    },

    /**
     * Returns true if a team name represents a reserve/filial team (e.g. B, Castilla, Filial).
     * Reserve teams are not PIG.
     */
    isReserveTeam(name) {
        if (!name) return false;
        const s = String(name).trim();
        return /\b(?:[b-d]|castilla|filial|juvenil)\b/i.test(s);
    },

    /**
     * Unifies and standardizes a team name:
     * - Normalizes common abbreviations (R.Madrid -> Real Madrid, At.Madrid -> Atlético, etc.)
     * - Standardizes female teams to always end with " (F)"
     */
    normalizeTeamName(name) {
        if (!name) return '';
        const raw = String(name).trim();
        const female = this.isFemaleTeam(raw);

        // If female, strip the female tag from the base name
        let base = raw;
        if (female) {
            base = base
                .replace(/[\(\[\{]\s*f(?:em[a-z]*)?\.?\s*[\)\]\}]/gi, '')
                .replace(/(?:[\s\-_/]+)f\.?$/gi, '')
                .replace(/(?:^|\s|[\-_/])(?:femenin[oa]s?|femen[íi]|f[ée]minas|fem)(?:$|\s|[\-_/])/gi, ' ')
                .trim();
        }

        const map = {
            'R Madrid': 'Real Madrid',
            'RMadrid': 'Real Madrid',
            'R. Madrid': 'Real Madrid',
            'R.Madrid': 'Real Madrid',
            'R Sociedad': 'Real Sociedad',
            'RSociedad': 'Real Sociedad',
            'R. Sociedad': 'Real Sociedad',
            'R.Sociedad': 'Real Sociedad',
            'R Zaragoza': 'Real Zaragoza',
            'RZaragoza': 'Real Zaragoza',
            'R Oviedo': 'Real Oviedo',
            'ROviedo': 'Real Oviedo',
            'R Racing': 'Racing',
            'R Sporting': 'Sporting',
            'RSporting': 'Sporting',
            'R. Sporting': 'Sporting',
            'R.Sporting': 'Sporting',
            'At Madrid': 'Atlético',
            'AtMadrid': 'Atlético',
            'At. Madrid': 'Atlético',
            'At.Madrid': 'Atlético',
            'Atlético de Madrid': 'Atlético',
            'Atletico de Madrid': 'Atlético',
            'Atlético Madrid': 'Atlético',
            'Atletico Madrid': 'Atlético',
            'FC Barcelona': 'Barcelona',
            'F.C. Barcelona': 'Barcelona',
            'Barça': 'Barcelona',
            'Barca': 'Barcelona',
            'Rayo V': 'Rayo Vallecano',
            'RayoV': 'Rayo Vallecano',
            'Espanyol': 'RCD Espanyol',
            'Athletic': 'Athletic Club',
            'Ath Club': 'Athletic Club',
            'CultLeonesa': 'Cultural Leonesa',
            'Castellon': 'Castellón',
            'Alaves': 'Alavés',
            'Malaga': 'Málaga',
            'Cadiz': 'Cádiz',
            'Cordoba': 'Córdoba',
            'La Coruña': 'Deportivo',
            'Elda': 'Eldense'
        };

        const cleanBase = base.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
        let mapped = map[base] || map[cleanBase] || base;

        return female ? `${mapped} (F)` : mapped;
    },

    /**
     * Determines which of the 3 PIG clubs a team name corresponds to:
     * - 'REAL_MADRID'
     * - 'ATLETICO_MADRID'
     * - 'BARCELONA'
     * Returns null if not a PIG club, or if it is a female team or reserve team.
     */
    getPigClub(name) {
        if (!name || this.isFemaleTeam(name) || this.isReserveTeam(name)) return null;

        const norm = this.normalizeName(name);

        // 1. Real Madrid
        // Matches: 'realmadrid', 'rmadrid'
        if (/^(?:realmadrid|rmadrid)$/.test(norm)) {
            return 'REAL_MADRID';
        }

        // 2. Atlético de Madrid
        // Matches: 'atleticodemadrid', 'atleticomadrid', 'atmadrid', 'atletico'
        // Does NOT match: 'atleticobaleares', 'atleticosanluqueno', etc.
        if (/^(?:atletico(?:de)?madrid|atmadrid|atletico)$/.test(norm)) {
            return 'ATLETICO_MADRID';
        }

        // 3. Barcelona
        // Matches: 'barcelona', 'fcbarcelona', 'barca', 'futbolclubbarcelona'
        if (/^(?:(?:fc|futbolclub)?barcelona|barca)$/.test(norm)) {
            return 'BARCELONA';
        }

        return null;
    },

    /**
     * Checks if a match is considered "PIG" (Partido de Interés General).
     * Requirements:
     * 1. Both teams must be from the big 3: Real Madrid, Atlético de Madrid, Barcelona.
     * 2. The two teams must be distinct clubs (e.g. Real Madrid vs Barcelona, At.Madrid vs Real Madrid, etc.)
     * 3. Female teams NEVER activate PIG (e.g. Real Madrid (F) vs Barcelona (F) is NOT PIG).
     * 4. Reserve/filial teams NEVER activate PIG (e.g. Real Madrid Castilla or Celta B is NOT PIG).
     */
    isPigMatch(home, away) {
        const clubHome = this.getPigClub(home);
        const clubAway = this.getPigClub(away);
        if (!clubHome || !clubAway) return false;
        return clubHome !== clubAway;
    },

    /**
     * Returns the name to display for a member (Nickname if exists, Name otherwise)
     */
    getMemberName(member) {
        if (!member) return 'Invitado';
        // We use 'phone' field as Nickname per user request
        return (member.phone && member.phone.trim() !== '') ? member.phone : member.name;
    },

    /**
     * Formats a number as Euro currency (Spanish format: 1.234,56 €)
     */
    formatEuro(value) {
        if (value === null || value === undefined || isNaN(value)) return '0,00 €';
        const num = Number(value);
        const parts = num.toFixed(2).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return `${parts[0]},${parts[1]} €`;
    },

    /**
     * Formats a number in Spanish notation (1.234,56)
     */
    formatNumberEs(value, decimals = 2) {
        if (value === null || value === undefined || isNaN(value)) return '0,00';
        const num = Number(value);
        const parts = num.toFixed(decimals).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return `${parts[0]},${parts[1]}`;
    },

    /**
     * Parses a string with Euro format back to a float
     */
    parseEuro(str) {
        if (!str) return 0;
        // Remove currency symbol, whitespace and thousand separators (points)
        // Change decimal separator (comma) to point
        const clean = str.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.');
        const val = parseFloat(clean);
        return isNaN(val) ? 0 : val;
    }
};



window.AppUtils = AppUtils;

/**
 * Global UI Features (Clock)
 * Injected automatically since utils.js is present on all pages.
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Create Clock Element
    const clockId = 'maulas-global-clock';
    if (!document.getElementById(clockId)) {
        const clockDiv = document.createElement('div');
        clockDiv.id = clockId;
        clockDiv.style.position = 'fixed';
        clockDiv.style.bottom = '10px';
        clockDiv.style.right = '10px';
        
        const isInitialLight = (window.AppTheme && window.AppTheme.getTheme() === 'light') || document.documentElement.classList.contains('light-theme');
        if (isInitialLight) {
            clockDiv.style.background = 'rgba(255, 255, 255, 0.95)';
            clockDiv.style.color = '#334155';
            clockDiv.style.border = '1px solid #e8dfcf';
            clockDiv.style.boxShadow = '0 4px 15px rgba(120, 90, 40, 0.12)';
        } else {
            clockDiv.style.background = 'rgba(0, 0, 0, 0.7)';
            clockDiv.style.color = '#fff';
            clockDiv.style.border = 'none';
            clockDiv.style.boxShadow = '0 0 5px rgba(0,0,0,0.3)';
        }

        clockDiv.style.padding = '5px 10px';
        clockDiv.style.borderRadius = '8px';
        clockDiv.style.fontFamily = 'monospace';
        clockDiv.style.fontSize = '0.85rem';
        clockDiv.style.zIndex = '9990';
        clockDiv.style.pointerEvents = 'none'; // Click through
        clockDiv.style.userSelect = 'none';
        document.body.appendChild(clockDiv);

        // Update Function
        const updateClock = () => {
            const now = new Date();
            const dateStr = now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            // Get User Name
            let userName = 'Invitado';
            try {
                const u = JSON.parse(sessionStorage.getItem('maulas_user'));
                if (u) userName = AppUtils.getMemberName(u);
            } catch (e) { }

            const isLight = document.documentElement.classList.contains('light-theme');
            const userColor = isLight ? '#b45309' : '#ffd54f';
            clockDiv.innerHTML = `<span style="color:${userColor}; font-weight:bold; margin-right:10px;">👤 ${userName}</span> ${dateStr} ${timeStr}`;
        };

        // Start
        updateClock();
        setInterval(updateClock, 1000);

        // Telegram Weekly Reminder Check
        // We delay slightly to ensure TelegramService is fully initialized if needed
        setTimeout(() => {
            if (window.TelegramService && typeof window.TelegramService.checkThursdayReminder === 'function') {
                window.TelegramService.checkThursdayReminder();
            }
        }, 3000);
    }
});

// =========================================================================
// GESTOR DE VERSIONES DE LA APLICACIÓN (V1 CLÁSICA <-> V2.0 PRO)
// =========================================================================
window.AppVersion = {
    PAGE_MAP: {
        inicio: { v1: 'index.html', v2: 'dashboard_2.html' },
        socios: { v1: 'socios.html', v2: 'socios_2.html' },
        bote: { v1: 'bote.html', v2: 'bote_2.html' },
        jornadas: { v1: 'jornadas.html', v2: 'jornadas_2.html' },
        pronosticos: { v1: 'pronosticos.html', v2: 'pronosticos_2.html' },
        clasificacion: { v1: 'resultados.html', v2: 'clasificacion_2.html' },
        resumen: { v1: 'resumen-temporada.html', v2: 'resumen_2.html' },
        votaciones: { v1: 'votaciones.html', v2: 'votaciones_2.html' },
        admin: { v1: 'admin.html', v2: 'admin_2.html' }
    },

    COUNTERPARTS: {
        'index.html': 'dashboard_2.html',
        'dashboard_2.html': 'index.html',
        'socios.html': 'socios_2.html',
        'socios_2.html': 'socios.html',
        'bote.html': 'bote_2.html',
        'bote_2.html': 'bote.html',
        'jornadas.html': 'jornadas_2.html',
        'jornadas_2.html': 'jornadas.html',
        'pronosticos.html': 'pronosticos_2.html',
        'pronosticos_2.html': 'pronosticos.html',
        'resultados.html': 'clasificacion_2.html',
        'clasificacion_2.html': 'resultados.html',
        'resultados_2.html': 'resultados.html',
        'resumen-temporada.html': 'resumen_2.html',
        'resumen_2.html': 'resumen-temporada.html',
        'votaciones.html': 'votaciones_2.html',
        'votaciones_2.html': 'votaciones.html',
        'admin.html': 'admin_2.html',
        'admin_2.html': 'admin.html'
    },

    getMode() {
        const stored = localStorage.getItem('maulas_version_mode');
        if (stored === 'v1' || stored === 'v2') return stored;
        const file = window.location.pathname.split('/').pop() || '';
        if (file.includes('_2') || file === 'dashboard_2.html') return 'v2';
        return 'v1';
    },

    setMode(mode) {
        localStorage.setItem('maulas_version_mode', mode);
        this.updateButtons(mode);
        this.updateLinks(mode);
    },

    switchMode(targetMode) {
        localStorage.setItem('maulas_version_mode', targetMode);
        const currFile = window.location.pathname.split('/').pop() || '';
        const counterpart = this.COUNTERPARTS[currFile];

        if (counterpart) {
            window.location.href = counterpart;
        } else {
            this.updateButtons(targetMode);
            this.updateLinks(targetMode);
        }
    },

    updateButtons(mode) {
        document.querySelectorAll('[data-version-btn="v1"], #btn-version-v1').forEach(btn => {
            if (mode === 'v1') {
                btn.className = 'px-2 sm:px-2.5 py-1 rounded-lg text-xs font-bold transition bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow';
            } else {
                btn.className = 'px-2 sm:px-2.5 py-1 rounded-lg text-xs font-semibold transition text-slate-400 hover:text-white';
            }
        });
        document.querySelectorAll('[data-version-btn="v2"], #btn-version-v2').forEach(btn => {
            if (mode === 'v2') {
                btn.className = 'px-2 sm:px-2.5 py-1 rounded-lg text-xs font-bold transition bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow';
            } else {
                btn.className = 'px-2 sm:px-2.5 py-1 rounded-lg text-xs font-semibold transition text-slate-400 hover:text-white';
            }
        });
    },

    updateLinks(mode) {
        document.querySelectorAll('[data-version-link]').forEach(el => {
            const key = el.getAttribute('data-version-link');
            if (this.PAGE_MAP[key]) {
                el.href = this.PAGE_MAP[key][mode];
            }
        });
    },

    init() {
        const mode = this.getMode();
        this.updateButtons(mode);
        this.updateLinks(mode);
    }
};

// =========================================================================
// GESTOR DE TEMA (MODO OSCURO INTACTO <-> MODO CLARO ALTA GAMA)
// =========================================================================
window.AppTheme = {
    getTheme() {
        const stored = localStorage.getItem('maulas_theme_mode');
        if (stored === 'light' || stored === 'dark') return stored;
        return 'dark'; // Modo oscuro 100% intacto por defecto
    },

    setTheme(theme) {
        localStorage.setItem('maulas_theme_mode', theme);
        this.applyTheme(theme);
    },

    toggle() {
        const current = this.getTheme();
        const next = (current === 'light') ? 'dark' : 'light';
        this.setTheme(next);
    },

    applyTheme(theme) {
        const root = document.documentElement;
        const body = document.body;
        if (theme === 'light') {
            root.classList.remove('dark');
            root.classList.add('light-theme');
            if (body) {
                body.classList.remove('dark');
                body.classList.add('light-theme');
            }
        } else {
            root.classList.remove('light-theme');
            root.classList.add('dark');
            if (body) {
                body.classList.remove('light-theme');
                body.classList.add('dark');
            }
        }

        const clockDiv = document.getElementById('maulas-global-clock');
        if (clockDiv) {
            if (theme === 'light') {
                clockDiv.style.background = 'rgba(255, 255, 255, 0.95)';
                clockDiv.style.color = '#334155';
                clockDiv.style.border = '1px solid #e8dfcf';
                clockDiv.style.boxShadow = '0 4px 15px rgba(120, 90, 40, 0.12)';
            } else {
                clockDiv.style.background = 'rgba(0, 0, 0, 0.7)';
                clockDiv.style.color = '#fff';
                clockDiv.style.border = 'none';
                clockDiv.style.boxShadow = '0 0 5px rgba(0,0,0,0.3)';
            }
        }

        this.updateButtons(theme);
    },

    updateButtons(theme) {
        document.querySelectorAll('[data-theme-btn="light"], #btn-theme-light').forEach(btn => {
            if (theme === 'light') {
                btn.className = 'px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow';
            } else {
                btn.className = 'px-2 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 text-slate-400 hover:text-white';
            }
        });
        document.querySelectorAll('[data-theme-btn="dark"], #btn-theme-dark').forEach(btn => {
            if (theme === 'dark') {
                btn.className = 'px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow';
            } else {
                btn.className = 'px-2 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 text-slate-400 hover:text-white';
            }
        });
    },

    init() {
        const theme = this.getTheme();
        this.applyTheme(theme);
    }
};

// Inicializar de inmediato para evitar parpadeos
if (typeof window !== 'undefined' && window.AppTheme) {
    window.AppTheme.init();
}

// Inicializar al cargar el DOM
if (typeof document !== 'undefined') {
    const onDomReady = () => {
        if (window.AppVersion) window.AppVersion.init();
        if (window.AppTheme) window.AppTheme.init();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onDomReady);
    } else {
        onDomReady();
    }
}

// ==========================================================================
// CONTROLADOR UNIVERSAL DE TARJETAS PLEGABLES EN MÓVIL (KPIs COMPACTOS)
// ==========================================================================
if (typeof window !== 'undefined') {
    window.toggleKpiCard = function(triggerEl) {
        if (window.innerWidth >= 1024) return; // En PC siempre desplegado
        const card = triggerEl.closest('.collapsible-kpi') || triggerEl;
        if (!card) return;
        const body = card.querySelector('.collapsible-kpi-body');
        const chevron = card.querySelector('.kpi-chevron');
        if (!body) return;

        const isHidden = body.classList.contains('hidden');
        if (isHidden) {
            body.classList.remove('hidden');
            if (chevron) chevron.classList.add('rotate-180');
            card.classList.add('kpi-is-expanded');
        } else {
            body.classList.add('hidden');
            if (chevron) chevron.classList.remove('rotate-180');
            card.classList.remove('kpi-is-expanded');
        }

        // Actualizar el estado del botón maestro de la sección si existe
        const section = card.closest('section') || card.closest('.kpi-container') || card.parentElement;
        if (section) {
            const masterBtn = section.querySelector('.kpi-master-btn');
            if (masterBtn) {
                const allBodies = section.querySelectorAll('.collapsible-kpi-body');
                const anyHidden = Array.from(allBodies).some(b => b.classList.contains('hidden'));
                const masterText = masterBtn.querySelector('.kpi-master-text');
                const masterIcon = masterBtn.querySelector('.kpi-master-icon');
                if (masterText) masterText.textContent = anyHidden ? 'Desplegar todos' : 'Plegar todos';
                if (masterIcon) masterIcon.textContent = anyHidden ? '▼' : '▲';
            }
        }
    };

    window.toggleAllKpiCards = function(buttonEl) {
        const section = buttonEl.closest('section') || buttonEl.closest('.kpi-container') || buttonEl.parentElement.parentElement;
        if (!section) return;
        const cards = section.querySelectorAll('.collapsible-kpi');
        const allBodies = section.querySelectorAll('.collapsible-kpi-body');
        const anyHidden = Array.from(allBodies).some(b => b.classList.contains('hidden'));

        cards.forEach(card => {
            const body = card.querySelector('.collapsible-kpi-body');
            const chevron = card.querySelector('.kpi-chevron');
            if (!body) return;
            if (anyHidden) {
                body.classList.remove('hidden');
                if (chevron) chevron.classList.add('rotate-180');
                card.classList.add('kpi-is-expanded');
            } else {
                body.classList.add('hidden');
                if (chevron) chevron.classList.remove('rotate-180');
                card.classList.remove('kpi-is-expanded');
            }
        });

        const masterText = buttonEl.querySelector('.kpi-master-text');
        const masterIcon = buttonEl.querySelector('.kpi-master-icon');
        if (masterText) masterText.textContent = anyHidden ? 'Plegar todos' : 'Desplegar todos';
        if (masterIcon) masterIcon.textContent = anyHidden ? '▲' : '▼';
    };
}

