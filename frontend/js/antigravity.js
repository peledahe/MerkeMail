// Módulo del Agente Autónomo Antigravity Copilot - MerkeMail

const AntigravityCopilot = {
    async sendMessage() {
        const input = document.getElementById('antigravity-chat-input');
        const container = document.getElementById('antigravity-messages-container');
        const message = input ? input.value.trim() : '';

        if (!message) return;

        // Añadir mensaje del usuario a la vista
        this.appendMessage('user', message);
        input.value = '';

        // Indicador de "Escribiendo..."
        const loadingId = 'loading-' + Date.now();
        const loadingEl = document.createElement('div');
        loadingEl.id = loadingId;
        loadingEl.className = 'flex items-start gap-2.5';
        loadingEl.innerHTML = `
            <div class="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                AG
            </div>
            <div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl text-xs text-slate-500 flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce"></span>
                <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style="animation-delay: 0.15s"></span>
                <span class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style="animation-delay: 0.3s"></span>
                <span class="ml-1 text-[11px]">Antigravity ejecutando herramientas...</span>
            </div>
        `;
        container.appendChild(loadingEl);
        container.scrollTop = container.scrollHeight;

        try {
            const res = await fetch('/api/agent/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });

            const data = await res.json();
            document.getElementById(loadingId)?.remove();

            if (data.success) {
                this.appendMessage('agent', data.response);
                // Si agendó algo o modificó, refrescar calendarios o emails
                if (data.response.includes('agendado') || data.response.includes('evento')) {
                    if (window.CalendarManager) CalendarManager.loadEvents();
                    UI.showStickyToast('Antigravity Copilot', 'Acción de calendario ejecutada', 'success');
                }
            } else {
                this.appendMessage('agent', data.response || 'Ocurrió un error al procesar la solicitud.');
            }
        } catch (e) {
            document.getElementById(loadingId)?.remove();
            this.appendMessage('agent', `Error de conexión con el agente: ${e.message}`);
        }
    },

    appendMessage(role, text) {
        const container = document.getElementById('antigravity-messages-container');
        if (!container) return;

        const msgEl = document.createElement('div');
        msgEl.className = `flex items-start gap-2.5 ${role === 'user' ? 'justify-end' : ''}`;

        if (role === 'user') {
            msgEl.innerHTML = `
                <div class="p-3 bg-indigo-600 text-white rounded-2xl rounded-tr-xs text-xs max-w-[85%] leading-relaxed shadow-sm">
                    ${EmailManager.escapeHtml(text)}
                </div>
            `;
        } else {
            msgEl.innerHTML = `
                <div class="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                    AG
                </div>
                <div class="p-3 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl rounded-tl-xs text-xs max-w-[85%] leading-relaxed border border-slate-200 dark:border-slate-700/60 whitespace-pre-wrap shadow-2xs">
                    ${this.formatResponse(text)}
                </div>
            `;
        }

        container.appendChild(msgEl);
        container.scrollTop = container.scrollHeight;
    },

    formatResponse(text) {
        return EmailManager.escapeHtml(text)
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code class="bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded text-[11px] font-mono">$1</code>');
    },

    sendQuickPrompt(prompt) {
        const input = document.getElementById('antigravity-chat-input');
        if (input) {
            input.value = prompt;
            this.sendMessage();
        }
    }
};

window.AntigravityCopilot = AntigravityCopilot;
