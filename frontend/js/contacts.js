// ========================================================
// Gestor de Libreta de Contactos & Agenda de Direcciones
// MerkeMail ContactsManager
// ========================================================

const ContactsManager = {
    contacts: [],
    filteredContacts: [],
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
            const subInfo = c.company || c.job_title || escapedEmail;

            return `
                <div onclick="ContactsManager.openContactDetail(${c.id})" class="group p-2.5 rounded-xl bg-white dark:bg-slate-800/80 hover:bg-indigo-50/60 dark:hover:bg-slate-750 border border-slate-200/80 dark:border-slate-700/60 transition-all flex items-center justify-between gap-3 shadow-2xs hover:shadow-xs cursor-pointer">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                            ${initial}
                        </div>
                        <div class="min-w-0">
                            <p class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">${escapedName}</p>
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
            if (avatarEl) avatarEl.textContent = initial;

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
                accEl.textContent = contact.account_name ? `${contact.account_name} (${contact.account_email || contact.account_provider})` : 'Todas las cuentas';
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
        if (avatarEl) avatarEl.textContent = '+';

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
                UI.showStickyToast('Contactos Sincronizados', `Se sincronizaron ${data.total_contacts} contactos respetando tus ediciones y eliminaciones`, 'success', 3000);
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
