/**
 * voice_briefing.js
 * Modo "Briefing de Voz" para Elio (@elio) en Senda
 * Utiliza Web Speech Synthesis para narrar el resumen 360° y respuestas del copiloto.
 */

window.VoiceBriefing = {
    synth: window.speechSynthesis || null,
    currentUtterance: null,
    isSpeaking: false,
    selectedVoice: null,
    activeButton: null,

    init() {
        if (!this.synth) {
            console.warn('VoiceBriefing: Web Speech Synthesis no es soportado por este navegador.');
            return;
        }
        this.loadVoices();
        if (speechSynthesis.onvoiceschanged !== undefined) {
            speechSynthesis.onvoiceschanged = () => {
                this.loadVoices();
                this.populateVoiceSelect();
            };
        }
        // Poblar selector si ya existe en el DOM
        setTimeout(() => this.populateVoiceSelect(), 300);
    },

    loadVoices() {
        if (!this.synth) return;
        const voices = this.synth.getVoices();
        if (!voices || voices.length === 0) return;

        const savedURI = localStorage.getItem('senda_reader_voice_uri') || '';
        if (savedURI) {
            const matched = voices.find(v => v.voiceURI === savedURI);
            if (matched) {
                this.selectedVoice = matched;
                return;
            }
        }

        // Buscar preferentemente una voz en español de Latinoamérica
        const latamLocales = ['es-419', 'es-MX', 'es-US', 'es-GT', 'es-CO', 'es-AR', 'es-CL', 'es-PE'];
        this.selectedVoice = voices.find(v => v.lang && latamLocales.includes(v.lang)) 
            || voices.find(v => v.lang && (v.lang.startsWith('es-') && v.lang !== 'es-ES'))
            || voices.find(v => v.lang && v.lang.startsWith('es'))
            || voices[0] || null;
    },

    populateVoiceSelect() {
        const select = document.getElementById('settings-voice-select');
        if (!select || !this.synth) return;
        const voices = this.synth.getVoices();
        if (!voices || voices.length === 0) return;

        const savedURI = localStorage.getItem('senda_reader_voice_uri') || '';
        select.innerHTML = '<option value="">Detectar automáticamente (Español Latinoamericano)</option>';

        // Filtrar y ordenar voces en español
        const latamLocales = ['es-419', 'es-MX', 'es-US', 'es-GT', 'es-CO', 'es-AR', 'es-CL', 'es-PE'];
        const esLatam = voices.filter(v => v.lang && latamLocales.includes(v.lang));
        const esOther = voices.filter(v => v.lang && v.lang.startsWith('es') && !latamLocales.includes(v.lang));
        const otherVoices = voices.filter(v => !v.lang || !v.lang.startsWith('es'));

        if (esLatam.length > 0) {
            const group = document.createElement('optgroup');
            group.label = '🌎 Español Latinoamericano (Recomendadas)';
            esLatam.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.voiceURI;
                opt.textContent = `${v.name} (${v.lang})`;
                if (v.voiceURI === savedURI) opt.selected = true;
                group.appendChild(opt);
            });
            select.appendChild(group);
        }

        if (esOther.length > 0) {
            const group = document.createElement('optgroup');
            group.label = '🇪🇸 Otras Voces en Español';
            esOther.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.voiceURI;
                opt.textContent = `${v.name} (${v.lang})`;
                if (v.voiceURI === savedURI) opt.selected = true;
                group.appendChild(opt);
            });
            select.appendChild(group);
        }

        if (otherVoices.length > 0) {
            const group = document.createElement('optgroup');
            group.label = '🌐 Otros Idiomas';
            otherVoices.slice(0, 25).forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.voiceURI;
                opt.textContent = `${v.name} (${v.lang})`;
                if (v.voiceURI === savedURI) opt.selected = true;
                group.appendChild(opt);
            });
            select.appendChild(group);
        }
    },

    setVoice(voiceURI) {
        if (!this.synth) return;
        const voices = this.synth.getVoices();
        if (voiceURI) {
            localStorage.setItem('senda_reader_voice_uri', voiceURI);
            this.selectedVoice = voices.find(v => v.voiceURI === voiceURI) || null;
            if (window.UI) UI.showStickyToast('Voz Seleccionada', `Preferencia guardada: ${this.selectedVoice ? this.selectedVoice.name : 'Voz personalizada'}`, 'success', 2500);
        } else {
            localStorage.removeItem('senda_reader_voice_uri');
            this.loadVoices();
            if (window.UI) UI.showStickyToast('Voz Automática', 'Elio seleccionará la mejor voz disponible en español latinoamericano.', 'info', 2500);
        }
    },

    testCurrentVoice() {
        this.speak("Hola, esta es una prueba de la voz seleccionada para tu asistente Elio en Senda.");
    },

    isSupported() {
        return !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
    },

    stop() {
        if (this.synth) {
            this.synth.cancel();
        }
        this.isSpeaking = false;
        this.updateButtonUI(false);
    },

    updateButtonUI(speaking) {
        if (this.activeButton) {
            const labelEl = this.activeButton.querySelector('#voice-briefing-label') || this.activeButton.querySelector('span');
            if (speaking) {
                this.activeButton.classList.add('ring-2', 'ring-purple-400', 'animate-pulse');
                if (labelEl) labelEl.textContent = 'Detener';
            } else {
                this.activeButton.classList.remove('ring-2', 'ring-purple-400', 'animate-pulse');
                if (labelEl) labelEl.textContent = 'Escuchar';
            }
        }
    },

    speak(text, btnEl = null) {
        if (!this.isSupported()) {
            if (window.UI) UI.showStickyToast('Voz no soportada', 'Tu navegador o entorno no tiene habilitada la síntesis de voz.', 'warning');
            return;
        }

        if (this.isSpeaking) {
            this.stop();
            return;
        }

        if (!text || !text.trim()) {
            if (window.UI) UI.showStickyToast('Sin contenido', 'No hay texto disponible para narrar.', 'warning');
            return;
        }

        this.stop(); // Limpiar colas previas

        this.activeButton = btnEl;
        const cleanText = text
            .replace(/[#*`_~]/g, '') // Quitar markdown
            .replace(/https?:\/\/\S+/g, 'enlace')
            .replace(/@elio/gi, 'Elio')
            .replace(/\n+/g, '. ')
            .trim();

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = (this.selectedVoice && this.selectedVoice.lang) ? this.selectedVoice.lang : 'es-419';
        if (this.selectedVoice) {
            utterance.voice = this.selectedVoice;
        }
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        utterance.onstart = () => {
            this.isSpeaking = true;
            this.updateButtonUI(true);
            if (window.UI) UI.showStickyToast('Elio en Voz', 'Reproduciendo briefing ejecutivo...', 'info', 2000);
        };

        utterance.onend = () => {
            this.isSpeaking = false;
            this.updateButtonUI(false);
        };

        utterance.onerror = (e) => {
            console.error('Speech error:', e);
            this.isSpeaking = false;
            this.updateButtonUI(false);
        };

        this.currentUtterance = utterance;
        this.synth.speak(utterance);
    },

    toggle(btnEl) {
        if (this.isSpeaking) {
            this.stop();
            return;
        }

        // Construir narración desde el resumen 360 disponible
        let narrative = '';
        if (window.EmailManager && EmailManager.lastSummaryData) {
            narrative = this.buildBriefingScript(EmailManager.lastSummaryData);
        } else {
            // Extraer del DOM visible del dashboard
            const recEl = document.querySelector('#email-detail-container p.whitespace-pre-line');
            if (recEl && recEl.textContent.trim()) {
                narrative = `Hola. Este es tu resumen de hoy en Senda. ${recEl.textContent.trim()}`;
            } else {
                narrative = 'Hola. Tu espacio de trabajo en Senda está sincronizado y todo se encuentra al día.';
            }
        }

        this.speak(narrative, btnEl);
    },

    buildBriefingScript(data) {
        const unread = data.unread_count || 0;
        const upcoming = data.upcoming_event;
        const tasksCount = (data.pending_tasks || []).length;
        const notesCount = (data.notes || []).length;
        const recommendation = data.recommendation || 'Todo está en orden.';

        let script = `Hola, aquí tienes tu briefing ejecutivo de Elio en Senda. `;
        script += `Tienes ${unread} correos sin leer en tu bandeja. `;

        if (upcoming && upcoming.title) {
            script += `Tu próxima cita en la agenda es: ${upcoming.title}, programada a las ${upcoming.start_time ? upcoming.start_time.replace('T', ' ') : 'pronto'}. `;
        } else {
            script += `No tienes reuniones pendientes de inmediato. `;
        }

        if (tasksCount > 0) {
            script += `Cuentas con ${tasksCount} tareas por realizar. `;
        }

        if (notesCount > 0) {
            script += `Y tienes ${notesCount} notas activas en tu pizarra. `;
        }

        script += `Síntesis y recomendación: ${recommendation}`;
        return script;
    },

    readLastCopilotResponse() {
        const container = document.getElementById('antigravity-chat-messages');
        if (!container) return;
        const assistantMsgs = container.querySelectorAll('.chat-msg-assistant, [data-sender="assistant"]');
        let textToRead = '';
        if (assistantMsgs.length > 0) {
            const last = assistantMsgs[assistantMsgs.length - 1];
            textToRead = last.textContent || '';
        } else {
            textToRead = 'Aún no hay respuestas en esta conversación con Elio.';
        }
        this.speak(textToRead, document.getElementById('btn-antigravity-voice-read'));
    }
};

// Inicializar al cargar el script
document.addEventListener('DOMContentLoaded', () => {
    if (window.VoiceBriefing) {
        VoiceBriefing.init();
    }
});
