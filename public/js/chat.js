/* ═══════════════════════════════════════════════════════════════
   NERV COMM — Chat Module (v3)
   Real-time Friend System + Communities + Emoji + Media
   ═══════════════════════════════════════════════════════════════ */

const EMOJI_CATEGORIES = {
    '😀': ['😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊', '😋', '😎', '😍', '🥰', '😘', '😗', '😙', '🤗', '🤔', '🤨', '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '🤐', '😯', '😪', '😫', '🥱', '😴', '😌', '😛', '😜', '😝', '🤤', '😒', '😓', '😔', '😕', '🙃', '🤑', '😲', '🤯', '😳', '🥺', '😦', '😧', '😨', '😰', '😢', '😭', '😱', '😖', '😞', '😟', '😤', '😡', '🤬', '💀', '💩', '🤡', '👹', '👺', '👻', '👽', '🤖'],
    '❤️': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️', '🔥', '⭐', '🌟', '✨', '⚡', '💫', '🎵', '🎶', '🎉', '🎊', '🎁', '🎂', '🏆', '🥇', '💎', '💰', '🎯', '🚀', '🔮'],
    '👋': ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🙏', '✍️', '💪', '🦾', '🖖', '💅'],
    '🐶': ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🐢', '🐍', '🦎', '🐙', '🐠', '🐟', '🐬', '🐳', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🐘', '🦏', '🐪', '🦒'],
    '🍔': ['🍔', '🍕', '🌭', '🌮', '🌯', '🥙', '🍳', '🥘', '🍲', '🥣', '🥗', '🍿', '🍱', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣', '🍤', '🍡', '🥟', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮', '🍯', '☕', '🍵', '🥤', '🍶', '🍺', '🍻', '🥂', '🍷', '🍸', '🍹', '🍾'],
    '⚽': ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎳', '🏓', '🏸', '🥊', '🥋', '⛳', '🎣', '🎽', '🎿', '🎯', '🎮', '🕹️', '🎲', '🎭', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🎷', '🎺', '🎸', '🎻'],
};

