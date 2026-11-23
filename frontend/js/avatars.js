// ========================================================
// Gestor y Caché Inteligente de Avatares - Senda
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
    render(email, name = '', sizeClass = 'w-8 h-8 text-xs', extraClass = '', borderColor = null, explicitAvatarUrl = null) {
        const clean = this.cleanEmail(email);
        const displayName = name || clean || 'U';
        const initial = (displayName.replace(/^["'\s]+/, '')[0] || 'U').toUpperCase();
        if (explicitAvatarUrl && clean) {
            this.register(clean, explicitAvatarUrl);
        }
        const avatarUrl = explicitAvatarUrl || this.getUrl(email);

        // Detectar si el correo pertenece a una de las cuentas configuradas para aplicar su color
        let accountColor = borderColor;
        if (!accountColor && window.EmailManager && EmailManager.accounts) {
            const acc = EmailManager.accounts.find(a => this.cleanEmail(a.email) === clean);
            if (acc && acc.color) {
                accountColor = acc.color;
            }
        }

        const ringStyle = accountColor ? `box-shadow: 0 0 0 2px ${accountColor};` : '';

        if (avatarUrl) {
            return `
                <div class="${sizeClass} ${extraClass} rounded-full overflow-hidden shrink-0 relative bg-transparent flex items-center justify-center font-bold text-white select-none" style="${ringStyle} transform: translateZ(0); -webkit-backface-visibility: hidden;">
                    <img src="${avatarUrl}" alt="${initial}" loading="lazy" class="w-full h-full object-cover block" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
                    <span style="display:none; ${accountColor ? `background-color: ${accountColor};` : ''}" class="w-full h-full ${accountColor ? '' : 'bg-gradient-to-tr from-indigo-500 to-purple-600'} flex items-center justify-center font-bold text-white text-xs">${initial}</span>
                </div>
            `;
        }

        return `
            <div class="${sizeClass} ${extraClass} rounded-full flex items-center justify-center text-white font-bold shrink-0 select-none ${accountColor ? '' : 'bg-gradient-to-tr from-indigo-500 to-purple-600'}" style="${accountColor ? `background-color: ${accountColor};` : ''} ${ringStyle}">
                ${initial}
            </div>
        `;
    },

    // Actualizar avatar del sistema en el header principal y perfil (cuenta predeterminada del usuario)
    updateSystemHeaderAvatar() {
        const headerAvatar = document.getElementById('user-header-avatar');
        const profileHeaderAvatar = document.getElementById('user-profile-header-avatar');

        if (window.EmailManager && EmailManager.accounts && EmailManager.accounts.length > 0) {
            // Usar la cuenta predeterminada del usuario por defecto
            const defaultAcc = EmailManager.accounts.find(a => a.is_default === 1) || EmailManager.accounts[0];
            const avatarUrl = defaultAcc.avatar_url || this.getUrl(defaultAcc.email);
            const initial = (defaultAcc.name || defaultAcc.email || 'U')[0].toUpperCase();
            const color = defaultAcc.color || '#3b82f6';

            if (headerAvatar) {
                const isEn = window.I18n && window.I18n.currentLang === 'en';
                const prefix = isEn ? 'Default account' : 'Cuenta por defecto';
                const titleStr = `${prefix}: ${defaultAcc.name} (${defaultAcc.email})`;
                headerAvatar.title = titleStr;
                if (headerAvatar.dataset.appTooltip !== undefined) {
                    headerAvatar.dataset.appTooltip = titleStr;
                }
                headerAvatar.style.border = 'none';
                headerAvatar.style.background = 'transparent';
                headerAvatar.style.boxShadow = `0 0 0 2px ${color}`;
                headerAvatar.style.transform = 'translateZ(0)';

                if (avatarUrl) {
                    headerAvatar.innerHTML = `
                        <img src="${avatarUrl}" alt="${initial}" class="w-full h-full object-cover block" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
                        <span style="display:none; background-color: ${color};" class="w-full h-full flex items-center justify-center font-bold text-white text-xs">${initial}</span>
                    `;
                } else {
                    headerAvatar.innerHTML = `<span class="w-full h-full flex items-center justify-center font-bold text-white text-xs" style="background-color: ${color}">${initial}</span>`;
                }
            }

            if (profileHeaderAvatar) {
                profileHeaderAvatar.style.border = 'none';
                profileHeaderAvatar.style.background = 'transparent';
                profileHeaderAvatar.style.boxShadow = `0 0 0 2px ${color}`;
                profileHeaderAvatar.style.transform = 'translateZ(0)';
                if (avatarUrl) {
                    profileHeaderAvatar.innerHTML = `
                        <img src="${avatarUrl}" alt="${initial}" class="w-full h-full object-cover block" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
                        <span style="display:none; background-color: ${color};" class="w-full h-full flex items-center justify-center font-bold text-white text-base">${initial}</span>
                    `;
                } else {
                    profileHeaderAvatar.innerHTML = `<span class="w-full h-full flex items-center justify-center font-bold text-white text-base" style="background-color: ${color}">${initial}</span>`;
                }
            }
        }
    }
};

AvatarService.init();
window.AvatarService = AvatarService;
