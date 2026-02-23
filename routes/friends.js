const express = require('express');
const db = require('../db');

const router = express.Router();

function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    next();
}

router.use(requireAuth);

// Get accepted friends
router.get('/friends', (req, res) => {
    const friends = db.prepare(`
    SELECT u.id, u.username, u.avatar_color, u.avatar, u.status, u.online, u.last_seen
    FROM users u
    WHERE u.id IN (
      SELECT CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END
      FROM friendships
      WHERE (sender_id = ? OR receiver_id = ?) AND status = 'accepted'
    )
    ORDER BY u.online DESC, u.username ASC
  `).all(req.session.userId, req.session.userId, req.session.userId);

    res.json(friends);
});

// Get friend suggestions (users who are not friends and no pending request)
router.get('/suggestions', (req, res) => {
    const suggestions = db.prepare(`
    SELECT u.id, u.username, u.avatar_color, u.avatar, u.status, u.online
    FROM users u
    WHERE u.id != ?
      AND u.id NOT IN (
        SELECT CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END
        FROM friendships
        WHERE (sender_id = ? OR receiver_id = ?)
          AND status IN ('pending', 'accepted')
      )
    ORDER BY u.created_at DESC
    LIMIT 50
  `).all(req.session.userId, req.session.userId, req.session.userId, req.session.userId);

    res.json(suggestions);
});

// Get incoming friend requests
router.get('/friends/requests', (req, res) => {
    const requests = db.prepare(`
    SELECT f.id as request_id, f.created_at as requested_at,
           u.id, u.username, u.avatar_color, u.avatar, u.status
    FROM friendships f
    JOIN users u ON f.sender_id = u.id
    WHERE f.receiver_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(req.session.userId);

    res.json(requests);
});

// Get sent pending requests
router.get('/friends/sent', (req, res) => {
    const sent = db.prepare(`
    SELECT f.id as request_id, f.receiver_id,
           u.id, u.username, u.avatar_color, u.avatar
    FROM friendships f
    JOIN users u ON f.receiver_id = u.id
    WHERE f.sender_id = ? AND f.status = 'pending'
  `).all(req.session.userId);

    res.json(sent);
});

// Send friend request
router.post('/friends/request', (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (userId === req.session.userId) return res.status(400).json({ error: 'Cannot add yourself' });

    // Check if any relationship exists
    const existing = db.prepare(`
    SELECT * FROM friendships
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
  `).get(req.session.userId, userId, userId, req.session.userId);

    if (existing) {
        if (existing.status === 'accepted') return res.status(409).json({ error: 'Already friends' });
        if (existing.status === 'pending') return res.status(409).json({ error: 'Request already pending' });
        // If rejected, allow re-request by updating
        db.prepare("UPDATE friendships SET status = 'pending', sender_id = ?, receiver_id = ?, created_at = datetime('now') WHERE id = ?")
            .run(req.session.userId, userId, existing.id);
        return res.json({ status: 'pending', message: 'Friend request sent' });
    }

    db.prepare('INSERT INTO friendships (sender_id, receiver_id, status) VALUES (?, ?, ?)')
        .run(req.session.userId, userId, 'pending');

    res.json({ status: 'pending', message: 'Friend request sent' });
});

// Accept friend request
router.post('/friends/accept', (req, res) => {
    const { requestId } = req.body;
    if (!requestId) return res.status(400).json({ error: 'requestId required' });

    const request = db.prepare('SELECT * FROM friendships WHERE id = ? AND receiver_id = ? AND status = ?')
        .get(requestId, req.session.userId, 'pending');

    if (!request) return res.status(404).json({ error: 'Request not found' });

    db.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(requestId);

    const friend = db.prepare('SELECT id, username, avatar_color, avatar, status, online FROM users WHERE id = ?')
        .get(request.sender_id);

    res.json({ message: 'Friend request accepted', friend });
});

// Reject friend request
router.post('/friends/reject', (req, res) => {
    const { requestId } = req.body;
    if (!requestId) return res.status(400).json({ error: 'requestId required' });

    const request = db.prepare('SELECT * FROM friendships WHERE id = ? AND receiver_id = ? AND status = ?')
        .get(requestId, req.session.userId, 'pending');

    if (!request) return res.status(404).json({ error: 'Request not found' });

    db.prepare("UPDATE friendships SET status = 'rejected' WHERE id = ?").run(requestId);
    res.json({ message: 'Friend request rejected' });
});

// Remove friend
router.delete('/friends/:friendId', (req, res) => {
    const { friendId } = req.params;

    db.prepare(`
    DELETE FROM friendships
    WHERE ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
      AND status = 'accepted'
  `).run(req.session.userId, friendId, friendId, req.session.userId);

    res.json({ message: 'Friend removed' });
});

module.exports = router;
