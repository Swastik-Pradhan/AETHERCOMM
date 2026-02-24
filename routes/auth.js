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
        const { username, password, email } = req.body;

        if (!username || !password || !email) {
            return res.status(400).json({ error: 'Username, email, and password required' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ error: 'Username must be 3-20 characters' });
        }

        if (password.length < 4) {
            return res.status(400).json({ error: 'Password must be at least 4 characters' });
        }

        // Check if username exists
        const existing = await db.query('SELECT id FROM users WHERE username = $1', [username]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Username already taken' });
        }

        // Check if email exists
        const existingEmail = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existingEmail.rows.length > 0) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const { avatar } = req.body;
        const id = uuidv4();
        const password_hash = await bcrypt.hash(password, 10);
        const avatar_color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
        const selectedAvatar = avatar || 'default';

        await db.query(
            'INSERT INTO users (id, username, email, password_hash, avatar_color, avatar) VALUES ($1, $2, $3, $4, $5, $6)',
            [id, username, email, password_hash, avatar_color, selectedAvatar]
        );

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

        const { rows } = await db.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = rows[0];
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
        await db.query('UPDATE users SET online = 1 WHERE id = $1', [user.id]);

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

router.post('/logout', async (req, res) => {
    if (req.session.userId) {
        await db.query('UPDATE users SET online = 0, last_seen = CURRENT_TIMESTAMP WHERE id = $1', [req.session.userId]);
    }
    req.session.destroy();
    res.json({ success: true });
});

router.get('/me', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { rows } = await db.query('SELECT id, username, avatar_color, avatar, status, online FROM users WHERE id = $1', [req.session.userId]);
    const user = rows[0];

    if (!user) {
        return res.status(401).json({ error: 'User not found' });
    }

    res.json(user);
});

router.put('/profile', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { avatar, status, avatar_color } = req.body;
    const updates = [];
    const values = [];

    if (avatar) {
        updates.push(`avatar = $${values.length + 1}`);
        values.push(avatar);
    }
    if (status) {
        updates.push(`status = $${values.length + 1}`);
        values.push(status);
    }
    if (avatar_color) {
        updates.push(`avatar_color = $${values.length + 1}`);
        values.push(avatar_color);
    }

    if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(req.session.userId);
    await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${values.length}`, values);

    const { rows } = await db.query('SELECT id, username, avatar_color, avatar, status FROM users WHERE id = $1', [req.session.userId]);
    res.json(rows[0]);
});

// Forgot password — generate reset code
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const { rows } = await db.query('SELECT id, username FROM users WHERE email = $1', [email]);
        const user = rows[0];
        if (!user) {
            // Don't reveal whether email exists — still return success
            return res.json({ success: true, message: 'If that email is registered, a reset code has been generated' });
        }

        // Generate 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

        // Invalidate old codes for this email
        await db.query('UPDATE password_resets SET used = TRUE WHERE email = $1 AND used = FALSE', [email]);

        // Store new code
        await db.query('INSERT INTO password_resets (email, code, expires_at) VALUES ($1, $2, $3)', [email, code, expiresAt]);

        // In production, send via email (Nodemailer). For now, return the code directly.
        res.json({ success: true, message: 'Reset code generated', code, expiresIn: '15 minutes' });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// Reset password — validate code and set new password
router.post('/reset-password', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        if (!email || !code || !newPassword) {
            return res.status(400).json({ error: 'Email, code, and new password required' });
        }
        if (newPassword.length < 4) {
            return res.status(400).json({ error: 'Password must be at least 4 characters' });
        }

        const { rows } = await db.query(
            'SELECT * FROM password_resets WHERE email = $1 AND code = $2 AND used = FALSE ORDER BY created_at DESC LIMIT 1',
            [email, code]
        );
        const reset = rows[0];

        if (!reset) {
            return res.status(400).json({ error: 'Invalid or expired reset code' });
        }

        if (new Date(reset.expires_at) < new Date()) {
            await db.query('UPDATE password_resets SET used = TRUE WHERE id = $1', [reset.id]);
            return res.status(400).json({ error: 'Reset code has expired' });
        }

        const password_hash = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE users SET password_hash = $1 WHERE email = $2', [password_hash, email]);
        await db.query('UPDATE password_resets SET used = TRUE WHERE id = $1', [reset.id]);

        res.json({ success: true, message: 'Password reset successfully' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

module.exports = router;
