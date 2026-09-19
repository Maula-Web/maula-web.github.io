/**
 * DiceService - El Dado de Quinielas 🎲
 * Permite a socios ausentes (viaje, sin cobertura) que sus quinielas
 * se rellenen automáticamente al azar cuando la jornada entra en juego,
 * dentro de un rango de fechas definido, sin penalización por retraso,
 * con un límite máximo de 3 jornadas por temporada.
 */
class DiceService {
    /**
     * Devuelve el número de jornadas rellenadas con dado por un socio en la temporada.
     * @param {string|number} memberId 
     * @param {Array} pronosticos 
     * @returns {number}
     */
    static getDiceUsageCount(memberId, pronosticos) {
        if (!pronosticos || !Array.isArray(pronosticos)) return 0;
        const mStr = String(memberId);
        return pronosticos.filter(p => {
            const pMid = String(p.mId !== undefined && p.mId !== null ? p.mId : p.memberId || '');
            return pMid === mStr && p.isDice === true;
        }).length;
    }

    /**
     * Comprueba si una fecha está dentro del rango especificado (inclusive).
     * @param {Date} date 
     * @param {string} startDateStr - formato YYYY-MM-DD
     * @param {string} endDateStr - formato YYYY-MM-DD
     * @returns {boolean}
     */
    static isDateInRange(date, startDateStr, endDateStr) {
        if (!date || !(date instanceof Date) || isNaN(date.getTime())) return false;
        if (!startDateStr || !endDateStr) return false;

        const start = new Date(startDateStr + 'T00:00:00');
        const end = new Date(endDateStr + 'T23:59:59');

        if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;

        return date >= start && date <= end;
    }

    /**
     * Genera una quiniela aleatoria para una jornada:
     * - Partidos 1 a 14: '1', 'X' o '2' al azar.
     * - Partido 15 (Pleno al 15): sólo se rellena al azar ('1', 'X' o '2') si el partido es PIG.
     *   Si no es PIG, se deja en null (deshabilitado).
     * @param {Object} jornada 
     * @returns {Array<string|null>} Array de 15 elementos
     */
    static generateRandomForecast(jornada) {
        const signs = ['1', 'X', '2'];
        const selection = [];

        const matches = (jornada && Array.isArray(jornada.matches)) ? jornada.matches : [];

        for (let i = 0; i < 15; i++) {
            if (i < 14) {
                const randomSign = signs[Math.floor(Math.random() * signs.length)];
                selection.push(randomSign);
            } else {
                // Pleno al 15 (índice 14): sólo si es PIG
                const match15 = matches[14];
                let isPig = false;
                if (match15 && match15.home && match15.away && typeof AppUtils !== 'undefined') {
                    isPig = AppUtils.isPigMatch(match15.home, match15.away);
                }

                if (isPig) {
                    const randomP15 = signs[Math.floor(Math.random() * signs.length)];
                    selection.push(randomP15);
                } else {
                    selection.push(null);
                }
            }
        }

        return selection;
    }

    /**
     * Evalúa todos los socios y jornadas para aplicar el dado a quienes lo tengan configurado,
     * siempre que la jornada haya entrado en juego / vencido plazo y no supere el límite de 3 usos.
     * @param {Array} members 
     * @param {Array} jornadas 
     * @param {Array} pronosticos 
     * @returns {Promise<Array>} Array de pronósticos creados con el dado
     */
    static async checkAndApplyDice(members, jornadas, pronosticos) {
        if (!members || !jornadas || !pronosticos) return [];
        const now = new Date();
        const createdDiceForecasts = [];

        for (const member of members) {
            if (!member || !member.diceEnabled) continue;
            if (!member.diceStartDate || !member.diceEndDate) continue;

            let currentUses = this.getDiceUsageCount(member.id, pronosticos);
            if (currentUses >= 3) {
                console.log(`🎲 Socio ${member.name} (#${member.id}) ha agotado sus 3 usos de dado.`);
                continue;
            }

            // Ordenar jornadas por número
            const sortedJornadas = [...jornadas].sort((a, b) => a.number - b.number);

            for (const j of sortedJornadas) {
                if (currentUses >= 3) break;
                if (!j || !j.active) continue;
                if (!Array.isArray(j.matches) || !j.matches.some(m => m && m.home && m.home.trim() !== '')) continue;

                // Comprobar si el socio ya tiene un pronóstico registrado para esta jornada
                const hasExisting = pronosticos.some(p => {
                    const pJid = String(p.jId !== undefined && p.jId !== null ? p.jId : p.jornadaId || '');
                    const pMid = String(p.mId !== undefined && p.mId !== null ? p.mId : p.memberId || '');
                    if (pJid === String(j.id) && pMid === String(member.id)) {
                        return p.selection && Array.isArray(p.selection) && p.selection.some(s => s !== null && s !== '-');
                    }
                    return false;
                });

                if (hasExisting) continue;

                // Comprobar fechas de la jornada
                const jDate = typeof AppUtils !== 'undefined' ? AppUtils.parseDate(j.date) : new Date(j.date);
                const deadline = typeof AppUtils !== 'undefined' ? AppUtils.calculateDeadline(j.date) : null;

                // Verificar si la fecha de la jornada cae en el rango del dado
                const inRange = this.isDateInRange(jDate, member.diceStartDate, member.diceEndDate) ||
                                (deadline && this.isDateInRange(deadline, member.diceStartDate, member.diceEndDate));

                if (!inRange) continue;

                // Comprobar si la jornada ha entrado en juego o vencido su plazo
                const hasStarted = Array.isArray(j.matches) && j.matches.some(m => {
                    if (!m || !m.result) return false;
                    const r = String(m.result).trim();
                    return r !== '' && r !== '-' && r.toLowerCase() !== 'por definir';
                });
                const deadlinePassed = deadline ? (now >= deadline) : false;

                if (!deadlinePassed && !hasStarted) {
                    // Aún no entra en juego; el socio todavía puede rellenarla si vuelve a tiempo
                    continue;
                }

                // Generar quiniela aleatoria
                console.log(`🎲 APLICANDO DADO: Generando pronóstico para socio ${member.name} en Jornada ${j.number}...`);
                const selection = this.generateRandomForecast(j);

                const record = {
                    id: `${j.id}_${member.id}`,
                    jId: j.id,
                    mId: member.id,
                    selection: selection,
                    isReduced: false,
                    timestamp: new Date().toISOString(),
                    late: false, // Regla: no se marcará como tarde
                    isDice: true // Regla: se marcará con el símbolo de un dado
                };

                // Guardar en la base de datos si DataService está disponible
                if (typeof window !== 'undefined' && window.DataService && typeof window.DataService.save === 'function') {
                    try {
                        await window.DataService.save('pronosticos', record);
                        console.log(`🎲 Pronóstico guardado con éxito para socio ${member.name} en J${j.number}`);
                    } catch (err) {
                        console.error("Error guardando pronóstico de dado:", err);
                    }
                }

                // Actualizar arrays en memoria
                const existingIdx = pronosticos.findIndex(p => p.id === record.id);
                if (existingIdx >= 0) pronosticos[existingIdx] = record;
                else pronosticos.push(record);

                createdDiceForecasts.push(record);
                currentUses++;
            }
        }

        return createdDiceForecasts;
    }
}

if (typeof window !== 'undefined') {
    window.DiceService = DiceService;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DiceService;
}
