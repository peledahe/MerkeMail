// Módulo de Gestión de Aplicación de Escritorio (Desktop Linux) - MerkeMail

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
    DesktopApp.init();
});
