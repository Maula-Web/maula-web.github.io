const Auth = {
    async checkContext() {
        // Run Theme Logic INSTANTLY (variables on documentElement)
        this.applySavedTheme();

        const onReady = () => {
            this.applyLayoutPreference();
            this.handleResponsive();
            if (!window.location.pathname.includes('login.html')) {
                this.injectLogout();
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', onReady);
        } else {
            onReady();
        }

        if (window.location.pathname.includes('login.html')) return;

        const user = sessionStorage.getItem('maulas_user');
        if (!user) {
            window.location.href = 'login.html';
        }
    },

    applyLayoutPreference() {
        const isVertical = localStorage.getItem('maulas_layout') === 'vertical';
        if (isVertical) {
            document.body.classList.add('layout-vertical');
        }
    },

    handleResponsive() {
        const updateClasses = () => {
            const w = window.innerWidth;
            const body = document.body;
            body.classList.remove('mobile-mode', 'tablet-mode', 'desktop-mode');

            if (w < 850) {
                body.classList.add('mobile-mode');
            } else if (w < 1200) {
                body.classList.add('tablet-mode');
            } else {
                body.classList.add('desktop-mode');
            }
        };

        updateClasses();
        window.addEventListener('resize', updateClasses);
    },

    applySavedTheme() {
        // 1. Try Cache First (Instant) - Reads from LocalStorage to prevent flash
        const cached = localStorage.getItem('maulas_theme_cache');
        if (cached) {
            try {
                const themeDoc = JSON.parse(cached);
                const root = document.documentElement;
                Object.entries(themeDoc).forEach(([key, value]) => {
                    if (key.startsWith('--')) {
                        root.style.setProperty(key, value);
                    }
                });
            } catch (e) {
                console.warn('Auth: Invalid cached theme');
            }
        }

        // 2. Background Sync (Async)
        this.syncThemeFromCloud();
    },

    async syncThemeFromCloud() {
        if (window.DataService) {
            try {
                if (!window.DataService.db) await window.DataService.init();
                const config = await window.DataService.getAll('config');
                const themeDoc = config.find(c => c.id === 'theme');
                if (themeDoc) {
                    // Update cache if different
                    localStorage.setItem('maulas_theme_cache', JSON.stringify(themeDoc));

                    const root = document.documentElement;
                    Object.entries(themeDoc).forEach(([key, value]) => {
                        if (key.startsWith('--')) {
                            root.style.setProperty(key, value);
                        }
                    });
                }
            } catch (e) {
                console.warn("Auth: Could not sync theme", e);
            }
        }
    },

    async login(email, password) {
        // Master Password (Local)
        const storedPwd = localStorage.getItem('maulas_admin_pass');
        const validPwd = storedPwd || 'ESTATUTOS';

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
        if (window.location.pathname.includes('login.html')) return;

        // Path current
        const path = window.location.pathname;
        const page = path.split('/').pop() || 'index.html';

        // 1. Ensure Header (sidebar-menu) exists on all pages
        let sidebar = document.querySelector('.sidebar-menu');
        if (!sidebar) {
            sidebar = document.createElement('div');
            sidebar.className = 'sidebar-menu';

            // Reconstruct the full menu with logo
            sidebar.innerHTML = `
                <div class="header-logo" onclick="window.location.href='index.html'" style="cursor:pointer">
                    <img src="LOGO_MAULAS.png?v=2" alt="Logotipo Peña Maulas">
                </div>
                <div class="menu-toggle" id="mobile-menu-toggle">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                <a href="socios.html" class="btn-primary btn-socios ${page === 'socios.html' ? 'active' : ''}">SOCIOS</a>
                <a href="jornadas.html" class="btn-primary btn-jornadas ${page === 'jornadas.html' ? 'active' : ''}">JORNADAS</a>
                <a href="pronosticos.html" class="btn-primary btn-pronosticos ${page === 'pronosticos.html' ? 'active' : ''}">PRONÓSTICOS</a>
                <a href="resultados.html" class="btn-primary btn-resultados ${page === 'resultados.html' ? 'active' : ''}">RESULTADOS</a>
                <a href="resumen-temporada.html" class="btn-primary btn-resumen ${page === 'resumen-temporada.html' ? 'active' : ''}">RESUMEN TEMPORADA</a>
                <a href="admin.html" class="btn-primary btn-admin ${page === 'admin.html' ? 'active' : ''}">ADMINISTRACIÓN</a>
                <a href="theme-editor.html" class="btn-primary btn-theme-editor ${page === 'theme-editor.html' ? 'active' : ''}" style="color:var(--primary-gold); border-color:var(--primary-gold);">IDENTIDAD VISUAL</a>
            `;
            document.body.prepend(sidebar);
        } else {
            // 1. Ensure Menu Toggle exists even if sidebar was hardcoded
            if (!sidebar.querySelector('.menu-toggle')) {
                const logo = sidebar.querySelector('.header-logo');
                if (logo) {
                    logo.insertAdjacentHTML('afterend', `
                        <div class="menu-toggle" id="mobile-menu-toggle">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    `);
                    logo.style.cursor = 'pointer';
                    logo.onclick = () => window.location.href = 'index.html';
                }
            }

            // 2. Ensure Theme Editor button exists
            if (!sidebar.querySelector('a[href="theme-editor.html"]')) {
                const themeBtn = document.createElement('a');
                themeBtn.href = "theme-editor.html";
                themeBtn.className = `btn-primary btn-theme-editor ${page === 'theme-editor.html' ? 'active' : ''}`;
                themeBtn.style.color = "var(--primary-gold)";
                themeBtn.style.borderColor = "var(--primary-gold)";
                themeBtn.textContent = "IDENTIDAD VISUAL";
                sidebar.appendChild(themeBtn);
            }
        }

        // 2. Ensure Multicolour Separator exists
        if (!document.querySelector('.header-separator')) {
            const separator = document.createElement('div');
            separator.className = 'header-separator';
            document.body.insertBefore(separator, sidebar.nextSibling);
        }

        // 3. Inject Logout Button
        if (!document.getElementById('btn-logout-sidebar')) {
            const btn = document.createElement('a');
            btn.href = "#";
            btn.id = "btn-logout-sidebar";
            btn.textContent = "CERRAR SESIÓN";
            btn.className = "btn-primary";
            btn.onclick = (e) => {
                e.preventDefault();
                this.logout();
            };
            sidebar.appendChild(btn);
        }

        // 4. Remove redundant "Volver" buttons if they exist
        const backBtns = document.querySelectorAll('.btn-back');
        backBtns.forEach(b => b.style.display = 'none');

        // 5. Mobile Toggle Event
        const toggle = document.getElementById('mobile-menu-toggle');
        if (toggle) {
            toggle.onclick = (e) => {
                e.stopPropagation();
                sidebar.classList.toggle('active');
                if (sidebar.classList.contains('active')) {
                    document.body.style.overflow = 'hidden';
                } else {
                    document.body.style.overflow = '';
                }
            };
        }

        // Close menu when clicking a link
        sidebar.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                sidebar.classList.remove('active');
                document.body.style.overflow = '';
            });
        });
    }
};

Auth.checkContext();
