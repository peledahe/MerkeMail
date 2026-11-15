// Módulo del Asistente Inteligente Elio (Copiloto Autónomo) - MerkeMail

const AntigravityCopilot = {
    async sendMessage(textPrompt = null) {
        const input = document.getElementById('antigravity-chat-input');
        const container = document.getElementById('antigravity-messages-container');
        
        let message = '';
        if (typeof textPrompt === 'string' && textPrompt.trim()) {
            message = textPrompt.trim();
        } else if (input) {
            message = input.value.trim();
            input.value = '';
        }

        if (!message) return;

        // Añadir mensaje del usuario a la vista
        this.appendMessage('user', message);

        // Indicador de "Escribiendo..." con el avatar de Elio
        const loadingId = 'loading-' + Date.now();
        const loadingEl = document.createElement('div');
        loadingEl.id = loadingId;
        loadingEl.className = 'flex items-start gap-2.5';
        loadingEl.innerHTML = `
            <img src="/img/bot.png" alt="Elio" class="w-6 h-6 rounded-full object-cover shrink-0 shadow-xs ring-1 ring-indigo-400/40">
            <div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl text-xs text-slate-500 flex items-center gap-1.5 border border-slate-200 dark:border-slate-700/60">
                <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce"></span>
                <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style="animation-delay: 0.15s"></span>
                <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style="animation-delay: 0.3s"></span>
                <span class="ml-1 text-[11px] text-slate-600 dark:text-slate-300">Elio procesando respuesta...</span>
            </div>
        `;
        container.appendChild(loadingEl);
        container.scrollTop = container.scrollHeight;

        this.lastMessage = message;

        try {
            const res = await fetch('/api/agent/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });

            document.getElementById(loadingId)?.remove();

            if (!res.ok) {
                this.appendErrorCard('No pude comunicarme con Elio en este momento. Parece que el servidor está ocupado o reiniciándose.');
                return;
            }

            const data = await res.json();

            if (data.success) {
                this.appendMessage('agent', data.response);
                // Si agendó algo o modificó, refrescar calendarios o emails
                if (data.response && (data.response.includes('agendado') || data.response.includes('evento'))) {
                    if (window.CalendarManager) CalendarManager.loadEvents();
                    UI.showStickyToast('Elio', 'Acción de calendario ejecutada exitosamente', 'success');
                }
            } else {
                this.appendErrorCard(data.response || 'No se pudo procesar tu solicitud con Elio en este instante.');
            }
        } catch (e) {
            document.getElementById(loadingId)?.remove();
            this.appendErrorCard('No logré conectar con el servidor local. Por favor verifica que el backend esté activo y presiona reintentar.');
        }
    },

    retryLastMessage() {
        if (!this.lastMessage) return;
        const msg = this.lastMessage;
        this.sendMessage(msg);
    },

    appendErrorCard(humanMessage) {
        const container = document.getElementById('antigravity-messages-container');
        if (!container) return;

        const msgEl = document.createElement('div');
        msgEl.className = 'flex items-start gap-2.5 w-full min-w-0';
        msgEl.innerHTML = `
            <img src="/img/bot.png" alt="Elio" class="w-6 h-6 rounded-full object-cover shrink-0 shadow-xs ring-1 ring-rose-400/40">
            <div class="p-3.5 bg-slate-50 dark:bg-slate-850 rounded-2xl rounded-tl-xs text-xs flex-1 min-w-0 max-w-full border border-rose-200 dark:border-rose-900/60 shadow-xs flex flex-col items-center text-center break-words overflow-hidden">
                <img src="${window.UI?.ERROR_GIF_DATA_URI || '/img/error.gif'}" onerror="this.src='/img/error.gif'" alt="Error de conexión" class="w-20 h-20 object-contain mb-2 pointer-events-none drop-shadow-xs">
                <p class="font-bold text-slate-800 dark:text-slate-100 text-xs mb-1">¡Ups! Algo se desconectó</p>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 mb-3 leading-relaxed break-words">${EmailManager.escapeHtml(humanMessage)}</p>
                <button onclick="AntigravityCopilot.retryLastMessage()" class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold flex items-center gap-1.5 transition-all shadow-2xs active:scale-95 cursor-pointer">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                    <span>Reintentar mensaje</span>
                </button>
            </div>
        `;
        container.appendChild(msgEl);
        container.scrollTop = container.scrollHeight;
    },

    getUserAvatarHTML() {
        let avatarUrl = '';
        let initial = 'U';
        let color = '#6366f1';
        let title = 'Usuario';

        if (window.EmailManager && EmailManager.accounts && EmailManager.accounts.length > 0) {
            const defaultAcc = EmailManager.accounts.find(a => a.is_default === 1) || EmailManager.accounts[0];
            if (defaultAcc) {
                avatarUrl = defaultAcc.avatar_url || (window.AvatarService ? AvatarService.getUrl(defaultAcc.email) : '');
                initial = (defaultAcc.name || defaultAcc.email || 'U')[0].toUpperCase();
                color = defaultAcc.color || '#6366f1';
                title = defaultAcc.name ? `${defaultAcc.name} (${defaultAcc.email})` : defaultAcc.email;
            }
        }

        if (avatarUrl) {
            return `
                <div class="w-6 h-6 rounded-full shrink-0 overflow-hidden ring-1 ring-indigo-400/40 shadow-xs relative self-start" title="${EmailManager.escapeHtml(title)}">
                    <img src="${avatarUrl}" alt="${initial}" class="w-full h-full object-cover rounded-full" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
                    <span style="display:none; background-color: ${color};" class="w-full h-full rounded-full items-center justify-center font-bold text-white text-[10px]">${initial}</span>
                </div>
            `;
        } else {
            return `
                <div class="w-6 h-6 rounded-full shrink-0 flex items-center justify-center font-bold text-white text-[10px] shadow-xs ring-1 ring-white/20 self-start" style="background-color: ${color}" title="${EmailManager.escapeHtml(title)}">
                    ${initial}
                </div>
            `;
        }
    },

    appendMessage(role, text) {
        const container = document.getElementById('antigravity-messages-container');
        if (!container) return;

        const cleanText = (text || '').trim();
        const msgEl = document.createElement('div');
        msgEl.className = `flex items-start gap-2.5 w-full min-w-0 ${role === 'user' ? 'justify-end' : ''}`;

        if (role === 'user') {
            msgEl.innerHTML = `
                <div class="p-3 bg-indigo-600 text-white rounded-2xl rounded-tr-xs text-xs max-w-[85%] leading-relaxed shadow-sm break-words whitespace-pre-wrap overflow-hidden">${EmailManager.escapeHtml(cleanText)}</div>
                ${this.getUserAvatarHTML()}
            `;
        } else {
            msgEl.innerHTML = `
                <img src="/img/bot.png" alt="Elio" class="w-6 h-6 rounded-full object-cover shrink-0 shadow-xs ring-1 ring-indigo-400/40">
                <div class="p-3 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl rounded-tl-xs text-xs flex-1 min-w-0 max-w-full leading-relaxed border border-slate-200 dark:border-slate-700/60 whitespace-pre-wrap shadow-2xs break-words overflow-hidden">${this.formatResponse(cleanText)}</div>
            `;
        }

        container.appendChild(msgEl);
        container.scrollTop = container.scrollHeight;
    },

    formatResponse(text) {
        if (!text) return '';

        let html = EmailManager.escapeHtml(text.trim())
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code class="bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded text-[11px] font-mono">$1</code>');

        // 1. Enlaces explícitos de correo en markdown: [texto](email:123)
        html = html.replace(/\[([^\]]+)\]\(email:(\d+)\)/gi, (match, label, id) => {
            return `<button type="button" onclick="AntigravityCopilot.openEmailFromChat(${id})" class="inline-flex items-center gap-1.5 px-2.5 py-1 my-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800/80 text-indigo-700 dark:text-indigo-300 font-semibold text-xs shadow-2xs hover:shadow-xs transition-all active:scale-95 cursor-pointer" title="Abrir correo en el visor"><svg class="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg><span>${label}</span></button>`;
        });

        // 2. Enlaces explícitos de eventos en markdown: [texto](event:123)
        html = html.replace(/\[([^\]]+)\]\(event:(\d+)\)/gi, (match, label, id) => {
            return `<button type="button" onclick="AntigravityCopilot.openEventFromChat(${id})" class="inline-flex items-center gap-1.5 px-2.5 py-1 my-0.5 rounded-lg bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/70 dark:hover:bg-purple-900 border border-purple-200 dark:border-purple-800/80 text-purple-700 dark:text-purple-300 font-semibold text-xs shadow-2xs hover:shadow-xs transition-all active:scale-95 cursor-pointer" title="Ver cita en el calendario"><svg class="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg><span>${label}</span></button>`;
        });

        // 3. Patrones implícitos de correo: [ID: 123] o (# 123)
        html = html.replace(/\[ID:\s*(\d+)\]/gi, (match, id) => {
            return `<button type="button" onclick="AntigravityCopilot.openEmailFromChat(${id})" class="inline-flex items-center gap-1 px-2 py-0.5 my-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold text-[11px] shadow-2xs transition-all active:scale-95 cursor-pointer" title="Abrir correo #${id}"><svg class="w-3 h-3 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg><span>Ver Correo #${id}</span></button>`;
        });

        // 4. Si viene (# 123) con número de correo (máximo 4 dígitos para no confundir con números de teléfono/factura)
        html = html.replace(/\(#\s*(\d{1,4})\)/gi, (match, id) => {
            return `(<button type="button" onclick="AntigravityCopilot.openEmailFromChat(${id})" class="inline-flex items-center text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer" title="Abrir correo #${id}">#${id} ↗</button>)`;
        });

        // 5. Tarjetas de Borrador de Correo Preparado
        html = html.replace(/\[BORRADOR_ACTION:([A-Za-z0-9+/=]+)\]/gi, (match, b64) => {
            try {
                const binString = atob(b64);
                const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0));
                const draft = JSON.parse(new TextDecoder().decode(bytes));
                const draftId = 'draft-' + Math.random().toString(36).substr(2, 9);
                return `
                    <div id="card-${draftId}" class="my-3 p-3.5 bg-white dark:bg-slate-800 rounded-2xl border border-indigo-200 dark:border-indigo-800/80 shadow-xs space-y-2.5 not-prose">
                        <div class="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700/60">
                            <div class="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-xs">
                                <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                                <span>Borrador Preparado</span>
                            </div>
                            <span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-semibold border border-amber-200/80 dark:border-amber-800/60">Requiere Confirmación</span>
                        </div>
                        <div class="text-[11px] space-y-1.5 text-slate-700 dark:text-slate-300">
                            <div class="flex items-center gap-1.5"><span class="text-slate-400 dark:text-slate-500 font-medium">Para:</span> <span class="font-semibold text-slate-800 dark:text-slate-100 font-mono">${EmailManager.escapeHtml(draft.to)}</span></div>
                            <div class="flex items-center gap-1.5"><span class="text-slate-400 dark:text-slate-500 font-medium">Asunto:</span> <span class="font-semibold text-slate-800 dark:text-slate-100">${EmailManager.escapeHtml(draft.subject)}</span></div>
                            <div class="p-2.5 bg-slate-50 dark:bg-slate-850 rounded-xl text-slate-800 dark:text-slate-200 whitespace-pre-wrap border border-slate-200/70 dark:border-slate-750 text-xs mt-1 leading-relaxed font-sans max-h-48 overflow-y-auto select-text">${EmailManager.escapeHtml(draft.body)}</div>
                        </div>
                        <div class="flex flex-wrap items-center gap-2 pt-1">
                            <button type="button" id="btn-send-${draftId}" onclick="AntigravityCopilot.confirmAndSendDraft('${b64}', '${draftId}')" class="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-2xs hover:shadow transition-all active:scale-95 cursor-pointer">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                                <span>Confirmar y Enviar</span>
                            </button>
                            <button type="button" onclick="AntigravityCopilot.openInComposer('${b64}')" class="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-750 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer" title="Abrir y editar en el redactor completo">
                                <svg class="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                <span>Editar en Redactor</span>
                            </button>
                        </div>
                    </div>
                `;
            } catch (e) {
                return '';
            }
        });

        // 6. Notificación de Eliminación de Correos
        html = html.replace(/\[ACCION_ELIMINACION:([A-Za-z0-9+/=]+)\]/gi, (match, b64) => {
            if (window.EmailManager) {
                setTimeout(() => EmailManager.loadEmails(), 500);
            }
            return '';
        });

        return html;
    },

    openEmailFromChat(emailId) {
        if (window.UI) UI.closeDrawer('drawer-antigravity-copilot');

        const numId = Number(emailId);
        if (isNaN(numId)) return;

        // Asegurar cambio a la vista de correos
        const sectionMail = document.getElementById('main-mail-section');
        const sectionCalendar = document.getElementById('main-calendar-section');
        const btnNavMail = document.getElementById('nav-item-mail');
        const btnNavCalendar = document.getElementById('nav-item-calendar');

        if (sectionMail && sectionCalendar) {
            sectionMail.classList.remove('hidden');
            sectionCalendar.classList.add('hidden');
            if (btnNavMail) btnNavMail.classList.add('active-folder', 'bg-indigo-50', 'dark:bg-indigo-950/70', 'text-indigo-600', 'dark:text-indigo-400', 'font-bold');
            if (btnNavCalendar) btnNavCalendar.classList.remove('bg-indigo-50', 'dark:bg-indigo-950/60', 'text-indigo-600', 'dark:text-indigo-400', 'font-bold');
        }

        if (window.EmailManager) {
            EmailManager.openEmailDetail(numId);
            if (window.UI) UI.showStickyToast('Correo Seleccionado', `Abriendo correo #${numId}`, 'info', 2000);
        }
    },

    openEventFromChat(eventId) {
        if (window.UI) UI.closeDrawer('drawer-antigravity-copilot');

        const numId = Number(eventId);
        if (isNaN(numId)) return;

        // Asegurar cambio a la vista de calendario
        const sectionMail = document.getElementById('main-mail-section');
        const sectionCalendar = document.getElementById('main-calendar-section');
        const btnNavMail = document.getElementById('nav-item-mail');
        const btnNavCalendar = document.getElementById('nav-item-calendar');

        if (sectionMail && sectionCalendar) {
            sectionMail.classList.add('hidden');
            sectionCalendar.classList.remove('hidden');
            if (btnNavCalendar) btnNavCalendar.classList.add('bg-indigo-50', 'dark:bg-indigo-950/60', 'text-indigo-600', 'dark:text-indigo-400', 'font-bold');
            if (btnNavMail) btnNavMail.classList.remove('active-folder', 'bg-indigo-50', 'dark:bg-indigo-950/70', 'text-indigo-600', 'dark:text-indigo-400', 'font-bold');
        }

        if (window.CalendarManager) {
            CalendarManager.renderCalendar();
            CalendarManager.viewEventDetail(numId);
        }
    },

    async confirmAndSendDraft(b64, draftId) {
        let draft;
        try {
            const binString = atob(b64);
            const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0));
            draft = JSON.parse(new TextDecoder().decode(bytes));
        } catch (e) {
            UI.showStickyToast('Error', 'No se pudo leer el borrador', 'error');
            return;
        }

        const btn = document.getElementById(`btn-send-${draftId}`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `
                <svg class="animate-spin -ml-1 mr-2 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
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
                    account_id: draft.account_id,
                    to_email: draft.to,
                    subject: draft.subject,
                    body: draft.body,
                    is_html: false
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                if (btn) {
                    btn.className = "px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-semibold text-xs flex items-center gap-1.5 pointer-events-none";
                    btn.innerHTML = `<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg><span>✔ Correo Enviado</span>`;
                }
                UI.showStickyToast('Correo Enviado', `Se envió exitosamente a ${draft.to}`, 'success');
                this.appendMessage('agent', `✔ Correo enviado exitosamente a **${draft.to}**.`);
                if (window.EmailManager && EmailManager.currentFolder === 'SENT') {
                    EmailManager.loadEmails();
                }
            } else {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = `<span>Reintentar envío</span>`;
                }
                UI.showStickyToast('Error al enviar', data.detail || 'Fallo de entrega SMTP', 'error');
            }
        } catch (e) {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<span>Reintentar envío</span>`;
            }
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    openInComposer(b64) {
        let draft;
        try {
            const binString = atob(b64);
            const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0));
            draft = JSON.parse(new TextDecoder().decode(bytes));
        } catch (e) {
            UI.showStickyToast('Error', 'No se pudo leer el borrador', 'error');
            return;
        }

        if (window.UI) UI.closeDrawer('drawer-antigravity-copilot');
        if (window.UI) UI.openComposeModal();

        const toInput = document.getElementById('compose-to');
        const subjectInput = document.getElementById('compose-subject');
        const accSelect = document.getElementById('compose-account-select');

        if (toInput) toInput.value = draft.to || '';
        if (subjectInput) subjectInput.value = draft.subject || '';
        if (accSelect && draft.account_id) accSelect.value = draft.account_id;

        if (window.Composer) {
            const htmlBody = (draft.body || '').split('\n').map(l => EmailManager.escapeHtml(l)).join('<br>');
            Composer.setHTML(htmlBody);
        }

        UI.showStickyToast('Borrador Cargado', 'Puedes editar el mensaje y agregar adjuntos antes de enviar', 'info', 3000);
    },

    quickSchedulePrompt() {
        this.sendMessage("Quiero programar una nueva reunión. Por favor revisa primero mis compromisos existentes en el calendario para verificar disponibilidad y pregúntame el título, fecha y hora que deseo agendar para no asignar nada al azar.");
    },

    sendQuickPrompt(prompt) {
        const input = document.getElementById('antigravity-chat-input');
        if (input) {
            input.value = prompt;
            this.sendMessage();
        }
    },

    isExpanded: false,
    resizerInitialized: false,

    initResizer() {
        if (this.resizerInitialized) return;
        const panel = document.getElementById('antigravity-drawer-panel');
        const resizer = document.getElementById('antigravity-drawer-resizer');
        if (!panel || !resizer) return;
        this.resizerInitialized = true;

        // Restaurar ancho guardado
        const savedWidth = localStorage.getItem('antigravity_drawer_width');
        if (savedWidth && window.innerWidth >= 768) {
            const w = parseInt(savedWidth);
            if (!isNaN(w) && w >= 360 && w <= window.innerWidth * 0.92) {
                panel.style.width = `${w}px`;
                panel.style.maxWidth = `${w}px`;
                this.isExpanded = w >= 650;
                this.updateExpandIcons();
            }
        }

        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = panel.getBoundingClientRect().width;
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
            resizer.classList.add('bg-indigo-600', 'w-2.5');
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            // Arrastrar hacia la izquierda incrementa el ancho del drawer
            const delta = startX - e.clientX;
            const newWidth = Math.min(Math.max(startWidth + delta, 360), window.innerWidth * 0.94);
            panel.style.width = `${newWidth}px`;
            panel.style.maxWidth = `${newWidth}px`;
            this.isExpanded = newWidth >= 650;
            this.updateExpandIcons();
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                resizer.classList.remove('bg-indigo-600', 'w-2.5');
                const finalWidth = panel.getBoundingClientRect().width;
                localStorage.setItem('antigravity_drawer_width', Math.round(finalWidth));
            }
        });
    },

    toggleExpand() {
        const panel = document.getElementById('antigravity-drawer-panel');
        if (!panel) return;
        this.isExpanded = !this.isExpanded;

        if (this.isExpanded) {
            // Expandir a vista amplia
            const targetWidth = Math.min(Math.max(Math.round(window.innerWidth * 0.58), 680), Math.round(window.innerWidth * 0.94));
            panel.style.width = `${targetWidth}px`;
            panel.style.maxWidth = `${targetWidth}px`;
            localStorage.setItem('antigravity_drawer_width', targetWidth);
        } else {
            // Restaurar a vista estándar
            panel.style.width = '448px';
            panel.style.maxWidth = '28rem'; // max-w-md
            localStorage.setItem('antigravity_drawer_width', '448');
        }
        this.updateExpandIcons();
    },

    updateExpandIcons() {
        const iconExpand = document.getElementById('icon-antigravity-expand');
        const iconCompress = document.getElementById('icon-antigravity-compress');
        const btn = document.getElementById('btn-antigravity-toggle-expand');
        if (!iconExpand || !iconCompress) return;

        if (this.isExpanded) {
            iconExpand.classList.add('hidden');
            iconCompress.classList.remove('hidden');
            if (btn) btn.title = "Restaurar tamaño normal";
        } else {
            iconExpand.classList.remove('hidden');
            iconCompress.classList.add('hidden');
            if (btn) btn.title = "Ampliar ventana del asistente";
        }
    },

    isCleanSession: false,

    startNewChat() {
        const container = document.getElementById('antigravity-messages-container');
        const input = document.getElementById('antigravity-chat-input');
        
        // Limpiar estado y contexto anterior (no persistir)
        this.lastMessage = null;
        this.isCleanSession = true;

        if (input) {
            input.value = '';
            input.focus();
        }

        if (container) {
            const mailText = this.getConnectedServicesText();
            container.innerHTML = `
                <div class="flex items-start gap-2.5 w-full min-w-0 animate-fade-in">
                    <img src="/img/bot.png" alt="Elio" class="w-7 h-7 rounded-full object-cover shrink-0 shadow-xs ring-1 ring-indigo-400/40">
                    <div id="antigravity-welcome-bubble" class="flex-1 min-w-0 max-w-full p-3.5 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-2xl rounded-tl-xs text-xs leading-relaxed border border-slate-200 dark:border-slate-700/60 break-words overflow-hidden">
                        ¡Hola! He iniciado una <strong>nueva conversación limpia</strong> sin historial anterior. Tengo acceso a ${mailText}.
                        <br><br>
                        ¿En qué puedo ayudarte hoy? Puedes pedirme buscar información específica, redactar borradores, consultar tu agenda o agendar citas.
                    </div>
                </div>
            `;
            container.scrollTop = 0;
        }

        // Llamar al endpoint de reset para asegurar contexto limpio en el backend
        fetch('/api/agent/reset', { method: 'POST' }).catch(() => {});

        if (window.UI) {
            UI.showStickyToast('Nuevo Chat', 'Se inició una conversación limpia con Elio', 'info', 2000);
        }
    },

    onOpenDrawer() {
        this.initResizer();
        this.updateConnectedServices();
        if (!this.isCleanSession) {
            this.loadWelcomeBrief();
        }
    },

    async loadWelcomeBrief() {
        const bubble = document.getElementById('antigravity-welcome-bubble');
        if (!bubble) return;

        try {
            const res = await fetch('/api/agent/summary');
            if (!res.ok) return;
            const data = await res.json();
            if (!data.success) return;

            const mailText = this.getConnectedServicesText();
            let html = `¡Hola! Soy <strong>Elio</strong>, tu asistente inteligente y copiloto autónomo en MerkeMail. Tengo acceso a ${mailText}.<br><br>`;

            // Contenedor tipo tarjeta de resumen con ajuste estricto al ancho
            html += `<div class="p-3 my-2 rounded-2xl bg-white/80 dark:bg-slate-750/80 border border-slate-200/80 dark:border-slate-700/60 shadow-2xs space-y-2.5 not-prose w-full max-w-full min-w-0 overflow-hidden break-words">`;
            
            // 1. Contador de correos sin leer
            html += `
                <div class="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-700/50 min-w-0 gap-2">
                    <span class="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 text-xs truncate">
                        <svg class="w-3.5 h-3.5 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                        <span class="truncate">Estado de tu Bandeja</span>
                    </span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${data.unread_count > 0 ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}">${data.unread_count} sin leer</span>
                </div>
            `;

            // 2. Elementos que requieren atención prioritaria
            if (data.priority_emails && data.priority_emails.length > 0) {
                html += `<div class="space-y-1.5 min-w-0 w-full overflow-hidden">`;
                html += `<p class="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1"><span>⚠️</span> <span>Requiere atención prioritaria:</span></p>`;
                for (const em of data.priority_emails) {
                    html += `
                        <div class="flex items-center gap-1.5 min-w-0 w-full overflow-hidden">
                            <button type="button" onclick="AntigravityCopilot.openEmailFromChat(${em.id})" class="text-left w-full min-w-0 flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer group" title="Abrir correo #${em.id}">
                                <span class="shrink-0 text-slate-500 dark:text-slate-400 font-mono">#${em.id}:</span>
                                <span class="truncate flex-1 min-w-0 text-slate-800 dark:text-slate-200 group-hover:text-indigo-600">${EmailManager.escapeHtml(em.subject || '(Sin Asunto)')}</span>
                            </button>
                        </div>
                    `;
                }
                html += `</div>`;
            }

            // 3. Próxima cita de calendario
            if (data.upcoming_event) {
                const ev = data.upcoming_event;
                const dateStr = ev.start_time ? new Date(ev.start_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                html += `
                    <div class="pt-2 border-t border-slate-100 dark:border-slate-700/50 min-w-0 w-full overflow-hidden">
                        <p class="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1"><span>📅</span> <span>Próxima cita en agenda:</span></p>
                        <button type="button" onclick="AntigravityCopilot.openEventFromChat(${ev.id})" class="text-left w-full min-w-0 flex items-center gap-1.5 mt-0.5 text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer group" title="Ver cita en el calendario">
                            <span class="truncate flex-1 min-w-0 text-slate-800 dark:text-slate-200 group-hover:text-purple-600">${EmailManager.escapeHtml(ev.title)}</span>
                            <span class="text-slate-400 dark:text-slate-500 font-normal text-[10px] shrink-0">(${dateStr})</span>
                        </button>
                    </div>
                `;
            }

            // 4. Recomendación de atención de Elio
            if (data.recommendation) {
                html += `
                    <div class="pt-2 border-t border-slate-100 dark:border-slate-700/50 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed min-w-0 w-full break-words whitespace-normal overflow-hidden">
                        <strong class="text-indigo-600 dark:text-indigo-400 font-bold block sm:inline">💡 Recomendación de atención:</strong> ${EmailManager.escapeHtml(data.recommendation)}
                    </div>
                `;
            }

            html += `</div>`;
            html += `<p class="mt-2 text-slate-600 dark:text-slate-300 text-xs leading-relaxed break-words">¿Qué deseas que haga por ti? Puedes pedirme redactar un correo, agendar una reunión o invocarme escribiendo <strong>@elio</strong> en cualquier momento.</p>`;

            bubble.innerHTML = html;
        } catch (e) {
            console.warn('No se pudo cargar el resumen de bienvenida:', e);
        }
    },

    getConnectedServicesText() {
        const accounts = window.EmailManager?.accounts || [];
        const calendars = window.CalendarManager?.calendars || [];

        const mailServices = [];
        for (const a of accounts) {
            const p = (a.provider || '').toLowerCase();
            if ((p === 'gmail' || p === 'google') && !mailServices.includes('Gmail')) {
                mailServices.push('Gmail');
            } else if (p === 'proton' && !mailServices.includes('ProtonMail')) {
                mailServices.push('ProtonMail');
            } else if (p === 'custom') {
                const domain = a.email && a.email.includes('@') ? a.email.split('@')[1] : '';
                const base = domain ? domain.split('.')[0] : 'Merke';
                const label = base.charAt(0).toUpperCase() + base.slice(1) + (domain ? ` (${domain})` : '');
                if (!mailServices.includes(label)) {
                    mailServices.push(label);
                }
            }
        }

        let mailText = 'tus cuentas de correo';
        if (mailServices.length === 1) {
            mailText = `tus correos de ${mailServices[0]}`;
        } else if (mailServices.length > 1) {
            mailText = `tus correos de ${mailServices.slice(0, -1).join(', ')} y ${mailServices[mailServices.length - 1]}`;
        }

        const calNames = calendars.map(c => c.name).filter(Boolean);
        let calText = 'tu Calendario';
        if (calNames.length === 1) {
            calText = `tu ${calNames[0]}`;
        } else if (calNames.length > 1) {
            calText = `tu Calendario Unificado (${calNames.join(' y ')})`;
        }

        return `${mailText} y ${calText}`;
    },

    updateConnectedServices() {
        const descEl = document.getElementById('antigravity-connected-services-desc');
        if (!descEl) return;
        descEl.textContent = `Tengo acceso a ${this.getConnectedServicesText()}.`;
    }
};

window.AntigravityCopilot = AntigravityCopilot;
window.Elio = AntigravityCopilot;
window.AntigravityAgent = AntigravityCopilot;
