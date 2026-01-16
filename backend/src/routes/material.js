const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse'); // ✅ Ensure 'npm install pdf-parse' is run
const { createClient } = require('@supabase/supabase-js');

// Initialize Middleware & Clients
const upload = multer({ storage: multer.memoryStorage() });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Helper function to call OpenRouter
const callAI = async (prompt) => {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost:3000", 
                "X-Title": "UniCollab AI"
            },
            body: JSON.stringify({
                "model": "meta-llama/llama-3.3-70b-instruct:free", 
                "messages": [{ "role": "user", "content": prompt }]
            })
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message || "AI Provider Error");
        return data.choices[0].message.content;
    } catch (err) {
        console.error("AI Fetch Error:", err.message);
        throw err;
    }
};

// --- 🛠️ 1. SUMMARIZE & AUTO-GENERATE QUIZ ---
router.post('/summarize', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        // ✅ Extract Text from PDF Buffer (Fixed function call)
        const pdfData = await pdfParse(req.file.buffer);
        const text = pdfData.text;

        if (!text || text.length < 10) {
            throw new Error("PDF seems empty or is image-based (OCR required).");
        }

        // STEP 1: Generate Summary
        const summaryPrompt = `Summarize these lecture notes for a Nigerian university student. 
        Focus on key concepts and formulas. Use bullet points: ${text.substring(0, 7000)}`;
        
        const summary = await callAI(summaryPrompt);

        // STEP 2: Generate Tournament Quiz (5 Questions)
        const quizPrompt = `Based on these notes, generate 5 multiple-choice questions.
        Output ONLY a raw JSON array. Do not include introductory text.
        Format: [{"question": "...", "options": ["a", "b", "c", "d"], "correctAnswer": 0}]
        Notes: ${text.substring(0, 4000)}`;

        const quizResponse = await callAI(quizPrompt);
        
        // Robust JSON Extraction
        const jsonMatch = quizResponse.match(/\[[\s\S]*\]/);
        const quizData = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

        // Return everything to the mobile app
        res.status(200).json({ 
            summary, 
            quiz: quizData,
            extractedText: text.substring(0, 5000) 
        });

    } catch (error) {
        console.error("Backend Error:", error.message);
        res.status(500).json({ error: "Failed to process PDF", details: error.message });
    }
});

// 2. SUBMIT SCORE
router.post('/submit-score', async (req, res) => {
    const { userId, score, department, university, studentName } = req.body;
    try {
        const { error } = await supabase
            .from('leaderboards')
            .insert([{ 
                user_id: userId, 
                student_name: studentName, 
                score: parseInt(score), 
                department, 
                university,
                captured_at: new Date() 
            }]);
        if (error) throw error;
        res.status(200).json({ message: "Score recorded!" });
    } catch (error) {
        console.error("Score Submit Error:", error);
        res.status(500).json({ error: "Could not save score" });
    }
});

// 3. LEADERBOARD
router.get('/leaderboard', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('leaderboards')
            .select('*')
            .order('score', { ascending: false })
            .limit(20);
        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: "Could not fetch rankings" });
    }
});

module.exports = router;