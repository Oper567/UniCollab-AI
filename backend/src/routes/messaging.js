const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 📩 1. Send a message
router.post('/send', async (req, res) => {
    const { senderId, receiverId, content } = req.body;
    try {
        const { data, error } = await supabase
            .from('messages')
            .insert([{ 
                sender_id: senderId, 
                receiver_id: receiverId, 
                content,
                created_at: new Date() 
            }]);

        if (error) throw error;
        res.status(200).json({ success: true, message: "Message sent!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 📥 2. Get conversation history between two users
router.get('/history/:userId/:otherId', async (req, res) => {
    const { userId, otherId } = req.params;
    try {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            // This complex query gets messages where you are sender OR receiver
            .or(`and(sender_id.eq.${userId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${userId})`)
            .order('created_at', { ascending: true });

        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;