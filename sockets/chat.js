const { v4: uuidv4 } = require('uuid');
const db = require('../db');

module.exports = function setupChatSockets(io) {
    io.on('connection', async (socket) => {
        const session = socket.request.session;
        if (!session || !session.userId) return;

        const userId = session.userId;
        console.log(`[NERV] Socket connected: ${socket.id} (user: ${userId})`);

        // Join personal room for direct messages
        socket.join(userId);

        // Join all community rooms this user belongs to
        const { rows: memberships } = await db.query('SELECT community_id FROM community_members WHERE user_id = $1', [userId]);
        memberships.forEach(m => {
            socket.join(`community:${m.community_id}`);
        });

        // ─── USER ONLINE ─────────────────────────────────────────
        socket.on('user-online', async (id) => {
            console.log(`[NERV] User online: ${id}`);
            await db.query('UPDATE users SET online = 1, last_seen = CURRENT_TIMESTAMP WHERE id = $1', [id]);
            // Broadcast to ALL connected sockets
            io.emit('user-status', { userId: id, online: true });
        });

        // ─── PRIVATE MESSAGE ─────────────────────────────────────
        socket.on('private-message', async (data) => {
            const { receiverId, content, type, replyToId } = data;
            if (!receiverId || !content) return;

            const msgId = uuidv4();

            await db.query('INSERT INTO messages (id, sender_id, receiver_id, content, type, timestamp, reply_to_id) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)',
                [msgId, userId, receiverId, content, type || 'text', replyToId || null]);

            // Fetch back with reply info
            const { rows } = await db.query(`
            SELECT m.*, u.username as sender_name, u.avatar_color as sender_color, u.avatar as sender_avatar,
                   r.content as reply_to_content, ru.username as reply_to_name
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            LEFT JOIN messages r ON m.reply_to_id = r.id
            LEFT JOIN users ru ON r.sender_id = ru.id
            WHERE m.id = $1
        `, [msgId]);
            const msg = rows[0];

            // Send to receiver's personal room
            io.to(receiverId).emit('private-message', msg);
            // Send confirmation back to sender
            socket.emit('message-sent', msg);
        });

        // ─── FRIEND REQUEST ──────────────────────────────────────
        socket.on('friend-request', async (data) => {
            const { receiverId } = data;
            const { rows } = await db.query('SELECT id, username, avatar_color, avatar, status FROM users WHERE id = $1', [userId]);
            const sender = rows[0];
            // Emit directly to receiver's room
            io.to(receiverId).emit('friend-request-received', { sender });
        });

        // ─── FRIEND ACCEPTED ─────────────────────────────────────
        socket.on('friend-accepted', async (data) => {
            const { friendId } = data;
            const { rows } = await db.query('SELECT id, username, avatar_color, avatar, status, online, last_seen FROM users WHERE id = $1', [userId]);
            const user = rows[0];
            // Send the full user data to the original requester so they can add to friends list
            io.to(friendId).emit('friend-request-accepted', { friend: user });
        });

        // ─── FRIEND REJECTED ─────────────────────────────────────
        socket.on('friend-rejected', (data) => {
            const { friendId } = data;
            io.to(friendId).emit('friend-request-rejected', { userId });
        });

        // ─── TYPING ──────────────────────────────────────────────
        socket.on('typing', async (data) => {
            const { rows } = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
            const user = rows[0];
            if (!user) return;
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
        socket.on('messages-read', async (data) => {
            await db.query('UPDATE messages SET read = 1 WHERE sender_id = $1 AND receiver_id = $2 AND read = 0', [data.senderId, userId]);
            io.to(data.senderId).emit('messages-read', { readerId: userId });
        });

        // ─── COMMUNITY MESSAGE ───────────────────────────────────
        socket.on('community-message', async (data) => {
            const { communityId, content, type, replyToId } = data;
            if (!communityId || !content) return;

            const msgId = uuidv4();

            // Verify membership
            const { rows: memberRows } = await db.query('SELECT * FROM community_members WHERE community_id = $1 AND user_id = $2', [communityId, userId]);
            const member = memberRows[0];
            if (!member) return;

            await db.query('INSERT INTO messages (id, sender_id, community_id, content, type, timestamp, reply_to_id) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)',
                [msgId, userId, communityId, content, type || 'text', replyToId || null]);

            const { rows } = await db.query(`
            SELECT m.*, u.username as sender_name, u.avatar_color as sender_color, u.avatar as sender_avatar,
                   r.content as reply_to_content, ru.username as reply_to_name
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            LEFT JOIN messages r ON m.reply_to_id = r.id
            LEFT JOIN users ru ON r.sender_id = ru.id
            WHERE m.id = $1
        `, [msgId]);
            const msg = rows[0];

            // Broadcast to all community members
            io.to(`community:${communityId}`).emit('community-message', msg);
        });

        // ─── JOIN COMMUNITY ROOM ─────────────────────────────────
        socket.on('join-community', async (data) => {
            socket.join(`community:${data.communityId}`);
            // Notify other members
            const { rows } = await db.query('SELECT username FROM users WHERE id = $1', [userId]);
            const user = rows[0];
            if (user) {
                socket.to(`community:${data.communityId}`).emit('community-member-joined', {
                    communityId: data.communityId,
                    user: { id: userId, username: user.username }
                });
            }
        });

        // ─── GROUP MESSAGE ───────────────────────────────────────
        socket.on('group-message', async (data) => {
            const { roomId, content, type } = data;
            const msgType = type || 'text';
            const msgId = uuidv4();
            const { rows } = await db.query('SELECT username, avatar_color, avatar FROM users WHERE id = $1', [userId]);
            const sender = rows[0];

            await db.query(
                'INSERT INTO messages (id, sender_id, room_id, content, type, timestamp) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
                [msgId, userId, roomId, content, msgType]
            );

            const msg = {
                id: msgId, sender_id: userId, room_id: roomId, content, type: msgType,
                sender_name: sender ? sender.username : 'Unknown',
                sender_color: sender ? sender.avatar_color : '#FFFFFF',
                sender_avatar: sender ? sender.avatar : null,
                timestamp: new Date().toISOString()
            };

            io.to(roomId).emit('group-message', msg);
        });

        // ─── MESSAGE REACTION ────────────────────────────────────
        socket.on('message-reaction', async (data) => {
            const { messageId, emoji, receiverId, communityId } = data;
            // userId is already available from the connection scope
            if (!userId || !messageId) return;

            // Check if user has already reacted with this emoji
            const { rows: existingRows } = await db.query('SELECT * FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3', [messageId, userId, emoji]);
            const existingReaction = existingRows[0];

            if (existingReaction) {
                // If reaction exists, remove it (toggle off)
                await db.query('DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3', [messageId, userId, emoji]);
            } else {
                // If reaction doesn't exist, add it (toggle on)
                await db.query('INSERT INTO reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)', [messageId, userId, emoji]);
            }

            // Get updated counts and user's status for this emoji
            const { rows: countRows } = await db.query('SELECT COUNT(*) as count FROM reactions WHERE message_id = $1 AND emoji = $2', [messageId, emoji]);
            const count = parseInt(countRows[0].count);

            const { rows: meRows } = await db.query('SELECT 1 FROM reactions WHERE message_id = $1 AND emoji = $2 AND user_id = $3', [messageId, emoji, userId]);
            const me = meRows.length > 0 ? 1 : 0;

            const broadcastData = { messageId, emoji, userId, count, me, removed: !!existingReaction };

            if (communityId) {
                io.to(`community:${communityId}`).emit('message-reaction', broadcastData);
            } else if (receiverId) {
                io.to(receiverId).emit('message-reaction', broadcastData);
                // Also send to sender's room if it's a private message
                io.to(userId).emit('message-reaction', broadcastData);
            }
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
        socket.on('disconnect', async () => {
            await db.query('UPDATE users SET online = 0, last_seen = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
            // Broadcast to ALL so everyone sees offline status instantly
            io.emit('user-status', { userId, online: false });
        });
    });
};
