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
router.post('/communities', (req, res) => {
    const { name, description, avatar, avatar_color } = req.body;
    if (!name || name.trim().length < 2) return res.status(400).json({ error: 'Name required (min 2 chars)' });

    const id = uuidv4();
    let access_code;
    for (let i = 0; i < 10; i++) {
        access_code = generateCode();
        const exists = db.prepare('SELECT id FROM communities WHERE access_code = ?').get(access_code);
        if (!exists) break;
    }

    db.prepare(
        'INSERT INTO communities (id, name, description, access_code, avatar, avatar_color, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, name.trim(), description || '', access_code, avatar || 'default', avatar_color || '#CC0000', req.session.userId);

    // Add creator as owner (status = active)
    db.prepare('INSERT INTO community_members (community_id, user_id, role, status) VALUES (?, ?, ?, ?)')
        .run(id, req.session.userId, 'owner', 'active');

    const community = db.prepare('SELECT * FROM communities WHERE id = ?').get(id);
    res.json({ ...community, role: 'owner', member_count: 1 });
});

// List my communities (only active memberships)
router.get('/communities', (req, res) => {
    const communities = db.prepare(`
    SELECT c.*, cm.role,
      (SELECT COUNT(*) FROM community_members WHERE community_id = c.id AND status = 'active') as member_count
    FROM communities c
    JOIN community_members cm ON c.id = cm.community_id
    WHERE cm.user_id = ? AND cm.status = 'active'
    ORDER BY c.created_at DESC
  `).all(req.session.userId);

    res.json(communities);
});

// Get community details
router.get('/communities/:id', (req, res) => {
    const community = db.prepare(`
    SELECT c.*, cm.role,
      (SELECT COUNT(*) FROM community_members WHERE community_id = c.id AND status = 'active') as member_count
    FROM communities c
    JOIN community_members cm ON c.id = cm.community_id
    WHERE c.id = ? AND cm.user_id = ? AND cm.status = 'active'
  `).get(req.params.id, req.session.userId);

    if (!community) return res.status(404).json({ error: 'Community not found or not a member' });

    const members = db.prepare(`
    SELECT u.id, u.username, u.avatar, u.avatar_color, u.online, cm.role
    FROM community_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.community_id = ? AND cm.status = 'active'
    ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.username
  `).all(req.params.id);

    res.json({ ...community, members });
});

// Join community via access code (creates PENDING request)
router.post('/communities/join', (req, res) => {
    const { access_code } = req.body;
    if (!access_code) return res.status(400).json({ error: 'Access code required' });

    const community = db.prepare('SELECT * FROM communities WHERE access_code = ?').get(access_code.toUpperCase().trim());
    if (!community) return res.status(404).json({ error: 'Invalid access code' });

    const existing = db.prepare('SELECT * FROM community_members WHERE community_id = ? AND user_id = ?')
        .get(community.id, req.session.userId);
    if (existing) {
        if (existing.status === 'active') return res.status(409).json({ error: 'Already a member' });
        if (existing.status === 'pending') return res.status(409).json({ error: 'Join request already pending' });
    }

    // Create pending membership
    db.prepare('INSERT INTO community_members (community_id, user_id, role, status) VALUES (?, ?, ?, ?)')
        .run(community.id, req.session.userId, 'member', 'pending');

    res.json({ message: 'Join request sent! Waiting for approval.', community_name: community.name });
});

// Get pending join requests (owner/admin only)
router.get('/communities/:id/requests', (req, res) => {
    const myRole = db.prepare('SELECT role FROM community_members WHERE community_id = ? AND user_id = ? AND status = ?')
        .get(req.params.id, req.session.userId, 'active');
    if (!myRole || myRole.role === 'member') return res.status(403).json({ error: 'Only owner/admin can view requests' });

    const requests = db.prepare(`
    SELECT cm.user_id, cm.joined_at as requested_at, u.username, u.avatar, u.avatar_color
    FROM community_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.community_id = ? AND cm.status = 'pending'
    ORDER BY cm.joined_at DESC
  `).all(req.params.id);

    res.json(requests);
});

// Approve join request (owner/admin only)
router.post('/communities/:id/approve', (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const myRole = db.prepare('SELECT role FROM community_members WHERE community_id = ? AND user_id = ? AND status = ?')
        .get(req.params.id, req.session.userId, 'active');
    if (!myRole || myRole.role === 'member') return res.status(403).json({ error: 'Only owner/admin can approve' });

    const pending = db.prepare('SELECT * FROM community_members WHERE community_id = ? AND user_id = ? AND status = ?')
        .get(req.params.id, userId, 'pending');
    if (!pending) return res.status(404).json({ error: 'No pending request from this user' });

    db.prepare("UPDATE community_members SET status = 'active' WHERE community_id = ? AND user_id = ?")
        .run(req.params.id, userId);

    const user = db.prepare('SELECT id, username, avatar, avatar_color FROM users WHERE id = ?').get(userId);
    res.json({ message: 'Member approved', user });
});

// Reject join request (owner/admin only)
router.post('/communities/:id/reject', (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const myRole = db.prepare('SELECT role FROM community_members WHERE community_id = ? AND user_id = ? AND status = ?')
        .get(req.params.id, req.session.userId, 'active');
    if (!myRole || myRole.role === 'member') return res.status(403).json({ error: 'Only owner/admin can reject' });

    db.prepare('DELETE FROM community_members WHERE community_id = ? AND user_id = ? AND status = ?')
        .run(req.params.id, userId, 'pending');

    res.json({ message: 'Request rejected' });
});

// Get community messages
router.get('/communities/:id/messages', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;

    const member = db.prepare('SELECT * FROM community_members WHERE community_id = ? AND user_id = ? AND status = ?')
        .get(req.params.id, req.session.userId, 'active');
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const messages = db.prepare(`
    SELECT m.*, u.username as sender_name, u.avatar_color as sender_color, u.avatar as sender_avatar
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.community_id = ?
    ORDER BY m.timestamp ASC
    LIMIT ?
  `).all(req.params.id, limit);

    res.json(messages);
});

