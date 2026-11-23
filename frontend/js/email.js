// Módulo de Gestión de Correos - Senda

const EmailManager = {
    currentFolder: 'INBOX',
    currentAccountId: null,
    currentLabelId: null,
    activeFilterLabelIds: null,
    labels: [],
    allLabels: [],
    pendingLabelAssignEmailId: null,
    searchQuery: '',
    currentPage: 1,
    pageSize: parseInt(localStorage.getItem('merkemail_page_size') || '12', 10) || 12,
    skipDeleteConfirm: localStorage.getItem('merkemail_skip_delete_confirm') === 'true',
    selectedEmailId: null,
    selectedBatchIds: new Set(),
    authorizedSpamImages: new Set(),
    emails: [],
    totalEmails: 0,
    totalPages: 1,
    unreadCounts: { folders: {}, labels: {} },
    autoSyncEnabled: localStorage.getItem('merkemail_auto_sync') !== 'false',
    lastSyncByAccount: {},
    autoSyncIntervalId: null,
    readTimerId: null,
    pendingReadEmailId: null,
    emailDetailCache: new Map(),
    selectedCategory: '',
    lastSummaryData: null,

    getFolderDisplayName(folder) {
        if (!folder) return 'Recibidos';
        const clean = String(folder).trim().toUpperCase();
        const map = {
            'INBOX': 'Recibidos',
            'CATEGORY_UPDATES': 'Notificaciones',
            'CATEGORY_PROMOTIONS': 'Promociones',
            'CATEGORY_SOCIAL': 'Social',
            'CATEGORY_FORUMS': 'Foros',
            'CATEGORY_PERSONAL': 'Principal',
            'SENT': 'Enviados',
            'DRAFT': 'Borradores',
            'DRAFTS': 'Borradores',
            'TRASH': 'Papelera',
            'SPAM': 'Spam',
            'STARRED': 'Destacados',
            'IMPORTANT': 'Importante',
            'ALL': 'Todos',
            'ARCHIVE': 'Archivo'
        };
        return map[clean] || folder;
    },

    getLabelDisplayName(name) {
        if (!name) return '';
        const clean = String(name).trim();
        const map = {
            'CATEGORY_UPDATES': 'Notificaciones',
            'CATEGORY_PROMOTIONS': 'Promociones',
            'CATEGORY_SOCIAL': 'Social',
            'CATEGORY_FORUMS': 'Foros',
            'CATEGORY_PERSONAL': 'Principal',
            'INBOX': 'Recibidos',
            'SENT': 'Enviados',
            'DRAFT': 'Borradores',
            'DRAFTS': 'Borradores',
            'TRASH': 'Papelera',
            'SPAM': 'Spam',
            'STARRED': 'Destacados',
            'UNREAD': 'No leídos',
            'IMPORTANT': 'Importante'
        };
        return map[clean] || map[clean.toUpperCase()] || name;
    },

    renderAiCategoryBadge(aiTags) {
        if (!aiTags) return '';
        let tags = [];
        try {
            tags = typeof aiTags === 'string' ? JSON.parse(aiTags) : aiTags;
        } catch (e) {
            tags = [String(aiTags)];
        }
        if (!Array.isArray(tags) || tags.length === 0) return '';
        const cat = String(tags[0]).toLowerCase();
        const map = {
            'trabajo': {
                icon: '<svg class="w-3 h-3 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>',
                text: 'Trabajo',
                cls: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
            },
            'finanzas': {
                icon: '<svg class="w-3 h-3 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>',
                text: 'Finanzas',
                cls: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
            },
            'personal': {
                icon: '<svg class="w-3 h-3 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>',
                text: 'Personal',
                cls: 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
            },
            'boletines': {
                icon: '<svg class="w-3 h-3 text-purple-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"/></svg>',
                text: 'Boletines',
                cls: 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
            }
        };
        const badge = map[cat];
        if (!badge) return '';
        return `<span class="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.2 rounded border ${badge.cls}" title="Categoría IA: ${badge.text}">${badge.icon}<span>${badge.text}</span></span>`;
    },

    matchesCategory(email, category) {
        if (!category) return true;
        if (!email.ai_tags) return false;
        try {
            const tags = typeof email.ai_tags === 'string' ? JSON.parse(email.ai_tags) : email.ai_tags;
            return Array.isArray(tags) && tags.some(t => String(t).toLowerCase() === category.toLowerCase());
        } catch (e) {
            return String(email.ai_tags).toLowerCase().includes(category.toLowerCase());
        }
    },

    setCategoryFilter(category) {
        this.selectedCategory = category || '';
        document.querySelectorAll('.ai-cat-chip').forEach(chip => {
            const cat = chip.getAttribute('data-category') || '';
            if (cat === this.selectedCategory) {
                chip.className = 'ai-cat-chip px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer bg-indigo-600 text-white shadow-2xs flex items-center gap-1.5';
            } else {
                chip.className = 'ai-cat-chip px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center gap-1.5';
            }
        });

        this.renderEmailsTable();

        if (this.selectedCategory) {
            const unclassified = this.emails.filter(e => !e.ai_tags);
            if (unclassified.length > 0) {
                fetch('/api/ai/classify-batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email_ids: unclassified.slice(0, 25).map(e => e.id) })
                })
                .then(r => r.json())
                .then(res => {
                    if (res.success && res.results) {
                        res.results.forEach(r => {
                            const target = this.emails.find(e => e.id === r.id);
                            if (target) target.ai_tags = JSON.stringify(r.tags);
                        });
                        this.renderEmailsTable();
                    }
                })
                .catch(() => {});
            }
        }
    },

    accountErrors: {},
    syncSystemStatus: 'inactive', // 'active' | 'problems' | 'inactive' | 'paused'

    async setPageSize(newSize, showNotification = true) {
        const parsed = parseInt(newSize, 10);
        const validSize = (!isNaN(parsed) && parsed >= 5 && parsed <= 200) ? parsed : 12;
        this.pageSize = validSize;
        this.currentPage = 1;

        try {
            localStorage.setItem('merkemail_page_size', String(validSize));
        } catch (e) {}

        const selectEl = document.getElementById('settings-emails-page-size');
        if (selectEl && String(selectEl.value) !== String(validSize)) {
            selectEl.value = String(validSize);
        }

        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emails_page_size: String(validSize) })
            });
        } catch (e) {
            console.warn('Error guardando tamaño de página en backend:', e);
        }

        await this.loadEmails();

        if (showNotification && window.UI) {
            UI.showStickyToast(
                'Paginación Actualizada',
                `Ahora se muestran ${validSize} correos por página en las listas.`,
                'success',
                2400
            );
        }
    },

    toggleSkipDeleteConfirm() {
        this.setSkipDeleteConfirm(!this.skipDeleteConfirm, true);
    },

    async setSkipDeleteConfirm(newVal, showNotification = true) {
        this.skipDeleteConfirm = Boolean(newVal);
        try {
            localStorage.setItem('merkemail_skip_delete_confirm', this.skipDeleteConfirm ? 'true' : 'false');
        } catch (e) {}

        const switchEl = document.getElementById('settings-skip-delete-confirm-switch');
        const thumbEl = document.getElementById('settings-skip-delete-confirm-thumb');
        if (switchEl && thumbEl) {
            if (this.skipDeleteConfirm) {
                switchEl.classList.remove('bg-slate-300', 'dark:bg-slate-700');
                switchEl.classList.add('bg-indigo-600');
                thumbEl.classList.remove('translate-x-0');
                thumbEl.classList.add('translate-x-5');
            } else {
                switchEl.classList.remove('bg-indigo-600');
                switchEl.classList.add('bg-slate-300', 'dark:bg-slate-700');
                thumbEl.classList.remove('translate-x-5');
                thumbEl.classList.add('translate-x-0');
            }
        }

        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skip_delete_confirm: this.skipDeleteConfirm ? 'true' : 'false' })
            });
        } catch (e) {
            console.warn('Error guardando skip_delete_confirm en backend:', e);
        }

        if (showNotification && window.UI) {
            UI.showStickyToast(
                'Preferencia Guardada',
                this.skipDeleteConfirm
                    ? 'Se omitirá el diálogo de confirmación al mover correos a la papelera.'
                    : 'Se solicitará confirmación antes de mover correos a la papelera.',
                'info',
                2500
            );
        }
    },

    updateSystemSyncPill(status, customTitle = null) {
        if (!status) {
            if (this.syncSystemStatus === 'inactive') status = 'inactive';
            else if (Object.keys(this.accountErrors).length > 0) status = 'problems';
            else if (!this.autoSyncEnabled) status = 'paused';
            else status = 'active';
        }
        this.syncSystemStatus = status;

        const btn = document.getElementById('btn-toggle-auto-sync');
        const dot = document.getElementById('sync-status-dot');
        const text = document.getElementById('sync-status-text');
        if (!btn || !dot || !text) return;

        btn.classList.remove('hidden');
        btn.classList.add('lg:flex');

        if (status === 'active') {
            btn.className = 'hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-400 text-xs font-semibold shadow-2xs hover:opacity-90 active:scale-95 transition-all cursor-pointer';
            btn.title = customTitle || 'Todas las cuentas conectadas y sincronizadas. Haz clic para suspender o sincronizar.';
            dot.className = 'w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse';
            text.textContent = 'Activo';
        } else if (status === 'problems') {
            const errAccounts = Object.keys(this.accountErrors).length;
            btn.className = 'hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800/60 text-amber-700 dark:text-amber-400 text-xs font-semibold shadow-2xs hover:opacity-90 active:scale-95 transition-all cursor-pointer';
            btn.title = customTitle || `${errAccounts} cuenta(s) presentan problemas de sincronización. Haz clic para ver detalles o reintentar.`;
            dot.className = 'w-2 h-2 rounded-full bg-amber-500 dark:bg-amber-400 animate-pulse';
            text.textContent = 'Problemas';
        } else if (status === 'inactive') {
            btn.className = 'hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800/60 text-rose-700 dark:text-rose-400 text-xs font-semibold shadow-2xs hover:opacity-90 active:scale-95 transition-all cursor-pointer';
            btn.title = customTitle || 'Sin conexión con el servidor. Haz clic para reintentar conectar.';
            dot.className = 'w-2 h-2 rounded-full bg-rose-500 dark:bg-rose-400 animate-pulse';
            text.textContent = 'Inactivo';
        } else if (status === 'paused') {
            btn.className = 'hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold shadow-2xs hover:opacity-90 active:scale-95 transition-all cursor-pointer';
            btn.title = 'Sincronización automática suspendida. Haz clic para reactivar.';
            dot.className = 'w-2 h-2 rounded-full bg-slate-400';
            text.textContent = 'Pausado';
        }
    },

    async handleStatusPillClick() {
        if (this.syncSystemStatus === 'inactive') {
            UI.showStickyToast('Reconectando', 'Intentando restablecer conexión con el servidor...', 'info');
            await this.retryFullConnection();
        } else if (this.syncSystemStatus === 'problems') {
            const errs = Object.entries(this.accountErrors).map(([id, msg]) => `• Cuenta ${id}: ${msg}`).join('\n');
            UI.showStickyToast('Problemas de Conexión', errs || 'Una o más cuentas no pudieron sincronizar.', 'warning');
            await this.syncCurrentView();
        } else {
            this.toggleAutoSync();
        }
    },

    async retryFullConnection() {
        try {
            await this.loadAccounts();
            await this.loadLabels();
            await this.loadEmails();
            if (window.GeminiAI) await GeminiAI.initSettings();
            if (window.CalendarManager) await CalendarManager.init();
            this.updateSystemSyncPill(Object.keys(this.accountErrors).length > 0 ? 'problems' : 'active');

            // Monitorear y alertar de correos nuevos recibidos
            if (window.NotificationManager && typeof NotificationManager.checkNewEmails === 'function') {
                NotificationManager.checkNewEmails(this.emails, this.currentFolder);
            }

            // Actualizar la descripción de bienvenida del asistente Elio
            if (window.AntigravityCopilot && typeof AntigravityCopilot.updateConnectedServices === 'function') {
                AntigravityCopilot.updateConnectedServices();
            }

            // Actualizar badge de contactos pendientes en el menú lateral
            if (window.ContactsManager && typeof ContactsManager.loadContacts === 'function') {
                ContactsManager.loadContacts();
            }
            UI.showStickyToast('Conectado', 'Conexión con el servidor restablecida con éxito', 'success');
        } catch (e) {
            this.updateSystemSyncPill('inactive', 'No se pudo conectar al servidor');
            if (window.GeminiAI) GeminiAI.setDisconnectedState();
            UI.showStickyToast('Sin Conexión', 'El servidor aún no responde. Revisa que el backend esté ejecutándose.', 'error');
        }
    },

    toggleAutoSync() {
        this.autoSyncEnabled = !this.autoSyncEnabled;
        localStorage.setItem('merkemail_auto_sync', this.autoSyncEnabled ? 'true' : 'false');
        if (this.autoSyncEnabled) {
            this.updateSystemSyncPill(Object.keys(this.accountErrors).length > 0 ? 'problems' : 'active');

            // Monitorear y alertar de correos nuevos recibidos
            if (window.NotificationManager && typeof NotificationManager.checkNewEmails === 'function') {
                NotificationManager.checkNewEmails(this.emails, this.currentFolder);
            }

            // Actualizar la descripción de bienvenida del asistente Elio
            if (window.AntigravityCopilot && typeof AntigravityCopilot.updateConnectedServices === 'function') {
                AntigravityCopilot.updateConnectedServices();
            }

            // Actualizar badge de contactos pendientes en el menú lateral
            if (window.ContactsManager && typeof ContactsManager.loadContacts === 'function') {
                ContactsManager.loadContacts();
            }
            UI.showStickyToast('Sincronización Automática', 'Sincronización periódica reanudada', 'success');
            this.checkAutoSync();
        } else {
            this.updateSystemSyncPill('paused');
            UI.showStickyToast('Sincronización en Pausa', 'Sincronización periódica automática suspendida', 'warning');
        }
    },

    updateAutoSyncUI() {
        this.updateSystemSyncPill();
    },

    initAutoSyncScheduler() {
        this.updateAutoSyncUI();
        if (this.autoSyncIntervalId) {
            clearInterval(this.autoSyncIntervalId);
        }
        // Verificar cada 20 segundos las cuentas para sincronizar
        this.autoSyncIntervalId = setInterval(() => {
            this.checkAutoSync();
        }, 20000);

        // Comprobar si hay alguna sincronización total activa en segundo plano al iniciar
        fetch('/api/accounts/sync-status')
            .then(r => r.json())
            .then(status => {
                if (status && status.is_syncing) {
                    this.showSidebarSyncWidget(status);
                    this.startSyncStatusPolling();
                }
            })
            .catch(() => {});
    },

    async checkAutoSync() {
        if (!this.autoSyncEnabled || !this.accounts || this.accounts.length === 0) return;

        const now = Date.now();
        let anySynced = false;

        for (const acc of this.accounts) {
            const intervalMin = acc.sync_interval !== undefined && acc.sync_interval !== null ? parseInt(acc.sync_interval) : 5;
            // Si el intervalo es 0 o menor, es manual
            if (intervalMin <= 0) continue;

            const intervalMs = intervalMin * 60 * 1000;
            const lastSync = this.lastSyncByAccount[acc.id] || 0;

            if (now - lastSync >= intervalMs) {
                this.lastSyncByAccount[acc.id] = now;
                try {
                    const res = await fetch(`/api/emails/sync?account_id=${acc.id}`, { method: 'POST' });
                    const data = await res.json();
                    if (data.success) {
                        delete this.accountErrors[acc.id];
                        if (data.synced_count > 0) anySynced = true;
                    } else {
                        this.accountErrors[acc.id] = data.error || 'Fallo de sincronización';
                    }
                } catch (e) {
                    console.warn(`Error en auto-sync para cuenta ${acc.email}:`, e);
                    this.accountErrors[acc.id] = e.message || 'Error de red';
                }
            }
        }

        this.updateSystemSyncPill();

        if (anySynced) {
            await this.loadEmails(false);
            await this.updateUnreadCounts();
        }
    },

    async updateUnreadCounts() {
        try {
            const url = this.currentAccountId 
                ? `/api/emails/unread-counts?account_id=${this.currentAccountId}`
                : '/api/emails/unread-counts';
            const res = await fetch(url);
            if (!res.ok) return;
            const data = await res.json();
            this.unreadCounts = data || { folders: {}, labels: {} };

            // 1. Actualizar badges de carpetas del sistema
            const folderButtons = document.querySelectorAll('.folder-nav-btn[data-folder]');
            folderButtons.forEach(btn => {
                const folderKey = btn.getAttribute('data-folder');
                const badge = btn.querySelector('.sidebar-badge');
                if (!badge) return;

                const count = (this.unreadCounts.folders && this.unreadCounts.folders[folderKey]) || 0;
                if (count > 0) {
                    badge.textContent = count > 999 ? '999+' : count;
                    badge.classList.remove('hidden');
                } else {
                    badge.textContent = '';
                    badge.classList.add('hidden');
                }
            });

            // 2. Actualizar badges de etiquetas dinámicas
            if (this.labels && this.labels.length > 0) {
                this.labels.forEach(l => {
                    const badge = document.getElementById(`label-badge-${l.id}`);
                    if (!badge) return;
                    const count = (this.unreadCounts.labels && this.unreadCounts.labels[String(l.id)]) || 0;
                    if (count > 0) {
                        badge.textContent = count > 999 ? '999+' : count;
                        badge.classList.remove('hidden');
                    } else {
                        badge.textContent = '';
                        badge.classList.add('hidden');
                    }
                });
            }
        } catch (e) {
            console.error("Error al actualizar contadores de no leídos:", e);
        }
    },

    advancedFilters: {
        keyword: '',
        sender: '',
        recipient: '',
        subject: '',
        folder: '',
        accountId: null,
        labelIds: [],
        dateFrom: '',
        dateTo: '',
        hasAttachments: false,
        isStarred: null,
        readStatus: 'all',
        aiUrgency: ''
    },

    hasActiveAdvancedFilters() {
        const f = this.advancedFilters;
        if (!f) return false;
        return Boolean(
            (f.keyword && f.keyword.trim()) ||
            (f.sender && f.sender.trim()) ||
            (f.recipient && f.recipient.trim()) ||
            (f.subject && f.subject.trim()) ||
            (f.folder && f.folder.trim()) ||
            (f.accountId !== null && f.accountId !== '' && !isNaN(f.accountId)) ||
            (f.labelIds && f.labelIds.length > 0) ||
            (f.dateFrom && f.dateFrom.trim()) ||
            (f.dateTo && f.dateTo.trim()) ||
            f.hasAttachments ||
            f.isStarred !== null ||
            (f.readStatus && f.readStatus !== 'all') ||
            (f.aiUrgency && f.aiUrgency.trim())
        );
    },

    openAdvancedSearchDrawer() {
        // 1. Poblar selector de cuentas en el drawer
        const accSelect = document.getElementById('adv-search-account');
        if (accSelect && this.accounts) {
            accSelect.innerHTML = '<option value="">Todas las cuentas</option>' +
                this.accounts.map(a => `<option value="${a.id}">${this.escapeHtml(a.name)} (${this.escapeHtml(a.email)})</option>`).join('');
            if (this.advancedFilters.accountId) {
                accSelect.value = String(this.advancedFilters.accountId);
            } else if (this.currentAccountId) {
                accSelect.value = String(this.currentAccountId);
            }
        }

        // 2. Poblar chips de etiquetas múltiples
        this.renderAdvLabelsList();

        // 3. Sincronizar inputs existentes con el estado
        const f = this.advancedFilters;
        const kwInput = document.getElementById('adv-search-keyword');
        if (kwInput) {
            kwInput.value = f.keyword || this.searchQuery || '';
        }
        const senderInput = document.getElementById('adv-search-sender');
        if (senderInput) senderInput.value = f.sender || '';
        const recipInput = document.getElementById('adv-search-recipient');
        if (recipInput) recipInput.value = f.recipient || '';
        const subjInput = document.getElementById('adv-search-subject');
        if (subjInput) subjInput.value = f.subject || '';
        const folderSelect = document.getElementById('adv-search-folder');
        if (folderSelect) folderSelect.value = f.folder || (this.currentFolder !== 'INBOX' ? (this.currentFolder || '') : '');
        const readSelect = document.getElementById('adv-search-read-status');
        if (readSelect) readSelect.value = f.readStatus || 'all';
        const starSelect = document.getElementById('adv-search-starred');
        if (starSelect) {
            starSelect.value = f.isStarred === true ? 'starred' : (f.isStarred === false ? 'unstarred' : 'all');
        }
        const attachCheck = document.getElementById('adv-search-has-attach');
        if (attachCheck) attachCheck.checked = Boolean(f.hasAttachments);
        const dateFromInput = document.getElementById('adv-search-date-from');
        if (dateFromInput) dateFromInput.value = f.dateFrom || '';
        const dateToInput = document.getElementById('adv-search-date-to');
        if (dateToInput) dateToInput.value = f.dateTo || '';
        const urgSelect = document.getElementById('adv-search-ai-urgency');
        if (urgSelect) urgSelect.value = f.aiUrgency || '';

        UI.openDrawer('drawer-search-advanced');
        setTimeout(() => {
            if (kwInput) kwInput.focus();
        }, 150);
    },

    renderAdvLabelsList() {
        const container = document.getElementById('adv-search-labels-list');
        if (!container) return;

        if (!this.labels || this.labels.length === 0) {
            container.innerHTML = `<span class="text-[11px] text-slate-400 italic">No hay etiquetas disponibles</span>`;
            return;
        }

        const selectedSet = new Set((this.advancedFilters.labelIds || []).map(Number));

        container.innerHTML = this.labels.map(l => {
            const isChecked = selectedSet.has(Number(l.id));
            return `
                <label class="adv-label-chip inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                    isChecked 
                        ? 'bg-indigo-50 dark:bg-indigo-950/70 border-indigo-500 text-indigo-700 dark:text-indigo-300 font-semibold shadow-xs' 
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }">
                    <input type="checkbox" data-adv-label-id="${l.id}" ${isChecked ? 'checked' : ''} onchange="EmailManager.onAdvLabelToggle(this)" class="hidden">
                    <span class="w-2 h-2 rounded-full shrink-0" style="background-color: ${l.color || '#3b82f6'}"></span>
                    <span class="truncate max-w-[120px]">${this.escapeHtml(l.name)}</span>
                </label>
            `;
        }).join('');
    },

    onAdvLabelToggle(checkbox) {
        const labelEl = checkbox.closest('.adv-label-chip');
        if (!labelEl) return;
        if (checkbox.checked) {
            labelEl.classList.remove('bg-white', 'dark:bg-slate-800', 'border-slate-200', 'dark:border-slate-700', 'text-slate-700', 'dark:text-slate-300');
            labelEl.classList.add('bg-indigo-50', 'dark:bg-indigo-950/70', 'border-indigo-500', 'text-indigo-700', 'dark:text-indigo-300', 'font-semibold', 'shadow-xs');
        } else {
            labelEl.classList.add('bg-white', 'dark:bg-slate-800', 'border-slate-200', 'dark:border-slate-700', 'text-slate-700', 'dark:text-slate-300');
            labelEl.classList.remove('bg-indigo-50', 'dark:bg-indigo-950/70', 'border-indigo-500', 'text-indigo-700', 'dark:text-indigo-300', 'font-semibold', 'shadow-xs');
        }
    },

    selectAllAdvLabels(selectAll) {
        const checkboxes = document.querySelectorAll('input[data-adv-label-id]');
        checkboxes.forEach(cb => {
            cb.checked = selectAll;
            this.onAdvLabelToggle(cb);
        });
    },

    setAdvDateShortcut(shortcut) {
        const fromInput = document.getElementById('adv-search-date-from');
        const toInput = document.getElementById('adv-search-date-to');
        if (!fromInput || !toInput) return;

        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const formatLocal = (d) => {
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        if (shortcut === 'clear') {
            fromInput.value = '';
            toInput.value = '';
            return;
        }

        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0);

        if (shortcut === 'today') {
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            fromInput.value = formatLocal(startOfToday);
            toInput.value = formatLocal(endOfToday);
        } else if (shortcut === '7days') {
            const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            past7.setHours(0, 0, 0, 0);
            fromInput.value = formatLocal(past7);
            toInput.value = formatLocal(endOfToday);
        } else if (shortcut === '30days') {
            const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            past30.setHours(0, 0, 0, 0);
            fromInput.value = formatLocal(past30);
            toInput.value = formatLocal(endOfToday);
        } else if (shortcut === 'year') {
            const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
            fromInput.value = formatLocal(startOfYear);
            toInput.value = formatLocal(endOfToday);
        }
    },

    applyAdvancedSearch() {
        const keyword = (document.getElementById('adv-search-keyword')?.value || '').trim();
        const sender = (document.getElementById('adv-search-sender')?.value || '').trim();
        const recipient = (document.getElementById('adv-search-recipient')?.value || '').trim();
        const subject = (document.getElementById('adv-search-subject')?.value || '').trim();
        const folder = document.getElementById('adv-search-folder')?.value || '';
        const accountVal = document.getElementById('adv-search-account')?.value;
        const accountId = accountVal ? parseInt(accountVal, 10) : null;
        const readStatus = document.getElementById('adv-search-read-status')?.value || 'all';
        const starVal = document.getElementById('adv-search-starred')?.value;
        const isStarred = starVal === 'starred' ? true : (starVal === 'unstarred' ? false : null);
        const hasAttachments = Boolean(document.getElementById('adv-search-has-attach')?.checked);
        const dateFrom = document.getElementById('adv-search-date-from')?.value || '';
        const dateTo = document.getElementById('adv-search-date-to')?.value || '';
        const aiUrgency = document.getElementById('adv-search-ai-urgency')?.value || '';

        // Recolectar etiquetas seleccionadas
        const labelCheckboxes = document.querySelectorAll('input[data-adv-label-id]:checked');
        const labelIds = Array.from(labelCheckboxes).map(cb => parseInt(cb.getAttribute('data-adv-label-id'), 10)).filter(Boolean);

        this.advancedFilters = {
            keyword,
            sender,
            recipient,
            subject,
            folder,
            accountId,
            labelIds,
            dateFrom,
            dateTo,
            hasAttachments,
            isStarred,
            readStatus,
            aiUrgency
        };

        // Reflejar término principal en la barra rápida
        const mainInput = document.getElementById('main-search-input');
        const clearBtn = document.getElementById('btn-clear-search');
        if (mainInput) {
            mainInput.value = keyword;
        }
        if (clearBtn) {
            if (keyword && keyword.trim().length > 0) {
                clearBtn.classList.remove('hidden');
            } else {
                clearBtn.classList.add('hidden');
            }
        }
        this.searchQuery = keyword;
        this.currentPage = 1;
        this.clearSelection();

        UI.closeDrawer('drawer-search-advanced');
        this.updateActiveFiltersBanner();
        this.loadEmails();
        UI.showStickyToast('Filtros Aplicados', 'Se actualizaron los resultados con la búsqueda avanzada', 'info', 2000);
    },

    clearMainSearch() {
        if (window.UI && typeof UI.switchMainView === 'function') {
            UI.switchMainView('mail');
        }
        const mainInput = document.getElementById('main-search-input');
        const clearBtn = document.getElementById('btn-clear-search');
        const elioBtn = document.getElementById('btn-submit-to-elio');
        if (mainInput) {
            mainInput.value = '';
            mainInput.focus();
        }
        if (clearBtn) {
            clearBtn.classList.add('hidden');
        }
        if (elioBtn) {
            elioBtn.classList.add('hidden');
            elioBtn.classList.remove('flex');
        }
        this.searchQuery = '';
        if (this.advancedFilters && this.advancedFilters.keyword) {
            this.advancedFilters.keyword = '';
            const advKeyword = document.getElementById('adv-filter-keyword');
            if (advKeyword) advKeyword.value = '';
        }
        this.currentPage = 1;
        this.clearSelection();
        this.updateActiveFiltersBanner();
        this.loadEmails();
        UI.showStickyToast('Búsqueda Limpiada', 'Se ha restablecido la vista de correos', 'info', 2000);
    },

    clearAdvancedFiltersState() {
        this.advancedFilters = {
            keyword: '',
            sender: '',
            recipient: '',
            subject: '',
            folder: '',
            accountId: null,
            labelIds: [],
            dateFrom: '',
            dateTo: '',
            hasAttachments: false,
            isStarred: null,
            readStatus: 'all',
            aiUrgency: ''
        };
        this.searchQuery = '';
        const mainInput = document.getElementById('main-search-input');
        const clearBtn = document.getElementById('btn-clear-search');
        const elioBtn = document.getElementById('btn-submit-to-elio');
        if (mainInput) mainInput.value = '';
        if (clearBtn) clearBtn.classList.add('hidden');
        if (elioBtn) {
            elioBtn.classList.add('hidden');
            elioBtn.classList.remove('flex');
        }
        this.resetAdvancedSearchForm();
        this.updateActiveFiltersBanner();
    },

    clearAdvancedFilters() {
        this.clearAdvancedFiltersState();
        this.currentPage = 1;
        this.clearSelection();
        this.loadEmails();
        UI.showStickyToast('Filtros Restablecidos', 'Mostrando la vista estándar', 'info', 1500);
    },

    resetAdvancedSearchForm() {
        const fields = ['adv-search-keyword', 'adv-search-sender', 'adv-search-recipient', 'adv-search-subject', 'adv-search-date-from', 'adv-search-date-to'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const folder = document.getElementById('adv-search-folder');
        if (folder) folder.value = '';
        const acc = document.getElementById('adv-search-account');
        if (acc) acc.value = '';
        const read = document.getElementById('adv-search-read-status');
        if (read) read.value = 'all';
        const star = document.getElementById('adv-search-starred');
        if (star) star.value = 'all';
        const attach = document.getElementById('adv-search-has-attach');
        if (attach) attach.checked = false;
        const urg = document.getElementById('adv-search-ai-urgency');
        if (urg) urg.value = '';
        this.selectAllAdvLabels(false);
    },

    updateActiveFiltersBanner() {
        const banner = document.getElementById('active-filters-banner');
        const summary = document.getElementById('active-filters-summary');
        const dot = document.getElementById('badge-advanced-search-active');
        const isActive = this.hasActiveAdvancedFilters();

        if (dot) {
            dot.classList.toggle('hidden', !isActive);
        }

        if (!banner) return;
        if (!isActive) {
            banner.classList.add('hidden');
            return;
        }

        const f = this.advancedFilters;
        const parts = [];
        if (f.keyword) parts.push(`"${f.keyword}"`);
        if (f.sender) parts.push(`De: ${f.sender}`);
        if (f.recipient) parts.push(`Para: ${f.recipient}`);
        if (f.subject) parts.push(`Asunto: ${f.subject}`);
        if (f.folder) parts.push(`Carpeta: ${f.folder}`);
        if (f.labelIds && f.labelIds.length > 0) parts.push(`${f.labelIds.length} etiqueta(s)`);
        if (f.dateFrom || f.dateTo) parts.push('Rango fechas');
        if (f.hasAttachments) parts.push('Con adjuntos 📎');
        if (f.isStarred !== null) parts.push(f.isStarred ? 'Destacados ★' : 'Sin destacar');
        if (f.readStatus === 'unread') parts.push('No leídos');
        if (f.readStatus === 'read') parts.push('Leídos');
        if (f.aiUrgency) parts.push(`Urgencia ${f.aiUrgency}`);

        if (summary) {
            summary.textContent = `Filtros activos: ${parts.join(' • ')}`;
        }
        banner.classList.remove('hidden');
    },

    async loadAccounts() {
        try {
            const res = await fetch('/api/accounts');
            const accounts = await res.json();
            this.accounts = accounts;

            // Registrar avatares en AvatarService y actualizar avatar del sistema
            if (window.AvatarService) {
                accounts.forEach(a => {
                    if (a.avatar_url) AvatarService.register(a.email, a.avatar_url);
                });
                AvatarService.updateSystemHeaderAvatar();
            }

            const selectEl = document.getElementById('account-filter-select');
            const composeAccountSelect = document.getElementById('compose-account-select');
            
            if (selectEl) {
                selectEl.innerHTML = '<option value="">Todas las cuentas</option>' + 
                    accounts.map(a => `<option value="${a.id}">${a.name} (${a.email})</option>`).join('');
            }
            if (composeAccountSelect) {
                composeAccountSelect.innerHTML = accounts.map(a => `<option value="${a.id}" ${a.is_default ? 'selected' : ''}>${a.name} &lt;${a.email}&gt;${a.is_default ? ' ★' : ''}</option>`).join('');
                const defaultAcc = accounts.find(a => a.is_default === 1);
                if (defaultAcc) {
                    composeAccountSelect.value = defaultAcc.id;
                }
            }

            // Actualizar avatar del header con la cuenta predeterminada
            if (window.AvatarService) {
                AvatarService.updateSystemHeaderAvatar();
            } else {
                const headerAvatar = document.getElementById('user-header-avatar');
                const defaultAcc = accounts.find(a => a.is_default === 1) || accounts[0];
                if (headerAvatar && defaultAcc) {
                    const initial = (defaultAcc.name || defaultAcc.email || 'U')[0].toUpperCase();
                    headerAvatar.textContent = initial;
                }
            }

            // Renderizar cuentas en todos los contenedores y selectores
            this.renderAccounts();

            // Las etiquetas pueden haberse cargado antes que las cuentas (carga en paralelo):
            // re-renderizar para mostrar la cuenta dueña de cada etiqueta
            if (this.allLabels && this.allLabels.length > 0) this.renderLabels();

            this.updateSystemSyncPill(Object.keys(this.accountErrors).length > 0 ? 'problems' : 'active');

            // Monitorear y alertar de correos nuevos recibidos
            if (window.NotificationManager && typeof NotificationManager.checkNewEmails === 'function') {
                NotificationManager.checkNewEmails(this.emails, this.currentFolder);
            }

            // Actualizar la descripción de bienvenida del asistente Elio
            if (window.AntigravityCopilot && typeof AntigravityCopilot.updateConnectedServices === 'function') {
                AntigravityCopilot.updateConnectedServices();
            }

            // Actualizar badge de contactos pendientes en el menú lateral
            if (window.ContactsManager && typeof ContactsManager.loadContacts === 'function') {
                ContactsManager.loadContacts();
            }
        } catch (e) {
            console.error("Error al cargar cuentas:", e);
            this.updateSystemSyncPill('inactive', 'Sin conexión con el servidor backend');
            if (window.GeminiAI) GeminiAI.setDisconnectedState();
        }
    },

    renderAccounts() {
        const accounts = this.accounts || [];

        // Actualizar lista rápida de cuentas en el sidebar izquierdo
        this.renderSidebarAccounts();

        // Renderizar selector de cuenta por defecto en drawer de configuración si existe
        const settingsAccountSelect = document.getElementById('settings-default-account-select');
        if (settingsAccountSelect) {
            settingsAccountSelect.innerHTML = accounts.map(a => `
                <option value="${a.id}" ${a.is_default ? 'selected' : ''}>${a.name} (${a.email})${a.is_default ? ' ★' : ''}</option>
            `).join('') || '<option value="">(No hay cuentas disponibles)</option>';
        }

        // Renderizar lista en drawer de cuentas
        const listEl = document.getElementById('accounts-list-container');
        if (listEl) {
            listEl.innerHTML = accounts.map(a => {
                const isDef = a.is_default === 1;
                return `
                <div class="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border ${isDef ? 'border-amber-400 dark:border-amber-500/80 ring-1 ring-amber-400/40 bg-amber-50/20 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-700/60'} flex flex-col gap-2.5 shadow-2xs transition-all">
                    <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-2.5 min-w-0 flex-1">
                            ${window.AvatarService ? AvatarService.render(a.email, a.name, 'w-8 h-8 text-xs', '', a.color) : `<span class="w-3 h-3 rounded-full shrink-0 shadow-xs" style="background-color: ${a.color || '#3b82f6'}"></span>`}
                            <div class="truncate flex-1">
                                <div class="flex items-center gap-1.5 truncate">
                                    <p class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">${this.escapeHtml(a.name)}</p>
                                    ${isDef ? `<span class="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/60 px-1.5 py-0.2 rounded-md shrink-0">★ Predeterminada</span>` : ''}
                                </div>
                                <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate">${this.escapeHtml(a.email)} &bull; <span class="uppercase">${a.provider}</span></p>
                            </div>
                        </div>
                        <div class="flex items-center gap-1 shrink-0">
                            ${isDef ? `
                                <div class="p-1.5 text-amber-500 rounded-lg cursor-default" title="Esta es tu cuenta por defecto">
                                    <svg class="w-4 h-4 fill-amber-400 text-amber-500" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                                </div>
                            ` : `
                                <button onclick="EmailManager.setDefaultAccount(${a.id})" class="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer" title="Establecer como cuenta por defecto">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
                                </button>
                            `}
                            <button onclick="EmailManager.testAccountConnection(${a.id})" class="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer" title="Probar conexión IMAP/SMTP">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                            </button>
                            <button onclick="EmailManager.openEditAccountModal(${a.id})" class="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer" title="Editar cuenta y color">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                            </button>
                            <button onclick="EmailManager.deleteAccount(${a.id}, '${this.escapeHtml(a.email)}')" class="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer" title="Eliminar cuenta">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                        </div>
                    </div>
                    <div id="account-test-status-${a.id}" class="hidden text-[11px] p-2 rounded-lg"></div>
                    <div class="pt-2 border-t border-slate-200/70 dark:border-slate-750 flex items-center justify-between gap-2">
                        <button type="button" onclick="EmailManager.startFullAccountSync(${a.id})" class="flex-1 py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100/90 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200/90 dark:border-indigo-800/70 rounded-lg text-[11px] font-semibold transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700" title="Sincronizar todos los correos del servidor de todas las carpetas en segundo plano">
                            <svg class="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                            <span>Sincronización Total (Todas las carpetas)</span>
                        </button>
                    </div>
                </div>
                `;
            }).join('') || '<p class="text-sm text-slate-500 py-4 text-center">No hay cuentas configuradas</p>';
        }
    },

    toggleAccountDropdown(e) {
        if (e) e.stopPropagation();
        const dropdown = document.getElementById('sidebar-account-dropdown');
        const arrow = document.getElementById('sidebar-account-dropdown-arrow');
        if (!dropdown) return;
        const isHidden = dropdown.classList.toggle('hidden');
        if (arrow) arrow.classList.toggle('rotate-180', !isHidden);
    },

    closeAccountDropdown() {
        const dropdown = document.getElementById('sidebar-account-dropdown');
        const arrow = document.getElementById('sidebar-account-dropdown-arrow');
        if (dropdown) dropdown.classList.add('hidden');
        if (arrow) arrow.classList.remove('rotate-180');
    },

    renderSidebarAccounts() {
        const selectedDot = document.getElementById('sidebar-account-selected-dot');
        const selectedName = document.getElementById('sidebar-account-selected-name');
        const selectorBtn = document.getElementById('sidebar-account-selector-btn');
        const dropdownItems = document.getElementById('sidebar-account-dropdown-items');

        const activeAcc = (this.accounts || []).find(a => a.id === this.currentAccountId);

        // 1. Actualizar el Botón Selector Superior en Sidebar
        if (selectedDot && selectedName) {
            if (activeAcc) {
                selectedDot.className = 'w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs';
                selectedDot.style.backgroundColor = activeAcc.color || '#3b82f6';
                selectedName.textContent = activeAcc.name;
                if (selectorBtn) selectorBtn.title = `${activeAcc.name} (${activeAcc.email})`;
            } else {
                selectedDot.className = 'w-2.5 h-2.5 rounded-full shrink-0 bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500';
                selectedDot.style.backgroundColor = '';
                selectedName.textContent = 'Todas las cuentas';
                if (selectorBtn) selectorBtn.title = 'Todas las cuentas conectadas';
            }
        }

        // 2. Poblar el Menú Desplegable Flotante con estilo de lista
        if (dropdownItems) {
            const isAllSelected = this.currentAccountId === null;
            let html = `
                <div onclick="EmailManager.selectAccount(null); EmailManager.closeAccountDropdown();" class="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                    isAllSelected 
                        ? 'bg-indigo-50 dark:bg-indigo-950/70 font-bold text-indigo-700 dark:text-indigo-300 border-l-2 border-indigo-600 dark:border-indigo-400' 
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }" title="Todas las cuentas">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0 bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500"></span>
                    <div class="min-w-0 flex-1">
                        <span class="truncate text-xs font-semibold">Todas las cuentas</span>
                        <p class="text-[10px] text-slate-400">Bandeja combinada unificada</p>
                    </div>
                </div>
            `;

            if (this.accounts && this.accounts.length > 0) {
                html += this.accounts.map(a => {
                    const isActive = this.currentAccountId === a.id;
                    return `
                        <div onclick="EmailManager.selectAccount(${a.id}); EmailManager.closeAccountDropdown();" class="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                            isActive 
                                ? 'bg-indigo-50 dark:bg-indigo-950/70 font-bold text-indigo-700 dark:text-indigo-300 border-l-2 border-indigo-600 dark:border-indigo-400' 
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                        }" title="${this.escapeHtml(a.name)} (${this.escapeHtml(a.email)})">
                            ${window.AvatarService ? AvatarService.render(a.email, a.name, 'w-6 h-6 text-[10px]', '', a.color) : `<span class="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style="background-color: ${a.color || '#3b82f6'}"></span>`}
                            <div class="min-w-0 flex-1">
                                <p class="truncate text-xs leading-tight font-medium">${this.escapeHtml(a.name)}</p>
                                <p class="truncate text-[10px] text-slate-400 leading-tight">${this.escapeHtml(a.email)}</p>
                            </div>
                        </div>
                    `;
                }).join('');
            }
            dropdownItems.innerHTML = html;
        }
    },

    selectAccount(accountId) {
        if (window.innerWidth < 768 && window.UI) UI.closeMobileSidebar();
        if (window.UI && typeof UI.switchMainView === 'function') {
            UI.switchMainView('mail');
        }
        this.currentAccountId = accountId;
        this.currentPage = 1;
        this.selectedEmailId = null;
        this.currentFolder = 'INBOX';
        this.currentLabelId = null;
        this.activeFilterLabelIds = null;
        this.clearSelection();

        // Actualizar visualmente la carpeta activa en el sidebar a "Recibidos"
        document.querySelectorAll('.folder-nav-btn').forEach(b => {
            b.classList.remove('active-folder', 'bg-indigo-50', 'dark:bg-indigo-950/70', 'text-indigo-600', 'dark:text-indigo-400', 'font-bold');
            b.classList.add('text-slate-700', 'dark:text-slate-300');
        });
        const inboxBtn = document.getElementById('nav-item-mail');
        if (inboxBtn) {
            inboxBtn.classList.add('active-folder', 'bg-indigo-50', 'dark:bg-indigo-950/70', 'text-indigo-600', 'dark:text-indigo-400', 'font-bold');
            inboxBtn.classList.remove('text-slate-700', 'dark:text-slate-300');
        }

        this.renderSidebarAccounts();
        if (window.AvatarService) {
            AvatarService.updateSystemHeaderAvatar();
        }
        this.loadLabels();
        this.loadEmails();
    },

    async loadLabels() {
        try {
            // Se cargan todas las etiquetas de todas las cuentas una sola vez y se filtran en cliente
            const allRes = await fetch('/api/labels');
            const allLabels = await allRes.json();
            this.allLabels = Array.isArray(allLabels) ? allLabels : [];

            this.labels = this.getSidebarLabelsForAccount(this.currentAccountId);
            await this.updateUnreadCounts();
            this.renderLabels();
        } catch (e) {
            console.error("Error al cargar etiquetas:", e);
        }
    },

    // Etiquetas que se listan en la barra lateral según el selector superior de cuentas:
    //  - "Todas las cuentas" (null): todas las etiquetas de todas las cuentas.
    //  - Una cuenta: solo las de esa cuenta (propias + las que estén en uso en sus correos).
    getSidebarLabelsForAccount(accountId) {
        const all = this.allLabels || [];
        if (!accountId) return all;
        return all.filter(l =>
            l.account_id === accountId ||
            (Array.isArray(l.account_ids) && l.account_ids.includes(accountId))
        );
    },

    // Texto para distinguir etiquetas con el mismo nombre dentro de una lista:
    // nombre de la cuenta dueña o "Compartida" para las etiquetas sin cuenta.
    getLabelOwnerHint(label, list) {
        const key = String(label.name || '').trim().toLowerCase();
        const dupes = (list || []).filter(x => String(x.name || '').trim().toLowerCase() === key).length > 1;
        if (!dupes) return '';
        if (!label.account_id) return 'Compartida';
        const acc = (this.accounts || []).find(a => a.id === label.account_id);
        return acc ? acc.name : '';
    },

    // Lista de etiquetas de los menús "Etiquetar" (barra superior de la lista y vista del correo):
    // exactamente la misma lista de la barra lateral, que respeta el selector superior de cuentas
    // ("Todas las cuentas" = todas las etiquetas; una cuenta = solo las etiquetas de esa cuenta).
    // Si se elige una etiqueta de otra cuenta, el backend usa la homónima de la cuenta del correo.
    getLabelMenu() {
        return this.labels || [];
    },

    // ¿La etiqueta del menú está aplicada al correo? Una etiqueta de otra cuenta cuenta como
    // aplicada si el correo tiene la homónima de su propia cuenta (es la que usará el backend).
    isLabelAppliedToEmail(label, email, assignedLabelIds) {
        if (assignedLabelIds.has(label.id)) return true;
        if (!label.account_id || label.account_id === email.account_id) return false;
        const name = String(label.name || '').trim().toLowerCase();
        return (this.allLabels || []).some(l =>
            assignedLabelIds.has(l.id) &&
            l.account_id === email.account_id &&
            String(l.name || '').trim().toLowerCase() === name
        );
    },

    async syncRemoteLabels() {
        try {
            UI.showStickyToast('Sincronizando', 'Consultando etiquetas de la cuenta...', 'info', 2000);
            let url = '/api/labels/sync';
            if (this.currentAccountId) url += `?account_id=${this.currentAccountId}`;
            const res = await fetch(url, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                UI.showStickyToast('Etiquetas Actualizadas', `Se sincronizaron ${data.count} etiquetas de la cuenta`, 'success');
                await this.loadLabels();
            } else {
                UI.showStickyToast('Aviso', data.error || 'No se pudieron sincronizar', 'warning');
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    async syncCurrentView() {
        const globalBtn = document.getElementById('btn-global-sync');
        const globalIcon = globalBtn ? globalBtn.querySelector('svg') : null;
        if (globalIcon) globalIcon.classList.add('animate-spin');

        // Detección del contexto activo: Calendario, Contactos o Bandeja de Correos
        const sectionCalendar = document.getElementById('main-calendar-section');
        const isCalendarVisible = sectionCalendar && !sectionCalendar.classList.contains('hidden');
        const drawerContacts = document.getElementById('drawer-contacts');
        const isContactsVisible = drawerContacts && !drawerContacts.classList.contains('hidden');

        if (isCalendarVisible) {
            try {
                if (window.CalendarManager && typeof CalendarManager.syncNow === 'function') {
                    await CalendarManager.syncNow(globalBtn);
                } else {
                    await fetch('/api/calendars/sync', { method: 'POST' });
                }
            } catch (err) {
                console.warn('Error sincronizando calendario desde barra global:', err);
            } finally {
                if (globalIcon) setTimeout(() => globalIcon.classList.remove('animate-spin'), 600);
            }
            return;
        }

        if (isContactsVisible) {
            try {
                if (window.ContactsManager && typeof ContactsManager.syncNow === 'function') {
                    await ContactsManager.syncNow(globalBtn);
                } else {
                    await fetch('/api/contacts/sync', { method: 'POST' });
                }
            } catch (err) {
                console.warn('Error sincronizando contactos desde barra global:', err);
            } finally {
                if (globalIcon) setTimeout(() => globalIcon.classList.remove('animate-spin'), 600);
            }
            return;
        }

        try {
            UI.showStickyToast('Sincronizando', 'Actualizando correos desde el servidor...', 'info', 2500);
            const params = new URLSearchParams();
            if (this.currentAccountId) params.append('account_id', this.currentAccountId);
            if (this.currentLabelId) {
                params.append('label_id', this.currentLabelId);
            } else if (this.currentFolder) {
                params.append('folder', this.currentFolder);
            }
            const res = await fetch(`/api/emails/sync?${params.toString()}`, { method: 'POST' });
            if (!res.ok) {
                this.updateSystemSyncPill('inactive', 'El servidor respondió con error al sincronizar');
                UI.showStickyToast('Error', 'No se pudo completar la sincronización', 'error');
                return;
            }
            const data = await res.json();
            if (data.success) {
                if (this.currentAccountId) {
                    delete this.accountErrors[this.currentAccountId];
                } else {
                    this.accountErrors = {};
                }
                this.updateSystemSyncPill(Object.keys(this.accountErrors).length > 0 ? 'problems' : 'active');

                // Actualizar la descripción de bienvenida del asistente Elio
                if (window.AntigravityCopilot && typeof AntigravityCopilot.updateConnectedServices === 'function') {
                    AntigravityCopilot.updateConnectedServices();
                }
                UI.showStickyToast('Sincronización Exitosa', `${data.synced_count || 0} correos actualizados`, 'success');
                await this.loadEmails();
                await this.loadLabels();
            } else {
                if (this.currentAccountId) {
                    this.accountErrors[this.currentAccountId] = data.error || 'Error de sincronización';
                }
                this.updateSystemSyncPill('problems', data.error);
                UI.showStickyToast('Problemas al sincronizar', data.error || 'Hubo un error con una cuenta', 'warning');
            }
        } catch (e) {
            this.updateSystemSyncPill('inactive', 'Sin conexión con el servidor backend');
            if (window.GeminiAI) GeminiAI.setDisconnectedState();
            UI.showStickyToast('Error de sincronización', e.message, 'error');
        } finally {
            if (globalIcon) setTimeout(() => globalIcon.classList.remove('animate-spin'), 600);
        }
    },

    // ================= SINCRONIZACIÓN TOTAL EN BACKGROUND =================
    _syncPollTimer: null,

    async startFullAccountSync(accountId) {
        if (!accountId) {
            UI.showStickyToast('Atención', 'Selecciona una cuenta válida para sincronizar', 'warning');
            return;
        }

        try {
            // Comprobar si ya hay una sincronización activa
            const statusRes = await fetch('/api/accounts/sync-status');
            if (statusRes.ok) {
                const currentStatus = await statusRes.json();
                if (currentStatus && currentStatus.is_syncing) {
                    UI.showStickyToast('Sincronización en curso', 'Ya hay una sincronización en segundo plano ejecutándose', 'info');
                    this.showSidebarSyncWidget(currentStatus);
                    this.startSyncStatusPolling();
                    return;
                }
            }

            const res = await fetch(`/api/accounts/${accountId}/sync-full`, { method: 'POST' });
            const data = await res.json();

            if (!res.ok || !data.success) {
                UI.showStickyToast('Error', data.error || 'No se pudo iniciar la sincronización total', 'error');
                return;
            }

            UI.showStickyToast('Sincronización Iniciada', 'Sincronizando todas las carpetas en segundo plano', 'info', 3500);
            this.showSidebarSyncWidget({
                account_id: accountId,
                current_folder: 'Iniciando...',
                folder_index: 0,
                total_folders: 0,
                percent: 0,
                message: 'Preparando sincronización...'
            });
            this.startSyncStatusPolling();

        } catch (e) {
            console.error('Error al iniciar sincronización total:', e);
            UI.showStickyToast('Error', 'Error al conectar con el servidor', 'error');
        }
    },

    showSidebarSyncWidget(data) {
        const widget = document.getElementById('sidebar-sync-progress');
        if (!widget) return;
        widget.classList.remove('hidden');

        const titleEl = document.getElementById('sidebar-sync-title');
        const descEl = document.getElementById('sidebar-sync-desc');
        const percentEl = document.getElementById('sidebar-sync-percent');
        const barEl = document.getElementById('sidebar-sync-bar');

        if (titleEl) {
            titleEl.textContent = data.account_name ? `Sincronizando ${data.account_name}` : 'Sincronización Total';
        }
        if (descEl) {
            if (data.current_folder && data.total_folders) {
                descEl.textContent = `${data.current_folder} (${data.folder_index}/${data.total_folders})`;
            } else {
                descEl.textContent = data.message || 'Procesando correos del servidor...';
            }
        }
        const pct = Math.max(0, Math.min(100, data.percent || 0));
        if (percentEl) percentEl.textContent = `${pct}%`;
        if (barEl) barEl.style.width = `${pct}%`;
    },

    hideSidebarSyncWidget() {
        const widget = document.getElementById('sidebar-sync-progress');
        if (!widget) return;
        widget.classList.add('hidden');
    },

    startSyncStatusPolling() {
        if (this._syncPollTimer) clearInterval(this._syncPollTimer);

        this._syncPollTimer = setInterval(async () => {
            try {
                const res = await fetch('/api/accounts/sync-status');
                if (!res.ok) return;
                const status = await res.json();

                if (!status) return;

                if (status.is_syncing) {
                    this.showSidebarSyncWidget(status);
                } else {
                    clearInterval(this._syncPollTimer);
                    this._syncPollTimer = null;

                    if (status.status === 'completed') {
                        const barEl = document.getElementById('sidebar-sync-bar');
                        const percentEl = document.getElementById('sidebar-sync-percent');
                        const descEl = document.getElementById('sidebar-sync-desc');
                        if (barEl) barEl.style.width = '100%';
                        if (percentEl) percentEl.textContent = '100%';
                        if (descEl) descEl.textContent = status.message || 'Completado con éxito';

                        UI.showStickyToast('Sincronización Total Completada', status.message || `${status.total_synced || 0} correos procesados en todas las carpetas`, 'success', 5000);

                        await this.loadEmails();
                        await this.loadLabels();
                        await this.updateUnreadCounts();
                        if (window.DesktopBridge && typeof DesktopBridge.updateSystrayUnread === 'function') {
                            DesktopBridge.updateSystrayUnread();
                        }

                        setTimeout(() => {
                            this.hideSidebarSyncWidget();
                        }, 3000);
                    } else if (status.status === 'error') {
                        UI.showStickyToast('Error en Sincronización', status.error || 'Ocurrió un error en el servidor', 'error', 5000);
                        setTimeout(() => {
                            this.hideSidebarSyncWidget();
                        }, 3000);
                    } else {
                        this.hideSidebarSyncWidget();
                    }
                }
            } catch (err) {
                console.warn('Error consultando estado de sincronización:', err);
            }
        }, 1200);
    },

    toggleMoreFolders() {
        const container = document.getElementById('more-folders-container');
        const icon = document.getElementById('icon-more-folders');
        const text = document.getElementById('text-more-folders');
        if (!container) return;
        const isHidden = container.classList.toggle('hidden');
        if (text) text.textContent = isHidden ? 'Más' : 'Menos';
        if (icon) icon.classList.toggle('rotate-180', !isHidden);
    },

    // Por defecto las etiquetas de la barra lateral inician ocultas/minimizadas (true)
    sidebarLabelsMinimized: true,

    toggleSidebarLabels(forceMinimized = null) {
        const container = document.getElementById('sidebar-labels-list');
        const btnExpand = document.getElementById('btn-expand-sidebar-labels');
        const iconExpand = document.getElementById('icon-expand-sidebar-labels');
        const btnCreateLabel = document.getElementById('btn-create-sidebar-label');
        if (!container) return;

        if (typeof forceMinimized === 'boolean') {
            this.sidebarLabelsMinimized = forceMinimized;
        } else {
            this.sidebarLabelsMinimized = !this.sidebarLabelsMinimized;
        }

        container.classList.toggle('hidden', this.sidebarLabelsMinimized);
        if (btnCreateLabel) {
            btnCreateLabel.classList.toggle('hidden', this.sidebarLabelsMinimized);
        }

        const tooltipText = this.sidebarLabelsMinimized
            ? 'Ampliar y mostrar etiquetas'
            : 'Minimizar y ocultar etiquetas';
        if (btnExpand) btnExpand.title = tooltipText;
        if (iconExpand) {
            iconExpand.innerHTML = this.sidebarLabelsMinimized
                ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>'
                : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/>';
        }
    },

    getLabelAndDescendantIds(labelId) {
        const labelPool = (this.allLabels && this.allLabels.length > 0) ? this.allLabels : (this.labels || []);
        const parent = labelPool.find(l => l.id === labelId);
        if (!parent || !parent.name) return [labelId];
        const prefix = String(parent.name).trim() + '/';
        const accId = parent.account_id;
        const matchedIds = [labelId];
        labelPool.forEach(l => {
            if (l.id !== labelId && l.name) {
                const name = String(l.name).trim();
                if (name.startsWith(prefix)) {
                    if (!accId || !l.account_id || l.account_id === accId) {
                        if (!matchedIds.includes(l.id)) {
                            matchedIds.push(l.id);
                        }
                    }
                }
            }
        });
        return matchedIds;
    },

    isLabelCollapsed(labelId) {
        const labelPool = (this.allLabels && this.allLabels.length > 0) ? this.allLabels : (this.labels || []);
        const parent = labelPool.find(l => l.id === labelId);
        if (!parent || !parent.name) return false;
        const fullPath = String(parent.name).trim();
        const accKey = (this.currentAccountId ? '' : (parent.account_id || 'shared')) + '::';
        const nodeKey = accKey + fullPath;
        const prefix = fullPath + '/';
        const hasChildren = labelPool.some(l => l.id !== labelId && String(l.name || '').trim().startsWith(prefix));
        if (!hasChildren) return false;
        if (!this.collapsedLabelNodes) {
            try {
                const saved = JSON.parse(localStorage.getItem('merkemail_collapsed_label_nodes') || '[]');
                this.collapsedLabelNodes = new Set(Array.isArray(saved) ? saved : []);
            } catch (e) {
                this.collapsedLabelNodes = new Set();
            }
        }
        return this.collapsedLabelNodes.has(nodeKey);
    },

    buildLabelTree(labels) {
        const rootNodes = [];
        const nodeMap = new Map();

        // Inicializar conjunto de nodos colapsados desde localStorage
        if (!this.collapsedLabelNodes) {
            try {
                const saved = JSON.parse(localStorage.getItem('merkemail_collapsed_label_nodes') || '[]');
                this.collapsedLabelNodes = new Set(Array.isArray(saved) ? saved : []);
            } catch (e) {
                this.collapsedLabelNodes = new Set();
            }
        }

        (labels || []).forEach(label => {
            const fullPath = String(label.name || '').trim();
            const parts = fullPath.split('/').map(p => p.trim()).filter(Boolean);
            if (parts.length === 0) return;

            const accKey = (this.currentAccountId ? '' : (label.account_id || 'shared')) + '::';
            let currentPath = '';

            for (let i = 0; i < parts.length; i++) {
                const partName = parts[i];
                const parentPath = currentPath;
                currentPath = currentPath ? `${currentPath}/${partName}` : partName;
                const fullKey = accKey + currentPath;

                if (!nodeMap.has(fullKey)) {
                    const isLeaf = (i === parts.length - 1);
                    const node = {
                        key: fullKey,
                        path: currentPath,
                        name: partName,
                        fullPath: currentPath,
                        level: i,
                        label: isLeaf ? label : null,
                        children: [],
                        account_id: label.account_id
                    };
                    nodeMap.set(fullKey, node);

                    if (i === 0) {
                        rootNodes.push(node);
                    } else {
                        const parentKey = accKey + parentPath;
                        const parentNode = nodeMap.get(parentKey);
                        if (parentNode) {
                            parentNode.children.push(node);
                        } else {
                            rootNodes.push(node);
                        }
                    }
                } else if (i === parts.length - 1) {
                    const node = nodeMap.get(fullKey);
                    node.label = label;
                    node.account_id = label.account_id;
                }
            }
        });

        return rootNodes;
    },

    getLabelTreeTotalUnread(node) {
        let total = (node.label && this.unreadCounts?.labels && this.unreadCounts.labels[String(node.label.id)]) || 0;
        if (node.children && node.children.length > 0) {
            node.children.forEach(child => {
                total += this.getLabelTreeTotalUnread(child);
            });
        }
        return total;
    },

    toggleLabelCollapse(nodeKey) {
        if (!this.collapsedLabelNodes) {
            try {
                const saved = JSON.parse(localStorage.getItem('merkemail_collapsed_label_nodes') || '[]');
                this.collapsedLabelNodes = new Set(Array.isArray(saved) ? saved : []);
            } catch (e) {
                this.collapsedLabelNodes = new Set();
            }
        }
        if (this.collapsedLabelNodes.has(nodeKey)) {
            this.collapsedLabelNodes.delete(nodeKey);
        } else {
            this.collapsedLabelNodes.add(nodeKey);
        }
        try {
            localStorage.setItem('merkemail_collapsed_label_nodes', JSON.stringify([...this.collapsedLabelNodes]));
        } catch (e) {}
        this.renderLabels();

        // Si la etiqueta activa es la que se colapsó o expandió, actualizar la vista de correos
        if (this.currentLabelId) {
            const labelPool = (this.allLabels && this.allLabels.length > 0) ? this.allLabels : (this.labels || []);
            const activeLabel = labelPool.find(l => l.id === this.currentLabelId);
            if (activeLabel) {
                const accKey = (this.currentAccountId ? '' : (activeLabel.account_id || 'shared')) + '::';
                const activeKey = accKey + String(activeLabel.name || '').trim();
                if (activeKey === nodeKey) {
                    if (this.isLabelCollapsed(this.currentLabelId)) {
                        this.activeFilterLabelIds = this.getLabelAndDescendantIds(this.currentLabelId);
                    } else {
                        this.activeFilterLabelIds = null;
                    }
                    const titleEl = document.getElementById('current-folder-title');
                    if (titleEl) {
                        const hasChildren = this.getLabelAndDescendantIds(this.currentLabelId).length > 1;
                        const suffix = (this.isLabelCollapsed(this.currentLabelId) && hasChildren) ? ' (incluye sub-etiquetas)' : '';
                        titleEl.textContent = `Etiqueta: ${this.getLabelDisplayName(activeLabel.name)}${suffix}`;
                    }
                    this.loadEmails(false);
                }
            }
        }
    },

    renderLabelNode(node, nameCounts) {
        const hasChildren = node.children && node.children.length > 0;
        const isCollapsed = hasChildren && this.collapsedLabelNodes.has(node.key);
        const l = node.label;
        const isActive = l && this.currentLabelId === l.id;
        
        let unread = 0;
        if (l) {
            unread = (this.unreadCounts?.labels && this.unreadCounts.labels[String(l.id)]) || 0;
        }
        if (hasChildren && isCollapsed) {
            unread = this.getLabelTreeTotalUnread(node);
        }

        // Para raíces mostramos el nombre formateado; para sub-categorías el nombre del concepto hijo
        const leafDisplayName = node.level === 0 ? this.getLabelDisplayName(node.name) : node.name;

        // En "Todas las cuentas" se indica la cuenta dueña
        const ownerAcc = (!this.currentAccountId && l && l.account_id)
            ? (this.accounts || []).find(a => a.id === l.account_id)
            : null;
        const isDuplicateName = l && nameCounts[String(l.name || '').trim().toLowerCase()] > 1;
        const ownerName = ownerAcc ? ownerAcc.name : ((l && !l.account_id && isDuplicateName) ? 'Compartida' : '');
        const ownerHint = ownerName ? ` (${ownerName})` : '';
        const color = (l && l.color) ? l.color : '#6366f1';

        const paddingClass = node.level === 0 ? 'px-3 sm:px-4' : 'pl-2 pr-3 sm:pr-4';

        let html = `
            <div class="label-tree-node flex flex-col">
                <div class="label-nav-btn group flex items-center justify-between ${paddingClass} py-1.5 rounded-r-full cursor-pointer transition-colors ${
                    isActive 
                        ? 'bg-indigo-50 dark:bg-indigo-950/70 font-bold text-indigo-700 dark:text-indigo-300 border-l-2 border-indigo-600 dark:border-indigo-400' 
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }" ${l ? `onclick="EmailManager.filterByLabel(${l.id})"` : `onclick="EmailManager.toggleLabelCollapse('${this.escapeHtml(node.key)}')"`} title="${this.escapeHtml((node.fullPath || leafDisplayName) + ownerHint)}">
                    
                    <div class="label-left-content flex items-center gap-1.5 min-w-0 flex-1">
                        ${hasChildren ? `
                            <button type="button" 
                                    class="label-collapse-btn sidebar-text p-0.5 -ml-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-transform cursor-pointer shrink-0" 
                                    onclick="event.stopPropagation(); EmailManager.toggleLabelCollapse('${this.escapeHtml(node.key)}')" 
                                    title="${isCollapsed ? 'Desplegar sub-etiquetas' : 'Colapsar sub-etiquetas'}">
                                <svg class="w-3.5 h-3.5 transition-transform duration-150 ${isCollapsed ? '-rotate-90' : 'rotate-0'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                </svg>
                            </button>
                        ` : `
                            <span class="sidebar-text w-3.5 h-3.5 shrink-0 -ml-1"></span>
                        `}
                        <span class="label-dot w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style="background-color: ${color}"></span>
                        <span class="sidebar-text truncate text-xs">${this.escapeHtml(leafDisplayName)}${ownerName ? `<span class="ml-1 text-[10px] font-normal text-slate-400 dark:text-slate-500">· ${this.escapeHtml(ownerName)}</span>` : ''}</span>
                    </div>

                    <div class="sidebar-text flex items-center gap-1.5 shrink-0 ml-1">
                        ${l ? `
                            <span class="sidebar-badge text-[11px] px-2 py-0.5 rounded-full font-bold bg-slate-200/80 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 ${unread > 0 ? '' : 'hidden'}" id="label-badge-${l.id}">
                                ${unread > 999 ? '999+' : unread}
                            </span>
                            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onclick="event.stopPropagation(); EmailManager.openEditLabelModal(${l.id}, '${this.escapeHtml(l.name)}', '${l.color || '#3b82f6'}')" class="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400" title="Editar etiqueta">
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                                </button>
                                <button onclick="event.stopPropagation(); EmailManager.deleteLabel(${l.id}, '${this.escapeHtml(l.name)}')" class="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400" title="Eliminar etiqueta">
                                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                </button>
                            </div>
                        ` : `
                            <span class="sidebar-badge text-[11px] px-2 py-0.5 rounded-full font-bold bg-slate-200/80 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 ${unread > 0 ? '' : 'hidden'}">
                                ${unread > 999 ? '999+' : unread}
                            </span>
                        `}
                    </div>
                </div>
        `;

        if (hasChildren) {
            html += `
                <div class="label-children-container flex flex-col space-y-0.5 border-l border-slate-200/70 dark:border-slate-800/70 ml-4 my-0.5 ${isCollapsed ? 'hidden' : ''}">
                    ${node.children.map(child => this.renderLabelNode(child, nameCounts)).join('')}
                </div>
            `;
        }

        html += `</div>`;
        return html;
    },

    renderLabels() {
        const container = document.getElementById('sidebar-labels-list');
        const countBadge = document.getElementById('sidebar-labels-count-badge');
        const btnCreateLabel = document.getElementById('btn-create-sidebar-label');
        if (countBadge) {
            countBadge.textContent = (this.labels && this.labels.length) ? String(this.labels.length) : '0';
        }
        if (btnCreateLabel) {
            btnCreateLabel.classList.toggle('hidden', !!this.sidebarLabelsMinimized);
        }
        if (!container) return;
        container.classList.toggle('hidden', !!this.sidebarLabelsMinimized);

        if (!this.labels || this.labels.length === 0) {
            container.innerHTML = `
                <div class="px-4 py-1.5 text-[11px] text-slate-400 italic">
                    Sin etiquetas
                </div>
            `;
            return;
        }

        // Nombres repetidos en la lista (p. ej. "Trabajo" compartida y "Trabajo" de una cuenta)
        const nameCounts = {};
        this.labels.forEach(l => {
            const key = String(l.name || '').trim().toLowerCase();
            nameCounts[key] = (nameCounts[key] || 0) + 1;
        });

        const rootNodes = this.buildLabelTree(this.labels);
        container.innerHTML = rootNodes.map(node => this.renderLabelNode(node, nameCounts)).join('');
    },

    filterByLabel(labelId) {
        if (window.innerWidth < 768 && window.UI) UI.closeMobileSidebar();
        this.clearAdvancedFiltersState();
        this.currentLabelId = labelId;
        this.currentFolder = null;
        this.currentPage = 1;
        this.clearSelection();

        // Si la etiqueta tiene sub-etiquetas y está colapsada, mostrar correos de ella y todos sus descendientes
        if (this.isLabelCollapsed(labelId)) {
            this.activeFilterLabelIds = this.getLabelAndDescendantIds(labelId);
        } else {
            this.activeFilterLabelIds = null;
        }

        // Asegurar vista de correo y desaparecer cualquier otra vista activa (notas o calendario)
        if (window.UI && typeof UI.switchMainView === 'function') {
            UI.switchMainView('mail');
        } else {
            const sectionMail = document.getElementById('main-mail-section');
            const sectionCalendar = document.getElementById('main-calendar-section');
            const sectionNotes = document.getElementById('main-notes-section');
            if (sectionMail) sectionMail.classList.remove('hidden');
            if (sectionCalendar) sectionCalendar.classList.add('hidden');
            if (sectionNotes) sectionNotes.classList.add('hidden');
        }

        // Quitar active-folder de carpetas
        document.querySelectorAll('.folder-nav-btn').forEach(b => {
            b.classList.remove('active-folder', 'bg-indigo-50', 'dark:bg-indigo-950/70', 'text-indigo-600', 'dark:text-indigo-400', 'font-bold');
            b.classList.add('text-slate-700', 'dark:text-slate-300');
        });

        // Actualizar título
        const labelPool = (this.allLabels && this.allLabels.length > 0) ? this.allLabels : (this.labels || []);
        const label = labelPool.find(l => l.id === labelId);
        const titleEl = document.getElementById('current-folder-title');
        if (titleEl && label) {
            const hasChildren = this.getLabelAndDescendantIds(labelId).length > 1;
            const suffix = (this.isLabelCollapsed(labelId) && hasChildren) ? ' (incluye sub-etiquetas)' : '';
            titleEl.textContent = `Etiqueta: ${this.getLabelDisplayName(label.name)}${suffix}`;
        }

        this.renderLabels();
        this.backToList();
        this.loadEmails();
    },

    // Cuenta principal: la marcada como predeterminada (is_default) o, si no hay, la primera
    getPrimaryAccountId() {
        const accs = this.accounts || [];
        const def = accs.find(a => Number(a.is_default) === 1) || accs.find(a => Number(a.is_active) === 1) || accs[0];
        return def ? def.id : null;
    },

    // Abre el modal de etiqueta. `accountId` = cuenta donde se creará; `assignToEmailId` = correo
    // al que se asignará automáticamente tras crearla (creación desde la vista del correo).
    _openLabelModal({ title, labelId = '', name = '', color = '#3b82f6', accountId = null, assignToEmailId = null, info = '' }) {
        document.getElementById('modal-label-title').textContent = title;
        document.getElementById('manage-label-id').value = labelId;
        const accEl = document.getElementById('manage-label-account-id');
        if (accEl) accEl.value = accountId || '';
        this.pendingLabelAssignEmailId = assignToEmailId;
        const infoEl = document.getElementById('manage-label-account-info');
        if (infoEl) {
            infoEl.innerHTML = info;
            infoEl.classList.toggle('hidden', !info);
        }
        document.getElementById('manage-label-name').value = name;
        this.selectLabelColor(color || '#3b82f6');
        document.getElementById('modal-manage-label').classList.remove('hidden');
        setTimeout(() => document.getElementById('manage-label-name').focus(), 100);
    },

    _accountLabelText(accountId) {
        const acc = (this.accounts || []).find(a => a.id === accountId);
        return acc ? `<strong>${this.escapeHtml(acc.name)}</strong> (${this.escapeHtml(acc.email)})` : 'la cuenta seleccionada';
    },

    // Crear desde la barra lateral:
    //  - "Todas las cuentas": en la cuenta principal (si luego se asigna a correos de otras
    //    cuentas, el backend crea la etiqueta homónima en cada una de esas cuentas).
    //  - Una cuenta seleccionada: en la cuenta del correo abierto y asignada a ese correo;
    //    si no hay correo abierto, en la cuenta seleccionada.
    openCreateLabelModal() {
        if (!this.currentAccountId) {
            const accountId = this.getPrimaryAccountId();
            this._openLabelModal({
                title: 'Nueva Etiqueta', accountId,
                info: `Se creará en la cuenta principal ${this._accountLabelText(accountId)}. Si la asignas a correos de otras cuentas, se creará también en esas cuentas.`
            });
            return;
        }
        const opened = this.getOpenedEmail();
        if (opened) {
            this.openCreateLabelModalForAccount(opened.account_id, opened.id);
            return;
        }
        this._openLabelModal({
            title: 'Nueva Etiqueta', accountId: this.currentAccountId,
            info: `Se creará en la cuenta ${this._accountLabelText(this.currentAccountId)}.`
        });
    },

    // Correo abierto actualmente en el visor (o null)
    getOpenedEmail() {
        const em = this.currentOpenedEmail;
        return (em && this.selectedEmailId && em.id === this.selectedEmailId) ? em : null;
    },

    // Crear desde la vista del correo: en la cuenta del correo abierto y asignada a ese correo
    openCreateLabelModalForAccount(accountId, emailId = null) {
        document.querySelectorAll('[id^="email-label-dropdown"]').forEach(el => el.classList.add('hidden'));
        const opened = this.getOpenedEmail();
        const subject = (opened && opened.id === emailId) ? (opened.subject || '(sin asunto)') : '';
        const info = `Se creará en la cuenta ${this._accountLabelText(accountId)}` +
            (emailId ? ` y se asignará al correo abierto${subject ? `: <em>${this.escapeHtml(subject)}</em>` : ''}` : '') + '.';
        this._openLabelModal({ title: 'Nueva Etiqueta en Cuenta', accountId, assignToEmailId: emailId, info });
    },

    openEditLabelModal(labelId, labelName, labelColor) {
        this._openLabelModal({ title: 'Editar Etiqueta', labelId, name: labelName, color: labelColor });
    },

    selectLabelColor(color) {
        const input = document.getElementById('manage-label-color');
        const text = document.getElementById('manage-label-color-val');
        if (input) input.value = color;
        if (text) text.textContent = color;
    },

    async saveLabel(e) {
        e.preventDefault();
        const id = document.getElementById('manage-label-id').value;
        const name = document.getElementById('manage-label-name').value.trim();
        const color = document.getElementById('manage-label-color').value;
        const accIdVal = document.getElementById('manage-label-account-id')?.value;
        const account_id = accIdVal ? parseInt(accIdVal) : (this.currentAccountId || this.getPrimaryAccountId());
        const assignToEmailId = id ? null : this.pendingLabelAssignEmailId;

        if (!name) {
            UI.showStickyToast('Nombre requerido', 'Ingresa el nombre de la etiqueta', 'warning');
            return;
        }

        try {
            if (id) {
                const res = await fetch(`/api/labels/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, color, account_id })
                });
                if (!res.ok) throw new Error('Error al actualizar');
                const upd = await res.json().catch(() => ({}));
                UI.showStickyToast('Etiqueta Actualizada', `Se guardó "${name}" correctamente`, 'success');
                if (upd.gmail_error) {
                    UI.showStickyToast('Gmail', 'El cambio se guardó en Senda pero no se pudo aplicar en Gmail.', 'warning', 6000);
                }
            } else {
                const res = await fetch('/api/labels', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, color, account_id })
                });
                if (!res.ok) throw new Error('Error al crear');
                const created = await res.json();

                // Creada desde la vista del correo: asignarla automáticamente a ese correo
                if (assignToEmailId && created.label_id) {
                    const resAssign = await fetch(`/api/emails/${assignToEmailId}/labels`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ label_id: created.label_id })
                    });
                    if (!resAssign.ok) throw new Error('La etiqueta se creó pero no se pudo asignar al correo');
                    this.emailDetailCache.delete(assignToEmailId);
                }

                const accName = ((this.accounts || []).find(a => a.id === account_id) || {}).name || 'la cuenta';
                const what = created.existing ? `La etiqueta "${name}" ya existía en ${accName}` : `La etiqueta "${name}" se creó en ${accName}`;
                const gmail = created.gmail || {};
                const gmailTxt = gmail.is_gmail ? (gmail.synced ? ' (también en Gmail)' : '') : '';
                UI.showStickyToast(
                    created.existing ? 'Etiqueta Existente' : 'Etiqueta Creada',
                    (assignToEmailId ? `${what}${gmailTxt} y se asignó al correo` : `${what}${gmailTxt}`),
                    'success'
                );
                if (gmail.is_gmail && !gmail.synced) {
                    UI.showStickyToast('Gmail no disponible',
                        'La etiqueta quedó guardada en Senda y se creará en Gmail en la próxima sincronización.',
                        'warning', 6000);
                }
            }

            this.pendingLabelAssignEmailId = null;
            document.getElementById('modal-manage-label').classList.add('hidden');
            await this.loadLabels();
            if (this.selectedEmailId) {
                await this.openEmailDetail(this.selectedEmailId);
            }
            if (this.currentLabelId || assignToEmailId) {
                await this.loadEmails(false);
            }
        } catch (err) {
            UI.showStickyToast('Error', err.message, 'error');
        }
    },

    async deleteLabel(labelId, labelName) {
        const confirmed = await UI.confirm({
            title: '¿Eliminar etiqueta?',
            message: `¿Estás seguro de eliminar la etiqueta "${labelName}"? Los correos no se borrarán, solo perderán esta etiqueta.` +
                (((this.allLabels || []).find(l => l.id === labelId) || {}).remote_id ? ' La etiqueta también se eliminará en Gmail.' : ''),
            confirmText: 'Eliminar Etiqueta',
            cancelText: 'Cancelar',
            isDanger: true
        });

        if (!confirmed) return;

        try {
            const res = await fetch(`/api/labels/${labelId}`, { method: 'DELETE' });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || 'No se pudo eliminar la etiqueta');
            }

            UI.showStickyToast('Etiqueta Eliminada', `Se eliminó "${labelName}" con éxito`, 'success');

            if (this.currentLabelId === labelId) {
                this.currentLabelId = null;
                this.currentFolder = 'INBOX';
                const firstFolderBtn = document.querySelector('.folder-nav-btn[data-folder="INBOX"]');
                if (firstFolderBtn) firstFolderBtn.click();
            }

            await this.loadLabels();
            await this.loadEmails(false);
        } catch (err) {
            UI.showStickyToast('Error al eliminar', err.message, 'error');
        }
    },

    async addLabelToEmail(emailId, labelId) {
        try {
            const res = await fetch(`/api/emails/${emailId}/labels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label_id: labelId })
            });
            if (!res.ok) throw new Error('Error al asociar etiqueta');
            this.emailDetailCache.delete(emailId);
            document.querySelectorAll('[id^="email-label-dropdown"]').forEach(el => el.classList.add('hidden'));
            UI.showStickyToast('Etiqueta Asignada', 'Se ha asignado la etiqueta al correo', 'success');
            await this.openEmailDetail(emailId);
            await this.loadEmails(false);
            // Recargar etiquetas: el uso por cuenta cambia y también los contadores
            await this.loadLabels();
        } catch (err) {
            UI.showStickyToast('Error', err.message, 'error');
        }
    },

    async removeLabelFromEmail(emailId, labelId, e) {
        if (e) e.stopPropagation();
        try {
            const res = await fetch(`/api/emails/${emailId}/labels/${labelId}`, {
                method: 'DELETE'
            });
            if (!res.ok) throw new Error('Error al desasociar etiqueta');
            this.emailDetailCache.delete(emailId);
            document.querySelectorAll('[id^="email-label-dropdown"]').forEach(el => el.classList.add('hidden'));
            UI.showStickyToast('Etiqueta Removida', 'Se quitó la etiqueta del correo actual', 'info');
            await this.openEmailDetail(emailId);
            await this.loadEmails(false);
            // Recargar etiquetas: el uso por cuenta cambia y también los contadores
            await this.loadLabels();
        } catch (err) {
            UI.showStickyToast('Error', err.message, 'error');
        }
    },

    async toggleLabelOnCurrentEmail(emailId, labelId, isCurrentlyAssigned) {
        if (isCurrentlyAssigned) {
            await this.removeLabelFromEmail(emailId, labelId);
        } else {
            await this.addLabelToEmail(emailId, labelId);
        }
    },

    async archiveCurrentEmail(emailId) {
        if (!this.canBatchArchiveInCurrentFolder() && ['ALL', 'TODOS'].includes((this.currentFolder || '').toUpperCase())) {
            UI.showStickyToast('Acción no permitida', 'No se permite archivar correos desde Todos', 'warning');
            return;
        }
        const folderUpper = (this.currentFolder || (this.currentOpenedEmail && this.currentOpenedEmail.folder) || '').toUpperCase();
        if (['SPAM', 'TRASH', 'DRAFT', 'DRAFTS'].includes(folderUpper) || (this.currentOpenedEmail && ['SPAM', 'TRASH', 'DRAFT', 'DRAFTS'].includes((this.currentOpenedEmail.folder || '').toUpperCase()))) {
            UI.showStickyToast('Acción no permitida', 'No se permite almacenar o archivar correos en Spam, Papelera o Borradores', 'warning');
            return;
        }

        try {
            const res = await fetch('/api/emails/batch-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email_ids: [emailId],
                    action: 'archive'
                })
            });
            const data = await res.json();
            if (data.success) {
                UI.showStickyToast('Correo Archivado', 'El correo fue archivado y retirado de la carpeta actual', 'success');
                await this.loadEmails(false);
                await this.updateUnreadCounts();
                this.backToList();
            } else {
                UI.showStickyToast('Error', data.detail || 'No se pudo archivar', 'error');
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    async markSpamCurrentEmail(emailId) {
        const isSpam = (this.currentOpenedEmail && (this.currentOpenedEmail.folder === 'SPAM' || this.currentFolder === 'SPAM'));
        try {
            const res = await fetch('/api/emails/batch-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email_ids: [emailId],
                    action: 'spam'
                })
            });
            const data = await res.json();
            if (data.success) {
                const title = isSpam ? 'No es spam' : 'Marcado como Spam';
                const msg = isSpam 
                    ? 'El correo se marcó como legítimo y se restauró a Recibidos' 
                    : 'El correo se marcó como spam y se movió a la carpeta Spam';
                UI.showStickyToast(title, msg, 'success');
                await this.loadEmails(false);
                await this.updateUnreadCounts();
                this.backToList();
            } else {
                UI.showStickyToast('Error', data.detail || 'No se pudo procesar Spam', 'error');
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    async toggleReadCurrentEmail(emailId) {
        try {
            const res = await fetch(`/api/emails/${emailId}/toggle-read`, {
                method: 'POST'
            });
            const data = await res.json();
            if (data.status === 'ok') {
                const isNowRead = data.is_read === 1;
                UI.showStickyToast(
                    isNowRead ? 'Marcado como visto' : 'Marcado como no leído',
                    isNowRead ? 'El correo se marcó como leído' : 'El correo se marcó como no leído',
                    'info',
                    2000
                );
                // Si el temporizador de 7 segundos está corriendo para este correo, cancelarlo
                if (this.readTimerId) {
                    clearTimeout(this.readTimerId);
                    this.readTimerId = null;
                }
                if (this.currentOpenedEmail && this.currentOpenedEmail.id === emailId) {
                    this.currentOpenedEmail.is_read = data.is_read;
                    this.updateTopBarReadButton(isNowRead);
                }
                this.updateEmailItemReadStatus(emailId, isNowRead);
                await this.updateUnreadCounts();
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    updateTopBarReadButton(isRead) {
        const btn = document.getElementById('btn-top-toggle-read');
        if (!btn) return;
        btn.title = isRead ? 'Marcar como no leído' : 'Marcar como visto';
        btn.innerHTML = isRead ? `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
        ` : `
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5"/></svg>
        `;
    },

    toggleAssignLabelDropdown(emailId, e) {
        if (e) e.stopPropagation();
        const drop = document.getElementById(`email-label-dropdown-top-${emailId}`) || document.getElementById(`email-label-dropdown-${emailId}`);
        if (!drop) return;

        const isHidden = drop.classList.contains('hidden');
        document.querySelectorAll('[id^="email-label-dropdown"]').forEach(el => {
            if (el !== drop) el.classList.add('hidden');
        });

        if (!isHidden) {
            drop.classList.add('hidden');
            return;
        }

        // Montar en document.body con position: fixed y z-index máximo para flotar sobre el iframe y evitar scrollbars en la barra
        const btn = document.getElementById(`btn-toggle-email-labels-top-${emailId}`) || (e && e.currentTarget);
        if (drop.parentElement !== document.body) {
            document.body.appendChild(drop);
        }

        if (btn && btn.getBoundingClientRect) {
            const rect = btn.getBoundingClientRect();
            drop.style.position = 'fixed';
            drop.style.top = `${Math.round(rect.bottom + 6)}px`;
            drop.style.right = `${Math.max(12, Math.round(window.innerWidth - rect.right))}px`;
            drop.style.left = 'auto';
            drop.style.zIndex = '9999';
        }

        drop.classList.remove('hidden');
    },

    async loadEmails(showLoading = true) {
        const listContainer = document.getElementById('emails-split-list');
        if (!listContainer) return;

        if (showLoading && (!this.emails || this.emails.length === 0)) {
            listContainer.innerHTML = `<div class="py-12 text-center text-slate-400 text-xs">Cargando correos...</div>`;
        }

        const params = new URLSearchParams();
        params.append('page', this.currentPage);
        params.append('page_size', this.pageSize);

        const hasAdv = this.hasActiveAdvancedFilters();

        if (hasAdv) {
            const f = this.advancedFilters;
            if (f.keyword) params.append('search', f.keyword);
            if (f.sender) params.append('sender', f.sender);
            if (f.recipient) params.append('recipient', f.recipient);
            if (f.subject) params.append('subject', f.subject);
            
            // Carpeta: si el usuario eligió una en el filtro o si navega en una carpeta
            if (f.folder) {
                params.append('folder', f.folder);
            } else if (this.currentFolder && this.currentFolder !== 'INBOX') {
                params.append('folder', this.currentFolder);
            } else {
                params.append('folder', 'ALL'); // En búsqueda avanzada general, buscar en todas
            }

            // Cuenta
            if (f.accountId) {
                params.append('account_id', f.accountId);
            } else if (this.currentAccountId) {
                params.append('account_id', this.currentAccountId);
            }

            // Múltiples etiquetas
            if (f.labelIds && f.labelIds.length > 0) {
                params.append('label_ids', f.labelIds.join(','));
            } else if (this.activeFilterLabelIds && this.activeFilterLabelIds.length > 0) {
                params.append('label_ids', this.activeFilterLabelIds.join(','));
            } else if (this.currentLabelId) {
                params.append('label_id', this.currentLabelId);
            }

            // Fechas y horas
            if (f.dateFrom) params.append('date_from', f.dateFrom);
            if (f.dateTo) params.append('date_to', f.dateTo);

            // Adjuntos
            if (f.hasAttachments) params.append('has_attachments', 'true');

            // Destacados
            if (f.isStarred === true) params.append('is_starred', 'true');
            if (f.isStarred === false) params.append('is_starred', 'false');

            // Lectura
            if (f.readStatus && f.readStatus !== 'all') params.append('read_status', f.readStatus);

            // Urgencia IA
            if (f.aiUrgency) params.append('ai_urgency', f.aiUrgency);
        } else {
            if (this.activeFilterLabelIds && this.activeFilterLabelIds.length > 0) {
                params.append('label_ids', this.activeFilterLabelIds.join(','));
            } else if (this.currentLabelId) {
                params.append('label_id', this.currentLabelId);
            } else {
                params.append('folder', this.currentFolder || 'INBOX');
            }
            if (this.currentAccountId) params.append('account_id', this.currentAccountId);
            if (this.searchQuery) params.append('search', this.searchQuery);
        }

        const url = `/api/emails?${params.toString()}`;

        try {
            const res = await fetch(url);
            const data = await res.json();
            this.emails = data.items || [];
            // Orden descendente estricto por fecha y hora de recibido en el buzón (el más nuevo arriba, el más viejo al final)
            if (Array.isArray(this.emails)) {
                this.emails.sort((a, b) => {
                    const timeA = a.date ? new Date(a.date).getTime() : 0;
                    const timeB = b.date ? new Date(b.date).getTime() : 0;
                    if (timeA !== timeB) return timeB - timeA;
                    return (b.id || 0) - (a.id || 0);
                });
            }
            this.totalEmails = data.total || 0;
            this.totalPages = data.total_pages || 1;

            this.updateActiveFiltersBanner();
            this.renderEmailsTable();
            this.renderPagination();
            this.updateSystemSyncPill(Object.keys(this.accountErrors).length > 0 ? 'problems' : 'active');

            // Si el backend lanzó una sincronización en segundo plano para poblar una carpeta vacía, refrescar silenciosamente
            if (data.background_sync) {
                setTimeout(() => {
                    this.loadEmails(false);
                }, 2200);
            }

            // Monitorear y alertar de correos nuevos recibidos
            if (window.NotificationManager && typeof NotificationManager.checkNewEmails === 'function') {
                NotificationManager.checkNewEmails(this.emails, this.currentFolder);
            }

            // Actualizar la descripción de bienvenida del asistente Elio
            if (window.AntigravityCopilot && typeof AntigravityCopilot.updateConnectedServices === 'function') {
                AntigravityCopilot.updateConnectedServices();
            }

            // Actualizar badge de contactos pendientes en el menú lateral
            if (window.ContactsManager && typeof ContactsManager.loadContacts === 'function') {
                ContactsManager.loadContacts();
            }
        } catch (e) {
            this.resetDetailView();
            listContainer.innerHTML = window.UI ? UI.renderErrorState({
                title: 'No pudimos conectar con tus correos',
                message: 'Parece que el servicio local no está respondiendo o se interrumpió la red. Tus datos guardados están seguros.',
                retryAction: 'EmailManager.retryFullConnection()',
                retryText: 'Reintentar conexión',
                size: 'md'
            }) : `<div class="py-12 text-center text-rose-400 text-xs">No pudimos conectar con tus correos. Intenta de nuevo.</div>`;
            this.updateSystemSyncPill('inactive', 'Sin conexión con el servidor backend');
            if (window.GeminiAI) GeminiAI.setDisconnectedState();
        }
    },

    renderEmailsTable() {
        const listContainer = document.getElementById('emails-split-list');
        if (!listContainer) return;

        const displayEmails = this.selectedCategory 
            ? this.emails.filter(e => this.matchesCategory(e, this.selectedCategory))
            : this.emails;

        if (displayEmails.length === 0) {
            this.resetDetailView();
            listContainer.innerHTML = `
                <div class="py-16 text-center text-slate-400 dark:text-slate-500 text-xs">
                    <svg class="w-8 h-8 stroke-1 opacity-50 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
                    <span>${this.selectedCategory ? `No se encontraron correos en la categoría '${this.selectedCategory}'` : 'No se encontraron correos en esta bandeja'}</span>
                </div>
            `;
            return;
        }

        // Si el correo actualmente seleccionado ya no se encuentra en la lista filtrada o nueva carpeta, resetear visor
        if (this.selectedEmailId && !displayEmails.some(e => e.id === this.selectedEmailId)) {
            this.resetDetailView();
        }

        listContainer.innerHTML = displayEmails.map(email => {
            const isUnread = !email.is_read;
            const isStarred = Boolean(email.is_starred);
            const isSelected = this.selectedEmailId === email.id;
            const accColor = email.account_color || '#3b82f6';
            
            // Formato de hora/fecha estilo Gmail (ej: "2:02 p.m." si es hoy, o "14 nov")
            let dateStr = '';
            if (email.date) {
                const d = new Date(email.date);
                const now = new Date();
                if (d.toDateString() === now.toDateString()) {
                    dateStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                } else {
                    dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
                }
            }

            // Obtener datos del remitente y cuenta receptora
            const accId = email.account_id;
            const matchedAcc = (this.accounts && this.accounts.length > 0)
                ? this.accounts.find(a => a.id === accId)
                : null;
            const accName = email.account_name || (matchedAcc ? matchedAcc.name : '') || 'Cuenta';

            // En Enviados/Borradores mostrar avatar del destinatario; en Bandeja de Entrada/resto mostrar del remitente que lo envió
            const isSentOrDraft = ['SENT', 'DRAFT', 'DRAFTS', 'BORRADORES', 'ENVIADOS'].includes(String(email.folder || '').toUpperCase());
            const contactTarget = isSentOrDraft ? (email.recipient || email.sender) : (email.sender || email.recipient);
            const contactName = isSentOrDraft ? (email.recipient_name || contactTarget) : (email.sender_name || contactTarget);
            const cleanTargetEmail = (window.AvatarService ? AvatarService.cleanEmail(contactTarget) : contactTarget) || contactTarget;
            const displayName = contactName || cleanTargetEmail.split('@')[0] || 'U';
            const safeAvatarTitle = `${this.escapeHtml(displayName)}${cleanTargetEmail ? ' (' + this.escapeHtml(cleanTargetEmail) + ')' : ''}${accName ? ' • Cuenta: ' + this.escapeHtml(accName) : ''}`;

            const senderAvatarHtml = (window.AvatarService)
                ? `<div class="email-sender-avatar shrink-0 flex items-center justify-center" title="${safeAvatarTitle}">${AvatarService.render(cleanTargetEmail, displayName, 'w-5 h-5 text-[10px]', 'shadow-2xs', accColor)}</div>`
                : `<span class="email-sender-avatar w-5 h-5 rounded-full shrink-0 flex items-center justify-center font-bold text-white text-[10px] shadow-2xs select-none" style="background-color: ${accColor}" title="${safeAvatarTitle}">${(displayName || 'U').charAt(0).toUpperCase()}</span>`;

            return `
                <div onclick="EmailManager.openEmailDetail(${email.id})" id="email-item-${email.id}" data-account-color="${accColor}" style="--account-accent-color: ${accColor}; ${isSelected ? `border-left-color: ${accColor} !important;` : ''}" class="email-list-item group relative px-3 py-2.5 cursor-pointer transition-all select-none ${isSelected ? 'selected' : ''} ${
                    isUnread 
                        ? 'bg-slate-50/80 dark:bg-slate-850/80 hover:bg-slate-100 dark:hover:bg-slate-800' 
                        : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-850/60'
                }">
                    <div class="flex items-center gap-2 mb-0.5">
                        <!-- Checkbox individual -->
                        <input type="checkbox" data-email-id="${email.id}" ${this.selectedBatchIds.has(email.id) ? 'checked' : ''} onchange="EmailManager.onCheckboxChange(${email.id}, this.checked)" onclick="event.stopPropagation();" class="email-checkbox w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-indigo-600 focus:ring-0 cursor-pointer shrink-0">

                        <!-- Estrella -->
                        <button onclick="EmailManager.toggleStar(${email.id}, event)" class="email-star-btn p-0.5 text-slate-400 hover:text-amber-400 transition-colors shrink-0">
                            <svg class="w-3.5 h-3.5 ${isStarred ? 'text-amber-400 fill-amber-400' : 'fill-none'}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
                        </button>

                        <!-- Avatar del Remitente -->
                        ${senderAvatarHtml}

                        <!-- Remitente -->
                        <span class="email-item-sender text-xs truncate flex-1 min-w-0 ${isUnread ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-300'}">
                            ${this.escapeHtml(email.sender)}
                        </span>

                        <!-- Fecha/Hora y Clip Adjunto -->
                        <div class="flex items-center gap-1.5 shrink-0">
                            ${email.has_attachments ? `
                                <span title="Tiene archivos adjuntos" class="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                                    </svg>
                                </span>
                            ` : ''}
                            <span class="email-item-date text-[11px] whitespace-nowrap ${isUnread ? 'font-bold text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}">
                                ${dateStr}
                            </span>
                        </div>
                    </div>

                    <!-- Asunto -->
                    <div class="email-item-subject text-xs truncate mb-0.5 pl-6 ${isUnread ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}">
                        ${this.escapeHtml(email.subject || '(Sin Asunto)')}
                    </div>

                    <!-- Snippet Vista Previa & Badges Etiquetas y Categorías IA -->
                    <div class="email-item-snippet text-[11px] text-slate-500 dark:text-slate-400 truncate pl-6 font-normal flex items-center gap-1.5 flex-wrap">
                        ${this.renderAiCategoryBadge(email.ai_tags)}
                        ${(email.labels && email.labels.length > 0) ? email.labels.map(lbl => `
                            <span class="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.2 rounded" style="background-color: ${lbl.color}22; color: ${lbl.color}; border: 1px solid ${lbl.color}44;">
                                ${this.escapeHtml(this.getLabelDisplayName(lbl.name))}
                            </span>
                        `).join('') : ''}
                        <span class="truncate">${this.escapeHtml(this.cleanSnippet(email.snippet || email.body_text || email.body_html || ''))}</span>
                    </div>
                </div>
            `;
        }).join('');

        // Actualizar contadores de no leídos de todas las carpetas y etiquetas
        this.updateUnreadCounts();

        // Si no hay correo seleccionado y hay correos en la lista, abrir automáticamente el primero
        if (!this.selectedEmailId && displayEmails.length > 0 && window.innerWidth >= 768) {
            this.openEmailDetail(displayEmails[0].id);
        } else if (this.selectedEmailId) {
            this.highlightSelectedItem(this.selectedEmailId);
        }

        // Sincronizar estado visual de los checkboxes y barra masiva
        this.updateBatchSelectionUI();

        // Precarga en segundo plano de los primeros 3 correos para visualización ultrarrápida
        if (this.emails && this.emails.length > 0) {
            const prefetchIds = this.emails.slice(0, 3).map(e => e.id);
            setTimeout(() => this.prefetchEmails(prefetchIds), 200);
        }
    },

    async prefetchEmails(emailIds = []) {
        if (!emailIds || emailIds.length === 0) return;
        for (const id of emailIds) {
            if (!this.emailDetailCache.has(id)) {
                try {
                    const res = await fetch(`/api/emails/${id}`);
                    if (res.ok) {
                        const data = await res.json();
                        this.emailDetailCache.set(id, data);
                    }
                } catch (e) {}
            }
        }
    },

    highlightSelectedItem(emailId) {
        document.querySelectorAll('.email-list-item').forEach(el => {
            el.classList.remove('selected');
            el.style.removeProperty('border-left-color');
        });
        const current = document.getElementById(`email-item-${emailId}`);
        if (current) {
            current.classList.add('selected');
            const color = current.getAttribute('data-account-color') || '#4f46e5';
            current.style.setProperty('border-left-color', color, 'important');
        }
    },

    renderPagination() {
        const infoEl = document.getElementById('table-pagination-info');
        const prevBtn = document.getElementById('table-prev-btn');
        const nextBtn = document.getElementById('table-next-btn');

        if (infoEl) {
            const start = this.totalEmails > 0 ? (this.currentPage - 1) * this.pageSize + 1 : 0;
            const end = Math.min(this.currentPage * this.pageSize, this.totalEmails);
            infoEl.textContent = `${start}-${end} de ${this.totalEmails}`;
        }

        if (prevBtn) prevBtn.disabled = this.currentPage <= 1;
        if (nextBtn) nextBtn.disabled = this.currentPage >= this.totalPages;
    },

    async openEmailDetail(emailId) {
        // Cancelar cualquier temporizador de lectura en curso si se cambia de correo antes de los 7s
        this.cancelReadTimer();

        // Al abrir un correo, asegurar que la vista de correos esté activa y desaparecer notas o calendario
        if (window.UI && typeof UI.switchMainView === 'function') {
            const sectionNotes = document.getElementById('main-notes-section');
            if (sectionNotes && !sectionNotes.classList.contains('hidden')) {
                UI.switchMainView('mail');
            }
        }

        this.selectedEmailId = emailId;
        this.highlightSelectedItem(emailId);
        
        const detailPanel = document.getElementById('email-detail-container');
        const listPanel = document.getElementById('email-list-container');
        if (!detailPanel) return;

        // En pantallas móviles / angostas (< 768px): ocultar lista y mostrar detalle a pantalla completa
        if (window.innerWidth < 768) {
            if (listPanel) listPanel.classList.add('hidden');
            detailPanel.classList.remove('hidden');
            detailPanel.classList.add('flex');
        } else {
            detailPanel.classList.remove('hidden');
            detailPanel.classList.add('flex');
        }

        let email = this.emailDetailCache.get(emailId);
        if (!email) {
            detailPanel.innerHTML = `<div class="p-8 text-center text-slate-400 text-xs">Cargando correo...</div>`;
        }

        try {
            if (!email) {
                const res = await fetch(`/api/emails/${emailId}`);
                email = await res.json();
                this.emailDetailCache.set(emailId, email);
            }
            this.currentOpenedEmail = email;
            
            // Programar el marcado como visto tras 7 segundos de estar seleccionado
            const item = this.emails.find(e => e.id === emailId);
            const isUnread = (!email.is_read) || (item && !item.is_read);

            if (isUnread) {
                this.pendingReadEmailId = emailId;
                this.readTimerId = setTimeout(() => {
                    this.markEmailAsReadAfterDelay(emailId);
                }, 7000);
            }

            const isStarred = Boolean(email.is_starred);
            const dateFormatted = new Date(email.date).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' });
            const initial = (email.sender || 'U')[0].toUpperCase();
            const emailLabels = email.labels || [];
            const assignedLabelIds = new Set(emailLabels.map(l => l.id));

            // Etiquetas del menú según el selector de cuentas (misma lista que la barra lateral)
            let originLabels = this.getLabelMenu();
            const originAccount = (this.accounts || []).find(a => a.id === email.account_id);
            const originAccountLabel = originAccount ? (originAccount.email || originAccount.name) : 'Cuenta origen';
            const folderDisplayName = this.getFolderDisplayName(email.folder);
            const isInboxCategory = ['INBOX', 'CATEGORY_UPDATES', 'CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_FORUMS', 'CATEGORY_PERSONAL'].includes((email.folder || '').toUpperCase());
            const isSpam = (email.folder === 'SPAM' || this.currentFolder === 'SPAM');
            const isTrashOrSpamOrDraft = ['SPAM', 'TRASH', 'DRAFT', 'DRAFTS'].includes((this.currentFolder || '').toUpperCase()) || ['SPAM', 'TRASH', 'DRAFT', 'DRAFTS'].includes((email.folder || '').toUpperCase());
            // Archivar no se ofrece en Papelera/Spam/Borradores ni cuando el correo se abre desde "Todos" (ALL)
            const canArchiveHere = !isTrashOrSpamOrDraft && this.canBatchArchiveInCurrentFolder();
            const hasImages = Boolean(email.body_html && (/<img\b|background-image\s*:/i.test(email.body_html)));
            const hasImagesAuthorized = this.authorizedSpamImages.has(email.id);

            const labelsDropdownContent = `
                <div class="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider truncate">Etiquetas (${this.escapeHtml(originAccountLabel)})</span>
                </div>
                
                <div class="py-1">
                    ${originLabels.length > 0 ? originLabels.map(l => {
                        const isAssigned = this.isLabelAppliedToEmail(l, email, assignedLabelIds);
                        return `
                            <div onclick="EmailManager.toggleLabelOnCurrentEmail(${email.id}, ${l.id}, ${isAssigned})" class="w-full text-left px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                                <div class="flex items-center gap-2 min-w-0">
                                    <span class="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style="background-color: ${l.color}"></span>
                                    <span class="truncate text-slate-700 dark:text-slate-200 ${isAssigned ? 'font-semibold text-indigo-600 dark:text-indigo-400' : ''}">${this.escapeHtml(this.getLabelDisplayName(l.name))}${(() => { const h = this.getLabelOwnerHint(l, originLabels); return h ? `<span class="ml-1 text-[10px] font-normal text-slate-400">· ${this.escapeHtml(h)}</span>` : ''; })()}</span>
                                </div>
                                <span class="w-4 h-4 rounded border flex items-center justify-center shrink-0 text-xs ${
                                    isAssigned 
                                        ? 'bg-indigo-600 border-indigo-600 text-white font-bold' 
                                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                                }">
                                    ${isAssigned ? '✔' : ''}
                                </span>
                            </div>
                        `;
                    }).join('') : `
                        <div class="px-3 py-2 text-center text-slate-400 text-[11px] italic">
                            Sin etiquetas en esta cuenta
                        </div>
                    `}
                </div>

                <div class="border-t border-slate-100 dark:border-slate-800 pt-1 px-1">
                    <button onclick="EmailManager.openCreateLabelModalForAccount(${email.account_id}, ${email.id})" class="w-full text-left px-2.5 py-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg flex items-center gap-1.5 font-medium transition-colors">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                        <span>Nueva etiqueta en esta cuenta...</span>
                    </button>
                </div>
            `;

            // Limpiar cualquier dropdown de etiquetas previo montado en body para evitar duplicados
            document.querySelectorAll('body > [id^="email-label-dropdown-top-"]').forEach(el => el.remove());

            detailPanel.innerHTML = `
                <div class="h-full flex flex-col min-w-0 bg-white dark:bg-slate-950 overflow-hidden select-text">
                    <!-- Top Action Bar del Correo -->
                    <div class="email-top-action-bar relative z-40 h-12 px-3 md:px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/60 shrink-0 min-w-0 overflow-visible">
                        <!-- Sección Izquierda: Slot Superior de Etiquetas -->
                        <div class="flex items-center min-w-0 flex-1 mr-2 sm:mr-3 overflow-hidden">
                            <!-- Slot Superior de Etiquetas (con scroll horizontal si cabe arriba) -->
                            <div id="email-labels-top-slot" class="email-labels-scroll flex-1 min-w-0 flex items-center gap-1.5 sm:gap-2 overflow-x-auto flex-nowrap py-1 select-none" onwheel="if(event.deltaY !== 0){this.scrollLeft += event.deltaY; event.preventDefault();}">
                                <!-- Indicador Carpeta / Recibidos con botón de archivar -->
                                <span class="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full font-medium ${isSpam ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'} shrink-0 whitespace-nowrap" title="${folderDisplayName}">
                                    <span>${folderDisplayName}</span>
                                    ${isInboxCategory && canArchiveHere ? `
                                        <button onclick="EmailManager.archiveCurrentEmail(${email.id})" class="hover:text-rose-500 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-full w-3.5 h-3.5 flex items-center justify-center text-xs leading-none transition-colors ml-0.5 cursor-pointer shrink-0" title="Archivar (quitar de ${folderDisplayName})">&times;</button>
                                    ` : ''}
                                </span>

                                ${email.has_attachments ? `
                                    <span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/90 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 shadow-2xs shrink-0 whitespace-nowrap" title="Contiene archivos adjuntos">
                                        <svg class="w-3 h-3 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                                        </svg>
                                        <span>Adjuntos</span>
                                    </span>
                                ` : ''}

                                <!-- Badges de Etiquetas Asignadas con botón '×' claro para eliminarlas -->
                                ${emailLabels.map(lbl => {
                                    const labelDisplayName = this.getLabelDisplayName(lbl.name);
                                    return `
                                    <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full shadow-2xs shrink-0 whitespace-nowrap transition-all" style="background-color: ${lbl.color}22; color: ${lbl.color}; border: 1px solid ${lbl.color}55;" title="Etiqueta: ${this.escapeHtml(labelDisplayName)}">
                                        <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background-color: ${lbl.color}"></span>
                                        <span class="whitespace-nowrap">${this.escapeHtml(labelDisplayName)}</span>
                                        <button onclick="EmailManager.removeLabelFromEmail(${email.id}, ${lbl.id}, event)" class="hover:bg-black/15 dark:hover:bg-white/20 rounded-full w-4 h-4 flex items-center justify-center text-xs leading-none transition-transform hover:scale-110 ml-0.5 shrink-0 cursor-pointer" title="Eliminar etiqueta '${this.escapeHtml(labelDisplayName)}' de este correo">&times;</button>
                                    </span>
                                `;}).join('')}
                            </div>
                        </div>

                        <!-- Acciones Rápidas Superior Derecha (Gestión Individual & Redacción) -->
                        <div id="email-top-actions-right" class="relative z-40 flex items-center gap-1 sm:gap-1.5 shrink-0 flex-nowrap justify-end overflow-visible">
                            <!-- Botón Volver a la Lista de Correos (Exclusivo en Móvil < 768px) -->
                            <button id="btn-detail-back-mobile" onclick="EmailManager.backToList()" class="md:hidden flex items-center justify-center min-w-[44px] min-h-[44px] p-2 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors shadow-2xs cursor-pointer shrink-0" title="Volver a la lista de correos" aria-label="Return to email list">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
                                </svg>
                            </button>

                            <!-- 0. Botón Mover a Carpeta -->
                            <button id="btn-detail-move" onclick="EmailManager.toggleMoveMenu(event, 'detail', ${email.id})" class="p-2 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors shadow-2xs cursor-pointer shrink-0" title="Mover a carpeta">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m0 0l-3-3m3 3l-3 3"/>
                                </svg>
                            </button>
                            <!-- 1. Botón Archivar / Almacenar (Oculto en Papelera, Spam, Borradores y en "Todos") -->
                            ${canArchiveHere ? `
                                <button onclick="EmailManager.archiveCurrentEmail(${email.id})" class="p-2 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors shadow-2xs cursor-pointer" title="Archivar correo (quitar de Recibidos)">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
                                </button>
                            ` : ''}

                            <!-- 2. Botón Marcar como Spam / No es spam -->
                            <button onclick="EmailManager.markSpamCurrentEmail(${email.id})" class="p-2 ${isSpam ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800' : 'text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border-slate-200 dark:border-slate-800'} rounded-lg border transition-colors shadow-2xs cursor-pointer" title="${isSpam ? 'Marcar como legítimo (mover a Recibidos)' : 'Marcar como spam'}">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                            </button>

                            <!-- 3. Botón Eliminar / Mover a Papelera -->
                            <button onclick="EmailManager.deleteCurrentEmail(${email.id})" class="p-2 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors shadow-2xs cursor-pointer" title="Mover a papelera">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>

                            <!-- 4. Botón Marcar como visto / no leído -->
                            <button id="btn-top-toggle-read" onclick="EmailManager.toggleReadCurrentEmail(${email.id})" class="p-2 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors shadow-2xs cursor-pointer" title="${email.is_read ? 'Marcar como no leído' : 'Marcar como visto'}">
                                ${email.is_read ? `
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                                ` : `
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5"/></svg>
                                `}
                            </button>

                            <!-- 5. Botón Asignar Etiquetas (Individual) con menú desplegable en primer plano -->
                            <div class="relative inline-block shrink-0">
                                <button id="btn-toggle-email-labels-top-${email.id}" onclick="EmailManager.toggleAssignLabelDropdown(${email.id}, event, 'top')" class="p-2 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors shadow-2xs cursor-pointer" title="Asignar o quitar etiquetas a este correo">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                                </button>
                                <div id="email-label-dropdown-top-${email.id}" class="hidden fixed w-64 max-h-80 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[9999] py-1.5 text-xs backdrop-blur-md">
                                    ${labelsDropdownContent}
                                </div>
                            </div>

                            <!-- 6. Botón Destacar -->
                            <button onclick="EmailManager.toggleStar(${email.id}, event)" class="p-2 text-slate-500 dark:text-slate-400 hover:text-amber-500 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors shadow-2xs cursor-pointer" title="${isStarred ? 'Quitar de destacados' : 'Destacar'}">
                                <svg class="w-4 h-4 ${isStarred ? 'text-amber-400 fill-amber-400' : 'fill-none'}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>
                            </button>

                            <!-- Divisor vertical -->
                            <div class="h-4 w-px bg-slate-200 dark:bg-slate-700/80 mx-0.5"></div>

                            <!-- 7. Responder -->
                            <button onclick="EmailManager.prepareReply()" class="p-2 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors shadow-2xs cursor-pointer" title="Responder">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                            </button>

                            <!-- 8. Reenviar -->
                            <button onclick="EmailManager.prepareForward()" class="p-2 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors shadow-2xs cursor-pointer" title="Reenviar">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"/></svg>
                            </button>

                            <!-- 9. Responder con IA (Elio) -->
                            <button id="btn-top-reply-ai" onclick="EmailManager.replyWithAI(${email.id})" class="${(window.GeminiAI && GeminiAI.isAiActive) ? '' : 'hidden'} p-2 text-purple-600 dark:text-purple-300 hover:text-white bg-purple-50 dark:bg-purple-950/40 hover:bg-gradient-to-r hover:from-indigo-600 hover:to-pink-600 rounded-lg border border-purple-200 dark:border-purple-800/60 transition-all shadow-2xs group btn-reply-ai-feature cursor-pointer" title="Responder con Elio (@elio)">
                                <svg class="w-4 h-4 text-purple-600 dark:text-purple-400 group-hover:text-amber-300 animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                            </button>

                            <!-- 10. Agendar Cita IA -->
                            <button id="btn-top-schedule-ai" onclick="EmailManager.scheduleFromEmail(${email.id})" class="${(window.GeminiAI && GeminiAI.isAiActive) ? '' : 'hidden'} p-2 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg border border-emerald-200 dark:border-emerald-800/60 transition-colors shadow-2xs btn-schedule-ai-feature cursor-pointer" title="Agendar en Calendario con Elio (@elio)">
                                <svg class="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                            </button>

                            <!-- 10b. Detectar Compromisos y Tareas IA -->
                            <button id="btn-top-commitments-ai-${email.id}" onclick="EmailManager.detectCommitments(${email.id})" class="${(window.GeminiAI && GeminiAI.isAiActive) ? '' : 'hidden'} p-2 text-cyan-600 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/50 rounded-lg border border-cyan-200 dark:border-cyan-800/60 transition-colors shadow-2xs btn-commitments-ai-feature cursor-pointer" title="Detectar compromisos, tareas y acuerdos con Elio (@elio)">
                                <svg class="w-4 h-4 text-cyan-600 dark:text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                            </button>

                            <!-- 11. Imprimir correo (en desktop abre visor con vista previa, en web/PWA usa el navegador nativo) -->
                            <button id="btn-print-email" onclick="EmailManager.openPrintPreview()" class="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg border border-slate-200 dark:border-slate-800 transition-colors shadow-2xs cursor-pointer" title="Imprimir correo (Ctrl+P)">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                            </button>
                        </div>
                    </div>

                    <!-- Barra nueva delgada para etiquetas cuando no caben arriba al reducir espacio -->
                    <div id="email-secondary-labels-bar" class="hidden px-3 md:px-6 py-1.5 bg-slate-100/70 dark:bg-slate-900/60 border-b border-slate-200/90 dark:border-slate-800/80 flex items-center gap-1.5 sm:gap-2 overflow-x-auto flex-nowrap email-labels-scroll select-none shrink-0 min-h-[34px]" onwheel="if(event.deltaY !== 0){this.scrollLeft += event.deltaY; event.preventDefault();}"></div>

                    <!-- Cabecera del Correo (Asunto & Ficha Remitente) -->
                    <div class="px-4 md:px-8 pt-6 pb-4 border-b border-slate-200 dark:border-slate-800/80 shrink-0 min-w-0">
                        <div class="flex items-start justify-between gap-4 mb-4 min-w-0">
                            <h2 class="text-lg md:text-xl font-bold text-slate-900 dark:text-white leading-snug break-words min-w-0">
                                ${this.escapeHtml(email.subject || '(Sin Asunto)')}
                            </h2>
                        </div>

                        <div class="flex items-center justify-between text-xs min-w-0 gap-2">
                            <div class="flex items-center gap-3 min-w-0">
                                ${window.AvatarService ? AvatarService.render(email.sender, email.sender_name || email.sender, 'w-9 h-9 text-sm') : `
                                    <div class="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-xs shrink-0">
                                        ${initial}
                                    </div>
                                `}
                                <div class="min-w-0 truncate">
                                    <div class="flex items-center gap-2 truncate">
                                        <span class="font-bold text-slate-900 dark:text-white truncate">${this.escapeHtml(email.sender)}</span>
                                    </div>
                                    <p class="text-slate-400 text-[11px] truncate">para mí &bull; <span class="text-slate-500">${this.escapeHtml(email.recipient || '')}</span></p>
                                </div>
                            </div>
                            <div class="flex items-center gap-1.5 text-slate-400 text-[11px] whitespace-nowrap shrink-0">
                                ${email.has_attachments ? `
                                    <svg class="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" title="Contiene archivos adjuntos">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
                                    </svg>
                                ` : ''}
                                <span>${dateFormatted}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Resumen Ejecutivo Elio (@elio) (TL;DR) -->
                    <div id="ai-summary-box-${email.id}" class="${email.ai_summary ? '' : 'hidden'} mx-4 md:mx-8 mt-4 p-3.5 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/50 min-w-0">
                        <div class="flex items-center gap-2 mb-1.5 min-w-0">
                            <svg class="w-4 h-4 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                            <span class="text-xs font-bold text-indigo-700 dark:text-indigo-300">Resumen Inteligente Elio (@elio)</span>
                            ${email.ai_urgency ? `<span class="ml-auto text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full shrink-0 ${email.ai_urgency === 'alta' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}">Urgencia: ${email.ai_urgency}</span>` : ''}
                        </div>
                        <p class="text-xs text-slate-700 dark:text-slate-300 leading-relaxed break-words" id="ai-summary-text-${email.id}">
                            ${email.ai_summary || ''}
                        </p>
                    </div>

                    <!-- Compromisos y Acciones Clave Elio (@elio) -->
                    <div id="ai-commitments-box-${email.id}" class="hidden mx-4 md:mx-8 mt-2.5 p-3.5 rounded-xl bg-cyan-50/80 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800/50 min-w-0 transition-all">
                        <div class="flex items-center gap-2 mb-2 min-w-0">
                            <svg class="w-4 h-4 text-cyan-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                            <span class="text-xs font-bold text-cyan-800 dark:text-cyan-300">Compromisos & Tareas Detectadas (@elio)</span>
                            <span id="ai-commitments-status-${email.id}" class="ml-auto text-[11px] text-cyan-700 dark:text-cyan-400"></span>
                        </div>
                        <div id="ai-commitments-list-${email.id}" class="space-y-2"></div>
                    </div>

                    <!-- Cuerpo del Correo en Scroll Independiente Contenido Aislado -->
                    <div id="email-detail-scroll-container" class="flex-1 p-4 md:p-8 overflow-y-auto overflow-x-hidden min-w-0 leading-relaxed text-sm text-slate-800 dark:text-slate-200">
                        ${isSpam ? `
                            <!-- Banner de Advertencia de Spam y Control de Imágenes -->
                            <div id="spam-warning-banner-${email.id}" class="max-w-4xl w-full mx-auto mb-4 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs min-w-0">
                                <div class="flex items-center gap-2.5 min-w-0">
                                    <div class="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/60 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                                    </div>
                                    <div class="min-w-0">
                                        <p class="font-bold text-amber-900 dark:text-amber-200">Este mensaje está en la carpeta de Spam</p>
                                        <p class="text-amber-700 dark:text-amber-400 text-[11px]" id="spam-banner-subtext-${email.id}">
                                            ${hasImagesAuthorized 
                                                ? 'Las imágenes de este correo han sido mostradas por tu autorización.' 
                                                : (hasImages ? 'Por tu seguridad, se han bloqueado las imágenes remotas de este correo.' : 'Este mensaje fue clasificado como correo no deseado.')}
                                        </p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                    ${hasImages ? `
                                        <button type="button" id="btn-toggle-spam-images-${email.id}" onclick="EmailManager.toggleSpamImages(${email.id})" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs transition-colors cursor-pointer" title="${hasImagesAuthorized ? 'Ocultar imágenes remotas' : 'Cargar y ver imágenes de este correo'}">
                                            ${hasImagesAuthorized ? `
                                                <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/></svg>
                                                <span>Ocultar imágenes</span>
                                            ` : `
                                                <svg class="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                                                <span>Mostrar imágenes</span>
                                            `}
                                        </button>
                                    ` : ''}
                                    <button type="button" onclick="EmailManager.markNotSpam(${email.id})" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer" title="Marcar como legítimo y mover a Recibidos">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                                        <span>No es spam</span>
                                    </button>
                                </div>
                            </div>
                        ` : ''}

                        <div class="max-w-4xl w-full mx-auto ${email.body_html ? 'bg-white' : 'bg-white dark:bg-slate-900'} rounded-2xl p-1.5 md:p-3 border border-slate-200 dark:border-slate-800 shadow-2xs overflow-x-auto min-w-0 mb-3 transition-all">
                            ${email.body_html ? `
                                <iframe id="email-body-frame-${email.id}" class="email-body-frame w-full border-0 rounded-xl" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" scrolling="no" style="width: 100%; border: none; overflow: hidden; display: block; min-height: 30px; background-color: #ffffff;"></iframe>
                            ` : `
                                <div class="p-3 whitespace-pre-wrap font-sans text-xs md:text-sm text-slate-800 dark:text-slate-200 break-words">${this.escapeHtml(email.body_text || email.snippet || '')}</div>
                            `}
                        </div>

                        ${(email.attachments && email.attachments.length > 0) ? `
                            <!-- Sección de Archivos Adjuntos del Correo -->
                            <div class="max-w-4xl w-full mx-auto bg-slate-50/90 dark:bg-slate-900/70 rounded-2xl p-4 md:p-5 border border-slate-200/80 dark:border-slate-800 shadow-2xs mb-6">
                                <div class="flex items-center justify-between mb-3.5 min-w-0">
                                    <div class="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                        <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                                        <span>Archivos adjuntos (${email.attachments.length})</span>
                                    </div>
                                    ${email.attachments.length > 1 ? `
                                        <button type="button" onclick="EmailManager.downloadAllAttachments(${email.id})" class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-colors cursor-pointer" title="Descargar todos los archivos adjuntos">
                                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                                            <span>Descargar todos</span>
                                        </button>
                                    ` : ''}
                                </div>
                                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                    ${email.attachments.map(att => {
                                        const badge = this.getAttachmentBadge(att.filename, att.content_type);
                                        const formattedSize = window.Composer ? Composer.formatFileSize(att.size) : (att.size || 0) + ' B';
                                        return `
                                            <a href="/api/attachments/${att.id}/download" download="${this.escapeHtml(att.filename)}" onclick="EmailManager.downloadAttachment(${att.id}, '${this.escapeHtml(att.filename)}', event)" class="group flex items-center justify-between gap-3 p-3 bg-white dark:bg-slate-800/90 hover:bg-indigo-50/50 dark:hover:bg-slate-750 border border-slate-200 dark:border-slate-700/80 hover:border-indigo-400 dark:hover:border-indigo-500 rounded-xl shadow-2xs hover:shadow-xs transition-all text-xs cursor-pointer min-w-0" title="Clic para descargar '${this.escapeHtml(att.filename)}'">
                                                <div class="flex items-center gap-2.5 min-w-0">
                                                    <span class="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-[11px] shrink-0 border ${badge.bg}">
                                                        ${badge.label}
                                                    </span>
                                                    <div class="min-w-0">
                                                        <span class="font-semibold text-slate-800 dark:text-slate-100 truncate block text-xs group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors" title="${this.escapeHtml(att.filename)}">
                                                            ${this.escapeHtml(att.filename)}
                                                        </span>
                                                        <span class="text-[10px] text-slate-400 block truncate">
                                                            ${badge.desc} · ${formattedSize}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div class="p-1.5 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0">
                                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                                                </div>
                                            </a>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        ` : ''}

                        <!-- CAJA DE RESPUESTA EN LÍNEA (INLINE QUICK REPLY) - Oculta hasta dar clic en Responder -->
                        <div id="inline-reply-container" class="hidden max-w-4xl w-full mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden min-w-0 transition-all focus-within:ring-2 focus-within:ring-indigo-500/40 focus-within:border-indigo-500">
                            
                            <!-- Encabezado de la Caja de Respuesta -->
                            <div class="px-4 py-2.5 bg-slate-50/70 dark:bg-slate-850/80 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-xs min-w-0">
                                <div class="flex items-center gap-2.5 min-w-0">
                                    ${(() => {
                                        const repAcc = (this.accounts || []).find(a => a.id === email.account_id) || this.accounts[0] || { name: 'Yo', email: '' };
                                        return window.AvatarService 
                                            ? AvatarService.render(repAcc.email, repAcc.name, 'w-6 h-6 text-[11px]', '', repAcc.color) 
                                            : `<div class="w-6 h-6 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-[11px] shadow-2xs shrink-0" style="${repAcc.color ? `border: 2px solid ${repAcc.color};` : ''}">${repAcc.name.charAt(0).toUpperCase()}</div>`;
                                    })()}
                                    <div class="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 truncate">
                                        <svg class="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                                        <span class="text-slate-400">Responder a:</span>
                                        <span class="font-semibold text-slate-800 dark:text-slate-200 truncate">${this.escapeHtml(email.sender)}</span>
                                    </div>
                                </div>
                                <div class="flex items-center gap-1 shrink-0">
                                    <!-- Botón Abrir en Ventana Emergente (Pop-out) -->
                                    <button type="button" onclick="InlineReply.popOutToModal()" class="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded transition-colors" title="Abrir en ventana emergente (Pop-out)">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                                    </button>
                                </div>
                            </div>

                            <!-- Barra de Herramientas de Formato HTML (Desplegable con Aa) -->
                            <div id="inline-reply-toolbar" class="hidden flex-wrap items-center gap-0.5 p-1.5 bg-slate-100/90 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 text-xs select-none">
                                <button type="button" onclick="InlineReply.exec('undo')" class="format-btn" title="Deshacer (Ctrl+Z)">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a5 5 0 015 5v2M3 10l5-5m-5 5l5 5"/></svg>
                                </button>
                                <button type="button" onclick="InlineReply.exec('redo')" class="format-btn" title="Rehacer (Ctrl+Y)">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10H11a5 5 0 00-5 5v2m15-7l-5-5m5 5l-5 5"/></svg>
                                </button>
                                <div class="h-3.5 w-px bg-slate-300 dark:bg-slate-700 mx-1"></div>

                                <select onchange="InlineReply.formatBlock(this.value)" class="bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer">
                                    <option value="p">Normal</option>
                                    <option value="h2">Título</option>
                                    <option value="h3">Subtítulo</option>
                                    <option value="pre">Código</option>
                                </select>

                                <div class="h-3.5 w-px bg-slate-300 dark:bg-slate-700 mx-1"></div>

                                <button type="button" id="btn-inline-bold" onclick="InlineReply.exec('bold')" class="format-btn font-bold" title="Negrita (Ctrl+B)">
                                    <span class="font-extrabold text-xs px-0.5">B</span>
                                </button>
                                <button type="button" id="btn-inline-italic" onclick="InlineReply.exec('italic')" class="format-btn italic" title="Cursiva (Ctrl+I)">
                                    <span class="italic font-serif text-xs px-0.5">I</span>
                                </button>
                                <button type="button" id="btn-inline-underline" onclick="InlineReply.exec('underline')" class="format-btn underline" title="Subrayado (Ctrl+U)">
                                    <span class="underline text-xs px-0.5">U</span>
                                </button>
                                <button type="button" id="btn-inline-strike" onclick="InlineReply.exec('strikeThrough')" class="format-btn line-through" title="Tachado">
                                    <span class="line-through text-xs px-0.5">S</span>
                                </button>

                                <div class="h-3.5 w-px bg-slate-300 dark:bg-slate-700 mx-1"></div>

                                <!-- Color de texto -->
                                <div class="relative inline-block">
                                    <button type="button" id="btn-inline-text-color" onclick="InlineReply.toggleTextColorPalette(event)" class="format-btn flex flex-col items-center justify-center p-1" title="Color de texto">
                                        <span class="font-bold text-[11px] leading-none">A</span>
                                        <span id="inline-text-color-indicator" class="w-3 h-0.5 bg-indigo-600 rounded-full mt-0.5"></span>
                                    </button>
                                    <div id="inline-format-text-color-popover" class="hidden absolute top-full left-0 mt-1 z-30 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-2 w-44">
                                        <div class="color-picker-palette">
                                            <div class="color-swatch bg-slate-900" onclick="InlineReply.applyTextColor('#0f172a')" title="Negro"></div>
                                            <div class="color-swatch bg-slate-500" onclick="InlineReply.applyTextColor('#64748b')" title="Gris"></div>
                                            <div class="color-swatch bg-blue-600" onclick="InlineReply.applyTextColor('#2563eb')" title="Azul"></div>
                                            <div class="color-swatch bg-indigo-600" onclick="InlineReply.applyTextColor('#4f46e5')" title="Índigo"></div>
                                            <div class="color-swatch bg-rose-600" onclick="InlineReply.applyTextColor('#e11d48')" title="Rojo"></div>
                                            <div class="color-swatch bg-emerald-600" onclick="InlineReply.applyTextColor('#059669')" title="Verde"></div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Color de resaltado -->
                                <div class="relative inline-block">
                                    <button type="button" id="btn-inline-bg-color" onclick="InlineReply.toggleBgColorPalette(event)" class="format-btn flex flex-col items-center justify-center p-1" title="Color de resaltado">
                                        <svg class="w-3 h-3 leading-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4 4 4 0 014-4h10a4 4 0 014 4 4 4 0 01-4 4H7zM7 13l4-8 4 8"/></svg>
                                        <span id="inline-bg-color-indicator" class="w-3 h-0.5 bg-yellow-400 rounded-full mt-0.5"></span>
                                    </button>
                                    <div id="inline-format-bg-color-popover" class="hidden absolute top-full left-0 mt-1 z-30 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-2 w-44">
                                        <div class="color-picker-palette">
                                            <div class="color-swatch bg-transparent border border-dashed border-slate-400 flex items-center justify-center text-[9px] text-slate-500" onclick="InlineReply.applyBgColor('transparent')" title="Sin fondo">✕</div>
                                            <div class="color-swatch bg-yellow-200" onclick="InlineReply.applyBgColor('#fef08a')" title="Amarillo Pastel"></div>
                                            <div class="color-swatch bg-green-200" onclick="InlineReply.applyBgColor('#bbf7d0')" title="Verde Claro"></div>
                                            <div class="color-swatch bg-cyan-200" onclick="InlineReply.applyBgColor('#a5f3fc')" title="Cian Claro"></div>
                                            <div class="color-swatch bg-pink-200" onclick="InlineReply.applyBgColor('#fbcfe8')" title="Rosa"></div>
                                        </div>
                                    </div>
                                </div>

                                <div class="h-3.5 w-px bg-slate-300 dark:bg-slate-700 mx-1"></div>

                                <button type="button" id="btn-inline-ul" onclick="InlineReply.exec('insertUnorderedList')" class="format-btn" title="Lista con viñetas">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h.01M4 12h.01M4 18h.01M9 6h11M9 12h11M9 18h11"/></svg>
                                </button>
                                <button type="button" id="btn-inline-ol" onclick="InlineReply.exec('insertOrderedList')" class="format-btn" title="Lista numerada">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h1M4 10h1M4 14h1M4 18h1M9 6h11M9 12h11M9 18h11"/></svg>
                                </button>
                                <button type="button" id="btn-inline-align-left" onclick="InlineReply.exec('justifyLeft')" class="format-btn" title="Alinear izquierda">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h10M4 18h14"/></svg>
                                </button>
                                <button type="button" id="btn-inline-align-center" onclick="InlineReply.exec('justifyCenter')" class="format-btn" title="Centrar">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M7 12h10M5 18h14"/></svg>
                                </button>
                                <button type="button" onclick="InlineReply.formatBlock('blockquote')" class="format-btn" title="Cita">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                                </button>
                                <button type="button" onclick="InlineReply.exec('removeFormat')" class="format-btn" title="Limpiar formato">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                </button>
                            </div>

                            <!-- Área de Redacción Editable -->
                            <div id="inline-reply-editor" contenteditable="true" data-placeholder="Escribe tu respuesta aquí o genera una con IA..." class="w-full p-4 text-xs md:text-sm text-slate-900 dark:text-slate-100 overflow-y-auto leading-relaxed focus:outline-none"></div>

                            <!-- Contenedor de Archivos Adjuntos en Respuesta Rápida -->
                            <div id="inline-reply-attachments-container" class="hidden px-4 py-2 bg-slate-50/70 dark:bg-slate-800/40 border-t border-slate-200/80 dark:border-slate-800 max-h-24 overflow-y-auto">
                                <div class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                                    <span class="flex items-center gap-1">
                                        <svg class="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                                        <span>Archivos adjuntos</span>
                                    </span>
                                    <span id="inline-reply-attachments-total-size" class="text-slate-500 text-[10px]"></span>
                                </div>
                                <div id="inline-reply-attachments-list" class="flex flex-wrap gap-1.5"></div>
                            </div>
                            <input type="file" id="inline-reply-attachments-input" multiple onchange="InlineReply.handleFileInput(this.files)" class="hidden">

                            <!-- Barra de Acciones Inferior -->
                            <div class="px-4 py-3 bg-slate-50/50 dark:bg-slate-850/60 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between select-none">
                                <div class="flex items-center gap-2">
                                    <!-- Botón Enviar Respuesta -->
                                    <button type="button" id="btn-inline-send" onclick="InlineReply.send(${email.id})" class="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all active:scale-98 cursor-pointer">
                                        <span>Enviar</span>
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                                    </button>

                                    <!-- Botón Responder con IA (Elio) -->
                                    <button type="button" id="btn-inline-reply-ai" onclick="InlineReply.replyWithAI(${email.id})" class="${(window.GeminiAI && GeminiAI.isAiActive) ? 'flex' : 'hidden'} items-center gap-1.5 px-3 py-2 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 border border-purple-200 dark:border-purple-800/60 text-purple-700 dark:text-purple-300 font-semibold text-xs rounded-xl transition-all cursor-pointer btn-reply-ai-feature" title="Generar borrador inteligente con Elio (@elio)">
                                        <svg class="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                                        <span>+ Responder con IA</span>
                                    </button>

                                    <!-- Selector de Tono para el Mensaje Actual -->
                                    <div id="inline-reply-tone-container" class="${(window.GeminiAI && GeminiAI.isAiActive) ? 'flex' : 'hidden'} items-center gap-1.5 ml-1 btn-reply-ai-feature">
                                        <label for="inline-reply-tone-select" class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 select-none">Tono:</label>
                                        <select id="inline-reply-tone-select" class="text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 rounded-xl px-2.5 py-1.5 text-slate-700 dark:text-slate-200 font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none cursor-pointer shadow-2xs hover:border-purple-300 transition-colors" title="Tono de respuesta para este mensaje actual">
                                            <option value="formal">Formal</option>
                                            <option value="cordial">Cordial</option>
                                            <option value="amigable">Amigable (Cercano y jovial)</option>
                                            <option value="familiar">Familiar (Como de la familia)</option>
                                            <option value="conciso">Conciso</option>
                                            <option value="comercial">Comercial</option>
                                        </select>
                                    </div>

                                    <div class="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>

                                    <!-- Botón Alternar Barra de Formato (Aa) -->
                                    <button type="button" id="btn-inline-toggle-formatting" onclick="InlineReply.toggleToolbar()" class="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors font-bold text-xs" title="Opciones de formato (Aa)">
                                        <span>Aa</span>
                                    </button>

                                    <!-- Botón Adjuntar Archivos (Clip) -->
                                    <button type="button" onclick="InlineReply.openAttachmentPicker()" class="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors" title="Adjuntar archivos">
                                        <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                                    </button>

                                    <!-- Botón Insertar Enlace -->
                                    <button type="button" onclick="InlineReply.openLinkModal()" class="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors" title="Insertar enlace">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
                                    </button>
                                </div>

                                <div class="flex items-center gap-1">
                                    <!-- Botón Descartar Borrador (Papelera) -->
                                    <button type="button" onclick="InlineReply.discard()" class="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors" title="Descartar borrador">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Asegurar que la vista del correo inicie siempre desde el principio (arriba)
            const scrollContainer = document.getElementById('email-detail-scroll-container');
            if (scrollContainer) {
                scrollContainer.scrollTop = 0;
            }

            // Montar iframe aislado para visualización segura y fidedigna del correo
            this.mountEmailBodyFrame(email);

            // Configurar el editor de respuesta en línea y aplicar firma inicial (sin auto-enfocar ni hacer scroll)
            setTimeout(async () => {
                const sc = document.getElementById('email-detail-scroll-container');
                if (sc) sc.scrollTop = 0;
                const inlineEditor = document.getElementById('inline-reply-editor');
                if (inlineEditor) {
                    inlineEditor.addEventListener('input', () => {
                        if (window.InlineReply) InlineReply.updatePlaceholderState();
                    });
                    inlineEditor.addEventListener('keyup', () => {
                        if (window.InlineReply) {
                            InlineReply.updateToolbarState();
                            InlineReply.updatePlaceholderState();
                        }
                    });
                    inlineEditor.addEventListener('mouseup', () => {
                        if (window.InlineReply) InlineReply.updateToolbarState();
                    });
                    inlineEditor.addEventListener('focus', () => {
                        if (window.InlineReply) {
                            InlineReply.updateToolbarState();
                            // Si aún no ha escrito texto antes de la firma, garantizar cursor en la parte superior
                            if (!InlineReply.getTextWithoutSignature(inlineEditor)) {
                                InlineReply.focusTop();
                            }
                        }
                    });
                    inlineEditor.addEventListener('keydown', (e) => {
                        if (e.ctrlKey || e.metaKey) {
                            if (e.key.toLowerCase() === 'b') { e.preventDefault(); InlineReply.exec('bold'); }
                            else if (e.key.toLowerCase() === 'i') { e.preventDefault(); InlineReply.exec('italic'); }
                            else if (e.key.toLowerCase() === 'u') { e.preventDefault(); InlineReply.exec('underline'); }
                            else if (e.key.toLowerCase() === 'k') { e.preventDefault(); InlineReply.openLinkModal(); }
                            else if (e.key === 'Enter') { e.preventDefault(); InlineReply.send(email.id); }
                        }
                    });

                    // Aplicar firma por defecto lista para cuando el usuario decida responder (sin enfocar el cursor)
                    if (window.SignatureManager && window.InlineReply) {
                        const defaultSig = await SignatureManager.getDefaultSignatureForAccount(email.account_id);
                        if (defaultSig && defaultSig.content) {
                            InlineReply.insertSignature(defaultSig.content);
                        } else {
                            InlineReply.updatePlaceholderState();
                        }
                    }

                    // Establecer por defecto el tono configurado globalmente en Ajustes
                    const defaultTone = (document.getElementById('gemini-default-tone') && document.getElementById('gemini-default-tone').value) || 'formal';
                    const inlineToneSelect = document.getElementById('inline-reply-tone-select');
                    if (inlineToneSelect) {
                        inlineToneSelect.value = defaultTone;
                    }

                    // Evaluar y ajustar ubicación de etiquetas según espacio disponible
                    EmailManager.setupLabelsResponsivePlacement();
                }
            }, 60);
        } catch (e) {
            detailPanel.innerHTML = window.UI ? UI.renderErrorState({
                title: 'No pudimos abrir este correo',
                message: 'Ocurrió una interrupción al intentar consultar el contenido del mensaje. Por favor intenta de nuevo.',
                retryAction: `EmailManager.openEmailDetail(${emailId})`,
                retryText: 'Reintentar abrir correo',
                size: 'md'
            }) : `<div class="p-8 text-center text-rose-500 text-xs">No se pudo cargar el correo</div>`;
        }
    },

    setupLabelsResponsivePlacement() {
        const checkPlacement = () => {
            const topBar = document.querySelector('.email-top-action-bar');
            const topSlot = document.getElementById('email-labels-top-slot');
            const secondaryBar = document.getElementById('email-secondary-labels-bar');
            if (!topBar || !topSlot || !secondaryBar) return;

            const activeContainer = (topSlot.children.length > 0) ? topSlot : secondaryBar;
            const hasItems = activeContainer && activeContainer.children.length > 0;
            if (!hasItems) {
                secondaryBar.classList.add('hidden');
                topSlot.classList.remove('hidden');
                return;
            }

            const actionsRight = document.getElementById('email-top-actions-right') || topBar.querySelector('#email-top-actions-right');
            const backBtn = topBar.querySelector('button[title="Volver a la lista"]');

            const topBarWidth = topBar.clientWidth;
            const rightWidth = actionsRight ? actionsRight.offsetWidth : 440;
            const backWidth = (backBtn && window.getComputedStyle(backBtn).display !== 'none') ? backBtn.offsetWidth + 8 : 0;
            const availableWidth = topBarWidth - rightWidth - backWidth - 24;

            let requiredWidth = 0;
            Array.from(activeContainer.children).forEach(ch => {
                requiredWidth += (ch.offsetWidth || 0) + 8;
            });

            // Si el espacio libre en la barra superior es menor a lo que requieren las etiquetas,
            // o si la barra mide menos de 760px o el espacio disponible es < 220px:
            const shouldMoveDown = (availableWidth < requiredWidth + 16) || (availableWidth < 220) || (topBarWidth < 740);

            if (shouldMoveDown) {
                if (topSlot.children.length > 0) {
                    secondaryBar.innerHTML = topSlot.innerHTML;
                    topSlot.innerHTML = '';
                }
                secondaryBar.classList.remove('hidden');
                topSlot.classList.add('hidden');
            } else {
                if (secondaryBar.children.length > 0) {
                    topSlot.innerHTML = secondaryBar.innerHTML;
                    secondaryBar.innerHTML = '';
                }
                topSlot.classList.remove('hidden');
                secondaryBar.classList.add('hidden');
            }
        };

        checkPlacement();
        setTimeout(checkPlacement, 80);

        const detailContainer = document.getElementById('email-detail-container');
        if (detailContainer && !detailContainer._emailLinkHandlerAttached) {
            detailContainer._emailLinkHandlerAttached = true;
            detailContainer.addEventListener('click', (e) => {
                const link = e.target.closest('a');
                if (!link || !link.href) return;
                // Excluir acciones internas de descarga de adjuntos o botones interactivos
                if (link.hasAttribute('download') || link.hasAttribute('onclick')) return;
                const href = link.href;
                if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) {
                    if (!href.includes('/api/attachments/')) {
                        e.preventDefault();
                        e.stopPropagation();
                        EmailManager.openEmailLink(href);
                    }
                }
            });
        }

        if (window.ResizeObserver && detailContainer) {
            if (this._detailResizeObserver) {
                this._detailResizeObserver.disconnect();
            }
            this._detailResizeObserver = new ResizeObserver(() => {
                checkPlacement();
            });
            this._detailResizeObserver.observe(detailContainer);
        }
    },

    mountEmailBodyFrame(email, allowImages = false) {
        if (!email || !email.body_html) return;
        const frame = document.getElementById(`email-body-frame-${email.id}`);
        if (!frame) return;

        try {
            let html = email.body_html;
            const isSpam = (email.folder === 'SPAM' || this.currentFolder === 'SPAM');
            const shouldBlockImages = isSpam && !this.authorizedSpamImages.has(email.id) && !allowImages;

            if (shouldBlockImages) {
                // Neutralizar imágenes para evitar peticiones remotas en correos de spam
                html = html.replace(/<img\b([^>]*)>/gi, (match, attrs) => {
                    let newAttrs = attrs.replace(/\bsrc=["']([^"']*)["']/i, 'data-blocked-src="$1" src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2394a3b8\' stroke-width=\'1.5\'%3E%3Crect width=\'18\' height=\'18\' x=\'3\' y=\'3\' rx=\'2\'/%3E%3Ccircle cx=\'8.5\' cy=\'8.5\' r=\'1.5\'/%3E%3Cpath d=\'M21 15l-5-5L5 21\'/%3E%3C/svg%3E"');
                    newAttrs = newAttrs.replace(/\bsrcset=["']([^"']*)["']/i, 'data-blocked-srcset="$1"');
                    return `<img ${newAttrs}>`;
                });
                html = html.replace(/background-image\s*:\s*url\([^)]+\)/gi, 'background-image: none');
            } else {
                // 1. Normalizar data-src / data-original en imágenes para asegurar carga de imágenes diferidas
                html = html.replace(/<img\b([^>]*)>/gi, (match, attrs) => {
                    let newAttrs = attrs;
                    const dataSrcMatch = attrs.match(/data-(?:src|original|lazy-src|delayed-url)=["']([^"']+)["']/i);
                    const srcMatch = attrs.match(/\bsrc=["']([^"']*)["']/i);
                    if (dataSrcMatch && (!srcMatch || srcMatch[1].startsWith('data:image/gif') || !srcMatch[1].trim())) {
                        const realSrc = dataSrcMatch[1];
                        if (srcMatch) {
                            newAttrs = newAttrs.replace(/\bsrc=["'][^"']*["']/i, `src="${realSrc}"`);
                        } else {
                            newAttrs += ` src="${realSrc}"`;
                        }
                    }
                    if (!/referrerpolicy=/i.test(newAttrs)) {
                        newAttrs += ' referrerpolicy="no-referrer"';
                    }
                    return `<img ${newAttrs.trim()}>`;
                });
            }

            // 2. Construir documento HTML autónomo y seguro con CSP estricto
            const frameDoc = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="referrer" content="no-referrer">
    <base target="_blank">
    <style>
        html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            min-width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            background-color: #ffffff;
            color: #1e293b;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            box-sizing: border-box;
            word-wrap: break-word;
            overflow-wrap: break-word;
            -webkit-text-size-adjust: 100%;
        }
        /* Eliminar margen y espaciado residual de los últimos elementos del correo */
        #merke-email-content > *:last-child,
        #merke-email-content table:last-child,
        #merke-email-content p:last-child,
        #merke-email-content div:last-child {
            margin-bottom: 0 !important;
            padding-bottom: 0 !important;
        }
        /* Tablas: contención adaptativa respetando estructura interna */
        table {
            border-collapse: collapse;
            mso-table-lspace: 0pt;
            mso-table-rspace: 0pt;
            max-width: 100%;
        }
        /* Imágenes: contención fluida respetando proporciones nativas */
        img {
            border: 0;
            outline: none;
            text-decoration: none;
            -ms-interpolation-mode: bicubic;
            max-width: 100%;
        }
        /* Si la imagen no tiene height explícito en atributos, permitir auto-proporción */
        img:not([height]) {
            height: auto;
        }
        /* Eliminar espacio fantasma bajo imágenes en celdas de tabla */
        td > img, th > img, a > img {
            vertical-align: middle;
        }
        /* Spacers y píxeles de seguimiento de 0 o 1px no deben expandirse */
        img[width="0"], img[width="1"], img[height="0"], img[height="1"],
        img[width="1px"], img[height="1px"],
        img[style*="width: 1px"], img[style*="height: 1px"],
        img[style*="width:1px"], img[style*="height:1px"] {
            max-width: 1px !important;
            max-height: 1px !important;
            width: 1px !important;
            height: 1px !important;
            display: inline-block !important;
        }
        ${shouldBlockImages ? `
            img {
                opacity: 0.35 !important;
                max-width: 48px !important;
                max-height: 48px !important;
                background: #f8fafc;
                border: 1px dashed #cbd5e1;
                border-radius: 6px;
                padding: 4px;
                display: inline-block;
            }
        ` : ''}
    </style>
</head>
<body style="margin: 0; padding: 0;">
    <div id="merke-email-content" style="display: flow-root; width: 100%; margin: 0; padding: 0; min-height: 0;">
        ${html}
    </div>
</body>
</html>`;

            const doc = frame.contentDocument || (frame.contentWindow ? frame.contentWindow.document : null);
            if (!doc) return;

            doc.open();
            doc.write(frameDoc);
            doc.close();

            // Interceptar todos los clics en enlaces del correo para abrirlos según el entorno
            // y cerrar cualquier menú desplegable de etiquetas abierto al hacer clic dentro del iframe
            doc.addEventListener('click', (e) => {
                document.querySelectorAll('[id^="email-label-dropdown"]').forEach(el => el.classList.add('hidden'));
                const link = e.target.closest('a');
                if (!link || !link.href) return;
                const href = link.href;

                // Permitir enlaces ancla internos (#...)
                if (href.startsWith('#') || href.startsWith(window.location.origin + '/#') || href.startsWith(window.location.href + '#')) {
                    return;
                }

                e.preventDefault();
                e.stopPropagation();
                EmailManager.openEmailLink(href);
            }, true);

            const adjustHeight = () => {
                try {
                    const wrapper = doc.getElementById('merke-email-content');
                    const docBody = doc.body;
                    if (!docBody) return;

                    let exactHeight = 0;
                    if (wrapper) {
                        const rect = wrapper.getBoundingClientRect();
                        exactHeight = Math.ceil(rect.height || wrapper.offsetHeight || 0);

                        const children = wrapper.children;
                        if (children && children.length > 0) {
                            let maxBottom = 0;
                            for (let i = 0; i < children.length; i++) {
                                const ch = children[i];
                                if (ch.nodeType === 1 && ch.offsetHeight > 0) {
                                    const b = ch.offsetTop + ch.offsetHeight;
                                    if (b > maxBottom) maxBottom = b;
                                }
                            }
                            if (maxBottom > 0) {
                                exactHeight = Math.max(exactHeight, maxBottom);
                            }
                        }
                    }

                    if (!exactHeight || exactHeight < 10) {
                        exactHeight = Math.ceil(docBody.scrollHeight || docBody.offsetHeight || 0);
                    }

                    if (exactHeight > 0) {
                        const targetHeight = Math.max(exactHeight, 20);
                        const currentHeight = parseInt(frame.style.height, 10) || 0;
                        if (Math.abs(targetHeight - currentHeight) >= 2) {
                            frame.style.height = targetHeight + 'px';
                        }
                    }
                } catch (err) {}
            };

            adjustHeight();
            frame.onload = adjustHeight;

            // Normalizar y blindar proporciones y dimensiones de imágenes
            const images = doc.images || [];
            Array.from(images).forEach(img => {
                // 1. Spacers y píxeles de rastreo de 0 o 1px
                const wAttr = img.getAttribute('width');
                const hAttr = img.getAttribute('height');
                const numW = parseInt(wAttr, 10);
                const numH = parseInt(hAttr, 10);

                const isTracker = (wAttr === '0' || wAttr === '1' || numW === 1 || numW === 0) &&
                                  (hAttr === '0' || hAttr === '1' || numH === 1 || numH === 0);
                if (isTracker) {
                    img.style.setProperty('max-width', '1px', 'important');
                    img.style.setProperty('max-height', '1px', 'important');
                    img.style.setProperty('width', '1px', 'important');
                    img.style.setProperty('height', '1px', 'important');
                    img.style.setProperty('display', 'inline-block', 'important');
                    return;
                }

                // 2. Imágenes con altura fija pero sin ancho (ej. logos o iconos de 20px, 24px, 33px)
                // Evita que queden desproporcionadas por resoluciones nativas retina
                if (hAttr && (!wAttr || wAttr === 'auto') && !img.style.width) {
                    if (numH > 1) {
                        img.style.setProperty('height', `${numH}px`, 'important');
                        img.style.setProperty('width', 'auto', 'important');
                        img.style.setProperty('max-width', '100%');
                    }
                }

                // 3. Imágenes con dimensiones fijas (atributos o estilo en píxeles)
                // Si el contenedor se reduce por debajo de su ancho, asegurar que la altura escale
                // proporcionalmente con aspect-ratio en lugar de estirarse o aplastarse
                let explicitW = numW;
                let explicitH = numH;
                if (!explicitW && img.style.width && img.style.width.endsWith('px')) {
                    explicitW = parseInt(img.style.width, 10);
                }
                if (!explicitH && img.style.height && img.style.height.endsWith('px')) {
                    explicitH = parseInt(img.style.height, 10);
                }

                if (explicitW > 0 && explicitH > 0) {
                    img.style.aspectRatio = `${explicitW} / ${explicitH}`;
                    // Si tiene altura fija en style y es un banner/imagen grande (>100px),
                    // permitir que la altura escale cuando el ancho se restrinja por max-width: 100%
                    if (explicitW > 100 && img.style.height && img.style.height !== 'auto' && !img.style.height.includes('%')) {
                        img.style.height = 'auto';
                        img.style.maxWidth = '100%';
                    }
                }

                // 4. Asegurar que al cargar, imágenes sin dimensiones nativas calculen su aspect-ratio
                const onImageReady = () => {
                    if (img.naturalWidth && img.naturalHeight && img.naturalWidth > 0 && img.naturalHeight > 0) {
                        if (!img.style.aspectRatio && !isTracker) {
                            img.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
                        }
                    }
                    adjustHeight();
                };

                if (img.complete) {
                    onImageReady();
                } else {
                    img.addEventListener('load', onImageReady);
                }

                // Manejo de errores de carga de imágenes con fallback al proxy backend
                img.addEventListener('error', function onImgError() {
                    img.removeEventListener('error', onImgError);
                    const originalSrc = this.getAttribute('src') || this.src;
                    if (originalSrc && !this.dataset.fallbackTried && (originalSrc.startsWith('http://') || originalSrc.startsWith('https://'))) {
                        this.dataset.fallbackTried = "true";
                        this.src = `/api/image-proxy?url=${encodeURIComponent(originalSrc)}`;
                        this.addEventListener('load', onImageReady);
                    } else {
                        adjustHeight();
                    }
                });
            });

            // ResizeObserver únicamente sobre el contenedor interno de contenido (sin observar documentElement)
            const wrapper = doc.getElementById('merke-email-content') || doc.body;
            if (window.ResizeObserver && wrapper) {
                const ro = new ResizeObserver(() => adjustHeight());
                ro.observe(wrapper);
            }

            // MutationObserver para detectar inserciones asíncronas
            if (window.MutationObserver && wrapper) {
                const mo = new MutationObserver(() => adjustHeight());
                mo.observe(wrapper, { childList: true, subtree: true, attributes: true });
            }

            // Pasadas de respaldo para cuando fuentes remotas e imágenes finalicen renderizado
            setTimeout(adjustHeight, 150);
            setTimeout(adjustHeight, 400);
            setTimeout(adjustHeight, 1000);
        } catch (e) {
            console.error("Error montando iframe aislado de correo:", e);
        }
    },

    openEmailLink(url) {
        if (!url) return;
        const isDesktop = (window.DesktopBridge && window.DesktopBridge.isDesktop) || (window.location.port === '6524');
        const isPwa = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

        if (isDesktop) {
            // 1. Modo Instalado de Escritorio: abrir directamente en el navegador por defecto del sistema
            if (window.DesktopBridge && window.DesktopBridge.openExternalUrl) {
                window.DesktopBridge.openExternalUrl(url);
                return;
            }
        }

        if (isPwa) {
            // 2. Modo PWA: abrir en el navegador predeterminado del sistema operativo
            fetch('/api/desktop/open-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            }).then(r => r.json()).then(data => {
                if (!data.success) {
                    window.open(url, '_blank', 'noopener,noreferrer');
                }
            }).catch(() => {
                window.open(url, '_blank', 'noopener,noreferrer');
            });
            return;
        }

        // 3. Modo Web (Navegador): abrir en pestaña nueva
        window.open(url, '_blank', 'noopener,noreferrer');
    },

    cancelReadTimer() {
        if (this.readTimerId) {
            clearTimeout(this.readTimerId);
            this.readTimerId = null;
        }
        this.pendingReadEmailId = null;
    },

    async markEmailAsReadAfterDelay(emailId) {
        // Verificar que el correo siga siendo el seleccionado actualmente
        if (this.selectedEmailId !== emailId) return;

        const item = this.emails.find(e => e.id === emailId);
        if (item && item.is_read) return;

        try {
            const res = await fetch(`/api/emails/${emailId}/read`, { method: 'POST' });
            if (res.ok) {
                if (item) item.is_read = 1;
                if (this.currentOpenedEmail && this.currentOpenedEmail.id === emailId) {
                    this.currentOpenedEmail.is_read = 1;
                }
                this.updateEmailItemReadStatus(emailId, true);
                await this.updateUnreadCounts();
            }
        } catch (e) {
            console.error("Error marcando correo como visto tras 7 segundos:", e);
        } finally {
            if (this.pendingReadEmailId === emailId) {
                this.pendingReadEmailId = null;
                this.readTimerId = null;
            }
        }
    },

    updateEmailItemReadStatus(emailId, isRead) {
        const el = document.getElementById(`email-item-${emailId}`);
        if (!el) return;

        if (isRead) {
            el.classList.remove('bg-slate-50/80', 'dark:bg-slate-850/80');
            el.classList.add('bg-white', 'dark:bg-slate-900');

            const sender = el.querySelector('.email-item-sender');
            if (sender) {
                sender.classList.remove('font-bold', 'text-slate-900', 'dark:text-white');
                sender.classList.add('font-medium', 'text-slate-700', 'dark:text-slate-300');
            }

            const date = el.querySelector('.email-item-date');
            if (date) {
                date.classList.remove('font-bold', 'text-indigo-600', 'dark:text-indigo-400');
                date.classList.add('text-slate-400');
            }

            const subject = el.querySelector('.email-item-subject');
            if (subject) {
                subject.classList.remove('font-semibold', 'text-slate-900', 'dark:text-white');
                subject.classList.add('text-slate-700', 'dark:text-slate-300');
            }
        } else {
            el.classList.add('bg-slate-50/80', 'dark:bg-slate-850/80');
            el.classList.remove('bg-white', 'dark:bg-slate-900');

            const sender = el.querySelector('.email-item-sender');
            if (sender) {
                sender.classList.add('font-bold', 'text-slate-900', 'dark:text-white');
                sender.classList.remove('font-medium', 'text-slate-700', 'dark:text-slate-300');
            }

            const date = el.querySelector('.email-item-date');
            if (date) {
                date.classList.add('font-bold', 'text-indigo-600', 'dark:text-indigo-400');
                date.classList.remove('text-slate-400');
            }

            const subject = el.querySelector('.email-item-subject');
            if (subject) {
                subject.classList.add('font-semibold', 'text-slate-900', 'dark:text-white');
                subject.classList.remove('text-slate-700', 'dark:text-slate-300');
            }
        }
    },

    resetDetailView() {
        this.cancelReadTimer();
        this.selectedEmailId = null;
        this.currentOpenedEmail = null;
        document.querySelectorAll('body > [id^="email-label-dropdown-top-"]').forEach(el => el.remove());
        const detailPanel = document.getElementById('email-detail-container');
        if (!detailPanel) return;

        detailPanel.innerHTML = `
            <div class="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
                <div class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center mb-4 shadow-2xs">
                    <svg class="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                </div>
                <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-300">Ningún correo seleccionado</h3>
                <p class="text-xs text-slate-500 mt-1 max-w-sm">Haz clic en un correo de la lista izquierda para previsualizarlo y responder con IA.</p>
            </div>
        `;

        if (window.innerWidth < 768) {
            detailPanel.classList.add('hidden');
            detailPanel.classList.remove('flex');
            const listPanel = document.getElementById('email-list-container');
            if (listPanel) listPanel.classList.remove('hidden');
        }
    },

    onBrandClick() {
        if (window.UI && typeof UI.switchMainView === 'function') {
            UI.switchMainView('mail');
        } else {
            const sectionMail = document.getElementById('main-mail-section');
            const sectionCalendar = document.getElementById('main-calendar-section');
            const sectionNotes = document.getElementById('main-notes-section');
            if (sectionMail) sectionMail.classList.remove('hidden');
            if (sectionCalendar) sectionCalendar.classList.add('hidden');
            if (sectionNotes) sectionNotes.classList.add('hidden');
        }
        this.currentFolder = 'INBOX';
        this.currentLabelId = null;
        this.clearSelection();
        this.renderLabels();
        // Mostrar siempre el resumen ejecutivo 360° de Elio al pulsar en el logo o título de la aplicación
        this.showElioInboxSummary(true);
        this.loadEmails();
    },

    async toggleTaskFromDashboard(taskId, checkboxEl) {
        if (!taskId) return;
        try {
            const res = await fetch(`/api/events/${taskId}/complete`, { method: 'POST' });
            if (res.ok) {
                if (window.UI) UI.showStickyToast('Tarea Actualizada', 'El estado de la tarea ha sido modificado', 'success', 2000);
                const item = checkboxEl ? checkboxEl.closest('.task-dashboard-item') : null;
                if (item) {
                    item.classList.toggle('opacity-40');
                    const textEl = item.querySelector('.task-dashboard-title');
                    if (textEl) textEl.classList.toggle('line-through');
                }
                if (window.CalendarManager && typeof CalendarManager.loadEvents === 'function') {
                    CalendarManager.loadEvents();
                }
            }
        } catch (e) {
            console.error('Error al actualizar tarea desde resumen:', e);
        }
    },

    async showElioInboxSummary(force = false) {
        const isAiActive = !!(window.GeminiAI && GeminiAI.isAiActive);
        if (!isAiActive && !force) return;

        this.cancelReadTimer();
        this.selectedEmailId = null;
        this.currentOpenedEmail = null;
        document.querySelectorAll('.email-item-container').forEach(el => el.classList.remove('bg-indigo-50/60', 'dark:bg-slate-800/80', 'border-indigo-400/50'));

        const detailPanel = document.getElementById('email-detail-container');
        if (!detailPanel) return;

        if (window.innerWidth < 768) {
            const listPanel = document.getElementById('email-list-container');
            if (listPanel) listPanel.classList.add('hidden');
            detailPanel.classList.remove('hidden');
            detailPanel.classList.add('flex');
        } else {
            detailPanel.classList.remove('hidden');
            detailPanel.classList.add('flex');
        }

        detailPanel.innerHTML = `
            <div class="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400 animate-pulse">
                <div class="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 text-indigo-500 shadow-sm">
                    <svg class="w-7 h-7 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                </div>
                <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-300">Elio está preparando tu resumen ejecutivo 360°...</h3>
                <p class="text-xs text-slate-500 mt-1 max-w-sm">Consolidando en tiempo real correos, agenda de la semana, tareas, notas y recomendaciones de IA.</p>
            </div>
        `;

        try {
            const res = await fetch('/api/agent/summary');
            if (!res.ok) throw new Error('Error al obtener resumen de Elio');
            const data = await res.json();
            this.renderElioInboxSummaryView(data, detailPanel);
        } catch (err) {
            console.error('Error cargando resumen de Elio:', err);
            if (force) {
                detailPanel.innerHTML = `
                    <div class="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400">
                        <div class="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4 text-rose-500">
                            <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                        </div>
                        <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-300">No se pudo generar el resumen</h3>
                        <p class="text-xs text-slate-500 mt-1 max-w-sm">${err.message || 'Error de conexión con el agente.'}</p>
                        <button onclick="EmailManager.showElioInboxSummary(true)" class="mt-4 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">Reintentar</button>
                    </div>
                `;
            } else {
                this.resetDetailView();
            }
        }
    },

    renderElioInboxSummaryView(data, detailPanel) {
        this.lastSummaryData = data;
        const unreadCount = data.unread_count || 0;
        const inboxTotal = data.inbox_total || 0;
        const upcoming = data.upcoming_event;
        const recommendation = data.recommendation || 'Todo está en orden en tu espacio de trabajo.';
        const priorityEmails = (data.priority_emails && data.priority_emails.length > 0) ? data.priority_emails : (data.recent_unreads || []);
        const weekEvents = data.week_events || [];
        const pendingTasks = data.pending_tasks || [];
        const notes = data.notes || [];
        const notesCount = data.notes_count || notes.length || 0;
        const contactsCount = data.contacts_count || 0;
        const pendingContacts = data.pending_contacts_count || 0;

        // 1. Correos Prioritarios
        let priorityCardsHtml = '';
        if (priorityEmails.length === 0) {
            priorityCardsHtml = `
                <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-center text-xs text-slate-500">
                    No tienes correos con avisos de pago, facturas o alertas pendientes en este momento.
                </div>
            `;
        } else {
            priorityCardsHtml = priorityEmails.map(em => {
                const subject = this.escapeHtml(em.subject || 'Sin Asunto');
                const sender = this.escapeHtml(em.sender || 'Remitente Desconocido');
                const snippet = this.escapeHtml(em.snippet || '');
                const date = em.date ? new Date(em.date).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                return `
                    <div class="group p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500/60 hover:shadow-xs transition-all cursor-pointer flex flex-col gap-1.5" onclick="EmailManager.openEmailDetail(${em.id})">
                        <div class="flex items-center justify-between gap-2">
                            <span class="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[70%]">${sender}</span>
                            <span class="text-[11px] text-slate-400 font-mono shrink-0">${date}</span>
                        </div>
                        <h4 class="text-xs font-medium text-slate-900 dark:text-white line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">${subject}</h4>
                        <p class="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">${snippet}</p>
                        <div class="flex items-center justify-end gap-1 mt-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span>Abrir correo</span>
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 2. Próxima Cita en Agenda
        let upcomingEventHtml = '';
        if (upcoming) {
            const evTitle = this.escapeHtml(upcoming.title || 'Evento programado');
            let evTime = '';
            if (upcoming.start_time) {
                const d = new Date(upcoming.start_time);
                evTime = !isNaN(d.getTime()) ? d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : upcoming.start_time.replace('T', ' ');
            }
            const calName = this.escapeHtml(upcoming.calendar_name || 'Calendario');
            const calColor = upcoming.effective_color || upcoming.calendar_color || '#f59e0b';
            upcomingEventHtml = `
                <div class="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start justify-between gap-3 cursor-pointer hover:bg-amber-500/15 transition-colors" onclick="UI.switchMainView('calendar')" title="Abrir en Calendario">
                    <div class="flex items-start gap-3 min-w-0">
                        <div class="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0 mt-0.5">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Próxima cita en Agenda</span>
                                <span class="px-1.5 py-0.2 rounded text-[9px] font-semibold text-white truncate max-w-[120px]" style="background-color: ${calColor};">${calName}</span>
                            </div>
                            <p class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate mt-1">${evTitle}</p>
                            <span class="text-[11px] text-slate-500 dark:text-slate-400 font-mono block mt-0.5 capitalize">${evTime}</span>
                        </div>
                    </div>
                    <span class="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold shrink-0 mt-1 flex items-center gap-0.5">Ver →</span>
                </div>
            `;
        }

        // 3. Citas de la Semana Actual
        let weekEventsHtml = '';
        if (weekEvents.length === 0) {
            weekEventsHtml = `
                <div class="p-3 text-center text-xs text-slate-400 dark:text-slate-500 bg-slate-50/60 dark:bg-slate-900/40 rounded-xl border border-slate-200/60 dark:border-slate-800">
                    No hay eventos programados en esta semana.
                </div>
            `;
        } else {
            weekEventsHtml = weekEvents.slice(0, 5).map(ev => {
                const title = this.escapeHtml(ev.title || 'Evento');
                let timeStr = '';
                if (ev.start_time) {
                    const d = new Date(ev.start_time);
                    timeStr = !isNaN(d.getTime()) ? d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ev.start_time.replace('T', ' ');
                }
                const calColor = ev.effective_color || ev.calendar_color || '#6366f1';
                return `
                    <div class="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500/60 transition-all cursor-pointer" onclick="UI.switchMainView('calendar')">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${calColor};"></span>
                            <span class="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">${title}</span>
                        </div>
                        <span class="text-[11px] text-slate-400 font-mono shrink-0 capitalize">${timeStr}</span>
                    </div>
                `;
            }).join('');
        }

        // 4. Tareas Pendientes
        let tasksHtml = '';
        if (pendingTasks.length === 0) {
            tasksHtml = `
                <div class="p-3 text-center text-xs text-slate-400 dark:text-slate-500 bg-slate-50/60 dark:bg-slate-900/40 rounded-xl border border-slate-200/60 dark:border-slate-800">
                    ¡Excelente! No tienes tareas pendientes.
                </div>
            `;
        } else {
            tasksHtml = pendingTasks.map(t => {
                const rawTitle = t.title || 'Tarea';
                const title = this.escapeHtml(rawTitle.replace(/^\[Tarea\]\s*/i, ''));
                return `
                    <div class="task-dashboard-item flex items-center justify-between gap-2.5 p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 transition-all">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <input type="checkbox" onchange="EmailManager.toggleTaskFromDashboard(${t.id}, this)" class="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0">
                            <span class="task-dashboard-title text-xs font-medium text-slate-800 dark:text-slate-200 truncate">${title}</span>
                        </div>
                        <button onclick="UI.switchMainView('calendar')" class="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline shrink-0 font-medium">Ver</button>
                    </div>
                `;
            }).join('');
        }

        // 5. Pizarra de Notas Adhesivas (Mini Cards)
        const noteColorMap = {
            yellow: '#fef08a',
            green: '#bbf7d0',
            blue: '#bfdbfe',
            pink: '#fbcfe8',
            purple: '#e9d5ff',
            orange: '#fed7aa',
            white: '#f1f5f9'
        };
        let notesHtml = '';
        if (notes.length === 0) {
            notesHtml = `
                <div class="col-span-full p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-center text-xs text-slate-500">
                    No tienes notas en la pizarra. <button onclick="UI.switchMainView('notes')" class="text-indigo-600 dark:text-indigo-400 font-semibold underline ml-1">Crear primera nota</button>
                </div>
            `;
        } else {
            notesHtml = notes.slice(0, 4).map(n => {
                const bg = noteColorMap[n.color] || '#fef08a';
                const snippet = this.escapeHtml(n.content || '(Nota sin texto)');
                return `
                    <div class="p-3 rounded-xl border border-black/10 shadow-xs cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col justify-between min-h-[95px]" style="background-color: ${bg}; color: #1e1e2e;" onclick="UI.switchMainView('notes')" title="Abrir en Pizarra de Notas">
                        <p class="text-xs font-medium line-clamp-3 leading-relaxed whitespace-pre-wrap">${snippet}</p>
                        <div class="flex items-center justify-between text-[10px] opacity-60 mt-2 font-mono">
                            <span>#${n.id}</span>
                            <span>Editar →</span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 6. Aviso de Contactos Pendientes si existen
        let pendingContactsAlert = '';
        if (pendingContacts > 0) {
            pendingContactsAlert = `
                <div class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs">
                    <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                        <span class="text-slate-800 dark:text-slate-200">Tienes <strong>${pendingContacts} contacto(s) nuevo(s)</strong> pendientes de confirmación.</span>
                    </div>
                    <button onclick="UI.openDrawer('drawer-contacts')" class="px-2.5 py-1 bg-amber-500 text-white font-semibold rounded-lg text-xs hover:bg-amber-600 transition-colors shrink-0">Revisar</button>
                </div>
            `;
        }

        detailPanel.innerHTML = `
            <div class="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50/50 dark:bg-slate-950/40 p-4 sm:p-6 lg:p-8 space-y-5">
                
                <!-- Barra Superior Móvil: Volver a lista de correos (< 768px) -->
                <div class="md:hidden flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                    <button onclick="EmailManager.backToList()" class="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                        <span>Volver a correos</span>
                    </button>
                    <span class="text-[11px] text-slate-400 font-medium">Resumen Ejecutivo</span>
                </div>

                <!-- Header del Resumen con Elio -->
                <div class="flex items-start justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
                    <div class="flex items-center gap-3.5">
                        <div class="relative cursor-pointer" onclick="UI.openDrawer('drawer-antigravity')" title="Abrir asistente Elio">
                            <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                            </div>
                            <span class="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" title="Elio Copiloto Activo"></span>
                        </div>
                        <div>
                            <div class="flex items-center gap-2 flex-wrap">
                                <h2 class="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">Resumen Ejecutivo de Elio</h2>
                                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${data.ai_generated ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'}">
                                    <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                                    <span>${data.ai_generated ? 'Generado por Elio IA' : 'Visión 360°'}</span>
                                </span>
                            </div>
                            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Panorama unificado de tu bandeja, calendario semanal, tareas y notas</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <!-- Botón Escuchar Briefing por Voz con Elio -->
                        <button id="btn-voice-briefing" onclick="VoiceBriefing.toggle(this)" class="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer" title="Escuchar briefing ejecutivo narrado por Elio">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>
                            <span id="voice-briefing-label">Escuchar</span>
                        </button>
                        <button onclick="EmailManager.showElioInboxSummary(true)" class="p-2 rounded-xl text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-2xs" title="Actualizar resumen">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                        </button>
                        <button onclick="UI.openDrawer('drawer-antigravity-copilot')" class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors" title="Chatear con Elio">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>
                            <span>Copiloto</span>
                        </button>
                    </div>
                </div>

                <!-- Síntesis Ejecutiva de Elio -->
                <div class="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/5 border border-indigo-500/20 shadow-2xs space-y-2">
                    <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                        <h3 class="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Síntesis Ejecutiva de Hoy</h3>
                    </div>
                    <p class="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">${this.escapeHtml(recommendation)}</p>
                </div>

                ${pendingContactsAlert}

                <!-- Tarjetas Métricas Rápidas 4x1 -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                        <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Sin Leer</span>
                        <div class="mt-1 flex items-baseline gap-1.5">
                            <span class="text-2xl font-bold ${unreadCount > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300'}">${unreadCount}</span>
                            <span class="text-[10px] text-slate-400">/ ${inboxTotal}</span>
                        </div>
                    </div>
                    <div class="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs cursor-pointer hover:border-indigo-400 transition-colors" onclick="UI.switchMainView('calendar')">
                        <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Citas Semana</span>
                        <div class="mt-1 flex items-baseline gap-1.5">
                            <span class="text-2xl font-bold text-amber-500">${weekEvents.length}</span>
                            <span class="text-[10px] text-slate-400">eventos</span>
                        </div>
                    </div>
                    <div class="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs cursor-pointer hover:border-indigo-400 transition-colors" onclick="UI.switchMainView('notes')">
                        <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Notas Adhesivas</span>
                        <div class="mt-1 flex items-baseline gap-1.5">
                            <span class="text-2xl font-bold text-emerald-500">${notesCount}</span>
                            <span class="text-[10px] text-slate-400">en pizarra</span>
                        </div>
                    </div>
                    <div class="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs cursor-pointer hover:border-indigo-400 transition-colors" onclick="UI.openDrawer('drawer-contacts')">
                        <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Contactos</span>
                        <div class="mt-1 flex items-baseline gap-1.5">
                            <span class="text-2xl font-bold text-sky-500">${contactsCount}</span>
                            <span class="text-[10px] text-slate-400">${pendingContacts > 0 ? `(${pendingContacts} pend.)` : 'agenda'}</span>
                        </div>
                    </div>
                </div>

                <!-- Contenido Principal Dividido en 2 Columnas -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    
                    <!-- Columna 1: Correos Prioritarios -->
                    <div class="space-y-3">
                        <div class="flex items-center justify-between">
                            <h3 class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                <svg class="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                                <span>Correos de Atención Prioritaria</span>
                            </h3>
                            <span class="text-[11px] text-slate-400">Clic para abrir</span>
                        </div>
                        <div class="space-y-2.5">
                            ${priorityCardsHtml}
                        </div>
                    </div>

                    <!-- Columna 2: Calendario Semanal & Tareas -->
                    <div class="space-y-4">
                        
                        <!-- Próxima Cita -->
                        ${upcomingEventHtml}

                        <!-- Eventos de la Semana -->
                        <div class="space-y-2">
                            <div class="flex items-center justify-between">
                                <h3 class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                    <svg class="w-4 h-4 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                                    <span>Agenda de la Semana Actual</span>
                                </h3>
                                <button onclick="UI.switchMainView('calendar')" class="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">Ver Calendario →</button>
                            </div>
                            <div class="space-y-1.5">
                                ${weekEventsHtml}
                            </div>
                        </div>

                        <!-- Tareas Pendientes -->
                        <div class="space-y-2">
                            <div class="flex items-center justify-between">
                                <h3 class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                    <svg class="w-4 h-4 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
                                    <span>Tareas Pendientes</span>
                                </h3>
                                <span class="text-[11px] text-slate-400">Marca para completar</span>
                            </div>
                            <div class="space-y-1.5">
                                ${tasksHtml}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Sección Inferior: Pizarra de Notas Adhesivas -->
                <div class="pt-4 border-t border-slate-200/80 dark:border-slate-800 space-y-3">
                    <div class="flex items-center justify-between">
                        <h3 class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                            <svg class="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                            <span>Pizarra de Notas Adhesivas</span>
                        </h3>
                        <button onclick="UI.switchMainView('notes')" class="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">Ir a Pizarra de Notas →</button>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        ${notesHtml}
                    </div>
                </div>

            </div>
        `;
    },

    backToList() {
        this.resetDetailView();
    },

    toggleSpamImages(emailId) {
        const isCurrentlyAuthorized = this.authorizedSpamImages.has(emailId);
        if (isCurrentlyAuthorized) {
            this.authorizedSpamImages.delete(emailId);
            UI.showStickyToast('Imágenes Ocultadas', 'Las imágenes de este correo han sido bloqueadas nuevamente', 'info');
        } else {
            this.authorizedSpamImages.add(emailId);
            UI.showStickyToast('Imágenes Desbloqueadas', 'Se han autorizado y cargado las imágenes de este correo', 'info');
        }

        const nowAuthorized = !isCurrentlyAuthorized;

        if (this.currentOpenedEmail && this.currentOpenedEmail.id === emailId) {
            this.mountEmailBodyFrame(this.currentOpenedEmail, nowAuthorized);
            this.updateSpamBannerUI(emailId, nowAuthorized);
        }
    },

    authorizeSpamImages(emailId) {
        return this.toggleSpamImages(emailId);
    },

    updateSpamBannerUI(emailId, isAuthorized) {
        const btn = document.getElementById(`btn-toggle-spam-images-${emailId}`);
        const subtext = document.getElementById(`spam-banner-subtext-${emailId}`);
        
        if (subtext) {
            subtext.textContent = isAuthorized
                ? 'Las imágenes de este correo han sido mostradas por tu autorización.'
                : 'Por tu seguridad, se han bloqueado las imágenes remotas de este correo.';
        }

        if (btn) {
            if (isAuthorized) {
                btn.title = 'Ocultar imágenes remotas';
                btn.innerHTML = `
                    <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/></svg>
                    <span>Ocultar imágenes</span>
                `;
            } else {
                btn.title = 'Cargar y ver imágenes de este correo';
                btn.innerHTML = `
                    <svg class="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                    <span>Mostrar imágenes</span>
                `;
            }
        }
    },

    getAttachmentBadge(filename = '', contentType = '') {
        const ext = (filename.split('.').pop() || '').toLowerCase();
        const ct = (contentType || '').toLowerCase();
        if (ext === 'pdf' || ct.includes('pdf')) {
            return {
                bg: 'bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/70',
                label: 'PDF',
                desc: 'Documento PDF'
            };
        }
        if (['xlsx', 'xls', 'csv'].includes(ext) || ct.includes('sheet') || ct.includes('excel')) {
            return {
                bg: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/70',
                label: 'XLS',
                desc: 'Hoja de cálculo'
            };
        }
        if (['doc', 'docx'].includes(ext) || ct.includes('word') || ct.includes('document')) {
            return {
                bg: 'bg-blue-100 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/70',
                label: 'DOC',
                desc: 'Documento de Word'
            };
        }
        if (['ppt', 'pptx'].includes(ext) || ct.includes('presentation')) {
            return {
                bg: 'bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/70',
                label: 'PPT',
                desc: 'Presentación'
            };
        }
        if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext) || ct.startsWith('image/')) {
            return {
                bg: 'bg-purple-100 dark:bg-purple-950/70 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/70',
                label: 'IMG',
                desc: 'Imagen'
            };
        }
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || ct.includes('zip') || ct.includes('compressed')) {
            return {
                bg: 'bg-yellow-100 dark:bg-yellow-950/70 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800/70',
                label: 'ZIP',
                desc: 'Archivo comprimido'
            };
        }
        return {
            bg: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
            label: (ext.toUpperCase().slice(0, 4) || 'FILE'),
            desc: 'Archivo adjunto'
        };
    },

    downloadAttachment(attId, filename, e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const link = document.createElement('a');
        link.href = `/api/attachments/${attId}/download`;
        link.download = filename || 'adjunto';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        if (window.UI && typeof UI.showStickyToast === 'function') {
            UI.showStickyToast('Descargando archivo', `Descargando ${filename || 'adjunto'}...`, 'info', 3000);
        }
    },

    downloadAllAttachments(emailId) {
        if (!this.currentOpenedEmail || !this.currentOpenedEmail.attachments) return;
        this.currentOpenedEmail.attachments.forEach((att, idx) => {
            setTimeout(() => {
                const link = document.createElement('a');
                link.href = `/api/attachments/${att.id}/download`;
                link.download = att.filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }, idx * 300);
        });
        UI.showStickyToast('Descargando adjuntos', 'Iniciando descarga de los archivos adjuntos', 'info');
    },

    async markNotSpam(emailId) {
        try {
            const res = await fetch(`/api/emails/${emailId}/not-spam`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                UI.showStickyToast('No es spam', 'El correo ha sido marcado como legítimo y movido a Recibidos', 'success');
                if (this.currentFolder === 'SPAM') {
                    this.backToList();
                    this.loadEmails();
                } else {
                    if (this.currentOpenedEmail && this.currentOpenedEmail.id === emailId) {
                        this.currentOpenedEmail.folder = 'INBOX';
                        this.renderEmailDetail(this.currentOpenedEmail);
                    }
                    this.loadEmails();
                }
                if (window.App && App.loadUnreadCounts) {
                    App.loadUnreadCounts();
                }
            } else {
                UI.showStickyToast('Error', data.detail || 'No se pudo mover el correo', 'error');
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    async toggleStar(emailId, event) {
        event.stopPropagation();
        try {
            const res = await fetch(`/api/emails/${emailId}/star`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                const em = this.emails.find(e => e.id === emailId);
                if (em) em.is_starred = data.is_starred;
                this.renderEmailsTable();
            }
        } catch (e) {
            console.error(e);
        }
    },

    async deleteCurrentEmail(emailId) {
        // Si el correo ya está en la Papelera, la acción lo elimina definitivamente de Senda
        const opened = (this.currentOpenedEmail && this.currentOpenedEmail.id === emailId) ? this.currentOpenedEmail : null;
        const inTrash = ((opened && opened.folder) || '').toUpperCase() === 'TRASH';

        if (inTrash) {
            // La eliminación definitiva de papelera siempre solicita confirmación por seguridad
            const confirmed = await UI.confirm({
                title: '¿Eliminar definitivamente?',
                message: 'El correo se eliminará de Senda. Esta acción no se puede deshacer.',
                confirmText: 'Eliminar definitivamente',
                isDanger: true
            });
            if (!confirmed) return;
        } else if (!this.skipDeleteConfirm) {
            // Mover a papelera: solicitar confirmación si no se ha activado la omisión previa
            const confirmed = await UI.confirm({
                title: '¿Mover a la papelera?',
                message: 'El correo seleccionado se moverá a la papelera.',
                confirmText: 'Mover a papelera',
                isDanger: true,
                showDontAskAgain: true,
                dontAskAgainLabel: 'No volver a preguntar al eliminar correos',
                onDontAskAgain: (checked) => {
                    if (checked) {
                        this.setSkipDeleteConfirm(true, true);
                    }
                }
            });
            if (!confirmed) return;
        }

        try {
            const res = await fetch(`/api/emails/${emailId}`, { method: 'DELETE' });
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                UI.showStickyToast('Correo Eliminado', data.permanent ? 'El correo fue eliminado definitivamente' : 'El correo ha sido enviado a la papelera', 'success');
                this.backToList();
                this.loadEmails();
                if (typeof this.updateUnreadCounts === 'function') this.updateUnreadCounts();
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    prepareReply(sender, subject) {
        if (!sender && this.currentOpenedEmail) sender = this.currentOpenedEmail.sender;
        if (!subject && this.currentOpenedEmail) subject = this.currentOpenedEmail.subject;
        sender = sender || '';
        subject = subject || '';

        // Mostrar el formulario de respuesta en línea al hacer clic en Responder, desplazar y posicionar el cursor
        const inlineContainer = document.getElementById('inline-reply-container');
        const inlineEditor = document.getElementById('inline-reply-editor');
        if (inlineContainer && inlineEditor) {
            inlineContainer.classList.remove('hidden');
            setTimeout(() => {
                inlineContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                if (window.InlineReply) {
                    InlineReply.focusTop();
                } else {
                    inlineEditor.focus();
                }
            }, 30);
            return;
        }

        const composeModal = document.getElementById('compose-modal');
        const toInput = document.getElementById('compose-to');
        const subjectInput = document.getElementById('compose-subject');
        
        toInput.value = sender;
        subjectInput.value = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
        
        if (window.Composer) {
            Composer.clear();
        }

        composeModal.classList.remove('hidden');

        // Aplicar firma por default de la cuenta seleccionada si no tiene
        const accountSelect = document.getElementById('compose-account-select');
        if (accountSelect && window.SignatureManager) {
            SignatureManager.applyDefaultSignatureForAccount(parseInt(accountSelect.value));
        }
    },

    prepareForward(subject) {
        if (!subject && this.currentOpenedEmail) subject = this.currentOpenedEmail.subject;
        subject = subject || '';

        const composeModal = document.getElementById('compose-modal');
        const toInput = document.getElementById('compose-to');
        const subjectInput = document.getElementById('compose-subject');
        
        toInput.value = '';
        subjectInput.value = subject.startsWith('Fwd:') ? subject : `Fwd: ${subject}`;
        
        if (window.Composer) {
            Composer.clear();
            // Si hay correo abierto, citar el contenido para reenvío
            if (this.currentOpenedEmail) {
                const fwdHeader = `<br><br><div class="fwd-quote border-l-2 border-slate-300 dark:border-slate-700 pl-3 my-3 text-slate-500 text-xs">
                    <p><b>---------- Mensaje reenviado ----------</b></p>
                    <p><b>De:</b> ${Composer.escapeHTML(this.currentOpenedEmail.sender || '')}</p>
                    <p><b>Fecha:</b> ${Composer.escapeHTML(this.currentOpenedEmail.date || '')}</p>
                    <p><b>Asunto:</b> ${Composer.escapeHTML(this.currentOpenedEmail.subject || '')}</p>
                    <p><b>Para:</b> ${Composer.escapeHTML(this.currentOpenedEmail.recipient || '')}</p>
                    <br>
                    ${(() => {
                        const safeHtml = (this.currentOpenedEmail.body_html || '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
                        return safeHtml || Composer.escapeHTML(this.currentOpenedEmail.body_text || '').replace(/\n/g, '<br>');
                    })()}
                </div>`;
                Composer.setHTML(fwdHeader);
            }
        }

        composeModal.classList.remove('hidden');
        toInput.focus();

        const accountSelect = document.getElementById('compose-account-select');
        if (accountSelect && window.SignatureManager) {
            SignatureManager.applyDefaultSignatureForAccount(parseInt(accountSelect.value));
        }
    },

    async replyWithAI(emailId) {
        const inlineEditor = document.getElementById('inline-reply-editor');
        if (inlineEditor && window.InlineReply) {
            const inlineContainer = document.getElementById('inline-reply-container');
            if (inlineContainer) {
                inlineContainer.classList.remove('hidden');
                setTimeout(() => {
                    inlineContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 30);
            }
            return InlineReply.replyWithAI(emailId);
        }

        UI.showStickyToast('Elio (@elio)', 'Generando borrador de respuesta inteligente...', 'info', 2500);
        try {
            const res = await fetch(`/api/gemini/smart-reply/${emailId}`);
            const data = await res.json();
            
            const em = this.emails.find(e => e.id === emailId);
            this.prepareReply(em ? em.sender : '', em ? em.subject : '');
            
            if (data && data.draft_reply) {
                if (window.Composer) {
                    const draftHtml = `<p>${Composer.escapeHTML(data.draft_reply).replace(/\n/g, '<br>')}</p>`;
                    Composer.setHTML(draftHtml);
                    const accountSelect = document.getElementById('compose-account-select');
                    if (accountSelect && window.SignatureManager) {
                        SignatureManager.applyDefaultSignatureForAccount(parseInt(accountSelect.value));
                    }
                } else {
                    const bodyInput = document.getElementById('compose-body');
                    if (bodyInput) bodyInput.value = data.draft_reply + '\n\n' + bodyInput.value;
                }
                UI.showStickyToast('Borrador Listo', 'Elio (@elio) redactó una propuesta de respuesta', 'success');
            } else {
                UI.showStickyToast('Redactor Listo', 'Escribe tu respuesta asistido por Elio (@elio)', 'info');
            }
        } catch (e) {
            console.error(e);
            const em = this.emails.find(e => e.id === emailId);
            this.prepareReply(em ? em.sender : '', em ? em.subject : '');
        }
    },

    clearSelection() {
        this.selectedBatchIds.clear();
        const selectAllCb = document.getElementById('split-select-all');
        if (selectAllCb) {
            selectAllCb.checked = false;
            selectAllCb.indeterminate = false;
        }
        document.querySelectorAll('.email-checkbox').forEach(cb => {
            cb.checked = false;
        });
        const batchBar = document.getElementById('batch-actions-bar');
        const btnRefresh = document.getElementById('btn-refresh-list');
        if (batchBar && btnRefresh) {
            batchBar.classList.add('hidden');
            btnRefresh.classList.remove('hidden');
        }
        const moreDrop = document.getElementById('batch-more-dropdown');
        const labelsDrop = document.getElementById('batch-labels-dropdown');
        const criteriaDrop = document.getElementById('select-criteria-dropdown');
        if (moreDrop) moreDrop.classList.add('hidden');
        if (labelsDrop) labelsDrop.classList.add('hidden');
        if (criteriaDrop) criteriaDrop.classList.add('hidden');
    },

    updateBatchSelectionUI() {
        const allBoxes = document.querySelectorAll('.email-checkbox');
        const total = allBoxes.length;
        const count = this.selectedBatchIds.size;
        const selectAllCb = document.getElementById('split-select-all');
        const batchBar = document.getElementById('batch-actions-bar');
        const btnRefresh = document.getElementById('btn-refresh-list');

        // Sincronizar cada checkbox individual en el DOM con selectedBatchIds
        allBoxes.forEach(cb => {
            const id = parseInt(cb.dataset.emailId);
            cb.checked = this.selectedBatchIds.has(id);
        });

        // Sincronizar visibilidad de barra masiva vs botón refrescar
        if (batchBar && btnRefresh) {
            if (count > 0) {
                batchBar.classList.remove('hidden');
                btnRefresh.classList.add('hidden');
            } else {
                batchBar.classList.add('hidden');
                btnRefresh.classList.remove('hidden');
            }
        }

        // Sincronizar checkbox principal (indeterminado / marcado / desmarcado)
        if (selectAllCb) {
            if (total === 0 || count === 0) {
                selectAllCb.checked = false;
                selectAllCb.indeterminate = false;
            } else if (count === total) {
                selectAllCb.checked = true;
                selectAllCb.indeterminate = false;
            } else {
                selectAllCb.checked = false;
                selectAllCb.indeterminate = true;
            }
        }

        // Ocultar botón de archivar masivo en Papelera, Spam, Borradores y en "Todos" (ALL)
        // (se usa una clase en el contenedor porque las reglas responsivas de app.css usan !important)
        const listContainer = document.getElementById('email-list-container');
        if (listContainer) {
            listContainer.classList.toggle('batch-archive-disabled', !this.canBatchArchiveInCurrentFolder());
        }

        // Si el menú flotante de mover está visible en modo selección masiva, actualizar cantidad y opciones reactivamente
        const moveDrop = document.getElementById('universal-move-dropdown');
        if (moveDrop && !moveDrop.classList.contains('hidden') && this.pendingMoveContext && this.pendingMoveContext.source === 'batch') {
            if (count === 0) {
                this.closeMoveMenu();
            } else {
                this.pendingMoveContext.emailIds = this.getSelectedEmailIds();
                this.renderMoveMenuContent(moveDrop, 'batch', this.pendingMoveContext.emailIds);
            }
        }
    },

    // Carpetas donde NO se permite archivar en lote: Spam, Papelera, Borradores y "Todos" (ALL),
    // ya que en "Todos" archivar no tiene efecto visible (los archivados también se muestran ahí)
    canBatchArchiveInCurrentFolder() {
        const folderUpper = (this.currentFolder || '').toUpperCase();
        return !['SPAM', 'TRASH', 'DRAFT', 'DRAFTS', 'ALL', 'TODOS'].includes(folderUpper);
    },

    onCheckboxChange(emailId, isChecked) {
        if (isChecked) {
            this.selectedBatchIds.add(emailId);
        } else {
            this.selectedBatchIds.delete(emailId);
        }
        this.updateBatchSelectionUI();
    },

    onItemCheckChanged() {
        this.updateBatchSelectionUI();
    },

    toggleSelectMenu(e) {
        if (e) e.stopPropagation();
        const drop = document.getElementById('select-criteria-dropdown');
        if (drop) drop.classList.toggle('hidden');
    },

    selectEmailsByFilter(criteria) {
        const drop = document.getElementById('select-criteria-dropdown');
        if (drop) drop.classList.add('hidden');

        if (criteria === 'none') {
            this.clearSelection();
            return;
        }

        this.selectedBatchIds.clear();
        this.emails.forEach(email => {
            let matches = false;
            if (criteria === 'all') matches = true;
            else if (criteria === 'read') matches = Boolean(email.is_read);
            else if (criteria === 'unread') matches = !email.is_read;
            else if (criteria === 'starred') matches = Boolean(email.is_starred);
            else if (criteria === 'unstarred') matches = !email.is_starred;

            if (matches) {
                this.selectedBatchIds.add(email.id);
            }
        });

        this.updateBatchSelectionUI();
    },

    getSelectedEmailIds() {
        return Array.from(this.selectedBatchIds);
    },

    async executeBatchAction(action, extraData = {}) {
        const ids = this.getSelectedEmailIds();
        if (ids.length === 0) return;

        if (action === 'archive' && !this.canBatchArchiveInCurrentFolder()) {
            UI.showStickyToast('Acción no permitida', 'No se permite archivar correos desde Todos, Spam, Papelera o Borradores', 'warning');
            return;
        }

        // Cerrar posibles dropdowns
        const moreDrop = document.getElementById('batch-more-dropdown');
        const labelsDrop = document.getElementById('batch-labels-dropdown');
        if (moreDrop) moreDrop.classList.add('hidden');
        if (labelsDrop) labelsDrop.classList.add('hidden');

        try {
            const res = await fetch('/api/emails/batch-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email_ids: ids, action, ...extraData })
            });
            const data = await res.json();
            if (data.success) {
                UI.showStickyToast('Acción Completada', data.message || `${ids.length} correos procesados`, 'success');
                if (action === 'archive' || action === 'spam' || action === 'trash') {
                    this.selectedEmailId = null;
                }
                // Deseleccionar todo inmediatamente al aplicar una acción
                this.clearSelection();
                await this.loadEmails();
                if (action === 'add_label' || action === 'remove_label' || action === 'toggle_label') {
                    await this.loadLabels();
                }
            } else {
                UI.showStickyToast('Error', data.detail || 'No se pudo completar la acción', 'error');
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    toggleBatchLabelsMenu(e) {
        if (e) e.stopPropagation();
        const drop = document.getElementById('batch-labels-dropdown');
        const listEl = document.getElementById('batch-labels-items-list');
        if (!drop || !listEl) return;

        const isHidden = drop.classList.contains('hidden');
        if (isHidden) {
            // Misma lista que la barra lateral (según el selector de cuentas)
            const batchLabels = this.getLabelMenu();

            if (batchLabels.length === 0) {
                listEl.innerHTML = '<div class="px-3 py-2 text-slate-400 text-[11px] italic">Sin etiquetas disponibles</div>';
            } else {
                listEl.innerHTML = batchLabels.map(l => `
                    <button onclick="EmailManager.executeBatchAction('add_label', { label_id: ${l.id} })" class="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-2">
                        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${l.color}"></span>
                        <span class="truncate">${this.escapeHtml(l.name)}${(() => { const h = this.getLabelOwnerHint(l, batchLabels); return h ? `<span class="ml-1 text-[10px] text-slate-400">· ${this.escapeHtml(h)}</span>` : ''; })()}</span>
                    </button>
                `).join('');
            }
            drop.classList.remove('hidden');
        } else {
            drop.classList.add('hidden');
        }
    },

    toggleBatchMoreMenu(e) {
        if (e) e.stopPropagation();
        const drop = document.getElementById('batch-more-dropdown');
        if (drop) drop.classList.toggle('hidden');
    },

    closeBatchMoreMenu() {
        const drop = document.getElementById('batch-more-dropdown');
        if (drop) drop.classList.add('hidden');
    },

    pendingMoveContext: null,

    renderMoveMenuContent(drop, source, targetIds) {
        if (!drop) return;
        const count = targetIds.length;
        if (count === 0) {
            this.closeMoveMenu();
            return;
        }

        const normFolder = (f) => {
            if (!f) return '';
            const u = String(f).toUpperCase().trim();
            if (['INBOX', 'RECIBIDOS', 'CATEGORY_PERSONAL'].includes(u)) return 'INBOX';
            if (['ARCHIVE', 'ARCHIVED', 'ARCHIVO'].includes(u)) return 'ARCHIVE';
            if (['SPAM'].includes(u)) return 'SPAM';
            if (['TRASH', 'PAPELERA'].includes(u)) return 'TRASH';
            if (['CATEGORY_PROMOTIONS', 'PROMOCIONES', 'PROMOTIONS'].includes(u)) return 'CATEGORY_PROMOTIONS';
            if (['CATEGORY_SOCIAL', 'SOCIAL'].includes(u)) return 'CATEGORY_SOCIAL';
            if (['CATEGORY_UPDATES', 'NOTIFICACIONES', 'ACTUALIZACIONES', 'UPDATES'].includes(u)) return 'CATEGORY_UPDATES';
            if (['CATEGORY_FORUMS', 'FOROS', 'FORUMS'].includes(u)) return 'CATEGORY_FORUMS';
            return u;
        };

        const excluded = new Set();

        // 1. Excluir la vista actual de la carpeta o categoría (no tiene sentido mover a donde ya estás)
        const viewF = normFolder(this.currentFolder);
        if (viewF && !['ALL', 'TODOS', 'STARRED', 'DESTACADOS', 'IMPORTANT', 'IMPORTANTES'].includes(viewF)) {
            excluded.add(viewF);
        }

        // 2. Excluir la carpeta/categoría intrínseca del correo
        if (source === 'detail') {
            const email = (this.currentOpenedEmail && this.currentOpenedEmail.id === targetIds[0])
                ? this.currentOpenedEmail
                : this.emails.find(e => e.id === targetIds[0]);
            if (email) {
                if (email.folder) {
                    excluded.add(normFolder(email.folder));
                }
                if (email.labels && Array.isArray(email.labels)) {
                    email.labels.forEach(l => {
                        const lname = typeof l === 'string' ? l : (l.name || l.remote_id || '');
                        const norm = normFolder(lname);
                        if (norm.startsWith('CATEGORY_')) {
                            excluded.add(norm);
                        }
                    });
                }
            }
        } else {
            // Modo lote: si todos los correos seleccionados pertenecen a la misma carpeta o categoría, excluirla
            const batchFolders = new Set();
            targetIds.forEach(id => {
                const item = this.emails.find(e => e.id === id);
                if (item && item.folder) {
                    batchFolders.add(normFolder(item.folder));
                }
            });
            if (batchFolders.size === 1) {
                excluded.add([...batchFolders][0]);
            }
        }

        const systemButtons = [
            {
                key: 'INBOX',
                label: 'Recibidos',
                icon: '<svg class="w-4 h-4 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>',
                hover: 'hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-600 dark:hover:text-indigo-400'
            },
            {
                key: 'ARCHIVE',
                label: 'Archivo',
                icon: '<svg class="w-4 h-4 text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>',
                hover: 'hover:bg-slate-100 dark:hover:bg-slate-700/60'
            },
            {
                key: 'SPAM',
                label: 'Spam',
                icon: '<svg class="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>',
                hover: 'hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-600 dark:hover:text-amber-400'
            },
            {
                key: 'TRASH',
                label: 'Papelera',
                icon: '<svg class="w-4 h-4 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>',
                hover: 'hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400'
            }
        ];

        const categoryButtons = [
            {
                key: 'CATEGORY_PROMOTIONS',
                label: 'Promociones',
                icon: '<svg class="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>',
                hover: 'hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600 dark:hover:text-emerald-400'
            },
            {
                key: 'CATEGORY_SOCIAL',
                label: 'Social',
                icon: '<svg class="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>',
                hover: 'hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600 dark:hover:text-blue-400'
            },
            {
                key: 'CATEGORY_UPDATES',
                label: 'Notificaciones',
                icon: '<svg class="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>',
                hover: 'hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-600 dark:hover:text-amber-400'
            },
            {
                key: 'CATEGORY_FORUMS',
                label: 'Foros',
                icon: '<svg class="w-4 h-4 text-purple-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"/></svg>',
                hover: 'hover:bg-purple-50 dark:hover:bg-purple-950/40 hover:text-purple-600 dark:hover:text-purple-400'
            }
        ];

        const visibleSystem = systemButtons.filter(b => !excluded.has(b.key));
        const visibleCategories = categoryButtons.filter(b => !excluded.has(b.key));

        let html = `
            <div class="px-3 py-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-100 dark:border-slate-700/80 mb-1 flex items-center justify-between">
                <span>Mover a carpeta</span>
                <span id="universal-move-count" class="text-[10px] font-normal text-slate-400">${count === 1 ? '1 correo' : `${count} correos`}</span>
            </div>
        `;

        if (visibleSystem.length > 0) {
            html += `<div class="space-y-0.5">`;
            visibleSystem.forEach(b => {
                html += `
                    <button type="button" onclick="EmailManager.applyMoveToFolder('${b.key}')" class="w-full text-left px-3 py-1.5 ${b.hover} text-slate-700 dark:text-slate-200 flex items-center gap-2.5 transition-colors cursor-pointer">
                        ${b.icon}
                        <span class="font-medium">${b.label}</span>
                    </button>
                `;
            });
            html += `</div>`;
        }

        if (visibleCategories.length > 0) {
            if (visibleSystem.length > 0) {
                html += `<div class="my-1 border-t border-slate-100 dark:border-slate-700/80"></div>`;
            }
            html += `
                <div class="px-3 py-0.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Categorías</div>
                <div class="space-y-0.5">
            `;
            visibleCategories.forEach(b => {
                html += `
                    <button type="button" onclick="EmailManager.applyMoveToFolder('${b.key}')" class="w-full text-left px-3 py-1.5 ${b.hover} text-slate-700 dark:text-slate-200 flex items-center gap-2.5 transition-colors cursor-pointer">
                        ${b.icon}
                        <span>${b.label}</span>
                    </button>
                `;
            });
            html += `</div>`;
        }

        drop.innerHTML = html;
    },

    toggleMoveMenu(e, source, emailId = null) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        let drop = document.getElementById('universal-move-dropdown');
        if (drop && !drop.classList.contains('hidden') && this.pendingMoveContext && this.pendingMoveContext.source === source && (!emailId || this.pendingMoveContext.emailIds[0] === emailId)) {
            this.closeMoveMenu();
            return;
        }

        let targetIds = [];
        if (source === 'batch') {
            targetIds = this.getSelectedEmailIds();
            if (targetIds.length === 0) {
                UI.showStickyToast('Sin selección', 'Selecciona uno o más correos para mover', 'warning');
                return;
            }
        } else {
            const id = emailId || (this.currentOpenedEmail && this.currentOpenedEmail.id);
            if (!id) return;
            targetIds = [id];
        }

        this.pendingMoveContext = { source, emailIds: targetIds };

        if (!drop) {
            drop = document.createElement('div');
            drop.id = 'universal-move-dropdown';
            drop.className = 'fixed w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-[9999] py-1.5 text-xs select-none';
            document.body.appendChild(drop);
        }

        this.renderMoveMenuContent(drop, source, targetIds);

        const btn = e ? e.currentTarget : null;
        if (btn && btn.getBoundingClientRect) {
            const rect = btn.getBoundingClientRect();
            drop.style.top = `${Math.round(rect.bottom + 6)}px`;
            const rightOffset = Math.max(12, Math.round(window.innerWidth - rect.right));
            if (rect.left + 215 > window.innerWidth) {
                drop.style.right = `${rightOffset}px`;
                drop.style.left = 'auto';
            } else {
                drop.style.left = `${Math.round(rect.left)}px`;
                drop.style.right = 'auto';
            }
        }
        drop.classList.remove('hidden');
    },

    closeMoveMenu() {
        const drop = document.getElementById('universal-move-dropdown');
        if (drop) drop.classList.add('hidden');
        this.pendingMoveContext = null;
    },

    async applyMoveToFolder(targetFolder) {
        if (!this.pendingMoveContext) return;
        const { source, emailIds } = this.pendingMoveContext;
        this.closeMoveMenu();
        if (!emailIds || emailIds.length === 0) return;

        if (targetFolder === 'TRASH') {
            if (source === 'batch') {
                await this.deleteSelectedBatch();
            } else {
                await this.deleteCurrentEmail(emailIds[0]);
            }
            return;
        }

        try {
            const res = await fetch('/api/emails/batch-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'move_folder',
                    email_ids: emailIds,
                    folder: targetFolder
                })
            });
            const data = await res.json();
            if (data.success) {
                UI.showStickyToast('Correo movido', data.message || `Movido a ${this.getFolderDisplayName(targetFolder)}`, 'success');
                if (source === 'batch') {
                    this.clearSelection();
                } else if (this.currentOpenedEmail && this.currentOpenedEmail.id === emailIds[0]) {
                    this.currentOpenedEmail.folder = targetFolder;
                    this.emailDetailCache.delete(emailIds[0]);
                    const curF = (this.currentFolder || 'INBOX').toUpperCase();
                    if (curF !== 'ALL' && curF !== targetFolder && targetFolder !== 'INBOX') {
                        this.selectedEmailId = null;
                        this.backToList();
                    } else {
                        await this.openEmailDetail(emailIds[0]);
                    }
                }
                await this.loadEmails(false);
                await this.updateUnreadCounts();
            } else {
                UI.showStickyToast('Error', data.detail || 'No se pudo mover el correo', 'error');
            }
        } catch (err) {
            UI.showStickyToast('Error', err.message || 'Error al mover correo', 'error');
        }
    },

    async deleteSelectedBatch() {
        const ids = this.getSelectedEmailIds();
        if (ids.length === 0) return;

        if (!this.skipDeleteConfirm) {
            const confirmed = await UI.confirm({
                title: `¿Eliminar ${ids.length} correos?`,
                message: `Los ${ids.length} correos seleccionados se moverán a la papelera.`,
                confirmText: 'Mover a papelera',
                isDanger: true,
                showDontAskAgain: true,
                dontAskAgainLabel: 'No volver a preguntar al eliminar correos',
                onDontAskAgain: (checked) => {
                    if (checked) {
                        this.setSkipDeleteConfirm(true, true);
                    }
                }
            });
            if (!confirmed) return;
        }

        try {
            const res = await fetch('/api/emails/batch-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email_ids: ids, action: 'trash' })
            });
            const data = await res.json();
            if (data.success) {
                UI.showStickyToast('Correos a Papelera', `${ids.length} correos enviados a papelera`, 'success');
                this.selectedEmailId = null;
                // Deseleccionar todo inmediatamente al aplicar una acción
                this.clearSelection();
                await this.loadEmails();
            }
        } catch (e) {
            UI.showStickyToast('Error al eliminar', e.message, 'error');
        }
    },

    async scheduleFromEmail(emailId) {
        if (window.GeminiAI && !GeminiAI.isAiActive) {
            UI.showStickyToast('IA Inactiva', 'El servicio de IA está desactivado. Actívalo en Ajustes para agendar citas automáticamente.', 'warning');
            return;
        }
        UI.showStickyToast('Analizando con IA', 'Extrayendo detalles de reunión...', 'info', 2000);
        try {
            const res = await fetch(`/api/events/from-email/${emailId}?calendar_id=1`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                UI.showStickyToast('Evento Agendado', `Se programó: ${data.event.title}`, 'success');
                if (window.CalendarManager) {
                    CalendarManager.loadEvents();
                }
            } else {
                UI.showStickyToast('Sin cita detectada', data.message || 'No se encontraron horarios específicos', 'warning');
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    async detectCommitments(emailId) {
        if (window.GeminiAI && !GeminiAI.isAiActive) {
            UI.showStickyToast('IA Inactiva', 'El servicio de IA está desactivado. Actívalo en Ajustes para analizar compromisos.', 'warning');
            return;
        }
        const box = document.getElementById(`ai-commitments-box-${emailId}`);
        const list = document.getElementById(`ai-commitments-list-${emailId}`);
        const statusEl = document.getElementById(`ai-commitments-status-${emailId}`);
        if (!box || !list) return;

        box.classList.remove('hidden');
        list.innerHTML = `
            <div class="flex items-center gap-2 text-xs text-cyan-600 dark:text-cyan-400 py-1">
                <svg class="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Elio está extrayendo compromisos, acuerdos y plazos del correo...</span>
            </div>
        `;
        try {
            const res = await fetch(`/api/ai/commitments/${emailId}`);
            const data = await res.json();
            if (!data.success || !data.commitments || data.commitments.length === 0) {
                list.innerHTML = `<p class="text-xs text-slate-500 dark:text-slate-400">No se detectaron compromisos pendientes ni tareas específicas en este correo.</p>`;
                if (statusEl) statusEl.textContent = '0 detectados';
                return;
            }
            if (statusEl) statusEl.textContent = `${data.commitments.length} detectados`;
            list.innerHTML = data.commitments.map((c, idx) => {
                const escapedTitle = this.escapeHtml(c.title || '');
                const safeAttrTitle = (c.title || '').replace(/"/g, '&quot;').replace(/'/g, "\\'");
                const escapedDue = this.escapeHtml(c.due_hint || '');
                const safeAttrDue = (c.due_hint || '').replace(/"/g, '&quot;').replace(/'/g, "\\'");
                return `
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-cyan-200/80 dark:border-cyan-800/40 text-xs shadow-2xs">
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2">
                                <span class="font-semibold text-slate-900 dark:text-slate-100">${escapedTitle}</span>
                                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${c.priority === 'alta' ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}">${c.priority || 'media'}</span>
                            </div>
                            ${escapedDue ? `<div class="text-[11px] text-cyan-600 dark:text-cyan-400 mt-0.5">⏳ Plazo estimado: ${escapedDue}</div>` : ''}
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0 self-end sm:self-center" id="commitment-actions-${emailId}-${idx}">
                            <button type="button" onclick="EmailManager.convertCommitment(${emailId}, '${safeAttrTitle}', 'task', '${safeAttrDue}', this)" class="inline-flex items-center gap-1 px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white font-medium text-xs rounded-lg transition-colors shadow-2xs cursor-pointer" title="Convertir a tarea en el Calendario">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                                <span>+ Tarea</span>
                            </button>
                            <button type="button" onclick="EmailManager.convertCommitment(${emailId}, '${safeAttrTitle}', 'note', '${safeAttrDue}', this)" class="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs rounded-lg transition-colors shadow-2xs cursor-pointer" title="Convertir a Nota Adhesiva en Pizarra">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                <span>+ Nota</span>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (e) {
            list.innerHTML = `<p class="text-xs text-rose-500">Error al analizar compromisos: ${e.message}</p>`;
        }
    },

    async convertCommitment(emailId, title, targetType, dueHint, btnEl) {
        try {
            if (btnEl) {
                btnEl.disabled = true;
                btnEl.classList.add('opacity-50', 'pointer-events-none');
            }
            const res = await fetch('/api/ai/commitments/convert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email_id: emailId, title, target_type: targetType, due_hint: dueHint })
            });
            const data = await res.json();
            if (data.success) {
                UI.showStickyToast(
                    targetType === 'task' ? 'Tarea Agendada' : 'Nota Creada',
                    data.message || (targetType === 'task' ? 'Se añadió a tus tareas de Calendario' : 'Se añadió a tus Notas Adhesivas'),
                    'success'
                );
                if (btnEl) {
                    btnEl.innerHTML = `<svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg><span>Añadido ✓</span>`;
                    btnEl.classList.remove('bg-cyan-600', 'bg-amber-500');
                    btnEl.classList.add('bg-emerald-600');
                }
                if (targetType === 'task' && window.CalendarManager) {
                    CalendarManager.loadEvents();
                } else if (targetType === 'note' && window.NotesManager) {
                    NotesManager.loadNotes();
                }
            } else {
                UI.showStickyToast('Error', data.detail || 'No se pudo guardar el compromiso', 'error');
                if (btnEl) {
                    btnEl.disabled = false;
                    btnEl.classList.remove('opacity-50', 'pointer-events-none');
                }
            }
        } catch (err) {
            UI.showStickyToast('Error', err.message, 'error');
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.classList.remove('opacity-50', 'pointer-events-none');
            }
        }
    },

    async setDefaultAccount(accountId) {
        try {
            const res = await fetch(`/api/accounts/${accountId}/default`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                this.accounts.forEach(a => {
                    a.is_default = (a.id === accountId) ? 1 : 0;
                });
                this.renderAccounts();
                if (window.AvatarService) {
                    AvatarService.updateSystemHeaderAvatar();
                }
                const selectSettings = document.getElementById('settings-default-account-select');
                if (selectSettings) selectSettings.value = accountId;

                UI.showStickyToast(
                    'Cuenta Predeterminada',
                    `"${data.account.name || data.account.email}" se ha establecido como tu cuenta por defecto`,
                    'success',
                    3000
                );
            } else {
                UI.showStickyToast('Error', data.detail || 'No se pudo cambiar la cuenta por defecto', 'error');
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    async deleteAccount(accountId, email) {
        const confirmed = await UI.confirm({
            title: '¿Eliminar cuenta de correo?',
            message: `¿Estás seguro de desconectar la cuenta ${email}? Se borrarán los datos locales asociados.`,
            confirmText: 'Eliminar cuenta',
            isDanger: true
        });

        if (!confirmed) return;

        try {
            const res = await fetch(`/api/accounts/${accountId}`, { method: 'DELETE' });
            if (res.ok) {
                UI.showStickyToast('Cuenta eliminada', `La cuenta ${email} fue desconectada`, 'success');
                this.loadAccounts();
                this.loadEmails();
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    async connectWithGoogle() {
        try {
            const res = await fetch('/api/auth/google/url');
            const data = await res.json();

            if (!data.has_config) {
                // Abrir modal para configurar Client ID y Client Secret de Google Cloud
                document.getElementById('modal-google-oauth-config').classList.remove('hidden');
                return;
            }

            // Abrir ventana popup de Google
            const width = 550;
            const height = 650;
            const left = (window.screen.width / 2) - (width / 2);
            const top = (window.screen.height / 2) - (height / 2);
            
            const popup = window.open(
                data.url,
                'GoogleAuthWindow',
                `toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=yes, resizable=yes, copyhistory=no, width=${width}, height=${height}, top=${top}, left=${left}`
            );

            if (!popup || popup.closed || typeof popup.closed === 'undefined') {
                window.location.href = data.url;
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    async saveGoogleOAuthConfig(e) {
        e.preventDefault();
        const clientId = document.getElementById('google-client-id-input').value.trim();
        const clientSecret = document.getElementById('google-client-secret-input').value.trim();

        if (!clientId || !clientSecret) {
            UI.showStickyToast('Campos requeridos', 'Client ID y Client Secret son obligatorios', 'warning');
            return;
        }

        try {
            const res = await fetch('/api/auth/google/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_id: clientId, client_secret: clientSecret })
            });

            const data = await res.json();
            if (data.success) {
                UI.showStickyToast('Configuración Guardada', 'Credenciales de Google OAuth guardadas', 'success');
                document.getElementById('modal-google-oauth-config').classList.add('hidden');
                // Proceder a conectar
                this.connectWithGoogle();
            }
        } catch (err) {
            UI.showStickyToast('Error', err.message, 'error');
        }
    },

    openNewAccountModal() {
        UI.closeDrawer('drawer-accounts');
        const form = document.getElementById('new-account-form');
        form.reset();
        document.getElementById('new-account-id').value = '';
        document.getElementById('modal-account-title').textContent = 'Conectar Nueva Cuenta';
        document.getElementById('new-account-color').value = '#3b82f6';
        const userInput = document.getElementById('new-account-user');
        if (userInput) {
            userInput.value = '';
            delete userInput.dataset.manuallyEdited;
        }
        const syncEl = document.getElementById('new-account-sync-interval');
        if (syncEl) syncEl.value = '5';
        document.getElementById('form-account-test-result').classList.add('hidden');
        document.getElementById('modal-new-account').classList.remove('hidden');
    },

    async openEditAccountModal(accountId) {
        UI.closeDrawer('drawer-accounts');
        try {
            const res = await fetch(`/api/accounts/${accountId}`);
            if (!res.ok) throw new Error('Cuenta no encontrada');
            const data = await res.json();

            document.getElementById('new-account-id').value = data.id;
            document.getElementById('modal-account-title').textContent = `Editar Cuenta: ${data.name}`;
            document.getElementById('new-account-name').value = data.name;
            document.getElementById('new-account-email').value = data.email;
            document.getElementById('new-account-provider').value = data.provider;
            const userInput = document.getElementById('new-account-user');
            if (userInput) {
                userInput.value = data.imap_user || data.email;
                delete userInput.dataset.manuallyEdited;
            }
            document.getElementById('new-account-pass').value = ''; // Opcional al editar
            document.getElementById('new-account-imap-host').value = data.imap_host;
            document.getElementById('new-account-imap-port').value = data.imap_port;
            document.getElementById('new-account-smtp-host').value = data.smtp_host;
            document.getElementById('new-account-smtp-port').value = data.smtp_port;
            document.getElementById('new-account-color').value = data.color || '#3b82f6';
            const syncEl = document.getElementById('new-account-sync-interval');
            if (syncEl) syncEl.value = (data.sync_interval !== undefined && data.sync_interval !== null) ? String(data.sync_interval) : '5';
            document.getElementById('form-account-test-result').classList.add('hidden');

            document.getElementById('modal-new-account').classList.remove('hidden');
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    async testAccountConnection(accountId) {
        const statusBox = document.getElementById(`account-test-status-${accountId}`);
        if (statusBox) {
            statusBox.className = 'text-[11px] p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500';
            statusBox.textContent = 'Probando conexión IMAP y SMTP...';
            statusBox.classList.remove('hidden');
        }

        UI.showStickyToast('Probando Cuenta', 'Verificando servidores IMAP y SMTP...', 'info', 2000);

        try {
            const res = await fetch(`/api/accounts/${accountId}/test`, { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                if (statusBox) {
                    statusBox.className = 'text-[11px] p-2 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-800/80 font-medium';
                    statusBox.textContent = '✔ Conexión IMAP y SMTP exitosa';
                }
                UI.showStickyToast('Conexión Exitosa', 'Servidores IMAP y SMTP respondieron correctamente', 'success');
            } else {
                const errMsg = data.errors && data.errors.length ? data.errors.join(' | ') : 'Fallo de autenticación o puertos';
                if (statusBox) {
                    statusBox.className = 'text-[11px] p-2 rounded-lg bg-rose-950/60 text-rose-300 border border-rose-800/80';
                    statusBox.textContent = `✖ Error: ${errMsg}`;
                }
                UI.showStickyToast('Fallo de Conexión', errMsg, 'error', 5000);
            }
        } catch (e) {
            if (statusBox) {
                statusBox.className = 'text-[11px] p-2 rounded-lg bg-rose-950/60 text-rose-300';
                statusBox.textContent = `Error: ${e.message}`;
            }
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    async testCurrentFormConnection() {
        const formBox = document.getElementById('form-account-test-result');
        const name = document.getElementById('new-account-name').value || 'Cuenta';
        const email = document.getElementById('new-account-email').value.trim();
        const provider = document.getElementById('new-account-provider').value;
        const imapHost = document.getElementById('new-account-imap-host').value.trim();
        const imapPort = parseInt(document.getElementById('new-account-imap-port').value) || 993;
        let user = document.getElementById('new-account-user').value.trim() || email;
        const pass = document.getElementById('new-account-pass').value;
        const smtpHost = document.getElementById('new-account-smtp-host').value.trim();
        const smtpPort = parseInt(document.getElementById('new-account-smtp-port').value) || 587;
        const color = document.getElementById('new-account-color').value;

        // Auto-corregir si el navegador autocompletó @gmail.com en el usuario pero el email es de otro dominio (ej. merke.net)
        if (user.includes('@gmail.com') && email && !email.includes('@gmail.com') && !imapHost.includes('gmail.com')) {
            user = email;
            document.getElementById('new-account-user').value = email;
        }

        if (!email || !user || !pass) {
            UI.showStickyToast('Faltan Datos', 'Ingresa correo, usuario y contraseña para probar', 'warning');
            return;
        }

        formBox.className = 'p-3 rounded-xl text-xs bg-slate-100 dark:bg-slate-800 text-slate-500';
        formBox.textContent = 'Verificando con los servidores de correo...';
        formBox.classList.remove('hidden');

        try {
            const res = await fetch('/api/accounts/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name, email, provider,
                    imap_host: imapHost, imap_port: imapPort, imap_ssl: 1,
                    imap_user: user, imap_password: pass,
                    smtp_host: smtpHost, smtp_port: smtpPort, smtp_ssl: 1,
                    color
                })
            });

            const data = await res.json();
            if (data.success) {
                formBox.className = 'p-3 rounded-xl text-xs bg-emerald-950/60 text-emerald-300 border border-emerald-800/80 font-medium';
                formBox.innerHTML = '✔ ¡Conexión IMAP y SMTP verificada con éxito!';
                UI.showStickyToast('Conexión Exitosa', 'Credenciales y puertos validados', 'success');
            } else {
                const errMsg = data.errors && data.errors.length ? data.errors.join('<br>') : 'Error conectando al servidor';
                formBox.className = 'p-3 rounded-xl text-xs bg-rose-950/60 text-rose-300 border border-rose-800/80';
                formBox.innerHTML = `✖ Fallo de conexión:<br>${errMsg}`;
                UI.showStickyToast('Fallo de Conexión', 'No se pudo conectar a los servidores de correo', 'error');
            }
        } catch (e) {
            formBox.className = 'p-3 rounded-xl text-xs bg-rose-950/60 text-rose-300';
            formBox.textContent = `Error: ${e.message}`;
        }
    },

    printPreviewState: {
        destination: 'pdf',
        layout: 'portrait',
        color: 'color',
        paperSize: 'letter',
        margins: 'default',
        scale: 100,
        headersFooters: true,
        backgroundGraphics: true,
        zoomLevel: 100
    },

    openPrintPreview() {
        if (!this.currentOpenedEmail) {
            if (window.UI) UI.showStickyToast('Impresión', 'Abre primero un correo para imprimir', 'info', 2000);
            return;
        }

        const isDesktop = (window.DesktopBridge && window.DesktopBridge.isDesktop) || (window.location.port === '6524');
        if (!isDesktop) {
            // En versión web y PWA: usar directamente la opción e interfaz nativa de impresión del navegador (Chrome / navegador del usuario)
            this.printCurrentEmail();
            return;
        }

        const email = this.currentOpenedEmail;

        const dateFormatted = new Date(email.date).toLocaleString('es-ES', { 
            dateStyle: 'full', 
            timeStyle: 'short' 
        });

        // Contenido del cuerpo formateado
        let bodyContent = '';
        if (email.body_html) {
            bodyContent = email.body_html;
        } else {
            const escaped = this.escapeHtml(email.body_text || email.snippet || '');
            bodyContent = `<div style="white-space: pre-wrap; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13.5px; line-height: 1.6; color: #1e293b;">${escaped}</div>`;
        }

        // Restablecer estado inicial de opciones
        this.printPreviewState = {
            destination: isDesktop ? 'pdf' : 'system',
            layout: 'portrait',
            color: 'color',
            paperSize: 'letter',
            margins: 'default',
            scale: 100,
            headersFooters: true,
            backgroundGraphics: true,
            zoomLevel: 100
        };

        // Eliminar modal previo si existiese
        const prevModal = document.getElementById('print-preview-modal');
        if (prevModal) prevModal.remove();

        const modal = document.createElement('div');
        modal.id = 'print-preview-modal';
        modal.className = 'fixed inset-0 z-[99999] bg-[#202124]/90 backdrop-blur-xs flex flex-col md:flex-row overflow-hidden font-sans select-none';
        modal.innerHTML = `
            <!-- Panel Lateral de Ajustes estilo Google Chrome -->
            <div class="w-full md:w-[340px] md:min-w-[340px] bg-[#292a2d] text-[#e8eaed] flex flex-col h-full border-r border-[#3c4043] shadow-2xl z-20 shrink-0">
                <!-- Cabecera -->
                <div class="px-5 py-4 border-b border-[#3c4043] flex items-center justify-between shrink-0">
                    <div class="flex items-center gap-3">
                        <button type="button" onclick="EmailManager.closePrintPreview()" class="p-1.5 -ml-1 text-[#9aa0a6] hover:text-white hover:bg-[#3c4043] rounded-full transition-colors cursor-pointer" title="Cerrar vista previa (Esc)">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                        </button>
                        <div>
                            <h2 class="text-base font-medium text-white tracking-wide">Imprimir</h2>
                            <p id="print-preview-pages-subtitle" class="text-[11px] text-[#9aa0a6]">1 hoja de papel &bull; Vista previa</p>
                        </div>
                    </div>
                    <button type="button" onclick="EmailManager.closePrintPreview()" class="text-[#9aa0a6] hover:text-white p-1 rounded-full hover:bg-[#3c4043] transition-colors cursor-pointer" title="Cerrar (Esc)">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>

                <!-- Botones de Acción Principales -->
                <div class="px-5 py-3 border-b border-[#3c4043] flex items-center gap-3 shrink-0 bg-[#292a2d]">
                    <button type="button" id="btn-modal-print-action" onclick="EmailManager.executePrint()" class="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#1a73e8] hover:bg-[#1557b0] active:bg-[#174ea6] text-white font-medium text-xs rounded-full shadow-sm transition-all cursor-pointer">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                        <span id="btn-modal-print-label">Imprimir</span>
                    </button>
                    <button type="button" onclick="EmailManager.closePrintPreview()" class="px-5 py-2.5 border border-[#5f6368] hover:bg-[#3c4043] active:bg-[#4a4d51] text-[#e8eaed] font-medium text-xs rounded-full transition-colors cursor-pointer">
                        Cancelar
                    </button>
                </div>

                <!-- Lista de Controles Chrome -->
                <div class="p-5 space-y-4 text-xs text-[#bdc1c6] flex-1 overflow-y-auto">
                    <!-- Destino -->
                    <div>
                        <label class="block text-[11px] font-medium text-[#9aa0a6] mb-1.5 uppercase tracking-wider">Destino</label>
                        <select id="print-opt-destination" onchange="EmailManager.updatePrintOption('destination', this.value)" class="w-full bg-[#35363a] border border-[#5f6368] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#8ab4f8] transition-colors cursor-pointer">
                            <option value="pdf" ${this.printPreviewState.destination === 'pdf' ? 'selected' : ''}>Guardar como PDF</option>
                            <option value="system" ${this.printPreviewState.destination === 'system' ? 'selected' : ''}>Impresora del sistema / predeterminada</option>
                        </select>
                    </div>

                    <!-- Páginas -->
                    <div>
                        <label class="block text-[11px] font-medium text-[#9aa0a6] mb-1.5 uppercase tracking-wider">Páginas</label>
                        <select id="print-opt-pages" onchange="EmailManager.onPageSelectionChange(this.value)" class="w-full bg-[#35363a] border border-[#5f6368] text-white rounded-lg px-3 py-2 text-xs focus:outline-none cursor-pointer">
                            <option value="all">Todas</option>
                        </select>
                    </div>

                    <!-- Diseño / Orientación -->
                    <div>
                        <label class="block text-[11px] font-medium text-[#9aa0a6] mb-1.5 uppercase tracking-wider">Diseño</label>
                        <select id="print-opt-layout" onchange="EmailManager.updatePrintOption('layout', this.value)" class="w-full bg-[#35363a] border border-[#5f6368] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#8ab4f8] transition-colors cursor-pointer">
                            <option value="portrait" selected>Vertical (Retrato)</option>
                            <option value="landscape">Horizontal (Paisaje)</option>
                        </select>
                    </div>

                    <!-- Color -->
                    <div>
                        <label class="block text-[11px] font-medium text-[#9aa0a6] mb-1.5 uppercase tracking-wider">Color</label>
                        <select id="print-opt-color" onchange="EmailManager.updatePrintOption('color', this.value)" class="w-full bg-[#35363a] border border-[#5f6368] text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#8ab4f8] transition-colors cursor-pointer">
                            <option value="color" selected>Color</option>
                            <option value="monochrome">Blanco y negro</option>
                        </select>
                    </div>

                    <!-- Más Ajustes -->
                    <div class="pt-2 border-t border-[#3c4043]">
                        <button type="button" onclick="document.getElementById('print-more-settings-box').classList.toggle('hidden')" class="flex items-center justify-between w-full py-1 text-xs text-[#8ab4f8] hover:text-[#aecbfa] font-medium transition-colors cursor-pointer">
                            <span>Más opciones</span>
                            <svg class="w-3.5 h-3.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                        </button>
                    </div>

                    <!-- Contenedor Desplegable de Más Ajustes -->
                    <div id="print-more-settings-box" class="space-y-4 pt-1">
                        <!-- Tamaño de papel -->
                        <div>
                            <label class="block text-[11px] font-medium text-[#9aa0a6] mb-1.5 uppercase tracking-wider">Tamaño de papel</label>
                            <select id="print-opt-paper" onchange="EmailManager.updatePrintOption('paperSize', this.value)" class="w-full bg-[#35363a] border border-[#5f6368] text-white rounded-lg px-3 py-2 text-xs focus:outline-none cursor-pointer">
                                <option value="letter" selected>Carta (Letter - 21.6 &times; 27.9 cm)</option>
                                <option value="a4">A4 (21.0 &times; 29.7 cm)</option>
                                <option value="legal">Oficio (Legal - 21.6 &times; 35.6 cm)</option>
                            </select>
                        </div>

                        <!-- Márgenes -->
                        <div>
                            <label class="block text-[11px] font-medium text-[#9aa0a6] mb-1.5 uppercase tracking-wider">Márgenes</label>
                            <select id="print-opt-margins" onchange="EmailManager.updatePrintOption('margins', this.value)" class="w-full bg-[#35363a] border border-[#5f6368] text-white rounded-lg px-3 py-2 text-xs focus:outline-none cursor-pointer">
                                <option value="default" selected>Predeterminado (Normal)</option>
                                <option value="minimum">Mínimo</option>
                                <option value="none">Ninguno</option>
                            </select>
                        </div>

                        <!-- Escala -->
                        <div>
                            <label class="block text-[11px] font-medium text-[#9aa0a6] mb-1.5 uppercase tracking-wider">Escala</label>
                            <select id="print-opt-scale" onchange="EmailManager.updatePrintOption('scale', this.value)" class="w-full bg-[#35363a] border border-[#5f6368] text-white rounded-lg px-3 py-2 text-xs focus:outline-none cursor-pointer">
                                <option value="100" selected>Predeterminado (100%)</option>
                                <option value="90">90%</option>
                                <option value="80">80%</option>
                                <option value="70">70%</option>
                                <option value="fit">Ajustar a la página</option>
                            </select>
                        </div>

                        <!-- Opciones (Checkboxes) -->
                        <div class="space-y-2.5 pt-2">
                            <label class="flex items-center gap-2.5 text-xs text-[#e8eaed] cursor-pointer">
                                <input type="checkbox" id="print-opt-headers" checked onchange="EmailManager.updatePrintOption('headersFooters', this.checked)" class="rounded text-[#1a73e8] focus:ring-0 bg-[#35363a] border-[#5f6368]">
                                <span>Encabezados y pies de página</span>
                            </label>
                            <label class="flex items-center gap-2.5 text-xs text-[#e8eaed] cursor-pointer">
                                <input type="checkbox" id="print-opt-backgrounds" checked onchange="EmailManager.updatePrintOption('backgroundGraphics', this.checked)" class="rounded text-[#1a73e8] focus:ring-0 bg-[#35363a] border-[#5f6368]">
                                <span>Gráficos de fondo</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Canvas Central estilo Chrome Print Preview -->
            <div class="flex-1 bg-[#323639] flex flex-col h-full overflow-hidden relative">
                <!-- Área con scroll de las hojas de papel -->
                <div class="flex-1 overflow-auto p-4 sm:p-8 md:p-12 flex justify-center items-start print-preview-canvas" id="print-preview-scroll-area">
                    <!-- Medidor invisible para calcular la altura exacta del contenido y dividir páginas -->
                    <div id="print-measure-container" style="position: absolute; visibility: hidden; pointer-events: none; left: -9999px; top: 0; box-sizing: border-box;"></div>

                    <!-- Contenedor reactivo de hojas de papel separadas -->
                    <div id="print-preview-sheets-container" class="flex flex-col items-center transition-transform duration-150 origin-top">
                        <!-- Las hojas divididas se generan dinámicamente mediante renderPrintPreviewPages() -->
                    </div>
                </div>

                <!-- Barra de Zoom Flotante estilo Chrome en esquina inferior derecha -->
                <div class="absolute bottom-5 right-6 bg-[#202124]/90 backdrop-blur-md border border-[#3c4043] rounded-full px-3 py-1.5 flex items-center gap-3 text-xs text-white shadow-xl z-30">
                    <button type="button" onclick="EmailManager.changePrintZoom(-10)" class="p-1 hover:bg-[#3c4043] rounded-full text-slate-300 hover:text-white transition-colors cursor-pointer" title="Alejar (-)">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/></svg>
                    </button>
                    <span id="print-zoom-label" class="text-[11px] font-mono text-slate-200 min-w-[36px] text-center">100%</span>
                    <button type="button" onclick="EmailManager.changePrintZoom(10)" class="p-1 hover:bg-[#3c4043] rounded-full text-slate-300 hover:text-white transition-colors cursor-pointer" title="Acercar (+)">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                    </button>
                    <div class="h-3 w-px bg-[#5f6368]"></div>
                    <button type="button" onclick="EmailManager.resetPrintZoom()" class="hover:text-[#8ab4f8] text-[11px] font-medium transition-colors cursor-pointer" title="Ajustar hoja al ancho">
                        Ajustar
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Actualizar texto del botón según destino inicial
        const btnLabel = document.getElementById('btn-modal-print-label');
        if (btnLabel && this.printPreviewState.destination === 'pdf') {
            btnLabel.textContent = 'Guardar';
        }

        // Renderizar las páginas divididas de la vista previa
        this.renderPrintPreviewPages();
    },

    renderPrintPreviewPages() {
        if (!this.currentOpenedEmail) return;
        const email = this.currentOpenedEmail;
        const state = this.printPreviewState || {};
        const container = document.getElementById('print-preview-sheets-container');
        const measure = document.getElementById('print-measure-container');
        if (!container || !measure) return;

        const isLandscape = state.layout === 'landscape';
        const isMono = state.color === 'monochrome';
        const showHF = state.headersFooters !== false;
        const paperSize = state.paperSize || 'letter';
        const margins = state.margins || 'default';

        // Dimensiones estándar en px de la hoja a 96 DPI
        let sheetW = 680;
        let sheetH = (paperSize === 'a4') ? 960 : ((paperSize === 'legal') ? 1080 : 880);
        if (isLandscape) {
            const tmp = sheetW;
            sheetW = sheetH;
            sheetH = tmp;
        }

        // Márgenes / Relleno interior
        let padX = 28;
        let padY = 28;
        if (margins === 'minimum') {
            padX = 14;
            padY = 14;
        } else if (margins === 'none') {
            padX = 0;
            padY = 0;
        }

        const dateFormatted = new Date(email.date).toLocaleString('es-ES', { 
            dateStyle: 'full', 
            timeStyle: 'short' 
        });

        let bodyContent = '';
        if (email.body_html) {
            bodyContent = email.body_html;
        } else {
            const escaped = this.escapeHtml(email.body_text || email.snippet || '');
            bodyContent = `<div style="white-space: pre-wrap; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b;">${escaped}</div>`;
        }

        // Medir altura total del cuerpo en un contenedor del mismo ancho útil
        const usableW = Math.max(300, sheetW - (padX * 2));
        measure.style.width = `${usableW}px`;
        measure.innerHTML = `<div id="print-measure-inner" style="width: 100%; font-size: 13px; line-height: 1.45; word-break: break-word;">${bodyContent}</div>`;
        
        // Ajustar imágenes en la medición y escuchar su carga para re-calcular con altura exacta
        const measureImgs = measure.querySelectorAll('img');
        measureImgs.forEach(img => {
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.objectFit = 'contain';
            if (!img.complete || img.naturalHeight === 0) {
                img.addEventListener('load', () => {
                    if (document.getElementById('print-preview-modal')) {
                        this.renderPrintPreviewPages();
                    }
                }, { once: true });
                img.addEventListener('error', () => {
                    if (document.getElementById('print-preview-modal')) {
                        this.renderPrintPreviewPages();
                    }
                }, { once: true });
            }
        });

        const measureInner = document.getElementById('print-measure-inner') || measure;
        const totalBodyH = Math.max(100, measureInner.scrollHeight);

        // Altura disponible de contenido para la primera hoja y las siguientes
        const header1H = showHF ? 84 : 0;
        const headerSubH = showHF ? 26 : 0;
        const footerH = showHF ? 32 : 0;

        const contentH1 = Math.max(200, sheetH - (padY * 2) - header1H - footerH);
        const contentHSub = Math.max(200, sheetH - (padY * 2) - headerSubH - footerH);

        // Obtener elementos bloque para calcular saltos limpios que no corten imágenes ni tarjetas
        const blockElements = [];
        measureInner.querySelectorAll('img, table, tr, p, h1, h2, h3, h4, h5, h6, blockquote, figure, div').forEach(el => {
            if (el.offsetHeight > 20) {
                const rect = el.getBoundingClientRect();
                const containerRect = measureInner.getBoundingClientRect();
                const top = rect.top - containerRect.top;
                blockElements.push({
                    top: top,
                    height: el.offsetHeight,
                    isCritical: (el.tagName === 'IMG' || el.tagName === 'TABLE' || el.tagName === 'TR')
                });
            }
        });
        blockElements.sort((a, b) => a.top - b.top);

        // Calcular rebanadas inteligentes (slices) para cada página evitando partir elementos críticos
        const pageSlices = [];
        let curY = 0;
        let safetyMaxPages = 60;

        while (curY < totalBodyH && safetyMaxPages-- > 0) {
            const isFirst = (pageSlices.length === 0);
            const availH = isFirst ? contentH1 : contentHSub;
            const idealEnd = curY + availH;

            if (idealEnd >= totalBodyH) {
                // Última página: incluye todo el resto del documento sin recortar nada
                pageSlices.push({
                    start: curY,
                    end: totalBodyH,
                    height: Math.min(availH, totalBodyH - curY)
                });
                break;
            }

            // Buscar si algún elemento crítico (imagen, tabla, fila) cruza el límite idealEnd
            let breakY = idealEnd;
            for (const el of blockElements) {
                const elBottom = el.top + el.height;
                if (el.top < idealEnd && elBottom > idealEnd) {
                    // Si el elemento empieza dejando al menos 80px de contenido previo en esta página
                    if (el.top > curY + 80) {
                        breakY = el.top;
                        break;
                    }
                }
            }

            pageSlices.push({
                start: curY,
                end: breakY,
                height: Math.min(availH, breakY - curY)
            });
            curY = breakY;
        }

        const numPages = Math.max(1, pageSlices.length);

        // Actualizar subtítulo y selector de páginas en el panel lateral
        const subtitle = document.getElementById('print-preview-pages-subtitle');
        if (subtitle) {
            subtitle.textContent = `${numPages} ${numPages === 1 ? 'hoja de papel' : 'hojas de papel'} • Vista previa`;
        }

        const pagesSelect = document.getElementById('print-opt-pages');
        if (pagesSelect) {
            const currentVal = pagesSelect.value;
            pagesSelect.innerHTML = `
                <option value="all">Todas (${numPages})</option>
                ${numPages > 1 ? Array.from({length: numPages}, (_, i) => `<option value="${i+1}">Solo página ${i+1}</option>`).join('') : ''}
            `;
            if (currentVal && (currentVal === 'all' || parseInt(currentVal, 10) <= numPages)) {
                pagesSelect.value = currentVal;
            }
        }

        // Construir las hojas individuales de papel
        let sheetsHtml = '';
        const subjectEsc = this.escapeHtml(email.subject || '(Sin Asunto)');
        const senderEsc = this.escapeHtml(email.sender || '');
        const recipientEsc = this.escapeHtml(email.recipient || '');

        for (let p = 0; p < numPages; p++) {
            const slice = pageSlices[p];
            const isFirst = (p === 0);
            const curHeaderH = isFirst ? header1H : headerSubH;
            const sliceH = slice ? slice.height : (isFirst ? contentH1 : contentHSub);
            const offsetTop = slice ? slice.start : 0;

            sheetsHtml += `
                <div class="print-page-sheet bg-white text-slate-900 shadow-2xl relative flex flex-col shrink-0 mb-8 transition-all duration-150 select-text"
                     data-page="${p + 1}"
                     id="print-sheet-page-${p + 1}"
                     style="width: ${sheetW}px; height: ${sheetH}px; padding: ${padY}px ${padX}px; box-sizing: border-box; overflow: hidden; border-radius: 2px; ${isMono ? 'filter: grayscale(100%);' : ''}">
                    
                    <!-- Encabezado -->
                    ${isFirst ? `
                        <div class="print-sheet-header border-b border-slate-300 pb-2.5 mb-3 shrink-0" style="${showHF ? '' : 'display: none;'}">
                            <h1 class="text-base font-bold text-slate-900 leading-snug break-words mb-1.5">${subjectEsc}</h1>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-slate-600">
                                <div><strong class="text-slate-800">De:</strong> ${senderEsc}</div>
                                <div><strong class="text-slate-800">Fecha:</strong> ${dateFormatted}</div>
                                <div class="sm:col-span-2"><strong class="text-slate-800">Para:</strong> ${recipientEsc}</div>
                            </div>
                        </div>
                    ` : `
                        <div class="print-sheet-header border-b border-slate-200 pb-1 mb-2 shrink-0 flex justify-between items-center text-[10px] text-slate-400" style="${showHF ? '' : 'display: none;'}">
                            <span class="truncate max-w-[70%] font-medium text-slate-500">${subjectEsc}</span>
                            <span>Página ${p + 1}</span>
                        </div>
                    `}

                    <!-- Contenedor recortado de contenido de la página -->
                    <div class="print-page-viewport flex-1 relative overflow-hidden" style="height: ${sliceH}px; max-height: ${sliceH}px;">
                        <div class="print-page-content-slice" style="position: absolute; top: -${offsetTop}px; left: 0; right: 0; width: 100%;">
                            <div style="font-size: 13px; line-height: 1.45; word-break: break-word;">
                                ${bodyContent}
                            </div>
                        </div>
                    </div>

                    <!-- Pie de página -->
                    <div class="print-sheet-footer border-t border-slate-200 pt-2 mt-2 text-[10px] text-slate-400 flex items-center justify-between shrink-0" style="${showHF ? '' : 'display: none;'}">
                        <span>Senda &bull; Correo Inteligente</span>
                        <span>Página ${p + 1} de ${numPages}</span>
                    </div>
                </div>
            `;
        }

        container.innerHTML = sheetsHtml;

        // Proteger imágenes en todas las hojas generadas
        container.querySelectorAll('img').forEach(img => {
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.objectFit = 'contain';
        });

        // Aplicar el zoom actual al contenedor de hojas
        this.applyPrintZoom(this.printPreviewState.zoomLevel || 100);
    },

    onPageSelectionChange(val) {
        if (val === 'all') {
            document.querySelectorAll('.print-page-sheet').forEach(sheet => {
                sheet.style.display = 'flex';
            });
            const first = document.getElementById('print-sheet-page-1');
            if (first) first.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            const pageNum = parseInt(val, 10);
            document.querySelectorAll('.print-page-sheet').forEach(sheet => {
                const p = parseInt(sheet.getAttribute('data-page'), 10);
                if (p === pageNum) {
                    sheet.style.display = 'flex';
                    sheet.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } else {
                    sheet.style.display = 'none';
                }
            });
        }
    },

    closePrintPreview() {
        const modal = document.getElementById('print-preview-modal');
        if (modal) modal.remove();
    },

    updatePrintOption(key, val) {
        this.printPreviewState[key] = val;
        const btnLabel = document.getElementById('btn-modal-print-label');

        if (key === 'destination' && btnLabel) {
            btnLabel.textContent = (val === 'pdf') ? 'Guardar' : 'Imprimir';
        }

        if (key === 'scale') {
            if (val === 'fit') {
                this.resetPrintZoom();
            } else {
                const pct = parseInt(val, 10) || 100;
                this.applyPrintZoom(pct);
            }
            return;
        }

        // Re-calcular la división y renderizado de hojas
        this.renderPrintPreviewPages();
    },

    applyPrintZoom(pct) {
        this.printPreviewState.zoomLevel = Math.max(50, Math.min(180, pct));
        const container = document.getElementById('print-preview-sheets-container');
        const label = document.getElementById('print-zoom-label');
        if (label) label.textContent = `${this.printPreviewState.zoomLevel}%`;
        if (container) {
            container.style.transform = `scale(${this.printPreviewState.zoomLevel / 100})`;
        }
    },

    changePrintZoom(delta) {
        const next = (this.printPreviewState.zoomLevel || 100) + delta;
        this.applyPrintZoom(next);
    },

    resetPrintZoom() {
        const area = document.getElementById('print-preview-scroll-area');
        if (!area) {
            this.applyPrintZoom(100);
            return;
        }
        const availW = area.clientWidth - 48;
        const sheetW = (this.printPreviewState.layout === 'landscape') ? 880 : 680;
        if (availW > 0 && availW < sheetW) {
            const fitPct = Math.round((availW / sheetW) * 100);
            this.applyPrintZoom(fitPct);
        } else {
            this.applyPrintZoom(100);
        }
    },

    async executePrint() {
        if (!this.currentOpenedEmail) return;
        const email = this.currentOpenedEmail;
        const isDesktop = (window.DesktopBridge && window.DesktopBridge.isDesktop) || (window.location.port === '6524');
        const state = this.printPreviewState || {};
        const subject = email.subject || 'correo';
        const printDocHtml = this.getPrintDocHtml(state);
        const printOpts = {
            layout: state.layout || 'portrait',
            paperSize: state.paperSize || 'letter',
            margins: state.margins || 'default'
        };

        if (state.destination === 'pdf' && isDesktop) {
            // Guardar directamente como PDF en la versión de escritorio cargando el buffer aislado y opciones
            try {
                await fetch('/api/desktop/print-buffer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ html: printDocHtml, title: subject, options: printOpts })
                });
            } catch (err) {
                console.warn('Error al enviar buffer de impresión:', err);
            }

            console.log(`__PYQT_ACTION__:save_pdf:${subject}`);
            if (window.DesktopBridge && typeof window.DesktopBridge.save_pdf === 'function') {
                window.DesktopBridge.save_pdf(subject, printDocHtml);
            }
            if (window.UI) UI.showStickyToast('Guardar PDF', 'Elige la ubicación para guardar el documento', 'success', 3000);
            this.closePrintPreview();
            return;
        }

        if (state.destination === 'system' && isDesktop) {
            // Enviar al diálogo de impresión nativo del sistema cargando el buffer aislado y opciones
            try {
                await fetch('/api/desktop/print-buffer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ html: printDocHtml, title: subject, options: printOpts })
                });
            } catch (err) {
                console.warn('Error al enviar buffer de impresión:', err);
            }

            console.log('__PYQT_ACTION__:print_dialog');
            if (window.DesktopBridge && typeof window.DesktopBridge.print_dialog === 'function') {
                window.DesktopBridge.print_dialog();
            }
            if (window.UI) UI.showStickyToast('Imprimiendo', 'Abriendo diálogo de impresión del sistema...', 'info', 2500);
            this.closePrintPreview();
            return;
        }

        // En navegador estándar / fallback: generar impresión aislada con los ajustes elegidos
        if (window.UI) UI.showStickyToast('Imprimiendo', 'Preparando documento para imprimir...', 'info', 2000);
        this.printCurrentEmail(state);
        this.closePrintPreview();
    },

    getPrintDocHtml(customOptions = {}) {
        if (!this.currentOpenedEmail) return '';
        const email = this.currentOpenedEmail;

        const dateFormatted = new Date(email.date).toLocaleString('es-ES', { 
            dateStyle: 'full', 
            timeStyle: 'short' 
        });

        // Contenido del cuerpo: si es HTML usarlo, si es texto plano convertirlo con saltos de línea
        let bodyContent = '';
        if (email.body_html) {
            bodyContent = email.body_html;
        } else {
            const escaped = this.escapeHtml(email.body_text || email.snippet || '');
            bodyContent = `<div style="white-space: pre-wrap; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b;">${escaped}</div>`;
        }

        const isLandscape = customOptions.layout === 'landscape';
        const isMono = customOptions.color === 'monochrome';
        const showHeaders = customOptions.headersFooters !== false;
        const marginChoice = customOptions.margins || 'default';
        const marginVal = marginChoice === 'minimum' ? '0.6cm' : (marginChoice === 'none' ? '0cm' : '1.4cm 1.6cm');
        const bodyPad = marginChoice === 'minimum' ? '4px' : (marginChoice === 'none' ? '0px' : '12px');
        const paperSize = customOptions.paperSize === 'a4' ? 'A4' : 'letter';

        return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>${this.escapeHtml(email.subject || 'Correo')}</title>
    <style>
        @page {
            margin: ${marginVal};
            size: ${paperSize} ${isLandscape ? 'landscape' : 'portrait'};
        }
        *, *:before, *:after {
            box-sizing: border-box;
        }
        body {
            margin: 0;
            padding: ${bodyPad};
            background: #ffffff !important;
            color: #111827 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            font-size: 12px;
            line-height: 1.4;
            ${isMono ? 'filter: grayscale(100%);' : ''}
        }
        .print-header {
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 6px;
            margin-bottom: 10px;
            ${showHeaders ? '' : 'display: none !important;'}
        }
        .print-subject {
            font-size: 14px;
            font-weight: 700;
            color: #0f172a;
            margin: 0 0 4px 0;
            line-height: 1.3;
            word-break: break-word;
        }
        .print-meta-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 2px 16px;
            font-size: 11px;
            color: #475569;
            line-height: 1.35;
        }
        .print-meta-item strong {
            color: #0f172a;
        }
        .print-body {
            font-size: 13px;
            line-height: 1.45;
            color: #1e293b;
            width: 100% !important;
            max-width: 100% !important;
        }
        .print-body img {
            max-width: 100% !important;
            height: auto !important;
            max-height: 25cm !important;
            object-fit: contain;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
        }
        .print-body table {
            max-width: 100% !important;
        }
        .print-body tr,
        .print-body figure,
        .print-body blockquote {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
        }
        .print-footer {
            margin-top: 14px;
            padding-top: 6px;
            border-top: 1px solid #e2e8f0;
            font-size: 9.5px;
            color: #94a3b8;
            display: flex;
            justify-content: space-between;
            break-inside: avoid;
            page-break-inside: avoid;
            ${showHeaders ? '' : 'display: none !important;'}
        }
        @media print {
            body {
                background: #ffffff !important;
            }
            a {
                color: #2563eb !important;
                text-decoration: underline;
            }
            .no-print, [aria-hidden="true"] {
                display: none !important;
            }
        }
    </style>
</head>
<body>
    <div class="print-header">
        <div class="print-subject">${this.escapeHtml(email.subject || '(Sin Asunto)')}</div>
        <div class="print-meta-grid">
            <div class="print-meta-item"><strong>De:</strong> ${this.escapeHtml(email.sender)}</div>
            <div class="print-meta-item"><strong>Para:</strong> ${this.escapeHtml(email.recipient || '')}</div>
            <div class="print-meta-item"><strong>Fecha:</strong> ${dateFormatted}</div>
        </div>
    </div>

    <div class="print-body">
        ${bodyContent}
    </div>

    <div class="print-footer">
        <span>Senda &bull; Correo Inteligente</span>
        <span>Impreso el ${new Date().toLocaleDateString('es-ES')}</span>
    </div>
</body>
</html>`;
    },

    printCurrentEmail(customOptions = {}) {
        if (!this.currentOpenedEmail) return;
        const printDoc = this.getPrintDocHtml(customOptions);

        // Crear un iframe invisible para aislar la impresión y no tocar el layout de la pantalla
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        const frameDoc = iframe.contentWindow.document;
        frameDoc.open();
        frameDoc.write(printDoc);
        frameDoc.close();

        let printed = false;
        const doPrint = () => {
            if (printed) return;
            printed = true;
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            } catch (e) {
                console.warn('Error al invocar impresión:', e);
            }
            setTimeout(() => {
                iframe.remove();
            }, 3000);
        };

        const imgs = Array.from(frameDoc.images || []);
        const pendingImgs = imgs.filter(img => !img.complete);

        if (pendingImgs.length === 0) {
            setTimeout(doPrint, 200);
        } else {
            let remaining = pendingImgs.length;
            const onImgDone = () => {
                remaining--;
                if (remaining <= 0) doPrint();
            };
            pendingImgs.forEach(img => {
                img.addEventListener('load', onImgDone, { once: true });
                img.addEventListener('error', onImgDone, { once: true });
            });
            setTimeout(doPrint, 800);
        }
    },

    cleanSnippet(raw) {
        if (!raw) return '';
        let text = String(raw);
        // Si contiene tags HTML, decodificar y extraer texto limpio plano
        if (text.includes('<') && text.includes('>')) {
            try {
                const tmp = document.createElement('div');
                tmp.innerHTML = text;
                text = tmp.textContent || tmp.innerText || '';
            } catch (e) {
                text = text.replace(/<[^>]*>/g, ' ');
            }
        }
        // Decodificar entidades HTML comunes
        text = text
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#039;/gi, "'");
        // Limpiar saltos de línea y múltiples espacios consecutivos
        return text.replace(/\s+/g, ' ').trim();
    },

    escapeHtml(text) {
        if (!text) return '';
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }
};

window.EmailManager = EmailManager;

// Cerrar dropdowns flotantes al hacer clic en cualquier parte fuera de ellos
document.addEventListener('click', (e) => {
    if (!e.target.closest('[id^="btn-toggle-email-labels"]') && !e.target.closest('[id^="email-label-dropdown"]')) {
        document.querySelectorAll('[id^="email-label-dropdown"]').forEach(el => el.classList.add('hidden'));
    }
    if (!e.target.closest('#batch-labels-wrapper')) {
        const batchLabels = document.getElementById('batch-labels-dropdown');
        if (batchLabels) batchLabels.classList.add('hidden');
    }
    if (!e.target.closest('#batch-more-wrapper')) {
        const batchMore = document.getElementById('batch-more-dropdown');
        if (batchMore) batchMore.classList.add('hidden');
    }
});
