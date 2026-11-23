// ========================================================
// Gestor de Libreta de Contactos & Agenda de Direcciones
// Senda ContactsManager
// ========================================================

const ContactsManager = {
    contacts: [],
    filteredContacts: [],
    pendingContacts: [],
    selectedPendingIds: new Set(),
    selectedContactIds: new Set(),
    activeContact: null,
    syncTimer: null,
    activeInput: null,
    autocompleteDropdown: null,

    async init() {
        this.createAutocompleteDropdown();
        await this.loadContacts();
        this.setupAutocompleteListeners();

        // Sincronización periódica automática cada 15 minutos (900,000 ms)
        if (this.syncTimer) clearInterval(this.syncTimer);
        this.syncTimer = setInterval(() => {
            this.syncPeriodically();
        }, 15 * 60 * 1000);
    },

    openDrawer() {
        if (window.UI) UI.openDrawer('drawer-contacts');
        this.loadContacts();
    },

    async loadContacts(q = '') {
        const container = document.getElementById('contacts-list-container');
        const badge = document.getElementById('contacts-total-badge');
        const countLabel = document.getElementById('contacts-showing-count');

        try {
            const url = q ? `/api/contacts?q=${encodeURIComponent(q)}` : '/api/contacts';
            const [contactsRes, pendingRes] = await Promise.all([
                fetch(url).then(r => r.ok ? r.json() : []),
                fetch('/api/contacts/pending').then(r => r.ok ? r.json() : [])
            ]);

            const list = contactsRes || [];
            this.pendingContacts = pendingRes || [];
            if (!q) {
                this.contacts = list;
            }
            this.filteredContacts = list;

            if (badge) badge.textContent = this.contacts.length;
            if (countLabel) countLabel.textContent = `${list.length} de ${this.contacts.length}`;

            // Actualizar badge indicador en el sidebar
            this.updateSidebarPendingBadge();

            this.renderList(list, container, q);
        } catch (e) {
            console.error('Error al cargar contactos:', e);
            if (container) {
                container.innerHTML = `<p class="text-xs text-rose-500 text-center py-4">Error al cargar la libreta de contactos</p>`;
            }
        }
    },

    updateSidebarPendingBadge() {
        const badge = document.getElementById('sidebar-contacts-pending-badge');
        if (!badge) return;
        const count = this.pendingContacts ? this.pendingContacts.length : 0;
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    },

    togglePendingSelection(id, isChecked) {
        if (isChecked) {
            this.selectedPendingIds.add(id);
        } else {
            this.selectedPendingIds.delete(id);
        }
        const container = document.getElementById('contacts-list-container');
        this.renderList(this.filteredContacts, container);
    },

    toggleSelectAllPending(selectAll) {
        const currentFilteredPending = this.pendingContacts || [];
        if (selectAll) {
            currentFilteredPending.forEach(c => this.selectedPendingIds.add(c.id));
        } else {
            this.selectedPendingIds.clear();
        }
        const container = document.getElementById('contacts-list-container');
        this.renderList(this.filteredContacts, container);
    },

    toggleRegularSelection(id, isChecked) {
        if (isChecked) {
            this.selectedContactIds.add(id);
        } else {
            this.selectedContactIds.delete(id);
        }
        const container = document.getElementById('contacts-list-container');
        this.renderList(this.filteredContacts, container);
    },

    toggleSelectAllRegular(selectAll) {
        const currentRegular = this.filteredContacts || [];
        if (selectAll) {
            currentRegular.forEach(c => this.selectedContactIds.add(c.id));
        } else {
            this.selectedContactIds.clear();
        }
        const container = document.getElementById('contacts-list-container');
        this.renderList(this.filteredContacts, container);
    },

    async deleteSelectedRegularBatch() {
        const ids = [...this.selectedContactIds];
        if (ids.length === 0) return;
        const count = ids.length;

        const confirmed = await UI.confirm({
            title: count === 1 ? '¿Eliminar contacto?' : `¿Eliminar ${count} contactos?`,
            message: count === 1
                ? '¿Estás seguro de que deseas eliminar este contacto de tu libreta de direcciones? La sincronización respetará este cambio y no volverá a importarlo automáticamente.'
                : `¿Estás seguro de que deseas eliminar estos ${count} contactos seleccionados de tu libreta? La sincronización respetará este cambio y no volverá a importarlos.`,
            confirmText: count === 1 ? 'Eliminar Contacto' : `Eliminar ${count} Contactos`,
            cancelText: 'Cancelar',
            isDanger: true
        });

        if (!confirmed) return;

        try {
            const res = await fetch('/api/contacts/delete-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                ids.forEach(id => this.selectedContactIds.delete(id));
                UI.showStickyToast(
                    'Contactos Eliminados',
                    count === 1
                        ? 'El contacto ha sido eliminado de la libreta.'
                        : `${count} contactos fueron eliminados de la libreta exitosamente.`,
                    'success'
                );
                await this.loadContacts();
            } else {
                UI.showStickyToast('Error', data.detail || 'No se pudieron eliminar los contactos', 'error');
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    async confirmSinglePending(contactId) {
        await this.confirmPendingBatch([contactId]);
    },

    async confirmSelectedPending() {
        const ids = [...this.selectedPendingIds];
        if (ids.length === 0) return;
        await this.confirmPendingBatch(ids);
    },

    async confirmPendingBatch(ids) {
        try {
            const res = await fetch('/api/contacts/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids })
            });
            if (res.ok) {
                ids.forEach(id => this.selectedPendingIds.delete(id));
                UI.showStickyToast(
                    'Contacto Confirmado',
                    ids.length === 1 
                        ? 'El contacto ha sido autorizado y sincronizado en tu libreta.'
                        : `${ids.length} contactos autorizados y sincronizados en tu libreta.`,
                    'success'
                );
                await this.loadContacts();
            } else {
                UI.showStickyToast('Error', 'No se pudieron confirmar los contactos', 'error');
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    async rejectSinglePending(contactId) {
        await this.rejectPendingBatch([contactId]);
    },

    async rejectSelectedPending() {
        const ids = [...this.selectedPendingIds];
        if (ids.length === 0) return;
        await this.rejectPendingBatch(ids);
    },

    async rejectPendingBatch(ids) {
        const count = ids.length;
        const confirmed = await UI.confirm({
            title: count === 1 ? '¿Rechazar y eliminar contacto?' : `¿Rechazar y eliminar ${count} contactos?`,
            message: count === 1 
                ? '¿Estás seguro de que deseas rechazar este contacto pendiente? Se eliminará de la lista y no se sincronizará.'
                : `¿Estás seguro de que deseas rechazar estos ${count} contactos pendientes? Se eliminarán de la lista y no se sincronizarán.`,
            confirmText: 'Rechazar y Eliminar',
            cancelText: 'Cancelar',
            isDanger: true
        });

        if (!confirmed) return;

        try {
            const res = await fetch('/api/contacts/reject', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids })
            });
            if (res.ok) {
                ids.forEach(id => this.selectedPendingIds.delete(id));
                UI.showStickyToast(
                    'Contacto Rechazado',
                    count === 1 
                        ? 'El contacto fue eliminado de la lista.' 
                        : `${count} contactos fueron eliminados de la lista.`,
                    'info'
                );
                await this.loadContacts();
            } else {
                UI.showStickyToast('Error', 'No se pudieron rechazar los contactos', 'error');
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    renderList(list, container, q = '') {
        if (!container) return;

        // Renderizar sección superior de contactos pendientes si existen
        let pendingSectionHtml = '';
        const pendingList = this.pendingContacts || [];
        const pendingToShow = q 
            ? pendingList.filter(c => (c.name || '').toLowerCase().includes(q.toLowerCase()) || (c.email || '').toLowerCase().includes(q.toLowerCase()))
            : pendingList;

        if (pendingToShow.length > 0) {
            const allSelected = pendingToShow.length > 0 && pendingToShow.every(c => this.selectedPendingIds.has(c.id));
            const selectedCount = [...this.selectedPendingIds].filter(id => pendingToShow.some(c => c.id === id)).length;

            const pendingItemsHtml = pendingToShow.map(c => {
                const isChecked = this.selectedPendingIds.has(c.id);
                const initial = (c.name || c.email).charAt(0).toUpperCase();
                const displayName = c.name || c.email.split('@')[0];
                const escapedEmail = EmailManager.escapeHtml(c.email);
                const escapedName = EmailManager.escapeHtml(displayName);

                const avatarHtml = (window.AvatarService)
                    ? AvatarService.render(c.email, displayName, 'w-8 h-8 text-xs', 'shadow-2xs ring-2 ring-amber-400/80', c.account_color, c.avatar_url)
                    : `<div class="w-8 h-8 rounded-full bg-amber-500 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">${initial}</div>`;

                return `
                    <div class="p-2.5 rounded-xl bg-white dark:bg-slate-800/90 border border-amber-200/90 dark:border-amber-700/60 shadow-2xs flex items-center justify-between gap-2.5 transition-all hover:border-amber-400">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="ContactsManager.togglePendingSelection(${c.id}, this.checked)" class="rounded border-amber-400 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5 cursor-pointer shrink-0">
                            ${avatarHtml}
                            <div class="min-w-0">
                                <div class="flex items-center gap-1.5 flex-wrap">
                                    <span class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">${escapedName}</span>
                                    <span class="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800/60 shrink-0">No sincronizado</span>
                                </div>
                                <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono">${escapedEmail}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0" onclick="event.stopPropagation()">
                            <button type="button" onclick="ContactsManager.confirmSinglePending(${c.id})" class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs" title="Autorizar y sincronizar contacto">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                                <span>Aceptar</span>
                            </button>
                            <button type="button" onclick="ContactsManager.rejectSinglePending(${c.id})" class="p-1 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 transition-colors cursor-pointer" title="Rechazar y eliminar contacto">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            pendingSectionHtml = `
                <div id="pending-contacts-section" class="mb-3 p-3 rounded-2xl bg-gradient-to-b from-amber-500/10 to-amber-500/5 dark:from-amber-950/40 dark:to-amber-950/20 border border-amber-300/80 dark:border-amber-600/40 shadow-xs space-y-2.5">
                    <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-2 min-w-0">
                            <div class="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
                            </div>
                            <div>
                                <h4 class="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                    <span>Nuevos contactos detectados</span>
                                    <span class="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">${pendingToShow.length}</span>
                                </h4>
                                <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Detectados al responder o enviar. No se sincronizan hasta autorizarlos.</p>
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center justify-between gap-2 pt-1 border-t border-amber-200/60 dark:border-amber-800/40 flex-wrap">
                        <label class="inline-flex items-center gap-1.5 cursor-pointer text-[11px] font-medium text-slate-700 dark:text-slate-300 select-none">
                            <input type="checkbox" ${allSelected ? 'checked' : ''} onchange="ContactsManager.toggleSelectAllPending(this.checked)" class="rounded border-amber-400 text-amber-600 focus:ring-amber-500 w-3.5 h-3.5">
                            <span>Seleccionar todos</span>
                        </label>
                        <div class="flex items-center gap-1.5">
                            <button type="button" onclick="ContactsManager.confirmSelectedPending()" ${selectedCount === 0 ? 'disabled' : ''} class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-2xs flex items-center gap-1 transition-all cursor-pointer">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                                <span>Autorizar (${selectedCount})</span>
                            </button>
                            <button type="button" onclick="ContactsManager.rejectSelectedPending()" ${selectedCount === 0 ? 'disabled' : ''} class="px-2 py-1 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-2xs flex items-center gap-1 transition-all cursor-pointer">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                <span>Rechazar</span>
                            </button>
                        </div>
                    </div>

                    <div class="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                        ${pendingItemsHtml}
                    </div>
                </div>
            `;
        }

        if (!list || list.length === 0) {
            container.innerHTML = pendingSectionHtml + `
                <div class="text-center py-10 px-4 text-slate-400 space-y-2">
                    <svg class="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    <p class="text-xs font-medium">No se encontraron contactos</p>
                    <p class="text-[11px] text-slate-400">Presiona el botón de sincronizar para extraer contactos de tus correos.</p>
                </div>
            `;
            return;
        }

        const allRegularSelected = list.length > 0 && list.every(c => this.selectedContactIds.has(c.id));
        const selectedRegularCount = [...this.selectedContactIds].filter(id => list.some(c => c.id === id)).length;

        const regularHeaderHtml = `
            <div class="flex items-center justify-between gap-2 px-1 py-1.5 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                <label class="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" ${allRegularSelected ? 'checked' : ''} onchange="ContactsManager.toggleSelectAllRegular(this.checked)" class="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer">
                    <span class="font-medium text-slate-700 dark:text-slate-300">Seleccionar todos</span>
                </label>
                ${selectedRegularCount > 0 ? `
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">${selectedRegularCount} seleccionado${selectedRegularCount > 1 ? 's' : ''}</span>
                        <button type="button" onclick="ContactsManager.deleteSelectedRegularBatch()" class="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold transition-all cursor-pointer shadow-2xs" title="Eliminar contactos seleccionados">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            <span>Eliminar (${selectedRegularCount})</span>
                        </button>
                    </div>
                ` : `
                    <span class="text-[10px] text-slate-400">${list.length} contacto${list.length > 1 ? 's' : ''}</span>
                `}
            </div>
        `;

        const regularListHtml = list.map(c => {
            const isRegularChecked = this.selectedContactIds.has(c.id);
            const initial = (c.name || c.email).charAt(0).toUpperCase();
            const displayName = c.name || c.email.split('@')[0];
            const escapedEmail = EmailManager.escapeHtml(c.email);
            const escapedName = EmailManager.escapeHtml(displayName);
            const subInfo = c.company || c.job_title || escapedEmail;

            const avatarHtml = (window.AvatarService)
                ? AvatarService.render(c.email, displayName, 'w-9 h-9 text-xs', 'shadow-2xs', c.account_color, c.avatar_url)
                : `<div class="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">${initial}</div>`;

            const accountBadgeHtml = c.account_name ? `
                <span class="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-semibold shrink-0" style="background-color: ${c.account_color ? c.account_color + '18' : '#e0e7ff'}; color: ${c.account_color || '#4f46e5'}; border: 1px solid ${c.account_color ? c.account_color + '33' : '#c7d2fe'};">
                    <span class="w-1.5 h-1.5 rounded-full mr-1 shrink-0" style="background-color: ${c.account_color || '#4f46e5'};"></span>
                    ${EmailManager.escapeHtml(c.account_name)}
                </span>
            ` : '';

            return `
                <div onclick="ContactsManager.openContactDetail(${c.id})" class="group p-2.5 rounded-xl bg-white dark:bg-slate-800/80 hover:bg-indigo-50/60 dark:hover:bg-slate-750 border ${isRegularChecked ? 'border-indigo-400 ring-1 ring-indigo-400/50' : 'border-slate-200/80 dark:border-slate-700/60'} transition-all flex items-center justify-between gap-3 shadow-2xs hover:shadow-xs cursor-pointer">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <div onclick="event.stopPropagation()" class="flex items-center shrink-0">
                            <input type="checkbox" ${isRegularChecked ? 'checked' : ''} onchange="ContactsManager.toggleRegularSelection(${c.id}, this.checked)" class="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer">
                        </div>
                        ${avatarHtml}
                        <div class="min-w-0">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <p class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">${escapedName}</p>
                                ${accountBadgeHtml}
                            </div>
                            <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono">${subInfo}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-1 shrink-0 opacity-90 group-hover:opacity-100 transition-opacity" onclick="event.stopPropagation()">
                        <button type="button" onclick="ContactsManager.openContactDetail(${c.id})" class="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer" title="Ver ficha y editar contacto">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                        </button>
                        <button type="button" onclick="ContactsManager.composeTo('${escapedEmail}', '${escapedName}')" class="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-400 transition-colors cursor-pointer" title="Redactar correo a ${escapedName}">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                        </button>
                        <button type="button" onclick="ContactsManager.copyEmail('${escapedEmail}')" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer" title="Copiar correo">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = pendingSectionHtml + regularHeaderHtml + regularListHtml;
    },

    async openContactDetail(contactId) {
        try {
            const res = await fetch(`/api/contacts/${contactId}`);
            if (!res.ok) {
                UI.showStickyToast('Error', 'No se pudo cargar la información del contacto', 'error');
                return;
            }
            const contact = await res.json();
            this.activeContact = contact;

            const initial = (contact.name || contact.email).charAt(0).toUpperCase();
            const displayName = contact.name || contact.email.split('@')[0];

            // 1. Cabecera Modal
            const avatarEl = document.getElementById('contact-modal-avatar');
            if (avatarEl) {
                if (window.AvatarService) {
                    avatarEl.className = 'w-12 h-12 rounded-full shrink-0 flex items-center justify-center overflow-hidden';
                    avatarEl.style.boxShadow = '';
                    avatarEl.innerHTML = AvatarService.render(contact.email, displayName, 'w-12 h-12 text-base', 'shadow-md', contact.account_color, contact.avatar_url);
                } else {
                    avatarEl.textContent = initial;
                }
            }

            const nameEl = document.getElementById('contact-modal-display-name');
            if (nameEl) nameEl.textContent = displayName;

            const emailEl = document.getElementById('contact-modal-display-email');
            if (emailEl) emailEl.textContent = contact.email;

            const sourceBadge = document.getElementById('contact-modal-source-badge');
            if (sourceBadge) {
                if (contact.is_customized) {
                    sourceBadge.textContent = 'Editado / Personalizado';
                    sourceBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 shrink-0';
                } else if (contact.source === 'manual') {
                    sourceBadge.textContent = 'Manual';
                    sourceBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 shrink-0';
                } else {
                    sourceBadge.textContent = 'Sincronizado';
                    sourceBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60 shrink-0';
                }
            }

            // 2. Panel de Vista
            const phoneEl = document.getElementById('contact-view-phone');
            const btnCopyPhone = document.getElementById('btn-copy-contact-phone');
            if (phoneEl) {
                phoneEl.textContent = contact.phone || 'No registrado';
                if (btnCopyPhone) {
                    btnCopyPhone.classList.toggle('hidden', !contact.phone);
                    btnCopyPhone.onclick = () => {
                        navigator.clipboard.writeText(contact.phone);
                        UI.showStickyToast('Copiado', 'Teléfono copiado al portapapeles', 'info', 2000);
                    };
                }
            }

            const compEl = document.getElementById('contact-view-company');
            if (compEl) compEl.textContent = contact.company || 'Sin especificar';

            const jobEl = document.getElementById('contact-view-job-title');
            if (jobEl) jobEl.textContent = contact.job_title || 'Sin especificar';

            const accEl = document.getElementById('contact-view-account');
            if (accEl) {
                if (contact.account_name) {
                    accEl.innerHTML = `
                        <span class="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                            <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${contact.account_color || '#4f46e5'};"></span>
                            <span>${EmailManager.escapeHtml(contact.account_name)}</span>
                            <span class="text-xs text-slate-400 font-mono">(${EmailManager.escapeHtml(contact.account_email || contact.account_provider)})</span>
                        </span>
                    `;
                } else {
                    accEl.textContent = 'Todas las cuentas';
                }
            }

            const addrEl = document.getElementById('contact-view-address');
            if (addrEl) addrEl.textContent = contact.address || 'Sin dirección registrada';

            const notesEl = document.getElementById('contact-view-notes');
            if (notesEl) notesEl.textContent = contact.notes || 'Sin notas registradas';

            const intEl = document.getElementById('contact-view-interactions');
            if (intEl) intEl.textContent = `${contact.interaction_count || 1} correos / citas`;

            const lastEl = document.getElementById('contact-view-last-contact');
            if (lastEl) {
                if (contact.last_interacted_at) {
                    try {
                        const d = new Date(contact.last_interacted_at);
                        lastEl.textContent = isNaN(d.getTime()) ? contact.last_interacted_at : d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
                    } catch {
                        lastEl.textContent = contact.last_interacted_at;
                    }
                } else {
                    lastEl.textContent = 'Reciente';
                }
            }

            // 3. Poblar formulario de edición
            document.getElementById('contact-edit-id').value = contact.id;
            document.getElementById('contact-edit-name').value = contact.name || '';
            document.getElementById('contact-edit-email').value = contact.email || '';
            document.getElementById('contact-edit-phone').value = contact.phone || '';
            document.getElementById('contact-edit-company').value = contact.company || '';
            document.getElementById('contact-edit-job-title').value = contact.job_title || '';
            document.getElementById('contact-edit-address').value = contact.address || '';
            document.getElementById('contact-edit-notes').value = contact.notes || '';

            // Mostrar pestaña "Información Completa"
            this.switchModalTab('view');

            const modal = document.getElementById('modal-contact-detail');
            if (modal) modal.classList.remove('hidden');
        } catch (e) {
            console.error('Error abriendo detalle de contacto:', e);
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    openNewContactModal() {
        this.activeContact = null;

        const avatarEl = document.getElementById('contact-modal-avatar');
        if (avatarEl) {
            avatarEl.className = 'w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-bold text-lg flex items-center justify-center shrink-0 shadow-md ring-2 ring-indigo-500/20';
            avatarEl.innerHTML = '+';
        }

        const nameEl = document.getElementById('contact-modal-display-name');
        if (nameEl) nameEl.textContent = 'Nuevo Contacto';

        const emailEl = document.getElementById('contact-modal-display-email');
        if (emailEl) emailEl.textContent = 'Ingresa los datos para registrarlo en tu libreta';

        const sourceBadge = document.getElementById('contact-modal-source-badge');
        if (sourceBadge) {
            sourceBadge.textContent = 'Creación Manual';
            sourceBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 shrink-0';
        }

        // Limpiar inputs
        document.getElementById('contact-edit-id').value = '';
        document.getElementById('contact-edit-name').value = '';
        document.getElementById('contact-edit-email').value = '';
        document.getElementById('contact-edit-phone').value = '';
        document.getElementById('contact-edit-company').value = '';
        document.getElementById('contact-edit-job-title').value = '';
        document.getElementById('contact-edit-address').value = '';
        document.getElementById('contact-edit-notes').value = '';

        // Cambiar a la pestaña de edición directamente
        this.switchModalTab('edit');

        const modal = document.getElementById('modal-contact-detail');
        if (modal) modal.classList.remove('hidden');
    },

    switchModalTab(mode) {
        const btnView = document.getElementById('btn-contact-tab-view');
        const btnEdit = document.getElementById('btn-contact-tab-edit');
        const viewPanel = document.getElementById('contact-modal-view-panel');
        const editPanel = document.getElementById('contact-modal-edit-panel');

        if (mode === 'view') {
            if (btnView) {
                btnView.className = 'flex-1 py-1.5 rounded-lg bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs transition-all cursor-pointer font-semibold';
            }
            if (btnEdit) {
                btnEdit.className = 'flex-1 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer font-medium';
            }
            if (viewPanel) viewPanel.classList.remove('hidden');
            if (editPanel) editPanel.classList.add('hidden');
        } else {
            if (btnEdit) {
                btnEdit.className = 'flex-1 py-1.5 rounded-lg bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs transition-all cursor-pointer font-semibold';
            }
            if (btnView) {
                btnView.className = 'flex-1 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer font-medium';
            }
            if (viewPanel) viewPanel.classList.add('hidden');
            if (editPanel) editPanel.classList.remove('hidden');
            setTimeout(() => {
                const nameInput = document.getElementById('contact-edit-name');
                if (nameInput) nameInput.focus();
            }, 60);
        }
    },

    async saveContactEdit(e) {
        if (e) e.preventDefault();
        const contactId = document.getElementById('contact-edit-id').value;
        const name = document.getElementById('contact-edit-name').value.trim();
        const email = document.getElementById('contact-edit-email').value.trim();
        const phone = document.getElementById('contact-edit-phone').value.trim();
        const company = document.getElementById('contact-edit-company').value.trim();
        const jobTitle = document.getElementById('contact-edit-job-title').value.trim();
        const address = document.getElementById('contact-edit-address').value.trim();
        const notes = document.getElementById('contact-edit-notes').value.trim();

        if (!email) {
            UI.showStickyToast('Correo requerido', 'Debes ingresar un correo electrónico válido', 'warning');
            return;
        }

        try {
            if (contactId) {
                // Actualizar contacto existente
                const res = await fetch(`/api/contacts/${contactId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: name,
                        email: email,
                        phone: phone,
                        company: company,
                        job_title: jobTitle,
                        address: address,
                        notes: notes
                    })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    UI.showStickyToast('Contacto Actualizado', `Se guardaron los datos de "${name || email}"`, 'success');
                    await this.loadContacts();
                    this.openContactDetail(contactId);
                } else {
                    UI.showStickyToast('Error al actualizar', data.detail || 'No se pudo guardar la información', 'error');
                }
            } else {
                // Crear nuevo contacto manual
                const res = await fetch('/api/contacts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: name,
                        email: email,
                        phone: phone,
                        company: company,
                        job_title: jobTitle,
                        address: address,
                        notes: notes
                    })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    UI.showStickyToast('Contacto Creado', `"${name || email}" fue agregado a tu libreta`, 'success');
                    await this.loadContacts();
                    this.openContactDetail(data.id);
                } else {
                    UI.showStickyToast('Error al crear', data.detail || 'No se pudo crear el contacto', 'error');
                }
            }
        } catch (err) {
            UI.showStickyToast('Error', err.message, 'error');
        }
    },

    async deleteActiveContact() {
        if (!this.activeContact) return;
        const c = this.activeContact;

        const confirmed = await UI.confirm({
            title: '¿Eliminar contacto?',
            message: `¿Estás seguro de que deseas eliminar a "${c.name || c.email}" de tu libreta de direcciones? La sincronización respetará este cambio y no volverá a importarlo automáticamente.`,
            confirmText: 'Eliminar Contacto',
            cancelText: 'Cancelar',
            isDanger: true
        });

        if (!confirmed) return;

        try {
            const res = await fetch(`/api/contacts/${c.id}`, { method: 'DELETE' });
            if (res.ok) {
                UI.showStickyToast('Contacto Eliminado', `"${c.name || c.email}" ha sido eliminado`, 'info');
                this.closeModal();
                await this.loadContacts();
            } else {
                const data = await res.json();
                UI.showStickyToast('Error', data.detail || 'No se pudo eliminar el contacto', 'error');
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    composeToActiveContact() {
        if (!this.activeContact) return;
        const c = this.activeContact;
        this.closeModal();
        this.composeTo(c.email, c.name || '');
    },

    copyActiveContactEmail() {
        if (!this.activeContact) return;
        this.copyEmail(this.activeContact.email);
    },

    closeModal() {
        const modal = document.getElementById('modal-contact-detail');
        if (modal) modal.classList.add('hidden');
        this.activeContact = null;
    },

    filterContacts(val) {
        const query = (val || '').toLowerCase().trim();
        const clearBtn = document.getElementById('btn-contacts-clear-search');
        if (clearBtn) {
            clearBtn.classList.toggle('hidden', !query);
        }
        this.loadContacts(query);
    },

    clearSearch() {
        const input = document.getElementById('contacts-search-input');
        if (input) {
            input.value = '';
            this.filterContacts('');
        }
    },

    isSyncing: false,

    async syncNow(btnEl) {
        if (this.isSyncing) return;
        this.isSyncing = true;

        const targetBtn = btnEl || document.getElementById('btn-sync-contacts');
        const icon = targetBtn ? targetBtn.querySelector('svg') : null;
        if (targetBtn) targetBtn.disabled = true;
        if (icon) icon.classList.add('animate-spin', 'text-indigo-600', 'dark:text-indigo-400');

        const allSyncIcons = document.querySelectorAll('#btn-sync-contacts svg, #btn-sync-other-apps svg, #btn-global-sync svg');
        allSyncIcons.forEach(ic => ic.classList.add('animate-spin'));

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);

            const res = await fetch('/api/contacts/sync', { 
                method: 'POST',
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data.success) {
                await this.loadContacts();
                const syncLabel = document.getElementById('contacts-last-sync-label');
                if (syncLabel) {
                    syncLabel.textContent = `Sincronizado: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                }
                const count = data.total_contacts !== undefined ? data.total_contacts : (data.synced_count || 0);
                UI.showStickyToast('Contactos Sincronizados', `Se sincronizaron ${count} contactos respetando tus ediciones y eliminaciones`, 'success', 3000);
            } else {
                UI.showStickyToast('Aviso', data.error || 'No se pudieron sincronizar los contactos', 'warning', 3000);
            }
        } catch (e) {
            console.error('Error sincronizando contactos:', e);
            UI.showStickyToast('Error', 'No se pudo sincronizar la libreta de contactos', 'error');
        } finally {
            this.isSyncing = false;
            if (targetBtn) targetBtn.disabled = false;
            setTimeout(() => {
                if (icon) icon.classList.remove('animate-spin', 'text-indigo-600', 'dark:text-indigo-400');
                allSyncIcons.forEach(ic => ic.classList.remove('animate-spin'));
            }, 600);
        }
    },

    async syncPeriodically() {
        try {
            const res = await fetch('/api/contacts/sync', { method: 'POST' });
            if (res.ok) {
                await this.loadContacts();
            }
        } catch (e) {
            console.warn('[Contacts] Fallo en sincronización en segundo plano:', e);
        }
    },

    composeTo(email, name = '') {
        if (window.UI) UI.closeDrawer('drawer-contacts');
        if (window.UI) UI.openComposeModal();

        const toInput = document.getElementById('compose-to');
        if (toInput) {
            toInput.value = name && name !== email ? `${name} <${email}>` : email;
            toInput.dispatchEvent(new Event('input', { bubbles: true }));
        }

        const subjectInput = document.getElementById('compose-subject');
        if (subjectInput) subjectInput.focus();
    },

    copyEmail(email) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(email).then(() => {
                UI.showStickyToast('Copiado', `${email} copiado al portapapeles`, 'info', 2000);
            });
        }
    },

    // --- AUTOCOMPLETADO EN REDACTAR / RESPONDER / REENVIAR ---

    createAutocompleteDropdown() {
        let el = document.getElementById('contacts-autocomplete-dropdown');
        if (!el) {
            el = document.createElement('div');
            el.id = 'contacts-autocomplete-dropdown';
            el.className = 'fixed hidden z-[100] max-h-56 w-72 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 text-xs backdrop-blur-md';
            document.body.appendChild(el);
            this.autocompleteDropdown = el;
        } else {
            this.autocompleteDropdown = el;
        }

        // Cerrar al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (this.autocompleteDropdown && !this.autocompleteDropdown.contains(e.target) && e.target !== this.activeInput) {
                this.hideAutocomplete();
            }
        });
    },

    setupAutocompleteListeners() {
        const inputIds = ['compose-to', 'compose-cc', 'compose-bcc'];
        inputIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;

            el.addEventListener('input', (e) => this.handleAutocompleteInput(e.target));
            el.addEventListener('focus', (e) => this.handleAutocompleteInput(e.target));
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') this.hideAutocomplete();
            });
        });
    },

    handleAutocompleteInput(inputEl) {
        this.activeInput = inputEl;
        const val = inputEl.value || '';
        const parts = val.split(',');
        const query = parts[parts.length - 1].trim().toLowerCase();

        if (query.length < 1) {
            this.hideAutocomplete();
            return;
        }

        const matches = this.contacts.filter(c => 
            (c.name && c.name.toLowerCase().includes(query)) ||
            (c.email && c.email.toLowerCase().includes(query)) ||
            (c.company && c.company.toLowerCase().includes(query))
        ).slice(0, 6);

        if (matches.length === 0) {
            this.hideAutocomplete();
            return;
        }

        this.renderAutocompleteMatches(matches, inputEl);
    },

    renderAutocompleteMatches(matches, inputEl) {
        if (!this.autocompleteDropdown) return;

        const rect = inputEl.getBoundingClientRect();
        this.autocompleteDropdown.style.left = `${rect.left}px`;
        this.autocompleteDropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
        this.autocompleteDropdown.style.width = `${Math.max(rect.width, 280)}px`;

        this.autocompleteDropdown.innerHTML = matches.map(c => {
            const initial = (c.name || c.email).charAt(0).toUpperCase();
            const displayName = c.name || c.email.split('@')[0];
            const escapedEmail = EmailManager.escapeHtml(c.email);
            const escapedName = EmailManager.escapeHtml(displayName);
            const avatarHtml = window.AvatarService
                ? AvatarService.render(c.email, displayName, 'w-6 h-6 text-[10px]', '', c.account_color, c.avatar_url)
                : `<span class="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0">${initial}</span>`;

            return `
                <div onclick="ContactsManager.selectContactAutocomplete('${c.email}', '${displayName.replace(/'/g, "\\'")}')" class="px-3 py-2 hover:bg-indigo-50 dark:hover:bg-slate-750 flex items-center justify-between gap-2 cursor-pointer transition-colors">
                    <div class="flex items-center gap-2 min-w-0">
                        ${avatarHtml}
                        <div class="min-w-0">
                            <p class="font-bold text-slate-800 dark:text-slate-100 truncate text-[11px] leading-tight">${escapedName}</p>
                            <p class="text-[10px] text-slate-400 truncate leading-tight font-mono">${escapedEmail}</p>
                        </div>
                    </div>
                    <span class="text-[9px] text-indigo-500 font-semibold px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 shrink-0">Elegir</span>
                </div>
            `;
        }).join('');

        this.autocompleteDropdown.classList.remove('hidden');
    },

    selectContactAutocomplete(email, name) {
        if (!this.activeInput) return;

        const val = this.activeInput.value || '';
        const parts = val.split(',');
        parts.pop(); // Remover el fragmento incompleto

        const formatted = name && name !== email ? `${name} <${email}>` : email;
        parts.push(parts.length > 0 ? ` ${formatted}` : formatted);

        this.activeInput.value = parts.join(',') + ', ';
        this.activeInput.focus();
        this.hideAutocomplete();
    },

    hideAutocomplete() {
        if (this.autocompleteDropdown) {
            this.autocompleteDropdown.classList.add('hidden');
        }
    }
};

window.ContactsManager = ContactsManager;
