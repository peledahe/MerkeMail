// Módulo de Gestión de Perfil de Usuario Analizado por IA - MerkeMail

const UserProfileAI = {
    profileData: null,
    isAnalyzing: false,

    init() {
        this.loadProfile(false);
    },

    openDrawer() {
        if (window.UI) {
            UI.openDrawer('drawer-user-profile');
        }
        this.loadProfile(true);
    },

    closeDrawer() {
        if (window.UI) {
            UI.closeDrawer('drawer-user-profile');
        }
    },

    async loadProfile(showLoadingState = false) {
        try {
            const res = await fetch('/api/user-profile');
            const data = await res.json();
            if (data.success && data.profile) {
                this.profileData = data.profile;
                this.renderProfileData(data.profile);
            } else {
                this.renderEmptyState();
            }
        } catch (e) {
            console.error("Error cargando perfil del usuario:", e);
            if (showLoadingState && window.UI) {
                UI.showStickyToast('Error', 'No se pudo obtener el perfil del usuario', 'error');
            }
        }
    },

    renderProfileData(p) {
        if (window.AvatarService) {
            AvatarService.updateSystemHeaderAvatar();
        }

        // Llenar campos de formulario
        const nameInput = document.getElementById('user-profile-name');
        const rolesInput = document.getElementById('user-profile-roles');
        const orgInput = document.getElementById('user-profile-org');
        const phoneInput = document.getElementById('user-profile-phone');
        const locInput = document.getElementById('user-profile-location');
        const webInput = document.getElementById('user-profile-websites');
        const styleInput = document.getElementById('user-profile-style');
        const bioInput = document.getElementById('user-profile-bio');
        const extraInput = document.getElementById('user-profile-extra');
        const lastAnalyzedEl = document.getElementById('user-profile-last-analyzed');
        const summaryCard = document.getElementById('user-profile-summary-card');

        if (nameInput) nameInput.value = p.name || '';
        if (rolesInput) rolesInput.value = p.roles_and_titles || '';
        if (orgInput) orgInput.value = p.organization || '';
        if (phoneInput) phoneInput.value = p.phone || '';
        if (locInput) locInput.value = p.address_location || '';
        if (webInput) webInput.value = p.websites || '';
        if (styleInput) styleInput.value = p.communication_style || '';
        if (bioInput) bioInput.value = p.summary_bio || '';
        if (extraInput) extraInput.value = p.extra_context || '';

        if (lastAnalyzedEl) {
            if (p.last_analyzed_at) {
                const d = new Date(p.last_analyzed_at);
                lastAnalyzedEl.textContent = `Analizado: ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                lastAnalyzedEl.className = "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20";
            } else {
                lastAnalyzedEl.textContent = "Pendiente de análisis";
                lastAnalyzedEl.className = "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20";
            }
        }

        if (summaryCard) {
            if (p.summary_bio) {
                summaryCard.classList.remove('hidden');
                document.getElementById('user-profile-bio-text').textContent = p.summary_bio;
            } else {
                summaryCard.classList.add('hidden');
            }
        }
    },

    renderEmptyState() {
        const lastAnalyzedEl = document.getElementById('user-profile-last-analyzed');
        if (lastAnalyzedEl) {
            lastAnalyzedEl.textContent = "Pendiente de análisis";
            lastAnalyzedEl.className = "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20";
        }
        const summaryCard = document.getElementById('user-profile-summary-card');
        if (summaryCard) summaryCard.classList.add('hidden');
    },

    async runAnalysis() {
        if (this.isAnalyzing) return;
        this.isAnalyzing = true;

        const btn = document.getElementById('btn-run-profile-analysis');
        const btnText = document.getElementById('btn-run-profile-analysis-text');
        const btnIcon = document.getElementById('btn-run-profile-analysis-icon');

        if (btn) btn.disabled = true;
        if (btnText) btnText.textContent = "Analizando firmas y correos...";
        if (btnIcon) btnIcon.classList.add('animate-spin');

        if (window.UI) {
            UI.showStickyToast('Analizando Perfil', 'Elio (@elio) está examinando tus correos enviados, firmas y contactos...', 'info', 4000);
        }

        try {
            const res = await fetch('/api/user-profile/analyze', { method: 'POST' });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || 'Fallo en el análisis del perfil');
            }
            const data = await res.json();
            if (data.success && data.profile) {
                this.profileData = data.profile;
                this.renderProfileData(data.profile);
                if (window.UI) {
                    UI.showStickyToast('Perfil Analizado', 'El perfil y estilo del usuario han sido actualizados y guardados exitosamente', 'success', 4000);
                }
            }
        } catch (e) {
            console.error("Error en análisis:", e);
            if (window.UI) {
                UI.showStickyToast('Error', e.message || 'No se pudo completar el análisis del perfil', 'error');
            }
        } finally {
            this.isAnalyzing = false;
            if (btn) btn.disabled = false;
            if (btnText) btnText.textContent = "Reanalizar con IA";
            if (btnIcon) btnIcon.classList.remove('animate-spin');
        }
    },

    async saveManualChanges() {
        const payload = {
            name: document.getElementById('user-profile-name')?.value.trim() || '',
            roles_and_titles: document.getElementById('user-profile-roles')?.value.trim() || '',
            organization: document.getElementById('user-profile-org')?.value.trim() || '',
            phone: document.getElementById('user-profile-phone')?.value.trim() || '',
            address_location: document.getElementById('user-profile-location')?.value.trim() || '',
            websites: document.getElementById('user-profile-websites')?.value.trim() || '',
            communication_style: document.getElementById('user-profile-style')?.value.trim() || '',
            summary_bio: document.getElementById('user-profile-bio')?.value.trim() || '',
            extra_context: document.getElementById('user-profile-extra')?.value.trim() || ''
        };

        try {
            const res = await fetch('/api/user-profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                this.profileData = data.profile;
                this.renderProfileData(data.profile);
                if (window.UI) {
                    UI.showStickyToast('Perfil Actualizado', 'Los datos del perfil han sido guardados para contexto de IA', 'success');
                }
            } else {
                throw new Error(data.detail || 'Error al guardar');
            }
        } catch (e) {
            if (window.UI) {
                UI.showStickyToast('Error', e.message, 'error');
            }
        }
    }
};

window.UserProfileAI = UserProfileAI;
