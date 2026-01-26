class VotingSystem {
    constructor() {
        this.votaciones = [];
        this.members = [];
        this.currentUser = JSON.parse(sessionStorage.getItem('maulas_user'));

        // Telegram WebApp Integration
        this.tg = window.Telegram ? window.Telegram.WebApp : null;
        if (this.tg) {
            this.tg.ready();
            this.tg.expand();
        }

        this.init();
    }

    async tryAutoLogin(tgUsername) {
        if (!tgUsername) {
            console.warn("VotingSystem: No Telegram username provided for auto-login.");
            return;
        }

        console.log("VotingSystem: Attempting auto-login for:", tgUsername);

        // Normalize TG username for comparison
        const cleanTg = tgUsername.toLowerCase().replace('@', '').trim();

        // Match by new tgNick field or phone (as nickname)
        const member = this.members.find(m =>
            (m.tgNick && m.tgNick.toLowerCase().trim() === cleanTg) ||
            (m.phone && m.phone.toLowerCase().replace('@', '').trim() === cleanTg)
        );

        if (member) {
            console.log("VotingSystem: Auto-login SUCCESS for", member.name);
            const userData = {
                id: member.id,
                name: member.name,
                phone: member.phone,
                tgNick: member.tgNick,
                email: member.email,
                loginTime: new Date().toISOString()
            };
            sessionStorage.setItem('maulas_user', JSON.stringify(userData));
            this.currentUser = userData;
            this.render();
        } else {
            console.warn("VotingSystem: No matching member found for TG Nick:", cleanTg);
        }
    }

    async init() {
        console.log("VotingSystem: Initializing...");
        if (!window.DataService) {
            console.error("DataService not found");
            return;
        }
        await window.DataService.init();

        this.cacheDOM();
        this.bindEvents();
        await this.loadData();

        // After loading members, try auto-login if TG detected
        if (this.tg && !this.currentUser) {
            this.attemptTgAuth();
            // Retry twice because Telegram sometimes takes some ms to populate initDataUnsafe
            setTimeout(() => this.attemptTgAuth(), 500);
            setTimeout(() => this.attemptTgAuth(), 2500);
        }

        this.render();

        // Update countdowns every second
        setInterval(() => this.updateCountdowns(), 1000);

        // Auto-check for newly finished votations
        setInterval(() => this.checkAutoNotifications(), 10000);
    }

    attemptTgAuth() {
        if (this.currentUser || !this.tg) return;
        const tgData = this.tg.initDataUnsafe;
        const tgUser = tgData ? tgData.user : null;

        if (tgUser) {
            if (tgUser.username) {
                this.tryAutoLogin(tgUser.username);
            } else if (tgUser.first_name) {
                console.log("VotingSystem: No username, using first_name as fallback...");
                this.tryAutoLogin(tgUser.first_name);
            }
        }
    }

    cacheDOM() {
        this.listContainer = document.getElementById('votaciones-list');
        this.btnPropose = document.getElementById('btn-propose');
        this.modal = document.getElementById('vote-modal');
        this.form = document.getElementById('vote-form');
        this.btnCancel = document.getElementById('btn-cancel-vote');

        this.inpTitle = document.getElementById('inp-vote-title');
        this.inpDesc = document.getElementById('inp-vote-desc');
        this.inpOptions = document.getElementById('inp-vote-options');
        this.inpDate = document.getElementById('inp-vote-date');
        this.inpTime = document.getElementById('inp-vote-time');
        this.inpThreshold = document.getElementById('inp-vote-threshold');
        this.inpMultiple = document.getElementById('inp-vote-multiple');
    }

    bindEvents() {
        if (this.btnPropose) this.btnPropose.addEventListener('click', () => this.openModal());
        if (this.btnCancel) this.btnCancel.addEventListener('click', () => this.closeModal());
        if (this.form) this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        window.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeModal();
        });
    }

    async loadData() {
        try {
            this.votaciones = await window.DataService.getAll('votaciones');
            this.members = await window.DataService.getAll('members');
            // Sort by date (newest first)
            this.votaciones.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        } catch (e) {
            console.error("Error loading voting data:", e);
        }
    }

    async checkAutoNotifications() {
        const now = new Date();
        let changed = false;

        for (const v of this.votaciones) {
            const deadline = new Date(v.deadline);
            if (now > deadline && !v.tgNotified) {
                console.log(`VotingSystem: Votation ${v.id} finished. Notifying Telegram Automatically.`);

                if (window.TelegramService) {
                    await window.TelegramService.sendVoteResultReport(v, this.members);
                    v.tgNotified = true; // Mark as notified
                    await window.DataService.save('votaciones', v);
                    changed = true;
                }
            }
        }

        if (changed) {
            await this.loadData();
            this.render();
        }
    }

    render() {
        if (!this.listContainer) return;
        this.listContainer.innerHTML = '';

        if (this.votaciones.length === 0) {
            this.listContainer.innerHTML = `<p style="text-align:center; grid-column: 1/-1; color: var(--text-muted); padding: 2rem;">No hay votaciones activas ni pasadas.</p>`;
            return;
        }

        const now = new Date();

        this.votaciones.forEach(v => {
            const deadline = new Date(v.deadline);
            const isFinished = now > deadline;
            const options = v.options || ["Sí", "No"];

            // Normalize votes to array for multiple choice handling
            const getMyVotes = () => {
                if (!this.currentUser || !v.votes) return [];
                const val = v.votes[this.currentUser.id];
                if (val === undefined || val === null) return [];
                return Array.isArray(val) ? val : [val];
            };
            const myVotes = getMyVotes();

            // Total unique members who voted
            const totalVoters = Object.keys(v.votes || {}).length;

            const card = document.createElement('div');
            card.className = `vote-card ${isFinished ? 'finished' : 'active'}`;
            card.innerHTML = `
                <div class="vote-header">
                    <h3 class="vote-title">${v.title}</h3>
                    <div style="display:flex; gap: 0.5rem; align-items:center;">
                        <span class="vote-badge ${isFinished ? 'badge-finished' : 'badge-active'}">${isFinished ? 'Finalizada' : 'Activa'}</span>
                        ${(this.currentUser && (this.currentUser.id == v.creatorId || this.currentUser.email === 'emilio@maulas.com')) ?
                    `<button class="delete-btn" onclick="votingSystem.deleteVote('${v.id}')" title="Borrar Votación">🗑️</button>` : ''
                }
                    </div>
                </div>
                ${v.description ? `<p class="vote-desc">${v.description}</p>` : ''}
                
                <div class="vote-meta">
                    <span>Propuesta por: <b>${v.creatorName}</b></span>
                    <span>Límite: ${new Date(v.deadline).toLocaleString()}</span>
                    <span>Para ganar: <b>${v.threshold}%</b> de los votos</span>
                    ${v.allowMultiple ? `<span style="color:var(--primary-blue); font-weight:bold;">✅ Elección Múltiple Permitida</span>` : ''}
                </div>

                ${!isFinished ? `
                    <div class="vote-timer" id="timer-${v.id}">Calculando tiempo...</div>
                    ${(this.currentUser && this.currentUser.id == v.creatorId) ?
                        `<button class="btn-cancel" style="margin-top: 0.5rem; width:100%; font-size: 0.8rem; background: #ffebee; color: #d32f2f;" onclick="votingSystem.cancelVote('${v.id}')">⏹️ CANCELAR VOTACIÓN EN CURSO</button>` : ''
                    }
                ` : ''}

                <div class="vote-options">
                    ${options.map((opt, idx) => {
                        // Count how many times this option appears in all votes
                        let count = 0;
                        Object.values(v.votes || {}).forEach(voteVal => {
                            if (Array.isArray(voteVal)) {
                                if (voteVal.includes(idx)) count++;
                            } else {
                                if (voteVal === idx) count++;
                            }
                        });

                        const pct = totalVoters > 0 ? (count / totalVoters * 100).toFixed(0) : 0;
                        const isSelected = myVotes.includes(idx);

                        return `
                            <div class="option-wrapper">
                                <button class="option-btn ${isSelected ? 'selected' : ''}" 
                                        onclick="votingSystem.castVote('${v.id}', ${idx})"
                                        ${isFinished ? 'disabled' : ''}>
                                    <span>${opt}</span>
                                    <span>${count} (${pct}%)</span>
                                </button>
                                <div class="option-progress">
                                    <div class="progress-bar" style="width: ${pct}%"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>

                <div class="vote-results">
                    <div class="voters-list">
                        <b>Socios que han votado (${totalVoters}):</b> ${this.formatVoters(v)}
                    </div>
                </div>

                ${isFinished ? this.renderWinnerInfo(v, totalVoters, options) : ''}
            `;
            this.listContainer.appendChild(card);
        });

        this.updateCountdowns();
    }

    formatVoters(v) {
        if (!v.votes || Object.keys(v.votes).length === 0) return 'Nadie ha votado aún';
        return Object.keys(v.votes).map(uid => {
            const member = this.members.find(m => String(m.id) === String(uid));
            return member ? (member.phone || member.name) : 'Socio ' + uid;
        }).join(', ');
    }

    renderWinnerInfo(v, totalVoters, options) {
        if (totalVoters === 0) return `<div class="winning-info" style="background:#eee; color:#666; border-color:#ccc;">Empate / Sin votos</div>`;

        // Calculate counts for each option
        const counts = options.map((_, idx) => {
            let c = 0;
            Object.values(v.votes || {}).forEach(voteVal => {
                if (Array.isArray(voteVal)) {
                    if (voteVal.includes(idx)) c++;
                } else {
                    if (voteVal === idx) c++;
                }
            });
            return c;
        });

        const maxVal = Math.max(...counts);
        const winnerIndices = counts.reduce((acc, c, i) => (c === maxVal ? [...acc, i] : acc), []);
        const winnerPct = (maxVal / totalVoters * 100);

        if (winnerIndices.length > 1) {
            return `<div class="winning-info" style="background:#fce4ec; color:#c2185b; border-color:#f8bbd0;">EMPATE ENTRE: ${winnerIndices.map(i => options[i].toUpperCase()).join(', ')}</div>`;
        }

        if (winnerPct >= v.threshold) {
            return `<div class="winning-info">GANADOR: ${options[winnerIndices[0]].toUpperCase()} (${winnerPct.toFixed(1)}%)</div>`;
        } else {
            return `<div class="winning-info" style="background:#eee; color:#666; border-color:#ccc;">NO ALCANZA MAYORÍA (${winnerPct.toFixed(1)}% < ${v.threshold}%)</div>`;
        }
    }

    updateCountdowns() {
        const now = new Date();
        this.votaciones.forEach(v => {
            const el = document.getElementById(`timer-${v.id}`);
            if (!el) return;

            const deadline = new Date(v.deadline);
            const diff = deadline - now;

            if (diff <= 0) {
                el.innerHTML = "¡TIEMPO AGOTADO!";
                el.style.color = "var(--text-muted)";
                el.style.background = "#eee";
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const secs = Math.floor((diff % (1000 * 60)) / 1000);

            el.innerHTML = `Quedan: ${days > 0 ? days + 'd ' : ''}${hours}h ${mins}m ${secs}s`;
        });
    }

    async castVote(voteId, optionIdx) {
        if (!this.currentUser) return alert("Debes iniciar sesión para votar.");

        const v = this.votaciones.find(x => x.id === voteId);
        if (!v) return;

        const now = new Date();
        if (now > new Date(v.deadline)) return alert("La votación ya ha finalizado.");

        if (!v.votes) v.votes = {};

        const currentVoteVal = v.votes[this.currentUser.id];
        let newVoteVal;

        if (v.allowMultiple) {
            let currentArray = Array.isArray(currentVoteVal) ? currentVoteVal : (currentVoteVal !== undefined && currentVoteVal !== null ? [currentVoteVal] : []);
            if (currentArray.includes(optionIdx)) {
                newVoteVal = currentArray.filter(i => i !== optionIdx);
            } else {
                newVoteVal = [...currentArray, optionIdx];
            }
        } else {
            newVoteVal = (currentVoteVal === optionIdx) ? null : optionIdx;
        }

        v.votes[this.currentUser.id] = newVoteVal;

        try {
            await window.DataService.save('votaciones', v);
            await this.loadData();
            this.render();
        } catch (e) {
            alert("Error al guardar el voto.");
        }
    }

    async deleteVote(voteId) {
        if (!confirm("¿Seguro que quieres BORRAR esta votación definitivamente de la base de datos?")) return;
        try {
            await window.DataService.delete('votaciones', voteId);
            await this.loadData();
            this.render();
        } catch (e) {
            alert("Error al borrar.");
        }
    }

    async cancelVote(voteId) {
        if (!confirm("¿Deseas CANCELAR esta votación y darla por finalizada ahora mismo?")) return;
        const v = this.votaciones.find(x => x.id === voteId);
        if (!v) return;

        v.deadline = new Date().toISOString(); // Set deadline to now
        v.tgNotified = false; // Reset to allow auto-notification of final results
        try {
            await window.DataService.save('votaciones', v);
            await this.loadData();
            this.render();
        } catch (e) {
            alert("Error al cancelar.");
        }
    }

    openModal() {
        if (!this.currentUser) return alert("Inicia sesión para proponer una votación.");
        this.modal.classList.add('active');
        const d = new Date();
        d.setDate(d.getDate() + 3);
        this.inpDate.value = d.toISOString().split('T')[0];
    }

    closeModal() {
        this.modal.classList.remove('active');
        this.form.reset();
    }

    async handleSubmit(e) {
        e.preventDefault();

        const title = this.inpTitle.value.trim();
        const desc = this.inpDesc.value.trim();
        const optsRaw = this.inpOptions.value.trim();
        const deadlineDate = this.inpDate.value;
        const deadlineTime = this.inpTime.value;
        const threshold = parseInt(this.inpThreshold.value) || 51;
        const allowMultiple = this.inpMultiple.checked;

        const options = optsRaw ? optsRaw.split(',').map(o => o.trim()) : ["Sí", "No"];
        const deadline = new Date(`${deadlineDate}T${deadlineTime}`).toISOString();

        const newVote = {
            id: 'VOTE-' + Date.now(),
            title,
            description: desc,
            options,
            deadline,
            threshold,
            allowMultiple,
            creatorId: this.currentUser.id,
            creatorName: this.currentUser.phone || this.currentUser.name,
            createdAt: new Date().toISOString(),
            votes: {},
            tgNotified: false
        };

        try {
            await window.DataService.save('votaciones', newVote);

            let tgStatus = " (Sin aviso Telegram)";
            if (window.TelegramService) {
                const res = await window.TelegramService.sendVoteNotification(newVote);
                if (res && res.ok) {
                    tgStatus = " y avisada por Telegram.";
                } else {
                    const errorMsg = res ? (res.description || "Error desconocido") : "Sin respuesta";
                    tgStatus = " (Telegram falló: " + errorMsg + ")";
                }
            }

            await this.loadData();
            this.render();
            this.closeModal();
            alert("Votación creada con éxito" + tgStatus);
        } catch (e) {
            console.error("VotingSystem: Error in handleSubmit:", e);
            alert("Error al crear la votación.");
        }
    }
}

window.votingSystem = new VotingSystem();
