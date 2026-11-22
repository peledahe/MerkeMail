// Módulo de Calendario Unificado (Google + Proton) - MerkeMail
// Soporte para Vistas: Mes, Semana y Día (horas), Drawer lateral de detalle con links externos,
// Gestión de Calendario Predeterminado, Sección de Tareas sin Fecha (Tasks),
// Colores de Calendario y Cuenta en Eventos/Tareas, y Control de Desbordamiento con Contador (+N más).

const CalendarManager = {
    currentDate: new Date(),
    currentView: localStorage.getItem('merke_calendar_view') || 'month',
    events: [],
    tasks: [],
    calendars: [],
    defaultCalendarId: 1,
    googleColors: [
        { id: '', name: 'Predeterminado', hex: '' },
        { id: '#039be5', name: 'Pavo real', hex: '#039be5' },
        { id: '#7986cb', name: 'Lavanda', hex: '#7986cb' },
        { id: '#8e24aa', name: 'Uva', hex: '#8e24aa' },
        { id: '#e67c73', name: 'Flamenco', hex: '#e67c73' },
        { id: '#d50000', name: 'Tomate', hex: '#d50000' },
        { id: '#f4511e', name: 'Mandarina', hex: '#f4511e' },
        { id: '#f6bf26', name: 'Plátano', hex: '#f6bf26' },
        { id: '#33b679', name: 'Salvia', hex: '#33b679' },
        { id: '#0b8043', name: 'Albahaca', hex: '#0b8043' },
        { id: '#3f51b5', name: 'Arándano', hex: '#3f51b5' },
        { id: '#616161', name: 'Grafito', hex: '#616161' }
    ],
    selectedColor: '',
    attendeesList: [],
    syncIntervalId: null,

    async init() {
        await this.loadCalendars();
        await this.loadDefaultCalendarConfig();
        await this.loadEvents();
        await this.loadTasks();
        this.renderColorPalette();
        this.setView(this.currentView, false);

        // Sincronización periódica en segundo plano (cada 5 minutos = 300.000 ms), rápida e imperceptible sin interrumpir la app
        if (this.syncIntervalId) clearInterval(this.syncIntervalId);
        this.syncIntervalId = setInterval(() => {
            this.syncPeriodically();
        }, 300000);
    },

    async syncPeriodically() {
        // Si el usuario tiene abierta la modal de crear/editar evento o tarea, no refrescar para no interrumpir su edición
        const eventModal = document.getElementById('new-event-modal');
        if (eventModal && !eventModal.classList.contains('hidden')) return;

        try {
            const res = await fetch('/api/calendars/sync', { method: 'POST' }).then(r => r.json()).catch(() => null);
            if (res && res.api_disabled) {
                this.showApiDisabledWarning(res.enable_url);
            } else if (res && res.success) {
                this.hideApiDisabledWarning();
            }

            await this.loadEvents();
            await this.loadTasks();
            
            const calendarView = document.getElementById('view-calendar');
            if (calendarView && !calendarView.classList.contains('hidden')) {
                this.renderCurrentView();
                this.renderUpcomingList();
                this.renderTasks();
            }
        } catch (e) {
            // Silencioso para no interrumpir al usuario
        }
    },

    showApiDisabledWarning(enableUrl) {
        const warningEl = document.getElementById('calendar-api-warning');
        const linkEl = document.getElementById('calendar-api-enable-link');
        if (warningEl) {
            warningEl.classList.remove('hidden');
            if (linkEl && enableUrl) {
                linkEl.href = enableUrl;
            }
        }
    },

    hideApiDisabledWarning() {
        const warningEl = document.getElementById('calendar-api-warning');
        if (warningEl) {
            warningEl.classList.add('hidden');
        }
    },

    isSyncing: false,

    async syncNow(btnEl) {
        if (this.isSyncing) return;
        this.isSyncing = true;

        const syncIcons = document.querySelectorAll('#btn-sync-calendars svg, #btn-sync-calendars-drawer svg, #btn-global-sync svg, #btn-sync-other-apps svg');
        syncIcons.forEach(ic => ic.classList.add('animate-spin'));
        if (btnEl) btnEl.disabled = true;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000);

            const res = await fetch('/api/calendars/sync', { 
                method: 'POST',
                signal: controller.signal
            }).then(r => r.json());

            clearTimeout(timeoutId);

            // Siempre recargar estado local de calendarios y tareas
            await this.loadCalendars();
            await this.loadEvents();
            await this.loadTasks();
            this.updateActiveCountBadge();
            this.renderCalendar();
            this.renderCurrentView();
            this.renderUpcomingList();
            this.renderTasks();

            const drawerCal = document.getElementById('drawer-calendars');
            if (drawerCal && !drawerCal.classList.contains('hidden')) {
                this.renderCalendarsDrawer();
            }

            if (res.api_disabled) {
                this.showApiDisabledWarning(res.enable_url);
                if (window.UI && typeof UI.showStickyToast === 'function') {
                    UI.showStickyToast(
                        'Google Calendar API Deshabilitada',
                        'Debes habilitar la Google Calendar API en Google Cloud Console para sincronizar tus actividades.',
                        'warning',
                        5000
                    );
                }
            } else if (res.success) {
                this.hideApiDisabledWarning();
                if (window.UI && typeof UI.showStickyToast === 'function') {
                    UI.showStickyToast('Calendario Sincronizado', 'Todos tus calendarios y eventos han sido actualizados.', 'success', 3000);
                }
            } else {
                if (window.UI && typeof UI.showStickyToast === 'function') {
                    UI.showStickyToast('Aviso de Sincronización', res.error || res.message || 'No se pudieron sincronizar los calendarios.', 'warning', 3000);
                }
            }
        } catch (e) {
            console.warn('Aviso durante sincronización de calendario:', e);
            if (window.UI && typeof UI.showStickyToast === 'function') {
                UI.showStickyToast('Sincronización en Proceso', 'La sincronización continúa ejecutándose en segundo plano.', 'info', 3000);
            }
            try {
                await this.loadCalendars();
                await this.loadEvents();
                await this.loadTasks();
                this.updateActiveCountBadge();
                this.renderCalendar();
                this.renderCurrentView();
                this.renderUpcomingList();
                this.renderTasks();
            } catch (err) {}
        } finally {
            this.isSyncing = false;
            if (btnEl) btnEl.disabled = false;
            setTimeout(() => {
                syncIcons.forEach(ic => ic.classList.remove('animate-spin'));
            }, 600);
        }
    },

    async loadCalendars() {
        try {
            const res = await fetch('/api/calendars');
            const allCals = await res.json();
            // Filtrar estrictamente solo calendarios de Google Calendar
            this.calendars = (allCals || []).filter(c => c.provider === 'google');
            const selectEl = document.getElementById('event-calendar-select');

            if (!this.activeCalendarIds) {
                this.activeCalendarIds = new Set();
                try {
                    const saved = localStorage.getItem('merke_active_calendar_ids');
                    if (saved) {
                        const parsed = JSON.parse(saved);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            parsed.forEach(id => this.activeCalendarIds.add(parseInt(id, 10)));
                        }
                    }
                } catch (e) {}

                // Si no hay preferencias guardadas, activar todos por defecto
                if (this.activeCalendarIds.size === 0) {
                    this.calendars.forEach(c => this.activeCalendarIds.add(c.id));
                }
            }

            this.updateActiveCountBadge();
            this.renderCalendarsDrawer();

            if (selectEl) {
                selectEl.innerHTML = this.calendars.map(c => `
                    <option value="${c.id}">${c.name} (${c.account_email || c.account_name})</option>
                `).join('');
                if (this.defaultCalendarId) {
                    selectEl.value = this.defaultCalendarId;
                }
            }

            // Actualizar badge del calendario en el sidebar según proveedores reales
            this.updateSidebarCalendarBadge();

            // Actualizar la descripción de bienvenida del asistente Elio
            if (window.AntigravityCopilot && typeof AntigravityCopilot.updateConnectedServices === 'function') {
                AntigravityCopilot.updateConnectedServices();
            }
        } catch (e) {
            console.error("Error cargando calendarios:", e);
        }
    },

    updateActiveCountBadge() {
        const badge = document.getElementById('calendar-active-count-badge');
        if (!badge) return;
        const total = (this.calendars || []).length;
        const active = this.activeCalendarIds ? [...this.activeCalendarIds].filter(id => this.calendars.some(c => c.id === id)).length : total;
        badge.textContent = `${active}/${total}`;
        badge.title = `${active} de ${total} calendarios visibles`;
    },

    openCalendarsDrawer() {
        if (window.UI && typeof UI.openDrawer === 'function') {
            this.renderCalendarsDrawer();
            UI.openDrawer('drawer-calendars');
        }
    },

    renderCalendarsDrawer() {
        const container = document.getElementById('drawer-calendars-content');
        if (!container) return;

        if (!this.calendars || this.calendars.length === 0) {
            container.innerHTML = `
                <div class="p-8 text-center text-slate-400">
                    <svg class="w-12 h-12 mx-auto mb-3 opacity-40 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    <p class="text-xs font-semibold text-slate-700 dark:text-slate-300">No hay calendarios de Google vinculados</p>
                    <p class="text-[11px] text-slate-500 mt-1">Conecta tu cuenta de Google en la sección de cuentas para sincronizar tus calendarios.</p>
                </div>
            `;
            return;
        }

        // Agrupar calendarios por cuenta de Google
        const accountsMap = {};
        for (const c of this.calendars) {
            const accKey = c.account_email || c.account_name || 'Cuenta Google';
            if (!accountsMap[accKey]) {
                accountsMap[accKey] = {
                    email: c.account_email || '',
                    name: c.account_name || accKey,
                    color: c.account_color || '#3b82f6',
                    accountId: c.account_id,
                    calendars: []
                };
            }
            accountsMap[accKey].calendars.push(c);
        }

        let html = '';
        for (const [accKey, acc] of Object.entries(accountsMap)) {
            const activeInAcc = acc.calendars.filter(c => this.activeCalendarIds ? this.activeCalendarIds.has(c.id) : true).length;
            const totalInAcc = acc.calendars.length;

            html += `
                <div class="bg-slate-50/70 dark:bg-slate-850/70 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3.5 space-y-3 shadow-2xs">
                    <!-- Cabecera de la cuenta / conexión -->
                    <div class="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="w-3 h-3 rounded-full shrink-0 shadow-xs" style="background-color: ${acc.color}"></span>
                            <div class="truncate">
                                <h3 class="text-xs font-bold text-slate-900 dark:text-white truncate">${acc.email || acc.name}</h3>
                                <p class="text-[10px] text-slate-500">${activeInAcc} de ${totalInAcc} activos</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0 text-[11px]">
                            <button type="button" onclick="CalendarManager.toggleAccountCalendars(${acc.accountId}, true)" class="px-2 py-0.5 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 font-semibold cursor-pointer">
                                Todos
                            </button>
                            <span class="text-slate-300 dark:text-slate-700">·</span>
                            <button type="button" onclick="CalendarManager.toggleAccountCalendars(${acc.accountId}, false)" class="px-2 py-0.5 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer">
                                Ninguno
                            </button>
                        </div>
                    </div>

                    <!-- Lista de calendarios de la cuenta -->
                    <div class="space-y-1.5">
            `;

            for (const cal of acc.calendars) {
                const color = cal.effective_color || cal.color || acc.color;
                const isChecked = this.activeCalendarIds ? this.activeCalendarIds.has(cal.id) : true;
                
                // Conteo de eventos y tareas en este calendario
                const evCount = (this.events || []).filter(e => e.calendar_id === cal.id).length;
                const taskCount = (this.tasks || []).filter(t => t.calendar_id === cal.id).length;
                const totalItems = evCount + taskCount;

                html += `
                    <label class="flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer select-none ${isChecked ? 'bg-white dark:bg-slate-800 shadow-2xs border border-slate-200/80 dark:border-slate-750' : 'bg-transparent hover:bg-white/60 dark:hover:bg-slate-800/50 opacity-60 hover:opacity-90'}">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <input type="checkbox" ${isChecked ? 'checked' : ''} class="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" onchange="CalendarManager.toggleCalendar(${cal.id}, this.checked)">
                            <span class="w-3 h-3 rounded-full shrink-0 shadow-xs" style="background-color: ${color}"></span>
                            <span class="text-xs font-medium text-slate-800 dark:text-slate-200 truncate" title="${cal.name}">${cal.name}</span>
                        </div>
                        ${totalItems > 0 ? `<span class="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-400 font-mono" title="${evCount} evento(s), ${taskCount} tarea(s)">${totalItems}</span>` : ''}
                    </label>
                `;
            }

            html += `
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
        this.updateActiveCountBadge();
    },

    toggleCalendar(calId, isChecked) {
        if (!this.activeCalendarIds) {
            this.activeCalendarIds = new Set();
        }
        if (isChecked) {
            this.activeCalendarIds.add(calId);
        } else {
            this.activeCalendarIds.delete(calId);
        }
        try {
            localStorage.setItem('merke_active_calendar_ids', JSON.stringify([...this.activeCalendarIds]));
        } catch (e) {}

        this.updateActiveCountBadge();
        this.renderCalendarsDrawer();
        this.renderCurrentView();
        this.renderUpcomingList();
        this.renderTasks();
    },

    toggleAccountCalendars(accountId, enableAll) {
        if (!this.activeCalendarIds) {
            this.activeCalendarIds = new Set();
        }
        const accCals = (this.calendars || []).filter(c => c.account_id === accountId);
        for (const c of accCals) {
            if (enableAll) {
                this.activeCalendarIds.add(c.id);
            } else {
                this.activeCalendarIds.delete(c.id);
            }
        }
        try {
            localStorage.setItem('merke_active_calendar_ids', JSON.stringify([...this.activeCalendarIds]));
        } catch (e) {}

        this.updateActiveCountBadge();
        this.renderCalendarsDrawer();
        this.renderCurrentView();
        this.renderUpcomingList();
        this.renderTasks();
    },

    toggleAllCalendars(enableAll) {
        if (!this.activeCalendarIds) {
            this.activeCalendarIds = new Set();
        }
        for (const c of (this.calendars || [])) {
            if (enableAll) {
                this.activeCalendarIds.add(c.id);
            } else {
                this.activeCalendarIds.delete(c.id);
            }
        }
        try {
            localStorage.setItem('merke_active_calendar_ids', JSON.stringify([...this.activeCalendarIds]));
        } catch (e) {}

        this.updateActiveCountBadge();
        this.renderCalendarsDrawer();
        this.renderCurrentView();
        this.renderUpcomingList();
        this.renderTasks();
    },

    getFilteredEvents() {
        if (!this.activeCalendarIds || this.activeCalendarIds.size === 0) {
            return [];
        }
        return (this.events || []).filter(e => {
            const cid = e.calendar_id ? parseInt(e.calendar_id, 10) : null;
            if (cid) return this.activeCalendarIds.has(cid);
            if (e.account_id) {
                const accCals = (this.calendars || []).filter(c => c.account_id === e.account_id);
                return accCals.some(c => this.activeCalendarIds.has(c.id));
            }
            return false;
        });
    },

    getFilteredTasks() {
        if (!this.activeCalendarIds || this.activeCalendarIds.size === 0) {
            return [];
        }
        return (this.tasks || []).filter(t => {
            const cid = t.calendar_id ? parseInt(t.calendar_id, 10) : null;
            if (cid) return this.activeCalendarIds.has(cid);
            if (t.account_id) {
                const accCals = (this.calendars || []).filter(c => c.account_id === t.account_id);
                return accCals.some(c => this.activeCalendarIds.has(c.id));
            }
            return false;
        });
    },

    async loadDefaultCalendarConfig() {
        try {
            const res = await fetch('/api/settings');
            if (res.ok) {
                const data = await res.json();
                if (data.default_calendar_id) {
                    this.defaultCalendarId = parseInt(data.default_calendar_id);
                }
            }
        } catch (e) {
            console.error("Error al cargar configuración de calendario por defecto:", e);
        }
    },

    updateSidebarCalendarBadge() {
        const badge = document.getElementById('calendar-sidebar-badge');
        if (badge) badge.remove();
    },

    async loadEvents() {
        try {
            const res = await fetch('/api/events');
            this.events = await res.json();
            this.renderCalendar();
            this.renderUpcomingList();
            if (window.NotificationManager && typeof NotificationManager.checkUpcomingEvents === 'function') {
                NotificationManager.checkUpcomingEvents();
            }
        } catch (e) {
            console.error("Error cargando eventos:", e);
        }
    },

    async loadTasks() {
        try {
            const res = await fetch('/api/tasks?include_completed=true');
            if (res.ok) {
                this.tasks = await res.json();
                this.renderTasks();
            }
        } catch (e) {
            console.error("Error cargando tareas:", e);
        }
    },

    getEventColor(ev) {
        if (!ev) return '#4f46e5';
        return ev.color || ev.effective_color || ev.calendar_color || ev.account_color || '#4f46e5';
    },

    setView(view, render = true) {
        if (!['month', 'week', 'day'].includes(view)) {
            view = 'month';
        }
        this.currentView = view;
        try {
            localStorage.setItem('merke_calendar_view', view);
        } catch (e) {}

        const btnMonth = document.getElementById('cal-view-btn-month');
        const btnWeek = document.getElementById('cal-view-btn-week');
        const btnDay = document.getElementById('cal-view-btn-day');

        const activeClass = 'px-2.5 py-1 rounded-lg transition-all cursor-pointer font-semibold bg-indigo-600 text-white shadow-2xs';
        const inactiveClass = 'px-2.5 py-1 rounded-lg transition-all cursor-pointer text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white';

        if (btnMonth) btnMonth.className = view === 'month' ? activeClass : inactiveClass;
        if (btnWeek) btnWeek.className = view === 'week' ? activeClass : inactiveClass;
        if (btnDay) btnDay.className = view === 'day' ? activeClass : inactiveClass;

        if (render) {
            this.renderCalendar();
        }
    },

    goToToday() {
        this.currentDate = new Date();
        this.renderCalendar();
    },

    navigate(direction) {
        if (this.currentView === 'month') {
            this.currentDate.setMonth(this.currentDate.getMonth() + direction);
        } else if (this.currentView === 'week') {
            this.currentDate.setDate(this.currentDate.getDate() + (direction * 7));
        } else if (this.currentView === 'day') {
            this.currentDate.setDate(this.currentDate.getDate() + direction);
        }
        this.renderCalendar();
    },

    prevMonth() {
        this.navigate(-1);
    },

    nextMonth() {
        this.navigate(1);
    },

    renderCalendar() {
        const container = document.getElementById('calendar-view-container');
        if (!container) return;

        if (this.currentView === 'month') {
            this.renderMonthView(container);
        } else if (this.currentView === 'week') {
            this.renderWeekView(container);
        } else if (this.currentView === 'day') {
            this.renderDayView(container);
        }
    },

    renderMonthView(container) {
        const monthYearTitle = document.getElementById('calendar-month-year');
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        if (monthYearTitle) {
            monthYearTitle.textContent = `${monthNames[month]} ${year}`;
        }

        const firstDay = new Date(year, month, 1).getDay(); // 0 es Domingo
        const startingDay = (firstDay === 0 ? 6 : firstDay - 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        let cellsHtml = '';

        // Días vacíos previos
        for (let i = 0; i < startingDay; i++) {
            cellsHtml += `<div class="min-h-[92px] bg-slate-50/40 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800/60 p-1.5 opacity-40"></div>`;
        }

        // Días del mes
        const today = new Date();
        for (let day = 1; day <= daysInMonth; day++) {
            const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const currentDayOfWeek = new Date(year, month, day).getDay();
            const isWeekend = (currentDayOfWeek === 0 || currentDayOfWeek === 6);
            
            // Eventos y tareas de este día con fecha
            const dayEvents = this.getFilteredEvents().filter(e => e.start_time && e.start_time.startsWith(dateStr));
            const maxVisible = 2;
            const visibleEvents = dayEvents.slice(0, maxVisible);
            const remainingCount = dayEvents.length - maxVisible;

            const bgClass = isToday 
                ? 'bg-indigo-50/30 dark:bg-indigo-950/25 border-indigo-200/80 dark:border-indigo-800/80 ring-1 ring-inset ring-indigo-500/20' 
                : (isWeekend 
                    ? 'bg-slate-50/60 dark:bg-slate-900/60 border-slate-100 dark:border-slate-800/70' 
                    : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800/70');

            cellsHtml += `
                <div class="min-h-[105px] sm:min-h-[115px] ${bgClass} border p-2 flex flex-col justify-between group hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors relative">
                    <div class="flex items-center justify-between mb-1.5">
                        <span class="${isToday ? 'w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs ring-2 ring-indigo-500/20' : 'text-xs font-semibold text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors'}">
                            ${day}
                        </span>
                        <button onclick="CalendarManager.openNewEventModal('${dateStr}')" class="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all flex items-center justify-center cursor-pointer" title="Añadir evento o cita en este día">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                        </button>
                    </div>
                    <div class="space-y-1 flex-1 overflow-hidden">
                        ${visibleEvents.map(ev => {
                            const color = CalendarManager.getEventColor(ev);
                            const hasAccountColor = ev.account_color && ev.account_color !== ev.calendar_color;
                            return `
                                <div onclick="CalendarManager.viewEventDetail(${ev.id})" class="calendar-event-pill text-[10px] sm:text-[10.5px] px-2 py-0.5 rounded-md truncate font-semibold cursor-pointer hover:scale-[1.01] transition-all flex items-center gap-1.5" style="--ev-color: ${color};" title="${ev.title} (${ev.account_name || ev.calendar_name || 'Calendario'})">
                                    ${hasAccountColor ? `<span class="w-1.5 h-1.5 rounded-full shrink-0 shadow-2xs" style="background-color: ${ev.account_color}" title="Cuenta: ${ev.account_name}"></span>` : `<span class="w-1.5 h-1.5 rounded-full shrink-0" style="background-color: ${color}"></span>`}
                                    <span class="truncate">${ev.title}</span>
                                </div>
                            `;
                        }).join('')}
                        ${remainingCount > 0 ? `
                            <button onclick="CalendarManager.showDayEventsModal('${dateStr}')" class="text-[10px] w-full text-left font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 px-1.5 py-0.5 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors cursor-pointer flex items-center justify-between" title="Ver todos los ${dayEvents.length} compromisos de este día">
                                <span>+${remainingCount} más</span>
                                <span class="text-[9px] opacity-75 font-normal">(${dayEvents.length})</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-850/90 text-center py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 shrink-0 select-none">
                <div>Lun</div>
                <div>Mar</div>
                <div>Mié</div>
                <div>Jue</div>
                <div>Vie</div>
                <div class="text-indigo-600 dark:text-indigo-400">Sáb</div>
                <div class="text-rose-500 dark:text-rose-400">Dom</div>
            </div>
            <div id="calendar-days-grid" class="flex-1 grid grid-cols-7 auto-rows-fr overflow-y-auto">
                ${cellsHtml}
            </div>
        `;
    },

    renderWeekView(container) {
        const monthYearTitle = document.getElementById('calendar-month-year');
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const dayNamesShort = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

        // Calcular el Lunes de la semana
        const curr = new Date(this.currentDate);
        const dayOfWeek = curr.getDay();
        const diffToMon = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
        const monday = new Date(curr);
        monday.setDate(curr.getDate() + diffToMon);
        monday.setHours(0, 0, 0, 0);

        const weekDays = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            weekDays.push(d);
        }
        const sunday = weekDays[6];

        if (monthYearTitle) {
            if (monday.getMonth() === sunday.getMonth()) {
                monthYearTitle.textContent = `${monday.getDate()} - ${sunday.getDate()} de ${monthNames[monday.getMonth()]} ${monday.getFullYear()}`;
            } else {
                monthYearTitle.textContent = `${monday.getDate()} ${monthNames[monday.getMonth()].slice(0,3)} - ${sunday.getDate()} ${monthNames[sunday.getMonth()].slice(0,3)} ${sunday.getFullYear()}`;
            }
        }

        const today = new Date();
        const hours = [];
        for (let h = 7; h <= 21; h++) {
            hours.push(h);
        }

        // Header de 7 días con espacio generoso y distinción clara
        let headerColsHtml = `
            <div class="w-16 sm:w-20 shrink-0 border-r border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center justify-center bg-slate-50 dark:bg-slate-850 select-none">
                Hora
            </div>
        `;

        weekDays.forEach((wd, idx) => {
            const isToday = today.getDate() === wd.getDate() && today.getMonth() === wd.getMonth() && today.getFullYear() === wd.getFullYear();
            const isWeekend = (idx >= 5);
            const headerColBg = isToday 
                ? 'bg-indigo-50/60 dark:bg-indigo-950/40' 
                : (isWeekend ? 'bg-slate-100/40 dark:bg-slate-900/40' : 'bg-slate-50/80 dark:bg-slate-850/80');

            headerColsHtml += `
                <div class="flex-1 text-center py-2.5 sm:py-3 px-1 border-r border-slate-200 dark:border-slate-800 last:border-r-0 flex flex-col items-center justify-center gap-1 ${headerColBg} select-none">
                    <span class="text-[11px] font-bold uppercase tracking-wider ${isToday ? 'text-indigo-600 dark:text-indigo-400 font-extrabold' : (isWeekend ? 'text-slate-400 dark:text-slate-500' : 'text-slate-500 dark:text-slate-400')} block">
                        ${dayNamesShort[idx]}
                    </span>
                    <span class="text-xs sm:text-sm font-bold inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-xl transition-all ${isToday ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-500/20' : 'text-slate-800 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'}">
                        ${wd.getDate()}
                    </span>
                </div>
            `;
        });

        // Filas horarias
        let rowsHtml = '';
        hours.forEach(h => {
            const hourStr = `${String(h).padStart(2, '0')}:00`;
            let daySlotsHtml = '';

            weekDays.forEach((wd, idx) => {
                const isToday = today.getDate() === wd.getDate() && today.getMonth() === wd.getMonth() && today.getFullYear() === wd.getFullYear();
                const isWeekend = (idx >= 5);
                const dateStr = `${wd.getFullYear()}-${String(wd.getMonth() + 1).padStart(2, '0')}-${String(wd.getDate()).padStart(2, '0')}`;
                
                // Eventos de este día en este rango de hora
                const slotEvents = this.getFilteredEvents().filter(e => {
                    if (!e.start_time || !e.start_time.startsWith(dateStr)) return false;
                    const evHour = parseInt(e.start_time.substring(11, 13), 10);
                    return evHour === h;
                });

                const slotBg = isToday 
                    ? 'bg-indigo-50/10 dark:bg-indigo-950/10' 
                    : (isWeekend ? 'bg-slate-50/30 dark:bg-slate-950/20' : 'bg-white dark:bg-slate-900');

                daySlotsHtml += `
                    <div class="flex-1 min-h-[64px] sm:min-h-[70px] p-1.5 border-r border-b border-slate-100 dark:border-slate-800/70 last:border-r-0 ${slotBg} hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group relative cursor-pointer" onclick="CalendarManager.handleSlotClick('${dateStr}', '${hourStr}', event)">
                        <div class="space-y-1 overflow-y-auto max-h-[58px]">
                            ${slotEvents.map(ev => {
                                const color = CalendarManager.getEventColor(ev);
                                return `
                                    <div onclick="event.stopPropagation(); CalendarManager.viewEventDetail(${ev.id})" class="calendar-event-pill text-[11px] p-1.5 rounded-lg font-medium hover:scale-[1.01] transition-all cursor-pointer flex items-center gap-1.5 min-w-0" style="--ev-color: ${color};" title="${ev.title} (${ev.account_name || ev.calendar_name || ''})">
                                        ${ev.account_color && ev.account_color !== ev.calendar_color ? `<span class="w-2 h-2 rounded-full shrink-0 shadow-2xs" style="background-color: ${ev.account_color}"></span>` : `<span class="w-2 h-2 rounded-full shrink-0" style="background-color: ${color}"></span>`}
                                        <span class="font-bold text-[10px] opacity-90 font-mono shrink-0">${ev.start_time.substring(11,16)}</span>
                                        <span class="truncate font-semibold leading-tight">${ev.title}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        <div class="opacity-0 group-hover:opacity-100 text-[10px] text-slate-400 dark:text-slate-500 font-medium transition-opacity flex items-center gap-1 pointer-events-none absolute inset-x-2 bottom-1">
                            <span class="text-indigo-500 font-bold">+</span> ${hourStr}
                        </div>
                    </div>
                `;
            });

            rowsHtml += `
                <div class="flex min-w-[700px]">
                    <div class="w-16 sm:w-20 shrink-0 py-2.5 pr-2.5 sm:pr-3 text-right text-[11px] font-mono font-medium text-slate-400 dark:text-slate-500 border-r border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 select-none">
                        ${hourStr}
                    </div>
                    ${daySlotsHtml}
                </div>
            `;
        });

        container.innerHTML = `
            <div class="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-850 min-w-[700px] shrink-0">
                ${headerColsHtml}
            </div>
            <div class="flex-1 overflow-y-auto overflow-x-auto">
                ${rowsHtml}
            </div>
        `;
    },

    renderDayView(container) {
        const monthYearTitle = document.getElementById('calendar-month-year');
        const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
        const dayNamesFull = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

        const curr = new Date(this.currentDate);
        const year = curr.getFullYear();
        const month = curr.getMonth();
        const date = curr.getDate();
        const dayName = dayNamesFull[curr.getDay()];
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;

        if (monthYearTitle) {
            monthYearTitle.textContent = `${dayName}, ${date} de ${monthNames[month]} de ${year}`;
        }

        const today = new Date();
        const isToday = today.getDate() === date && today.getMonth() === month && today.getFullYear() === year;

        // Filtrar eventos del día
        const dayEvents = this.getFilteredEvents().filter(e => e.start_time && e.start_time.startsWith(dateStr));

        // Generar horas 06:00 a 23:00
        let hoursHtml = '';
        for (let h = 6; h <= 23; h++) {
            const hourStr = `${String(h).padStart(2, '0')}:00`;
            const slotEvents = dayEvents.filter(e => {
                const evHour = parseInt(e.start_time.substring(11, 13), 10);
                return evHour === h;
            });

            hoursHtml += `
                <div class="flex min-h-[68px] sm:min-h-[74px] border-b border-slate-100 dark:border-slate-800/80 group hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors cursor-pointer" onclick="CalendarManager.handleSlotClick('${dateStr}', '${hourStr}', event)">
                    <!-- Columna de Hora -->
                    <div class="w-18 sm:w-20 shrink-0 py-3 text-right pr-3 text-xs font-mono font-medium text-slate-400 dark:text-slate-500 select-none border-r border-slate-200/80 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-900/40">
                        ${hourStr}
                    </div>
                    <!-- Área de Eventos de la Hora -->
                    <div class="flex-1 p-2 sm:p-2.5 space-y-1.5 flex flex-wrap gap-2.5 items-start">
                        ${slotEvents.length === 0 ? `
                            <span class="opacity-0 group-hover:opacity-100 text-xs font-medium text-slate-400 dark:text-slate-500 transition-opacity flex items-center gap-1.5 mt-1.5 py-1 px-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-850/60 shadow-2xs">
                                <svg class="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                                <span>Agendar a las ${hourStr}</span>
                            </span>
                        ` : ''}
                        ${slotEvents.map(ev => {
                            const timeStart = ev.start_time.substring(11, 16);
                            const timeEnd = ev.end_time ? ev.end_time.substring(11, 16) : '';
                            const color = CalendarManager.getEventColor(ev);
                            return `
                                <div onclick="event.stopPropagation(); CalendarManager.viewEventDetail(${ev.id})" class="calendar-event-pill p-3 sm:p-3.5 rounded-2xl hover:scale-[1.008] transition-all cursor-pointer flex-1 min-w-[260px] max-w-xl" style="--ev-color: ${color}; border-left-width: 4px;">
                                    <div class="flex items-center justify-between gap-3 mb-1.5">
                                        <div class="flex items-center gap-2 min-w-0">
                                            ${ev.account_color && ev.account_color !== ev.calendar_color ? `<span class="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style="background-color: ${ev.account_color}" title="Cuenta: ${ev.account_name}"></span>` : `<span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${color}"></span>`}
                                            <span class="text-sm font-bold leading-tight truncate">${ev.title}</span>
                                        </div>
                                        <span class="text-xs px-2 py-0.5 rounded-lg bg-black/10 dark:bg-white/10 font-mono font-bold shrink-0">${timeStart}${timeEnd ? ' - ' + timeEnd : ''}</span>
                                    </div>
                                    <div class="flex items-center gap-3 text-xs opacity-90 flex-wrap">
                                        <span class="flex items-center gap-1">📅 ${ev.account_name || ev.calendar_name || 'Calendario'}</span>
                                        ${ev.location ? `<span class="truncate flex items-center gap-1">📍 ${ev.location}</span>` : ''}
                                    </div>
                                    ${ev.description ? `<p class="text-[11px] opacity-80 line-clamp-1 mt-1">${ev.description}</p>` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850/80 flex items-center justify-between gap-4 flex-wrap shrink-0">
                <div class="flex items-center gap-3.5">
                    <div class="w-12 h-12 rounded-2xl ${isToday ? 'bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white shadow-md' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-2xs'} flex flex-col items-center justify-center shrink-0">
                        <span class="text-[10px] uppercase font-bold tracking-wider leading-none opacity-80">${dayName.slice(0, 3)}</span>
                        <span class="text-lg font-black leading-none mt-0.5">${date}</span>
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <h2 class="text-base sm:text-lg font-bold text-slate-900 dark:text-white capitalize">${dayName}, ${date} de ${monthNames[month]} de ${year}</h2>
                            ${isToday ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">Hoy</span>' : ''}
                        </div>
                        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">${dayEvents.length} ${dayEvents.length === 1 ? 'evento programado' : 'eventos programados'}</p>
                    </div>
                </div>
                <button onclick="CalendarManager.openNewEventModal('${dateStr}')" class="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs hover:shadow-md transition-all flex items-center gap-1.5 cursor-pointer">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    <span>Nuevo Evento en este día</span>
                </button>
            </div>
            <div class="flex-1 overflow-y-auto">
                ${hoursHtml}
            </div>
        `;
    },

    showDayEventsModal(dateStr) {
        const modal = document.getElementById('modal-day-events');
        const titleEl = document.getElementById('modal-day-events-title');
        const subtitleEl = document.getElementById('modal-day-events-subtitle');
        const listEl = document.getElementById('modal-day-events-list');
        const btnAdd = document.getElementById('btn-modal-day-add-event');

        if (!modal || !listEl) return;

        const dateParts = dateStr.split('-');
        const dateObj = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10));
        const dayNamesFull = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
        const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

        const formattedDate = `${dayNamesFull[dateObj.getDay()]}, ${dateObj.getDate()} de ${monthNames[dateObj.getMonth()]} de ${dateObj.getFullYear()}`;
        if (titleEl) titleEl.textContent = `Eventos y Tareas`;
        if (subtitleEl) subtitleEl.textContent = formattedDate;

        const dayEvents = this.getFilteredEvents().filter(e => e.start_time && e.start_time.startsWith(dateStr));

        if (dayEvents.length === 0) {
            listEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">No hay eventos ni tareas registradas para este día.</p>`;
        } else {
            listEl.innerHTML = dayEvents.map(ev => {
                const color = this.getEventColor(ev);
                const startTime = ev.start_time ? ev.start_time.substring(11, 16) : '';
                const endTime = ev.end_time ? ev.end_time.substring(11, 16) : '';
                const timeText = startTime ? (endTime ? `${startTime} - ${endTime}` : startTime) : 'Todo el día';

                return `
                    <div onclick="CalendarManager.viewEventDetail(${ev.id})" class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850/60 hover:border-indigo-400 dark:hover:border-indigo-600 cursor-pointer transition-all flex items-start justify-between gap-3 group">
                        <div class="flex items-start gap-2.5 min-w-0">
                            <span class="w-3 h-3 rounded-full mt-1 shrink-0 shadow-2xs" style="background-color: ${color}"></span>
                            <div class="min-w-0">
                                <h4 class="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">${ev.title}</h4>
                                <div class="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                    <span class="font-mono font-medium">${timeText}</span>
                                    <span>&bull;</span>
                                    <span>${ev.calendar_name || 'Calendario'}</span>
                                    ${ev.account_name ? `<span class="inline-flex items-center gap-1 font-semibold text-[10px] text-slate-400"><span class="w-1.5 h-1.5 rounded-full" style="background-color: ${ev.account_color || color}"></span>${ev.account_name}</span>` : ''}
                                </div>
                                ${ev.location ? `<p class="text-[10px] text-slate-400 truncate mt-1">📍 ${ev.location}</p>` : ''}
                            </div>
                        </div>
                        <button type="button" onclick="event.stopPropagation(); CalendarManager.viewEventDetail(${ev.id});" class="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline shrink-0 p-1 cursor-pointer">
                            Ver detalle &rarr;
                        </button>
                    </div>
                `;
            }).join('');
        }

        if (btnAdd) {
            btnAdd.onclick = () => {
                modal.classList.add('hidden');
                this.openNewEventModal(dateStr);
            };
        }

        modal.classList.remove('hidden');
    },

    handleSlotClick(dateStr, hourStr, event) {
        if (event && event.target && event.target.closest('[onclick*="viewEventDetail"]')) {
            return;
        }
        this.openNewEventModal(dateStr, hourStr);
    },

    renderUpcomingList() {
        const listEl = document.getElementById('upcoming-events-list');
        if (!listEl) return;

        const filteredEvents = this.getFilteredEvents();
        if (filteredEvents.length === 0) {
            listEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">No hay eventos para las cuentas seleccionadas</p>`;
            return;
        }

        listEl.innerHTML = filteredEvents.slice(0, 5).map(ev => {
            const date = new Date(ev.start_time ? ev.start_time.replace(' ', 'T') : '');
            const color = this.getEventColor(ev);
            return `
                <div onclick="CalendarManager.viewEventDetail(${ev.id})" class="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-start justify-between gap-2 shadow-2xs hover:border-indigo-400 dark:hover:border-indigo-600 cursor-pointer transition-colors">
                    <div class="flex items-start gap-2.5 min-w-0">
                        <span class="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style="background-color: ${color}"></span>
                        <div class="min-w-0">
                            <h5 class="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">${ev.title}</h5>
                            <p class="text-[11px] text-slate-500 dark:text-slate-400">${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} &bull; ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            ${ev.location ? `<p class="text-[10px] text-slate-400 truncate mt-0.5">📍 ${ev.location}</p>` : ''}
                        </div>
                    </div>
                    <button onclick="event.stopPropagation(); CalendarManager.deleteEvent(${ev.id})" class="text-slate-400 hover:text-rose-500 p-1 transition-colors shrink-0 cursor-pointer" title="Eliminar evento">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            `;
        }).join('');
    },

    renderTasks() {
        const listEl = document.getElementById('calendar-tasks-list');
        const countEl = document.getElementById('calendar-tasks-count');
        if (!listEl) return;

        const filteredTasks = this.getFilteredTasks();
        const pendingCount = filteredTasks.filter(t => !t.is_completed).length;

        if (countEl) countEl.textContent = pendingCount;

        if (filteredTasks.length === 0) {
            listEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">No hay tareas para los calendarios seleccionados</p>`;
            return;
        }

        // Ordenar: tareas pendientes primero, luego completadas; y por ID descendente
        const sortedTasks = [...filteredTasks].sort((a, b) => {
            const compA = a.is_completed ? 1 : 0;
            const compB = b.is_completed ? 1 : 0;
            if (compA !== compB) return compA - compB;
            return (b.id || 0) - (a.id || 0);
        });

        listEl.innerHTML = sortedTasks.map(t => {
            const isCompleted = !!t.is_completed;
            const color = this.getEventColor(t);
            const cleanTitle = t.title.replace(/^\[Tarea\]\s*/i, '');
            const titleHtml = this.linkifyText(cleanTitle);
            const hasDate = t.start_time && t.start_time.trim() !== '';
            let dateBadge = '';
            if (hasDate) {
                try {
                    const rawDate = t.start_time.includes('T') ? t.start_time.split('T')[0] : t.start_time;
                    const parts = rawDate.split('-');
                    if (parts.length === 3) {
                        const dayNum = parseInt(parts[2], 10);
                        const monthIdx = parseInt(parts[1], 10) - 1;
                        const monthStr = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][monthIdx] || '';
                        dateBadge = `<span class="text-[9px] px-1.5 py-0.2 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-medium shrink-0">${dayNum} ${monthStr}</span>`;
                    }
                } catch (e) {}
            }

            return `
                <div class="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2 shadow-2xs group hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors">
                    <div class="flex items-center gap-2 min-w-0 flex-1">
                        <button onclick="CalendarManager.toggleTaskCompletion(${t.id})" class="w-4 h-4 rounded border ${isCompleted ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 dark:border-slate-600 hover:border-indigo-500'} flex items-center justify-center shrink-0 transition-colors cursor-pointer" title="${isCompleted ? 'Marcar como pendiente' : 'Marcar como completada'}">
                            ${isCompleted ? '<svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>' : ''}
                        </button>
                        <span class="w-2 h-2 rounded-full shrink-0 shadow-2xs" style="background-color: ${color}" title="Calendario: ${t.calendar_name || ''}${t.account_name ? ' | Cuenta: ' + t.account_name : ''}"></span>
                        <div class="min-w-0 flex-1 cursor-pointer" onclick="CalendarManager.viewEventDetail(${t.id})">
                            <span class="text-xs block truncate ${isCompleted ? 'line-through text-slate-400 dark:text-slate-500' : 'font-medium text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400'}">${titleHtml}</span>
                            <div class="flex items-center gap-1.5 mt-0.5">
                                <span class="text-[10px] text-slate-400 truncate">${t.account_name || t.calendar_name || 'Calendario'}</span>
                                ${dateBadge}
                            </div>
                        </div>
                    </div>
                    <button onclick="CalendarManager.deleteEvent(${t.id})" class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 p-1 transition-opacity shrink-0 cursor-pointer" title="Eliminar tarea">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            `;
        }).join('');
    },

    async toggleTaskCompletion(taskId) {
        try {
            const res = await fetch(`/api/tasks/${taskId}/toggle`, { method: 'PATCH' });
            if (res.ok) {
                const data = await res.json();
                const isComp = data.task?.is_completed;
                UI.showStickyToast(
                    isComp ? 'Tarea Completada' : 'Tarea Reactivada',
                    `"${data.task?.title || 'Tarea'}" se marcó como ${isComp ? 'completada' : 'pendiente'}`,
                    'info',
                    3000
                );
                await this.loadTasks();
                await this.loadEvents();
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    renderColorPalette() {
        const container = document.getElementById('event-color-palette');
        if (!container) return;
        const currentHex = this.selectedColor || '';
        
        container.innerHTML = this.googleColors.map(c => {
            const isSelected = (c.hex === currentHex) || (!c.hex && !currentHex);
            const isDefault = !c.hex;
            const bgStyle = isDefault ? 'background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);' : `background-color: ${c.hex};`;
            return `
                <button type="button" onclick="CalendarManager.selectColor('${c.hex}')" 
                    class="w-5 h-5 rounded-full shrink-0 flex items-center justify-center transition-transform hover:scale-115 cursor-pointer shadow-2xs relative ${isSelected ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : 'opacity-80 hover:opacity-100'}"
                    style="${bgStyle}"
                    title="${c.name}">
                    ${isSelected ? '<svg class="w-3 h-3 text-white drop-shadow-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>' : ''}
                </button>
            `;
        }).join('');
    },

    selectColor(hex) {
        this.selectedColor = hex || '';
        const hiddenInput = document.getElementById('event-color');
        const labelEl = document.getElementById('event-color-label');
        if (hiddenInput) hiddenInput.value = this.selectedColor;
        const match = this.googleColors.find(c => c.hex === this.selectedColor);
        if (labelEl) labelEl.textContent = match ? match.name : 'Personalizado';
        this.renderColorPalette();
    },

    toggleAllDay(isAllDay) {
        this.syncDateTimeInputsVisibility();
    },

    onDateInputChange(which = 'start') {
        const entryType = document.getElementById('event-entry-type')?.value || 'event';
        const startDateEl = document.getElementById('event-start-date');
        const endDateEl = document.getElementById('event-end-date');
        const startTimeEl = document.getElementById('event-start-time-only');
        const endTimeEl = document.getElementById('event-end-time-only');

        if (which === 'start' && startDateEl) {
            if (startDateEl.value) {
                if (endDateEl && !endDateEl.value) {
                    endDateEl.value = startDateEl.value;
                }
                if (startTimeEl && !startTimeEl.value) {
                    startTimeEl.value = this.lastDefaultStartTime || '10:00';
                }
                if (endTimeEl && !endTimeEl.value) {
                    endTimeEl.value = this.lastDefaultEndTime || '11:00';
                }
            } else if (entryType === 'task') {
                if (endDateEl) endDateEl.value = '';
                if (startTimeEl) startTimeEl.value = '';
                if (endTimeEl) endTimeEl.value = '';
            }
        } else if (which === 'end' && endDateEl) {
            if (endDateEl.value && startDateEl && !startDateEl.value) {
                startDateEl.value = endDateEl.value;
                if (startTimeEl && !startTimeEl.value) {
                    startTimeEl.value = this.lastDefaultStartTime || '10:00';
                }
                if (endTimeEl && !endTimeEl.value) {
                    endTimeEl.value = this.lastDefaultEndTime || '11:00';
                }
            }
        }

        this.syncDateTimeInputsVisibility();
    },

    syncDateTimeInputsVisibility() {
        const entryType = document.getElementById('event-entry-type')?.value || 'event';
        const isAllDay = !!document.getElementById('event-all-day')?.checked;
        const startDateEl = document.getElementById('event-start-date');
        const endDateEl = document.getElementById('event-end-date');
        const startTimeEl = document.getElementById('event-start-time-only');
        const endTimeEl = document.getElementById('event-end-time-only');

        const hasDate = Boolean((startDateEl && startDateEl.value) || (endDateEl && endDateEl.value));

        if (entryType === 'task') {
            if (startDateEl) startDateEl.required = false;
            if (endDateEl) endDateEl.required = false;
            if (startTimeEl) startTimeEl.required = false;
            if (endTimeEl) endTimeEl.required = false;

            // En Tareas: la hora solo se muestra y asigna si se ha elegido una fecha (y no es Todo el día)
            const showTime = hasDate && !isAllDay;
            if (startTimeEl) {
                startTimeEl.style.display = showTime ? 'block' : 'none';
                if (showTime && !startTimeEl.value) startTimeEl.value = this.lastDefaultStartTime || '10:00';
                if (!hasDate) startTimeEl.value = '';
            }
            if (endTimeEl) {
                endTimeEl.style.display = showTime ? 'block' : 'none';
                if (showTime && !endTimeEl.value) endTimeEl.value = this.lastDefaultEndTime || '11:00';
                if (!hasDate) endTimeEl.value = '';
            }
        } else {
            // En Eventos / Citas: fecha y hora son obligatorias de forma normal
            if (startDateEl) startDateEl.required = true;
            if (endDateEl) endDateEl.required = true;
            if (startTimeEl) {
                startTimeEl.style.display = isAllDay ? 'none' : 'block';
                startTimeEl.required = !isAllDay;
                if (!isAllDay && !startTimeEl.value) startTimeEl.value = this.lastDefaultStartTime || '10:00';
            }
            if (endTimeEl) {
                endTimeEl.style.display = isAllDay ? 'none' : 'block';
                endTimeEl.required = !isAllDay;
                if (!isAllDay && !endTimeEl.value) endTimeEl.value = this.lastDefaultEndTime || '11:00';
            }
        }
    },

    toggleEventModalAdvanced(forceState = null) {
        const advancedSec = document.getElementById('event-advanced-section');
        const textToggle = document.getElementById('text-toggle-event-advanced');
        const btnToggle = document.getElementById('btn-toggle-event-advanced');
        if (!advancedSec) return;

        const isCurrentlyHidden = advancedSec.classList.contains('hidden');
        const shouldShow = (typeof forceState === 'boolean') ? forceState : isCurrentlyHidden;

        if (shouldShow) {
            advancedSec.classList.remove('hidden');
            if (textToggle) textToggle.textContent = 'Menos opciones ▴';
            if (btnToggle) {
                btnToggle.classList.add('bg-indigo-50', 'dark:bg-indigo-950/50');
            }
            setTimeout(() => {
                advancedSec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 60);
        } else {
            advancedSec.classList.add('hidden');
            if (textToggle) textToggle.textContent = 'Más opciones ▾';
            if (btnToggle) {
                btnToggle.classList.remove('bg-indigo-50', 'dark:bg-indigo-950/50');
            }
        }
    },

    addGoogleMeet() {
        const chars = 'abcdefghijklmnopqrstuvwxyz';
        const p1 = Array.from({length: 3}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        const p2 = Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        const p3 = Array.from({length: 3}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        const meetUrl = `https://meet.google.com/${p1}-${p2}-${p3}`;
        this.setMeetingUrl(meetUrl);
    },

    setMeetingUrl(url) {
        const hiddenInput = document.getElementById('event-meeting-url');
        const displayInput = document.getElementById('event-meeting-input');
        const addBtnWrapper = document.getElementById('event-meeting-add-btn-wrapper');
        const activeBox = document.getElementById('event-meeting-active-box');
        if (hiddenInput) hiddenInput.value = url || '';
        if (displayInput) displayInput.value = url || '';
        if (url) {
            if (addBtnWrapper) addBtnWrapper.classList.add('hidden');
            if (activeBox) activeBox.classList.remove('hidden');
        } else {
            if (addBtnWrapper) addBtnWrapper.classList.remove('hidden');
            if (activeBox) activeBox.classList.add('hidden');
        }
    },

    removeGoogleMeet() {
        this.setMeetingUrl('');
    },

    copyMeetingUrl() {
        const displayInput = document.getElementById('event-meeting-input');
        const url = displayInput?.value || document.getElementById('event-meeting-url')?.value;
        if (url) {
            navigator.clipboard.writeText(url);
            UI.showStickyToast('Enlace Copiado', 'Se copió el enlace de la reunión al portapapeles', 'info', 2000);
        }
    },

    addAttendee(email) {
        const input = document.getElementById('event-attendee-input');
        const val = (email || input?.value || '').trim();
        if (!val) return;
        if (!val.includes('@')) {
            UI.showStickyToast('Correo Inválido', 'Por favor ingresa un correo electrónico válido', 'warning', 2500);
            return;
        }
        if (!this.attendeesList.includes(val)) {
            this.attendeesList.push(val);
            this.renderAttendeesChips();
        }
        if (input) input.value = '';
    },

    removeAttendee(idx) {
        this.attendeesList.splice(idx, 1);
        this.renderAttendeesChips();
    },

    renderAttendeesChips() {
        const container = document.getElementById('event-attendees-chips');
        const hiddenInput = document.getElementById('event-attendees');
        if (!container) return;
        if (hiddenInput) hiddenInput.value = this.attendeesList.join(', ');
        container.innerHTML = this.attendeesList.map((att, i) => `
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-medium">
                <span class="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                <span>${att}</span>
                <button type="button" onclick="CalendarManager.removeAttendee(${i})" class="text-indigo-400 hover:text-indigo-700 dark:hover:text-white font-bold p-0.5 leading-none cursor-pointer">&times;</button>
            </span>
        `).join('');
    },

    openNewTaskModal() {
        this.openNewEventModal();
        this.setNewEventType('task');
    },

    openNewEventModal(dateStr = '', timeStr = '10:00', editEvent = null) {
        const modal = document.getElementById('new-event-modal');
        const modalTitle = document.getElementById('new-event-modal-title');
        const editIdInput = document.getElementById('event-edit-id');
        const titleInput = document.getElementById('event-title');
        const selectEl = document.getElementById('event-calendar-select');
        const allDayCheckbox = document.getElementById('event-all-day');
        const startDateInput = document.getElementById('event-start-date');
        const startTimeInput = document.getElementById('event-start-time-only');
        const endDateInput = document.getElementById('event-end-date');
        const endTimeInput = document.getElementById('event-end-time-only');
        const recurrenceSelect = document.getElementById('event-recurrence');
        const locationInput = document.getElementById('event-location');
        const notificationSelect = document.getElementById('event-notification');
        const availabilitySelect = document.getElementById('event-availability');
        const visibilitySelect = document.getElementById('event-visibility');
        const descriptionInput = document.getElementById('event-description');
        const submitBtn = document.getElementById('btn-submit-event');

        this.renderColorPalette();

        if (editEvent) {
            // Modo Edición
            if (editIdInput) editIdInput.value = editEvent.id;
            if (modalTitle) modalTitle.textContent = editEvent.is_task ? 'Editar Tarea' : 'Editar Evento / Cita';
            if (submitBtn) submitBtn.textContent = 'Actualizar Cambios';
            if (titleInput) titleInput.value = (editEvent.title || '').replace(/^\[Tarea\]\s*/i, '');

            const isAllDay = !!editEvent.all_day;
            if (allDayCheckbox) allDayCheckbox.checked = isAllDay;

            if (editEvent.start_time) {
                const sParts = editEvent.start_time.split('T');
                if (startDateInput) startDateInput.value = sParts[0] || '';
                if (startTimeInput) startTimeInput.value = sParts[1] ? sParts[1].substring(0, 5) : '';
            } else {
                if (startDateInput) startDateInput.value = '';
                if (startTimeInput) startTimeInput.value = '';
            }
            if (editEvent.end_time) {
                const eParts = editEvent.end_time.split('T');
                if (endDateInput) endDateInput.value = eParts[0] || '';
                if (endTimeInput) endTimeInput.value = eParts[1] ? eParts[1].substring(0, 5) : '';
            } else {
                if (endDateInput) endDateInput.value = '';
                if (endTimeInput) endTimeInput.value = '';
            }

            this.setNewEventType(editEvent.is_task ? 'task' : 'event');

            if (recurrenceSelect) recurrenceSelect.value = editEvent.recurrence || 'none';
            if (locationInput) locationInput.value = editEvent.location || '';
            if (notificationSelect) notificationSelect.value = editEvent.notification_minutes !== undefined ? String(editEvent.notification_minutes) : '10';
            if (availabilitySelect) availabilitySelect.value = editEvent.availability || 'busy';
            if (visibilitySelect) visibilitySelect.value = editEvent.visibility || 'default';
            if (descriptionInput) descriptionInput.value = editEvent.description || '';

            this.setMeetingUrl(editEvent.meeting_url || '');

            this.attendeesList = editEvent.attendees ? editEvent.attendees.split(',').map(s => s.trim()).filter(Boolean) : [];
            this.renderAttendeesChips();

            this.selectColor(editEvent.color || '');

            if (selectEl && editEvent.calendar_id) {
                selectEl.value = editEvent.calendar_id;
            }

            // En edición, auto-expandir la sección avanzada si el evento ya contiene datos avanzados
            const hasAdvancedData = Boolean(
                (editEvent.location && editEvent.location.trim()) ||
                (editEvent.attendees && editEvent.attendees.trim()) ||
                (editEvent.description && editEvent.description.trim()) ||
                (editEvent.recurrence && editEvent.recurrence !== 'none') ||
                (editEvent.notification_minutes !== undefined && String(editEvent.notification_minutes) !== '10') ||
                (editEvent.availability && editEvent.availability !== 'busy') ||
                (editEvent.visibility && editEvent.visibility !== 'default')
            );
            this.toggleEventModalAdvanced(hasAdvancedData);
        } else {
            // Modo Creación: iniciar siempre en versión básica compacta
            this.toggleEventModalAdvanced(false);

            if (editIdInput) editIdInput.value = '';
            if (modalTitle) modalTitle.textContent = 'Programar Evento / Cita';
            if (submitBtn) submitBtn.textContent = 'Guardar Cita';
            if (titleInput) titleInput.value = '';

            const defaultDate = dateStr || new Date().toISOString().split('T')[0];
            let startH = parseInt(timeStr.split(':')[0], 10) || 10;
            let endH = startH + 1;
            if (endH > 23) endH = 23;

            this.lastDefaultEventDate = defaultDate;
            this.lastDefaultStartTime = `${String(startH).padStart(2, '0')}:00`;
            this.lastDefaultEndTime = `${String(endH).padStart(2, '0')}:00`;

            if (startDateInput) startDateInput.value = defaultDate;
            if (startTimeInput) startTimeInput.value = this.lastDefaultStartTime;
            if (endDateInput) endDateInput.value = defaultDate;
            if (endTimeInput) endTimeInput.value = this.lastDefaultEndTime;

            if (allDayCheckbox) allDayCheckbox.checked = false;

            if (recurrenceSelect) recurrenceSelect.value = 'none';
            if (locationInput) locationInput.value = '';
            if (notificationSelect) notificationSelect.value = '10';
            if (availabilitySelect) availabilitySelect.value = 'busy';
            if (visibilitySelect) visibilitySelect.value = 'default';
            if (descriptionInput) descriptionInput.value = '';

            this.setMeetingUrl('');
            this.attendeesList = [];
            this.renderAttendeesChips();
            this.selectColor('');

            this.setNewEventType('event');

            if (selectEl && this.calendars.length > 0) {
                const targetId = this.defaultCalendarId || this.calendars[0].id;
                selectEl.value = targetId;
            }
        }

        if (modal) modal.classList.remove('hidden');
    },

    openEditEventModal(eventId) {
        const ev = this.events.find(e => e.id === eventId) || this.tasks.find(t => t.id === eventId);
        if (!ev) return;
        UI.closeDrawer('drawer-event-detail');
        this.openNewEventModal('', '10:00', ev);
    },

    setNewEventType(type) {
        const inputType = document.getElementById('event-entry-type');
        const btnEvent = document.getElementById('event-type-btn-event');
        const btnTask = document.getElementById('event-type-btn-task');
        const modalTitle = document.getElementById('new-event-modal-title');
        const titleInput = document.getElementById('event-title');
        const submitBtn = document.getElementById('btn-submit-event');
        const editId = document.getElementById('event-edit-id')?.value;
        const startDateInput = document.getElementById('event-start-date');
        const endDateInput = document.getElementById('event-end-date');
        const startTimeInput = document.getElementById('event-start-time-only');
        const endTimeInput = document.getElementById('event-end-time-only');

        if (inputType) inputType.value = type;

        if (type === 'task') {
            if (btnTask) btnTask.className = 'py-1.5 px-3 rounded-lg bg-indigo-600 text-white font-semibold shadow-2xs transition-all text-center cursor-pointer';
            if (btnEvent) btnEvent.className = 'py-1.5 px-3 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all text-center cursor-pointer';
            if (modalTitle) modalTitle.textContent = editId ? 'Editar Tarea' : 'Crear Tarea / Pendiente';
            if (titleInput) titleInput.placeholder = 'Entregar reporte, revisar contrato...';
            if (submitBtn) submitBtn.textContent = editId ? 'Actualizar Tarea' : 'Guardar Tarea';

            // Al crear una tarea nueva, iniciar sin fecha ni hora obligatoria
            if (!editId) {
                if (startDateInput) startDateInput.value = '';
                if (endDateInput) endDateInput.value = '';
                if (startTimeInput) startTimeInput.value = '';
                if (endTimeInput) endTimeInput.value = '';
            }
        } else {
            if (btnEvent) btnEvent.className = 'py-1.5 px-3 rounded-lg bg-indigo-600 text-white font-semibold shadow-2xs transition-all text-center cursor-pointer';
            if (btnTask) btnTask.className = 'py-1.5 px-3 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all text-center cursor-pointer';
            if (modalTitle) modalTitle.textContent = editId ? 'Editar Evento / Cita' : 'Programar Evento / Cita';
            if (titleInput) titleInput.placeholder = 'Añade un título para la reunión o cita...';
            if (submitBtn) submitBtn.textContent = editId ? 'Actualizar Cita' : 'Guardar Cita';

            // En Eventos / Citas: asegurar que tenga fecha y hora normal si estaban vacíos
            const fallbackDate = this.lastDefaultEventDate || new Date().toISOString().split('T')[0];
            if (startDateInput && !startDateInput.value) startDateInput.value = fallbackDate;
            if (endDateInput && !endDateInput.value) endDateInput.value = startDateInput?.value || fallbackDate;
            if (startTimeInput && !startTimeInput.value) startTimeInput.value = this.lastDefaultStartTime || '10:00';
            if (endTimeInput && !endTimeInput.value) endTimeInput.value = this.lastDefaultEndTime || '11:00';
        }

        this.syncDateTimeInputsVisibility();
    },

    async saveEvent(e) {
        e.preventDefault();
        const editId = document.getElementById('event-edit-id')?.value;
        const calId = document.getElementById('event-calendar-select').value;
        const entryType = document.getElementById('event-entry-type')?.value || 'event';
        let title = document.getElementById('event-title').value.trim();
        const isAllDay = document.getElementById('event-all-day')?.checked ? 1 : 0;
        const startDate = document.getElementById('event-start-date')?.value || '';
        const startTimeOnly = document.getElementById('event-start-time-only')?.value || '10:00';
        const endDate = document.getElementById('event-end-date')?.value || startDate;
        const endTimeOnly = document.getElementById('event-end-time-only')?.value || '11:00';
        const recurrence = document.getElementById('event-recurrence')?.value || 'none';
        const meetingUrl = document.getElementById('event-meeting-input')?.value || document.getElementById('event-meeting-url')?.value || '';
        const location = document.getElementById('event-location').value.trim();
        const attendees = this.attendeesList.join(', ');
        const notification = parseInt(document.getElementById('event-notification')?.value, 10) || 10;
        const availability = document.getElementById('event-availability')?.value || 'busy';
        const visibility = document.getElementById('event-visibility')?.value || 'default';
        const color = this.selectedColor || '';
        const description = document.getElementById('event-description').value.trim();

        if (entryType === 'task') {
            if (!title.toLowerCase().startsWith('[tarea]')) {
                title = `[Tarea] ${title}`;
            }
        }

        let start_time = '';
        let end_time = '';
        if (startDate) {
            if (isAllDay) {
                start_time = `${startDate}T00:00:00`;
                end_time = `${endDate || startDate}T23:59:59`;
            } else {
                start_time = `${startDate}T${startTimeOnly}:00`;
                end_time = `${endDate || startDate}T${endTimeOnly}:00`;
            }
        } else if (entryType !== 'task') {
            UI.showStickyToast('Campos requeridos', 'Por favor ingresa fecha y hora para el evento', 'warning');
            return;
        }

        const isTask = entryType === 'task' ? 1 : 0;
        const payload = {
            calendar_id: parseInt(calId, 10) || this.defaultCalendarId || 1,
            title,
            start_time,
            end_time,
            all_day: isAllDay,
            recurrence,
            meeting_url: meetingUrl,
            location,
            attendees,
            notification_minutes: notification,
            availability,
            visibility,
            color,
            description,
            is_task: isTask
        };

        try {
            const url = editId ? `/api/events/${editId}` : '/api/events';
            const method = editId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('new-event-modal').classList.add('hidden');
                document.getElementById('new-event-form').reset();
                const toastTitle = editId ? 'Evento Actualizado' : (isTask ? 'Tarea Guardada' : 'Evento Guardado');
                UI.showStickyToast(toastTitle, `"${title}" se ha ${editId ? 'actualizado' : 'guardado'} correctamente`, 'success');
                await this.loadEvents();
                await this.loadTasks();
            } else {
                UI.showStickyToast('Error', data.detail || 'No se pudo guardar el evento', 'error');
            }
        } catch (err) {
            UI.showStickyToast('Error', err.message, 'error');
        }
    },

    async deleteEvent(eventId) {
        const confirmed = await UI.confirm({
            title: '¿Eliminar cita o tarea?',
            message: '¿Estás seguro de eliminar este registro del calendario? Esta acción no se puede deshacer.',
            confirmText: 'Eliminar',
            isDanger: true
        });

        if (!confirmed) return;

        try {
            const res = await fetch(`/api/events/${eventId}`, { method: 'DELETE' });
            if (res.ok) {
                UI.closeDrawer('drawer-event-detail');
                UI.showStickyToast('Registro Eliminado', 'Se ha removido del calendario y tareas', 'success');
                await this.loadEvents();
                await this.loadTasks();
            } else {
                const err = await res.json();
                UI.showStickyToast('Error', err.detail || 'No se pudo eliminar el registro', 'error');
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    openExternal(url) {
        if (!url) return;
        let cleanUrl = String(url).trim();
        if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('mailto:')) {
            cleanUrl = 'https://' + cleanUrl;
        }

        if (window.DesktopBridge && typeof DesktopBridge.openExternalUrl === 'function') {
            DesktopBridge.openExternalUrl(cleanUrl);
            return;
        }

        // Fallback al endpoint backend /api/desktop/open-url
        fetch('/api/desktop/open-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: cleanUrl })
        }).catch(() => {
            window.open(cleanUrl, '_blank', 'noopener,noreferrer');
        });
    },

    linkifyText(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        const escaped = div.innerHTML;

        // Detectar URLs válidas (http:// o https://)
        const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
        return escaped.replace(urlRegex, (url) => {
            const safeAttrUrl = url.replace(/"/g, '&quot;');
            return `<a href="${safeAttrUrl}" onclick="event.preventDefault(); event.stopPropagation(); CalendarManager.openExternal('${safeAttrUrl}');" class="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 underline font-semibold break-all inline-flex items-center gap-1 cursor-pointer transition-colors" title="Abrir enlace en navegador predeterminado">${url} <svg class="w-3 h-3 shrink-0 inline-block opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg></a>`;
        });
    },

    formatLocationHtml(location) {
        if (!location) return '';
        const trimmed = location.trim();
        const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
        const matches = trimmed.match(urlRegex);
        
        if (matches && matches.length > 0) {
            const firstUrl = matches[0];
            const isMeeting = firstUrl.toLowerCase().includes('teams.microsoft.com') ||
                              firstUrl.toLowerCase().includes('zoom.us') ||
                              firstUrl.toLowerCase().includes('meet.google.com') ||
                              firstUrl.toLowerCase().includes('webex.com');
            const safeAttrUrl = firstUrl.replace(/"/g, '&quot;');

            return `
                <div class="space-y-2">
                    <div class="text-xs text-slate-700 dark:text-slate-300 break-all leading-relaxed">
                        ${this.linkifyText(trimmed)}
                    </div>
                    <button type="button" onclick="event.preventDefault(); event.stopPropagation(); CalendarManager.openExternal('${safeAttrUrl}');" class="inline-flex items-center gap-1.5 px-3 py-1.5 ${isMeeting ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white rounded-xl text-xs font-semibold shadow-2xs hover:shadow-xs transition-all cursor-pointer">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${isMeeting ? 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' : 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14'}"/></svg>
                        <span>${isMeeting ? 'Unirse a la reunión (Abrir en navegador)' : 'Abrir enlace en navegador'}</span>
                    </button>
                </div>
            `;
        }

        // Si es una dirección física normal, mostrar enlace directo para verla en Google Maps
        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`;
        return `
            <div class="space-y-1.5">
                <p class="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">📍 ${trimmed}</p>
                <button type="button" onclick="event.preventDefault(); event.stopPropagation(); CalendarManager.openExternal('${mapsUrl}');" class="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    <span>Ver en Google Maps</span>
                </button>
            </div>
        `;
    },

    formatEventDateTime(startTimeStr, endTimeStr, allDay = 0) {
        if (!startTimeStr) return { dateStr: 'Sin fecha asignada (Tarea pendiente)', timeStr: '', durationStr: '' };
        const start = new Date(startTimeStr);
        const end = endTimeStr ? new Date(endTimeStr) : null;

        const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
        const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

        const dayOfWeek = dayNames[start.getDay()];
        const dayOfMonth = start.getDate();
        const month = monthNames[start.getMonth()];
        const year = start.getFullYear();

        const dateStr = `${dayOfWeek}, ${dayOfMonth} de ${month} de ${year}`;
        let timeStr = '';
        let durationStr = '';

        if (allDay) {
            timeStr = 'Todo el día';
        } else {
            const startHour = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (end && !isNaN(end.getTime()) && end.getTime() !== start.getTime()) {
                const endHour = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                timeStr = `${startHour} - ${endHour}`;
                
                const diffMs = end.getTime() - start.getTime();
                if (diffMs > 0) {
                    const diffMins = Math.round(diffMs / 60000);
                    if (diffMins < 60) {
                        durationStr = `${diffMins} minutos`;
                    } else {
                        const hrs = Math.floor(diffMins / 60);
                        const remMins = diffMins % 60;
                        durationStr = remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs} hora${hrs > 1 ? 's' : ''}`;
                    }
                }
            } else {
                timeStr = `${startHour}`;
            }
        }

        return { dateStr, timeStr, durationStr };
    },

    async viewEventDetail(eventId) {
        // Cerrar modal de día si estuviese abierto
        const dayModal = document.getElementById('modal-day-events');
        if (dayModal) {
            dayModal.classList.add('hidden');
        }

        let ev = (this.events || []).find(e => e.id == eventId) || (this.tasks || []).find(t => t.id == eventId);
        if (!ev) {
            try {
                const res = await fetch(`/api/events/${eventId}`);
                if (res.ok) {
                    ev = await res.json();
                } else {
                    const taskRes = await fetch(`/api/tasks`);
                    if (taskRes.ok) {
                        const tasks = await taskRes.json();
                        ev = (tasks || []).find(t => t.id == eventId);
                    }
                }
            } catch (err) {
                console.error("Error al obtener detalle del evento:", err);
            }
        }

        if (!ev) {
            if (window.UI && typeof UI.showStickyToast === 'function') {
                UI.showStickyToast('Evento no encontrado', 'No se pudo cargar la información de la cita.', 'warning');
            }
            return;
        }

        try {
            // Actualizar fecha actual sin causar un re-render destructivo
            if (ev.start_time) {
                const evDate = new Date(ev.start_time);
                if (!isNaN(evDate.getTime())) {
                    this.currentDate = new Date(evDate);
                }
            }

            // Título
            const titleEl = document.getElementById('event-detail-title');
            if (titleEl) titleEl.textContent = ev.title || '(Sin título)';

            // Calendario y color
            const calNameEl = document.getElementById('event-detail-calendar-name');
            const badgeColorEl = document.getElementById('event-detail-badge-color');
            const color = this.getEventColor(ev);
            if (calNameEl) {
                let nameStr = `${ev.calendar_name || 'Calendario'}`;
                if (ev.account_name) nameStr += ` (${ev.account_name})`;
                calNameEl.textContent = nameStr;
            }
            if (badgeColorEl) badgeColorEl.style.backgroundColor = color;

            // Fecha, Hora y Duración
            const dateInfo = this.formatEventDateTime(ev.start_time, ev.end_time, ev.all_day);
            const dateEl = document.getElementById('event-detail-date');
            const timeEl = document.getElementById('event-detail-time');
            const durEl = document.getElementById('event-detail-duration');

            if (dateEl) dateEl.textContent = dateInfo.dateStr;
            if (timeEl) {
                timeEl.textContent = dateInfo.timeStr;
                timeEl.style.display = dateInfo.timeStr ? 'block' : 'none';
            }
            if (durEl) {
                durEl.textContent = dateInfo.durationStr ? `⏱ Duración: ${dateInfo.durationStr}` : '';
                durEl.style.display = dateInfo.durationStr ? 'block' : 'none';
            }

            // Ubicación / Videollamada
            const recBadge = document.getElementById('event-detail-recurrence-badge');
            const recLabels = {
                'daily': '🔁 Todos los días',
                'weekly': '🔁 Cada semana',
                'monthly': '🔁 Cada mes',
                'yearly': '🔁 Anualmente',
                'weekdays': '🔁 Días laborables'
            };
            if (recBadge) {
                if (ev.recurrence && recLabels[ev.recurrence]) {
                    recBadge.textContent = recLabels[ev.recurrence];
                    recBadge.classList.remove('hidden');
                } else {
                    recBadge.classList.add('hidden');
                }
            }

            // Videoconferencia Google Meet
            const meetContainer = document.getElementById('event-detail-meeting-container');
            const joinMeetBtn = document.getElementById('btn-event-detail-join-meet');
            const copyMeetBtn = document.getElementById('btn-event-detail-copy-meet');
            const meetText = document.getElementById('event-detail-meeting-url-text');
            if (meetContainer) {
                if (ev.meeting_url && ev.meeting_url.trim().length > 0) {
                    const url = ev.meeting_url.trim();
                    meetContainer.classList.remove('hidden');
                    if (joinMeetBtn) {
                        joinMeetBtn.onclick = (e) => {
                            e.preventDefault();
                            CalendarManager.openExternal(url);
                        };
                    }
                    if (meetText) meetText.textContent = url;
                    if (copyMeetBtn) {
                        copyMeetBtn.onclick = () => {
                            navigator.clipboard.writeText(url);
                            UI.showStickyToast('Enlace Copiado', 'Se copió el enlace al portapapeles', 'info', 2000);
                        };
                    }
                } else {
                    meetContainer.classList.add('hidden');
                }
            }

            // Ubicación / Direcciones (con URLs clickeables que abren en el navegador predeterminado)
            const locContainer = document.getElementById('event-detail-location-container');
            const locContent = document.getElementById('event-detail-location-content');
            if (locContainer && locContent) {
                if (ev.location && ev.location.trim().length > 0) {
                    locContent.innerHTML = this.formatLocationHtml(ev.location);
                    locContainer.classList.remove('hidden');
                } else {
                    locContainer.classList.add('hidden');
                    locContent.innerHTML = '';
                }
            }

            // Asistentes / Invitados
            const attContainer = document.getElementById('event-detail-attendees-container');
            const attList = document.getElementById('event-detail-attendees-list');
            const attCount = document.getElementById('event-detail-attendees-count');
            if (attContainer && attList) {
                const attendees = ev.attendees ? ev.attendees.split(',').map(s => s.trim()).filter(Boolean) : [];
                if (attendees.length > 0) {
                    attContainer.classList.remove('hidden');
                    if (attCount) attCount.textContent = `Invitados (${attendees.length})`;
                    attList.innerHTML = attendees.map(a => `
                        <div class="flex items-center gap-2 p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200">
                            <div class="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-[10px] shrink-0 uppercase">
                                ${a.charAt(0)}
                            </div>
                            <span class="truncate font-medium">${a}</span>
                        </div>
                    `).join('');
                } else {
                    attContainer.classList.add('hidden');
                    attList.innerHTML = '';
                }
            }

            // Recordatorio, Disponibilidad y Visibilidad
            const notifText = document.getElementById('event-detail-notification-text');
            const notifMap = {
                '0': 'Sin recordatorio',
                '10': '10 min antes',
                '15': '15 min antes',
                '30': '30 min antes',
                '60': '1 hora antes',
                '1440': '1 día antes'
            };
            if (notifText) {
                const mins = ev.notification_minutes !== undefined ? String(ev.notification_minutes) : '10';
                notifText.textContent = notifMap[mins] || `${mins} min antes`;
            }

            const availBadge = document.getElementById('event-detail-availability-badge');
            if (availBadge) {
                availBadge.textContent = ev.availability === 'free' ? 'Disponible' : 'Ocupado';
            }

            const visBadge = document.getElementById('event-detail-visibility-badge');
            const visMap = {
                'default': 'Predeterminada',
                'public': 'Pública',
                'private': 'Privada'
            };
            if (visBadge) {
                visBadge.textContent = visMap[ev.visibility] || 'Predeterminada';
            }

            // Descripción con URLs convertidas en enlaces seguros
            const descEl = document.getElementById('event-detail-description');
            if (descEl) {
                if (ev.description && ev.description.trim().length > 0) {
                    descEl.innerHTML = this.linkifyText(ev.description);
                } else {
                    descEl.innerHTML = '<span class="text-slate-400 dark:text-slate-500 italic">Sin notas ni descripción adicional</span>';
                }
            }

            // Correo de origen
            const originContainer = document.getElementById('event-detail-origin-container');
            const btnOrigin = document.getElementById('btn-event-detail-origin');
            if (originContainer && btnOrigin) {
                if (ev.origin_email_id) {
                    originContainer.classList.remove('hidden');
                    btnOrigin.onclick = () => {
                        UI.closeDrawer('drawer-event-detail');
                        if (window.EmailManager && typeof EmailManager.openEmailDetail === 'function') {
                            if (typeof UI.switchMainTab === 'function') {
                                UI.switchMainTab('emails');
                            }
                            EmailManager.openEmailDetail(ev.origin_email_id);
                        }
                    };
                } else {
                    originContainer.classList.add('hidden');
                    btnOrigin.onclick = null;
                }
            }

            // Botón editar dentro del detalle
            const btnEdit = document.getElementById('btn-edit-event-from-detail');
            if (btnEdit) {
                btnEdit.onclick = () => {
                    this.openEditEventModal(ev.id);
                };
            }

            // Botón eliminar dentro del detalle
            const btnDelete = document.getElementById('btn-delete-event-from-detail');
            if (btnDelete) {
                btnDelete.onclick = async () => {
                    await this.deleteEvent(ev.id);
                };
            }
        } catch (err) {
            console.error("Error al renderizar drawer de detalle de evento:", err);
        }

        // Abrir drawer lateral
        UI.openDrawer('drawer-event-detail');
    },

    toggleCalendar(calId, isChecked) {
        calId = parseInt(calId, 10);
        if (!this.activeCalendarIds) {
            this.activeCalendarIds = new Set(this.calendars.map(c => c.id));
        }

        if (isChecked) {
            this.activeCalendarIds.add(calId);
        } else {
            this.activeCalendarIds.delete(calId);
        }

        try {
            localStorage.setItem('merke_active_calendar_ids', JSON.stringify([...this.activeCalendarIds]));
        } catch (e) {}

        this.renderCalendarSourcesList();
        this.renderCalendar();
        this.renderTasks();
        this.renderUpcomingList();
    }
};

window.CalendarManager = CalendarManager;
