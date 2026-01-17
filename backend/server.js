require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// --- 1. CLOUD-READY CORS ---
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

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
    // Updated message for the cloud
    res.status(200).send("🚀 UniCollab AI Server is LIVE on Render!");
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

// --- 7. START SERVER (UPDATED FOR RENDER) ---
// Render will automatically pass a PORT variable. If not, it defaults to 10000.
const PORT = process.env.PORT || 10000; 
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`-----------------------------------------------`);
    console.log(`🚀 UniCollab Backend Live in the Cloud`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`💡 Mode: Production (Render)`);
    console.log(`-----------------------------------------------`);
});

// --- 8. STABILITY CONFIG ---
server.timeout = 600000; 
server.keepAliveTimeout = 120000; 
server.headersTimeout = 130000; 

server.on('timeout', (socket) => {
    console.warn("⚠️ [Server Timeout] Request exceeded 10 mins.");
    socket.destroy();
});