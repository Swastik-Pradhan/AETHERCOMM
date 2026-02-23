/* ═══════════════════════════════════════════════════════════════
   NERV COMM — Main Application Controller (v2)
   ═══════════════════════════════════════════════════════════════ */

const AVATARS = [
    { id: 'default', emoji: '👤' }, { id: 'pilot-01', emoji: '🧑‍✈️' }, { id: 'pilot-02', emoji: '👩‍✈️' },
    { id: 'robot', emoji: '🤖' }, { id: 'alien', emoji: '👽' }, { id: 'cat', emoji: '🐱' },
    { id: 'dragon', emoji: '🐉' }, { id: 'ghost', emoji: '👻' }, { id: 'devil', emoji: '😈' },
    { id: 'skull', emoji: '💀' }, { id: 'ninja', emoji: '🥷' }, { id: 'astronaut', emoji: '🧑‍🚀' },
    { id: 'crown', emoji: '👑' }, { id: 'fire', emoji: '🔥' }, { id: 'lightning', emoji: '⚡' },
    { id: 'star', emoji: '⭐' }, { id: 'moon', emoji: '🌙' }, { id: 'wolf', emoji: '🐺' },
    { id: 'eagle', emoji: '🦅' }, { id: 'fox', emoji: '🦊' }, { id: 'lion', emoji: '🦁' },
    { id: 'bear', emoji: '🐻' }, { id: 'panda', emoji: '🐼' }, { id: 'unicorn', emoji: '🦄' },
];

const PROFILE_COLORS = [
    '#CC0000', '#FF0033', '#FF6B35', '#FFAA00',
    '#00FF41', '#00CC33', '#00D4FF', '#0066FF',
    '#9B59B6', '#FF0066', '#7B68EE', '#1ABC9C'
];

function getAvatarEmoji(avatarId) {
    const f = AVATARS.find(a => a.id === avatarId);
    return f ? f.emoji : '👤';
}

function renderAvatarContent(avatarId, username, color) {
    if (avatarId && avatarId !== 'default') return `<span class="avatar-emoji">${getAvatarEmoji(avatarId)}</span>`;
    return username ? username.charAt(0).toUpperCase() : '?';
}

