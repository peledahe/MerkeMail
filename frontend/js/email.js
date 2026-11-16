// Módulo de Gestión de Correos - MerkeMail

const EmailManager = {
    currentFolder: 'INBOX',
    currentAccountId: null,
    currentLabelId: null,
    labels: [],
    searchQuery: '',
    currentPage: 1,
    pageSize: 12,
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
    accountLabelsCache: {},

    getFolderDisplayName(folder) {
        if (!folder) return 'Recibidos';
        const clean = String(folder).trim().toUpperCase();
        const map = {
            'INBOX': 'Recibidos',
            'CATEGORY_UPDATES': 'Actualizaciones',
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
            'CATEGORY_UPDATES': 'Actualizaciones',
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

    accountErrors: {},
    syncSystemStatus: 'inactive', // 'active' | 'problems' | 'inactive' | 'paused'

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

            // Actualizar la descripción de bienvenida del asistente Elio
            if (window.AntigravityCopilot && typeof AntigravityCopilot.updateConnectedServices === 'function') {
                AntigravityCopilot.updateConnectedServices();
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

            // Actualizar la descripción de bienvenida del asistente Elio
            if (window.AntigravityCopilot && typeof AntigravityCopilot.updateConnectedServices === 'function') {
                AntigravityCopilot.updateConnectedServices();
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

            this.updateSystemSyncPill(Object.keys(this.accountErrors).length > 0 ? 'problems' : 'active');

            // Actualizar la descripción de bienvenida del asistente Elio
            if (window.AntigravityCopilot && typeof AntigravityCopilot.updateConnectedServices === 'function') {
                AntigravityCopilot.updateConnectedServices();
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
        this.currentAccountId = accountId;
        this.currentPage = 1;
        this.selectedEmailId = null;
        this.currentFolder = 'INBOX';
        this.currentLabelId = null;
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
            // Cargar todas las etiquetas para pre-popular la caché por cuenta
            const allRes = await fetch('/api/labels');
            const allLabels = await allRes.json();
            this.accountLabelsCache = {};
            (allLabels || []).forEach(l => {
                if (l.account_id) {
                    if (!this.accountLabelsCache[l.account_id]) this.accountLabelsCache[l.account_id] = [];
                    this.accountLabelsCache[l.account_id].push(l);
                }
            });

            if (this.currentAccountId) {
                this.labels = (allLabels || []).filter(l => !l.account_id || l.account_id === this.currentAccountId);
            } else {
                this.labels = allLabels;
            }
            await this.updateUnreadCounts();
            this.renderLabels();
        } catch (e) {
            console.error("Error al cargar etiquetas:", e);
        }
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

    renderLabels() {
        const container = document.getElementById('sidebar-labels-list');
        if (!container) return;

        if (!this.labels || this.labels.length === 0) {
            container.innerHTML = `
                <div class="px-4 py-1.5 text-[11px] text-slate-400 italic">
                    Sin etiquetas
                </div>
            `;
            return;
        }

        container.innerHTML = this.labels.map(l => {
            const isActive = this.currentLabelId === l.id;
            const unread = (this.unreadCounts?.labels && this.unreadCounts.labels[String(l.id)]) || 0;
            const displayName = this.getLabelDisplayName(l.name);
            return `
                <div class="label-nav-btn group flex items-center justify-between px-3 sm:px-4 py-1.5 rounded-r-full cursor-pointer transition-colors ${
                    isActive 
                        ? 'bg-indigo-50 dark:bg-indigo-950/70 font-bold text-indigo-700 dark:text-indigo-300 border-l-2 border-indigo-600 dark:border-indigo-400' 
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }" onclick="EmailManager.filterByLabel(${l.id})" title="${this.escapeHtml(displayName)}">
                    <div class="label-left-content flex items-center gap-2.5 min-w-0 flex-1">
                        <span class="label-dot w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style="background-color: ${l.color || '#3b82f6'}"></span>
                        <span class="sidebar-text truncate text-xs">${this.escapeHtml(displayName)}</span>
                    </div>
                    <div class="sidebar-text flex items-center gap-1.5 shrink-0 ml-1">
                        <span class="sidebar-badge text-[11px] px-2 py-0.5 rounded-full font-bold bg-slate-200/80 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 ${unread > 0 ? '' : 'hidden'}" id="label-badge-${l.id}">
                            ${unread > 999 ? '999+' : unread}
                        </span>
                        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onclick="event.stopPropagation(); EmailManager.openEditLabelModal(${l.id}, '${this.escapeHtml(l.name)}', '${l.color || '#3b82f6'}')" class="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400" title="Editar etiqueta">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                            </button>
                            <button onclick="event.stopPropagation(); EmailManager.deleteLabel(${l.id}, '${this.escapeHtml(displayName)}')" class="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400" title="Eliminar etiqueta">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    filterByLabel(labelId) {
        if (window.innerWidth < 768 && window.UI) UI.closeMobileSidebar();
        this.clearAdvancedFiltersState();
        this.currentLabelId = labelId;
        this.currentFolder = null;
        this.currentPage = 1;
        this.clearSelection();

        // Asegurar vista de correo
        const sectionMail = document.getElementById('main-mail-section');
        const sectionCalendar = document.getElementById('main-calendar-section');
        const btnNavCalendar = document.getElementById('nav-item-calendar');
        if (sectionMail && sectionCalendar) {
            sectionMail.classList.remove('hidden');
            sectionCalendar.classList.add('hidden');
        }
        if (btnNavCalendar) {
            btnNavCalendar.classList.remove('bg-indigo-50', 'dark:bg-indigo-950/60', 'text-indigo-600', 'dark:text-indigo-400', 'font-bold');
        }

        // Quitar active-folder de carpetas
        document.querySelectorAll('.folder-nav-btn').forEach(b => {
            b.classList.remove('active-folder', 'bg-indigo-50', 'dark:bg-indigo-950/70', 'text-indigo-600', 'dark:text-indigo-400', 'font-bold');
            b.classList.add('text-slate-700', 'dark:text-slate-300');
        });

        // Actualizar título
        const label = this.labels.find(l => l.id === labelId);
        const titleEl = document.getElementById('current-folder-title');
        if (titleEl && label) {
            titleEl.textContent = `Etiqueta: ${this.getLabelDisplayName(label.name)}`;
        }

        this.renderLabels();
        this.backToList();
        this.loadEmails();
    },

    openCreateLabelModal() {
        document.getElementById('modal-label-title').textContent = 'Nueva Etiqueta';
        document.getElementById('manage-label-id').value = '';
        const accEl = document.getElementById('manage-label-account-id');
        if (accEl) accEl.value = this.currentAccountId || '';
        document.getElementById('manage-label-name').value = '';
        this.selectLabelColor('#3b82f6');
        document.getElementById('modal-manage-label').classList.remove('hidden');
        setTimeout(() => document.getElementById('manage-label-name').focus(), 100);
    },

    openCreateLabelModalForAccount(accountId) {
        document.getElementById('modal-label-title').textContent = 'Nueva Etiqueta en Cuenta';
        document.getElementById('manage-label-id').value = '';
        const accEl = document.getElementById('manage-label-account-id');
        if (accEl) accEl.value = accountId || '';
        document.getElementById('manage-label-name').value = '';
        this.selectLabelColor('#3b82f6');
        document.getElementById('modal-manage-label').classList.remove('hidden');
        setTimeout(() => document.getElementById('manage-label-name').focus(), 100);
    },

    openEditLabelModal(labelId, labelName, labelColor) {
        document.getElementById('modal-label-title').textContent = 'Editar Etiqueta';
        document.getElementById('manage-label-id').value = labelId;
        document.getElementById('manage-label-name').value = labelName;
        this.selectLabelColor(labelColor || '#3b82f6');
        document.getElementById('modal-manage-label').classList.remove('hidden');
        setTimeout(() => document.getElementById('manage-label-name').focus(), 100);
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
        const account_id = accIdVal ? parseInt(accIdVal) : (this.currentAccountId || null);

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
                UI.showStickyToast('Etiqueta Actualizada', `Se guardó "${name}" correctamente`, 'success');
            } else {
                const res = await fetch('/api/labels', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, color, account_id })
                });
                if (!res.ok) throw new Error('Error al crear');
                UI.showStickyToast('Etiqueta Creada', `La etiqueta "${name}" ha sido creada`, 'success');
            }

            document.getElementById('modal-manage-label').classList.add('hidden');
            await this.loadLabels();
            if (this.selectedEmailId) {
                await this.openEmailDetail(this.selectedEmailId);
            }
            if (this.currentLabelId) {
                await this.loadEmails(false);
            }
        } catch (err) {
            UI.showStickyToast('Error', err.message, 'error');
        }
    },

    async deleteLabel(labelId, labelName) {
        const confirmed = await UI.confirm({
            title: '¿Eliminar etiqueta?',
            message: `¿Estás seguro de eliminar la etiqueta "${labelName}"? Los correos no se borrarán, solo perderán esta etiqueta.`,
            confirmText: 'Eliminar Etiqueta',
            cancelText: 'Cancelar',
            isDanger: true
        });

        if (!confirmed) return;

        try {
            const res = await fetch(`/api/labels/${labelId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('No se pudo eliminar la etiqueta');

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
            await this.updateUnreadCounts();
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
            await this.updateUnreadCounts();
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
            if (this.currentLabelId) {
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

            // Actualizar la descripción de bienvenida del asistente Elio
            if (window.AntigravityCopilot && typeof AntigravityCopilot.updateConnectedServices === 'function') {
                AntigravityCopilot.updateConnectedServices();
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

        if (this.emails.length === 0) {
            this.resetDetailView();
            listContainer.innerHTML = `
                <div class="py-16 text-center text-slate-400 dark:text-slate-500 text-xs">
                    <svg class="w-8 h-8 stroke-1 opacity-50 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>
                    <span>No se encontraron correos en esta bandeja</span>
                </div>
            `;
            return;
        }

        // Si el correo actualmente seleccionado ya no se encuentra en la lista filtrada o nueva carpeta, resetear visor
        if (this.selectedEmailId && !this.emails.some(e => e.id === this.selectedEmailId)) {
            this.resetDetailView();
        }

        listContainer.innerHTML = this.emails.map(email => {
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

                        <!-- Indicativo Color Cuenta -->
                        <span class="w-2 h-2 rounded-full shrink-0 shadow-2xs" style="background-color: ${email.account_color || '#3b82f6'}" title="${this.escapeHtml(email.account_name || 'Cuenta')}"></span>

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

                    <!-- Snippet Vista Previa & Badges Etiquetas -->
                    <div class="email-item-snippet text-[11px] text-slate-500 dark:text-slate-400 truncate pl-6 font-normal flex items-center gap-1.5 flex-wrap">
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
        if (!this.selectedEmailId && this.emails.length > 0 && window.innerWidth >= 768) {
            this.openEmailDetail(this.emails[0].id);
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

            // Obtener etiquetas de la cuenta desde caché en memoria inmediata
            let originLabels = this.accountLabelsCache[email.account_id] || [];
            const originAccount = (this.accounts || []).find(a => a.id === email.account_id);
            const originAccountLabel = originAccount ? (originAccount.email || originAccount.name) : 'Cuenta origen';
            const folderDisplayName = this.getFolderDisplayName(email.folder);
            const isInboxCategory = ['INBOX', 'CATEGORY_UPDATES', 'CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_FORUMS', 'CATEGORY_PERSONAL'].includes((email.folder || '').toUpperCase());
            const isSpam = (email.folder === 'SPAM' || this.currentFolder === 'SPAM');
            const isTrashOrSpamOrDraft = ['SPAM', 'TRASH', 'DRAFT', 'DRAFTS'].includes((this.currentFolder || '').toUpperCase()) || ['SPAM', 'TRASH', 'DRAFT', 'DRAFTS'].includes((email.folder || '').toUpperCase());
            const hasImages = Boolean(email.body_html && (/<img\b|background-image\s*:/i.test(email.body_html)));
            const hasImagesAuthorized = this.authorizedSpamImages.has(email.id);

            const labelsDropdownContent = `
                <div class="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider truncate">Etiquetas (${this.escapeHtml(originAccountLabel)})</span>
                </div>
                
                <div class="py-1">
                    ${originLabels.length > 0 ? originLabels.map(l => {
                        const isAssigned = assignedLabelIds.has(l.id);
                        return `
                            <div onclick="EmailManager.toggleLabelOnCurrentEmail(${email.id}, ${l.id}, ${isAssigned})" class="w-full text-left px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                                <div class="flex items-center gap-2 min-w-0">
                                    <span class="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs" style="background-color: ${l.color}"></span>
                                    <span class="truncate text-slate-700 dark:text-slate-200 ${isAssigned ? 'font-semibold text-indigo-600 dark:text-indigo-400' : ''}">${this.escapeHtml(this.getLabelDisplayName(l.name))}</span>
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
                    <button onclick="EmailManager.openCreateLabelModalForAccount(${email.account_id})" class="w-full text-left px-2.5 py-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg flex items-center gap-1.5 font-medium transition-colors">
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
                        <!-- Sección Izquierda: Botón Volver + Slot Superior de Etiquetas -->
                        <div class="flex items-center min-w-0 flex-1 mr-2 sm:mr-3 overflow-hidden">
                            <!-- Volver (visible en móviles y vistas estrechas) -->
                            <button onclick="EmailManager.backToList()" class="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg md:hidden shrink-0 mr-1.5" title="Volver a la lista">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                            </button>

                            <!-- Slot Superior de Etiquetas (con scroll horizontal si cabe arriba) -->
                            <div id="email-labels-top-slot" class="email-labels-scroll flex-1 min-w-0 flex items-center gap-1.5 sm:gap-2 overflow-x-auto flex-nowrap py-1 select-none" onwheel="if(event.deltaY !== 0){this.scrollLeft += event.deltaY; event.preventDefault();}">
                                <!-- Indicador Carpeta / Recibidos con botón de archivar -->
                                <span class="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full font-medium ${isSpam ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'} shrink-0 whitespace-nowrap" title="${folderDisplayName}">
                                    <span>${folderDisplayName}</span>
                                    ${isInboxCategory ? `
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
                            <!-- 1. Botón Archivar / Almacenar (Oculto en Papelera, Spam y Borradores) -->
                            ${!isTrashOrSpamOrDraft ? `
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

                            <!-- 11. Imprimir (solo visible en modo browser y PWA, oculto en modo instalado/desktop) -->
                            <button id="btn-print-email" onclick="EmailManager.printCurrentEmail()" class="${(window.DesktopBridge && window.DesktopBridge.isDesktop) ? 'hidden' : ''} p-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg border border-slate-200 dark:border-slate-800 transition-colors shadow-2xs cursor-pointer" title="Imprimir correo">
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

                        <div class="max-w-4xl w-full mx-auto bg-white rounded-2xl p-1.5 md:p-3 border border-slate-200 dark:border-slate-800 shadow-2xs overflow-x-auto min-w-0 mb-3 transition-all">
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
            height: auto !important;
            min-height: 0 !important;
            overflow: hidden !important;
            background-color: #ffffff;
            color: #1e293b;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            box-sizing: border-box;
            word-wrap: break-word;
            overflow-wrap: break-word;
        }
        /* Eliminar margen y espaciado residual de los últimos elementos del correo */
        #merke-email-content > *:last-child,
        #merke-email-content table:last-child,
        #merke-email-content p:last-child,
        #merke-email-content div:last-child {
            margin-bottom: 0 !important;
            padding-bottom: 0 !important;
        }
        /* Contención segura para respetar el diseño original de tablas e imágenes */
        img {
            max-width: 100% !important;
            height: auto;
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
        table {
            max-width: 100% !important;
        }
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

            // Manejo de errores de carga de imágenes con fallback al proxy backend
            const images = doc.images || [];
            Array.from(images).forEach(img => {
                if (!img.complete) {
                    img.addEventListener('load', adjustHeight);
                }
                img.addEventListener('error', function onImgError() {
                    img.removeEventListener('error', onImgError);
                    const originalSrc = this.getAttribute('src') || this.src;
                    if (originalSrc && !this.dataset.fallbackTried && (originalSrc.startsWith('http://') || originalSrc.startsWith('https://'))) {
                        this.dataset.fallbackTried = "true";
                        this.src = `/api/image-proxy?url=${encodeURIComponent(originalSrc)}`;
                        this.addEventListener('load', adjustHeight);
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
        const confirmed = await UI.confirm({
            title: '¿Mover a la papelera?',
            message: 'El correo seleccionado se moverá a la papelera.',
            confirmText: 'Mover a papelera',
            isDanger: true
        });

        if (!confirmed) return;

        try {
            const res = await fetch(`/api/emails/${emailId}`, { method: 'DELETE' });
            if (res.ok) {
                UI.showStickyToast('Correo Eliminado', 'El correo ha sido enviado a la papelera', 'success');
                this.backToList();
                this.loadEmails();
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

        // Ocultar botón de archivar masivo en carpetas Papelera (TRASH), Spam (SPAM) y Borradores (DRAFT/DRAFTS)
        const folderUpper = (this.currentFolder || '').toUpperCase();
        const canArchiveInFolder = !['SPAM', 'TRASH', 'DRAFT', 'DRAFTS'].includes(folderUpper);
        const batchArchiveBtn = document.getElementById('btn-batch-archive');
        const batchMoreArchiveBtn = document.getElementById('batch-more-item-archive');
        if (batchArchiveBtn) {
            batchArchiveBtn.style.display = canArchiveInFolder ? '' : 'none';
        }
        if (batchMoreArchiveBtn) {
            batchMoreArchiveBtn.style.display = canArchiveInFolder ? '' : 'none';
        }
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

        if (action === 'archive') {
            const folderUpper = (this.currentFolder || '').toUpperCase();
            if (['SPAM', 'TRASH', 'DRAFT', 'DRAFTS'].includes(folderUpper)) {
                UI.showStickyToast('Acción no permitida', 'No se permite almacenar o archivar correos en Spam, Papelera o Borradores', 'warning');
                return;
            }
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
            if (!this.labels || this.labels.length === 0) {
                listEl.innerHTML = '<div class="px-3 py-2 text-slate-400 text-[11px] italic">Sin etiquetas creadas</div>';
            } else {
                listEl.innerHTML = this.labels.map(l => `
                    <button onclick="EmailManager.executeBatchAction('add_label', { label_id: ${l.id} })" class="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-2">
                        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${l.color}"></span>
                        <span class="truncate">${this.escapeHtml(l.name)}</span>
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

    async deleteSelectedBatch() {
        const ids = this.getSelectedEmailIds();
        if (ids.length === 0) return;

        const confirmed = await UI.confirm({
            title: `¿Eliminar ${ids.length} correos?`,
            message: `Los ${ids.length} correos seleccionados se moverán a la papelera.`,
            confirmText: 'Mover a papelera',
            isDanger: true
        });

        if (!confirmed) return;

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

    printCurrentEmail() {
        if (!this.currentOpenedEmail) return;
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

        // Crear documento HTML autónomo y profesional para la impresión
        const printDoc = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>${this.escapeHtml(email.subject || 'Correo')}</title>
    <style>
        @page {
            margin: 0.6cm 0.8cm;
            size: auto;
        }
        *, *:before, *:after {
            box-sizing: border-box;
        }
        body {
            margin: 0;
            padding: 0;
            background: #ffffff !important;
            color: #111827 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            font-size: 12px;
            line-height: 1.4;
        }
        .print-header {
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 4px;
            margin-bottom: 8px;
        }
        .print-subject {
            font-size: 13.5px;
            font-weight: 700;
            color: #0f172a;
            margin: 0 0 3px 0;
            line-height: 1.25;
            word-break: break-word;
        }
        .print-meta-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 2px 14px;
            font-size: 10.5px;
            color: #475569;
            line-height: 1.3;
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
        }
        .print-body table {
            max-width: 100% !important;
            break-inside: auto;
            page-break-inside: auto;
        }
        .print-body figure {
            break-inside: auto;
            page-break-inside: auto;
        }
        .print-body h1, .print-body h2, .print-body h3, .print-body h4 {
            break-after: avoid;
            page-break-after: avoid;
        }
        /* Permitir flujo continuo y evitar que contenedores responsivos (Klaviyo, MJML, etc.) bloqueen saltos de página */
        .print-body .kl-row,
        .print-body .kl-column,
        .print-body .colstack,
        .print-body [style*="display:table"],
        .print-body [style*="display: table"],
        .print-body [style*="display:table-cell"],
        .print-body [style*="display: table-cell"],
        .print-body [style*="inline-block"][style*="width: 100%"],
        .print-body [style*="inline-block"][style*="width:100%"],
        .print-body .mj-column-per-100 {
            display: block !important;
            width: 100% !important;
            break-inside: auto !important;
            page-break-inside: auto !important;
        }
        .print-footer {
            margin-top: 12px;
            padding-top: 6px;
            border-top: 1px solid #e2e8f0;
            font-size: 9.5px;
            color: #94a3b8;
            display: flex;
            justify-content: space-between;
            break-inside: avoid;
            page-break-inside: avoid;
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
        <span>MerkeMail &bull; Correo Inteligente</span>
        <span>Impreso el ${new Date().toLocaleDateString('es-ES')}</span>
    </div>
</body>
</html>
        `;

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

        // Control de impresión asegurando que las imágenes remotas terminen de renderizar sus dimensiones
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
            // Timeout de seguridad máximo de 800ms para no demorar al usuario si alguna imagen falla o tarda
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
