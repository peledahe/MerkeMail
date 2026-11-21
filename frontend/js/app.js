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

    // Estado inicial de seguridad para IA (oculto y rojo hasta verificar conexión)
    if (window.GeminiAI) {
        GeminiAI.applyAIStatusUI();
    }

    // Inicializar Detección de Modo Desktop / Controles de Ventana
    if (window.DesktopBridge) {
        DesktopBridge.init();
    }

    // Inicializar Event Listeners de inmediato para máxima capacidad de respuesta
    setupEventListeners();

    // 1. Prioridad máxima: cargar correos, cuentas y etiquetas en paralelo para mostrar la bandeja al instante
    await Promise.allSettled([
        EmailManager.loadEmails(),
        EmailManager.loadAccounts(),
        EmailManager.loadLabels()
    ]);

    try { if (window.AntigravityCopilot) AntigravityCopilot.initResizer(); } catch (e) { console.warn("Fallo resizer Elio:", e); }
    try { EmailManager.initAutoSyncScheduler(); } catch (e) { console.warn("Fallo scheduler:", e); }

    // 2. Inicializar módulos secundarios en segundo plano sin bloquear la interfaz principal
    Promise.allSettled([
        (async () => { try { await GeminiAI.initSettings(); } catch (e) { console.warn("Fallo cargando IA:", e); } })(),
        (async () => { try { await CalendarManager.init(); } catch (e) { console.warn("Fallo cargando calendario:", e); } })(),
        (async () => { try { await SignatureManager.init(); } catch (e) { console.warn("Fallo cargando firmas:", e); } })(),
        (async () => { try { if (window.ContactsManager) await ContactsManager.init(); } catch (e) { console.warn("Fallo cargando contactos:", e); } })(),
        (async () => { try { if (window.UserProfileAI) await UserProfileAI.init(); } catch (e) { console.warn("Fallo cargando perfil usuario:", e); } })()
    ]);
});

function setupEventListeners() {
    // Reevaluar ubicación de etiquetas de correo al redimensionar ventana
    window.addEventListener('resize', () => {
        if (window.EmailManager && typeof EmailManager.setupLabelsResponsivePlacement === 'function') {
            EmailManager.setupLabelsResponsivePlacement();
        }
    });

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

    // Buscador en vivo con invocación inteligente a @elio
    const searchInput = document.getElementById('main-search-input');
    const clearSearchBtn = document.getElementById('btn-clear-search');
    const btnSubmitToElio = document.getElementById('btn-submit-to-elio');

    // Despacho global para abrir asistente Elio y trasladar pregunta
    window.dispatchSearchToElio = function() {
        const input = document.getElementById('main-search-input');
        if (!input) return;
        const rawVal = input.value.trim();

        if (rawVal.toLowerCase().includes('@elio')) {
            // Extraer la pregunta retirando el comando @elio
            const elioPrompt = rawVal.replace(/@elio\s*/gi, '').trim();

            // Limpiar buscador y estado visual
            input.value = '';
            if (clearSearchBtn) clearSearchBtn.classList.add('hidden');
            if (btnSubmitToElio) {
                btnSubmitToElio.classList.add('hidden');
                btnSubmitToElio.classList.remove('flex');
            }

            // Si la bandeja estaba filtrada por búsqueda anterior, restaurarla inmediatamente
            if (window.EmailManager && EmailManager.searchQuery) {
                EmailManager.searchQuery = '';
                EmailManager.currentPage = 1;
                EmailManager.clearSelection();
                EmailManager.loadEmails();
            }

            // Abrir ventana modal / lateral de Elio
            UI.openDrawer('drawer-antigravity-copilot');

            // Trasladar la pregunta al chat de Elio
            if (elioPrompt) {
                if (window.AntigravityCopilot) {
                    window.AntigravityCopilot.sendMessage(elioPrompt);
                }
            } else {
                setTimeout(() => {
                    document.getElementById('antigravity-chat-input')?.focus();
                }, 200);
            }
        } else if (rawVal && window.EmailManager) {
            // Búsqueda normal si no tiene @elio
            EmailManager.searchQuery = rawVal;
            EmailManager.currentPage = 1;
            EmailManager.clearSelection();
            EmailManager.loadEmails();
        }
    };

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
            const val = e.target.value.trim();
            const lowerVal = val.toLowerCase();

            // Si el texto incluye @elio, es una entrada para el asistente Elio (NO una búsqueda de correos)
            if (lowerVal.includes('@elio')) {
                clearTimeout(debounceTimer);
                if (btnSubmitToElio) {
                    btnSubmitToElio.classList.remove('hidden');
                    btnSubmitToElio.classList.add('flex');
                }

                // Si por tipeo rápido previo se había seteado una búsqueda, restaurar la bandeja
                if (window.EmailManager && EmailManager.searchQuery) {
                    EmailManager.searchQuery = '';
                    EmailManager.currentPage = 1;
                    EmailManager.clearSelection();
                    EmailManager.loadEmails();
                }
                return;
            } else {
                if (btnSubmitToElio) {
                    btnSubmitToElio.classList.add('hidden');
                    btnSubmitToElio.classList.remove('flex');
                }
            }

            // Si empieza con @ pero aún no completa @elio, no filtrar la bandeja todavía
            if (lowerVal.startsWith('@')) {
                clearTimeout(debounceTimer);
                return;
            }

            // Búsqueda estándar de correos con debounce
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                EmailManager.searchQuery = val;
                EmailManager.currentPage = 1;
                EmailManager.clearSelection();
                EmailManager.loadEmails();
            }, 300);
        });

        // Manejo de teclas: Enter para invocar @elio o buscar, Escape para limpiar
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && searchInput.value) {
                EmailManager.clearMainSearch();
            } else if (e.key === 'Enter') {
                const val = searchInput.value.trim();
                if (val.toLowerCase().includes('@elio')) {
                    e.preventDefault();
                    window.dispatchSearchToElio();
                }
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

        const moveDrop = document.getElementById('universal-move-dropdown');
        if (moveDrop && !moveDrop.classList.contains('hidden')) {
            const isInsideBtn = e.target.closest('#btn-batch-move, #btn-detail-move, #batch-more-item-move, .email-checkbox, #split-select-all, #select-all-checkbox, .select-checkbox-cell');
            if (!moveDrop.contains(e.target) && !isInsideBtn) {
                if (window.EmailManager) EmailManager.closeMoveMenu();
            }
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
            EmailManager.activeFilterLabelIds = null;
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

    // Cerrar modales con Tecla Escape y atajos globales de teclado
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const printModal = document.getElementById('print-preview-modal');
            if (printModal) {
                printModal.remove();
                return;
            }
            UI.closeAllDrawers();
            document.querySelectorAll('.fixed-modal').forEach(m => m.classList.add('hidden'));
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
            // Atajo Ctrl+P / Cmd+P para imprimir el correo actualmente abierto con vista previa Chrome
            if (window.EmailManager && EmailManager.currentOpenedEmail) {
                e.preventDefault();
                EmailManager.openPrintPreview();
            }
        }
    });
}
