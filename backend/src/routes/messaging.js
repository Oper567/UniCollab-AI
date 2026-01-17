const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Using service role key if available for administrative actions like "Get or Create"
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- 🛡️ VAWULENCE BLOCKER (Word Filter) ---
const filterContent = (text) => {
  const forbidden = ["fuck", "scam", "idiot", "olodo", "mumu", "stfu", "mgbeke"]; 
  let cleanText = text;
  
  forbidden.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    cleanText = cleanText.replace(regex, "🌟"); 
  });
  
  return cleanText;
};

// --- 🏛️ 1. GET UNIVERSITY HUB & HISTORY ---
router.get('/university-hub/:uniName', async (req, res) => {
    const { uniName } = req.params;
    try {
        // 1. Find or create the university group record
        let { data: group, error: gError } = await supabase
            .from('university_groups')
            .select('*')
            .eq('university_name', uniName)
            .maybeSingle();

        if (!group) {
            const { data: newGroup, error: iError } = await supabase
                .from('university_groups')
                .insert([{ university_name: uniName }])
                .select()
                .single();
            
            if (iError) throw iError;
            group = newGroup;
        }

        // 2. Fetch last 50 group messages
        const { data: messages, error: mError } = await supabase
            .from('messages')
            .select(`
                id,
                content,
                sender_id,
                receiver_id,
                created_at,
                profiles:sender_id (full_name)
            `)
            .eq('receiver_id', group.id)
            .eq('is_group_msg', true)
            .order('created_at', { ascending: true })
            .limit(50);

        if (mError) throw mError;

        // 3. Get actual member count from profiles
        const { count, error: cError } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('university', uniName);

        // Returning the structure the frontend expects
        res.status(200).json({ 
            group: group, // contains group.id for the recipientId
            messages: messages || [],
            memberCount: count || 0
        });
    } catch (err) {
        console.error("Hub Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 📩 2. SEND MESSAGE (DMs & Group) ---
router.post('/send', async (req, res) => {
    const { senderId, receiverId, content, isGroup } = req.body;

    if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: "Message content cannot be empty" });
    }

    try {
        const sanitizedContent = filterContent(content);

        const { data, error } = await supabase
            .from('messages')
            .insert([{ 
                sender_id: senderId, 
                receiver_id: receiverId, 
                content: sanitizedContent, 
                is_group_msg: isGroup || false 
            }])
            .select(`
                *,
                profiles:sender_id (full_name)
            `)
            .single();

        if (error) throw error;
        res.status(200).json({ success: true, data });
    } catch (err) {
        console.error("Send Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// --- 💬 3. GET PRIVATE CHAT HISTORY ---
router.get('/history/:userA/:userB', async (req, res) => {
    const { userA, userB } = req.params;
    try {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .or(`and(sender_id.eq.${userA},receiver_id.eq.${userB}),and(sender_id.eq.${userB},receiver_id.eq.${userA})`)
            .eq('is_group_msg', false)
            .order('created_at', { ascending: true });

        if (error) throw error;
        res.status(200).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;