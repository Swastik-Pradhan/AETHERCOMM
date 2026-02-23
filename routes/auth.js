const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const router = express.Router();

const AVATAR_COLORS = [
    '#CC0000', '#FF6B35', '#00FF41', '#00D4FF',
    '#9B59B6', '#E74C3C', '#F39C12', '#1ABC9C',
    '#FF0066', '#7B68EE'
];

router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: 'Username must be 3-20 characters' });
        }

        if (password.length < 4) {
            return res.status(400).json({ error: 'Password must be at least 4 characters' });
        }

        // Check if username exists
        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existing) {
            return res.status(409).json({ error: 'Username already taken' });
        }

        const { avatar } = req.body;
        const id = uuidv4();
        const password_hash = await bcrypt.hash(password, 10);
        const avatar_color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
        const selectedAvatar = avatar || 'default';

        db.prepare(
            'INSERT INTO users (id, username, password_hash, avatar_color, avatar) VALUES (?, ?, ?, ?, ?)'
        ).run(id, username, password_hash, avatar_color, selectedAvatar);

        req.session.userId = id;
        req.session.username = username;

        res.json({
            id,
            username,
            avatar_color,
            avatar: selectedAvatar,
            status: 'Available'
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        req.session.userId = user.id;
        req.session.username = user.username;

        // Update online status
        db.prepare('UPDATE users SET online = 1 WHERE id = ?').run(user.id);

        res.json({
            id: user.id,
            username: user.username,
            avatar_color: user.avatar_color,
            avatar: user.avatar || 'default',
            status: user.status
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

router.post('/logout', (req, res) => {
    if (req.session.userId) {
        db.prepare('UPDATE users SET online = 0, last_seen = datetime(\'now\') WHERE id = ?')
            .run(req.session.userId);
    }
    req.session.destroy();
    res.json({ success: true });
});

router.get('/me', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = db.prepare('SELECT id, username, avatar_color, avatar, status, online FROM users WHERE id = ?')
        .get(req.session.userId);

    if (!user) {
        return res.status(401).json({ error: 'User not found' });
    }

    res.json(user);
});

router.put('/profile', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { avatar, status, avatar_color } = req.body;
    const updates = [];
    const values = [];

    if (avatar) {
        updates.push('avatar = ?');
        values.push(avatar);
    }
    if (status) {
        updates.push('status = ?');
        values.push(status);
    }
    if (avatar_color) {
        updates.push('avatar_color = ?');
        values.push(avatar_color);
    }

    if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.session.userId);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const user = db.prepare('SELECT id, username, avatar_color, avatar, status FROM users WHERE id = ?')
        .get(req.session.userId);

    res.json(user);
});

module.exports = router;
