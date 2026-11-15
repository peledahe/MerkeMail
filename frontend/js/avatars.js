// ========================================================
// Gestor y Caché Inteligente de Avatares - MerkeMail
// ========================================================

const AvatarService = {
    cacheKey: 'merkemail_avatar_cache_v2',
    memoryCache: {},

    init() {
        try {
            const raw = localStorage.getItem(this.cacheKey);
            if (raw) {
                this.memoryCache = JSON.parse(raw);
            }
        } catch (e) {
            this.memoryCache = {};
        }
    },

    saveToStorage() {
        try {
            localStorage.setItem(this.cacheKey, JSON.stringify(this.memoryCache));
        } catch (e) {}
    },

    cleanEmail(email) {
        if (!email) return '';
        let clean = String(email).trim();
        if (clean.includes('<') && clean.includes('>')) {
            clean = clean.split('<')[1].split('>')[0].trim();
        }
        return clean.toLowerCase();
    },

    // Registrar avatar conocido de una cuenta de backend
    register(email, avatarUrl) {
        if (!email || !avatarUrl) return;
        const clean = this.cleanEmail(email);
        if (this.memoryCache[clean] !== avatarUrl) {
            this.memoryCache[clean] = avatarUrl;
            this.saveToStorage();
        }
    },

    // Obtener URL del avatar
    getUrl(email, accountId = null) {
        const clean = this.cleanEmail(email);
        if (!clean) return null;

        // 1. Verificar en EmailManager.accounts
        if (window.EmailManager && EmailManager.accounts) {
            const acc = EmailManager.accounts.find(a => 
                (a.email && this.cleanEmail(a.email) === clean) || 
                (accountId && a.id === accountId)
            );
            if (acc && acc.avatar_url) {
                this.memoryCache[clean] = acc.avatar_url;
                this.saveToStorage();
                return acc.avatar_url;
            }
        }

        // 2. Verificar si ya está en caché de memoria/localStorage
        if (this.memoryCache[clean]) {
            return this.memoryCache[clean];
        }

        // 3. Fallback al endpoint de backend (con caché HTTP inmutable)
        const url = `/api/avatar/${encodeURIComponent(clean)}`;
        this.memoryCache[clean] = url;
        this.saveToStorage();
        return url;
    },

    // Renderizar avatar en HTML con control de fallback seguro y borde según el color de la cuenta
    render(email, name = '', sizeClass = 'w-8 h-8 text-xs', extraClass = '', borderColor = null) {
        const clean = this.cleanEmail(email);
        const displayName = name || clean || 'U';
        const initial = displayName.replace(/^["'\s]+/, '')[0].toUpperCase();
        const avatarUrl = this.getUrl(email);

        // Detectar si el correo pertenece a una de las cuentas configuradas para aplicar su color
        let accountColor = borderColor;
        if (!accountColor && window.EmailManager && EmailManager.accounts) {
            const acc = EmailManager.accounts.find(a => this.cleanEmail(a.email) === clean);
            if (acc && acc.color) {
                accountColor = acc.color;
            }
        }

        const borderStyle = accountColor ? `border: 2px solid ${accountColor};` : '';

        if (avatarUrl) {
            return `
                <div class="${sizeClass} ${extraClass} rounded-full overflow-hidden shrink-0 relative bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-white shadow-2xs select-none" style="${borderStyle}">
                    <img src="${avatarUrl}" alt="${initial}" loading="lazy" class="w-full h-full object-cover rounded-full" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
                    <span style="display:none; ${accountColor ? `background-color: ${accountColor};` : ''}" class="w-full h-full ${accountColor ? '' : 'bg-gradient-to-tr from-indigo-500 to-purple-600'} rounded-full flex items-center justify-center font-bold text-white text-xs">${initial}</span>
                </div>
            `;
        }

        return `
            <div class="${sizeClass} ${extraClass} rounded-full flex items-center justify-center text-white font-bold shadow-2xs shrink-0 select-none ${accountColor ? '' : 'bg-gradient-to-tr from-indigo-500 to-purple-600'}" style="${accountColor ? `background-color: ${accountColor};` : ''} ${borderStyle}">
                ${initial}
            </div>
        `;
    },

    // Actualizar avatar del sistema en el header principal (primera cuenta registrada o activa)
    updateSystemHeaderAvatar() {
        const headerAvatar = document.getElementById('user-header-avatar');
        if (!headerAvatar) return;

        if (window.EmailManager && EmailManager.accounts && EmailManager.accounts.length > 0) {
            const currentAcc = (EmailManager.currentAccountId 
                ? EmailManager.accounts.find(a => a.id === EmailManager.currentAccountId) 
                : null) || EmailManager.accounts[0];
            const avatarUrl = currentAcc.avatar_url || this.getUrl(currentAcc.email);
            const initial = (currentAcc.name || currentAcc.email || 'P')[0].toUpperCase();
            const color = currentAcc.color || '#3b82f6';

            headerAvatar.title = `Cuenta: ${currentAcc.name} (${currentAcc.email})`;
            headerAvatar.style.border = `2px solid ${color}`;

            if (avatarUrl) {
                headerAvatar.innerHTML = `
                    <img src="${avatarUrl}" alt="${initial}" class="w-full h-full object-cover rounded-full" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
                    <span style="display:none; background-color: ${color};" class="w-full h-full rounded-full flex items-center justify-center font-bold text-white text-xs">${initial}</span>
                `;
            } else {
                headerAvatar.textContent = initial;
                headerAvatar.style.backgroundColor = color;
            }
        }
    }
};

AvatarService.init();
window.AvatarService = AvatarService;
