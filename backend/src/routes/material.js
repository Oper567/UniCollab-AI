const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { createClient } = require('@supabase/supabase-js');

// Config: Max file size 20MB
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 } 
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Helper function to call OpenRouter (Llama 3.3)
const callAI = async (prompt) => {
    try {
        console.log("🤖 AI: Sending request to OpenRouter...");
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://unicollab.edu.ng", 
                "X-Title": "UniCollab AI"
            },
            body: JSON.stringify({
                "model": "meta-llama/llama-3.3-70b-instruct:free", 
                "messages": [{ "role": "user", "content": prompt }],
                "temperature": 0.5 // Lower temperature for more structured JSON
            })
        });

        const data = await response.json();
        
        if (!data.choices || !data.choices[0]) {
            console.error("❌ AI Error Details:", data);
            throw new Error(data.error?.message || "AI Provider failed to return choices.");
        }

        console.log("✅ AI: Response received from Llama.");
        return data.choices[0].message.content;
    } catch (err) {
        console.error("❌ AI Fetch Error:", err.message);
        throw err;
    }
};

// --- 🛠️ 1. UPLOAD, STORAGE, & STREAK ---
router.post('/upload', upload.single('pdf'), async (req, res) => {
    console.log("📂 Upload: Received request at /api/material/upload");
    
    try {
        const { userId } = req.body; 
        if (!req.file) {
            console.warn("⚠️ Upload: No file found in request.");
            return res.status(400).json({ error: "No file uploaded" });
        }

        console.log(`📄 Upload: Processing "${req.file.originalname}" for User: ${userId}`);

        // 🟢 STEP A: Upload to Supabase Bucket
        const fileExt = req.file.originalname.split('.').pop();
        const fileName = `${userId}/${Date.now()}.${fileExt}`;

        console.log("☁️ Supabase: Uploading to storage...");
        const { data: storageData, error: storageError } = await supabase.storage
            .from('study-materials')
            .upload(fileName, req.file.buffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (storageError) {
            console.error("❌ Supabase Storage Error:", storageError.message);
            throw storageError;
        }

        const { data: publicUrlData } = supabase.storage
            .from('study-materials')
            .getPublicUrl(fileName);
        
        const fileUrl = publicUrlData.publicUrl;

        // 🟢 STEP B: Extract Text for AI
        console.log("📝 PDF: Extracting text...");
        let text = "";
        try {
            const pdfData = await pdfParse(req.file.buffer);
            text = pdfData.text.trim();
        } catch (pdfErr) {
            console.error("❌ PDF Parsing Error:", pdfErr.message);
            return res.status(400).json({ error: "Failed to read PDF content." });
        }

        if (!text || text.length < 50) {
            return res.status(400).json({ error: "PDF seems empty or is a scanned image (no selectable text)." });
        }

        // --- 🔥 STREAK LOGIC ---
        let currentStreak = 1;
        if (userId && userId !== "null" && userId !== "undefined") {
            const today = new Date().toISOString().split('T')[0];
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

            const { data: profile } = await supabase
                .from('leaderboards')
                .select('streak, last_upload_date')
                .eq('user_id', userId)
                .maybeSingle();

            if (profile) {
                if (profile.last_upload_date === yesterday) {
                    currentStreak = (profile.streak || 0) + 1;
                    console.log(`🔥 Streak Continued! New Streak: ${currentStreak}`);
                } else if (profile.last_upload_date === today) {
                    currentStreak = profile.streak || 1;
                    console.log(`✅ Already uploaded today. Streak stays at: ${currentStreak}`);
                } else {
                    console.log(`❄️ Streak Broken. Resetting to 1.`);
                }
            }

            await supabase
                .from('leaderboards')
                .upsert({ 
                    user_id: userId, 
                    streak: currentStreak, 
                    last_upload_date: today 
                }, { onConflict: 'user_id' });
        }

        // 🟢 STEP C: AI Generation
        const contextText = text.substring(0, 8000); // Send first 8k chars for context
        const fullPrompt = `
            Act as a Nigerian University Lecturer. 
            Analyze these notes: "${contextText}"
            
            1. Provide a Summary using bullet points focused on key Exam concepts.
            2. Provide exactly 5 Multiple Choice Questions.
            
            OUTPUT FORMAT:
            ---SUMMARY---
            (Bullet point summary here)
            
            ---QUIZ---
            [
              {"question": "Example?", "options": ["A", "B", "C", "D"], "correctAnswer": 0}
            ]
            
            Ensure the QUIZ part is a valid JSON array.
        `;

        const aiRawResponse = await callAI(fullPrompt);
        const parts = aiRawResponse.split('---QUIZ---');
        const summary = parts[0].replace('---SUMMARY---', '').trim();
        
        let quizData = [];
        try {
            const jsonMatch = parts[1].match(/\[[\s\S]*\]/);
            quizData = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
        } catch (e) {
            console.error("❌ AI: Quiz JSON parsing failed.");
            quizData = [{ "question": "Could not generate quiz properly.", "options": ["Try again", "Use summary", "N/A", "N/A"], "correctAnswer": 0 }];
        }

        // 🟢 STEP D: Save record to 'user_materials' table
        console.log("💾 DB: Saving material record...");
        const { data: materialRecord, error: dbError } = await supabase.from('user_materials').insert([{
            user_id: userId,
            file_url: fileUrl,
            title: req.file.originalname,
            summary: summary,
            quiz_json: quizData
        }]).select();

        if (dbError) {
            console.error("❌ Database Error:", dbError.message);
        }

        console.log("🏁 Success: Sending response to frontend.");
        res.status(200).json({ 
            id: materialRecord ? materialRecord[0].id : null,
            summary, 
            quiz: quizData,
            streak: currentStreak,
            fileUrl
        });

    } catch (error) {
        console.error("❌ Backend Error:", error.stack);
        res.status(500).json({ error: "Failed to process PDF", details: error.message });
    }
});

// --- 🛠️ 2. FETCH USER MATERIALS ---
router.get('/user/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const { data, error } = await supabase
            .from('user_materials')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: "Could not fetch library" });
    }
});

// --- 🛠️ 3. DELETE MATERIAL ---
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const { error } = await supabase
            .from('user_materials')
            .delete()
            .eq('id', id);
        if (error) throw error;
        res.status(200).json({ message: "Deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: "Delete failed" });
    }
});

// --- 🛠️ 4. SUBMIT SCORE ---
router.post('/submit-score', async (req, res) => {
    const { userId, score, department, university, studentName } = req.body;
    try {
        const { data: profile } = await supabase.from('leaderboards').select('streak').eq('user_id', userId).maybeSingle();
        const streakBonus = (profile?.streak || 1) * 10;
        const totalPoints = parseInt(score) + streakBonus;

        const { error } = await supabase
            .from('leaderboards')
            .upsert([{ 
                user_id: userId, 
                student_name: studentName, 
                score: totalPoints, 
                department, 
                university,
                captured_at: new Date() 
            }], { onConflict: 'user_id' });
        
        if (error) throw error;
        res.status(200).json({ message: "Score recorded!", bonus: streakBonus });
    } catch (error) {
        res.status(500).json({ error: "Could not save score" });
    }
});

// --- 🛠️ 5. LEADERBOARD ---
router.get('/leaderboard', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('leaderboards')
            .select('*')
            .order('score', { ascending: false })
            .limit(25);
        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: "Ranking unavailable" });
    }
});

module.exports = router;