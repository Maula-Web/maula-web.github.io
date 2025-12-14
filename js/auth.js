const Auth = {
    async checkContext() {
        if (window.location.pathname.includes('login.html')) return;

        const user = sessionStorage.getItem('maulas_user');
        if (!user) {
            window.location.href = 'login.html';
        } else {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.injectLogout());
            } else {
                this.injectLogout();
            }
        }
    },

    async login(email, password) {
        // Master Password (Local)
        const storedPwd = localStorage.getItem('maulas_admin_pass');
        const validPwd = storedPwd || '_Est4tuTo5M4uLAs!';

        if (password !== validPwd) {
            alert('Contraseña incorrecta.');
            return false;
        }

        try {
            // Need to ensure DataService is ready
            if (window.DataService) await window.DataService.init();

            const members = await window.DataService.getAll('members');
            const member = members.find(m => m.email.toLowerCase().trim() === email.toLowerCase().trim());

            if (!member) {
                alert('El correo electrónico no corresponde a ningún socio activo.');
                return false;
            }

            const userData = {
                id: member.id,
                name: member.name,
                email: member.email,
                loginTime: new Date().toISOString()
            };
            sessionStorage.setItem('maulas_user', JSON.stringify(userData));

            await this.logAction(member.name, 'Inicio de Sesión');
            return true;
        } catch (e) {
            console.error(e);
            alert('Error de conexión al iniciar sesión.');
            return false;
        }
    },

    changePassword: function (newPass) {
        localStorage.setItem('maulas_admin_pass', newPass);
        this.logAction(JSON.parse(sessionStorage.getItem('maulas_user')).name, 'Cambio de Contraseña Maestra');
        alert('Contraseña actualizada correctamente.');
    },

    logout: function () {
        const user = JSON.parse(sessionStorage.getItem('maulas_user'));
        if (user) this.logAction(user.name, 'Cierre de Sesión');

        sessionStorage.removeItem('maulas_user');
        window.location.href = 'login.html';
    },

    logAction: async function (userName, action) {
        if (window.DataService) {
            await window.DataService.logAction(userName, action);
        }
    },

    injectLogout: function () {
        if (window.location.pathname.includes('admin.html')) return; // Don't inject in admin

        // Add a logout link/button to the corner or sidebar
        // Try sidebar first
        const sidebar = document.querySelector('.sidebar-menu');
        if (sidebar) {
            if (!document.getElementById('btn-logout-sidebar')) {
                const btn = document.createElement('a');
                btn.href = "#";
                btn.id = "btn-logout-sidebar";
                btn.textContent = "CERRAR SESIÓN";
                btn.className = "btn-primary";
                btn.style.backgroundColor = "#546e7a";
                btn.style.marginTop = "auto"; // Push to bottom
                btn.onclick = (e) => {
                    e.preventDefault();
                    this.logout();
                };
                sidebar.appendChild(btn);
            }
        } else {
            // Fallback for pages without sidebar (maybe admin?)
            const header = document.querySelector('.header-actions');
            if (header && !document.getElementById('btn-logout-header')) {
                const btn = document.createElement('button');
                btn.id = "btn-logout-header";
                btn.textContent = "Cerrar Sesión";
                btn.style.marginLeft = "10px";
                btn.onclick = () => this.logout();
                header.appendChild(btn);
            }
        }

        // Also inject Admin link if not present
        if (sidebar && !document.getElementById('btn-admin-link')) {
            const btn = document.createElement('a');
            btn.href = "admin.html";
            btn.id = "btn-admin-link";
            btn.textContent = "ADMINISTRACIÓN";
            btn.className = "btn-primary";
            btn.style.backgroundColor = "#455a64";
            sidebar.insertBefore(btn, sidebar.lastChild); // Before logout
        }
    }
};

Auth.checkContext();
