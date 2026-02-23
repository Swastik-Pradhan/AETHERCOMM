const { v4: uuidv4 } = require('uuid');
const db = require('../db');

module.exports = function setupChatSockets(io) {
    io.on('connection', (socket) => {
        const session = socket.request.session;
        if (!session || !session.userId) return;

        const userId = session.userId;
        console.log(`[NERV] Socket connected: ${socket.id} (user: ${userId})`);

        // Join personal room for direct messages
        socket.join(userId);

        // Join all community rooms this user belongs to
        const memberships = db.prepare('SELECT community_id FROM community_members WHERE user_id = ?').all(userId);
        memberships.forEach(m => {
            socket.join(`community:${m.community_id}`);
        });

        // ─── USER ONLINE ─────────────────────────────────────────
        socket.on('user-online', (id) => {
            console.log(`[NERV] User online: ${id}`);
            db.prepare('UPDATE users SET online = 1, last_seen = datetime(?) WHERE id = ?')
                .run(new Date().toISOString(), id);
            // Broadcast to ALL connected sockets
            io.emit('user-status', { userId: id, online: true });
        });

        // ─── PRIVATE MESSAGE ─────────────────────────────────────
        socket.on('private-message', (data) => {
            const { receiverId, content, type } = data;
            const msgType = type || 'text';
            const msgId = uuidv4();

            const sender = db.prepare('SELECT username, avatar_color, avatar FROM users WHERE id = ?').get(userId);

            db.prepare(
                'INSERT INTO messages (id, sender_id, receiver_id, content, type) VALUES (?, ?, ?, ?, ?)'
            ).run(msgId, userId, receiverId, content, msgType);

            const msg = {
                id: msgId,
                sender_id: userId,
                receiver_id: receiverId,
                content,
                type: msgType,
                sender_name: sender.username,
                sender_color: sender.avatar_color,
                sender_avatar: sender.avatar,
                timestamp: new Date().toISOString(),
                read: 0
            };

            // Send to receiver's personal room
            io.to(receiverId).emit('private-message', msg);
            // Send confirmation back to sender
            socket.emit('message-sent', msg);
        });

        // ─── FRIEND REQUEST ──────────────────────────────────────
        socket.on('friend-request', (data) => {
            const { receiverId } = data;
            const sender = db.prepare('SELECT id, username, avatar_color, avatar, status FROM users WHERE id = ?').get(userId);
            // Emit directly to receiver's room
            io.to(receiverId).emit('friend-request-received', { sender });
        });

        // ─── FRIEND ACCEPTED ─────────────────────────────────────
        socket.on('friend-accepted', (data) => {
            const { friendId } = data;
            const user = db.prepare('SELECT id, username, avatar_color, avatar, status, online, last_seen FROM users WHERE id = ?').get(userId);
            // Send the full user data to the original requester so they can add to friends list
            io.to(friendId).emit('friend-request-accepted', { friend: user });
        });

        // ─── FRIEND REJECTED ─────────────────────────────────────
        socket.on('friend-rejected', (data) => {
            const { friendId } = data;
            io.to(friendId).emit('friend-request-rejected', { userId });
        });

        // ─── TYPING ──────────────────────────────────────────────
        socket.on('typing', (data) => {
            const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
            if (data.communityId) {
                socket.to(`community:${data.communityId}`).emit('typing', { userId, username: user.username, communityId: data.communityId });
            } else {
                io.to(data.receiverId).emit('typing', { userId, username: user.username });
            }
        });

        socket.on('stop-typing', (data) => {
            if (data.communityId) {
                socket.to(`community:${data.communityId}`).emit('stop-typing', { userId, communityId: data.communityId });
            } else {
                io.to(data.receiverId).emit('stop-typing', { userId });
            }
        });

        // ─── READ RECEIPTS ───────────────────────────────────────
        socket.on('messages-read', (data) => {
            db.prepare('UPDATE messages SET read = 1 WHERE sender_id = ? AND receiver_id = ? AND read = 0')
                .run(data.senderId, userId);
            io.to(data.senderId).emit('messages-read', { readerId: userId });
        });

        // ─── COMMUNITY MESSAGE ───────────────────────────────────
        socket.on('community-message', (data) => {
            const { communityId, content, type } = data;
            const msgType = type || 'text';
            const msgId = uuidv4();

            // Verify membership
            const member = db.prepare('SELECT * FROM community_members WHERE community_id = ? AND user_id = ?')
                .get(communityId, userId);
            if (!member) return;

            const sender = db.prepare('SELECT username, avatar_color, avatar FROM users WHERE id = ?').get(userId);

            db.prepare(
                'INSERT INTO messages (id, sender_id, community_id, content, type) VALUES (?, ?, ?, ?, ?)'
            ).run(msgId, userId, communityId, content, msgType);

            const msg = {
                id: msgId,
                sender_id: userId,
                community_id: communityId,
                content,
                type: msgType,
                sender_name: sender.username,
                sender_color: sender.avatar_color,
                sender_avatar: sender.avatar,
                timestamp: new Date().toISOString()
            };

            // Broadcast to all community members
            io.to(`community:${communityId}`).emit('community-message', msg);
        });

        // ─── JOIN COMMUNITY ROOM ─────────────────────────────────
        socket.on('join-community', (data) => {
            socket.join(`community:${data.communityId}`);
            // Notify other members
            const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
            socket.to(`community:${data.communityId}`).emit('community-member-joined', {
                communityId: data.communityId,
                user: { id: userId, username: user.username }
            });
        });

        // ─── GROUP MESSAGE ───────────────────────────────────────
        socket.on('group-message', (data) => {
            const { roomId, content, type } = data;
            const msgType = type || 'text';
            const msgId = uuidv4();
            const sender = db.prepare('SELECT username, avatar_color, avatar FROM users WHERE id = ?').get(userId);

            db.prepare(
                'INSERT INTO messages (id, sender_id, room_id, content, type) VALUES (?, ?, ?, ?, ?)'
            ).run(msgId, userId, roomId, content, msgType);

            const msg = {
                id: msgId, sender_id: userId, room_id: roomId, content, type: msgType,
                sender_name: sender.username, sender_color: sender.avatar_color,
                sender_avatar: sender.avatar, timestamp: new Date().toISOString()
            };

            io.to(roomId).emit('group-message', msg);
        });

        // ─── DELETE MESSAGE FOR ALL (broadcast) ─────────────────
        socket.on('delete-message', (data) => {
            const { messageId, receiverId, communityId } = data;
            if (communityId) {
                socket.to(`community:${communityId}`).emit('message-deleted', { messageId });
            } else if (receiverId) {
                socket.to(receiverId).emit('message-deleted', { messageId });
            }
        });

        // ─── DISCONNECT ──────────────────────────────────────────
        socket.on('disconnect', () => {
            db.prepare('UPDATE users SET online = 0, last_seen = datetime(?) WHERE id = ?')
                .run(new Date().toISOString(), userId);
            // Broadcast to ALL so everyone sees offline status instantly
            io.emit('user-status', { userId, online: false });
        });
    });
};
