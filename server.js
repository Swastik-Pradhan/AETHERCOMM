const http = require('http');
const express = require('express');
const session = require('express-session');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const setupChatSockets = require('./sockets/chat');
const setupCallSockets = require('./sockets/call');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const friendRoutes = require('./routes/friends');
const communityRoutes = require('./routes/community');

const PORT = process.env.PORT || 3000;

console.log('');
console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
console.log('\u2551                                                              \u2551');
console.log('\u2551      AETHER COMMUNICATION SYSTEM v3.0                        \u2551');
console.log('\u2551      Secure \u00b7 Encrypted \u00b7 Connected                          \u2551');
console.log('\u2551                                                              \u2551');
console.log('\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d');
console.log('');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

const sessionMiddleware = session({
    secret: 'aether-secure-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

// Multer
const storage = multer.diskStorage({
    destination: path.join(__dirname, 'public', 'uploads'),
    filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp|mp4|webm|pdf/;
        if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) return cb(null, true);
        cb(new Error('Invalid file type'));
    }
});

app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', chatRoutes);
app.use('/api', friendRoutes);
app.use('/api', communityRoutes);

// Upload
app.post('/api/upload', (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
    next();
}, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ url: '/uploads/' + req.file.filename, type: req.file.mimetype.startsWith('image/') ? 'image' : 'file', name: req.file.originalname, size: req.file.size });
});

setupChatSockets(io);
setupCallSockets(io);

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

httpServer.listen(PORT, () => {
    console.log(`[AETHER] System operational on port ${PORT}`);
    console.log(`[AETHER] Access terminal: http://localhost:${PORT}\n`);
});
