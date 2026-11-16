// Módulo de Interfaz de Usuario y Controles UI - MerkeMail

const UI = {
    // Traducción de errores técnicos a mensajes comprensibles y humanos
    humanizeError(error) {
        if (!error) return 'Ocurrió un inconveniente inesperado';
        const msg = typeof error === 'string' ? error : (error.message || String(error));
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed') || msg.includes('conexion')) {
            return 'No pudimos conectar con el servidor local. Verifica que el servicio esté ejecutándose.';
        }
        if (msg.includes('500') || msg.includes('Internal Server Error')) {
            return 'El servidor encontró una dificultad momentánea. Intenta de nuevo en unos momentos.';
        }
        if (msg.includes('404')) {
            return 'El elemento solicitado no fue encontrado o ya no está disponible.';
        }
        if (msg.includes('401') || msg.includes('403')) {
            return 'La sesión o credenciales han expirado. Vuelve a iniciar sesión o verifica tu cuenta.';
        }
        return msg;
    },

    // Imagen de error embebida para disponibilidad 100% offline o ante fallos del servidor
    ERROR_GIF_DATA_URI: "data:image/gif;base64,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",

    // Componente visual reutilizable para estados de error con imagen congruente asegurada
    renderErrorState({
        title = 'No logramos conectar con el servidor',
        message = 'Parece que se interrumpió la conexión o el servicio no está respondiendo. No te preocupes, tus datos están seguros.',
        retryAction = null,
        retryText = 'Reintentar conexión',
        size = 'md' // 'xs', 'sm', 'md', 'lg'
    } = {}) {
        const imgSize = size === 'xs' ? 'w-16 h-16' : (size === 'sm' ? 'w-24 h-24' : (size === 'lg' ? 'w-44 h-44' : 'w-32 h-32'));
        const padding = size === 'xs' ? 'py-2 px-2' : (size === 'sm' ? 'py-4 px-3' : 'py-10 px-6');
        const titleClass = size === 'xs' ? 'text-[11px] font-bold' : (size === 'sm' ? 'text-xs font-bold' : 'text-sm font-bold');
        const msgClass = size === 'xs' ? 'text-[10px]' : (size === 'sm' ? 'text-[11px]' : 'text-xs');

        const escapedTitle = window.EmailManager ? EmailManager.escapeHtml(title) : title;
        const humanMsg = this.humanizeError(message);
        const escapedMsg = window.EmailManager ? EmailManager.escapeHtml(humanMsg) : humanMsg;
        const escapedRetry = window.EmailManager ? EmailManager.escapeHtml(retryText) : retryText;

        return `
            <div class="${padding} flex flex-col items-center justify-center text-center max-w-sm mx-auto select-none">
                <img src="${this.ERROR_GIF_DATA_URI}" onerror="this.src='/img/error.gif'" alt="Error de conexión" class="${imgSize} object-contain mb-3 drop-shadow-sm pointer-events-none">
                <h4 class="${titleClass} text-slate-800 dark:text-slate-100">${escapedTitle}</h4>
                <p class="${msgClass} text-slate-500 dark:text-slate-400 mt-1 mb-3.5 leading-relaxed">
                    ${escapedMsg}
                </p>
                ${retryAction ? `
                    <button onclick="${retryAction}" class="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-semibold shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                        <span>${escapedRetry}</span>
                    </button>
                ` : ''}
            </div>
        `;
    },

    // Sistema de Notificaciones Sticky (Guardado, Actualizaciones, Éxitos)
    showStickyToast(title, message, type = 'success', duration = 4000) {
        const container = document.getElementById('sticky-notifications-container');
        if (!container) return;

        const displayMessage = type === 'error' ? this.humanizeError(message) : message;

        const toast = document.createElement('div');
        toast.className = `sticky-toast flex items-start gap-3 p-4 rounded-xl shadow-xl border mb-3 w-84 md:w-96 backdrop-blur-md transition-all ${
            type === 'success' ? 'bg-emerald-950/90 text-emerald-100 border-emerald-800/60' :
            type === 'error' ? 'bg-rose-950/90 text-rose-100 border-rose-800/60' :
            type === 'warning' ? 'bg-amber-950/90 text-amber-100 border-amber-800/60' :
            'bg-slate-900/90 text-slate-100 border-slate-700/60'
        }`;

        const iconSvg = {
            success: `<svg class="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`,
            error: `<svg class="w-5 h-5 text-rose-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`,
            warning: `<svg class="w-5 h-5 text-amber-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`,
            info: `<svg class="w-5 h-5 text-sky-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
        }[type] || '';

        toast.innerHTML = `
            ${iconSvg}
            <div class="flex-1 min-w-0">
                <h4 class="font-semibold text-sm leading-tight">${title}</h4>
                <p class="text-xs opacity-90 mt-0.5 line-clamp-2">${displayMessage}</p>
            </div>
            <button class="text-slate-400 hover:text-white transition-colors p-1" onclick="this.parentElement.remove()">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
        `;

        container.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => {
                toast.classList.add('hiding');
                setTimeout(() => toast.remove(), 260);
            }, duration);
        }
    },

    // Modal de Confirmación Elegante (Reemplazo obligatorio de confirm() nativo)
    confirm({
        title = '¿Confirmar acción?',
        message = '¿Estás seguro de que deseas proceder con esta acción?',
        confirmText = 'Confirmar',
        cancelText = 'Cancelar',
        isDanger = false
    } = {}) {
        return new Promise((resolve) => {
            const modalEl = document.getElementById('confirmation-modal');
            const titleEl = document.getElementById('confirm-modal-title');
            const messageEl = document.getElementById('confirm-modal-message');
            const confirmBtn = document.getElementById('confirm-modal-btn');
            const cancelBtn = document.getElementById('confirm-modal-cancel');

            titleEl.textContent = title;
            messageEl.textContent = message;
            confirmBtn.textContent = confirmText;
            cancelBtn.textContent = cancelText;

            if (isDanger) {
                confirmBtn.className = 'px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow transition-colors';
            } else {
                confirmBtn.className = 'px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow transition-colors';
            }

            modalEl.classList.remove('hidden');

            const cleanUp = () => {
                modalEl.classList.add('hidden');
                confirmBtn.onclick = null;
                cancelBtn.onclick = null;
            };

            confirmBtn.onclick = () => {
                cleanUp();
                resolve(true);
            };

            cancelBtn.onclick = () => {
                cleanUp();
                resolve(false);
            };
        });
    },

    // Manejo de Modales Laterales (Drawers)
    openDrawer(drawerId) {
        const drawer = document.getElementById(drawerId);
        if (!drawer) return;
        drawer.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
        if (drawerId === 'drawer-antigravity-copilot' && window.AntigravityCopilot) {
            AntigravityCopilot.onOpenDrawer();
        }
    },

    closeDrawer(drawerId) {
        const drawer = document.getElementById(drawerId);
        if (!drawer) return;
        drawer.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    },

    closeAllDrawers() {
        document.querySelectorAll('.drawer-root').forEach(d => d.classList.add('hidden'));
        document.body.classList.remove('overflow-hidden');
    },

    // Gestión del Tema Dual (Light / Dark) con Persistencia Triple (localStorage + SQLite Backend + Head Script)
    toggleTheme() {
        const isDark = document.documentElement.classList.toggle('dark');
        const theme = isDark ? 'dark' : 'light';
        try {
            localStorage.setItem('theme', theme);
        } catch (e) {}
        this.updateThemeButton();

        // Persistir en SQLite en el backend para que se mantenga aunque se cierre o reinicie la app
        fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ theme })
        }).catch(() => {});
    },

    async initTheme() {
        // 1. Aplicar de inmediato desde localStorage para evitar parpadeos visuales
        let currentTheme = 'dark';
        try {
            const saved = localStorage.getItem('theme');
            if (saved === 'light' || saved === 'dark') {
                currentTheme = saved;
            }
        } catch (e) {}

        this.applyTheme(currentTheme);

        // 2. Sincronizar con la base de datos persistente del backend (SQLite)
        try {
            const res = await fetch('/api/settings');
            if (res.ok) {
                const data = await res.json();
                if (data.theme && (data.theme === 'light' || data.theme === 'dark')) {
                    if (data.theme !== currentTheme) {
                        this.applyTheme(data.theme);
                        try {
                            localStorage.setItem('theme', data.theme);
                        } catch (e) {}
                    }
                }
            }
        } catch (e) {}
    },

    applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        this.updateThemeButton();
    },

    updateThemeButton() {
        const isDark = document.documentElement.classList.contains('dark');
        const icon = document.getElementById('theme-toggle-icon');
        if (icon) {
            icon.innerHTML = isDark 
                ? '<svg class="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>'
                : '<svg class="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.03 9.03 0 008.354-5.646z"/></svg>';
        }
    },

    // Alternar Colapsar / Expandir Barra Lateral (Desktop)
    toggleSidebarCollapse() {
        const sidebar = document.getElementById('sidebar-container');
        if (!sidebar) return;
        
        // En móviles (< 768px), usar drawer móvil
        if (window.innerWidth < 768) {
            this.toggleMobileSidebar();
            return;
        }

        const isCollapsed = sidebar.classList.toggle('collapsed');
        if (isCollapsed) {
            sidebar.style.width = '64px';
            localStorage.setItem('sidebar_collapsed', 'true');
        } else {
            const savedWidth = localStorage.getItem('sidebar_width') || '240px';
            const w = parseInt(savedWidth);
            sidebar.style.width = (isNaN(w) || w < 140) ? '240px' : `${w}px`;
            localStorage.setItem('sidebar_collapsed', 'false');
        }
    },

    // Abrir / Cerrar Barra Lateral en Móviles (< 768px)
    toggleMobileSidebar() {
        const sidebar = document.getElementById('sidebar-container');
        const backdrop = document.getElementById('sidebar-mobile-backdrop');
        if (!sidebar) return;
        const isOpen = sidebar.classList.toggle('mobile-open');
        if (backdrop) {
            backdrop.classList.toggle('hidden', !isOpen);
        }
    },

    closeMobileSidebar() {
        const sidebar = document.getElementById('sidebar-container');
        const backdrop = document.getElementById('sidebar-mobile-backdrop');
        if (sidebar) sidebar.classList.remove('mobile-open');
        if (backdrop) backdrop.classList.add('hidden');
    },

    // Forzar sincronización unificada de Otras Apps (Calendario, Tareas y Contactos)
    async syncOtherApps(btnEl) {
        const btn = btnEl || document.getElementById('btn-sync-other-apps');
        const icon = btn ? btn.querySelector('svg') : null;
        if (btn && btn.disabled) return;
        if (btn) btn.disabled = true;
        if (icon) icon.classList.add('animate-spin', 'text-indigo-600', 'dark:text-indigo-400');

        this.showStickyToast('Sincronizando Otras Apps', 'Sincronizando Calendario, Tareas y Contactos en segundo plano...', 'info', 2500);

        try {
            const [calRes, contactsRes] = await Promise.all([
                fetch('/api/calendars/sync', { method: 'POST' }).then(r => r.json()).catch(() => ({})),
                fetch('/api/contacts/sync', { method: 'POST' }).then(r => r.json()).catch(() => ({}))
            ]);

            if (typeof CalendarManager !== 'undefined') {
                await Promise.all([
                    CalendarManager.loadCalendars(),
                    CalendarManager.loadEvents(),
                    CalendarManager.loadTasks()
                ]).catch(() => {});
                CalendarManager.renderCalendarSidebarList();
                CalendarManager.renderCurrentView();
                CalendarManager.renderUpcomingList();
                CalendarManager.renderTasks();
                setTimeout(async () => {
                    try {
                        await Promise.all([
                            CalendarManager.loadCalendars(),
                            CalendarManager.loadEvents(),
                            CalendarManager.loadTasks()
                        ]);
                        CalendarManager.renderCalendarSidebarList();
                        CalendarManager.renderCurrentView();
                        CalendarManager.renderUpcomingList();
                        CalendarManager.renderTasks();
                    } catch (_) {}
                }, 2800);
            }

            if (typeof ContactsManager !== 'undefined') {
                await ContactsManager.loadContacts().catch(() => {});
            }

            const totalContacts = contactsRes && contactsRes.total_contacts !== undefined ? ` (${contactsRes.total_contacts} contactos)` : '';
            this.showStickyToast('Sincronización Completada', `Calendario, Tareas y Contactos actualizados correctamente${totalContacts}.`, 'success', 3500);
        } catch (e) {
            this.showStickyToast('Error', 'No se pudo completar la sincronización de Calendario y Contactos', 'error');
        } finally {
            if (btn) btn.disabled = false;
            if (icon) icon.classList.remove('animate-spin', 'text-indigo-600', 'dark:text-indigo-400');
        }
    },

    // Inicializar Redimensionador y Estado de Barra Lateral
    initSidebar() {
        const sidebar = document.getElementById('sidebar-container');
        const resizer = document.getElementById('sidebar-resizer');
        if (!sidebar) return;

        // Restaurar estado guardado
        const isCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
        if (isCollapsed && window.innerWidth >= 768) {
            sidebar.classList.add('collapsed');
            sidebar.style.width = '64px';
        } else {
            const savedWidth = localStorage.getItem('sidebar_width');
            if (savedWidth && window.innerWidth >= 768) {
                const w = parseInt(savedWidth);
                if (!isNaN(w) && w >= 64 && w <= 320) {
                    sidebar.style.width = `${w}px`;
                    if (w <= 72) sidebar.classList.add('collapsed');
                }
            }
        }

        if (!resizer) return;

        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = sidebar.getBoundingClientRect().width;
            sidebar.classList.add('resizing');
            resizer.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const delta = e.clientX - startX;
            let newWidth = startWidth + delta;

            // Restricción: no menos de un espacio prudencial (64px) y máximo 280px
            const MIN_WIDTH = 64;
            const MAX_WIDTH = 280;

            if (newWidth < MIN_WIDTH) newWidth = MIN_WIDTH;
            if (newWidth > MAX_WIDTH) newWidth = MAX_WIDTH;

            sidebar.style.width = `${newWidth}px`;

            if (newWidth <= 72) {
                sidebar.classList.add('collapsed');
            } else {
                sidebar.classList.remove('collapsed');
            }
        });

        document.addEventListener('mouseup', () => {
            if (!isResizing) return;
            isResizing = false;
            sidebar.classList.remove('resizing');
            resizer.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            const currentWidth = sidebar.getBoundingClientRect().width;
            if (currentWidth <= 72) {
                sidebar.classList.add('collapsed');
                sidebar.style.width = '64px';
                localStorage.setItem('sidebar_collapsed', 'true');
            } else {
                sidebar.classList.remove('collapsed');
                localStorage.setItem('sidebar_collapsed', 'false');
                localStorage.setItem('sidebar_width', `${Math.round(currentWidth)}px`);
            }
        });

        // Doble clic en el resizer para alternar rápidamente entre expandido y colapsado
        resizer.addEventListener('dblclick', () => {
            this.toggleSidebarCollapse();
        });

        // Sincronización responsiva al redimensionar la ventana con prioridad al correo
        window.addEventListener('resize', () => {
            const listPanel = document.getElementById('email-list-container');
            const detailPanel = document.getElementById('email-detail-container');
            if (window.innerWidth >= 768) {
                this.closeMobileSidebar();
                if (listPanel) listPanel.classList.remove('hidden');
                if (detailPanel) {
                    detailPanel.classList.remove('hidden');
                    detailPanel.classList.add('flex');
                }
                this.syncResponsiveLayoutPriority();
            } else {
                if (window.EmailManager && EmailManager.selectedEmailId) {
                    if (listPanel) listPanel.classList.add('hidden');
                    if (detailPanel) {
                        detailPanel.classList.remove('hidden');
                        detailPanel.classList.add('flex');
                    }
                } else {
                    if (listPanel) listPanel.classList.remove('hidden');
                    if (detailPanel) {
                        detailPanel.classList.add('hidden');
                        detailPanel.classList.remove('flex');
                    }
                }
            }
        });

        // Aplicar jerarquía responsiva inicial
        this.syncResponsiveLayoutPriority();

        // Inicializar barra flotante para opciones del sidebar colapsado (en lugar del tooltip nativo)
        this.initSidebarHoverBar();

        // Inicializar tooltips elegantes con bordes redondeados suaves para todos los botones
        this.initAppTooltips();
    },

    // Sincronizar Jerarquía Responsiva: Prioridad al área del correo
    syncResponsiveLayoutPriority() {
        const sidebar = document.getElementById('sidebar-container');
        const listContainer = document.getElementById('email-list-container');
        if (!sidebar || !listContainer) return;

        const w = window.innerWidth;
        if (w >= 768 && w < 1200) {
            // TABLET / PANTALLAS MEDIANAS:
            // 1. Reducir PRIMERO la barra lateral (colapsar a 64px)
            sidebar.classList.add('collapsed');
            sidebar.style.width = '64px';

            // 2. Reducir LUEGO la columna de lista de correos
            if (w < 992) {
                listContainer.style.width = '270px';
                listContainer.classList.add('compact-mode', 'ultra-compact-mode');
            } else {
                listContainer.style.width = '320px';
                listContainer.classList.add('compact-mode');
                listContainer.classList.remove('ultra-compact-mode');
            }
        } else if (w >= 1200) {
            // ESCRITORIO AMPLIO:
            // Restaurar según las preferencias guardadas del usuario si no estaba colapsado manualmente
            const isManualCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
            if (!isManualCollapsed) {
                sidebar.classList.remove('collapsed');
                const savedWidth = localStorage.getItem('sidebar_width') || '240px';
                const parsedW = parseInt(savedWidth);
                sidebar.style.width = (isNaN(parsedW) || parsedW < 140) ? '240px' : `${parsedW}px`;
            }
            const savedListWidth = localStorage.getItem('email_list_width') || '460px';
            const parsedListW = parseInt(savedListWidth);
            const lw = (!isNaN(parsedListW) && parsedListW >= 220) ? parsedListW : 460;
            listContainer.style.width = `${lw}px`;
            if (lw <= 390) listContainer.classList.add('compact-mode');
            else listContainer.classList.remove('compact-mode');
            if (lw <= 290) listContainer.classList.add('ultra-compact-mode');
            else listContainer.classList.remove('ultra-compact-mode');
        }
    },

    // Barra Flotante de Opciones en modo Colapsado (sustituto del tooltip nativo de Chrome/OS)
    initSidebarHoverBar() {
        const sidebar = document.getElementById('sidebar-container');
        const hoverBar = document.getElementById('sidebar-hover-bar');
        const hoverDot = document.getElementById('sidebar-hover-bar-dot');
        const hoverText = document.getElementById('sidebar-hover-bar-text');
        const hoverBadge = document.getElementById('sidebar-hover-bar-badge');
        if (!sidebar || !hoverBar) return;

        let activeTarget = null;

        const isSidebarCollapsed = () => {
            return sidebar.classList.contains('collapsed') || sidebar.getBoundingClientRect().width <= 75;
        };

        const showHoverBar = (el) => {
            if (!isSidebarCollapsed()) {
                hideHoverBar();
                return;
            }

            // Suprimir atributo title nativo para que el navegador jamás pinte el tooltip feo del sistema
            if (el.hasAttribute('title')) {
                el.dataset.sidebarTooltip = el.getAttribute('title');
                el.removeAttribute('title');
            }

            let text = el.dataset.sidebarTooltip || '';
            let dotColor = null;
            let badgeText = null;

            // Extracción contextual de la información de la opción
            if (el.id === 'btn-sidebar-collapse') {
                text = 'Ampliar barra lateral';
            } else if (el.id === 'sidebar-account-selector-btn') {
                const nameEl = document.getElementById('sidebar-account-selected-name');
                const dotEl = document.getElementById('sidebar-account-selected-dot');
                text = (nameEl ? nameEl.textContent : '') || text || 'Todas las cuentas';
                if (dotEl) {
                    dotColor = dotEl.style.backgroundColor || null;
                }
            } else if (el.classList.contains('folder-nav-btn')) {
                const spanText = el.querySelector('.sidebar-text');
                const badgeEl = el.querySelector('.sidebar-badge');
                if (spanText) text = spanText.textContent.trim();
                if (badgeEl && !badgeEl.classList.contains('hidden') && badgeEl.textContent.trim() && badgeEl.textContent.trim() !== '...') {
                    badgeText = badgeEl.textContent.trim();
                }
            } else if (el.classList.contains('label-nav-btn')) {
                const spanText = el.querySelector('.sidebar-text');
                const dot = el.querySelector('span[style*="background-color"]');
                const badgeEl = el.querySelector('.sidebar-badge');
                if (spanText) text = spanText.textContent.trim();
                if (dot) dotColor = dot.style.backgroundColor;
                if (badgeEl && !badgeEl.classList.contains('hidden') && badgeEl.textContent.trim()) {
                    badgeText = badgeEl.textContent.trim();
                }
            } else {
                const spanText = el.querySelector('.sidebar-text');
                if (spanText) text = spanText.textContent.trim();
            }

            if (!text) {
                hideHoverBar();
                return;
            }

            // Asignar texto a la barra
            hoverText.textContent = text;

            // Dot de color si corresponde
            if (dotColor) {
                hoverDot.style.backgroundColor = dotColor;
                hoverDot.classList.remove('hidden');
            } else {
                hoverDot.classList.add('hidden');
            }

            // Badge si corresponde
            if (badgeText) {
                hoverBadge.textContent = badgeText;
                hoverBadge.classList.remove('hidden');
            } else {
                hoverBadge.classList.add('hidden');
            }

            // Posicionar la barra exactamente al lado del icono correspondiente
            const rect = el.getBoundingClientRect();
            const sidebarRect = sidebar.getBoundingClientRect();
            const topY = rect.top + (rect.height / 2);
            const leftX = sidebarRect.right + 8;

            hoverBar.style.top = `${Math.round(topY)}px`;
            hoverBar.style.left = `${Math.round(leftX)}px`;
            hoverBar.style.transform = 'translateY(-50%)';

            hoverBar.classList.remove('hidden');
            void hoverBar.offsetWidth;
            hoverBar.classList.add('active');
        };

        const hideHoverBar = () => {
            if (hoverBar) {
                hoverBar.classList.remove('active');
                hoverBar.classList.add('hidden');
            }
            activeTarget = null;
        };

        // Escuchar eventos en los elementos interactivos del sidebar
        sidebar.addEventListener('mouseover', (e) => {
            const target = e.target.closest('#btn-sidebar-collapse, #sidebar-account-selector-btn, .folder-nav-btn, .label-nav-btn, #nav-item-calendar, button[onclick*="drawer"]');
            if (target && target !== activeTarget) {
                activeTarget = target;
                showHoverBar(target);
            }
        });

        sidebar.addEventListener('mouseout', (e) => {
            const target = e.target.closest('#btn-sidebar-collapse, #sidebar-account-selector-btn, .folder-nav-btn, .label-nav-btn, #nav-item-calendar, button[onclick*="drawer"]');
            if (target && (!e.relatedTarget || !target.contains(e.relatedTarget))) {
                hideHoverBar();
            }
        });

        window.addEventListener('scroll', hideHoverBar, true);
    },

    // Sistema Global de Tooltips con Bordes Redondeados Suaves para todos los Botones de la Aplicación
    initAppTooltips() {
        const tooltipEl = document.getElementById('app-global-tooltip');
        if (!tooltipEl) return;

        let activeTarget = null;
        let showTimeout = null;

        const hideTooltip = () => {
            if (showTimeout) {
                clearTimeout(showTimeout);
                showTimeout = null;
            }
            if (tooltipEl) {
                tooltipEl.classList.remove('active');
                tooltipEl.style.display = 'none';
            }
            activeTarget = null;
        };

        const showTooltip = (targetEl) => {
            if (!targetEl || !document.body.contains(targetEl)) {
                hideTooltip();
                return;
            }

            // Si está dentro del sidebar y este se encuentra colapsado, el sidebar usa su propio tooltip (#sidebar-hover-bar)
            const sidebar = document.getElementById('sidebar-container');
            if (sidebar && sidebar.contains(targetEl) && (sidebar.classList.contains('collapsed') || sidebar.getBoundingClientRect().width <= 75)) {
                hideTooltip();
                return;
            }

            // Suprimir atributo title nativo para que el navegador jamás pinte el tooltip feo del sistema operativo
            if (targetEl.hasAttribute('title')) {
                const titleVal = targetEl.getAttribute('title').trim();
                if (titleVal) {
                    targetEl.dataset.appTooltip = titleVal;
                }
                targetEl.removeAttribute('title');
            }

            const text = targetEl.dataset.appTooltip || targetEl.dataset.tooltip || '';
            if (!text || text.trim() === '') {
                hideTooltip();
                return;
            }

            tooltipEl.textContent = text;
            tooltipEl.style.display = 'block';

            // Medir dimensiones del elemento y tooltip
            const rect = targetEl.getBoundingClientRect();
            const tipRect = tooltipEl.getBoundingClientRect();
            const margin = 7;

            // Determinar posición vertical (arriba del botón si cabe, de lo contrario abajo)
            let top = rect.top - tipRect.height - margin;
            if (top < 8) {
                top = rect.bottom + margin;
            }

            // Centrar horizontalmente respecto al botón
            let left = rect.left + (rect.width / 2) - (tipRect.width / 2);
            // Prevenir desbordamiento por los bordes de la pantalla
            const paddingScreen = 10;
            if (left < paddingScreen) {
                left = paddingScreen;
            } else if (left + tipRect.width > window.innerWidth - paddingScreen) {
                left = window.innerWidth - tipRect.width - paddingScreen;
            }

            tooltipEl.style.top = `${Math.round(top)}px`;
            tooltipEl.style.left = `${Math.round(left)}px`;

            // Activar transición suave
            void tooltipEl.offsetWidth;
            tooltipEl.classList.add('active');
        };

        // Delegación global para mouseover / pointerenter
        document.addEventListener('mouseover', (e) => {
            const target = e.target.closest('button, a, [title], [data-app-tooltip], [data-tooltip]');
            if (!target) {
                hideTooltip();
                return;
            }

            const elementWithTitle = (target.hasAttribute('title') || target.dataset.appTooltip || target.dataset.tooltip) ? target : target.closest('[title], [data-app-tooltip], [data-tooltip]');
            if (!elementWithTitle) {
                hideTooltip();
                return;
            }

            if (elementWithTitle === activeTarget) return;

            activeTarget = elementWithTitle;
            if (showTimeout) clearTimeout(showTimeout);

            // Retardo sutil y cómodo de 180ms
            showTimeout = setTimeout(() => {
                showTooltip(elementWithTitle);
            }, 180);
        }, true);

        document.addEventListener('mouseout', (e) => {
            if (activeTarget && (!e.relatedTarget || !activeTarget.contains(e.relatedTarget))) {
                hideTooltip();
            }
        }, true);

        // Ocultar al hacer click, pulsar teclas o scrollear
        window.addEventListener('scroll', hideTooltip, true);
        document.addEventListener('mousedown', hideTooltip, true);
        document.addEventListener('keydown', hideTooltip, true);
    },

    // Inicializar Redimensionador de Lista de Correos
    initEmailListResizer() {
        const listContainer = document.getElementById('email-list-container');
        const resizer = document.getElementById('email-list-resizer');
        if (!listContainer || !resizer) return;

        const updateCompactClasses = (width) => {
            if (width <= 390) {
                listContainer.classList.add('compact-mode');
            } else {
                listContainer.classList.remove('compact-mode');
            }

            if (width <= 290) {
                listContainer.classList.add('ultra-compact-mode');
            } else {
                listContainer.classList.remove('ultra-compact-mode');
            }

            if (width <= 230) {
                listContainer.classList.add('extreme-compact-mode');
            } else {
                listContainer.classList.remove('extreme-compact-mode');
            }
        };

        // Restaurar ancho guardado en desktop
        const savedWidth = localStorage.getItem('email_list_width');
        if (savedWidth && window.innerWidth >= 768) {
            const w = parseInt(savedWidth);
            if (!isNaN(w) && w >= 200 && w <= 500) {
                listContainer.style.width = `${w}px`;
                updateCompactClasses(w);
            }
        } else if (listContainer) {
            updateCompactClasses(listContainer.getBoundingClientRect().width || 460);
        }

        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        resizer.addEventListener('mousedown', (e) => {
            if (window.innerWidth < 768) return;
            isResizing = true;
            startX = e.clientX;
            startWidth = listContainer.getBoundingClientRect().width;
            listContainer.classList.add('resizing');
            resizer.classList.add('active');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const delta = e.clientX - startX;
            let newWidth = startWidth + delta;

            // Restricción: mínimo 200px, máximo dinámico protegiendo al menos 380px para el correo
            const MIN_WIDTH = 200;
            const sidebarEl = document.getElementById('sidebar-container');
            const currentSidebarW = sidebarEl ? sidebarEl.getBoundingClientRect().width : 64;
            const maxAllowedForEmail = window.innerWidth - currentSidebarW - 380;
            const MAX_WIDTH = Math.max(MIN_WIDTH, Math.min(480, maxAllowedForEmail));

            if (newWidth < MIN_WIDTH) newWidth = MIN_WIDTH;
            if (newWidth > MAX_WIDTH) newWidth = MAX_WIDTH;

            listContainer.style.width = `${newWidth}px`;
            updateCompactClasses(newWidth);
        });

        document.addEventListener('mouseup', () => {
            if (!isResizing) return;
            isResizing = false;
            listContainer.classList.remove('resizing');
            resizer.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            const currentWidth = listContainer.getBoundingClientRect().width;
            localStorage.setItem('email_list_width', `${Math.round(currentWidth)}px`);
        });
    },

    // --- SOPORTE PWA (Progressive Web App) ---
    deferredPrompt: null,

    initPWA() {
        // Registrar Service Worker
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then((reg) => {
                        console.log('PWA: Service Worker registrado con éxito en scope:', reg.scope);
                    })
                    .catch((err) => {
                        console.warn('PWA: Error al registrar Service Worker:', err);
                    });
            });
        }

        // Verificar si la app ya está instalada / en modo standalone o modo desktop nativo
        const isDesktop = (window.DesktopBridge && window.DesktopBridge.isDesktop) || 
                          window.location.port === '6524' || 
                          window.location.search.includes('desktop=1') ||
                          window.matchMedia('(display-mode: standalone)').matches || 
                          window.navigator.standalone === true;
        this.updatePWAUIState(isDesktop);

        // Capturar el evento de instalación nativo (solo si estamos en el browser normal)
        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevenir el banner automático para controlarlo nosotros
            e.preventDefault();
            this.deferredPrompt = e;
            const currentIsDesktop = (window.DesktopBridge && window.DesktopBridge.isDesktop) || 
                                     window.location.port === '6524' || 
                                     window.location.search.includes('desktop=1');
            if (!currentIsDesktop) {
                this.updatePWAUIState(false);
                const btnHeader = document.getElementById('btn-install-pwa');
                if (btnHeader) {
                    btnHeader.classList.remove('hidden');
                    btnHeader.classList.add('flex');
                }
            }
        });

        // Evento cuando la app se instala satisfactoriamente
        window.addEventListener('appinstalled', () => {
            this.deferredPrompt = null;
            this.updatePWAUIState(true);
            this.showStickyToast('Instalación Completada', '¡MerkeMail se instaló correctamente en tu dispositivo!', 'success');
        });
    },

    updatePWAUIState(isInstalled) {
        const btnHeader = document.getElementById('btn-install-pwa');
        const pillDrawer = document.getElementById('pwa-status-pill');
        const btnDrawer = document.getElementById('btn-install-pwa-drawer');
        const installedMsg = document.getElementById('pwa-installed-message');

        if (isInstalled) {
            if (btnHeader) {
                btnHeader.classList.add('hidden');
                btnHeader.classList.remove('flex');
            }
            if (pillDrawer) {
                pillDrawer.textContent = 'Instalada';
                pillDrawer.className = 'text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800';
            }
            if (btnDrawer) btnDrawer.classList.add('hidden');
            if (installedMsg) installedMsg.classList.remove('hidden');
        } else {
            if (this.deferredPrompt && btnHeader) {
                btnHeader.classList.remove('hidden');
                btnHeader.classList.add('flex');
            }
            if (pillDrawer) {
                pillDrawer.textContent = 'Disponible';
                pillDrawer.className = 'text-[10px] px-2 py-0.5 rounded-full font-medium bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-800';
            }
            if (btnDrawer) btnDrawer.classList.remove('hidden');
            if (installedMsg) installedMsg.classList.add('hidden');
        }
    },

    async promptInstallPWA() {
        if (!this.deferredPrompt) {
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
            if (isStandalone) {
                this.showStickyToast('App Instalada', 'MerkeMail ya se está ejecutando en tu dispositivo como aplicación nativa.', 'info');
                return;
            }

            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            if (isIOS) {
                this.showStickyToast('Instalación en iOS', 'Presiona el botón "Compartir" de Safari y selecciona "Agregar al inicio" (+).', 'info');
            } else {
                this.showStickyToast('Instalar MerkeMail', 'Haz clic en el icono de instalación (⨁) en la barra de direcciones de tu navegador o menú de Chrome/Edge.', 'info');
            }
            return;
        }

        this.deferredPrompt.prompt();
        const choiceResult = await this.deferredPrompt.userChoice;
        if (choiceResult && choiceResult.outcome === 'accepted') {
            this.showStickyToast('Instalando', 'Iniciando instalación de MerkeMail...', 'success');
            this.deferredPrompt = null;
            const btnHeader = document.getElementById('btn-install-pwa');
            if (btnHeader) {
                btnHeader.classList.add('hidden');
                btnHeader.classList.remove('flex');
            }
        }
    },

    async openComposeModal() {
        const modal = document.getElementById('compose-modal');
        if (!modal) return;
        modal.classList.remove('hidden');

        if (window.GeminiAI) {
            GeminiAI.applyAIStatusUI();
        }

        const accSelect = document.getElementById('compose-account-select');
        if (accSelect && window.SignatureManager) {
            const editorEl = document.getElementById('compose-editor');
            const hasContent = window.Composer && Composer.getTextWithoutSignature(editorEl);
            if (!hasContent) {
                await SignatureManager.applyDefaultSignatureForAccount(parseInt(accSelect.value));
            }
        }

        const toInput = document.getElementById('compose-to');
        if (toInput && !toInput.value) {
            toInput.focus();
        } else if (window.Composer) {
            Composer.focusTop();
        }
    }
};

window.UI = UI;
