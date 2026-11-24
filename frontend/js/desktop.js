// Módulo de Gestión de Aplicación de Escritorio (Desktop Linux) - Senda

const DesktopBridge = {
    isDesktop: false,
    isMaximized: false,

    init() {
        this.detectEnvironment();
        this.initNativeBridge();
        this.initWindowDragging();
        this.initWindowResizing();
        this.initResponsiveResizeWatcher();
    },

    initNativeBridge() {
        if (typeof qt !== 'undefined' && qt.webChannelTransport) {
            try {
                if (typeof QWebChannel !== 'undefined') {
                    new QWebChannel(qt.webChannelTransport, (channel) => {
                        window.pyqtBridge = channel.objects.pyqtBridge;
                    });
                }
            } catch (e) {
                console.warn('Aviso inicializando QWebChannel:', e);
            }
        }
    },

    detectEnvironment() {
        const params = new URLSearchParams(window.location.search);
        const hasDesktopParam = params.get('desktop') === '1' || params.get('desktop') === 'true' || params.get('app') === 'desktop';
        const isPyQt = !!window.pyqtBridge || (navigator.userAgent && (navigator.userAgent.includes('QtWebEngine') || navigator.userAgent.includes('PyQt')));
        // Modo instalado de escritorio (PyQt6 nativo / ?desktop=1)
        const isInstalledDesktop = hasDesktopParam || isPyQt || !!window.isDesktopApp;

        this.isDesktop = isInstalledDesktop;
        this.applyEnvironmentUI();
    },

    applyEnvironmentUI() {
        const controls = document.getElementById('desktop-window-controls');
        const btnInstallPwa = document.getElementById('btn-install-pwa');
        const pwaCardDrawer = document.getElementById('pwa-installation-card');
        const btnPrint = document.getElementById('btn-print-email');
        const dragStrip = document.getElementById('desktop-window-drag-strip');

        if (this.isDesktop) {
            // 1. En aplicación instalada: OCULTAR todas las opciones de instalar app y botón de imprimir
            if (btnInstallPwa) {
                btnInstallPwa.classList.add('hidden');
                btnInstallPwa.classList.remove('flex');
            }
            if (pwaCardDrawer) {
                pwaCardDrawer.classList.add('hidden');
            }
            if (btnPrint) {
                btnPrint.classList.add('hidden');
            }

            // 2. MOSTRAR controles de ventana (cerrar, ampliar/restaurar, minimizar) a la par del avatar
            if (controls) {
                controls.classList.remove('hidden');
                controls.classList.add('flex');
            }

            // 3. MOSTRAR franja superior dedicada de arrastre de ventana
            if (dragStrip) {
                dragStrip.classList.remove('hidden');
                dragStrip.classList.add('block');
            }
            this.checkWindowState();
        } else {
            // En navegador web (browser normal y modo PWA):
            // Ocultar controles de ventana ya que el navegador tiene los suyos
            if (controls) {
                controls.classList.add('hidden');
                controls.classList.remove('flex');
            }
            if (dragStrip) {
                dragStrip.classList.add('hidden');
                dragStrip.classList.remove('block');
            }
            if (pwaCardDrawer) {
                pwaCardDrawer.classList.remove('hidden');
            }
            if (btnPrint) {
                btnPrint.classList.remove('hidden');
            }
            // Dejar que UI gestione el botón de instalar app para quien navega por web
        }
    },

    initWindowDragging() {
        const header = document.getElementById('main-header');
        const dragStrip = document.getElementById('desktop-window-drag-strip');
        if (!header && !dragStrip) return;

        let isDragging = false;
        let lastScreenX = 0;
        let lastScreenY = 0;

        const onMouseDown = (e) => {
            if (e.button !== 0) return; // Solo botón izquierdo del ratón

            // Si el clic es sobre un elemento interactivo (botones, inputs, avatar, controles, etc.), no arrastrar
            const interactive = e.target.closest('button, input, a, select, textarea, [onclick], #user-header-avatar, #desktop-window-controls, .cursor-pointer');
            if (interactive) return;

            isDragging = true;
            lastScreenX = e.screenX;
            lastScreenY = e.screenY;
            document.body.style.userSelect = 'none';

            // Disparar arrastre nativo acelerado si el gestor de ventanas del sistema lo soporta
            try {
                console.log('__PYQT_ACTION__:start_drag');
            } catch (_) {}
            if (window.pyqtBridge && window.pyqtBridge.start_drag) {
                try { window.pyqtBridge.start_drag(); } catch (_) {}
            }
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;

            // Si se soltó el botón del ratón fuera de foco
            if (e.buttons === 0) {
                isDragging = false;
                document.body.style.userSelect = '';
                return;
            }

            const dx = e.screenX - lastScreenX;
            const dy = e.screenY - lastScreenY;

            if (dx === 0 && dy === 0) return;

            lastScreenX = e.screenX;
            lastScreenY = e.screenY;

            // Transmitir desplazamiento físico continuo e instantáneo a la ventana PyQt6
            try {
                console.log(`__PYQT_MOVE__:${dx}:${dy}`);
            } catch (_) {}
        };

        const onMouseUp = () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.userSelect = '';
            }
        };

        // Escuchar eventos en la franja superior y en el header
        if (dragStrip) dragStrip.addEventListener('mousedown', onMouseDown);
        if (header) header.addEventListener('mousedown', onMouseDown);

        window.addEventListener('mousemove', onMouseMove, { passive: true });
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('blur', onMouseUp);

        // Doble clic en cualquier área libre para alternar maximizado / restaurar
        const onDblClick = (e) => {
            const interactive = e.target.closest('button, input, a, select, textarea, [onclick], #user-header-avatar, #desktop-window-controls, .cursor-pointer');
            if (interactive) return;
            this.toggleMaximizeWindow();
        };

        if (dragStrip) dragStrip.addEventListener('dblclick', onDblClick);
        if (header) header.addEventListener('dblclick', onDblClick);
    },

    initWindowResizing() {
        if (!this.isDesktop) return;

        const edges = [
            { dir: 'n',  style: 'top:0;left:8px;right:8px;height:5px;cursor:ns-resize;' },
            { dir: 's',  style: 'bottom:0;left:8px;right:8px;height:6px;cursor:ns-resize;' },
            { dir: 'w',  style: 'left:0;top:8px;bottom:8px;width:6px;cursor:ew-resize;' },
            { dir: 'e',  style: 'right:0;top:8px;bottom:8px;width:6px;cursor:ew-resize;' },
            { dir: 'nw', style: 'top:0;left:0;width:10px;height:10px;cursor:nwse-resize;' },
            { dir: 'ne', style: 'top:0;right:0;width:10px;height:10px;cursor:nesw-resize;' },
            { dir: 'sw', style: 'bottom:0;left:0;width:12px;height:12px;cursor:nesw-resize;' },
            { dir: 'se', style: 'bottom:0;right:0;width:12px;height:12px;cursor:nwse-resize;' }
        ];

        let activeEdge = null;
        let lastX = 0;
        let lastY = 0;

        const container = document.createElement('div');
        container.id = 'desktop-resize-handles';
        edges.forEach(({ dir, style }) => {
            const handle = document.createElement('div');
            handle.dataset.resizeEdge = dir;
            handle.style.cssText = `position:fixed;${style}z-index:9998;user-select:none;`;
            handle.addEventListener('mousedown', (e) => {
                if (e.button !== 0 || this.isMaximized) return;
                e.preventDefault();
                e.stopPropagation();
                activeEdge = dir;
                lastX = e.screenX;
                lastY = e.screenY;
                document.body.style.userSelect = 'none';
            });
            container.appendChild(handle);
        });
        document.body.appendChild(container);

        window.addEventListener('mousemove', (e) => {
            if (!activeEdge) return;
            if (e.buttons === 0) {
                activeEdge = null;
                document.body.style.userSelect = '';
                return;
            }
            const dx = e.screenX - lastX;
            const dy = e.screenY - lastY;
            if (dx === 0 && dy === 0) return;
            lastX = e.screenX;
            lastY = e.screenY;
            try {
                console.log(`__PYQT_RESIZE__:${activeEdge}:${dx}:${dy}`);
            } catch (_) {}
        }, { passive: true });

        const stopResize = () => {
            if (activeEdge) {
                activeEdge = null;
                document.body.style.userSelect = '';
            }
        };
        window.addEventListener('mouseup', stopResize);
        window.addEventListener('blur', stopResize);
    },

    initResponsiveResizeWatcher() {
        let wasMobile = window.innerWidth < 768;
        window.addEventListener('resize', () => {
            const isMobile = window.innerWidth < 768;
            if (isMobile === wasMobile) return;
            wasMobile = isMobile;

            const listPanel = document.getElementById('email-list-container');
            const detailPanel = document.getElementById('email-detail-container');
            const sidebar = document.getElementById('sidebar-container');
            const backdrop = document.getElementById('sidebar-mobile-backdrop');

            if (!isMobile) {
                // Al pasar de vista móvil (< 768px) a escritorio (>= 768px), mostrar ambos paneles
                if (listPanel) listPanel.classList.remove('hidden');
                if (detailPanel) {
                    detailPanel.classList.remove('hidden');
                    detailPanel.classList.add('flex');
                }
                if (sidebar) sidebar.classList.remove('mobile-open');
                if (backdrop) backdrop.classList.add('hidden');
            } else {
                // Al reducir la ventana a modo móvil (< 768px)
                const hasSelectedEmail = !!(window.EmailManager && EmailManager.selectedEmailId);
                if (hasSelectedEmail) {
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
    },

    isActionPending: false,

    async minimizeWindow() {
        if (this.isActionPending) return;
        this.isActionPending = true;
        setTimeout(() => { this.isActionPending = false; }, 300);

        const isPyQt = (navigator.userAgent && navigator.userAgent.includes('QtWebEngine')) || (typeof qt !== 'undefined');
        if (isPyQt) {
            try {
                console.log('__PYQT_ACTION__:minimize');
                return;
            } catch (_) {}
        }

        if (window.pyqtBridge && window.pyqtBridge.minimize) {
            try { window.pyqtBridge.minimize(); return; } catch (_) {}
        }
        try {
            await fetch('/api/desktop/window/minimize', { method: 'POST' });
        } catch (e) {
            console.warn('Error minimizando ventana:', e);
        }
    },

    async toggleMaximizeWindow() {
        if (this.isActionPending) return;
        this.isActionPending = true;
        setTimeout(() => { this.isActionPending = false; }, 350);

        // Determinamos la acción exacta según el estado actual para evitar ejecuciones dobles
        const targetAction = this.isMaximized ? 'restore' : 'maximize';
        const nextState = !this.isMaximized;

        this.isMaximized = nextState;
        this.updateMaximizeIcons();

        const isPyQt = (navigator.userAgent && navigator.userAgent.includes('QtWebEngine')) || (typeof qt !== 'undefined');
        if (isPyQt) {
            try {
                console.log(`__PYQT_ACTION__:${targetAction}`);
                return; // Una sola acción directa en Qt, no ejecutar fetch
            } catch (_) {}
        }

        if (window.pyqtBridge) {
            if (targetAction === 'maximize' && window.pyqtBridge.maximize) {
                try { window.pyqtBridge.maximize(); return; } catch (_) {}
            } else if (targetAction === 'restore' && window.pyqtBridge.restore) {
                try { window.pyqtBridge.restore(); return; } catch (_) {}
            } else if (window.pyqtBridge.toggle_maximize) {
                try { window.pyqtBridge.toggle_maximize(); return; } catch (_) {}
            }
        }

        // Fallback vía endpoint HTTP (solo si no es PyQt nativo)
        try {
            const res = await fetch(`/api/desktop/window/${targetAction}`, { method: 'POST' });
            const data = await res.json();
            if (data.success && typeof data.result === 'boolean') {
                this.isMaximized = data.result;
                this.updateMaximizeIcons();
            }
        } catch (e) {
            console.warn('Error alternando tamaño de ventana:', e);
        }
    },

    async closeWindow() {
        if (this.isActionPending) return;
        this.isActionPending = true;
        setTimeout(() => { this.isActionPending = false; }, 300);

        const isPyQt = (navigator.userAgent && navigator.userAgent.includes('QtWebEngine')) || (typeof qt !== 'undefined');
        if (isPyQt) {
            try {
                console.log('__PYQT_ACTION__:close');
                return;
            } catch (_) {}
        }

        if (window.pyqtBridge && window.pyqtBridge.close) {
            try { window.pyqtBridge.close(); return; } catch (_) {}
        }
        try {
            await fetch('/api/desktop/window/close', { method: 'POST' });
        } catch (e) {
            console.warn('Error cerrando ventana:', e);
        }
    },

    openExternalUrl(url) {
        if (!url) return;
        const isPyQt = (navigator.userAgent && navigator.userAgent.includes('QtWebEngine')) || (typeof qt !== 'undefined');
        if (isPyQt) {
            try {
                console.log(`__PYQT_ACTION__:open_url:${url}`);
                return;
            } catch (_) {}
        }

        if (window.pyqtBridge && window.pyqtBridge.open_url) {
            try { window.pyqtBridge.open_url(url); return; } catch (_) {}
        }

        // Fallback vía backend para abrir en el navegador predeterminado del sistema operativo
        fetch('/api/desktop/open-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        }).catch(() => {
            window.open(url, '_blank', 'noopener,noreferrer');
        });
    },

    showNotification(title, message) {
        const isPyQt = (navigator.userAgent && navigator.userAgent.includes('QtWebEngine')) || (typeof qt !== 'undefined');
        if (window.pyqtBridge && window.pyqtBridge.show_notification) {
            try {
                window.pyqtBridge.show_notification(title, message);
                return true;
            } catch (_) {}
        }
        if (isPyQt) {
            try {
                console.log(`__PYQT_ACTION__:show_notification:${title}:${message}`);
                return true;
            } catch (_) {}
        }
        return false;
    },

    onNativeWindowStateChanged(isMaximized) {
        this.isMaximized = !!isMaximized;
        this.updateMaximizeIcons();
    },

    async checkWindowState() {
        if (window.pyqtBridge && window.pyqtBridge.is_maximized) {
            this.isMaximized = !!window.pyqtBridge.is_maximized();
            this.updateMaximizeIcons();
            return;
        }
        try {
            const res = await fetch('/api/desktop/window/state');
            if (res.ok) {
                const data = await res.json();
                this.isMaximized = !!data.is_maximized;
                this.updateMaximizeIcons();
            }
        } catch (e) {
            // Ignorar si el backend aún no responde
        }
    },

    updateMaximizeIcons() {
        const iconMax = document.getElementById('icon-desktop-maximize');
        const iconRestore = document.getElementById('icon-desktop-restore');
        if (iconMax && iconRestore) {
            if (this.isMaximized) {
                iconMax.classList.add('hidden');
                iconRestore.classList.remove('hidden');
            } else {
                iconMax.classList.remove('hidden');
                iconRestore.classList.add('hidden');
            }
        }
    }
};

window.DesktopBridge = DesktopBridge;

const DesktopApp = {
    installed: false,
    systemTray: true,
    autostart: false,

    async init() {
        await this.loadSettings();
    },

    async loadSettings() {
        try {
            const res = await fetch('/api/desktop/settings');
            const data = await res.json();
            this.installed = !!data.installed;
            this.systemTray = !!data.system_tray;
            this.autostart = !!data.autostart;

            this.updateUI();
        } catch (e) {
            console.error('Error cargando ajustes de escritorio:', e);
        }
    },

    updateUI() {
        const pill = document.getElementById('desktop-installed-pill');
        if (pill) {
            if (this.installed) {
                pill.className = 'text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800/60';
                pill.textContent = 'Instalada';
            } else {
                pill.className = 'text-[10px] px-2 py-0.5 rounded-full font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700';
                pill.textContent = 'Disponible';
            }
        }

        // Switch Tray
        const traySwitch = document.getElementById('desktop-tray-switch');
        const trayThumb = document.getElementById('desktop-tray-thumb');
        if (traySwitch && trayThumb) {
            if (this.systemTray) {
                traySwitch.className = 'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-indigo-600 transition-colors duration-200 ease-in-out focus:outline-none shadow-2xs';
                trayThumb.className = 'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out translate-x-5';
            } else {
                traySwitch.className = 'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-slate-300 dark:bg-slate-700 transition-colors duration-200 ease-in-out focus:outline-none shadow-2xs';
                trayThumb.className = 'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out translate-x-0';
            }
        }

        // Switch Autostart
        const autoSwitch = document.getElementById('desktop-autostart-switch');
        const autoThumb = document.getElementById('desktop-autostart-thumb');
        if (autoSwitch && autoThumb) {
            if (this.autostart) {
                autoSwitch.className = 'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-indigo-600 transition-colors duration-200 ease-in-out focus:outline-none shadow-2xs';
                autoThumb.className = 'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out translate-x-5';
            } else {
                autoSwitch.className = 'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-slate-300 dark:bg-slate-700 transition-colors duration-200 ease-in-out focus:outline-none shadow-2xs';
                autoThumb.className = 'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out translate-x-0';
            }
        }
    },

    async toggleTraySwitch() {
        this.systemTray = !this.systemTray;
        this.updateUI();
        await this.saveSettings();
        if (window.UI) {
            UI.showStickyToast(
                'Bandeja del Sistema',
                this.systemTray ? 'System Tray activado para la aplicación' : 'System Tray desactivado',
                'success'
            );
        }
    },

    async toggleAutostartSwitch() {
        this.autostart = !this.autostart;
        this.updateUI();
        await this.saveSettings();
        if (window.UI) {
            UI.showStickyToast(
                'Inicio Automático',
                this.autostart ? 'Senda se iniciará al encender el equipo' : 'Inicio automático desactivado',
                'success'
            );
        }
    },

    async saveSettings() {
        try {
            await fetch('/api/desktop/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_tray: this.systemTray,
                    autostart: this.autostart
                })
            });
        } catch (e) {
            console.error('Error guardando configuración de escritorio:', e);
            if (window.UI) UI.showStickyToast('Error', 'No se pudo guardar la configuración', 'error');
        }
    },

    async reinstall() {
        if (window.UI) UI.showStickyToast('Sincronizando', 'Actualizando archivos y dependencias de la app instalada...', 'info', 3000);
        try {
            const res = await fetch('/api/desktop/reinstall', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                this.installed = true;
                this.updateUI();
                if (window.UI) UI.showStickyToast('App Sincronizada', 'Senda Desktop está actualizado y listo en tu sistema', 'success');
            } else {
                if (window.UI) UI.showStickyToast('Error', data.detail || 'No se pudo sincronizar', 'error');
            }
        } catch (e) {
            if (window.UI) UI.showStickyToast('Error', e.message, 'error');
        }
    }
};

window.DesktopApp = DesktopApp;

document.addEventListener('DOMContentLoaded', () => {
    DesktopBridge.init();
    DesktopApp.init();
});
