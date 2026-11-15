// ========================================================
// Gestor de Libreta de Contactos & Agenda de Direcciones
// MerkeMail ContactsManager
// ========================================================

const ContactsManager = {
    contacts: [],
    filteredContacts: [],
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
            const res = await fetch(url);
            if (!res.ok) return;

            const list = await res.json();
            if (!q) {
                this.contacts = list;
            }
            this.filteredContacts = list;

            if (badge) badge.textContent = this.contacts.length;
            if (countLabel) countLabel.textContent = `${list.length} de ${this.contacts.length}`;

            this.renderList(list, container);
        } catch (e) {
            console.error('Error al cargar contactos:', e);
            if (container) {
                container.innerHTML = `<p class="text-xs text-rose-500 text-center py-4">Error al cargar la libreta de contactos</p>`;
            }
        }
    },

    renderList(list, container) {
        if (!container) return;

        if (!list || list.length === 0) {
            container.innerHTML = `
                <div class="text-center py-10 px-4 text-slate-400 space-y-2">
                    <svg class="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    <p class="text-xs font-medium">No se encontraron contactos</p>
                    <p class="text-[11px] text-slate-400">Presiona el botón de sincronizar para extraer contactos de tus correos.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = list.map(c => {
            const initial = (c.name || c.email).charAt(0).toUpperCase();
            const displayName = c.name || c.email.split('@')[0];
            const escapedEmail = EmailManager.escapeHtml(c.email);
            const escapedName = EmailManager.escapeHtml(displayName);

            return `
                <div class="group p-2.5 rounded-xl bg-white dark:bg-slate-800/80 hover:bg-indigo-50/60 dark:hover:bg-slate-750 border border-slate-200/80 dark:border-slate-700/60 transition-all flex items-center justify-between gap-3 shadow-2xs hover:shadow-xs">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                            ${initial}
                        </div>
                        <div class="min-w-0">
                            <p class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">${escapedName}</p>
                            <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono">${escapedEmail}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-1 shrink-0 opacity-90 group-hover:opacity-100 transition-opacity">
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

    async syncNow() {
        const btn = document.getElementById('btn-sync-contacts');
        if (btn) {
            btn.classList.add('animate-spin', 'text-indigo-600');
        }

        try {
            const res = await fetch('/api/contacts/sync', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                await this.loadContacts();
                const syncLabel = document.getElementById('contacts-last-sync-label');
                if (syncLabel) {
                    syncLabel.textContent = `Sincronizado: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                }
                UI.showStickyToast('Contactos Sincronizados', `Se actualizaron ${data.total_contacts} contactos en tu libreta`, 'success', 3000);
            }
        } catch (e) {
            UI.showStickyToast('Error', 'No se pudo sincronizar la libreta de contactos', 'error');
        } finally {
            if (btn) {
                btn.classList.remove('animate-spin', 'text-indigo-600');
            }
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
        // Obtener el fragmento después de la última coma si se introducen varios correos
        const parts = val.split(',');
        const query = parts[parts.length - 1].trim().toLowerCase();

        if (query.length < 1) {
            this.hideAutocomplete();
            return;
        }

        const matches = this.contacts.filter(c => 
            (c.name && c.name.toLowerCase().includes(query)) ||
            (c.email && c.email.toLowerCase().includes(query))
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

            return `
                <div onclick="ContactsManager.selectContactAutocomplete('${c.email}', '${displayName.replace(/'/g, "\\'")}')" class="px-3 py-2 hover:bg-indigo-50 dark:hover:bg-slate-750 flex items-center justify-between gap-2 cursor-pointer transition-colors">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                            ${initial}
                        </span>
                        <div class="min-w-0">
                            <p class="font-bold text-slate-800 dark:text-slate-100 truncate text-[11px] leading-tight">${escapedName}</p>
                            <p class="text-[10px] text-slate-400 truncate leading-tight">${escapedEmail}</p>
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
        parts.pop(); // Remover el texto parcial que se estaba escribiendo

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
