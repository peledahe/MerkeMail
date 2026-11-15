// ========================================================
// Gestor de Redacción y Editor Enriquecido HTML (WYSIWYG)
// MerkeMail Composer
// ========================================================

const Composer = {
    isExpanded: false,
    isCodeView: false,
    savedSelection: null,

    init() {
        const editor = document.getElementById('compose-editor');
        const codeView = document.getElementById('compose-code-view');
        const hiddenBody = document.getElementById('compose-body');

        if (!editor) return;

        // Sincronizar contenido al escribir
        editor.addEventListener('input', () => {
            this.syncHiddenBody();
            this.updateToolbarState();
            this.updatePlaceholderState();
        });

        // Actualizar estado de la barra de herramientas al cambiar la selección
        editor.addEventListener('keyup', () => {
            this.updateToolbarState();
            this.updatePlaceholderState();
        });
        editor.addEventListener('mouseup', () => this.updateToolbarState());
        editor.addEventListener('focus', () => {
            this.updateToolbarState();
            if (!this.getTextWithoutSignature(editor)) {
                this.focusTop();
            }
        });

        // Manejar atajos de teclado estándar
        editor.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 'b':
                        e.preventDefault();
                        this.exec('bold');
                        break;
                    case 'i':
                        e.preventDefault();
                        this.exec('italic');
                        break;
                    case 'u':
                        e.preventDefault();
                        this.exec('underline');
                        break;
                    case 'k':
                        e.preventDefault();
                        this.openLinkModal();
                        break;
                    case 'z':
                        // Dejar que el navegador maneje undo/redo nativo en contenteditable
                        break;
                }
            }
        });

        // Sincronizar cambios desde la vista de código fuente
        if (codeView) {
            codeView.addEventListener('input', () => {
                editor.innerHTML = codeView.value;
                this.syncHiddenBody();
            });
        }

        // Cerrar paletas de colores al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#format-text-color-popover') && !e.target.closest('#btn-format-text-color')) {
                const p = document.getElementById('format-text-color-popover');
                if (p) p.classList.add('hidden');
            }
            if (!e.target.closest('#format-bg-color-popover') && !e.target.closest('#btn-format-bg-color')) {
                const p = document.getElementById('format-bg-color-popover');
                if (p) p.classList.add('hidden');
            }
            if (!e.target.closest('#inline-format-text-color-popover') && !e.target.closest('#btn-inline-text-color')) {
                const p = document.getElementById('inline-format-text-color-popover');
                if (p) p.classList.add('hidden');
            }
            if (!e.target.closest('#inline-format-bg-color-popover') && !e.target.closest('#btn-inline-bg-color')) {
                const p = document.getElementById('inline-format-bg-color-popover');
                if (p) p.classList.add('hidden');
            }
        });
    },

    saveSelection() {
        if (window.getSelection) {
            const sel = window.getSelection();
            if (sel.getRangeAt && sel.rangeCount) {
                this.savedSelection = sel.getRangeAt(0).cloneRange();
            }
        }
    },

    restoreSelection() {
        if (this.savedSelection && window.getSelection) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(this.savedSelection);
        }
    },

    focusEditor() {
        const editor = document.getElementById('compose-editor');
        if (editor) editor.focus();
    },

    setCursorToTop(editor) {
        if (!editor) return;
        editor.focus();

        let firstBlock = editor.firstElementChild;
        if (!firstBlock || firstBlock.classList.contains('mail-signature')) {
            firstBlock = document.createElement('p');
            firstBlock.innerHTML = '<br>';
            editor.insertBefore(firstBlock, editor.firstChild);
        }

        const sel = window.getSelection();
        if (sel) {
            const range = document.createRange();
            range.setStart(firstBlock, 0);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    },

    focusTop() {
        const editor = document.getElementById('compose-editor');
        if (editor) this.setCursorToTop(editor);
    },

    exec(command, value = null) {
        if (this.isCodeView) return;
        this.focusEditor();
        document.execCommand(command, false, value);
        this.syncHiddenBody();
        this.updateToolbarState();
    },

    formatBlock(tag) {
        if (this.isCodeView) return;
        this.focusEditor();
        if (tag === 'p') {
            document.execCommand('formatBlock', false, '<p>');
        } else if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
            document.execCommand('formatBlock', false, `<${tag}>`);
        } else if (tag === 'pre') {
            document.execCommand('formatBlock', false, '<pre>');
        } else if (tag === 'blockquote') {
            document.execCommand('formatBlock', false, '<blockquote>');
        }
        this.syncHiddenBody();
        this.updateToolbarState();
    },

    setFontName(fontName) {
        if (this.isCodeView || !fontName) return;
        this.focusEditor();
        document.execCommand('fontName', false, fontName);
        this.syncHiddenBody();
    },

    setFontSize(size) {
        if (this.isCodeView || !size) return;
        this.focusEditor();
        document.execCommand('fontSize', false, size);
        this.syncHiddenBody();
    },

    toggleTextColorPalette(e) {
        if (e) e.stopPropagation();
        this.saveSelection();
        const popover = document.getElementById('format-text-color-popover');
        const bgPopover = document.getElementById('format-bg-color-popover');
        if (bgPopover) bgPopover.classList.add('hidden');
        if (popover) popover.classList.toggle('hidden');
    },

    toggleBgColorPalette(e) {
        if (e) e.stopPropagation();
        this.saveSelection();
        const popover = document.getElementById('format-bg-color-popover');
        const textPopover = document.getElementById('format-text-color-popover');
        if (textPopover) textPopover.classList.add('hidden');
        if (popover) popover.classList.toggle('hidden');
    },

    applyTextColor(color) {
        this.restoreSelection();
        this.focusEditor();
        document.execCommand('foreColor', false, color);
        const popover = document.getElementById('format-text-color-popover');
        if (popover) popover.classList.add('hidden');
        const indicator = document.getElementById('text-color-indicator');
        if (indicator) indicator.style.backgroundColor = color;
        this.syncHiddenBody();
    },

    applyBgColor(color) {
        this.restoreSelection();
        this.focusEditor();
        if (color === 'transparent') {
            document.execCommand('removeFormat', false, null);
        } else {
            document.execCommand('hiliteColor', false, color);
        }
        const popover = document.getElementById('format-bg-color-popover');
        if (popover) popover.classList.add('hidden');
        const indicator = document.getElementById('bg-color-indicator');
        if (indicator) indicator.style.backgroundColor = color;
        this.syncHiddenBody();
    },

    openLinkModal() {
        this.saveSelection();
        const linkModal = document.getElementById('modal-insert-link');
        const urlInput = document.getElementById('link-url-input');
        const textInput = document.getElementById('link-text-input');

        if (!linkModal) return;

        let selectedText = '';
        if (window.getSelection) {
            selectedText = window.getSelection().toString();
        }

        if (textInput) textInput.value = selectedText;
        if (urlInput) urlInput.value = 'https://';

        linkModal.classList.remove('hidden');
        if (urlInput) {
            urlInput.focus();
            urlInput.select();
        }
    },

    closeLinkModal() {
        const linkModal = document.getElementById('modal-insert-link');
        if (linkModal) linkModal.classList.add('hidden');
    },

    confirmInsertLink() {
        const urlInput = document.getElementById('link-url-input');
        const textInput = document.getElementById('link-text-input');
        let url = urlInput ? urlInput.value.trim() : '';
        let text = textInput ? textInput.value.trim() : '';

        if (!url || url === 'https://') {
            if (window.UI) UI.showStickyToast('Enlace requerido', 'Debes ingresar una dirección web válida', 'warning');
            return;
        }

        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('mailto:')) {
            url = 'https://' + url;
        }

        this.closeLinkModal();
        this.restoreSelection();
        this.focusEditor();

        if (text && (!window.getSelection || window.getSelection().isCollapsed)) {
            const linkHtml = `<a href="${url}" target="_blank" rel="noopener noreferrer">${this.escapeHTML(text)}</a>`;
            document.execCommand('insertHTML', false, linkHtml);
        } else {
            document.execCommand('createLink', false, url);
        }

        this.syncHiddenBody();
    },

    toggleCodeView() {
        const editor = document.getElementById('compose-editor');
        const codeView = document.getElementById('compose-code-view');
        const btnCode = document.getElementById('btn-format-codeview');
        const toolbarControls = document.querySelectorAll('.format-btn:not(#btn-format-codeview), #format-block-select, #format-font-select');

        if (!editor || !codeView) return;

        this.isCodeView = !this.isCodeView;

        if (this.isCodeView) {
            codeView.value = this.getHTML();
            editor.classList.add('hidden');
            codeView.classList.remove('hidden');
            codeView.focus();
            if (btnCode) btnCode.classList.add('active');
            toolbarControls.forEach(el => el.disabled = true);
        } else {
            editor.innerHTML = codeView.value;
            codeView.classList.add('hidden');
            editor.classList.remove('hidden');
            editor.focus();
            if (btnCode) btnCode.classList.remove('active');
            toolbarControls.forEach(el => el.disabled = false);
            this.syncHiddenBody();
        }
    },

    toggleExpand() {
        const modalContent = document.getElementById('compose-modal-card');
        const iconExpand = document.getElementById('composer-icon-expand');
        const iconCompress = document.getElementById('composer-icon-compress');

        if (!modalContent) return;

        this.isExpanded = !this.isExpanded;
        if (this.isExpanded) {
            modalContent.classList.add('composer-modal-expanded');
            if (iconExpand) iconExpand.classList.add('hidden');
            if (iconCompress) iconCompress.classList.remove('hidden');
        } else {
            modalContent.classList.remove('composer-modal-expanded');
            if (iconExpand) iconExpand.classList.remove('hidden');
            if (iconCompress) iconCompress.classList.add('hidden');
        }
    },

    toggleCc() {
        const ccRow = document.getElementById('compose-cc-row');
        const btnCc = document.getElementById('btn-toggle-cc');
        if (!ccRow) return;

        ccRow.classList.toggle('hidden');
        if (!ccRow.classList.contains('hidden')) {
            const input = document.getElementById('compose-cc');
            if (input) input.focus();
            if (btnCc) btnCc.classList.add('text-indigo-600', 'font-bold');
        } else {
            if (btnCc) btnCc.classList.remove('text-indigo-600', 'font-bold');
        }
    },

    toggleBcc() {
        const bccRow = document.getElementById('compose-bcc-row');
        const btnBcc = document.getElementById('btn-toggle-bcc');
        if (!bccRow) return;

        bccRow.classList.toggle('hidden');
        if (!bccRow.classList.contains('hidden')) {
            const input = document.getElementById('compose-bcc');
            if (input) input.focus();
            if (btnBcc) btnBcc.classList.add('text-indigo-600', 'font-bold');
        } else {
            if (btnBcc) btnBcc.classList.remove('text-indigo-600', 'font-bold');
        }
    },

    getHTML() {
        if (this.isCodeView) {
            const codeView = document.getElementById('compose-code-view');
            return codeView ? codeView.value : '';
        }
        const editor = document.getElementById('compose-editor');
        if (!editor) return '';
        // Si está vacío o solo contiene etiquetas vacías, retornar vacío
        const text = editor.innerText.trim();
        if (!text && !editor.querySelector('img, hr, table')) {
            return '';
        }
        return editor.innerHTML;
    },

    getText() {
        const editor = document.getElementById('compose-editor');
        return editor ? editor.innerText.trim() : '';
    },

    setHTML(html) {
        const editor = document.getElementById('compose-editor');
        const codeView = document.getElementById('compose-code-view');
        if (editor) {
            editor.innerHTML = html;
        }
        if (codeView) {
            codeView.value = html;
        }
        this.syncHiddenBody();
    },

    syncHiddenBody() {
        const hiddenBody = document.getElementById('compose-body');
        if (hiddenBody) {
            hiddenBody.value = this.getHTML();
        }
    },

    insertSignature(signatureText) {
        const editor = document.getElementById('compose-editor');
        if (!editor) return;

        // Limpiar firma previa existente en el editor
        const existingSig = editor.querySelector('.mail-signature');
        if (existingSig) {
            existingSig.remove();
        }

        if (!signatureText || !signatureText.trim()) {
            this.syncHiddenBody();
            this.updatePlaceholderState();
            return;
        }

        // Si no hay contenido de texto propio en el editor, asegurar párrafo editable arriba
        const remainingNodes = Array.from(editor.childNodes).filter(n => !n.classList || !n.classList.contains('mail-signature'));
        const hasText = remainingNodes.some(n => (n.textContent || '').trim().length > 0);
        if (!hasText && remainingNodes.length === 0) {
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            editor.appendChild(p);
        }

        // Formatear la firma a HTML si viene como texto plano
        let sigHtml = signatureText;
        if (!signatureText.includes('<p>') && !signatureText.includes('<br>') && !signatureText.includes('<div>')) {
            sigHtml = signatureText.split('\n').map(line => this.escapeHTML(line)).join('<br>');
        }

        const sigWrapper = document.createElement('div');
        sigWrapper.className = 'mail-signature mt-6 pt-3 text-slate-600 dark:text-slate-400 text-xs border-t border-slate-200/60 dark:border-slate-800/80 select-text';
        sigWrapper.setAttribute('contenteditable', 'false');
        sigWrapper.innerHTML = sigHtml;

        editor.appendChild(sigWrapper);
        this.syncHiddenBody();
        this.updatePlaceholderState();
    },

    getTextWithoutSignature(editor) {
        if (!editor) editor = document.getElementById('compose-editor');
        if (!editor) return '';
        let text = '';
        editor.childNodes.forEach(n => {
            if (!n.classList || !n.classList.contains('mail-signature')) {
                text += (n.textContent || '');
            }
        });
        return text.trim();
    },

    updatePlaceholderState() {
        const editor = document.getElementById('compose-editor');
        if (!editor) return;
        const text = this.getTextWithoutSignature(editor);
        if (!text) {
            editor.classList.add('is-empty-body');
        } else {
            editor.classList.remove('is-empty-body');
        }
    },

    clear() {
        const editor = document.getElementById('compose-editor');
        const codeView = document.getElementById('compose-code-view');
        const hiddenBody = document.getElementById('compose-body');
        if (editor) editor.innerHTML = '';
        if (codeView) codeView.value = '';
        if (hiddenBody) hiddenBody.value = '';
        this.isCodeView = false;
        if (editor) editor.classList.remove('hidden');
        if (codeView) codeView.classList.add('hidden');
    },

    updateToolbarState() {
        if (this.isCodeView) return;

        // Comandos de formato básico
        this.setButtonActive('btn-format-bold', document.queryCommandState('bold'));
        this.setButtonActive('btn-format-italic', document.queryCommandState('italic'));
        this.setButtonActive('btn-format-underline', document.queryCommandState('underline'));
        this.setButtonActive('btn-format-strike', document.queryCommandState('strikeThrough'));
        this.setButtonActive('btn-format-ul', document.queryCommandState('insertUnorderedList'));
        this.setButtonActive('btn-format-ol', document.queryCommandState('insertOrderedList'));
        this.setButtonActive('btn-format-align-left', document.queryCommandState('justifyLeft'));
        this.setButtonActive('btn-format-align-center', document.queryCommandState('justifyCenter'));
        this.setButtonActive('btn-format-align-right', document.queryCommandState('justifyRight'));
        this.setButtonActive('btn-format-align-justify', document.queryCommandState('justifyFull'));
    },

    setButtonActive(btnId, isActive) {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        if (isActive) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    },

    escapeHTML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    toggleAIPanel(forceState = null) {
        const panel = document.getElementById('composer-ai-inline-panel');
        if (!panel) return;

        const isCurrentlyHidden = panel.classList.contains('hidden');
        const show = forceState !== null ? forceState : isCurrentlyHidden;

        if (show) {
            panel.classList.remove('hidden');
            const promptInput = document.getElementById('composer-ai-prompt');
            if (promptInput) {
                setTimeout(() => promptInput.focus(), 50);
            }
        } else {
            panel.classList.add('hidden');
        }
    },

    async generateWithAI() {
        const promptInput = document.getElementById('composer-ai-prompt');
        const toneSelect = document.getElementById('composer-ai-tone');
        const btnGenerate = document.getElementById('btn-composer-ai-generate');

        if (!promptInput) return;
        const promptText = promptInput.value.trim();
        const tone = toneSelect ? toneSelect.value : 'formal';

        if (!promptText) {
            if (window.UI) UI.showStickyToast('Instrucción requerida', 'Escribe lo que deseas que redacte Gemini', 'warning');
            promptInput.focus();
            return;
        }

        const originalBtnHTML = btnGenerate ? btnGenerate.innerHTML : '';
        if (btnGenerate) {
            btnGenerate.disabled = true;
            btnGenerate.innerHTML = `<svg class="animate-spin -ml-1 mr-1.5 h-3.5 w-3.5 text-white inline" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> <span>Redactando...</span>`;
        }

        try {
            let recipientContext = '';
            if (window.EmailManager && EmailManager.currentOpenedEmail) {
                const cur = EmailManager.currentOpenedEmail;
                recipientContext = `Correo actual de referencia: De: ${cur.sender}, Asunto: ${cur.subject}, Contenido: ${cur.snippet || ''}`;
            }

            const res = await fetch('/api/ai/draft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: promptText,
                    tone: tone,
                    language: 'es',
                    recipient_context: recipientContext,
                    current_draft: this.getText()
                })
            });

            const data = await res.json();
            if (data.success && data.data) {
                // Rellenar asunto si está vacío
                const subjectInput = document.getElementById('compose-subject');
                if (subjectInput && (!subjectInput.value.trim() || subjectInput.value === 'Asunto del correo...')) {
                    subjectInput.value = data.data.subject || '';
                }

                // Convertir párrafos a HTML estructurado
                const paragraphs = (data.data.body || '')
                    .split('\n\n')
                    .map(p => `<p>${this.escapeHTML(p).replace(/\n/g, '<br>')}</p>`)
                    .join('');

                this.setHTML(paragraphs);

                // Re-aplicar la firma por defecto de la cuenta actual
                const accSelect = document.getElementById('compose-account-select');
                if (accSelect && window.SignatureManager) {
                    SignatureManager.applyDefaultSignatureForAccount(parseInt(accSelect.value));
                }

                // Ocultar panel tras generar
                this.toggleAIPanel(false);

                if (window.UI) {
                    UI.showStickyToast('Borrador Listo', 'Borrador generado en el espacio de redacción. Puedes modificarlo libremente.', 'success');
                }
                this.focus();
            } else {
                if (window.UI) UI.showStickyToast('Error de Generación', data.detail || 'Verifica tu conexión o API Key', 'error');
            }
        } catch (e) {
            if (window.UI) UI.showStickyToast('Error', e.message, 'error');
        } finally {
            if (btnGenerate) {
                btnGenerate.disabled = false;
                btnGenerate.innerHTML = originalBtnHTML;
            }
        }
    },

    attachments: [],

    openAttachmentPicker() {
        const fileInput = document.getElementById('compose-attachments-input');
        if (fileInput) fileInput.click();
    },

    async handleFileInput(files) {
        if (!files || files.length === 0) return;
        for (const file of Array.from(files)) {
            if (file.size > 20 * 1024 * 1024) {
                if (window.UI) UI.showStickyToast('Archivo muy grande', `El archivo ${file.name} supera el límite de 20MB`, 'warning');
                continue;
            }
            try {
                const base64 = await this.readFileAsBase64(file);
                this.attachments.push({
                    file: file,
                    filename: file.name,
                    size: file.size,
                    content_type: file.type || 'application/octet-stream',
                    data_base64: base64
                });
            } catch (err) {
                console.error(err);
            }
        }
        this.renderAttachments();
        const fileInput = document.getElementById('compose-attachments-input');
        if (fileInput) fileInput.value = '';
    },

    readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    removeAttachment(index) {
        this.attachments.splice(index, 1);
        this.renderAttachments();
    },

    clearAttachments() {
        this.attachments = [];
        this.renderAttachments();
        const fileInput = document.getElementById('compose-attachments-input');
        if (fileInput) fileInput.value = '';
    },

    renderAttachments() {
        const container = document.getElementById('compose-attachments-container');
        const list = document.getElementById('compose-attachments-list');
        const totalSizeEl = document.getElementById('compose-attachments-total-size');
        if (!container || !list) return;

        if (this.attachments.length === 0) {
            container.classList.add('hidden');
            list.innerHTML = '';
            if (totalSizeEl) totalSizeEl.textContent = '';
            return;
        }

        container.classList.remove('hidden');
        let totalBytes = 0;

        list.innerHTML = this.attachments.map((att, idx) => {
            totalBytes += att.size || 0;
            return `
                <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs text-xs text-slate-700 dark:text-slate-200 select-none">
                    <svg class="w-3.5 h-3.5 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    <span class="max-w-[140px] sm:max-w-[200px] truncate font-medium" title="${Composer.escapeHTML(att.filename)}">${Composer.escapeHTML(att.filename)}</span>
                    <span class="text-[10px] text-slate-400">(${this.formatFileSize(att.size)})</span>
                    <button type="button" onclick="Composer.removeAttachment(${idx})" class="p-0.5 text-slate-400 hover:text-rose-500 rounded transition-colors ml-0.5" title="Eliminar adjunto">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>
            `;
        }).join('');

        if (totalSizeEl) {
            totalSizeEl.textContent = `Total: ${this.formatFileSize(totalBytes)}`;
        }
    },

    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },

    discard() {
        this.clear();
        this.clearAttachments();
        const toInput = document.getElementById('compose-to');
        const subjectInput = document.getElementById('compose-subject');
        const ccInput = document.getElementById('compose-cc');
        const bccInput = document.getElementById('compose-bcc');
        if (toInput) toInput.value = '';
        if (subjectInput) subjectInput.value = '';
        if (ccInput) ccInput.value = '';
        if (bccInput) bccInput.value = '';
        const modal = document.getElementById('compose-modal');
        if (modal) modal.classList.add('hidden');
        if (window.UI) {
            UI.showStickyToast('Borrador eliminado', 'El área de redacción se ha dejado completamente en blanco', 'info', 2000);
        }
    }
};

