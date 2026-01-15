require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Routes
const authRoutes = require('./src/routes/auth');
const materialRoutes = require('./src/routes/material');
app.use('/api/materials', materialRoutes);
app.use('/api/auth', authRoutes);


const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://10.121.105.36:${PORT}`);
});