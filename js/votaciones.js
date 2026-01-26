class VotingSystem {
    constructor() {
        this.votaciones = [];
        this.members = [];
        this.currentUser = JSON.parse(sessionStorage.getItem('maulas_user'));

        // Telegram WebApp Integration
        this.tg = window.Telegram ? window.Telegram.WebApp : null;
        if (this.tg) {
            this.tg.expand();
            this.handleTelegramAuth();
        }

        this.init();
    }

    async handleTelegramAuth() {
        if (!this.tg || !this.tg.initDataUnsafe || !this.tg.initDataUnsafe.user) return;

        const tgUser = this.tg.initDataUnsafe.user;
        const tgUsername = (tgUser.username || "").toLowerCase();

        console.log("VotingSystem: Telegram session detected", tgUsername);

        if (!this.currentUser && this.members.length > 0) {
            this.tryAutoLogin(tgUsername);
        }
    }

    tryAutoLogin(tgUsername) {
        if (!tgUsername) return;

        // Match by "phone" (nickname) or name if they put their telegram username there
        const member = this.members.find(m =>
            (m.phone && m.phone.toLowerCase().replace('@', '') === tgUsername.replace('@', '')) ||
            (m.name && m.name.toLowerCase().includes(tgUsername.replace('@', '')))
        );

        if (member) {
            console.log("VotingSystem: Auto-logged in via Telegram", member.name);
            const userData = {
                id: member.id,
                name: member.name,
                phone: member.phone,
                email: member.email,
                loginTime: new Date().toISOString()
            };
            sessionStorage.setItem('maulas_user', JSON.stringify(userData));
            this.currentUser = userData;
            this.render();
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
            const tgUser = this.tg.initDataUnsafe.user;
            if (tgUser) this.tryAutoLogin(tgUser.username);
        }

        this.render();

        // Update countdowns every second
        setInterval(() => this.updateCountdowns(), 1000);
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
            const totalVotes = Object.keys(v.votes || {}).length;
            const myVote = (this.currentUser && v.votes) ? v.votes[this.currentUser.id] : null;

            const card = document.createElement('div');
            card.className = `vote-card ${isFinished ? 'finished' : 'active'}`;
            card.innerHTML = `
                <div class="vote-header">
                    <h3 class="vote-title">${v.title}</h3>
                    <span class="vote-badge ${isFinished ? 'badge-finished' : 'badge-active'}">${isFinished ? 'Finalizada' : 'Activa'}</span>
                </div>
                ${v.description ? `<p class="vote-desc">${v.description}</p>` : ''}
                
                <div class="vote-meta">
                    <span>Propuesta por: <b>${v.creatorName}</b></span>
                    <span>Límite: ${new Date(v.deadline).toLocaleString()}</span>
                    <span>Para ganar: <b>${v.threshold}%</b> de los votos</span>
                </div>

                ${!isFinished ? `<div class="vote-timer" id="timer-${v.id}">Calculando tiempo...</div>` : ''}

                <div class="vote-options">
                    ${options.map((opt, idx) => {
                const count = Object.values(v.votes || {}).filter(val => val === idx).length;
                const pct = totalVotes > 0 ? (count / totalVotes * 100).toFixed(0) : 0;
                const isSelected = myVote === idx;

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
                        <b>Votos (${totalVotes}):</b> ${this.formatVoters(v)}
                    </div>
                </div>

                ${isFinished ? this.renderWinnerInfo(v, totalVotes, options) : ''}
                ${isFinished && !v.whatsappNotified ? `<button class="btn-new-vote" style="margin-top:1rem; padding: 0.5rem; font-size: 0.8rem; width:100%; border-color: #25D366; color: #25D366; background: transparent;" onclick="votingSystem.notifyWhatsApp('${v.id}')">📲 INFORMAR POR WHATSAPP</button>` : ''}
            `;
            this.listContainer.appendChild(card);
        });

        this.updateCountdowns();
    }

    formatVoters(v) {
        if (!v.votes || Object.keys(v.votes).length === 0) return 'Nadie ha votado aún';
        const options = v.options || ["Sí", "No"];
        return Object.entries(v.votes).map(([uid, optIdx]) => {
            const member = this.members.find(m => String(m.id) === String(uid));
            const name = member ? (member.phone || member.name) : 'Socio ' + uid;
            return `<span title="${options[optIdx]}">${name}</span>`;
        }).join(', ');
    }

    renderWinnerInfo(v, totalVotes, options) {
        if (totalVotes === 0) return `<div class="winning-info" style="background:#eee; color:#666; border-color:#ccc;">Empate / Sin votos</div>`;

        const counts = options.map((_, idx) => Object.values(v.votes).filter(val => val === idx).length);
        const maxVal = Math.max(...counts);
        const winnerIdx = counts.indexOf(maxVal);
        const winnerPct = (maxVal / totalVotes * 100);

        const isTied = counts.filter(c => c === maxVal).length > 1;

        if (isTied) {
            return `<div class="winning-info" style="background:#fce4ec; color:#c2185b; border-color:#f8bbd0;">EMPATE</div>`;
        }

        if (winnerPct >= v.threshold) {
            return `<div class="winning-info">GANADOR: ${options[winnerIdx].toUpperCase()} (${winnerPct.toFixed(1)}%)</div>`;
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
        v.votes[this.currentUser.id] = optionIdx;

        try {
            await window.DataService.save('votaciones', v);
            await this.loadData();
            this.render();
        } catch (e) {
            alert("Error al guardar el voto.");
        }
    }

    openModal() {
        if (!this.currentUser) return alert("Inicia sesión para proponer una votación.");
        this.modal.classList.add('active');
        // Set default date to today + 3 days
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

        const options = optsRaw ? optsRaw.split(',').map(o => o.trim()) : ["Sí", "No"];
        const deadline = new Date(`${deadlineDate}T${deadlineTime}`).toISOString();

        const newVote = {
            id: 'VOTE-' + Date.now(),
            title,
            description: desc,
            options,
            deadline,
            threshold,
            creatorId: this.currentUser.id,
            creatorName: this.currentUser.phone || this.currentUser.name,
            createdAt: new Date().toISOString(),
            votes: {},
            whatsappNotified: false
        };

        try {
            await window.DataService.save('votaciones', newVote);

            // Notify Telegram
            if (window.TelegramService) {
                await window.TelegramService.sendVoteNotification(newVote);
            }

            await this.loadData();
            this.render();
            this.closeModal();
            alert("Votación creada con éxito y avisada por Telegram.");
        } catch (e) {
            console.error(e);
            alert("Error al crear la votación.");
        }
    }

    async notifyWhatsApp(voteId) {
        const v = this.votaciones.find(x => x.id === voteId);
        if (!v) return;

        const options = v.options || ["Sí", "No"];
        const totalVotes = Object.keys(v.votes || {}).length;
        const counts = options.map((_, idx) => Object.values(v.votes).filter(val => val === idx).length);
        const maxVal = Math.max(...counts);
        const winnerIdx = counts.indexOf(maxVal);
        const winnerPct = totalVotes > 0 ? (maxVal / totalVotes * 100) : 0;
        const isTied = counts.filter(c => c === maxVal).length > 1;

        let resText = "";
        if (totalVotes === 0) resText = "Sin votos.";
        else if (isTied) resText = "Empate.";
        else resText = `GANADOR: *${options[winnerIdx]}* (${winnerPct.toFixed(1)}%)`;

        const msg = `🗳️ *RESULTADOS DE LA VOTACIÓN* 🗳️\n\n*Tema:* ${v.title}\n*Resultados:*\n${options.map((o, i) => `- ${o}: ${counts[i]} votos`).join('\n')}\n\n🏆 *${resText}*`;

        const encodedMsg = encodeURIComponent(msg);
        window.open(`https://wa.me/?text=${encodedMsg}`, '_blank');

        // Mark as notified in DB
        v.whatsappNotified = true;
        await window.DataService.save('votaciones', v);
        this.render();
    }
}

// Global instance
window.votingSystem = new VotingSystem();
