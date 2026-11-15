// Script Principal de Coordinación - MerkeMail

document.addEventListener('DOMContentLoaded', async () => {
    // Inicializar Tema Claro / Oscuro
    UI.initTheme();

    // Inicializar Barra Lateral (Redimensionador & Estado Colapsado)
    UI.initSidebar();

    // Inicializar Redimensionador de Lista de Correos
    UI.initEmailListResizer();

    // Inicializar Soporte PWA (Progressive Web App)
    UI.initPWA();

    // Inicializar Editor Enriquecido HTML de Correo (Composer)
    if (window.Composer) {
        Composer.init();
    }

    // Inicializar Módulos
    await EmailManager.loadAccounts();
    await EmailManager.loadLabels();
    await EmailManager.loadEmails();
    await CalendarManager.init();
    await GeminiAI.initSettings();
    await SignatureManager.init();
    EmailManager.initAutoSyncScheduler();

    // Inicializar Event Listeners
    setupEventListeners();
});

function setupEventListeners() {
    // Alternador de Vista Principal (Correos vs Calendario)
    const btnNavMail = document.getElementById('nav-item-mail');
    const btnNavCalendar = document.getElementById('nav-item-calendar');
    const sectionMail = document.getElementById('main-mail-section');
    const sectionCalendar = document.getElementById('main-calendar-section');

    if (btnNavMail && btnNavCalendar) {
        btnNavMail.addEventListener('click', () => {
            sectionMail.classList.remove('hidden');
            sectionCalendar.classList.add('hidden');
            document.querySelectorAll('.folder-nav-btn').forEach(b => b.classList.remove('active-folder', 'bg-indigo-50', 'dark:bg-indigo-950/70', 'text-indigo-600', 'dark:text-indigo-400', 'font-bold'));
            btnNavMail.classList.add('active-folder', 'bg-indigo-50', 'dark:bg-indigo-950/70', 'text-indigo-600', 'dark:text-indigo-400', 'font-bold');
            btnNavCalendar.classList.remove('bg-indigo-50', 'dark:bg-indigo-950/60', 'text-indigo-600', 'dark:text-indigo-400', 'font-bold');
            if (window.innerWidth < 768 && window.UI) UI.closeMobileSidebar();
            EmailManager.currentFolder = 'INBOX';
            EmailManager.currentLabelId = null;
            EmailManager.clearSelection();
            EmailManager.renderLabels();
            EmailManager.backToList();
            EmailManager.loadEmails();
        });

        btnNavCalendar.addEventListener('click', () => {
            if (window.innerWidth < 768 && window.UI) UI.closeMobileSidebar();
            sectionMail.classList.add('hidden');
            sectionCalendar.classList.remove('hidden');
            btnNavCalendar.classList.add('bg-indigo-50', 'dark:bg-indigo-950/60', 'text-indigo-600', 'dark:text-indigo-400', 'font-bold');
            document.querySelectorAll('.folder-nav-btn').forEach(b => b.classList.remove('active-folder', 'bg-indigo-50', 'dark:bg-indigo-950/70', 'text-indigo-600', 'dark:text-indigo-400', 'font-bold'));
            EmailManager.currentLabelId = null;
            EmailManager.clearSelection();
            EmailManager.renderLabels();
            CalendarManager.renderCalendar();
        });
    }

    // Buscador en vivo
    const searchInput = document.getElementById('main-search-input');
    const clearSearchBtn = document.getElementById('btn-clear-search');
    if (searchInput) {
        let debounceTimer;
        const updateClearButtonVisibility = () => {
            if (clearSearchBtn) {
                if (searchInput.value.trim().length > 0) {
                    clearSearchBtn.classList.remove('hidden');
                } else {
                    clearSearchBtn.classList.add('hidden');
                }
            }
        };

        searchInput.addEventListener('input', (e) => {
            updateClearButtonVisibility();
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                EmailManager.searchQuery = e.target.value.trim();
                EmailManager.currentPage = 1;
                EmailManager.clearSelection();
                EmailManager.loadEmails();
            }, 300);
        });

        // Al presionar Escape, también limpiar búsqueda rápidamente
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && searchInput.value) {
                EmailManager.clearMainSearch();
            }
        });
    }

    // Cerrar dropdowns flotantes al hacer clic fuera
    document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('sidebar-account-dropdown-wrapper');
        if (wrapper && !wrapper.contains(e.target)) {
            EmailManager.closeAccountDropdown();
        }

        const batchMoreWrapper = document.getElementById('batch-more-wrapper');
        if (batchMoreWrapper && !batchMoreWrapper.contains(e.target)) {
            EmailManager.closeBatchMoreMenu();
        }

        const batchLabelsWrapper = document.getElementById('batch-labels-wrapper');
        if (batchLabelsWrapper && !batchLabelsWrapper.contains(e.target)) {
            const drop = document.getElementById('batch-labels-dropdown');
            if (drop) drop.classList.add('hidden');
        }
    });

    // Paginación
    const prevBtn = document.getElementById('table-prev-btn');
    const nextBtn = document.getElementById('table-next-btn');
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (EmailManager.currentPage > 1) {
                EmailManager.currentPage--;
                EmailManager.clearSelection();
                EmailManager.loadEmails();
            }
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (EmailManager.currentPage < EmailManager.totalPages) {
                EmailManager.currentPage++;
                EmailManager.clearSelection();
                EmailManager.loadEmails();
            }
        });
    }

    // Checkbox seleccionar todos en lista split
    const selectAllCheckbox = document.getElementById('split-select-all');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const checked = e.target.checked;
            if (checked) {
                EmailManager.emails.forEach(email => EmailManager.selectedBatchIds.add(email.id));
            } else {
                EmailManager.selectedBatchIds.clear();
            }
            EmailManager.updateBatchSelectionUI();
        });
    }

    // Navegación por carpetas
    document.querySelectorAll('.folder-nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Asegurar que la vista de correos esté activa y el calendario oculto
            sectionMail.classList.remove('hidden');
            sectionCalendar.classList.add('hidden');
            if (btnNavCalendar) {
                btnNavCalendar.classList.remove('bg-indigo-50', 'dark:bg-indigo-950/60', 'text-indigo-600', 'dark:text-indigo-400', 'font-bold');
            }

            document.querySelectorAll('.folder-nav-btn').forEach(b => {
                b.classList.remove('active-folder', 'bg-indigo-50', 'dark:bg-indigo-950/70', 'text-indigo-600', 'dark:text-indigo-400', 'font-bold');
                b.classList.add('text-slate-700', 'dark:text-slate-300');
            });

            const target = e.currentTarget;
            target.classList.add('active-folder', 'bg-indigo-50', 'dark:bg-indigo-950/70', 'text-indigo-600', 'dark:text-indigo-400', 'font-bold');
            target.classList.remove('text-slate-700', 'dark:text-slate-300');
            
            const folder = target.getAttribute('data-folder');
            EmailManager.clearAdvancedFiltersState();
            EmailManager.currentFolder = folder;
            EmailManager.currentLabelId = null;
            EmailManager.currentPage = 1;
            EmailManager.clearSelection();
            EmailManager.renderLabels();
            
            const titleEl = document.getElementById('current-folder-title');
            if (titleEl) {
                titleEl.textContent = target.querySelector('span span')?.textContent || folder;
            }

            if (window.innerWidth < 768 && window.UI) {
                UI.closeMobileSidebar();
            }

            EmailManager.backToList();
            EmailManager.loadEmails();
        });
    });

    // Formulario de Envío de Correo
    const composeForm = document.getElementById('compose-form');
    if (composeForm) {
        composeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const accountId = document.getElementById('compose-account-select').value;
            const toEmail = document.getElementById('compose-to').value.trim();
            const ccInput = document.getElementById('compose-cc');
            const bccInput = document.getElementById('compose-bcc');
            const ccEmail = ccInput ? ccInput.value.trim() : '';
            const bccEmail = bccInput ? bccInput.value.trim() : '';
            const subject = document.getElementById('compose-subject').value.trim();
            
            // Obtener el cuerpo formateado en HTML desde el Composer
            const bodyHtml = window.Composer ? Composer.getHTML() : document.getElementById('compose-body').value.trim();
            const bodyText = window.Composer ? Composer.getText() : bodyHtml;
            const sendBtn = document.getElementById('compose-send-btn');

            if (!toEmail || !subject) {
                UI.showStickyToast('Campos requeridos', 'Destinatario y asunto son obligatorios', 'warning');
                return;
            }

            if (!bodyHtml && !bodyText) {
                UI.showStickyToast('Mensaje vacío', 'Por favor escribe el contenido de tu correo', 'warning');
                return;
            }

            sendBtn.disabled = true;
            sendBtn.innerHTML = `
                <svg class="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Enviando...</span>
            `;

            try {
                const attachmentsPayload = (window.Composer && Composer.attachments) ? Composer.attachments.map(a => ({
                    filename: a.filename,
                    content_type: a.content_type,
                    data_base64: a.data_base64,
                    size: a.size
                })) : [];

                const res = await fetch('/api/emails/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        account_id: parseInt(accountId),
                        to_email: toEmail,
                        cc: ccEmail || null,
                        bcc: bccEmail || null,
                        subject: subject,
                        body: bodyHtml,
                        is_html: true,
                        attachments: attachmentsPayload
                    })
                });

                const data = await res.json();
                if (data.success) {
                    UI.showStickyToast('Correo Enviado', `Tu mensaje a ${toEmail} ha sido enviado con éxito`, 'success');
                    document.getElementById('compose-modal').classList.add('hidden');
                    composeForm.reset();
                    if (window.Composer) {
                        Composer.clear();
                        Composer.clearAttachments();
                    }
                    const ccRow = document.getElementById('compose-cc-row');
                    const bccRow = document.getElementById('compose-bcc-row');
                    if (ccRow) ccRow.classList.add('hidden');
                    if (bccRow) bccRow.classList.add('hidden');
                    
                    if (EmailManager.currentFolder === 'SENT') {
                        EmailManager.loadEmails();
                    }
                } else {
                    UI.showStickyToast('Error al enviar', data.detail || 'Verifica credenciales SMTP o cuotas de envío', 'error');
                }
            } catch (err) {
                UI.showStickyToast('Error', err.message, 'error');
            } finally {
                sendBtn.disabled = false;
                sendBtn.innerHTML = `
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                    <span>Enviar Correo</span>
                `;
            }
        });
    }

    // Modal de Conexión de Cuentas (Presets automáticos para Gmail y Proton)
    const providerSelect = document.getElementById('new-account-provider');
    if (providerSelect) {
        providerSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            const imapHost = document.getElementById('new-account-imap-host');
            const imapPort = document.getElementById('new-account-imap-port');
            const smtpHost = document.getElementById('new-account-smtp-host');
            const smtpPort = document.getElementById('new-account-smtp-port');
            const helpBox = document.getElementById('account-preset-help');

            if (val === 'gmail') {
                imapHost.value = 'imap.gmail.com';
                imapPort.value = '993';
                smtpHost.value = 'smtp.gmail.com';
                smtpPort.value = '587';
                helpBox.innerHTML = '<span class="font-medium text-amber-500">Nota Gmail:</span> Utiliza una <strong>Contraseña de Aplicación</strong> de 16 caracteres de tu cuenta de Google (Seguridad > Verificación en dos pasos > Contraseñas de aplicaciones).';
            } else if (val === 'proton') {
                imapHost.value = '127.0.0.1';
                imapPort.value = '1143';
                smtpHost.value = '127.0.0.1';
                smtpPort.value = '1025';
                helpBox.innerHTML = '<span class="font-medium text-purple-400">Nota Proton:</span> Requiere tener abierto <strong>Proton Mail Bridge</strong> en tu equipo. Copia los datos de usuario y contraseña generados en la app del Bridge.';
            } else {
                imapHost.value = '';
                imapPort.value = '993';
                smtpHost.value = '';
                smtpPort.value = '587';
                helpBox.textContent = 'Configura los servidores IMAP y SMTP correspondientes a tu dominio.';
            }
        });
    }

    // Sincronización automática del usuario IMAP/SMTP al escribir la dirección de correo
    const accountEmailInput = document.getElementById('new-account-email');
    const accountUserInput = document.getElementById('new-account-user');
    if (accountEmailInput && accountUserInput) {
        accountEmailInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (!accountUserInput.dataset.manuallyEdited || !accountUserInput.value || (accountUserInput.value.includes('@gmail.com') && !val.includes('@gmail.com'))) {
                accountUserInput.value = val;
            }
        });
        accountUserInput.addEventListener('input', () => {
            accountUserInput.dataset.manuallyEdited = "true";
        });
    }

    // Guardar o Actualizar Cuenta
    const newAccountForm = document.getElementById('new-account-form');
    if (newAccountForm) {
        newAccountForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const accountId = document.getElementById('new-account-id').value;
            const name = document.getElementById('new-account-name').value;
            const email = document.getElementById('new-account-email').value;
            const provider = document.getElementById('new-account-provider').value;
            const imapHost = document.getElementById('new-account-imap-host').value;
            const imapPort = parseInt(document.getElementById('new-account-imap-port').value);
            const user = document.getElementById('new-account-user').value.trim() || email.trim();
            const pass = document.getElementById('new-account-pass').value;
            const smtpHost = document.getElementById('new-account-smtp-host').value;
            const smtpPort = parseInt(document.getElementById('new-account-smtp-port').value);
            const color = document.getElementById('new-account-color').value || '#3b82f6';
            const syncIntervalEl = document.getElementById('new-account-sync-interval');
            const syncIntervalVal = syncIntervalEl ? parseInt(syncIntervalEl.value) : 5;

            const payload = {
                name, email, provider,
                imap_host: imapHost, imap_port: imapPort, imap_ssl: 1,
                imap_user: user,
                smtp_host: smtpHost, smtp_port: smtpPort, smtp_ssl: 1,
                color,
                sync_interval: isNaN(syncIntervalVal) ? 5 : syncIntervalVal
            };

            if (pass && pass.trim()) {
                payload.imap_password = pass;
            } else if (!accountId) {
                UI.showStickyToast('Contraseña requerida', 'Por favor ingresa la contraseña para crear la cuenta', 'warning');
                return;
            }

            try {
                const url = accountId ? `/api/accounts/${accountId}` : '/api/accounts';
                const method = accountId ? 'PUT' : 'POST';

                const res = await fetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (data.success) {
                    const msg = accountId ? `La cuenta ${email} fue actualizada` : `La cuenta ${email} fue conectada`;
                    UI.showStickyToast('Guardado Exitoso', msg, 'success');
                    document.getElementById('modal-new-account').classList.add('hidden');
                    newAccountForm.reset();
                    await EmailManager.loadAccounts();
                    await EmailManager.loadEmails();
                } else {
                    UI.showStickyToast('Error', data.detail || 'No se pudo guardar la cuenta', 'error');
                }
            } catch (err) {
                UI.showStickyToast('Error', err.message, 'error');
            }
        });
    }

    // Escuchar evento de Google OAuth Popup
    window.addEventListener('message', async (e) => {
        if (e.data && e.data.type === 'GOOGLE_AUTH_SUCCESS') {
            UI.showStickyToast('¡Google Conectado!', `Cuenta ${e.data.email} autorizada con éxito`, 'success');
            await EmailManager.loadAccounts();
            await EmailManager.loadEmails();
            UI.closeDrawer('drawer-accounts');
        }
    });

    // Cerrar dropdowns de acciones por lote al hacer clic fuera
    document.addEventListener('click', (e) => {
        const selectCriteriaDrop = document.getElementById('select-criteria-dropdown');
        if (selectCriteriaDrop && !selectCriteriaDrop.contains(e.target) && !e.target.closest('button[title="Opciones de selección"]')) {
            selectCriteriaDrop.classList.add('hidden');
        }
        const batchLabelsDrop = document.getElementById('batch-labels-dropdown');
        if (batchLabelsDrop && !batchLabelsDrop.contains(e.target) && !e.target.closest('button[title="Etiquetas"]')) {
            batchLabelsDrop.classList.add('hidden');
        }
        const batchMoreDrop = document.getElementById('batch-more-dropdown');
        if (batchMoreDrop && !batchMoreDrop.contains(e.target) && !e.target.closest('button[title="Más opciones"]')) {
            batchMoreDrop.classList.add('hidden');
        }
    });

    // Cerrar modales con Tecla Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            UI.closeAllDrawers();
            document.querySelectorAll('.fixed-modal').forEach(m => m.classList.add('hidden'));
        }
    });
}
