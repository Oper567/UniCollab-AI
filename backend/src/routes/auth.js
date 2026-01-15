const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

router.post('/register', async (req, res) => {
  const { email, password, name, university, department } = req.body;
  console.log("Registration attempt for:", email); // Helpful for debugging

  try {
    // 1. Create User in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
        console.error("Auth Error:", authError.message);
        return res.status(400).json({ error: authError.message });
    }

    // 2. Store extra details in the 'profiles' table we just created in SQL
    // Note: We use authData.user.id to link the profile to the login account
    const { error: profileError } = await supabase
      .from('profiles')
      .insert([
        { 
          id: authData.user.id, 
          full_name: name, 
          university: university, 
          department: department 
        }
      ]);

    if (profileError) {
        console.error("Profile DB Error:", profileError.message);
        return res.status(400).json({ error: profileError.message });
    }

    res.status(201).json({ message: "Registration successful!" });
  } catch (error) {
    console.error("Server Error:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;