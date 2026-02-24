const express = require('express');
const db = require('../db');

const router = express.Router();

// Auth middleware
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    next();
}

router.use(requireAuth);

// Get all users (contacts list)
router.get('/users', async (req, res) => {
    const { rows } = await db.query(
        'SELECT id, username, avatar_color, avatar, status, online, last_seen FROM users WHERE id != $1 ORDER BY online DESC, username ASC',
        [req.session.userId]
    );

    res.json(rows);
});

// Get message history with a specific user
router.get('/messages/:peerId', async (req, res) => {
    const { peerId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const { rows: messages } = await db.query(`
    SELECT m.*, u.username as sender_name, u.avatar_color as sender_color,
           r.content as reply_to_content, ru.username as reply_to_name
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    LEFT JOIN messages r ON m.reply_to_id = r.id
    LEFT JOIN users ru ON r.sender_id = ru.id
    WHERE ((m.sender_id = $1 AND m.receiver_id = $2)
       OR (m.sender_id = $3 AND m.receiver_id = $4))
      AND m.id NOT IN (SELECT message_id FROM deleted_messages WHERE user_id = $5)
    ORDER BY m.timestamp ASC
    LIMIT $6 OFFSET $7
  `, [req.session.userId, peerId, peerId, req.session.userId, req.session.userId, limit, offset]);

    // Get reactions for all messages
    await Promise.all(messages.map(async (msg) => {
        const { rows } = await db.query(`
            SELECT emoji, COUNT(*) as count, 
                   MAX(CASE WHEN user_id = $1 THEN 1 ELSE 0 END) as me
            FROM reactions WHERE message_id = $2 GROUP BY emoji
        `, [req.session.userId, msg.id]);
        msg.reactions = rows;
    }));

    // Mark received messages as read
    await db.query(
        'UPDATE messages SET read = 1 WHERE sender_id = $1 AND receiver_id = $2 AND read = 0',
        [peerId, req.session.userId]
    );

    res.json(messages);
});

// Get rooms for current user
router.get('/rooms', async (req, res) => {
    const { rows } = await db.query(`
    SELECT r.*, COUNT(rm2.user_id) as member_count
    FROM rooms r
    JOIN room_members rm ON r.id = rm.room_id
    LEFT JOIN room_members rm2 ON r.id = rm2.room_id
    WHERE rm.user_id = $1
    GROUP BY r.id
    ORDER BY r.created_at DESC
  `, [req.session.userId]);

    res.json(rows);
});

// Create a group room
router.post('/rooms', async (req, res) => {
    const { name, memberIds } = req.body;

    if (!name || !memberIds || !Array.isArray(memberIds)) {
        return res.status(400).json({ error: 'Room name and member IDs required' });
    }

    const { v4: uuidv4 } = require('uuid');
    const roomId = uuidv4();

    await db.query('INSERT INTO rooms (id, name, type, created_by) VALUES ($1, $2, $3, $4)',
        [roomId, name, 'group', req.session.userId]);

    // Add creator as member
    await db.query('INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)', [roomId, req.session.userId]);

    // Add other members
    for (const memberId of memberIds) {
        await db.query('INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)', [roomId, memberId]);
    }

    res.json({ id: roomId, name, type: 'group' });
});

// Get room messages
router.get('/rooms/:roomId/messages', async (req, res) => {
    const { roomId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const { rows: messages } = await db.query(`
    SELECT m.*, u.username as sender_name, u.avatar_color as sender_color,
           r.content as reply_to_content, ru.username as reply_to_name
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    LEFT JOIN messages r ON m.reply_to_id = r.id
    LEFT JOIN users ru ON r.sender_id = ru.id
    WHERE m.room_id = $1
      AND m.id NOT IN (SELECT message_id FROM deleted_messages WHERE user_id = $2)
    ORDER BY m.timestamp ASC
    LIMIT $3
  `, [roomId, req.session.userId, limit]);

    await Promise.all(messages.map(async (msg) => {
        const { rows } = await db.query(`
            SELECT emoji, COUNT(*) as count, 
                   MAX(CASE WHEN user_id = $1 THEN 1 ELSE 0 END) as me
            FROM reactions WHERE message_id = $2 GROUP BY emoji
        `, [req.session.userId, msg.id]);
        msg.reactions = rows;
    }));

    res.json(messages);
});

// Get unread counts
router.get('/unread', async (req, res) => {
    const { rows: counts } = await db.query(`
    SELECT sender_id, COUNT(*) as count
    FROM messages
    WHERE receiver_id = $1 AND read = 0
      AND id NOT IN (SELECT message_id FROM deleted_messages WHERE user_id = $2)
    GROUP BY sender_id
  `, [req.session.userId, req.session.userId]);

    const unreadMap = {};
    counts.forEach(c => { unreadMap[c.sender_id] = c.count; });

    res.json(unreadMap);
});

// Delete message for me only
router.delete('/messages/:id/for-me', async (req, res) => {
    const { id } = req.params;
    const { rows } = await db.query('SELECT * FROM messages WHERE id = $1', [id]);
    const msg = rows[0];
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    // Check user has access to this message
    let hasAccess = msg.sender_id === req.session.userId || msg.receiver_id === req.session.userId;

    if (!hasAccess && msg.community_id) {
        const { rows: memberRows } = await db.query('SELECT 1 FROM community_members WHERE community_id = $1 AND user_id = $2 AND status = $3', [msg.community_id, req.session.userId, 'active']);
        if (memberRows.length > 0) hasAccess = true;
    }

    if (!hasAccess) return res.status(403).json({ error: 'No access to this message' });

    await db.query('INSERT INTO deleted_messages (message_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, req.session.userId]);

    res.json({ message: 'Deleted for you' });
});

// Delete message for everyone (sender only)
router.delete('/messages/:id/for-all', async (req, res) => {
    const { id } = req.params;
    const { rows } = await db.query('SELECT * FROM messages WHERE id = $1', [id]);
    const msg = rows[0];
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.sender_id !== req.session.userId) return res.status(403).json({ error: 'Only sender can delete for everyone' });

    await db.query('DELETE FROM messages WHERE id = $1', [id]);
    await db.query('DELETE FROM deleted_messages WHERE message_id = $1', [id]);

    res.json({ message: 'Deleted for everyone', messageId: id, communityId: msg.community_id, receiverId: msg.receiver_id });
});

// React to a message
router.post('/messages/:id/react', async (req, res) => {
    const { id } = req.params;
    const { emoji } = req.body;
    const userId = req.session.userId;

    if (!emoji) return res.status(400).json({ error: 'Emoji required' });

    const { rows: existingRows } = await db.query('SELECT * FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3', [id, userId, emoji]);
    const existing = existingRows[0];

    if (existing) {
        await db.query('DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3', [id, userId, emoji]);
    } else {
        await db.query('INSERT INTO reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)', [id, userId, emoji]);
    }

    const { rows: countRows } = await db.query('SELECT COUNT(*) as count FROM reactions WHERE message_id = $1 AND emoji = $2', [id, emoji]);
    const count = parseInt(countRows[0].count);

    const { rows: meRows } = await db.query('SELECT 1 FROM reactions WHERE message_id = $1 AND emoji = $2 AND user_id = $3', [id, emoji, userId]);
    const me = meRows.length > 0 ? 1 : 0;

    res.json({ success: true, count, me });
});

module.exports = router;

