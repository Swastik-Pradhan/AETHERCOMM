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
router.get('/users', (req, res) => {
    const users = db.prepare(
        'SELECT id, username, avatar_color, avatar, status, online, last_seen FROM users WHERE id != ? ORDER BY online DESC, username ASC'
    ).all(req.session.userId);

    res.json(users);
});

// Get message history with a specific user
router.get('/messages/:peerId', (req, res) => {
    const { peerId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const messages = db.prepare(`
    SELECT m.*, u.username as sender_name, u.avatar_color as sender_color
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE ((m.sender_id = ? AND m.receiver_id = ?)
       OR (m.sender_id = ? AND m.receiver_id = ?))
      AND m.id NOT IN (SELECT message_id FROM deleted_messages WHERE user_id = ?)
    ORDER BY m.timestamp ASC
    LIMIT ? OFFSET ?
  `).all(req.session.userId, peerId, peerId, req.session.userId, req.session.userId, limit, offset);

    // Mark received messages as read
    db.prepare(
        'UPDATE messages SET read = 1 WHERE sender_id = ? AND receiver_id = ? AND read = 0'
    ).run(peerId, req.session.userId);

    res.json(messages);
});

// Get rooms for current user
router.get('/rooms', (req, res) => {
    const rooms = db.prepare(`
    SELECT r.*, COUNT(rm2.user_id) as member_count
    FROM rooms r
    JOIN room_members rm ON r.id = rm.room_id
    LEFT JOIN room_members rm2 ON r.id = rm2.room_id
    WHERE rm.user_id = ?
    GROUP BY r.id
    ORDER BY r.created_at DESC
  `).all(req.session.userId);

    res.json(rooms);
});

// Create a group room
router.post('/rooms', (req, res) => {
    const { name, memberIds } = req.body;

    if (!name || !memberIds || !Array.isArray(memberIds)) {
        return res.status(400).json({ error: 'Room name and member IDs required' });
    }

    const { v4: uuidv4 } = require('uuid');
    const roomId = uuidv4();

    db.prepare('INSERT INTO rooms (id, name, type, created_by) VALUES (?, ?, ?, ?)')
        .run(roomId, name, 'group', req.session.userId);

    // Add creator as member
    const addMember = db.prepare('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)');
    addMember.run(roomId, req.session.userId);

    // Add other members
    for (const memberId of memberIds) {
        addMember.run(roomId, memberId);
    }

    res.json({ id: roomId, name, type: 'group' });
});

// Get room messages
router.get('/rooms/:roomId/messages', (req, res) => {
    const { roomId } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const messages = db.prepare(`
    SELECT m.*, u.username as sender_name, u.avatar_color as sender_color
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.room_id = ?
      AND m.id NOT IN (SELECT message_id FROM deleted_messages WHERE user_id = ?)
    ORDER BY m.timestamp ASC
    LIMIT ?
  `).all(roomId, req.session.userId, limit);

    res.json(messages);
});

// Get unread counts
router.get('/unread', (req, res) => {
    const counts = db.prepare(`
    SELECT sender_id, COUNT(*) as count
    FROM messages
    WHERE receiver_id = ? AND read = 0
      AND id NOT IN (SELECT message_id FROM deleted_messages WHERE user_id = ?)
    GROUP BY sender_id
  `).all(req.session.userId, req.session.userId);

    const unreadMap = {};
    counts.forEach(c => { unreadMap[c.sender_id] = c.count; });

    res.json(unreadMap);
});

// Delete message for me only
router.delete('/messages/:id/for-me', (req, res) => {
    const { id } = req.params;
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    // Check user has access to this message
    const hasAccess = msg.sender_id === req.session.userId ||
        msg.receiver_id === req.session.userId ||
        (msg.community_id && db.prepare('SELECT 1 FROM community_members WHERE community_id = ? AND user_id = ? AND status = ?').get(msg.community_id, req.session.userId, 'active'));

    if (!hasAccess) return res.status(403).json({ error: 'No access to this message' });

    db.prepare('INSERT OR IGNORE INTO deleted_messages (message_id, user_id) VALUES (?, ?)')
        .run(id, req.session.userId);

    res.json({ message: 'Deleted for you' });
});

// Delete message for everyone (sender only)
router.delete('/messages/:id/for-all', (req, res) => {
    const { id } = req.params;
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.sender_id !== req.session.userId) return res.status(403).json({ error: 'Only sender can delete for everyone' });

    db.prepare('DELETE FROM messages WHERE id = ?').run(id);
    db.prepare('DELETE FROM deleted_messages WHERE message_id = ?').run(id);

    res.json({ message: 'Deleted for everyone', messageId: id, communityId: msg.community_id, receiverId: msg.receiver_id });
});

module.exports = router;

