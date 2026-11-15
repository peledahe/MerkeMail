// Módulo de Calendario Unificado (Google + Proton) - MerkeMail

const CalendarManager = {
    currentDate: new Date(),
    events: [],
    calendars: [],

    async init() {
        await this.loadCalendars();
        await this.loadEvents();
        this.renderCalendar();
    },

    async loadCalendars() {
        try {
            const res = await fetch('/api/calendars');
            this.calendars = await res.json();
            const listEl = document.getElementById('calendar-sources-list');
            const selectEl = document.getElementById('event-calendar-select');

            if (listEl) {
                listEl.innerHTML = this.calendars.map(c => `
                    <label class="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                        <input type="checkbox" checked class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" onchange="CalendarManager.toggleCalendar(${c.id})">
                        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${c.color}"></span>
                        <span class="font-medium">${c.name}</span>
                    </label>
                `).join('');
            }

            if (selectEl) {
                selectEl.innerHTML = this.calendars.map(c => `
                    <option value="${c.id}">${c.name} (${c.provider})</option>
                `).join('');
            }
        } catch (e) {
            console.error("Error cargando calendarios:", e);
        }
    },

    async loadEvents() {
        try {
            const res = await fetch('/api/events');
            this.events = await res.json();
            this.renderCalendar();
            this.renderUpcomingList();
        } catch (e) {
            console.error("Error cargando eventos:", e);
        }
    },

    renderCalendar() {
        const grid = document.getElementById('calendar-days-grid');
        const monthYearTitle = document.getElementById('calendar-month-year');
        if (!grid || !monthYearTitle) return;

        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        monthYearTitle.textContent = `${monthNames[month]} ${year}`;

        // Primer día del mes y total de días
        const firstDay = new Date(year, month, 1).getDay(); // 0 es Domingo
        // Ajustar a Lunes = 0
        const startingDay = (firstDay === 0 ? 6 : firstDay - 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        let html = '';

        // Días vacíos previos
        for (let i = 0; i < startingDay; i++) {
            html += `<div class="min-h-[85px] bg-slate-50/40 dark:bg-slate-900/30 border border-slate-100 dark:border-slate-800/60 p-1.5 opacity-40"></div>`;
        }

        // Días del mes
        const today = new Date();
        for (let day = 1; day <= daysInMonth; day++) {
            const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // Eventos de este día
            const dayEvents = this.events.filter(e => e.start_time.startsWith(dateStr));

            html += `
                <div class="min-h-[85px] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 p-1.5 flex flex-col justify-between group hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-semibold ${isToday ? 'w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center' : 'text-slate-700 dark:text-slate-300'}">
                            ${day}
                        </span>
                        <button onclick="CalendarManager.openNewEventModal('${dateStr}')" class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-opacity p-0.5">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                        </button>
                    </div>
                    <div class="space-y-1 flex-1 overflow-y-auto max-h-[60px]">
                        ${dayEvents.map(ev => `
                            <div onclick="CalendarManager.viewEventDetail(${ev.id})" class="text-[10px] px-1.5 py-0.5 rounded truncate font-medium text-white cursor-pointer hover:opacity-90 shadow-2xs" style="background-color: ${ev.calendar_color || '#4f46e5'}" title="${ev.title} (${ev.calendar_name})">
                                ${ev.title}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        grid.innerHTML = html;
    },

    renderUpcomingList() {
        const listEl = document.getElementById('upcoming-events-list');
        if (!listEl) return;

        if (this.events.length === 0) {
            listEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">No hay eventos programados</p>`;
            return;
        }

        listEl.innerHTML = this.events.slice(0, 5).map(ev => {
            const date = new Date(ev.start_time);
            return `
                <div class="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-start justify-between gap-2 shadow-2xs">
                    <div class="flex items-start gap-2.5">
                        <span class="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style="background-color: ${ev.calendar_color}"></span>
                        <div>
                            <h5 class="text-xs font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">${ev.title}</h5>
                            <p class="text-[11px] text-slate-500 dark:text-slate-400">${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} &bull; ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                            ${ev.location ? `<p class="text-[10px] text-slate-400 truncate mt-0.5">${ev.location}</p>` : ''}
                        </div>
                    </div>
                    <button onclick="CalendarManager.deleteEvent(${ev.id})" class="text-slate-400 hover:text-rose-500 p-1 transition-colors" title="Eliminar evento">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            `;
        }).join('');
    },

    prevMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        this.renderCalendar();
    },

    nextMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        this.renderCalendar();
    },

    openNewEventModal(dateStr = '') {
        const modal = document.getElementById('new-event-modal');
        const startInput = document.getElementById('event-start-time');
        const endInput = document.getElementById('event-end-time');

        const defaultDate = dateStr || new Date().toISOString().split('T')[0];
        if (startInput) startInput.value = `${defaultDate}T10:00`;
        if (endInput) endInput.value = `${defaultDate}T11:00`;

        modal.classList.remove('hidden');
    },

    async saveEvent(e) {
        e.preventDefault();
        const calId = document.getElementById('event-calendar-select').value;
        const title = document.getElementById('event-title').value;
        const start = document.getElementById('event-start-time').value;
        const end = document.getElementById('event-end-time').value;
        const location = document.getElementById('event-location').value;
        const description = document.getElementById('event-description').value;

        try {
            const res = await fetch('/api/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    calendar_id: parseInt(calId),
                    title,
                    start_time: start,
                    end_time: end,
                    location,
                    description
                })
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('new-event-modal').classList.add('hidden');
                document.getElementById('new-event-form').reset();
                UI.showStickyToast('Evento Guardado', `"${title}" ha sido añadido a tu calendario`, 'success');
                await this.loadEvents();
            }
        } catch (err) {
            UI.showStickyToast('Error', err.message, 'error');
        }
    },

    async deleteEvent(eventId) {
        const confirmed = await UI.confirm({
            title: '¿Eliminar evento?',
            message: '¿Estás seguro de eliminar este evento del calendario? Esta acción no se puede deshacer.',
            confirmText: 'Eliminar evento',
            isDanger: true
        });

        if (!confirmed) return;

        try {
            const res = await fetch(`/api/events/${eventId}`, { method: 'DELETE' });
            if (res.ok) {
                UI.showStickyToast('Evento Eliminado', 'El evento ha sido removido del calendario', 'success');
                await this.loadEvents();
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    viewEventDetail(eventId) {
        const ev = this.events.find(e => e.id === eventId);
        if (!ev) return;
        UI.showStickyToast(ev.title, `${ev.calendar_name} | ${ev.location || 'Sin ubicación'} | ${new Date(ev.start_time).toLocaleString()}`, 'info', 5000);
    }
};

window.CalendarManager = CalendarManager;
