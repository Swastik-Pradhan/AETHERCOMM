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
router.get('/friends', async (req, res) => {
  const { rows } = await db.query(`
    SELECT u.id, u.username, u.avatar_color, u.avatar, u.status, u.online, u.last_seen
    FROM users u
    WHERE u.id IN (
      SELECT CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END
      FROM friendships
      WHERE (sender_id = $2 OR receiver_id = $3) AND status = 'accepted'
    )
    ORDER BY u.online DESC, u.username ASC
  `, [req.session.userId, req.session.userId, req.session.userId]);

  res.json(rows);
});

// Get friend suggestions (users who are not friends and no pending request)
router.get('/suggestions', async (req, res) => {
  const { rows } = await db.query(`
    SELECT u.id, u.username, u.avatar_color, u.avatar, u.status, u.online
    FROM users u
    WHERE u.id != $1
      AND u.id NOT IN (
        SELECT CASE WHEN sender_id = $2 THEN receiver_id ELSE sender_id END
        FROM friendships
        WHERE (sender_id = $3 OR receiver_id = $4)
          AND status IN ('pending', 'accepted')
      )
    ORDER BY u.created_at DESC
    LIMIT 50
  `, [req.session.userId, req.session.userId, req.session.userId, req.session.userId]);

  res.json(rows);
});

// Get incoming friend requests
router.get('/friends/requests', async (req, res) => {
  const { rows } = await db.query(`
    SELECT f.id as request_id, f.created_at as requested_at,
           u.id, u.username, u.avatar_color, u.avatar, u.status
    FROM friendships f
    JOIN users u ON f.sender_id = u.id
    WHERE f.receiver_id = $1 AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `, [req.session.userId]);

  res.json(rows);
});

// Get sent pending requests
router.get('/friends/sent', async (req, res) => {
  const { rows } = await db.query(`
    SELECT f.id as request_id, f.receiver_id,
           u.id, u.username, u.avatar_color, u.avatar
    FROM friendships f
    JOIN users u ON f.receiver_id = u.id
    WHERE f.sender_id = $1 AND f.status = 'pending'
  `, [req.session.userId]);

  res.json(rows);
});

// Send friend request
router.post('/friends/request', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  if (userId === req.session.userId) return res.status(400).json({ error: 'Cannot add yourself' });

  // Check if any relationship exists
  const { rows } = await db.query(`
    SELECT * FROM friendships
    WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $3 AND receiver_id = $4)
  `, [req.session.userId, userId, userId, req.session.userId]);
  const existing = rows[0];

  if (existing) {
    if (existing.status === 'accepted') return res.status(409).json({ error: 'Already friends' });
    if (existing.status === 'pending') return res.status(409).json({ error: 'Request already pending' });
    // If rejected, allow re-request by updating
    await db.query("UPDATE friendships SET status = 'pending', sender_id = $1, receiver_id = $2, created_at = CURRENT_TIMESTAMP WHERE id = $3",
      [req.session.userId, userId, existing.id]);
    return res.json({ status: 'pending', message: 'Friend request sent' });
  }

  await db.query('INSERT INTO friendships (sender_id, receiver_id, status) VALUES ($1, $2, $3)',
    [req.session.userId, userId, 'pending']);

  res.json({ status: 'pending', message: 'Friend request sent' });
});

// Accept friend request
router.post('/friends/accept', async (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return res.status(400).json({ error: 'requestId required' });

  const { rows: requestRows } = await db.query('SELECT * FROM friendships WHERE id = $1 AND receiver_id = $2 AND status = $3',
    [requestId, req.session.userId, 'pending']);
  const request = requestRows[0];

  if (!request) return res.status(404).json({ error: 'Request not found' });

  await db.query("UPDATE friendships SET status = 'accepted' WHERE id = $1", [requestId]);

  const { rows: friendRows } = await db.query('SELECT id, username, avatar_color, avatar, status, online FROM users WHERE id = $1',
    [request.sender_id]);
  const friend = friendRows[0];

  res.json({ message: 'Friend request accepted', friend });
});

// Reject friend request
router.post('/friends/reject', async (req, res) => {
  const { requestId } = req.body;
  if (!requestId) return res.status(400).json({ error: 'requestId required' });

  const { rows: requestRows } = await db.query('SELECT * FROM friendships WHERE id = $1 AND receiver_id = $2 AND status = $3',
    [requestId, req.session.userId, 'pending']);
  const request = requestRows[0];

  if (!request) return res.status(404).json({ error: 'Request not found' });

  await db.query("UPDATE friendships SET status = 'rejected' WHERE id = $1", [requestId]);
  res.json({ message: 'Friend request rejected' });
});

// Remove friend
router.delete('/friends/:friendId', async (req, res) => {
  const { friendId } = req.params;

  await db.query(`
    DELETE FROM friendships
    WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $3 AND receiver_id = $4))
      AND status = 'accepted'
  `, [req.session.userId, friendId, friendId, req.session.userId]);

  res.json({ message: 'Friend removed' });
});

module.exports = router;
