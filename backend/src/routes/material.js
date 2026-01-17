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
                "temperature": 0.3 // Even lower for flashcard consistency
            })
        });

        const data = await response.json();
        if (!data.choices || !data.choices[0]) throw new Error("AI Provider failed.");
        return data.choices[0].message.content;
    } catch (err) {
        console.error("❌ AI Fetch Error:", err.message);
        throw err;
    }
};

// --- 🛠️ 1. UPLOAD & PROCESS (Summary + Quiz) ---
router.post('/upload', upload.single('pdf'), async (req, res) => {
    try {
        const { userId } = req.body; 
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        // A. Upload to Supabase Bucket
        const fileName = `${userId}/${Date.now()}.pdf`;
        const { data: storageData, error: storageError } = await supabase.storage
            .from('study-materials')
            .upload(fileName, req.file.buffer, { contentType: 'application/pdf' });

        if (storageError) throw storageError;
        const { data: publicUrlData } = supabase.storage.from('study-materials').getPublicUrl(fileName);
        const fileUrl = publicUrlData.publicUrl;

        // B. Extract Text
        const pdfData = await pdfParse(req.file.buffer);
        const text = pdfData.text.trim();
        if (!text || text.length < 50) return res.status(400).json({ error: "PDF is empty or unreadable." });

        // C. Streak Logic
        let currentStreak = 1;
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        const { data: profile } = await supabase.from('leaderboards').select('streak, last_upload_date').eq('user_id', userId).maybeSingle();
        if (profile) {
            if (profile.last_upload_date === yesterday) currentStreak = (profile.streak || 0) + 1;
            else if (profile.last_upload_date === today) currentStreak = profile.streak || 1;
        }

        await supabase.from('leaderboards').upsert({ user_id: userId, streak: currentStreak, last_upload_date: today }, { onConflict: 'user_id' });

        // D. AI Generation (Summary + Quiz)
        const contextText = text.substring(0, 7000); 
        const fullPrompt = `Act as a Nigerian University Lecturer. Analyze these notes: "${contextText}"
            1. Provide a Summary in bullet points.
            2. Provide exactly 5 Multiple Choice Questions.
            OUTPUT: ---SUMMARY--- [text] ---QUIZ--- [{"question": "q", "options": ["a","b","c","d"], "correctAnswer": 0}]`;

        const aiRawResponse = await callAI(fullPrompt);
        const parts = aiRawResponse.split('---QUIZ---');
        const summary = parts[0].replace('---SUMMARY---', '').trim();
        
        let quizData = [];
        try {
            const jsonMatch = parts[1].match(/\[[\s\S]*\]/);
            quizData = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
        } catch (e) { quizData = []; }

        // E. Save to DB
        const { data: materialRecord } = await supabase.from('user_materials').insert([{
            user_id: userId,
            file_url: fileUrl,
            title: req.file.originalname,
            summary: summary,
            quiz_json: quizData,
            raw_text: text // Store text so we can generate flashcards later!
        }]).select();

        res.status(200).json({ id: materialRecord[0].id, summary, quiz: quizData, streak: currentStreak, fileUrl });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- 🛠️ 2. GENERATE FLASHCARDS (New Standard Feature) ---
router.post('/generate-flashcards', async (req, res) => {
    const { materialId } = req.body;
    try {
        const { data: material, error } = await supabase
            .from('user_materials')
            .select('raw_text, title')
            .eq('id', materialId)
            .single();

        if (!material || !material.raw_text) return res.status(404).json({ error: "Material text not found." });

        const prompt = `Act as a Study Tutor. Create 8 educational Flashcards from this text: "${material.raw_text.substring(0, 6000)}"
        Format ONLY as a JSON array: [{"front": "Question/Term", "back": "Answer/Definition"}]`;

        const aiResponse = await callAI(prompt);
        const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
        const flashcards = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

        res.status(200).json({ flashcards });
    } catch (error) {
        console.error("Flashcard Error:", error);
        res.status(500).json({ error: "AI failed to generate cards." });
    }
});

// --- 🛠️ 3. FETCH, DELETE, & SCORES (Rest of your existing code) ---
router.get('/user/:userId', async (req, res) => {
    const { userId } = req.params;
    const { data, error } = await supabase.from('user_materials').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    res.status(200).json(data);
});

router.delete('/:id', async (req, res) => {
    await supabase.from('user_materials').delete().eq('id', req.params.id);
    res.status(200).json({ message: "Deleted" });
});

router.post('/submit-score', async (req, res) => {
    const { userId, score, department, university, studentName } = req.body;
    const { data: profile } = await supabase.from('leaderboards').select('streak').eq('user_id', userId).maybeSingle();
    const totalPoints = parseInt(score) + ((profile?.streak || 1) * 10);
    await supabase.from('leaderboards').upsert([{ user_id: userId, student_name: studentName, score: totalPoints, department, university, captured_at: new Date() }], { onConflict: 'user_id' });
    res.status(200).json({ message: "Score recorded!" });
});

router.get('/leaderboard', async (req, res) => {
    const { data } = await supabase.from('leaderboards').select('*').order('score', { ascending: false }).limit(25);
    res.status(200).json(data);
});

module.exports = router;