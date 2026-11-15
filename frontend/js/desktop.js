// Módulo de Gestión de Aplicación de Escritorio (Desktop Linux) - MerkeMail

const DesktopBridge = {
    isDesktop: false,
    isMaximized: false,

    init() {
        this.detectEnvironment();
        this.initNativeBridge();
        this.initWindowDragging();
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
        const isPort6524 = window.location.port === '6524';
        const hasDesktopParam = params.has('desktop') || params.get('app') === 'desktop';
        const isPyQt = !!window.pyqtBridge || (navigator.userAgent && navigator.userAgent.includes('QtWebEngine'));
        // Modo instalado de escritorio (PyQt6 / Puerto 6524 / ?desktop=1)
        const isInstalledDesktop = isPort6524 || hasDesktopParam || isPyQt;

        this.isDesktop = isInstalledDesktop;
        this.applyEnvironmentUI();
    },

    applyEnvironmentUI() {
        const controls = document.getElementById('desktop-window-controls');
        const btnInstallPwa = document.getElementById('btn-install-pwa');
        const pwaCardDrawer = document.getElementById('pwa-installation-card');
        const btnPrint = document.getElementById('btn-print-email');

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
            this.checkWindowState();
        } else {
            // En navegador web (browser normal y modo PWA):
            // Ocultar controles de ventana ya que el navegador tiene los suyos
            if (controls) {
                controls.classList.add('hidden');
                controls.classList.remove('flex');
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
        if (!header) return;

        // Clic sostenido en cualquier espacio vacío del header para arrastrar la ventana
        header.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // Solo botón principal (izquierdo)

            // Si el clic es sobre un elemento interactivo (botones, inputs, avatar, controles), no arrastrar
            const interactive = e.target.closest('button, input, a, select, textarea, [onclick], #user-header-avatar, #desktop-window-controls, .cursor-pointer');
            if (interactive) return;

            // Iniciar arrastre nativo de ventana del sistema (vía consola instantánea de PyQt6 + bridge + fetch)
            try {
                console.log('__PYQT_ACTION__:start_drag');
            } catch (_) {}

            if (window.pyqtBridge && window.pyqtBridge.start_drag) {
                try { window.pyqtBridge.start_drag(); } catch (_) {}
            }
            fetch('/api/desktop/window/start_drag', { method: 'POST' }).catch(() => {});
        });

        // Doble clic en espacio libre del header para alternar maximizado
        header.addEventListener('dblclick', (e) => {
            const interactive = e.target.closest('button, input, a, select, textarea, [onclick], #user-header-avatar, #desktop-window-controls, .cursor-pointer');
            if (interactive) return;
            this.toggleMaximizeWindow();
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
                this.autostart ? 'MerkeMail se iniciará al encender el equipo' : 'Inicio automático desactivado',
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
                if (window.UI) UI.showStickyToast('App Sincronizada', 'MerkeMail Desktop está actualizado y listo en tu sistema', 'success');
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