const Chat = {
    contacts: [],
    suggestions: [],
    requests: [],
    sentRequests: new Set(),
    communities: [],
    currentChat: null,       // { type: 'dm', id, ...contact } or { type: 'community', id, ...community }
    currentCommunity: null,  // full community data with members
    unreadMap: {},
    emojiPickerOpen: false,
    replyingTo: null,
    forwardingMsg: null,

    init() {
        console.log('[AETHER] Chat.init() called');
        this.loadFriends();
        this.loadSuggestions();
        this.loadRequests();
        this.loadSentRequests();
        this.loadCommunities();
        this.bindUI();
        this.buildEmojiPicker();
        console.log('[AETHER] Chat.init() complete');
    },

    // ─── UI BINDINGS ────────────────────────────────────────────
    bindUI() {
        console.log('[AETHER] Chat.bindUI() called');
        try {
            // Sidebar tabs
            document.querySelectorAll('.sidebar-tab').forEach(t => t.addEventListener('click', () => this.switchTab(t.dataset.panel)));

            // Search
            document.getElementById('search-contacts').addEventListener('input', e => this.filterList(e.target.value));

            // Message send
            const msgInput = document.getElementById('message-input');
            msgInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); } });
            document.getElementById('btn-send').addEventListener('click', () => this.sendMessage());

            // Emoji
            document.getElementById('btn-emoji').addEventListener('click', () => this.toggleEmojiPicker());
            document.addEventListener('click', e => { if (this.emojiPickerOpen && !e.target.closest('.emoji-picker') && !e.target.closest('#btn-emoji')) this.closeEmojiPicker(); });

            // Attach
            document.getElementById('btn-attach').addEventListener('click', () => document.getElementById('file-input').click());
            document.getElementById('file-input').addEventListener('change', e => this.handleFileUpload(e));

            // Back (mobile)
            document.getElementById('btn-back').addEventListener('click', () => this.showSidebar());

            // Image preview close
            document.getElementById('btn-close-image-preview').addEventListener('click', () => { document.getElementById('image-preview-modal').style.display = 'none'; });

            // Group
            document.getElementById('btn-new-group').addEventListener('click', () => this.showGroupModal());
            document.getElementById('btn-close-group-modal').addEventListener('click', () => { document.getElementById('group-modal').style.display = 'none'; });
            document.getElementById('btn-create-group').addEventListener('click', () => this.createGroup());

            // Community modals
            console.log('[AETHER] Binding community buttons...');
            const createBtn = document.getElementById('btn-create-community');
            const submitBtn = document.getElementById('btn-submit-create-community');
            console.log('[AETHER] btn-create-community:', createBtn);
            console.log('[AETHER] btn-submit-create-community:', submitBtn);
            createBtn.addEventListener('click', () => { console.log('[AETHER] Found Order clicked!'); this.showCreateCommunityModal(); });
            document.getElementById('btn-close-create-community').addEventListener('click', () => { document.getElementById('community-create-modal').style.display = 'none'; });
            submitBtn.addEventListener('click', () => { console.log('[AETHER] Establish Order clicked!'); this.createCommunity(); });

            document.getElementById('btn-join-community').addEventListener('click', () => { document.getElementById('community-join-modal').style.display = 'flex'; document.getElementById('join-code').value = ''; document.getElementById('join-error').classList.remove('show'); document.getElementById('join-code').focus(); });
            document.getElementById('btn-close-join-community').addEventListener('click', () => { document.getElementById('community-join-modal').style.display = 'none'; });
            document.getElementById('btn-submit-join-community').addEventListener('click', () => this.joinCommunity());

            document.getElementById('btn-show-code').addEventListener('click', () => this.showAccessCode());
            document.getElementById('btn-close-code-modal').addEventListener('click', () => { document.getElementById('community-code-modal').style.display = 'none'; });
            document.getElementById('btn-copy-code').addEventListener('click', () => this.copyAccessCode());

            document.getElementById('btn-show-members').addEventListener('click', () => this.showMembersModal());
            document.getElementById('btn-close-members-modal').addEventListener('click', () => { document.getElementById('community-members-modal').style.display = 'none'; });

            // Typing
            let typingTimer;
            msgInput.addEventListener('input', () => {
                if (!this.currentChat) return;
                const payload = this.currentChat.type === 'community' ? { communityId: this.currentChat.id } : { receiverId: this.currentChat.id };
                App.socket.emit('typing', payload);
                clearTimeout(typingTimer);
                typingTimer = setTimeout(() => App.socket.emit('stop-typing', payload), 1500);
            });

            // Reply & Forward UI
            document.getElementById('btn-cancel-reply').addEventListener('click', () => this.cancelReply());
            document.getElementById('btn-close-forward').addEventListener('click', () => { document.getElementById('forward-modal').style.display = 'none'; });
            document.getElementById('forward-search').addEventListener('input', e => this.filterForwardList(e.target.value));
            console.log('[AETHER] Chat.bindUI() complete — all bindings done');
        } catch (err) {
            console.error('[AETHER] FATAL: Chat.bindUI() error:', err);
            alert('NERV ERROR in bindUI: ' + err.message);
        }
    },

    // ─── SOCKET EVENTS ─────────────────────────────────────────
    bindSocketEvents(socket) {
        // Private messages — real-time
        socket.on('private-message', msg => {
            if (this.currentChat && this.currentChat.type === 'dm' && msg.sender_id === this.currentChat.id) {
                this.appendMessage(msg);
                socket.emit('messages-read', { senderId: msg.sender_id });
            } else {
                this.unreadMap[msg.sender_id] = (this.unreadMap[msg.sender_id] || 0) + 1;
                this.renderContacts();
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification(msg.sender_name, { body: msg.type === 'image' ? '📷 Image' : msg.content, icon: '/favicon.ico' });
                }
            }
        });

        // Sent confirmation — append to chat immediately
        socket.on('message-sent', msg => { this.appendMessage(msg); });

        // User status — real-time online/offline
        socket.on('user-status', data => { this.updateContactStatus(data); });

        // Typing — real-time
        socket.on('typing', data => {
            if (data.communityId) {
                if (this.currentChat && this.currentChat.type === 'community' && this.currentChat.id === data.communityId) {
                    this.showTyping(data.username);
                }
            } else if (this.currentChat && this.currentChat.type === 'dm' && data.userId === this.currentChat.id) {
                this.showTyping(data.username);
            }
        });
        socket.on('stop-typing', data => {
            if (data.communityId) {
                if (this.currentChat && this.currentChat.type === 'community' && this.currentChat.id === data.communityId) this.hideTyping();
            } else if (this.currentChat && this.currentChat.type === 'dm' && data.userId === this.currentChat.id) this.hideTyping();
        });

        // Read receipts — real-time blue ticks
        socket.on('messages-read', data => {
            document.querySelectorAll('.msg-read-icon.pending').forEach(el => { el.textContent = '✓✓'; el.classList.remove('pending'); el.style.color = 'var(--nerv-cyan)'; });
        });

        // Friend request received — real-time notification
        socket.on('friend-request-received', data => {
            this.loadRequests();
            this.loadSuggestions();
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('Friend Request', { body: `${data.sender.username} wants to be your friend`, icon: '/favicon.ico' });
            }
        });

        // Friend accepted — real-time update friend list
        socket.on('friend-request-accepted', data => {
            this.loadFriends();
            this.loadSuggestions();
            this.loadRequests();
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('Request Accepted', { body: `${data.friend.username} accepted your request!`, icon: '/favicon.ico' });
            }
        });

        // Friend rejected
        socket.on('friend-request-rejected', data => {
            this.sentRequests.delete(data.userId);
            this.loadSuggestions();
        });

        // Community messages — real-time
        socket.on('community-message', (msg) => {
            if (msg.sender_id === App.currentUser.id) return;
            if (this.currentChat && this.currentChat.type === 'community' && this.currentChat.id === msg.community_id) {
                this.appendMessage(msg);
            } else {
                const key = 'c:' + msg.community_id;
                this.unreadMap[key] = (this.unreadMap[key] || 0) + 1;
                this.renderCommunities();
            }
        });

        socket.on('message-reaction', (data) => {
            this.addReactionToDOM(data.messageId, data.emoji, data.userId, data.count, data.me);
        });

        socket.on('delete-message', (data) => {
            const el = document.querySelector(`[data-msg-id="${data.messageId}"]`);
            if (el) {
                el.style.transition = 'opacity 0.3s, transform 0.3s';
                el.style.opacity = '0';
                el.style.transform = 'scale(0.8)';
                setTimeout(() => el.remove(), 300);
            }
        });

        // Community member joined
        socket.on('community-member-joined', data => {
            if (this.currentChat && this.currentChat.type === 'community' && this.currentChat.id === data.communityId) {
                this.appendSystemMessage(`${data.user.username} joined the order`);
            }
        });

        // Message deleted for all — real-time removal
        socket.on('message-deleted', data => {
            const el = document.querySelector(`[data-msg-id="${data.messageId}"]`);
            if (el) {
                el.style.transition = 'opacity 0.3s, transform 0.3s';
                el.style.opacity = '0';
                el.style.transform = 'scale(0.8)';
                setTimeout(() => el.remove(), 300);
            }
        });
    },

    // ─── TABS ───────────────────────────────────────────────────
    switchTab(panel) {
        document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.toggle('active', t.dataset.panel === panel));
        document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.toggle('active', p.id === `panel-${panel}`));
        if (panel === 'suggestions') this.loadSuggestions();
        if (panel === 'requests') this.loadRequests();
        if (panel === 'communities') this.loadCommunities();
    },

    // ─── FRIEND SYSTEM ─────────────────────────────────────────
    async loadFriends() {
        try {
            const r = await fetch('/api/friends');
            if (!r.ok) return;
            this.contacts = await r.json();
            this.renderContacts();
            document.getElementById('stat-friends').textContent = this.contacts.length;
            document.getElementById('stat-online').textContent = this.contacts.filter(c => c.online).length;
        } catch (e) { console.error('[AETHER] Load friends:', e); }
    },

    async loadSuggestions() {
        try {
            const r = await fetch('/api/suggestions');
            if (!r.ok) return;
            this.suggestions = await r.json();
            this.renderSuggestions();
        } catch (e) { console.error('[AETHER] Load suggestions:', e); }
    },

    async loadRequests() {
        try {
            const r = await fetch('/api/friends/requests');
            if (!r.ok) return;
            this.requests = await r.json();
            this.renderRequests();
            const badge = document.getElementById('requests-badge');
            if (this.requests.length > 0) { badge.textContent = this.requests.length; badge.style.display = 'flex'; }
            else { badge.style.display = 'none'; }
        } catch (e) { console.error('[AETHER] Load requests:', e); }
    },

    async loadSentRequests() {
        try {
            const r = await fetch('/api/friends/sent');
            if (!r.ok) return;
            const sent = await r.json();
            this.sentRequests = new Set(sent.map(s => s.id));
        } catch (e) { }
    },

    async sendFriendRequest(userId) {
        try {
            const r = await fetch('/api/friends/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
            if (r.ok) {
                this.sentRequests.add(userId);
                App.socket.emit('friend-request', { receiverId: userId });
                this.renderSuggestions();
            }
        } catch (e) { console.error('[AETHER] Send request:', e); }
    },

    async acceptRequest(requestId, friendUserId) {
        try {
            const r = await fetch('/api/friends/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId }) });
            if (r.ok) {
                const data = await r.json();
                App.socket.emit('friend-accepted', { friendId: data.friend.id });
                this.loadFriends();
                this.loadRequests();
                this.loadSuggestions();
            }
        } catch (e) { console.error('[AETHER] Accept:', e); }
    },

    async rejectRequest(requestId, friendUserId) {
        try {
            const r = await fetch('/api/friends/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId }) });
            if (r.ok) {
                if (friendUserId) App.socket.emit('friend-rejected', { friendId: friendUserId });
                this.loadRequests();
            }
        } catch (e) { console.error('[AETHER] Reject:', e); }
    },

    // ─── COMMUNITIES ───────────────────────────────────────────
    async loadCommunities() {
        try {
            const r = await fetch('/api/communities');
            if (!r.ok) return;
            this.communities = await r.json();
            this.renderCommunities();
        } catch (e) { console.error('[AETHER] Load communities:', e); }
    },

    showCreateCommunityModal() {
        console.log('[AETHER] showCreateCommunityModal() called');
        try {
            const picker = document.getElementById('community-avatar-picker');
            const AVS = window.AVATARS || [{ id: 'default', emoji: '👤' }];
            console.log('[AETHER] AVATARS available:', AVS.length);
            picker.innerHTML = AVS.map(a => `<div class="avatar-option ${a.id === 'default' ? 'selected' : ''}" data-avatar="${a.id}">${a.emoji}</div>`).join('');
            picker.querySelectorAll('.avatar-option').forEach(o => o.addEventListener('click', () => {
                picker.querySelectorAll('.avatar-option').forEach(x => x.classList.remove('selected'));
                o.classList.add('selected');
            }));
            const cp = document.getElementById('community-color-picker');
            const COLS = window.PROFILE_COLORS || ['#CC0000'];
            cp.innerHTML = COLS.map(c => `<div class="color-option" data-color="${c}" style="background:${c}"></div>`).join('');
            cp.querySelectorAll('.color-option').forEach(o => o.addEventListener('click', () => {
                cp.querySelectorAll('.color-option').forEach(x => x.classList.remove('selected'));
                o.classList.add('selected');
            }));
            document.getElementById('community-name').value = '';
            document.getElementById('community-desc').value = '';
            document.getElementById('community-create-modal').style.display = 'flex';
            console.log('[AETHER] Create community modal opened');
        } catch (err) {
            console.error('[AETHER] showCreateCommunityModal error:', err);
            alert('Error opening modal: ' + err.message);
        }
    },

    async createCommunity() {
        console.log('[AETHER] createCommunity() called');
        const name = document.getElementById('community-name').value.trim();
        const desc = document.getElementById('community-desc').value.trim();
        const av = document.querySelector('#community-avatar-picker .avatar-option.selected');
        const co = document.querySelector('#community-color-picker .color-option.selected');
        console.log('[AETHER] Community data:', { name, desc, avatar: av?.dataset.avatar, color: co?.dataset.color });
        if (!name) { console.warn('[AETHER] Empty name, returning'); alert('Please enter a community name'); return; }
        try {
            console.log('[AETHER] Sending POST /api/communities...');
            const r = await fetch('/api/communities', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description: desc, avatar: av?.dataset.avatar || 'default', avatar_color: co?.dataset.color || '#CC0000' })
            });
            console.log('[AETHER] Response status:', r.status);
            if (r.ok) {
                const community = await r.json();
                console.log('[AETHER] Community created:', community);
                document.getElementById('community-create-modal').style.display = 'none';
                App.socket.emit('join-community', { communityId: community.id });
                this.loadCommunities();
                setTimeout(() => {
                    document.getElementById('code-reveal').textContent = community.access_code;
                    document.getElementById('community-code-modal').style.display = 'flex';
                }, 300);
            } else {
                const errData = await r.json();
                console.error('[AETHER] Create community error:', errData);
                alert('Failed: ' + (errData.error || 'Unknown error'));
            }
        } catch (e) { console.error('[AETHER] Create community:', e); alert('Network error: ' + e.message); }
    },

    async joinCommunity() {
        const code = document.getElementById('join-code').value.trim();
        const err = document.getElementById('join-error');
        err.classList.remove('show');
        if (!code) { err.textContent = 'Enter an access code'; err.classList.add('show'); return; }
        try {
            const r = await fetch('/api/communities/join', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ access_code: code })
            });
            const data = await r.json();
            if (!r.ok) { err.textContent = data.error; err.classList.add('show'); return; }
            document.getElementById('community-join-modal').style.display = 'none';
            alert(data.message || 'Join request sent! Waiting for approval.');
        } catch (e) { err.textContent = 'Connection failed'; err.classList.add('show'); }
    },

    async showAccessCode() {
        if (!this.currentChat || this.currentChat.type !== 'community') return;
        try {
            const r = await fetch(`/api/communities/${this.currentChat.id}/code`);
            if (r.ok) {
                const data = await r.json();
                document.getElementById('code-reveal').textContent = data.access_code;
                document.getElementById('community-code-modal').style.display = 'flex';
            } else {
                const data = await r.json();
                alert(data.error || 'Only owner/admin can view the code');
            }
        } catch (e) { console.error('[AETHER] Get code:', e); }
    },

    copyAccessCode() {
        const code = document.getElementById('code-reveal').textContent;
        navigator.clipboard.writeText(code).then(() => {
            const btn = document.getElementById('btn-copy-code');
            btn.querySelector('.btn-text').textContent = '✅ COPIED!';
            setTimeout(() => { btn.querySelector('.btn-text').textContent = '📋 COPY CODE'; }, 2000);
        });
    },

    async showMembersModal() {
        if (!this.currentChat || this.currentChat.type !== 'community') return;
        try {
            const r = await fetch(`/api/communities/${this.currentChat.id}`);
            if (!r.ok) return;
            const data = await r.json();
            const isOwner = data.role === 'owner';
            const isAdmin = data.role === 'admin' || isOwner;
            const list = document.getElementById('community-members-list');

            // Render active members
            let html = data.members.map(m => {
                const avatarContent = renderAvatarContent(m.avatar, m.username, m.avatar_color);
                const roleLabel = m.role === 'owner' ? '\ud83d\udc51 FOUNDER' : m.role === 'admin' ? '\u2694\ufe0f ADMIN' : '\ud83d\udee1\ufe0f MEMBER';
                let actions = '';
                if (isOwner && m.role !== 'owner' && m.id !== App.currentUser.id) {
                    const promoteLabel = m.role === 'admin' ? 'Demote' : 'Promote';
                    actions = `<div class="member-actions">
                        <button class="btn-member-action btn-promote" onclick="Chat.promoteMember('${m.id}')">${promoteLabel}</button>
                        <button class="btn-member-action btn-kick" onclick="Chat.kickMember('${m.id}')">Kick</button>
                    </div>`;
                } else if (isAdmin && m.role === 'member' && m.id !== App.currentUser.id) {
                    actions = `<div class="member-actions">
                        <button class="btn-member-action btn-kick" onclick="Chat.kickMember('${m.id}')">Kick</button>
                    </div>`;
                }
                return `<div class="member-item">
                    <div class="hex-avatar" style="background:${m.avatar_color};width:32px;height:32px;font-size:13px;">${avatarContent}</div>
                    <div class="member-item-info">
                        <div class="member-item-name">${m.username}</div>
                        <div class="member-item-role">${roleLabel}</div>
                    </div>
                    ${m.online ? '<div class="contact-online" style="position:static;width:7px;height:7px;"></div>' : ''}
                    ${actions}
                </div>`;
            }).join('');

            // Fetch and render pending requests (for owner/admin)
            if (isAdmin) {
                try {
                    const rr = await fetch(`/api/communities/${this.currentChat.id}/requests`);
                    if (rr.ok) {
                        const pending = await rr.json();
                        if (pending.length > 0) {
                            html += `<div class="pending-requests-header">\u23f3 PENDING REQUESTS (${pending.length})</div>`;
                            html += pending.map(p => {
                                const avatarContent = renderAvatarContent(p.avatar, p.username, p.avatar_color);
                                return `<div class="member-item pending">
                                    <div class="hex-avatar" style="background:${p.avatar_color};width:32px;height:32px;font-size:13px;">${avatarContent}</div>
                                    <div class="member-item-info">
                                        <div class="member-item-name">${p.username}</div>
                                        <div class="member-item-role">Wants to join</div>
                                    </div>
                                    <div class="member-actions">
                                        <button class="btn-member-action btn-approve" onclick="Chat.approveJoin('${p.user_id}')">\u2713</button>
                                        <button class="btn-member-action btn-reject" onclick="Chat.rejectJoin('${p.user_id}')">\u2717</button>
                                    </div>
                                </div>`;
                            }).join('');
                        }
                    }
                } catch (e) { console.error('[AETHER] Load requests:', e); }
            }

            list.innerHTML = html;
            document.getElementById('community-members-modal').style.display = 'flex';
        } catch (e) { console.error('[AETHER] Members:', e); }
    },

    async approveJoin(userId) {
        try {
            const r = await fetch(`/api/communities/${this.currentChat.id}/approve`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            if (r.ok) { this.showMembersModal(); }
            else { const d = await r.json(); alert(d.error); }
        } catch (e) { console.error('[AETHER] Approve:', e); }
    },

    async rejectJoin(userId) {
        try {
            const r = await fetch(`/api/communities/${this.currentChat.id}/reject`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            if (r.ok) { this.showMembersModal(); }
            else { const d = await r.json(); alert(d.error); }
        } catch (e) { console.error('[AETHER] Reject:', e); }
    },

    async promoteMember(userId) {
        try {
            const r = await fetch(`/api/communities/${this.currentChat.id}/promote`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            if (r.ok) { this.showMembersModal(); }
            else { const d = await r.json(); alert(d.error); }
        } catch (e) { console.error('[AETHER] Promote:', e); }
    },

    async kickMember(userId) {
        if (!confirm('Remove this member?')) return;
        try {
            const r = await fetch(`/api/communities/${this.currentChat.id}/kick`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });
            if (r.ok) { this.showMembersModal(); }
            else { const d = await r.json(); alert(d.error); }
        } catch (e) { console.error('[AETHER] Kick:', e); }
    },

    renderCommunities() {
        const list = document.getElementById('communities-list');
        if (this.communities.length === 0) {
            list.innerHTML = `<div class="panel-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
        <p class="panel-empty-title">NO SECRET ORDERS</p>
        <p class="panel-empty-text">Found an order or enter an access code to join</p>
      </div>`;
            return;
        }
        list.innerHTML = this.communities.map(c => {
            const isActive = this.currentChat && this.currentChat.type === 'community' && this.currentChat.id === c.id;
            const avatarContent = renderAvatarContent(c.avatar, c.name, c.avatar_color);
            const unread = this.unreadMap['c:' + c.id] || 0;
            const roleBadge = c.role === 'owner' ? '<span class="community-role-badge owner">FOUNDER</span>' : c.role === 'admin' ? '<span class="community-role-badge admin">ADMIN</span>' : '';
            return `<div class="community-item ${isActive ? 'active' : ''}" data-community-id="${c.id}">
        <div class="community-icon" style="background:${c.avatar_color}">${avatarContent}</div>
        <div class="community-info">
          <div class="community-name">${c.name}</div>
          <div class="community-meta">${c.member_count} members ${roleBadge}</div>
        </div>
        ${unread > 0 ? `<span class="contact-unread">${unread}</span>` : ''}
      </div>`;
        }).join('');
        list.querySelectorAll('.community-item').forEach(el => el.addEventListener('click', () => this.openCommunityChat(el.dataset.communityId)));
    },

    // ─── RENDER CONTACTS ───────────────────────────────────────
    renderContacts() {
        const list = document.getElementById('contacts-list');
        if (this.contacts.length === 0) {
            list.innerHTML = `<div class="panel-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <p class="panel-empty-title">NO FRIENDS YET</p>
        <p class="panel-empty-text">Go to Discover to find pilots</p>
      </div>`;
            return;
        }
        list.innerHTML = this.contacts.map(c => {
            const isActive = this.currentChat && this.currentChat.type === 'dm' && this.currentChat.id === c.id;
            const avatarContent = renderAvatarContent(c.avatar, c.username, c.avatar_color);
            const unread = this.unreadMap[c.id] || 0;
            const lastMsg = c.online ? 'Online' : c.last_seen ? `Last seen ${this.formatTime(c.last_seen)}` : 'Offline';
            return `<div class="contact-item ${isActive ? 'active' : ''}" data-user-id="${c.id}" data-username="${c.username}">
        <div class="contact-avatar"><div class="hex-avatar" style="background:${c.avatar_color}">${avatarContent}</div><div class="contact-online ${c.online ? '' : 'offline'}"></div></div>
        <div class="contact-info"><div class="contact-name">${c.username}</div><div class="contact-last-msg">${lastMsg}</div></div>
        <div class="contact-meta">${unread > 0 ? `<span class="contact-unread">${unread}</span>` : ''}</div>
      </div>`;
        }).join('');
        list.querySelectorAll('.contact-item').forEach(el => el.addEventListener('click', () => this.openDMChat(el.dataset.userId)));
    },

    renderSuggestions() {
        const list = document.getElementById('suggestions-list');
        if (this.suggestions.length === 0) {
            list.innerHTML = `<div class="panel-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <p class="panel-empty-title">NO SUGGESTIONS</p>
        <p class="panel-empty-text">All pilots are your friends!</p>
      </div>`;
            return;
        }
        list.innerHTML = this.suggestions.map(s => {
            const avatarContent = renderAvatarContent(s.avatar, s.username, s.avatar_color);
            const isSent = this.sentRequests.has(s.id);
            return `<div class="suggestion-card" data-user-id="${s.id}">
        <div class="hex-avatar" style="background:${s.avatar_color}">${avatarContent}</div>
        <div class="suggestion-info"><div class="suggestion-name">${s.username}</div><div class="suggestion-status">${s.status || 'Available'}</div></div>
        <button class="btn-add-friend ${isSent ? 'sent' : ''}" data-user-id="${s.id}" ${isSent ? 'disabled' : ''}>${isSent ? 'SENT' : 'ADD'}</button>
      </div>`;
        }).join('');
        list.querySelectorAll('.btn-add-friend:not(.sent)').forEach(btn => btn.addEventListener('click', () => this.sendFriendRequest(btn.dataset.userId)));
    },

    renderRequests() {
        const list = document.getElementById('requests-list');
        if (this.requests.length === 0) {
            list.innerHTML = `<div class="panel-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
        <p class="panel-empty-title">NO PENDING REQUESTS</p>
        <p class="panel-empty-text">Friend requests will appear here</p>
      </div>`;
            return;
        }
        list.innerHTML = this.requests.map(req => {
            const avatarContent = renderAvatarContent(req.avatar, req.username, req.avatar_color);
            return `<div class="request-card">
        <div class="hex-avatar" style="background:${req.avatar_color}">${avatarContent}</div>
        <div class="request-info"><div class="request-name">${req.username}</div><div class="request-time">${this.formatTime(req.requested_at)}</div></div>
        <div class="request-actions">
          <button class="btn-accept" data-id="${req.request_id}" data-uid="${req.sender_id || req.id}">ACCEPT</button>
          <button class="btn-reject" data-id="${req.request_id}" data-uid="${req.sender_id || req.id}">DECLINE</button>
        </div>
      </div>`;
        }).join('');
        list.querySelectorAll('.btn-accept').forEach(btn => btn.addEventListener('click', () => this.acceptRequest(parseInt(btn.dataset.id), btn.dataset.uid)));
        list.querySelectorAll('.btn-reject').forEach(btn => btn.addEventListener('click', () => this.rejectRequest(parseInt(btn.dataset.id), btn.dataset.uid)));
    },

    filterList(q) {
        const lower = q.toLowerCase();
        document.querySelectorAll('.contact-item').forEach(el => { el.style.display = el.dataset.username.toLowerCase().includes(lower) ? '' : 'none'; });
        document.querySelectorAll('.suggestion-card').forEach(el => {
            const name = el.querySelector('.suggestion-name');
            el.style.display = name && name.textContent.toLowerCase().includes(lower) ? '' : 'none';
        });
        document.querySelectorAll('.community-item').forEach(el => {
            const name = el.querySelector('.community-name');
            el.style.display = name && name.textContent.toLowerCase().includes(lower) ? '' : 'none';
        });
    },

    // ─── OPEN CHAT ──────────────────────────────────────────────
    openDMChat(userId) {
        const contact = this.contacts.find(c => c.id === userId);
        if (!contact) return;

        this.currentChat = { type: 'dm', ...contact };
        this.currentCommunity = null;
        this.unreadMap[userId] = 0;
        this.renderContacts();

        document.getElementById('chat-empty').style.display = 'none';
        document.getElementById('chat-active').style.display = 'flex';

        // Header
        const av = document.getElementById('chat-avatar');
        av.style.background = contact.avatar_color;
        av.innerHTML = renderAvatarContent(contact.avatar, contact.username);
        document.getElementById('chat-name').textContent = contact.username;
        document.getElementById('chat-status').textContent = contact.online ? 'ONLINE' : 'OFFLINE';
        document.getElementById('chat-status').style.color = contact.online ? 'var(--nerv-green)' : 'var(--text-muted)';

        // Hide community buttons
        document.getElementById('btn-show-code').style.display = 'none';
        document.getElementById('btn-show-members').style.display = 'none';

        this.loadMessages(`/api/messages/${userId}`);
        this.hideSidebar();
        App.socket.emit('messages-read', { senderId: userId });
        document.getElementById('message-input').focus();
    },

    openCommunityChat(communityId) {
        const community = this.communities.find(c => c.id === communityId);
        if (!community) return;

        this.currentChat = { type: 'community', ...community };
        this.currentCommunity = community;
        this.unreadMap['c:' + communityId] = 0;
        this.renderCommunities();

        document.getElementById('chat-empty').style.display = 'none';
        document.getElementById('chat-active').style.display = 'flex';

        const av = document.getElementById('chat-avatar');
        av.style.background = community.avatar_color;
        av.innerHTML = renderAvatarContent(community.avatar, community.name);
        document.getElementById('chat-name').textContent = community.name;
        document.getElementById('chat-status').textContent = `${community.member_count} MEMBERS`;
        document.getElementById('chat-status').style.color = 'var(--nerv-purple)';

        // Show community buttons conditionally
        document.getElementById('btn-show-code').style.display = (community.role === 'owner' || community.role === 'admin') ? 'flex' : 'none';
        document.getElementById('btn-show-members').style.display = 'flex';

        this.loadMessages(`/api/communities/${communityId}/messages`);
        this.hideSidebar();
        document.getElementById('message-input').focus();
    },

    showSidebar() {
        document.getElementById('sidebar').classList.remove('hidden');
        if (window.innerWidth <= 768) {
            document.getElementById('chat-active').style.display = 'none';
            document.getElementById('chat-empty').style.display = 'flex';
        }
    },
    hideSidebar() {
        if (window.innerWidth <= 768) document.getElementById('sidebar').classList.add('hidden');
    },

    // ─── MESSAGES ───────────────────────────────────────────────
    async loadMessages(endpoint) {
        const list = document.getElementById('messages-list');
        list.innerHTML = '';
        try {
            const r = await fetch(endpoint);
            if (!r.ok) return;
            const msgs = await r.json();
            msgs.forEach(m => this.appendMessage(m));
            this.scrollToBottom();
        } catch (e) { console.error('[AETHER] Load messages:', e); }
    },

    appendMessage(msg) {
        const list = document.getElementById('messages-list');
        const isSent = msg.sender_id === App.currentUser.id;
        const div = document.createElement('div');
        div.className = `message ${isSent ? 'sent' : 'received'}`;
        div.setAttribute('data-msg-id', msg.id);
        div.setAttribute('data-sender-id', msg.sender_id);

        const color = isSent ? App.currentUser.avatar_color : (msg.sender_color || '#CC0000');
        const avatarId = isSent ? App.currentUser.avatar : (msg.sender_avatar || 'default');
        const avatarContent = renderAvatarContent(avatarId, msg.sender_name, color);
        const time = this.formatTime(msg.timestamp);
        const readIcon = (isSent && this.currentChat?.type === 'dm') ? (msg.read ? '<span class="msg-read-icon" style="color:var(--nerv-cyan)">\u2713\u2713</span>' : '<span class="msg-read-icon pending">\u2713</span>') : '';

        // Reply quote rendering
        let replyHTML = '';
        if (msg.reply_to_id) {
            replyHTML = `
                <div class="msg-reply-quote" onclick="Chat.scrollToMessage('${msg.reply_to_id}')">
                    <div class="reply-quote-name">${msg.reply_to_name || 'User'}</div>
                    <div class="reply-quote-text">${this.escapeHtml(msg.reply_to_content || 'Message')}</div>
                </div>
            `;
        }

        let contentHTML = '';
        if (msg.type === 'image') {
            contentHTML = `<img class="msg-image" src="${msg.content}" alt="Image" onclick="Chat.previewImage('${msg.content}')">`;
        } else {
            contentHTML = `<div class="msg-bubble">${this.escapeHtml(msg.content)}</div>`;
        }

        div.innerHTML = `
      <div class="msg-avatar hex-avatar" style="background:${color}">${avatarContent}</div>
      <div class="msg-content">
        ${!isSent ? `<div class="msg-name">${msg.sender_name}</div>` : ''}
        ${replyHTML}
        ${contentHTML}
        <div class="reactions-container" id="reactions-${msg.id}"></div>
        <div class="msg-time">${time} ${readIcon}</div>
      </div>
    `;

        // Render existing reactions if any
        if (msg.reactions) {
            msg.reactions.forEach(r => this.addReactionToDOM(msg.id, r.emoji, r.user_id, r.count, r.me));
        }

        // Right-click context menu for delete
        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showMsgContextMenu(e, msg.id, isSent);
        });

        // Long-press for mobile
        let longPressTimer;
        div.addEventListener('touchstart', (e) => {
            longPressTimer = setTimeout(() => {
                e.preventDefault();
                const touch = e.touches[0];
                this.showMsgContextMenu({ pageX: touch.pageX, pageY: touch.pageY }, msg.id, isSent);
            }, 500);
        }, { passive: true });
        div.addEventListener('touchend', () => clearTimeout(longPressTimer));
        div.addEventListener('touchmove', () => clearTimeout(longPressTimer));

        list.appendChild(div);
        this.scrollToBottom();
    },

    showMsgContextMenu(e, msgId, isSender) {
        this.hideMsgContextMenu();
        const menu = document.createElement('div');
        menu.id = 'msg-context-menu';
        menu.className = 'msg-context-menu';

        const contentText = msgId ? (document.querySelector(`[data-msg-id="${msgId}"] .msg-bubble`)?.textContent || 'Image') : '';

        menu.innerHTML = `
            <div class="ctx-option" onclick="Chat.copyToClipboard('${contentText}')">
                <span class="ctx-icon">📋</span> Copy
            </div>
            <div class="ctx-option" onclick="Chat.startReply('${msgId}')">
                <span class="ctx-icon">↩️</span> Reply
            </div>
            <div class="ctx-option" onclick="Chat.tagUser('${msgId}')">
                <span class="ctx-icon">🏷️</span> Tag
            </div>
            <div class="ctx-option" onclick="Chat.showForwardModal('${msgId}')">
                <span class="ctx-icon">➡️</span> Forward
            </div>
            <div class="ctx-option" onclick="Chat.showQuickReactions(event, '${msgId}')">
                <span class="ctx-icon">😀</span> React
            </div>
            <div class="ctx-option" onclick="Chat.deleteForMe('${msgId}')">
                <span class="ctx-icon">🗑️</span> Delete for me
            </div>
            ${isSender ? `
            <div class="ctx-option ctx-danger" onclick="Chat.deleteForAll('${msgId}')">
                <span class="ctx-icon">❌</span> Delete for everyone
            </div>` : ''}
        `;

        document.body.appendChild(menu);

        // Position the menu
        const menuWidth = 200;
        const menuHeight = isSender ? 88 : 44;
        let x = e.pageX;
        let y = e.pageY;
        if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
        if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';

        // Close on click away
        setTimeout(() => {
            document.addEventListener('click', this._ctxClose = () => this.hideMsgContextMenu(), { once: true });
        }, 10);
    },

    hideMsgContextMenu() {
        const old = document.getElementById('msg-context-menu');
        if (old) old.remove();
    },

    async deleteForMe(msgId) {
        this.hideMsgContextMenu();
        try {
            const r = await fetch(`/api/messages/${msgId}/for-me`, { method: 'DELETE' });
            if (r.ok) {
                const el = document.querySelector(`[data-msg-id="${msgId}"]`);
                if (el) {
                    el.style.transition = 'opacity 0.3s, transform 0.3s';
                    el.style.opacity = '0';
                    el.style.transform = 'scale(0.8)';
                    setTimeout(() => el.remove(), 300);
                }
            } else {
                const d = await r.json();
                alert(d.error || 'Failed to delete');
            }
        } catch (e) { console.error('[AETHER] Delete for me:', e); }
    },

    async deleteForAll(msgId) {
        this.hideMsgContextMenu();
        if (!confirm('Delete this message for everyone?')) return;
        try {
            const r = await fetch(`/api/messages/${msgId}/for-all`, { method: 'DELETE' });
            if (r.ok) {
                const data = await r.json();
                // Remove from own DOM
                const el = document.querySelector(`[data-msg-id="${msgId}"]`);
                if (el) {
                    el.style.transition = 'opacity 0.3s, transform 0.3s';
                    el.style.opacity = '0';
                    el.style.transform = 'scale(0.8)';
                    setTimeout(() => el.remove(), 300);
                }
                // Broadcast to others via socket
                App.socket.emit('delete-message', {
                    messageId: msgId,
                    receiverId: data.receiverId,
                    communityId: data.communityId
                });
            } else {
                const d = await r.json();
                alert(d.error || 'Failed to delete');
            }
        } catch (e) { console.error('[AETHER] Delete for all:', e); }
    },

    appendSystemMessage(text) {
        const list = document.getElementById('messages-list');
        const div = document.createElement('div');
        div.className = 'system-message';
        div.style.cssText = 'text-align:center;padding:8px;font-family:var(--font-mono);font-size:11px;color:var(--text-muted);letter-spacing:1px;';
        div.textContent = `— ${text} —`;
        list.appendChild(div);
        this.scrollToBottom();
    },

    sendMessage() {
        const input = document.getElementById('message-input');
        const text = input.value.trim();
        if (!text || !this.currentChat) return;

        if (this.currentChat.type === 'community') {
            const payload = { communityId: this.currentChat.id, content: text, type: 'text' };
            if (this.replyingTo) payload.replyToId = this.replyingTo;

            App.socket.emit('community-message', payload);
            // Append own message immediately
            this.appendMessage({
                id: Date.now().toString(),
                sender_id: App.currentUser.id,
                sender_name: App.currentUser.username,
                sender_color: App.currentUser.avatar_color,
                sender_avatar: App.currentUser.avatar,
                content: text, type: 'text',
                timestamp: new Date().toISOString(),
                reply_to_id: this.replyingTo,
                reply_to_name: this.replyingTo ? document.querySelector(`[data-msg-id="${this.replyingTo}"] .msg-name`)?.textContent || App.currentUser.username : null,
                reply_to_content: this.replyingTo ? document.querySelector(`[data-msg-id="${this.replyingTo}"] .msg-bubble`)?.textContent || 'Image' : null
            });
        } else {
            const payload = { receiverId: this.currentChat.id, content: text, type: 'text' };
            if (this.replyingTo) payload.replyToId = this.replyingTo;
            App.socket.emit('private-message', payload);
        }
        input.value = '';
        this.cancelReply();
        this.closeEmojiPicker();
    },

    // ─── MEDIA ──────────────────────────────────────────────────
    async handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file || !this.currentChat) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const r = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await r.json();
            if (r.ok && data.url) {
                if (this.currentChat.type === 'community') {
                    App.socket.emit('community-message', { communityId: this.currentChat.id, content: data.url, type: 'image' });
                    this.appendMessage({
                        id: Date.now().toString(), sender_id: App.currentUser.id,
                        sender_name: App.currentUser.username, sender_color: App.currentUser.avatar_color,
                        sender_avatar: App.currentUser.avatar, content: data.url, type: 'image',
                        timestamp: new Date().toISOString()
                    });
                } else {
                    App.socket.emit('private-message', { receiverId: this.currentChat.id, content: data.url, type: 'image' });
                }
            }
        } catch (e) { console.error('[AETHER] Upload:', e); }
        e.target.value = '';
    },

    previewImage(url) {
        document.getElementById('image-preview-img').src = url;
        document.getElementById('image-preview-modal').style.display = 'flex';
    },

    // ─── EMOJI ──────────────────────────────────────────────────
    buildEmojiPicker() {
        const tabs = document.getElementById('emoji-category-tabs');
        const cats = Object.keys(EMOJI_CATEGORIES);
        tabs.innerHTML = cats.map((k, i) => `<button class="emoji-cat-btn ${i === 0 ? 'active' : ''}" data-cat="${k}">${k}</button>`).join('');
        this.renderEmojiGrid(cats[0]);
        tabs.querySelectorAll('.emoji-cat-btn').forEach(btn => btn.addEventListener('click', () => {
            tabs.querySelectorAll('.emoji-cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.renderEmojiGrid(btn.dataset.cat);
        }));
    },
    renderEmojiGrid(cat) {
        const grid = document.getElementById('emoji-grid');
        grid.innerHTML = (EMOJI_CATEGORIES[cat] || []).map(e => `<div class="emoji-item" data-emoji="${e}">${e}</div>`).join('');
        grid.querySelectorAll('.emoji-item').forEach(el => el.addEventListener('click', () => {
            document.getElementById('message-input').value += el.dataset.emoji;
            document.getElementById('message-input').focus();
        }));
    },
    toggleEmojiPicker() { this.emojiPickerOpen ? this.closeEmojiPicker() : this.openEmojiPicker(); },
    openEmojiPicker() { document.getElementById('emoji-picker').style.display = 'block'; this.emojiPickerOpen = true; },
    closeEmojiPicker() { document.getElementById('emoji-picker').style.display = 'none'; this.emojiPickerOpen = false; },

    // ─── TYPING ─────────────────────────────────────────────────
    showTyping(name) {
        document.getElementById('typing-name').textContent = name + ' is typing';
        document.getElementById('typing-indicator').style.display = 'flex';
        this.scrollToBottom();
    },
    hideTyping() { document.getElementById('typing-indicator').style.display = 'none'; },

    // ─── GROUP ──────────────────────────────────────────────────
    showGroupModal() {
        const list = document.getElementById('member-select-list');
        list.innerHTML = this.contacts.map(c => {
            const avatarContent = renderAvatarContent(c.avatar, c.username, c.avatar_color);
            return `<label class="member-option"><input type="checkbox" value="${c.id}"><div class="hex-avatar" style="background:${c.avatar_color};width:28px;height:28px;font-size:11px;">${avatarContent}</div><span class="member-option-name">${c.username}</span></label>`;
        }).join('');
        document.getElementById('group-modal').style.display = 'flex';
    },
    async createGroup() {
        const name = document.getElementById('group-name').value.trim();
        const memberIds = [...document.querySelectorAll('#member-select-list input:checked')].map(el => el.value);
        if (!name || memberIds.length === 0) return;
        try {
            await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, memberIds }) });
            document.getElementById('group-modal').style.display = 'none';
        } catch (e) { console.error('[AETHER] Group create:', e); }
    },

    // ─── STATUS ─────────────────────────────────────────────────
    updateContactStatus(data) {
        const c = this.contacts.find(c => c.id === data.userId);
        if (c) {
            c.online = data.online;
            this.renderContacts();
            document.getElementById('stat-online').textContent = this.contacts.filter(c => c.online).length;
            if (this.currentChat && this.currentChat.type === 'dm' && this.currentChat.id === data.userId) {
                document.getElementById('chat-status').textContent = data.online ? 'ONLINE' : 'OFFLINE';
                document.getElementById('chat-status').style.color = data.online ? 'var(--nerv-green)' : 'var(--text-muted)';
            }
        }
    },

    // ─── UTILS ──────────────────────────────────────────────────
    scrollToBottom() {
        const c = document.getElementById('messages-container');
        requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; });
    },
    scrollToMessage(msgId) {
        const el = document.querySelector(`[data-msg-id="${msgId}"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('highlight-flash');
            setTimeout(() => el.classList.remove('highlight-flash'), 2000);
        }
    },
    escapeHtml(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; },
    formatTime(ts) {
        if (!ts) return '';
        const d = new Date(ts); const now = new Date();
        const diff = now - d; const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now'; if (mins < 60) return mins + 'm ago';
        const hrs = Math.floor(mins / 60); if (hrs < 24) return hrs + 'h ago';
        return d.toLocaleDateString();
    },

    // ─── MESSAGE ACTIONS ────────────────────────────────────────
    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.hideMsgContextMenu();
        });
    },

    startReply(msgId) {
        this.hideMsgContextMenu();
        const el = document.querySelector(`[data-msg-id="${msgId}"]`);
        if (!el) return;

        const senderName = el.querySelector('.msg-name')?.textContent || (el.classList.contains('sent') ? App.currentUser.username : 'User');
        const text = el.querySelector('.msg-bubble')?.textContent || 'Image';

        this.replyingTo = msgId;
        document.getElementById('reply-preview-name').textContent = senderName;
        document.getElementById('reply-preview-text').textContent = text;
        document.getElementById('reply-preview-bar').style.display = 'flex';
        document.getElementById('message-input').focus();
    },

    cancelReply() {
        this.replyingTo = null;
        document.getElementById('reply-preview-bar').style.display = 'none';
    },

    tagUser(msgId) {
        this.hideMsgContextMenu();
        const el = document.querySelector(`[data-msg-id="${msgId}"]`);
        if (!el) return;
        const senderName = el.querySelector('.msg-name')?.textContent || 'User';
        const input = document.getElementById('message-input');
        input.value += ` @${senderName} `;
        input.focus();
    },

    showQuickReactions(e, msgId) {
        e.stopPropagation();
        this.hideMsgContextMenu();
        const reactions = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
        const menu = document.createElement('div');
        menu.id = 'msg-context-menu';
        menu.className = 'msg-context-menu quick-react-menu';
        menu.style.display = 'flex';
        menu.style.padding = '8px';
        menu.style.gap = '8px';

        menu.innerHTML = reactions.map(r => `
            <div class="emoji-item" style="font-size:20px;cursor:pointer;" onclick="Chat.handleReactionClick('${msgId}', '${r}')">${r}</div>
        `).join('');

        document.body.appendChild(menu);
        menu.style.left = e.pageX + 'px';
        menu.style.top = e.pageY + 'px';

        setTimeout(() => {
            document.addEventListener('click', this._ctxClose = () => this.hideMsgContextMenu(), { once: true });
        }, 10);
    },

    async handleReactionClick(msgId, emoji) {
        this.hideMsgContextMenu();
        try {
            const r = await fetch(`/api/messages/${msgId}/react`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emoji })
            });
            if (r.ok) {
                const data = await r.json();
                App.socket.emit('message-reaction', {
                    messageId: msgId,
                    emoji,
                    userId: App.currentUser.id,
                    receiverId: this.currentChat?.id,
                    communityId: this.currentChat?.type === 'community' ? this.currentChat.id : null,
                    count: data.count,
                    me: data.me
                });
                this.addReactionToDOM(msgId, emoji, App.currentUser.id, data.count, data.me);
            }
        } catch (e) { console.error('[AETHER] React error:', e); }
    },

    addReactionToDOM(msgId, emoji, userId, count, me) {
        const container = document.getElementById(`reactions-${msgId}`);
        if (!container) return;

        let pill = container.querySelector(`[data-emoji="${emoji}"]`);
        if (!pill) {
            pill = document.createElement('div');
            pill.className = 'reaction-pill';
            pill.dataset.emoji = emoji;
            pill.innerHTML = `<span>${emoji}</span> <span class="reaction-count">${count}</span>`;
            pill.onclick = () => this.handleReactionClick(msgId, emoji);
            container.appendChild(pill);
        } else {
            pill.querySelector('.reaction-count').textContent = count;
        }

        if (me) pill.classList.add('active');
        else if (userId === App.currentUser.id) pill.classList.remove('active');

        if (count <= 0) pill.remove();
    },

    showForwardModal(msgId) {
        this.hideMsgContextMenu();
        const el = document.querySelector(`[data-msg-id="${msgId}"] .msg-bubble`);
        const content = el ? el.textContent : 'Image';
        this.forwardingMsg = { id: msgId, content };

        document.getElementById('forward-preview').textContent = `Forwarding: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`;
        this.renderForwardList();
        document.getElementById('forward-modal').style.display = 'flex';
    },

    renderForwardList(filter = '') {
        const list = document.getElementById('forward-contacts-list');
        const filtered = this.contacts.filter(c => c.username.toLowerCase().includes(filter.toLowerCase()));
        list.innerHTML = filtered.map(c => `
            <div class="forward-contact-item" onclick="Chat.forwardTo('${c.id}')">
                <div class="hex-avatar" style="background:${c.avatar_color};width:28px;height:28px;font-size:11px;">
                    ${renderAvatarContent(c.avatar, c.username)}
                </div>
                <span>${c.username}</span>
            </div>
        `).join('');
    },

    filterForwardList(val) { this.renderForwardList(val); },

    async forwardTo(targetId) {
        if (!this.forwardingMsg) return;
        try {
            App.socket.emit('private-message', {
                receiverId: targetId,
                content: `[Forwarded] ${this.forwardingMsg.content}`,
                type: 'text'
            });
            document.getElementById('forward-modal').style.display = 'none';
            const contact = this.contacts.find(c => c.id === targetId);
            if (contact) this.openChat(contact);
        } catch (e) { console.error('[AETHER] Forward error:', e); }
    }
};

// Expose AVATARS and PROFILE_COLORS globally for community modal
window.AVATARS = typeof AVATARS !== 'undefined' ? AVATARS : [{ id: 'default', emoji: '👤' }];
window.PROFILE_COLORS = typeof PROFILE_COLORS !== 'undefined' ? PROFILE_COLORS : ['#CC0000'];
