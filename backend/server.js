require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// 1. Middleware
app.use(cors());
app.use(express.json());

// 2. Initialize Supabase
// Make sure SUPABASE_URL and SUPABASE_KEY are correct in your .env file!
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 3. Health Check Route
app.get('/', (req, res) => {
    res.status(200).send("🚀 UniCollab Server is LIVE and REACHABLE!");
});

// 4. Import Routes (Ensure these files exist in src/routes/)
const authRoutes = require('./src/routes/auth');
const materialRoutes = require('./src/routes/material');

// 5. Apply Routes 
app.use('/api/auth', authRoutes);
app.use('/api/material', materialRoutes); 

// 6. Start Server on Port 5002
const PORT = 5002; 
app.listen(PORT, '0.0.0.0', () => {
    console.log(`-----------------------------------------`);
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔗 Local: http://localhost:${PORT}`);
    console.log(`-----------------------------------------`);
    console.log(`👉 NOW RUN: npx ngrok http ${PORT}`);
});