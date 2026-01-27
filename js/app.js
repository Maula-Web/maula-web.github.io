
class MemberManager {
    constructor() {
        this.members = [];
        this.nextId = 1;

        // Start init
        this.init();
    }

    async init() {
        this.cacheDOM();
        this.bindEvents();

        if (window.DataService) {
            await window.DataService.init();
            await this.loadData();
        }

        this.renderTable();
    }

    async loadData() {
        this.members = await window.DataService.getAll('members');
        if (this.members.length > 0) {
            this.nextId = Math.max(...this.members.map(m => m.id)) + 1;
        } else {
            this.nextId = 1;
        }
    }

    cacheDOM() {
        this.tableBody = document.getElementById('members-table-body');
        this.btnAdd = document.getElementById('btn-add');
        this.btnRemove = document.getElementById('btn-remove');
        this.modal = document.getElementById('add-modal');
        this.form = document.getElementById('add-form');
        this.btnCancel = document.getElementById('btn-cancel');
        this.modalTitle = document.getElementById('modal-title');
        this.deleteMode = false;

        this.inputId = document.getElementById('inp-id');
        this.inputName = document.getElementById('inp-name');
        this.inputEmail = document.getElementById('inp-email');
        this.inputPhone = document.getElementById('inp-phone');
        this.inputTgNick = document.getElementById('inp-tgnick');
    }

    bindEvents() {
        if (this.btnAdd) this.btnAdd.addEventListener('click', () => this.openModal());
        if (this.btnCancel) this.btnCancel.addEventListener('click', () => this.closeModal());
        if (this.form) this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        if (this.btnRemove) this.btnRemove.addEventListener('click', () => this.toggleDeleteMode());

        window.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeModal();
        });
    }

    renderTable() {
        if (!this.tableBody) return;
        this.tableBody.innerHTML = '';

        if (this.members.length === 0) {
            this.tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: #888;">Cargando o no hay socios...</td></tr>`;
            return;
        }

        // Sort by ID
        this.members.sort((a, b) => a.id - b.id).forEach(member => {
            const tr = document.createElement('tr');
            let actionHtml = '';
            if (this.deleteMode) {
                actionHtml = `<button class="delete-btn" onclick="app.deleteMember(${member.id})">🗑️ Eliminar</button>`;
            } else {
                actionHtml = `<button class="edit-btn" onclick="app.editMember(${member.id})">✏️ Modificar</button>`;
            }

            tr.innerHTML = `
                <td class="table-socio-id">${member.id}</td>
                <td class="table-socio-name">${member.name}</td>
                <td class="table-socio-email"><a href="mailto:${member.email}" style="color:inherit; text-decoration:none;">${member.email}</a></td>
                <td class="table-socio-phone">${member.phone || '<span style="color:#999; font-style:italic;">Sin Apodo</span>'}</td>
                <td class="table-socio-tgnick">${member.tgNick ? '@' + member.tgNick : '<span style="color:#999; font-style:italic;">N/A</span>'}</td>
                <td class="action-cell">${actionHtml}</td>
            `;
            this.tableBody.appendChild(tr);
        });
    }

    async handleSubmit(e) {
        e.preventDefault();

        // Prank Protection for Emilio
        const user = JSON.parse(sessionStorage.getItem('maulas_user'));
        const isEmilio = (user && user.email.toLowerCase() === 'emilio@maulas.com');

        const id = this.inputId.value;

        if (isEmilio) {
            if (!id) {
                alert("Acceso Restringido. Emilio no tiene permiso para dar de alta nuevos socios.");
                return;
            }

            // If editing, check if it's himself
            const memberToEdit = this.members.find(m => m.id == id);
            if (memberToEdit && memberToEdit.email.toLowerCase() !== 'emilio@maulas.com') {
                alert("Acceso Restringido. Emilio no tiene permiso para modificar datos de otros socios.");
                return;
            }

            // Prompt for password to edit himself
            const pwd = prompt("Acceso Restringido. Introduce la clave de socios para modificar tus datos:");
            const isValid = await Auth.verifyPrankPassword(pwd);
            if (!isValid) {
                alert("Clave incorrecta. No tienes permiso para modificar tus datos.");
                return;
            }
        }

        if (id) {
            await this.updateMember(parseInt(id));
        } else {
            await this.createMember();
        }
    }

    async createMember() {
        const newMember = {
            id: this.nextId++,
            name: this.inputName.value,
            email: this.inputEmail.value,
            phone: this.inputPhone.value,
            tgNick: this.inputTgNick.value.replace('@', '').trim(),
            joinedDate: new Date().toISOString()
        };

        await window.DataService.save('members', newMember);
        await this.loadData();
        this.renderTable();
        this.closeModal();
    }

    async updateMember(id) {
        const member = this.members.find(m => m.id === id);
        if (member) {
            member.name = this.inputName.value;
            member.email = this.inputEmail.value;
            member.phone = this.inputPhone.value;
            member.tgNick = this.inputTgNick.value.replace('@', '').trim();

            await window.DataService.save('members', member);
            await this.loadData();
            this.renderTable();
            this.closeModal();
        }
    }

    editMember(id) {
        const member = this.members.find(m => m.id === id);
        if (!member) return;
        this.openModal(member);
    }

    async deleteMember(id) {
        // Prank Protection for Emilio
        const user = JSON.parse(sessionStorage.getItem('maulas_user'));
        if (user && user.email.toLowerCase() === 'emilio@maulas.com') {
            alert("Acceso Restringido. Emilio no tiene permiso para dar de baja a socios.");
            return;
        }

        if (confirm('¿Está seguro de que desea dar de baja a este socio?')) {
            await window.DataService.delete('members', id);
            await this.loadData();
            this.renderTable();
            if (this.members.length === 0) this.toggleDeleteMode();
        }
    }

    toggleDeleteMode() {
        this.deleteMode = !this.deleteMode;
        if (this.btnRemove) {
            if (this.deleteMode) {
                this.btnRemove.textContent = 'Terminar Bajas';
                this.btnRemove.style.backgroundColor = '#d32f2f';
                this.btnRemove.style.color = 'white';
            } else {
                this.btnRemove.innerHTML = '➖ BAJA DE SOCIOS';
                this.btnRemove.style.backgroundColor = '#ffebee';
                this.btnRemove.style.color = '#d32f2f';
            }
        }
        this.renderTable();
    }

    openModal(member = null) {
        if (member) {
            this.modalTitle.textContent = 'Modificar Socio';
            this.inputId.value = member.id;
            this.inputName.value = member.name;
            this.inputEmail.value = member.email;
            this.inputPhone.value = member.phone || '';
            this.inputTgNick.value = member.tgNick || '';
        } else {
            this.modalTitle.textContent = 'Alta de Nuevo Socio';
            this.form.reset();
            this.inputId.value = '';
        }
        this.modal.classList.add('active');
    }

    closeModal() {
        this.modal.classList.remove('active');
        this.form.reset();
    }
}

if (document.getElementById('members-table-body')) {
    const app = new MemberManager();
    window.app = app;
}