window.Composer = Composer;

// ========================================================
// Gestor de Respuesta en Línea (Inline Quick Reply)
// Estilo Gmail Integrado en Detalle de Correo
// ========================================================

const InlineReply = {
    isToolbarVisible: false,
    savedSelection: null,

    focus() {
        this.focusTop();
    },

    focusTop() {
        const editor = document.getElementById('inline-reply-editor');
        if (!editor) return;
        if (window.Composer) {
            Composer.setCursorToTop(editor);
        } else {
            editor.focus();
            let firstBlock = editor.firstElementChild;
            if (!firstBlock || firstBlock.classList.contains('mail-signature')) {
                firstBlock = document.createElement('p');
                firstBlock.innerHTML = '<br>';
                editor.insertBefore(firstBlock, editor.firstChild);
            }
            const sel = window.getSelection();
            if (sel) {
                const range = document.createRange();
                range.setStart(firstBlock, 0);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
        this.updatePlaceholderState();
    },

    getTextWithoutSignature(editor) {
        if (!editor) editor = document.getElementById('inline-reply-editor');
        if (!editor) return '';
        let text = '';
        editor.childNodes.forEach(n => {
            if (!n.classList || !n.classList.contains('mail-signature')) {
                text += (n.textContent || '');
            }
        });
        return text.trim();
    },

    updatePlaceholderState() {
        const editor = document.getElementById('inline-reply-editor');
        if (!editor) return;
        const text = this.getTextWithoutSignature(editor);
        if (!text) {
            editor.classList.add('is-empty-body');
        } else {
            editor.classList.remove('is-empty-body');
        }
    },

    saveSelection() {
        if (window.getSelection) {
            const sel = window.getSelection();
            if (sel.getRangeAt && sel.rangeCount) {
                this.savedSelection = sel.getRangeAt(0).cloneRange();
            }
        }
    },

    restoreSelection() {
        if (this.savedSelection && window.getSelection) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(this.savedSelection);
        }
    },

    exec(command, value = null) {
        this.focus();
        document.execCommand(command, false, value);
        this.updateToolbarState();
    },

    formatBlock(tag) {
        this.focus();
        if (tag === 'p') {
            document.execCommand('formatBlock', false, '<p>');
        } else if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
            document.execCommand('formatBlock', false, `<${tag}>`);
        } else if (tag === 'pre') {
            document.execCommand('formatBlock', false, '<pre>');
        } else if (tag === 'blockquote') {
            document.execCommand('formatBlock', false, '<blockquote>');
        }
        this.updateToolbarState();
    },

    toggleToolbar() {
        const toolbar = document.getElementById('inline-reply-toolbar');
        const btnAa = document.getElementById('btn-inline-toggle-formatting');
        if (!toolbar) return;
        this.isToolbarVisible = !this.isToolbarVisible;
        if (this.isToolbarVisible) {
            toolbar.classList.remove('hidden');
            toolbar.classList.add('flex');
            if (btnAa) btnAa.classList.add('bg-slate-200', 'dark:bg-slate-700', 'text-indigo-600', 'dark:text-indigo-400');
        } else {
            toolbar.classList.add('hidden');
            toolbar.classList.remove('flex');
            if (btnAa) btnAa.classList.remove('bg-slate-200', 'dark:bg-slate-700', 'text-indigo-600', 'dark:text-indigo-400');
        }
    },

    toggleTextColorPalette(e) {
        if (e) e.stopPropagation();
        this.saveSelection();
        const popover = document.getElementById('inline-format-text-color-popover');
        const bgPopover = document.getElementById('inline-format-bg-color-popover');
        if (bgPopover) bgPopover.classList.add('hidden');
        if (popover) popover.classList.toggle('hidden');
    },

    toggleBgColorPalette(e) {
        if (e) e.stopPropagation();
        this.saveSelection();
        const popover = document.getElementById('inline-format-bg-color-popover');
        const textPopover = document.getElementById('inline-format-text-color-popover');
        if (textPopover) textPopover.classList.add('hidden');
        if (popover) popover.classList.toggle('hidden');
    },

    applyTextColor(color) {
        this.restoreSelection();
        this.focus();
        document.execCommand('foreColor', false, color);
        const popover = document.getElementById('inline-format-text-color-popover');
        if (popover) popover.classList.add('hidden');
        const indicator = document.getElementById('inline-text-color-indicator');
        if (indicator) indicator.style.backgroundColor = color;
    },

    applyBgColor(color) {
        this.restoreSelection();
        this.focus();
        if (color === 'transparent') {
            document.execCommand('removeFormat', false, null);
        } else {
            document.execCommand('hiliteColor', false, color);
        }
        const popover = document.getElementById('inline-format-bg-color-popover');
        if (popover) popover.classList.add('hidden');
        const indicator = document.getElementById('inline-bg-color-indicator');
        if (indicator) indicator.style.backgroundColor = color;
    },

    openLinkModal() {
        this.saveSelection();
        if (window.Composer) {
            Composer.savedSelection = this.savedSelection;
            Composer.openLinkModal();
        }
    },

    getHTML() {
        const editor = document.getElementById('inline-reply-editor');
        if (!editor) return '';
        const text = editor.innerText.trim();
        if (!text && !editor.querySelector('img, hr, table')) {
            return '';
        }
        return editor.innerHTML;
    },

    getText() {
        const editor = document.getElementById('inline-reply-editor');
        return editor ? editor.innerText.trim() : '';
    },

    setHTML(html) {
        const editor = document.getElementById('inline-reply-editor');
        if (editor) {
            editor.innerHTML = html;
        }
    },

    insertSignature(signatureText) {
        const editor = document.getElementById('inline-reply-editor');
        if (!editor) return;

        const existingSig = editor.querySelector('.mail-signature');
        if (existingSig) existingSig.remove();

        if (!signatureText || !signatureText.trim()) {
            this.updatePlaceholderState();
            return;
        }

        // Si el editor no tiene contenido previo de texto, asegurar bloque editable arriba
        const remainingNodes = Array.from(editor.childNodes).filter(n => !n.classList || !n.classList.contains('mail-signature'));
        const hasText = remainingNodes.some(n => (n.textContent || '').trim().length > 0);
        if (!hasText && remainingNodes.length === 0) {
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            editor.appendChild(p);
        }

        let sigHtml = signatureText;
        if (!signatureText.includes('<p>') && !signatureText.includes('<br>') && !signatureText.includes('<div>')) {
            sigHtml = signatureText.split('\n').map(line => Composer.escapeHTML(line)).join('<br>');
        }

        const sigWrapper = document.createElement('div');
        sigWrapper.className = 'mail-signature mt-4 pt-2 text-slate-500 dark:text-slate-400 text-xs border-t border-slate-200/60 dark:border-slate-800/80 select-text';
        sigWrapper.setAttribute('contenteditable', 'false');
        sigWrapper.innerHTML = sigHtml;

        editor.appendChild(sigWrapper);
        this.updatePlaceholderState();
    },

    attachments: [],

    openAttachmentPicker() {
        const fileInput = document.getElementById('inline-reply-attachments-input');
        if (fileInput) fileInput.click();
    },

    async handleFileInput(files) {
        if (!files || files.length === 0) return;
        for (const file of Array.from(files)) {
            if (file.size > 20 * 1024 * 1024) {
                if (window.UI) UI.showStickyToast('Archivo muy grande', `El archivo ${file.name} supera el límite de 20MB`, 'warning');
                continue;
            }
            try {
                const base64 = await Composer.readFileAsBase64(file);
                this.attachments.push({
                    file: file,
                    filename: file.name,
                    size: file.size,
                    content_type: file.type || 'application/octet-stream',
                    data_base64: base64
                });
            } catch (err) {
                console.error(err);
            }
        }
        this.renderAttachments();
        const fileInput = document.getElementById('inline-reply-attachments-input');
        if (fileInput) fileInput.value = '';
    },

    removeAttachment(index) {
        this.attachments.splice(index, 1);
        this.renderAttachments();
    },

    clearAttachments() {
        this.attachments = [];
        this.renderAttachments();
        const fileInput = document.getElementById('inline-reply-attachments-input');
        if (fileInput) fileInput.value = '';
    },

    renderAttachments() {
        const container = document.getElementById('inline-reply-attachments-container');
        const list = document.getElementById('inline-reply-attachments-list');
        const totalSizeEl = document.getElementById('inline-reply-attachments-total-size');
        if (!container || !list) return;

        if (this.attachments.length === 0) {
            container.classList.add('hidden');
            list.innerHTML = '';
            if (totalSizeEl) totalSizeEl.textContent = '';
            return;
        }

        container.classList.remove('hidden');
        let totalBytes = 0;

        list.innerHTML = this.attachments.map((att, idx) => {
            totalBytes += att.size || 0;
            return `
                <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs text-xs text-slate-700 dark:text-slate-200 select-none">
                    <svg class="w-3.5 h-3.5 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    <span class="max-w-[140px] sm:max-w-[200px] truncate font-medium" title="${Composer.escapeHTML(att.filename)}">${Composer.escapeHTML(att.filename)}</span>
                    <span class="text-[10px] text-slate-400">(${Composer.formatFileSize(att.size)})</span>
                    <button type="button" onclick="InlineReply.removeAttachment(${idx})" class="p-0.5 text-slate-400 hover:text-rose-500 rounded transition-colors ml-0.5" title="Eliminar adjunto">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>
            `;
        }).join('');

        if (totalSizeEl) {
            totalSizeEl.textContent = `Total: ${Composer.formatFileSize(totalBytes)}`;
        }
    },

    async discard() {
        const editor = document.getElementById('inline-reply-editor');
        if (editor) {
            editor.innerHTML = '<p><br></p>';
        }
        this.clearAttachments();
        // Re-aplicar firma por defecto si existe
        if (window.EmailManager && EmailManager.currentOpenedEmail && window.SignatureManager) {
            const defSig = await SignatureManager.getDefaultSignatureForAccount(EmailManager.currentOpenedEmail.account_id);
            if (defSig && defSig.content) {
                this.insertSignature(defSig.content);
            }
        }
        this.focusTop();
        if (window.UI) {
            UI.showStickyToast('Borrador restablecido', 'El área de redacción se ha limpiado y está lista para escribir', 'info', 2000);
        }
    },

    async replyWithAI(emailId) {
        if (!emailId && window.EmailManager && EmailManager.currentOpenedEmail) {
            emailId = EmailManager.currentOpenedEmail.id;
        }
        if (!emailId) return;

        const currentDraft = this.getText();

        if (window.UI) {
            UI.showStickyToast('Gemini IA', 'Generando borrador contextualizado con el correo actual...', 'info', 2500);
        }

        const btnAI = document.querySelector('button[onclick*="InlineReply.replyWithAI"]');
        let originalBtnHtml = '';
        if (btnAI) {
            originalBtnHtml = btnAI.innerHTML;
            btnAI.disabled = true;
            btnAI.innerHTML = `<svg class="animate-spin -ml-0.5 mr-1.5 h-3.5 w-3.5 text-purple-600 dark:text-purple-400 inline" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> <span>Redactando con IA...</span>`;
        }

        try {
            const res = await fetch(`/api/gemini/smart-reply/${emailId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    current_draft: currentDraft,
                    user_instruction: 'Genera una respuesta cordial, completa y profesional que resuelva lo planteado en el correo.',
                    tone: 'formal'
                })
            });
            const data = await res.json();
            if (data && data.draft_reply) {
                const paragraphs = data.draft_reply
                    .split('\n\n')
                    .map(p => `<p>${Composer.escapeHTML(p).replace(/\n/g, '<br>')}</p>`)
                    .join('');

                this.setHTML(paragraphs);
                
                // Re-aplicar firma por defecto si corresponde
                if (window.EmailManager && EmailManager.currentOpenedEmail && window.SignatureManager) {
                    const accId = EmailManager.currentOpenedEmail.account_id;
                    const defaultSig = await SignatureManager.getDefaultSignatureForAccount(accId);
                    if (defaultSig && defaultSig.content) {
                        this.insertSignature(defaultSig.content);
                    }
                }
                if (window.UI) {
                    UI.showStickyToast('Borrador Listo', 'Borrador generado en el espacio de redacción. Puedes modificarlo libremente.', 'success');
                }
                this.focus();
            } else {
                if (window.UI) UI.showStickyToast('Error', data.detail || 'No se pudo generar la respuesta', 'error');
            }
        } catch (e) {
            console.error(e);
            if (window.UI) UI.showStickyToast('Error', e.message, 'error');
        } finally {
            if (btnAI) {
                btnAI.disabled = false;
                btnAI.innerHTML = originalBtnHtml;
            }
        }
    },

    popOutToModal() {
        const email = window.EmailManager ? EmailManager.currentOpenedEmail : null;
        if (!email) return;

        const currentContent = this.getHTML();
        const currentAttachments = [...(this.attachments || [])];
        
        // Abrir modal regular
        if (window.UI) UI.openComposeModal();

        const toInput = document.getElementById('compose-to');
        const subjectInput = document.getElementById('compose-subject');
        const accSelect = document.getElementById('compose-account-select');

        if (toInput) toInput.value = email.sender;
        if (subjectInput) subjectInput.value = email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`;
        if (accSelect) accSelect.value = email.account_id;

        if (currentContent && window.Composer) {
            Composer.setHTML(currentContent);
        }

        if (currentAttachments.length > 0 && window.Composer) {
            Composer.attachments = currentAttachments;
            Composer.renderAttachments();
            this.clearAttachments();
        }

        // Limpiar el inline editor para evitar confusión
        const inlineEditor = document.getElementById('inline-reply-editor');
        if (inlineEditor) inlineEditor.innerHTML = '';
    },

    async send(emailId) {
        const email = window.EmailManager ? EmailManager.currentOpenedEmail : null;
        if (!email) return;

        const bodyHtml = this.getHTML();
        const bodyText = this.getText();
        const sendBtn = document.getElementById('btn-inline-send');

        if (!bodyHtml && !bodyText) {
            if (window.UI) UI.showStickyToast('Mensaje vacío', 'Por favor escribe el contenido de tu respuesta', 'warning');
            return;
        }

        const subject = email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`;
        const toEmail = email.sender;
        const accountId = email.account_id;

        const attachmentsPayload = (this.attachments || []).map(a => ({
            filename: a.filename,
            content_type: a.content_type,
            data_base64: a.data_base64,
            size: a.size
        }));

        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.innerHTML = `
                <svg class="animate-spin w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Enviando...</span>
            `;
        }

        try {
            const res = await fetch('/api/emails/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    account_id: parseInt(accountId),
                    to_email: toEmail,
                    subject: subject,
                    body: bodyHtml,
                    is_html: true,
                    attachments: attachmentsPayload
                })
            });

            const data = await res.json();
            if (data.success) {
                if (window.UI) {
                    UI.showStickyToast('Respuesta Enviada', `Tu respuesta a ${toEmail} ha sido enviada con éxito`, 'success');
                }
                const editor = document.getElementById('inline-reply-editor');
                if (editor) editor.innerHTML = '';
                this.clearAttachments();

                // Si estamos en la vista de enviados, recargar
                if (EmailManager.currentFolder === 'SENT') {
                    EmailManager.loadEmails();
                }
            } else {
                if (window.UI) {
                    UI.showStickyToast('Error al enviar', data.detail || 'Verifica credenciales SMTP o cuotas de envío', 'error');
                }
            }
        } catch (err) {
            if (window.UI) UI.showStickyToast('Error', err.message, 'error');
        } finally {
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.innerHTML = `
                    <span>Enviar</span>
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                `;
            }
        }
    },

    updateToolbarState() {
        const setBtn = (id, active) => {
            const b = document.getElementById(id);
            if (b) active ? b.classList.add('active') : b.classList.remove('active');
        };
        setBtn('btn-inline-bold', document.queryCommandState('bold'));
        setBtn('btn-inline-italic', document.queryCommandState('italic'));
        setBtn('btn-inline-underline', document.queryCommandState('underline'));
        setBtn('btn-inline-strike', document.queryCommandState('strikeThrough'));
        setBtn('btn-inline-ul', document.queryCommandState('insertUnorderedList'));
        setBtn('btn-inline-ol', document.queryCommandState('insertOrderedList'));
        setBtn('btn-inline-align-left', document.queryCommandState('justifyLeft'));
        setBtn('btn-inline-align-center', document.queryCommandState('justifyCenter'));
        setBtn('btn-inline-align-right', document.queryCommandState('justifyRight'));
    }
};

window.InlineReply = InlineReply;
