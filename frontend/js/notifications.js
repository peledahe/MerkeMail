// Gestor Central de Notificaciones y Recordatorios - Senda

const NotificationManager = {
    notifyNewEmails: true,
    notifyCalendarEvents: true,
    notifySoundEnabled: true,
    notifyFilter: 'all', // 'all' | 'primary'

    isInitialized: false,
    initialEmailsLoaded: false,
    knownEmailIds: new Set(),
    notifiedEvents: new Set(),
    calendarCheckIntervalId: null,
    audioCtx: null,

    async init() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        await this.loadSettings();
        this.updateSettingsUI();
        this.startCalendarWatcher();

        // Solicitar permisos de notificación web de forma respetuosa si están en 'default'
        if ('Notification' in window && Notification.permission === 'default') {
            // No forzar de inmediato, se pedirá al interactuar o con toggle
        }
    },

    async loadSettings() {
        // 1. Cargar primero de localStorage para respuesta visual instantánea
        try {
            const localNew = localStorage.getItem('merkemail_notify_new_emails');
            if (localNew !== null) this.notifyNewEmails = localNew === 'true';

            const localCal = localStorage.getItem('merkemail_notify_calendar_events');
            if (localCal !== null) this.notifyCalendarEvents = localCal === 'true';

            const localSnd = localStorage.getItem('merkemail_notify_sound_enabled');
            if (localSnd !== null) this.notifySoundEnabled = localSnd === 'true';

            const localFilter = localStorage.getItem('merkemail_notify_filter');
            if (localFilter) this.notifyFilter = localFilter;
        } catch (_) {}

        // 2. Sincronizar con backend SQLite
        try {
            const res = await fetch('/api/settings');
            if (res.ok) {
                const data = await res.json();
                if (data.notify_new_emails !== undefined) {
                    this.notifyNewEmails = Boolean(data.notify_new_emails);
                    localStorage.setItem('merkemail_notify_new_emails', String(this.notifyNewEmails));
                }
                if (data.notify_calendar_events !== undefined) {
                    this.notifyCalendarEvents = Boolean(data.notify_calendar_events);
                    localStorage.setItem('merkemail_notify_calendar_events', String(this.notifyCalendarEvents));
                }
                if (data.notify_sound_enabled !== undefined) {
                    this.notifySoundEnabled = Boolean(data.notify_sound_enabled);
                    localStorage.setItem('merkemail_notify_sound_enabled', String(this.notifySoundEnabled));
                }
                if (data.notify_filter) {
                    this.notifyFilter = data.notify_filter;
                    localStorage.setItem('merkemail_notify_filter', this.notifyFilter);
                }
                this.updateSettingsUI();
            }
        } catch (e) {
            console.warn('[NotificationManager] Aviso cargando ajustes:', e);
        }
    },

    async saveSetting(key, val) {
        localStorage.setItem(`merkemail_${key}`, String(val));
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [key]: val })
            });
        } catch (e) {
            console.warn(`[NotificationManager] Error persistiendo ${key}:`, e);
        }
    },

    updateSettingsUI() {
        // Switch 1: Notificaciones de nuevos correos
        const switchEmails = document.getElementById('settings-notify-emails-switch');
        const thumbEmails = document.getElementById('settings-notify-emails-thumb');
        if (switchEmails && thumbEmails) {
            if (this.notifyNewEmails) {
                switchEmails.classList.add('bg-indigo-600');
                switchEmails.classList.remove('bg-slate-300', 'dark:bg-slate-700');
                thumbEmails.classList.add('translate-x-5');
                thumbEmails.classList.remove('translate-x-0');
            } else {
                switchEmails.classList.remove('bg-indigo-600');
                switchEmails.classList.add('bg-slate-300', 'dark:bg-slate-700');
                thumbEmails.classList.remove('translate-x-5');
                thumbEmails.classList.add('translate-x-0');
            }
        }

        // Switch 2: Notificaciones de citas y calendario
        const switchCal = document.getElementById('settings-notify-calendar-switch');
        const thumbCal = document.getElementById('settings-notify-calendar-thumb');
        if (switchCal && thumbCal) {
            if (this.notifyCalendarEvents) {
                switchCal.classList.add('bg-indigo-600');
                switchCal.classList.remove('bg-slate-300', 'dark:bg-slate-700');
                thumbCal.classList.add('translate-x-5');
                thumbCal.classList.remove('translate-x-0');
            } else {
                switchCal.classList.remove('bg-indigo-600');
                switchCal.classList.add('bg-slate-300', 'dark:bg-slate-700');
                thumbCal.classList.remove('translate-x-5');
                thumbCal.classList.add('translate-x-0');
            }
        }

        // Switch 3: Sonido de notificación
        const switchSnd = document.getElementById('settings-notify-sound-switch');
        const thumbSnd = document.getElementById('settings-notify-sound-thumb');
        if (switchSnd && thumbSnd) {
            if (this.notifySoundEnabled) {
                switchSnd.classList.add('bg-indigo-600');
                switchSnd.classList.remove('bg-slate-300', 'dark:bg-slate-700');
                thumbSnd.classList.add('translate-x-5');
                thumbSnd.classList.remove('translate-x-0');
            } else {
                switchSnd.classList.remove('bg-indigo-600');
                switchSnd.classList.add('bg-slate-300', 'dark:bg-slate-700');
                thumbSnd.classList.remove('translate-x-5');
                thumbSnd.classList.add('translate-x-0');
            }
        }

        // Selector: Filtro de correos
        const selectFilter = document.getElementById('settings-notify-filter-select');
        if (selectFilter) {
            selectFilter.value = this.notifyFilter;
        }
    },

    async requestWebPermission() {
        if (!('Notification' in window)) return false;
        if (Notification.permission === 'granted') return true;
        if (Notification.permission !== 'denied') {
            try {
                const permission = await Notification.requestPermission();
                return permission === 'granted';
            } catch (_) {
                return false;
            }
        }
        return false;
    },

    playSoftChime() {
        if (!this.notifySoundEnabled) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;

            if (!this.audioCtx) {
                this.audioCtx = new AudioContextClass();
            }
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }

            const now = this.audioCtx.currentTime;
            
            // Nota 1: C5 (523.25 Hz)
            const osc1 = this.audioCtx.createOscillator();
            const gain1 = this.audioCtx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(523.25, now);
            gain1.gain.setValueAtTime(0, now);
            gain1.gain.linearRampToValueAtTime(0.12, now + 0.03);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc1.connect(gain1);
            gain1.connect(this.audioCtx.destination);
            osc1.start(now);
            osc1.stop(now + 0.36);

            // Nota 2: E5 (659.25 Hz) armónico suave
            const osc2 = this.audioCtx.createOscillator();
            const gain2 = this.audioCtx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(659.25, now + 0.1);
            gain2.gain.setValueAtTime(0, now + 0.1);
            gain2.gain.linearRampToValueAtTime(0.14, now + 0.14);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
            osc2.connect(gain2);
            gain2.connect(this.audioCtx.destination);
            osc2.start(now + 0.1);
            osc2.stop(now + 0.56);
        } catch (e) {
            console.warn('[NotificationManager] Sonido omitido:', e);
        }
    },

    async notify(title, message, options = {}) {
        // 1. Reproducir sonido si está activado
        this.playSoftChime();

        // 2. Intentar notificación nativa de escritorio (PyQt6 / System Tray)
        let nativeDispatched = false;
        if (window.DesktopBridge && typeof window.DesktopBridge.showNotification === 'function') {
            nativeDispatched = window.DesktopBridge.showNotification(title, message);
        }

        // 3. Si no es escritorio nativo o no se despachó, usar Web Notification API si tiene permisos
        if (!nativeDispatched && 'Notification' in window && Notification.permission === 'granted') {
            try {
                const notif = new Notification(title, {
                    body: message,
                    icon: '/img/merke.svg',
                    badge: '/img/merke.svg',
                    tag: options.tag || 'merkemail-alert'
                });
                notif.onclick = () => {
                    window.focus();
                    if (options.onClick) options.onClick();
                };
            } catch (_) {}
        }

        // 4. Mostrar sticky toast en la interfaz para feedback visual consistente
        if (window.UI && typeof UI.showStickyToast === 'function') {
            const toastType = options.type || 'info';
            UI.showStickyToast(title, message, toastType);
        }
    },

    // --- MANEJO DE CORREOS NUEVOS ---
    checkNewEmails(emails, folder) {
        if (!Array.isArray(emails) || emails.length === 0) return;

        // Si es la primera carga tras abrir la app, memorizamos los IDs para no alertar del historial
        if (!this.initialEmailsLoaded) {
            emails.forEach(e => {
                if (e.id) this.knownEmailIds.add(e.id);
            });
            this.initialEmailsLoaded = true;
            return;
        }

        // Si las notificaciones de correo están desactivadas, solo registramos los IDs
        if (!this.notifyNewEmails) {
            emails.forEach(e => {
                if (e.id) this.knownEmailIds.add(e.id);
            });
            return;
        }

        // Detectar correos nuevos que no estaban en knownEmailIds
        const newUnreadEmails = emails.filter(e => {
            const isNew = e.id && !this.knownEmailIds.has(e.id);
            if (e.id) this.knownEmailIds.add(e.id);
            // Solo considerar no leídos y fuera de Papelera / Spam
            const isUnread = !e.is_read;
            const notTrashOrSpam = e.folder !== 'TRASH' && e.folder !== 'SPAM';
            return isNew && isUnread && notTrashOrSpam;
        });

        if (newUnreadEmails.length === 0) return;

        // Filtrar según preferencia (si es 'primary', solo alertar de INBOX principal)
        let filteredEmails = newUnreadEmails;
        if (this.notifyFilter === 'primary') {
            filteredEmails = newUnreadEmails.filter(e => {
                const f = (e.folder || '').toUpperCase();
                return f === 'INBOX' || f === 'RECIBIDOS' || f === '';
            });
        }

        if (filteredEmails.length === 0) return;

        // Emitir notificación
        if (filteredEmails.length === 1) {
            const mail = filteredEmails[0];
            const sender = mail.sender || 'Nuevo remitente';
            const subject = mail.subject || '(Sin asunto)';
            this.notify(`Nuevo Correo de ${sender}`, subject, {
                tag: `email-${mail.id}`,
                type: 'info',
                onClick: () => {
                    if (window.EmailManager && typeof EmailManager.selectEmail === 'function') {
                        EmailManager.selectEmail(mail.id);
                    }
                }
            });
        } else {
            const count = filteredEmails.length;
            this.notify(`Senda: ${count} correos nuevos`, `Tienes ${count} nuevos correos en tu bandeja de entrada`, {
                tag: 'bulk-new-emails',
                type: 'info',
                onClick: () => {
                    if (window.EmailManager && typeof EmailManager.loadEmails === 'function') {
                        EmailManager.loadEmails();
                    }
                }
            });
        }
    },

    // --- MANEJO DE RECORDATORIOS DE CALENDARIO ---
    startCalendarWatcher() {
        if (this.calendarCheckIntervalId) {
            clearInterval(this.calendarCheckIntervalId);
        }
        // Verificar eventos próximos cada 30 segundos
        this.calendarCheckIntervalId = setInterval(() => {
            this.checkUpcomingEvents();
        }, 30000);

        // Chequeo inicial suave tras 3 segundos
        setTimeout(() => {
            this.checkUpcomingEvents();
        }, 3000);
    },

    checkUpcomingEvents() {
        if (!this.notifyCalendarEvents) return;
        if (!window.CalendarManager || !Array.isArray(CalendarManager.events)) return;

        const now = new Date();
        const nowMs = now.getTime();

        CalendarManager.events.forEach(evt => {
            if (!evt.id || !evt.start_time) return;

            // Clave única para evitar duplicados en la sesión
            const eventKey = `${evt.id}_${evt.start_time}`;
            if (this.notifiedEvents.has(eventKey)) return;

            let startTime;
            try {
                startTime = new Date(evt.start_time);
            } catch (_) {
                return;
            }

            if (isNaN(startTime.getTime())) return;

            const diffMinutes = Math.round((startTime.getTime() - nowMs) / 60000);

            // Antelación configurable: por defecto avisar si faltan entre 0 y 15 minutos
            const reminderAdvance = evt.reminder_minutes !== undefined && evt.reminder_minutes !== null ? evt.reminder_minutes : 15;

            if (diffMinutes >= 0 && diffMinutes <= reminderAdvance) {
                this.notifiedEvents.add(eventKey);

                const title = evt.title || 'Evento de Calendario';
                const timeStr = startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const timeLabel = diffMinutes <= 1 ? '¡Comienza ahora!' : `en ${diffMinutes} minutos (${timeStr})`;

                this.notify(`Recordatorio: ${title}`, `Cita programada ${timeLabel}`, {
                    tag: `event-${evt.id}`,
                    type: 'info',
                    onClick: () => {
                        const btnNavCal = document.getElementById('nav-item-calendar');
                        if (btnNavCal) btnNavCal.click();
                    }
                });
            }
        });
    },

    // --- ACCIONES DE USUARIO EN AJUSTES ---
    async toggleNewEmails() {
        this.notifyNewEmails = !this.notifyNewEmails;
        if (this.notifyNewEmails) {
            await this.requestWebPermission();
        }
        this.updateSettingsUI();
        await this.saveSetting('notify_new_emails', this.notifyNewEmails);

        if (window.UI) {
            UI.showStickyToast(
                'Notificaciones de Correo',
                this.notifyNewEmails ? 'Alertas de nuevos correos activadas' : 'Alertas de nuevos correos desactivadas',
                this.notifyNewEmails ? 'success' : 'info'
            );
        }
    },

    async toggleCalendarEvents() {
        this.notifyCalendarEvents = !this.notifyCalendarEvents;
        if (this.notifyCalendarEvents) {
            await this.requestWebPermission();
        }
        this.updateSettingsUI();
        await this.saveSetting('notify_calendar_events', this.notifyCalendarEvents);

        if (window.UI) {
            UI.showStickyToast(
                'Recordatorios de Calendario',
                this.notifyCalendarEvents ? 'Alertas de citas y eventos activadas' : 'Alertas de citas y eventos desactivadas',
                this.notifyCalendarEvents ? 'success' : 'info'
            );
        }
    },

    async toggleSound() {
        this.notifySoundEnabled = !this.notifySoundEnabled;
        this.updateSettingsUI();
        await this.saveSetting('notify_sound_enabled', this.notifySoundEnabled);

        if (this.notifySoundEnabled) {
            this.playSoftChime();
        }

        if (window.UI) {
            UI.showStickyToast(
                'Sonido de Notificaciones',
                this.notifySoundEnabled ? 'Tono suave activado' : 'Notificaciones silenciadas',
                this.notifySoundEnabled ? 'success' : 'info'
            );
        }
    },

    async setFilter(val) {
        this.notifyFilter = val === 'primary' ? 'primary' : 'all';
        this.updateSettingsUI();
        await this.saveSetting('notify_filter', this.notifyFilter);

        if (window.UI) {
            const desc = this.notifyFilter === 'primary' ? 'Solo bandeja principal y prioritarios' : 'Todos los correos entrantes';
            UI.showStickyToast('Filtro de Notificaciones', `Criterio actualizado: ${desc}`, 'info');
        }
    },

    testSound() {
        this.playSoftChime();
        if (window.UI) {
            UI.showStickyToast('Prueba de Sonido', 'Reproduciendo tono suave de notificación', 'info');
        }
    }
};

window.NotificationManager = NotificationManager;
