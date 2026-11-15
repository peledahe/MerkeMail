// Módulo de Interfaz de Usuario y Controles UI - MerkeMail

const UI = {
    // Sistema de Notificaciones Sticky (Guardado, Actualizaciones, Éxitos)
    showStickyToast(title, message, type = 'success', duration = 4000) {
        const container = document.getElementById('sticky-notifications-container');
        if (!container) return;

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
                <p class="text-xs opacity-90 mt-0.5 line-clamp-2">${message}</p>
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

    // Gestión del Tema Dual (Light / Dark)
    toggleTheme() {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        this.updateThemeButton();
    },

    initTheme() {
        const saved = localStorage.getItem('theme') || 'dark';
        if (saved === 'dark') {
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

        // Verificar si la app ya está instalada / en modo standalone
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        this.updatePWAUIState(isStandalone);

        // Capturar el evento de instalación nativo
        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevenir el banner automático para controlarlo nosotros
            e.preventDefault();
            this.deferredPrompt = e;
            this.updatePWAUIState(false);
            const btnHeader = document.getElementById('btn-install-pwa');
            if (btnHeader) {
                btnHeader.classList.remove('hidden');
                btnHeader.classList.add('flex');
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
