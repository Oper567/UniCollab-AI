const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Supabase & Gemini
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 1. Get Summary (Placeholder for your logic)
router.get('/summary/:id', async (req, res) => {
    // Your summary logic goes here
    res.status(200).json({ message: "Summary route ready" });
});

// 2. Generate Quiz using Gemini AI
router.post('/generate-quiz', async (req, res) => {
    const { text, materialId } = req.body;

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const prompt = `
            Based on the following lecture notes, generate 5 multiple-choice questions for a student quiz.
            Format the output strictly as a JSON array of objects. 
            Each object must have: "question", "options" (an array of 4 strings), and "correctAnswer" (index 0-3).
            
            Lecture Notes: ${text.substring(0, 5000)}
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        // Clean the response in case Gemini adds markdown formatting
        const quizData = JSON.parse(response.text().replace(/```json|```/g, ""));

        // Save quiz to Supabase
        await supabase
            .from('quizzes')
            .insert([{ material_id: materialId, questions: quizData }]);

        res.status(200).json(quizData);
    } catch (error) {
        console.error("Quiz Generation Error:", error);
        res.status(500).json({ error: "Failed to generate quiz" });
    }
});

// 3. Submit Score to Leaderboard
router.post('/submit-score', async (req, res) => {
    const { userId, score, department, university, studentName } = req.body;

    const { data, error } = await supabase
        .from('leaderboards')
        .insert([
            { 
                user_id: userId, 
                student_name: studentName, // Added to match your mobile UI
                score: score, 
                department: department, 
                university: university,
                captured_at: new Date() 
            }
        ]);

    if (error) {
        console.error("Score Submission Error:", error);
        return res.status(500).json(error);
    }
    res.status(200).json({ message: `Score recorded! Points added to ${department}` });
});

// 4. NEW: Fetch Leaderboard Rankings
router.get('/leaderboard', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('leaderboards')
            .select('id, student_name, score, department')
            .order('score', { ascending: false })
            .limit(10);

        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        console.error("Leaderboard Fetch Error:", error);
        res.status(500).json({ error: "Could not fetch rankings" });
    }
});

module.exports = router;