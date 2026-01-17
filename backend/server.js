require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// --- 1. ENHANCED CORS (Crucial for Mobile/Hotspot) ---
app.use(cors({
    origin: '*', // Allows any device on your hotspot to connect
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// Increased limits for large PDF buffers and AI responses
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- 2. INITIALIZE SUPABASE ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- 3. REQUEST LOGGING ---
app.use((req, res, next) => {
    console.log(`📡 [${new Date().toLocaleTimeString()}] ${req.method} -> ${req.url}`);
    next();
});

// --- 4. HEALTH CHECK ---
app.get('/', (req, res) => {
    res.status(200).send("🚀 UniCollab Server is LIVE and REACHABLE via Hotspot!");
});

// --- 5. ROUTES ---
const authRoutes = require('./src/routes/auth');
const materialRoutes = require('./src/routes/material');
const messageRoutes = require('./src/routes/messaging');

app.use('/api/auth', authRoutes);
app.use('/api/material', materialRoutes); 
app.use('/api/messaging', messageRoutes);

// --- 6. ADVANCED ERROR HANDLING ---
app.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: "File too large! Max 20MB allowed." });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: "Payload too heavy for the network!" });
    }
    
    console.error("❌ Global Server Error:", err.message);
    res.status(err.status || 500).json({ 
        error: "Internal Server Error", 
        message: err.message 
    });
});

// --- 7. START SERVER WITH NETWORK-STABLE SETTINGS ---
const PORT = 5002; 
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`-----------------------------------------------`);
    console.log(`🚀 UniCollab Backend Successfully Started`);
    console.log(`📡 HOTSPOT IP: http://10.121.105.36:${PORT}`);
    console.log(`💡 STATUS: Listening on all interfaces (0.0.0.0)`);
    console.log(`-----------------------------------------------`);
});

// --- 8. CRITICAL HOTSPOT STABILITY CONFIG ---
// Mobile hotspots are prone to dropping idle connections.
// These settings force the socket to wait for slow AI generations.
server.timeout = 600000; // 10 Minutes (Wait for Llama)
server.keepAliveTimeout = 120000; // 2 Minutes
server.headersTimeout = 130000; // Slightly more than keepAlive

// Handle server-wide timeout events to prevent the app from hanging
server.on('timeout', (socket) => {
    console.warn("⚠️ [Server Timeout] A request took too long. Check AI processing speed.");
    socket.destroy();
});