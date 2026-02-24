const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const router = express.Router();

function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    next();
}

router.use(requireAuth);

// Generate a unique 8-char access code
function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

// Create community
router.post('/communities', async (req, res) => {
    const { name, description, avatar, avatar_color } = req.body;
    if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Name required (min 2 chars)' });

    const id = uuidv4();
    let access_code;
    for (let i = 0; i < 10; i++) {
        access_code = generateCode();
        const { rows } = await db.query('SELECT id FROM communities WHERE access_code = $1', [access_code]);
        if (rows.length === 0) break;
    }

    await db.query(
        'INSERT INTO communities (id, name, description, access_code, avatar, avatar_color, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [id, name.trim(), description || '', access_code, avatar || 'default', avatar_color || '#CC0000', req.session.userId]
    );

    // Add creator as owner (status = active)
    await db.query('INSERT INTO community_members (community_id, user_id, role, status) VALUES ($1, $2, $3, $4)',
        [id, req.session.userId, 'owner', 'active']);

    const { rows: communityRows } = await db.query('SELECT * FROM communities WHERE id = $1', [id]);
    res.json({ ...communityRows[0], role: 'owner', member_count: 1 });
});

// List my communities (only active memberships)
router.get('/communities', async (req, res) => {
    const { rows } = await db.query(`
    SELECT c.*, cm.role,
      (SELECT COUNT(*) FROM community_members WHERE community_id = c.id AND status = 'active') as member_count
    FROM communities c
    JOIN community_members cm ON c.id = cm.community_id
    WHERE cm.user_id = $1 AND cm.status = 'active'
    ORDER BY c.created_at DESC
  `, [req.session.userId]);

    res.json(rows);
});

// Get community details
router.get('/communities/:id', async (req, res) => {
    const { rows: communityRows } = await db.query(`
    SELECT c.*, cm.role,
      (SELECT COUNT(*) FROM community_members WHERE community_id = c.id AND status = 'active') as member_count
    FROM communities c
    JOIN community_members cm ON c.id = cm.community_id
    WHERE c.id = $1 AND cm.user_id = $2 AND cm.status = 'active'
  `, [req.params.id, req.session.userId]);
    const community = communityRows[0];

    if (!community) return res.status(404).json({ error: 'Community not found or not a member' });

    const { rows: members } = await db.query(`
    SELECT u.id, u.username, u.avatar, u.avatar_color, u.online, cm.role
    FROM community_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.community_id = $1 AND cm.status = 'active'
    ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.username
  `, [req.params.id]);

    res.json({ ...community, members });
});

// Join community via access code (creates PENDING request)
router.post('/communities/join', async (req, res) => {
    const { access_code } = req.body;
    if (!access_code) return res.status(400).json({ error: 'Access code required' });

    const { rows: communityRows } = await db.query('SELECT * FROM communities WHERE access_code = $1', [access_code.toUpperCase().trim()]);
    const community = communityRows[0];
    if (!community) return res.status(404).json({ error: 'Invalid access code' });

    const { rows: memberRows } = await db.query('SELECT * FROM community_members WHERE community_id = $1 AND user_id = $2',
        [community.id, req.session.userId]);
    const existing = memberRows[0];

    if (existing) {
        if (existing.status === 'active') return res.status(409).json({ error: 'Already a member' });
        if (existing.status === 'pending') return res.status(409).json({ error: 'Join request already pending' });
    }

    // Create pending membership
    await db.query('INSERT INTO community_members (community_id, user_id, role, status) VALUES ($1, $2, $3, $4)',
        [community.id, req.session.userId, 'member', 'pending']);

    res.json({ message: 'Join request sent! Waiting for approval.', community_name: community.name });
});

// Get pending join requests (owner/admin only)
router.get('/communities/:id/requests', async (req, res) => {
    const { rows: roleRows } = await db.query('SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2 AND status = $3',
        [req.params.id, req.session.userId, 'active']);
    const myRole = roleRows[0];
    if (!myRole || myRole.role === 'member') return res.status(403).json({ error: 'Only owner/admin can view requests' });

    const { rows: requests } = await db.query(`
    SELECT cm.user_id, cm.joined_at as requested_at, u.username, u.avatar, u.avatar_color
    FROM community_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.community_id = $1 AND cm.status = 'pending'
    ORDER BY cm.joined_at DESC
  `, [req.params.id]);

    res.json(requests);
});

// Approve join request (owner/admin only)
router.post('/communities/:id/approve', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const { rows: roleRows } = await db.query('SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2 AND status = $3',
        [req.params.id, req.session.userId, 'active']);
    const myRole = roleRows[0];
    if (!myRole || myRole.role === 'member') return res.status(403).json({ error: 'Only owner/admin can approve' });

    const { rows: pendingRows } = await db.query('SELECT * FROM community_members WHERE community_id = $1 AND user_id = $2 AND status = $3',
        [req.params.id, userId, 'pending']);
    const pending = pendingRows[0];
    if (!pending) return res.status(404).json({ error: 'No pending request from this user' });

    await db.query("UPDATE community_members SET status = 'active' WHERE community_id = $1 AND user_id = $2",
        [req.params.id, userId]);

    const { rows: userRows } = await db.query('SELECT id, username, avatar, avatar_color FROM users WHERE id = $1', [userId]);
    res.json({ message: 'Member approved', user: userRows[0] });
});

