// Módulo de Integración con Gemini AI SDK - MerkeMail

const GeminiAI = {
    currentCandidates: [],
    isAiActive: false,
    geminiEnabled: false,
    hasGeminiKey: false,

    setDisconnectedState() {
        this.geminiEnabled = false;
        this.hasGeminiKey = false;
        this.isAiActive = false;
        this.applyAIStatusUI();
    },

    applyAIStatusUI() {
        const isAiActive = !!(this.geminiEnabled && this.hasGeminiKey);
        this.isAiActive = isAiActive;

        // 1. Indicador en el icono de configuración (Header)
        // Rojo cuando no está activo o sin key o sin conexión, verde únicamente cuando está activo y configurado
        const statusDot = document.getElementById('gemini-status-dot');
        if (statusDot) {
            if (isAiActive) {
                statusDot.className = 'w-2 h-2 rounded-full bg-emerald-500 absolute top-1 right-1 ring-2 ring-white dark:ring-slate-900';
                statusDot.title = 'Servicio de IA activo - Elio (@elio)';
            } else {
                statusDot.className = 'w-2 h-2 rounded-full bg-rose-500 absolute top-1 right-1 ring-2 ring-white dark:ring-slate-900';
                statusDot.title = !this.hasGeminiKey ? 'API Key de Gemini no configurada' : (!this.geminiEnabled ? 'Servicio de IA desactivado' : 'Sin conexión con la IA');
            }
        }

        // 2. Badge "AI" en el logo MerkeMail
        const brandBadge = document.getElementById('brand-ai-badge');
        if (brandBadge) {
            if (isAiActive) {
                brandBadge.classList.remove('hidden');
            } else {
                brandBadge.classList.add('hidden');
            }
        }

        // 3. Sección "HERRAMIENTAS IA" en el sidebar
        const sidebarAiSection = document.getElementById('sidebar-ai-section');
        if (sidebarAiSection) {
            if (isAiActive) {
                sidebarAiSection.classList.remove('hidden');
            } else {
                sidebarAiSection.classList.add('hidden');
            }
        }

        // 4. Redactor de nuevo correo: botón Asistente IA Prompt
        const btnComposeAi = document.getElementById('btn-compose-ai-prompt');
        if (btnComposeAi) {
            if (isAiActive) {
                btnComposeAi.classList.remove('hidden');
            } else {
                btnComposeAi.classList.add('hidden');
            }
        }
        // Cerrar panel desplegable de IA en compositor si está desactivado
        const inlineComposerAi = document.getElementById('composer-ai-inline-panel');
        if (inlineComposerAi && !isAiActive) {
            inlineComposerAi.classList.add('hidden');
        }

        // 5. Opciones de responder con IA en detalle y respuestas
        const btnInlineReplyAi = document.getElementById('btn-inline-reply-ai');
        if (btnInlineReplyAi) {
            if (isAiActive) {
                btnInlineReplyAi.classList.remove('hidden');
                btnInlineReplyAi.classList.add('flex');
            } else {
                btnInlineReplyAi.classList.add('hidden');
                btnInlineReplyAi.classList.remove('flex');
            }
        }

        const btnTopReplyAi = document.getElementById('btn-top-reply-ai');
        if (btnTopReplyAi) {
            if (isAiActive) {
                btnTopReplyAi.classList.remove('hidden');
            } else {
                btnTopReplyAi.classList.add('hidden');
            }
        }

        document.querySelectorAll('.btn-reply-ai-feature').forEach(el => {
            if (isAiActive) {
                el.classList.remove('hidden');
                if (el.id === 'inline-reply-tone-container') el.classList.add('flex');
            } else {
                el.classList.add('hidden');
                if (el.id === 'inline-reply-tone-container') el.classList.remove('flex');
            }
        });

        // 6. Botón de Agendar Cita con IA en la barra de lectura del correo
        const btnTopScheduleAi = document.getElementById('btn-top-schedule-ai');
        if (btnTopScheduleAi) {
            if (isAiActive) {
                btnTopScheduleAi.classList.remove('hidden');
            } else {
                btnTopScheduleAi.classList.add('hidden');
            }
        }

        document.querySelectorAll('.btn-schedule-ai-feature').forEach(el => {
            if (isAiActive) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });
    },

    toggleServiceSwitch() {
        this.setSwitchState(!this.geminiEnabled);
    },

    setSwitchState(enabled) {
        this.geminiEnabled = !!enabled;
        this.updateSwitchUI(this.geminiEnabled);
        this.applyAIStatusUI();
    },

    updateSwitchUI(enabled) {
        const btn = document.getElementById('btn-toggle-gemini-service');
        const thumb = document.getElementById('gemini-switch-thumb');
        const hiddenInput = document.getElementById('gemini-enabled-toggle');
        const pill = document.getElementById('gemini-card-status-pill');
        const banner = document.getElementById('gemini-disabled-banner');
        const optionsContainer = document.getElementById('gemini-options-container');
        const statusBadge = document.getElementById('gemini-status-badge');

        if (hiddenInput) {
            hiddenInput.value = enabled ? 'true' : 'false';
        }

        if (btn && thumb) {
            btn.setAttribute('aria-checked', enabled ? 'true' : 'false');
            if (enabled) {
                btn.className = 'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 dark:focus:ring-offset-slate-900 bg-indigo-600 shadow-inner';
                thumb.className = 'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out translate-x-5';
            } else {
                btn.className = 'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 dark:focus:ring-offset-slate-900 bg-slate-300 dark:bg-slate-700 shadow-inner';
                thumb.className = 'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out translate-x-0';
            }
        }

        const isReallyActive = !!(enabled && this.hasGeminiKey);

        if (pill) {
            if (isReallyActive) {
                pill.className = 'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0';
                pill.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Activo';
            } else if (!enabled) {
                pill.className = 'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20 shrink-0';
                pill.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Desactivado';
            } else {
                pill.className = 'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shrink-0';
                pill.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Inactivo';
            }
        }

        if (banner) {
            if (enabled) {
                banner.classList.add('hidden');
            } else {
                banner.classList.remove('hidden');
            }
        }

        if (optionsContainer) {
            if (enabled) {
                optionsContainer.classList.remove('opacity-40', 'pointer-events-none', 'select-none');
            } else {
                optionsContainer.classList.add('opacity-40', 'pointer-events-none', 'select-none');
            }
        }

        if (statusBadge) {
            if (isReallyActive) {
                statusBadge.className = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
                statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Conectado';
            } else if (!enabled) {
                statusBadge.className = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20';
                statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Desactivado';
            } else {
                statusBadge.className = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20';
                statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Inactivo';
            }
        }

        // Actualizar también el indicador del asistente Elio
        const elioBadge = document.getElementById('antigravity-agent-status-badge');
        if (elioBadge) {
            if (isReallyActive) {
                elioBadge.className = 'text-[9px] px-1.5 py-0.5 rounded font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                elioBadge.textContent = 'AGENTIC';
            } else {
                elioBadge.className = 'text-[9px] px-1.5 py-0.5 rounded font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20';
                elioBadge.textContent = 'INACTIVO';
            }
        }
    },

    onToggleEnabled(checked) {
        this.setSwitchState(checked);
    },

    async initSettings() {
        try {
            const res = await fetch('/api/settings');
            if (!res.ok) {
                this.setDisconnectedState();
                return;
            }
            const data = await res.json();
            
            const keyInput = document.getElementById('gemini-api-key-input');
            const modelSelect = document.getElementById('gemini-model-select');

            const isKeyNotEmpty = !!(data.gemini_api_key && data.gemini_api_key.trim().length > 0);
            this.geminiEnabled = (data.gemini_enabled !== false && data.gemini_enabled !== 'false' && data.gemini_enabled !== 0);
            this.hasGeminiKey = !!(data.has_gemini_key && isKeyNotEmpty);
            this.isAiActive = !!(this.geminiEnabled && this.hasGeminiKey);

            this.updateSwitchUI(this.geminiEnabled);

            if (keyInput) {
                keyInput.value = data.gemini_api_key || '';
                keyInput.oninput = () => {
                    const keyVal = keyInput.value.trim();
                    this.hasGeminiKey = keyVal.length > 0;
                    this.isAiActive = !!(this.geminiEnabled && this.hasGeminiKey);
                    this.updateSwitchUI(this.geminiEnabled);
                    this.applyAIStatusUI();
                };
            }

            if (this.hasGeminiKey && data.gemini_api_key) {
                // Cargar modelos dinámicamente según la API conectada
                this.loadModelsForApiKey(data.gemini_api_key, data.gemini_model);
            } else if (modelSelect) {
                modelSelect.innerHTML = '<option value="">(Ingresa tu API Key y pulsa "Probar Conexión" para listar modelos)</option>';
            }

            // Seleccionar el tono por defecto guardado
            const savedTone = data.ai_prompt_tone || data.gemini_default_tone || 'formal';
            const defaultToneSelect = document.getElementById('gemini-default-tone');
            if (defaultToneSelect) defaultToneSelect.value = savedTone;
            const composeToneSelect = document.getElementById('ai-compose-tone');
            if (composeToneSelect) composeToneSelect.value = savedTone;

            // Sincronizar cantidad de correos por página (paginación)
            const savedPageSize = parseInt(data.emails_page_size || localStorage.getItem('merkemail_page_size') || '12', 10) || 12;
            const pageSizeSelect = document.getElementById('settings-emails-page-size');
            if (pageSizeSelect) pageSizeSelect.value = String(savedPageSize);
            try {
                localStorage.setItem('merkemail_page_size', String(savedPageSize));
            } catch (e) {}
            if (window.EmailManager && EmailManager.pageSize !== savedPageSize) {
                EmailManager.pageSize = savedPageSize;
                EmailManager.currentPage = 1;
                EmailManager.loadEmails(false);
            }

            // Poblar y seleccionar el calendario predeterminado
            const defaultCalSelect = document.getElementById('settings-default-calendar-select');
            if (defaultCalSelect) {
                try {
                    const calRes = await fetch('/api/calendars');
                    const cals = await calRes.json();
                    if (cals && cals.length > 0) {
                        const targetCalId = data.default_calendar_id || cals[0].id;
                        defaultCalSelect.innerHTML = cals.map(c => {
                            const accLabel = c.account_email ? ` (${c.account_email})` : (c.provider ? ` [${c.provider}]` : '');
                            const isDefaultCal = (c.id == targetCalId);
                            return `<option value="${c.id}" ${isDefaultCal ? 'selected' : ''}>${c.name}${accLabel}${isDefaultCal ? ' ★' : ''}</option>`;
                        }).join('');
                    } else {
                        defaultCalSelect.innerHTML = '<option value="">(No hay calendarios activos)</option>';
                    }
                } catch (calErr) {
                    console.error("Error al cargar lista de calendarios en ajustes:", calErr);
                }
            }

            // Aplicar reactividad a toda la interfaz
            this.applyAIStatusUI();
        } catch (e) {
            console.warn("Sin conexión con el servicio de IA:", e);
            this.setDisconnectedState();
        }
    },

    async loadModelsForApiKey(apiKey, selectedModel = '') {
        const modelSelect = document.getElementById('gemini-model-select');
        if (!modelSelect || !apiKey) return;

        try {
            const res = await fetch('/api/settings/models', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey })
            });
            const data = await res.json();
            if (data.success && data.models && data.models.length > 0) {
                this.populateModelSelect(data.models, selectedModel || data.selected_model);
            }
        } catch (e) {
            console.error("Error cargando modelos de la API:", e);
        }
    },

    populateModelSelect(models, selectedModel = '') {
        const modelSelect = document.getElementById('gemini-model-select');
        if (!modelSelect) return;

        modelSelect.innerHTML = models.map(m => {
            const isSelected = (m.id === selectedModel);
            return `<option value="${m.id}" ${isSelected ? 'selected' : ''}>${m.name}</option>`;
        }).join('');
    },

    async testApiKey() {
        const keyInput = document.getElementById('gemini-api-key-input');
        const testResultEl = document.getElementById('gemini-test-result');
        const apiKey = keyInput ? keyInput.value.trim() : '';

        if (!apiKey) {
            UI.showStickyToast('Campo Vacío', 'Por favor ingresa una API Key para probar', 'warning');
            return;
        }

        testResultEl.className = 'p-3 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 text-slate-500';
        testResultEl.textContent = 'Consultando modelos disponibles en tu cuenta de Google AI Studio...';
        testResultEl.classList.remove('hidden');

        try {
            const res = await fetch('/api/settings/test-gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey })
            });

            if (!res.ok) {
                throw new Error(`Error en el servidor (${res.status})`);
            }

            const data = await res.json();
            if (data.success) {
                // Poblar el selector de modelos con los modelos devueltos por la API del usuario
                if (data.models && data.models.length > 0) {
                    this.populateModelSelect(data.models, data.selected_model);
                }

                testResultEl.className = 'p-3 rounded-lg text-xs bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 font-medium';
                testResultEl.innerHTML = `✔ ${data.message}<br><span class="text-[11px] opacity-80 mt-1 block">Modelo activo verificado: <strong>${data.selected_model}</strong></span>`;
                UI.showStickyToast('Conexión Exitosa', `Se detectaron ${data.models.length} modelos en tu cuenta`, 'success');
            } else {
                testResultEl.className = 'p-3 rounded-lg text-xs bg-rose-950/60 border border-rose-800/80 text-rose-300';
                testResultEl.innerHTML = `✖ Error de validación: ${data.error || 'Clave inválida o sin permisos'}`;
                UI.showStickyToast('Fallo de Conexión', 'La API Key no pudo ser validada', 'error');
            }
        } catch (e) {
            testResultEl.className = 'p-3 rounded-lg text-xs bg-rose-950/60 border border-rose-800/80 text-rose-300';
            testResultEl.textContent = `Error: ${e.message}`;
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    async saveSettings() {
        const isEnabled = !!this.geminiEnabled;
        const apiKey = document.getElementById('gemini-api-key-input').value.trim();
        const model = document.getElementById('gemini-model-select').value;
        const tone = document.getElementById('gemini-default-tone').value;
        const defaultCalEl = document.getElementById('settings-default-calendar-select');
        const defaultCalendarId = defaultCalEl ? (defaultCalEl.value || '1') : '1';
        const pageSizeEl = document.getElementById('settings-emails-page-size');
        const emailsPageSize = pageSizeEl ? (pageSizeEl.value || '12') : String(window.EmailManager?.pageSize || 12);

        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gemini_enabled: isEnabled ? 'true' : 'false',
                    gemini_api_key: apiKey,
                    gemini_model: model,
                    ai_prompt_tone: tone,
                    default_calendar_id: defaultCalendarId,
                    emails_page_size: emailsPageSize
                })
            });
            if (res.ok) {
                const toastMsg = isEnabled 
                    ? 'Ajustes de IA y Calendario actualizados exitosamente' 
                    : 'Ajustes guardados correctamente.';
                UI.showStickyToast('Configuración Guardada', toastMsg, 'success');
                await this.initSettings();
                if (window.CalendarManager && typeof CalendarManager.loadDefaultCalendarConfig === 'function') {
                    await CalendarManager.loadDefaultCalendarConfig();
                }
                UI.closeDrawer('drawer-settings');
            } else {
                const err = await res.json();
                UI.showStickyToast('Error', err.detail || 'No se pudo guardar la configuración', 'error');
            }
        } catch (e) {
            UI.showStickyToast('Error de Conexión', 'El backend no está respondiendo. Verifica que ./run.py esté en ejecución.', 'error');
        }
    },

    // Generador de Redacción Asistida por Prompt
    async generateDraftFromPrompt() {
        const promptText = document.getElementById('ai-compose-prompt').value.trim();
        const tone = document.getElementById('ai-compose-tone').value;
        const resultBox = document.getElementById('ai-compose-result');
        const subjectResult = document.getElementById('ai-generated-subject');
        const bodyResult = document.getElementById('ai-generated-body');
        const btn = document.getElementById('btn-generate-ai-draft');

        if (!promptText) {
            UI.showStickyToast('Instrucción requerida', 'Escribe lo que deseas que redacte el asistente', 'warning');
            return;
        }

        const originalBtnText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> Generando con Elio...`;

        try {
            const res = await fetch('/api/ai/draft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: promptText,
                    tone: tone,
                    language: 'es'
                })
            });

            const data = await res.json();
            if (data.success) {
                subjectResult.textContent = data.data.subject;
                bodyResult.textContent = data.data.body;
                resultBox.classList.remove('hidden');
                UI.showStickyToast('Borrador Generado', 'Elio ha redactado tu correo con éxito', 'success');
            } else {
                UI.showStickyToast('Error de Generación', data.detail || 'Verifica tu API Key', 'error');
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalBtnText;
        }
    },

    transferDraftToCompose() {
        const subject = document.getElementById('ai-generated-subject').textContent;
        const body = document.getElementById('ai-generated-body').textContent;

        const composeModal = document.getElementById('compose-modal');
        const subjectInput = document.getElementById('compose-subject');

        if (subjectInput) subjectInput.value = subject;

        if (window.Composer) {
            const paragraphs = body.split('\n\n').map(p => `<p>${Composer.escapeHTML(p).replace(/\n/g, '<br>')}</p>`).join('');
            Composer.setHTML(paragraphs);
            const accSelect = document.getElementById('compose-account-select');
            if (accSelect && window.SignatureManager) {
                SignatureManager.applyDefaultSignatureForAccount(parseInt(accSelect.value));
            }
        } else {
            const bodyInput = document.getElementById('compose-body');
            if (bodyInput) bodyInput.value = body;
        }

        UI.closeDrawer('drawer-ai-prompt');
        composeModal.classList.remove('hidden');
        UI.showStickyToast('Borrador Aplicado', 'El contenido de Elio (@elio) se cargó en el editor', 'info');
    },

    // Resumir Correo Individual
    async summarizeCurrentEmail(emailId) {
        UI.showStickyToast('Analizando', 'Elio (@elio) está generando el resumen ejecutivo...', 'info', 2000);
        try {
            const res = await fetch(`/api/ai/summarize/${emailId}`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                const box = document.getElementById(`ai-summary-box-${emailId}`);
                const text = document.getElementById(`ai-summary-text-${emailId}`);
                if (box && text) {
                    text.textContent = data.data.summary;
                    box.classList.remove('hidden');
                }
                UI.showStickyToast('Resumen Listo', 'Resumen ejecutivo de Elio (@elio) completado', 'success');
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    // Depuración de Correos por Prompt (Mail Cleanup AI)
    async analyzeCleanupPrompt() {
        const promptInput = document.getElementById('cleanup-ai-prompt');
        const prompt = promptInput ? promptInput.value.trim() : '';
        const listContainer = document.getElementById('cleanup-candidates-list');
        const countSpan = document.getElementById('cleanup-found-count');
        const btnAnalyze = document.getElementById('btn-analyze-cleanup');
        const btnExecute = document.getElementById('btn-execute-cleanup');
        const toggleAllBtn = document.getElementById('btn-toggle-all-cleanup');

        if (!prompt) {
            UI.showStickyToast('Prompt requerido', 'Ingresa una orden de depuración (ej: "todos los mensajes de redes sociales")', 'warning');
            return;
        }

        const originalBtnText = btnAnalyze.innerHTML;
        btnAnalyze.disabled = true;
        btnAnalyze.innerHTML = `<svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> Evaluando todos los buzones con Elio...`;

        listContainer.innerHTML = `
            <div class="p-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <svg class="animate-spin h-5 w-5 text-rose-500" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Evaluando absolutamente todos los correos de todas las cuentas con Elio...</span>
            </div>
        `;
        if (toggleAllBtn) toggleAllBtn.classList.add('hidden');

        try {
            const res = await fetch('/api/ai/cleanup-preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt,
                    all_accounts: true,
                    folder: 'ALL'
                })
            });

            const data = await res.json();
            this.currentCandidates = data.candidates || [];

            if (countSpan) countSpan.textContent = this.currentCandidates.length;

            if (this.currentCandidates.length === 0) {
                listContainer.innerHTML = `
                    <div class="p-8 text-center text-slate-500 text-xs">
                        No se encontraron correos que coincidan con el criterio de depuración especificado en ninguna cuenta.
                    </div>
                `;
                btnExecute.disabled = true;
                btnExecute.classList.add('opacity-50', 'cursor-not-allowed');
                btnExecute.textContent = 'Depurar Seleccionados (Papelera)';
                if (toggleAllBtn) toggleAllBtn.classList.add('hidden');
            } else {
                listContainer.innerHTML = this.currentCandidates.map(c => `
                    <div class="p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-start gap-3 shadow-2xs hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
                        <input type="checkbox" checked value="${c.id}" onchange="GeminiAI.updateCleanupSelectionCount()" class="cleanup-check-item mt-1 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer">
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-1.5 flex-wrap mb-1">
                                ${c.account ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 truncate max-w-[210px]" title="${EmailManager.escapeHtml(c.account)}"><svg class="w-2.5 h-2.5 opacity-60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"/></svg>${EmailManager.escapeHtml(c.account)}</span>` : ''}
                                ${c.folder ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/40">${EmailManager.escapeHtml(c.folder)}</span>` : ''}
                                ${c.date ? `<span class="text-[10px] text-slate-400">${EmailManager.escapeHtml(c.date)}</span>` : ''}
                            </div>
                            <p class="text-xs font-semibold text-slate-900 dark:text-white truncate">${EmailManager.escapeHtml(c.subject || '(Sin Asunto)')}</p>
                            <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate">${EmailManager.escapeHtml(c.sender || '')}</p>
                            <span class="inline-block mt-1 px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-[10px] font-medium border border-rose-200 dark:border-rose-900/40">
                                Criterio: ${EmailManager.escapeHtml(c.reason || 'Detectado por IA')}
                            </span>
                        </div>
                    </div>
                `).join('');

                btnExecute.disabled = false;
                btnExecute.classList.remove('opacity-50', 'cursor-not-allowed');
                if (toggleAllBtn) {
                    toggleAllBtn.classList.remove('hidden');
                    toggleAllBtn.textContent = 'Deseleccionar todos';
                }
                this.updateCleanupSelectionCount();
            }
        } catch (e) {
            listContainer.innerHTML = window.UI ? UI.renderErrorState({
                title: 'No pudimos analizar los correos',
                message: 'Ocurrió un inconveniente al evaluar los mensajes con IA. Verifica tu conexión o intenta con un criterio más específico.',
                retryAction: 'GeminiAI.analyzeCleanupPrompt()',
                retryText: 'Reintentar análisis',
                size: 'sm'
            }) : `<div class="p-4 text-center text-rose-500 text-xs">Error al procesar solicitud</div>`;
        } finally {
            btnAnalyze.disabled = false;
            btnAnalyze.innerHTML = originalBtnText;
        }
    },

    updateCleanupSelectionCount() {
        const checked = document.querySelectorAll('.cleanup-check-item:checked');
        const total = document.querySelectorAll('.cleanup-check-item');
        const btnExecute = document.getElementById('btn-execute-cleanup');
        const toggleAllBtn = document.getElementById('btn-toggle-all-cleanup');

        if (btnExecute) {
            if (checked.length === 0) {
                btnExecute.disabled = true;
                btnExecute.classList.add('opacity-50', 'cursor-not-allowed');
                btnExecute.textContent = 'Depurar Seleccionados (Papelera)';
            } else {
                btnExecute.disabled = false;
                btnExecute.classList.remove('opacity-50', 'cursor-not-allowed');
                btnExecute.textContent = `Depurar Seleccionados (${checked.length})`;
            }
        }

        if (toggleAllBtn && total.length > 0) {
            toggleAllBtn.textContent = checked.length === total.length ? 'Deseleccionar todos' : 'Seleccionar todos';
        }
    },

    toggleSelectAllCandidates() {
        const checkboxes = document.querySelectorAll('.cleanup-check-item');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        checkboxes.forEach(cb => { cb.checked = !allChecked; });
        this.updateCleanupSelectionCount();
    },

    async executeBatchCleanup() {
        const checkedItems = document.querySelectorAll('.cleanup-check-item:checked');
        const emailIds = Array.from(checkedItems).map(el => parseInt(el.value));

        if (emailIds.length === 0) {
            UI.showStickyToast('Sin selección', 'Selecciona al menos un correo para depurar', 'warning');
            return;
        }

        // Modal de confirmación obligatorio
        const confirmed = await UI.confirm({
            title: `¿Depurar ${emailIds.length} correos?`,
            message: `Estás a punto de enviar ${emailIds.length} correos seleccionados a la papelera. ¿Deseas continuar?`,
            confirmText: 'Mover a Papelera',
            isDanger: true
        });

        if (!confirmed) return;

        try {
            const res = await fetch('/api/emails/batch-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email_ids: emailIds, permanent: false })
            });
            const data = await res.json();
            if (data.success) {
                UI.showStickyToast('Depuración Completada', `${data.deleted_count} correos fueron enviados a la papelera`, 'success');
                UI.closeDrawer('drawer-cleanup-ai');
                EmailManager.loadEmails();
            }
        } catch (e) {
            UI.showStickyToast('Error', e.message, 'error');
        }
    },

    cancelAndClearCleanup() {
        const promptInput = document.getElementById('cleanup-ai-prompt');
        const listContainer = document.getElementById('cleanup-candidates-list');
        const countSpan = document.getElementById('cleanup-found-count');
        const btnExecute = document.getElementById('btn-execute-cleanup');
        const toggleAllBtn = document.getElementById('btn-toggle-all-cleanup');

        if (promptInput) promptInput.value = '';
        if (countSpan) countSpan.textContent = '0';
        if (listContainer) {
            listContainer.innerHTML = '<p class="text-xs text-slate-400 text-center py-6">Ingresa una orden arriba para analizar</p>';
        }
        if (btnExecute) {
            btnExecute.disabled = true;
            btnExecute.classList.add('opacity-50', 'cursor-not-allowed');
            btnExecute.textContent = 'Depurar Seleccionados (Papelera)';
        }
        if (toggleAllBtn) {
            toggleAllBtn.classList.add('hidden');
        }
        this.currentCandidates = [];
        UI.closeDrawer('drawer-cleanup-ai');
    }
};

window.GeminiAI = GeminiAI;