// Get access code (owner/admin only)
router.get('/communities/:id/code', (req, res) => {
    const member = db.prepare('SELECT role FROM community_members WHERE community_id = ? AND user_id = ? AND status = ?')
        .get(req.params.id, req.session.userId, 'active');
    if (!member || (member.role !== 'owner' && member.role !== 'admin'))
        return res.status(403).json({ error: 'Only owner/admin can view the access code' });

    const community = db.prepare('SELECT access_code FROM communities WHERE id = ?').get(req.params.id);
    res.json({ access_code: community.access_code });
});

// Promote member to admin (owner only)
router.post('/communities/:id/promote', (req, res) => {
    const { userId } = req.body;
    const member = db.prepare('SELECT role FROM community_members WHERE community_id = ? AND user_id = ? AND status = ?')
        .get(req.params.id, req.session.userId, 'active');
    if (!member || member.role !== 'owner') return res.status(403).json({ error: 'Only owner can promote' });

    const target = db.prepare('SELECT role FROM community_members WHERE community_id = ? AND user_id = ? AND status = ?')
        .get(req.params.id, userId, 'active');
    if (!target) return res.status(404).json({ error: 'User not found in community' });
    if (target.role === 'owner') return res.status(400).json({ error: 'Cannot change owner role' });

    const newRole = target.role === 'admin' ? 'member' : 'admin';
    db.prepare('UPDATE community_members SET role = ? WHERE community_id = ? AND user_id = ?')
        .run(newRole, req.params.id, userId);
    res.json({ message: `User ${newRole === 'admin' ? 'promoted to admin' : 'demoted to member'}`, newRole });
});

// Kick member (owner/admin only)
router.post('/communities/:id/kick', (req, res) => {
    const { userId } = req.body;
    const myRole = db.prepare('SELECT role FROM community_members WHERE community_id = ? AND user_id = ? AND status = ?')
        .get(req.params.id, req.session.userId, 'active');
    if (!myRole || myRole.role === 'member') return res.status(403).json({ error: 'Insufficient permissions' });

    const target = db.prepare('SELECT role FROM community_members WHERE community_id = ? AND user_id = ? AND status = ?')
        .get(req.params.id, userId, 'active');
    if (!target) return res.status(404).json({ error: 'User not in community' });
    if (target.role === 'owner') return res.status(403).json({ error: 'Cannot kick the owner' });
    if (target.role === 'admin' && myRole.role !== 'owner') return res.status(403).json({ error: 'Only owner can kick admins' });

    db.prepare('DELETE FROM community_members WHERE community_id = ? AND user_id = ?').run(req.params.id, userId);
    res.json({ message: 'Member removed' });
});

// Leave community
router.post('/communities/:id/leave', (req, res) => {
    const member = db.prepare('SELECT role FROM community_members WHERE community_id = ? AND user_id = ? AND status = ?')
        .get(req.params.id, req.session.userId, 'active');
    if (!member) return res.status(404).json({ error: 'Not a member' });
    if (member.role === 'owner') return res.status(403).json({ error: 'Owner cannot leave. Transfer ownership first.' });

    db.prepare('DELETE FROM community_members WHERE community_id = ? AND user_id = ?')
        .run(req.params.id, req.session.userId);
    res.json({ message: 'Left community' });
});

module.exports = router;
