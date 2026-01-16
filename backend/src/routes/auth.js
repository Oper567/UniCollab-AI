const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 1. REGISTER: Creates account and saves University/Dept details
router.post('/register', async (req, res) => {
  const { email, password, name, university, department } = req.body;
  console.log("Registration attempt for:", email);

  try {
    // A. Create User in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
        console.error("Auth Error:", authError.message);
        return res.status(400).json({ error: authError.message });
    }

    // B. Store extra details in 'profiles' table using the new User ID
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

// 2. LOGIN: Verifies credentials and returns session token
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log("Login attempt for:", email);

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    res.status(200).json({ 
        message: "Login successful", 
        user: data.user, 
        session: data.session 
    });
  } catch (error) {
    console.error("Login Error:", error.message);
    res.status(401).json({ error: error.message });
  }
});

// 3. LOGOUT: Ends the Supabase session
router.post('/logout', async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. GET PROFILE: Fetches user details for the UI
router.get('/profile/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;