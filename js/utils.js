/**
 * Utility functions for Dates, Teams and Formats.
 * Centralizes logic used across Jornadas, RSS Import, and PDF Import.
 */

var AppUtils = window.AppUtils || {

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

    /**
     * Parsing flexible date strings to Date object
     * Supports: "dd/mm/yyyy", "dd de mes de yyyy", "dd mes yyyy"
     */
    parseDate(dateStr) {
        if (!dateStr || dateStr.toLowerCase() === 'por definir') return null;

        try {
            // 1. Try standard "24/08/2025" or "24-08-2025"
            if (dateStr.match(/\d+[\/-]\d+[\/-]\d+/)) {
                const parts = dateStr.split(/[\/-]/);
                if (parts.length === 3) {
                    return new Date(parts[2], parts[1] - 1, parts[0]);
                }
            }

            // 2. Try text format "24 de agosto de 2025"
            let clean = dateStr.toLowerCase()
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
                const monthIdx = this.months.findIndex(m => clean.includes(m));

                if (!isNaN(day) && monthIdx !== -1) {
                    return new Date(year, monthIdx, day);
                }
            }
        } catch (e) { console.warn('Date parse error', e); }
        return null; // Failed
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
     * Checks if a team string is likely a 1st Division Team (LaLiga EA)
     * Used for filtering
     */
    isLaLigaTeam(name) {
        const keywords = [
            'real madrid', 'barcelona', 'atlético', 'at. madrid', 'sevilla', 'betis',
            'real sociedad', 'athletic', 'valencia', 'villarreal', 'girona', 'osasuna',
            'celta', 'mallorca', 'rayo', 'getafe', 'alavés', 'palmas', 'leganés',
            'espanyol', 'valladolid', 'leganes', 'bilbao'
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
            'girona': 'escudos/primera/Girona-FC-2022.png',
            'las palmas': 'escudos/segunda/LAS-PALMAS-150x150.png',
            'ud las palmas': 'escudos/segunda/LAS-PALMAS-150x150.png',
            'levante': 'escudos/primera/LEVANTE-150x150.png',
            'mallorca': 'escudos/primera/MALLORCA-150x150.png',
            'osasuna': 'escudos/primera/OSASUNA-150x150.png',
            'rayo vallecano': 'escudos/primera/RAYO-VALLECANO-150x150.png',
            'rayo': 'escudos/primera/RAYO-VALLECANO-150x150.png',
            'real madrid': 'escudos/primera/REAL-MADRID-150x150.png',
            'real sociedad': 'escudos/primera/REAL-SOCIEDAD-150x150.png',
            'sevilla': 'escudos/primera/SEVILLA-150x150.png',
            'valencia': 'escudos/primera/VALENCIA-150x150.png',
            'real valladolid': 'escudos/segunda/Escudo-Real-Valladolid-CF.png',
            'valladolid': 'escudos/segunda/Escudo-Real-Valladolid-CF.png',
            'villarreal': 'escudos/primera/VILLARREAL-150x150.png',
            'albacete': 'escudos/segunda/ALBACETE-150x150.png',
            'andorra': 'escudos/segunda/ANDORRA-150x150.png',
            'burgos': 'escudos/segunda/BURGOS-150x150.png',
            'cádiz': 'escudos/segunda/CADIZ-150x150.png',
            'cadiz': 'escudos/segunda/CADIZ-150x150.png',
            'castellón': 'escudos/segunda/CASTELLON-150x150.png',
            'ceuta': 'escudos/segunda/Escudo-AgD-Ceuta-FC-150x150.png',
            'córdoba': 'escudos/segunda/CORDOBA-150x150.png',
            'cordoba': 'escudos/segunda/CORDOBA-150x150.png',
            'cultural leonesa': 'escudos/segunda/CULTURAL-150x150.png',
            'deportivo': 'escudos/segunda/DEPORTIVO-150x150.png',
            'eibar': 'escudos/segunda/EIBAR-150x150.png',
            'granada': 'escudos/segunda/GRANADA-150x150.png',
            'huesca': 'escudos/segunda/HUESCA-150x150.png',
            'leganés': 'escudos/segunda/LEGANES-150x150.png',
            'leganes': 'escudos/segunda/LEGANES-150x150.png',
            'málaga': 'escudos/segunda/MALAGA-150x150.png',
            'malaga': 'escudos/segunda/MALAGA-150x150.png',
            'mirandés': 'escudos/segunda/MIRANDES-150x150.png',
            'mirandes': 'escudos/segunda/MIRANDES-150x150.png',
            'racing santander': 'escudos/segunda/REAL-RACING-150x150.png',
            'real oviedo': 'escudos/primera/REAL-OVIEDO-150x150.png',
            'oviedo': 'escudos/primera/REAL-OVIEDO-150x150.png',
            'real sporting': 'escudos/segunda/REAL-SPORTING-150x150.png',
            'sporting': 'escudos/segunda/REAL-SPORTING-150x150.png',
            'real zaragoza': 'escudos/segunda/REAL-ZARAGOZA-150x150.png',
            'zaragoza': 'escudos/segunda/REAL-ZARAGOZA-150x150.png',
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
            'zamora': 'escudos/OTROS/zamora.png'
        };

        // 1. Direct match
        if (map[t]) return map[t];

        // 2. Fuzzy match (contains unique keyword)
        const entries = Object.entries(map);
        const fuzzyMatch = entries.find(([key]) => t.includes(key) || key.includes(t));
        return fuzzyMatch ? fuzzyMatch[1] : '';
    },

    /**
     * Checks if a match is considered "PIG" (Pleno al 15 between big clubs)
     * Robust check using normalization to handle accents, cases and variants.
     */
    isPigMatch(home, away) {
        if (!home || !away) return false;
        const pigTeams = ['real madrid', 'at. madrid', 'barcelona', 'fc barcelona', 'atlético de madrid', 'atlético'];

        const h = this.normalizeName(home);
        const a = this.normalizeName(away);

        const isPig = (normName) => {
            return pigTeams.some(p => {
                const pn = this.normalizeName(p);
                return normName.includes(pn) || pn.includes(normName);
            });
        };

        return isPig(h) && isPig(a);
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
        return new Intl.NumberFormat('es-ES', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
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
document.addEventListener('DOMContentLoaded', () => {
    // Create Clock Element
    const clockId = 'maulas-global-clock';
    if (!document.getElementById(clockId)) {
        const clockDiv = document.createElement('div');
        clockDiv.id = clockId;
        clockDiv.style.position = 'fixed';
        clockDiv.style.bottom = '10px';
        clockDiv.style.right = '10px';
        clockDiv.style.background = 'rgba(0, 0, 0, 0.7)';
        clockDiv.style.color = '#fff';
        clockDiv.style.padding = '5px 10px';
        clockDiv.style.borderRadius = '5px';
        clockDiv.style.fontFamily = 'monospace';
        clockDiv.style.fontSize = '0.9rem';
        clockDiv.style.zIndex = '9999';
        clockDiv.style.pointerEvents = 'none'; // Click through
        clockDiv.style.userSelect = 'none';
        clockDiv.style.boxShadow = '0 0 5px rgba(0,0,0,0.3)';
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

            clockDiv.innerHTML = `<span style="color:#ffd54f; font-weight:bold; margin-right:10px;">👤 ${userName}</span> ${dateStr} ${timeStr}`;
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
