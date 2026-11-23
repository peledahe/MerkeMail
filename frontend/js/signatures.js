// Módulo del Gestor de Firmas de Correo - Senda

const SignatureManager = {
    signatures: [],
    editingSigId: null,
    isCodeMode: false,

    async init() {
        this.setupEditorEvents();
        await this.loadSignatures();
        this.setupComposeSignatureListener();
    },

    setupEditorEvents() {
        const editor = document.getElementById('sig-editor');
        const codeView = document.getElementById('sig-code-view');
        const hiddenInput = document.getElementById('new-sig-content');

        if (editor) {
            editor.addEventListener('input', () => {
                const html = editor.innerHTML;
                if (codeView && !this.isCodeMode) codeView.value = html;
                if (hiddenInput) hiddenInput.value = html;
            });
        }

        if (codeView) {
            codeView.addEventListener('input', () => {
                const html = codeView.value;
                if (editor) editor.innerHTML = html;
                if (hiddenInput) hiddenInput.value = html;
            });
        }
    },

    getEditorHTML() {
        if (this.isCodeMode) {
            const codeView = document.getElementById('sig-code-view');
            return codeView ? codeView.value : '';
        }
        const editor = document.getElementById('sig-editor');
        return editor ? editor.innerHTML : '';
    },

    setEditorHTML(html) {
        const editor = document.getElementById('sig-editor');
        const codeView = document.getElementById('sig-code-view');
        const hiddenInput = document.getElementById('new-sig-content');

        let formatted = html || '';
        // Si no tiene tags HTML pero tiene saltos de línea de texto plano, convertirlos
        if (formatted && !formatted.includes('<') && formatted.includes('\n')) {
            formatted = formatted.split('\n').map(l => EmailManager.escapeHtml(l)).join('<br>');
        }

        if (editor) editor.innerHTML = formatted;
        if (codeView) codeView.value = formatted;
        if (hiddenInput) hiddenInput.value = formatted;
    },

    execFormat(command, value = null) {
        if (this.isCodeMode) {
            this.toggleCodeView();
        }
        const editor = document.getElementById('sig-editor');
        if (editor) {
            editor.focus();
            document.execCommand(command, false, value);
            // Sincronizar
            const html = editor.innerHTML;
            const codeView = document.getElementById('sig-code-view');
            const hiddenInput = document.getElementById('new-sig-content');
            if (codeView) codeView.value = html;
            if (hiddenInput) hiddenInput.value = html;
        }
    },

    promptLink() {
        const url = prompt('Introduce la URL del enlace (ej. https://miempresa.com):');
        if (url) {
            let finalUrl = url.trim();
            if (!/^https?:\/\//i.test(finalUrl) && !/^mailto:/i.test(finalUrl)) {
                finalUrl = 'https://' + finalUrl;
            }
            this.execFormat('createLink', finalUrl);
        }
    },

    changeColor(color) {
        if (color) {
            this.execFormat('foreColor', color);
        }
    },

    toggleCodeView() {
        const editor = document.getElementById('sig-editor');
        const codeView = document.getElementById('sig-code-view');
        const btnToggle = document.getElementById('btn-sig-code-toggle');
        if (!editor || !codeView) return;

        this.isCodeMode = !this.isCodeMode;

        if (this.isCodeMode) {
            codeView.value = editor.innerHTML;
            editor.classList.add('hidden');
            codeView.classList.remove('hidden');
            codeView.focus();
            if (btnToggle) {
                btnToggle.classList.add('bg-indigo-100', 'text-indigo-700', 'dark:bg-indigo-900/50', 'dark:text-indigo-300');
                btnToggle.textContent = '👁 Visual';
            }
        } else {
            editor.innerHTML = codeView.value;
            codeView.classList.add('hidden');
            editor.classList.remove('hidden');
            editor.focus();
            if (btnToggle) {
                btnToggle.classList.remove('bg-indigo-100', 'text-indigo-700', 'dark:bg-indigo-900/50', 'dark:text-indigo-300');
                btnToggle.textContent = '</> HTML';
            }
        }
    },

    async loadSignatures() {
        try {
            const res = await fetch('/api/signatures');
            this.signatures = await res.json();
            this.renderSignaturesList();
            this.updateComposeSignatureSelect();
        } catch (e) {
            console.error("Error al cargar firmas:", e);
        }
    },

    loadSignatureForEdit(sigId) {
        const sig = this.signatures.find(s => s.id === sigId);
        if (!sig) return;

        this.editingSigId = sigId;

        // Asignar datos al formulario superior
        const editIdInput = document.getElementById('edit-sig-id');
        const nameInput = document.getElementById('new-sig-name');
        const accountSelect = document.getElementById('new-sig-account');
        const isDefaultCheckbox = document.getElementById('new-sig-is-default');

        if (editIdInput) editIdInput.value = sig.id;
        if (nameInput) nameInput.value = sig.name;
        if (accountSelect) accountSelect.value = sig.account_id !== null && sig.account_id !== undefined ? sig.account_id : '';
        if (isDefaultCheckbox) isDefaultCheckbox.checked = Boolean(sig.is_default);

        // Cargar contenido en el editor HTML
        this.setEditorHTML(sig.content);

        // Actualizar UI del formulario a modo edición
        const formTitle = document.getElementById('sig-form-title');
        const formBadge = document.getElementById('sig-form-badge');
        const btnCancelTop = document.getElementById('btn-cancel-edit-sig');
        const btnCancelBottom = document.getElementById('btn-cancel-edit-sig-bottom');
        const btnSaveText = document.getElementById('sig-save-text');
        const editHint = document.getElementById('sig-edit-hint');

        if (formTitle) formTitle.textContent = 'Editar Firma';
        if (formBadge) {
            formBadge.className = 'w-2 h-2 rounded-full bg-amber-500 animate-pulse';
        }
        if (btnCancelTop) btnCancelTop.classList.remove('hidden');
        if (btnCancelBottom) btnCancelBottom.classList.remove('hidden');
        if (btnSaveText) btnSaveText.textContent = 'Actualizar Firma';
        if (editHint) editHint.textContent = `Modificando: "${sig.name}"`;

        // Resaltar en la lista
        this.renderSignaturesList();

        // Scroll suave al formulario superior
        const form = document.getElementById('new-signature-form');
        if (form) {
            form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    },

    cancelEdit() {
        this.editingSigId = null;

        const editIdInput = document.getElementById('edit-sig-id');
        const form = document.getElementById('new-signature-form');
        if (editIdInput) editIdInput.value = '';
        if (form) form.reset();

        this.setEditorHTML('');

        // Salir de modo código si estaba activo
        if (this.isCodeMode) {
            this.toggleCodeView();
        }

        // Restaurar UI a modo nueva firma
        const formTitle = document.getElementById('sig-form-title');
        const formBadge = document.getElementById('sig-form-badge');
        const btnCancelTop = document.getElementById('btn-cancel-edit-sig');
        const btnCancelBottom = document.getElementById('btn-cancel-edit-sig-bottom');
        const btnSaveText = document.getElementById('sig-save-text');
        const editHint = document.getElementById('sig-edit-hint');

        if (formTitle) formTitle.textContent = 'Nueva Firma';
        if (formBadge) {
            formBadge.className = 'w-2 h-2 rounded-full bg-indigo-500';
        }
        if (btnCancelTop) btnCancelTop.classList.add('hidden');
        if (btnCancelBottom) btnCancelBottom.classList.add('hidden');
        if (btnSaveText) btnSaveText.textContent = 'Guardar Firma';
        if (editHint) editHint.textContent = '';

        // Quitar resaltado de la lista
        this.renderSignaturesList();
    },

    renderSignaturesList() {
        const container = document.getElementById('signatures-list-container');
        if (!container) return;

        if (this.signatures.length === 0) {
            container.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">No hay firmas creadas aún</p>`;
            return;
        }

        container.innerHTML = this.signatures.map(sig => {
            const isDef = Boolean(sig.is_default);
            const isSelectedForEdit = this.editingSigId === sig.id;
            const accountLabel = sig.account_name ? `${sig.account_name} (${sig.account_email})` : 'Todas las cuentas';

            // Formatear vista previa HTML segura
            let previewContent = sig.content || '';
            const isPlain = !previewContent.includes('<') && previewContent.includes('\n');
            if (isPlain) {
                previewContent = previewContent.split('\n').map(l => EmailManager.escapeHtml(l)).join('<br>');
            }

            return `
                <div class="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl border ${isSelectedForEdit ? 'border-indigo-500 ring-2 ring-indigo-500/30 bg-indigo-50/20 dark:bg-indigo-950/20' : 'border-slate-200 dark:border-slate-700/60'} flex flex-col gap-2 shadow-2xs transition-all">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-slate-900 dark:text-white">${EmailManager.escapeHtml(sig.name)}</span>
                            ${isDef ? '<span class="text-[9px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Default</span>' : ''}
                            ${isSelectedForEdit ? '<span class="text-[9px] font-semibold uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 dark:text-amber-400 border border-amber-500/30">Editando</span>' : ''}
                        </div>
                        <div class="flex items-center gap-1">
                            ${!isDef ? `
                                <button onclick="SignatureManager.setDefault(${sig.id})" class="text-[10px] text-indigo-500 hover:text-indigo-400 px-2 py-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors font-medium">
                                    Usar por defecto
                                </button>
                            ` : ''}
                            <button onclick="SignatureManager.loadSignatureForEdit(${sig.id})" class="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1.5 rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors" title="Editar en el formulario superior">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                            </button>
                            <button onclick="SignatureManager.deleteSignature(${sig.id}, '${EmailManager.escapeHtml(sig.name)}')" class="text-slate-400 hover:text-rose-500 p-1.5 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors" title="Eliminar firma">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            </button>
                        </div>
                    </div>
                    
                    <div class="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                        <span>Asignada a: <strong>${accountLabel}</strong></span>
                    </div>

                    <!-- Vista previa renderizada HTML con click para editar -->
                    <div onclick="SignatureManager.loadSignatureForEdit(${sig.id})" class="cursor-pointer p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed max-h-28 overflow-y-auto sig-preview-html hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors" title="Clic para cargar y editar en el formulario">
                        ${previewContent}
                    </div>
                </div>
            `;
        }).join('');
    },

    updateComposeSignatureSelect() {
        const select = document.getElementById('compose-signature-select');
        if (!select) return;

        select.innerHTML = '<option value="">(Sin firma)</option>' + 
            this.signatures.map(s => `<option value="${s.id}">${s.name} ${s.is_default ? '★' : ''}</option>`).join('');
    },

    setupComposeSignatureListener() {
        const accountSelect = document.getElementById('compose-account-select');
        const signatureSelect = document.getElementById('compose-signature-select');

        // Al cambiar de cuenta en el redactor, inyectar automáticamente la firma default de esa cuenta
        if (accountSelect) {
            accountSelect.addEventListener('change', () => {
                const accountId = parseInt(accountSelect.value);
                this.applyDefaultSignatureForAccount(accountId);
            });
        }

        // Al cambiar manualmente de firma en el redactor
        if (signatureSelect) {
            signatureSelect.addEventListener('change', () => {
                const sigId = parseInt(signatureSelect.value);
                if (sigId) {
                    const sig = this.signatures.find(s => s.id === sigId);
                    if (sig) this.insertSignatureIntoCompose(sig.content);
                }
            });
        }
    },

    async getDefaultSignatureForAccount(accountId) {
        if (!this.signatures || this.signatures.length === 0) {
            await this.loadSignatures();
        }
        const accId = accountId !== null && accountId !== undefined ? parseInt(accountId) : null;
        let defaultSig = this.signatures.find(s => parseInt(s.account_id) === accId && Boolean(s.is_default));
        if (!defaultSig) {
            defaultSig = this.signatures.find(s => (s.account_id === null || s.account_id === undefined || s.account_id === '') && Boolean(s.is_default));
        }
        if (!defaultSig) {
            defaultSig = this.signatures.find(s => Boolean(s.is_default));
        }
        return defaultSig || null;
    },

    getDefaultSignatureSync(accountId) {
        if (!this.signatures || this.signatures.length === 0) return null;
        const accId = accountId !== null && accountId !== undefined ? parseInt(accountId) : null;
        let defaultSig = this.signatures.find(s => parseInt(s.account_id) === accId && Boolean(s.is_default));
        if (!defaultSig) {
            defaultSig = this.signatures.find(s => (s.account_id === null || s.account_id === undefined || s.account_id === '') && Boolean(s.is_default));
        }
        if (!defaultSig) {
            defaultSig = this.signatures.find(s => Boolean(s.is_default));
        }
        return defaultSig || null;
    },

    async applyDefaultSignatureForAccount(accountId) {
        const defaultSig = await this.getDefaultSignatureForAccount(accountId);
        if (defaultSig) {
            const sigSelect = document.getElementById('compose-signature-select');
            if (sigSelect) sigSelect.value = defaultSig.id;
            this.insertSignatureIntoCompose(defaultSig.content);
        } else {
            const sigSelect = document.getElementById('compose-signature-select');
            if (sigSelect) sigSelect.value = '';
            this.insertSignatureIntoCompose('');
        }
    },

    insertSignatureIntoCompose(signatureText) {
        if (window.Composer) {
            Composer.insertSignature(signatureText);
            return;
        }

        const bodyInput = document.getElementById('compose-body');
        if (!bodyInput) return;

        let currentBody = bodyInput.value;
        const sigMarkerIndex = currentBody.lastIndexOf('\n\n--');
        if (sigMarkerIndex !== -1) {
            currentBody = currentBody.substring(0, sigMarkerIndex).trim();
        }

        bodyInput.value = currentBody ? `${currentBody}\n\n${signatureText}` : signatureText;
    },

    async saveSignature(e) {
        if (e && e.preventDefault) e.preventDefault();

        const editIdInput = document.getElementById('edit-sig-id');
        const editingId = editIdInput && editIdInput.value ? parseInt(editIdInput.value) : null;

        const name = document.getElementById('new-sig-name').value.trim();
        const content = this.getEditorHTML().trim();
        const accSelect = document.getElementById('new-sig-account').value;
        const isDefault = document.getElementById('new-sig-is-default').checked ? 1 : 0;
        const accountId = accSelect ? parseInt(accSelect) : null;

        if (!name || !content) {
            UI.showStickyToast('Campos requeridos', 'El nombre y contenido HTML de la firma son obligatorios', 'warning');
            return;
        }

        try {
            const isEdit = Boolean(editingId);
            const url = isEdit ? `/api/signatures/${editingId}` : '/api/signatures';
            const method = isEdit ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    content,
                    account_id: accountId,
                    is_default: isDefault
                })
            });

            const data = await res.json();
            if (data.success) {
                const actionTitle = isEdit ? 'Firma Actualizada' : 'Firma Guardada';
                const actionMsg = isEdit 
                    ? `La firma "${name}" fue actualizada exitosamente` 
                    : `La firma "${name}" fue creada exitosamente`;

                UI.showStickyToast(actionTitle, actionMsg, 'success');
                this.cancelEdit();
                await this.loadSignatures();
            } else {
                UI.showStickyToast('Error', data.detail || 'No se pudo guardar la firma', 'error');
            }
        } catch (err) {
            UI.showStickyToast('Error', err.message, 'error');
        }
    },

    // Alias retrocompatible
    saveNewSignature(e) {
        return this.saveSignature(e);
    },

    async setDefault(sigId) {
        try {
            const res = await fetch(`/api/signatures/${sigId}/set-default`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                UI.showStickyToast('Firma Actualizada', 'Firma establecida como predeterminada', 'success');
                await this.loadSignatures();
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    async deleteSignature(sigId, sigName) {
        const confirmed = await UI.confirm({
            title: '¿Eliminar firma de correo?',
            message: `¿Estás seguro de eliminar la firma "${sigName}"? Esta acción no se puede deshacer.`,
            confirmText: 'Eliminar firma',
            isDanger: true
        });

        if (!confirmed) return;

        try {
            const res = await fetch(`/api/signatures/${sigId}`, { method: 'DELETE' });
            if (res.ok) {
                UI.showStickyToast('Firma Eliminada', `La firma "${sigName}" fue removida`, 'success');
                if (this.editingSigId === sigId) {
                    this.cancelEdit();
                }
                await this.loadSignatures();
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    openSignaturesDrawer() {
        const select = document.getElementById('new-sig-account');
        if (select) {
            fetch('/api/accounts').then(r => r.json()).then(accs => {
                select.innerHTML = '<option value="">Todas las cuentas</option>' + 
                    accs.map(a => `<option value="${a.id}">${a.name} (${a.email})</option>`).join('');
                if (this.editingSigId) {
                    const currentSig = this.signatures.find(s => s.id === this.editingSigId);
                    if (currentSig && currentSig.account_id !== null && currentSig.account_id !== undefined) {
                        select.value = currentSig.account_id;
                    }
                }
            });
        }
        UI.openDrawer('drawer-signatures');
    }
};

window.SignatureManager = SignatureManager;