const App = {
    socket: null,
    currentUser: null,
    screens: { boot: document.getElementById('boot-screen'), auth: document.getElementById('auth-screen'), chat: document.getElementById('chat-screen') },

    init() {
        this.createParticles();
        this.bindAuthEvents();
        this.bindTabs();
        this.bindProfileEvents();
        this.populateAvatarPickers();
        this.startBoot();
    },

    createParticles() {
        const c = document.getElementById('bg-particles');
        if (!c) return;
        for (let i = 0; i < 25; i++) {
            const p = document.createElement('div');
            p.className = 'bg-particle';
            p.style.left = Math.random() * 100 + '%';
            p.style.animationDuration = (8 + Math.random() * 12) + 's';
            p.style.animationDelay = Math.random() * 10 + 's';
            const sz = (1 + Math.random() * 2) + 'px'; p.style.width = sz; p.style.height = sz;
            if (Math.random() > .7) p.style.background = 'var(--nerv-cyan)';
            c.appendChild(p);
        }
    },

    populateAvatarPickers() {
        ['register-avatar-picker', 'profile-avatar-picker'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.innerHTML = AVATARS.map(a => `<div class="avatar-option ${a.id === 'default' ? 'selected' : ''}" data-avatar="${a.id}">${a.emoji}</div>`).join('');
            el.querySelectorAll('.avatar-option').forEach(o => o.addEventListener('click', () => {
                el.querySelectorAll('.avatar-option').forEach(x => x.classList.remove('selected'));
                o.classList.add('selected');
                if (id === 'register-avatar-picker') document.getElementById('register-avatar').value = o.dataset.avatar;
            }));
        });
        const cp = document.getElementById('profile-color-picker');
        if (cp) {
            cp.innerHTML = PROFILE_COLORS.map(c => `<div class="color-option" data-color="${c}" style="background:${c}"></div>`).join('');
            cp.querySelectorAll('.color-option').forEach(o => o.addEventListener('click', () => {
                cp.querySelectorAll('.color-option').forEach(x => x.classList.remove('selected'));
                o.classList.add('selected');
            }));
        }
    },

    startBoot() {
        this.screens.boot.classList.add('active');
        setTimeout(() => { this.screens.boot.classList.remove('active'); this.checkSession(); }, 3200);
    },

    showScreen(name) {
        Object.values(this.screens).forEach(s => s.classList.remove('active'));
        if (this.screens[name]) this.screens[name].classList.add('active');
    },

    async checkSession() {
        try {
            const res = await fetch('/api/auth/me');
            if (res.ok) { this.onLoginSuccess(await res.json()); } else { this.showScreen('auth'); }
        } catch { this.showScreen('auth'); }
    },

    bindTabs() {
        document.querySelectorAll('.auth-tab').forEach(tab => tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab === 'login' ? 'login-form' : 'register-form').classList.add('active');
        }));
    },

    bindAuthEvents() {
        document.getElementById('login-form').addEventListener('submit', e => { e.preventDefault(); this.login(); });
        document.getElementById('register-form').addEventListener('submit', e => { e.preventDefault(); this.register(); });
        document.getElementById('btn-logout').addEventListener('click', () => this.logout());
    },

    bindProfileEvents() {
        document.getElementById('open-profile-btn').addEventListener('click', () => this.showProfileModal());
        document.getElementById('btn-close-profile-modal').addEventListener('click', () => { document.getElementById('profile-modal').style.display = 'none'; });
        document.getElementById('btn-save-profile').addEventListener('click', () => this.saveProfile());
    },

    showProfileModal() {
        if (!this.currentUser) return;
        const av = document.getElementById('profile-current-avatar');
        av.style.background = this.currentUser.avatar_color;
        av.innerHTML = renderAvatarContent(this.currentUser.avatar, this.currentUser.username);
        document.getElementById('profile-username').textContent = this.currentUser.username.toUpperCase();
        document.getElementById('profile-status').value = this.currentUser.status || '';
        document.getElementById('profile-avatar-picker').querySelectorAll('.avatar-option').forEach(o => o.classList.toggle('selected', o.dataset.avatar === (this.currentUser.avatar || 'default')));
        document.getElementById('profile-color-picker').querySelectorAll('.color-option').forEach(o => o.classList.toggle('selected', o.dataset.color === this.currentUser.avatar_color));
        document.getElementById('profile-modal').style.display = 'flex';
    },

    async saveProfile() {
        const av = document.querySelector('#profile-avatar-picker .avatar-option.selected');
        const co = document.querySelector('#profile-color-picker .color-option.selected');
        const st = document.getElementById('profile-status').value.trim();
        const u = {};
        if (av) u.avatar = av.dataset.avatar;
        if (co) u.avatar_color = co.dataset.color;
        u.status = st || this.currentUser.status || 'Available';
        if (Object.keys(u).length === 0) { console.warn('[AETHER] Nothing to save'); return; }
        try {
            const r = await fetch('/api/auth/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(u) });
            if (r.ok) {
                this.currentUser = { ...this.currentUser, ...(await r.json()) };
                this.updateSidebarProfile();
                document.getElementById('profile-modal').style.display = 'none';
            } else {
                const err = await r.json();
                console.error('[AETHER] Profile update error:', err);
            }
        } catch (e) { console.error('[AETHER] Profile update failed:', e); }
    },

    updateSidebarProfile() {
        const av = document.getElementById('my-avatar');
        av.style.background = this.currentUser.avatar_color;
        av.innerHTML = renderAvatarContent(this.currentUser.avatar, this.currentUser.username);
        document.getElementById('my-username').textContent = this.currentUser.username.toUpperCase();
    },

    async login() {
        const u = document.getElementById('login-username').value.trim();
        const p = document.getElementById('login-password').value;
        const err = document.getElementById('login-error');
        const btn = document.querySelector('#login-form .btn-primary');
        err.classList.remove('show'); btn.classList.add('loading');
        try {
            const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Login failed');
            this.onLoginSuccess(d);
        } catch (e) { err.textContent = e.message; err.classList.add('show'); }
        finally { btn.classList.remove('loading'); }
    },

    async register() {
        const u = document.getElementById('register-username').value.trim();
        const p = document.getElementById('register-password').value;
        const c = document.getElementById('register-confirm').value;
        const avatar = document.getElementById('register-avatar').value;
        const err = document.getElementById('register-error');
        const btn = document.querySelector('#register-form .btn-primary');
        err.classList.remove('show');
        if (p !== c) { err.textContent = 'Access codes do not match'; err.classList.add('show'); return; }
        btn.classList.add('loading');
        try {
            const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p, avatar }) });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Registration failed');
            this.onLoginSuccess(d);
        } catch (e) { err.textContent = e.message; err.classList.add('show'); }
        finally { btn.classList.remove('loading'); }
    },

    onLoginSuccess(user) {
        this.currentUser = user;
        this.updateSidebarProfile();
        this.connectSocket();
        this.showScreen('chat');
        Chat.init();
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    },

    connectSocket() {
        this.socket = io({ transports: ['websocket', 'polling'] });
        this.socket.on('connect', () => { console.log('[AETHER] Socket connected'); this.socket.emit('user-online', this.currentUser.id); });
        this.socket.on('disconnect', () => console.log('[AETHER] Socket disconnected'));
        Chat.bindSocketEvents(this.socket);
        Call.bindSocketEvents(this.socket);
    },

    async logout() {
        try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { }
        if (this.socket) { this.socket.disconnect(); this.socket = null; }
        this.currentUser = null;
        this.showScreen('auth');
    }
};

// Expose to global scope for cross-module access
window.AVATARS = AVATARS;
window.PROFILE_COLORS = PROFILE_COLORS;

document.addEventListener('DOMContentLoaded', () => App.init());