// Reject join request (owner/admin only)
router.post('/communities/:id/reject', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const { rows: roleRows } = await db.query('SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2 AND status = $3',
        [req.params.id, req.session.userId, 'active']);
    const myRole = roleRows[0];
    if (!myRole || myRole.role === 'member') return res.status(403).json({ error: 'Only owner/admin can reject' });

    await db.query('DELETE FROM community_members WHERE community_id = $1 AND user_id = $2 AND status = $3',
        [req.params.id, userId, 'pending']);

    res.json({ message: 'Request rejected' });
});

// Get community messages
router.get('/communities/:id/messages', async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;

    const { rows: memberRows } = await db.query('SELECT * FROM community_members WHERE community_id = $1 AND user_id = $2 AND status = $3',
        [req.params.id, req.session.userId, 'active']);
    const member = memberRows[0];
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const { rows: messages } = await db.query(`
    SELECT m.*, u.username as sender_name, u.avatar_color as sender_color, u.avatar as sender_avatar,
           r.content as reply_to_content, ru.username as reply_to_name
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    LEFT JOIN messages r ON m.reply_to_id = r.id
    LEFT JOIN users ru ON r.sender_id = ru.id
    WHERE m.community_id = $1
    ORDER BY m.timestamp ASC
    LIMIT $2
  `, [req.params.id, limit]);

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

// Get access code (owner/admin only)
router.get('/communities/:id/code', async (req, res) => {
    const { rows: memberRows } = await db.query('SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2 AND status = $3',
        [req.params.id, req.session.userId, 'active']);
    const member = memberRows[0];
    if (!member || (member.role !== 'owner' && member.role !== 'admin'))
        return res.status(403).json({ error: 'Only owner/admin can view the access code' });

    const { rows: communityRows } = await db.query('SELECT access_code FROM communities WHERE id = $1', [req.params.id]);
    res.json({ access_code: communityRows[0].access_code });
});

// Promote member to admin (owner only)
router.post('/communities/:id/promote', async (req, res) => {
    const { userId } = req.body;
    const { rows: memberRows } = await db.query('SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2 AND status = $3',
        [req.params.id, req.session.userId, 'active']);
    const member = memberRows[0];
    if (!member || member.role !== 'owner') return res.status(403).json({ error: 'Only owner can promote' });

    const { rows: targetRows } = await db.query('SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2 AND status = $3',
        [req.params.id, userId, 'active']);
    const target = targetRows[0];
    if (!target) return res.status(404).json({ error: 'User not found in community' });
    if (target.role === 'owner') return res.status(400).json({ error: 'Cannot change owner role' });

    const newRole = target.role === 'admin' ? 'member' : 'admin';
    await db.query('UPDATE community_members SET role = $1 WHERE community_id = $2 AND user_id = $3',
        [newRole, req.params.id, userId]);
    res.json({ message: `User ${newRole === 'admin' ? 'promoted to admin' : 'demoted to member'}`, newRole });
});

// Kick member (owner/admin only)
router.post('/communities/:id/kick', async (req, res) => {
    const { userId } = req.body;
    const { rows: memberRows } = await db.query('SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2 AND status = $3',
        [req.params.id, req.session.userId, 'active']);
    const myRole = memberRows[0];
    if (!myRole || myRole.role === 'member') return res.status(403).json({ error: 'Insufficient permissions' });

    const { rows: targetRows } = await db.query('SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2 AND status = $3',
        [req.params.id, userId, 'active']);
    const target = targetRows[0];
    if (!target) return res.status(404).json({ error: 'User not in community' });
    if (target.role === 'owner') return res.status(403).json({ error: 'Cannot kick the owner' });
    if (target.role === 'admin' && myRole.role !== 'owner') return res.status(403).json({ error: 'Only owner can kick admins' });

    await db.query('DELETE FROM community_members WHERE community_id = $1 AND user_id = $2', [req.params.id, userId]);
    res.json({ message: 'Member removed' });
});

// Leave community
router.post('/communities/:id/leave', async (req, res) => {
    const { rows: memberRows } = await db.query('SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2 AND status = $3',
        [req.params.id, req.session.userId, 'active']);
    const member = memberRows[0];
    if (!member) return res.status(404).json({ error: 'Not a member' });
    if (member.role === 'owner') return res.status(403).json({ error: 'Owner cannot leave. Transfer ownership first.' });

    await db.query('DELETE FROM community_members WHERE community_id = $1 AND user_id = $2', [req.params.id, req.session.userId]);
    res.json({ message: 'Left community' });
});

module.exports = router;
