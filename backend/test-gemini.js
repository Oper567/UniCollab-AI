require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('node:dns').setDefaultResultOrder('ipv4first');

async function testGemini() {
    // 1. Use the new key you just generated
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // 2. Explicitly target the stable model version
    // In 2026, 'gemini-1.5-flash' is the stable production name.
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        apiVersion: 'v1' // 👈 FORCE STABLE V1 (Bypasses the v1beta 404)
    });

    try {
        console.log("🚀 Testing Stable V1 Connection...");
        const result = await model.generateContent("Verify connection.");
        const response = await result.response;
        console.log("✅ SUCCESS:", response.text());
    } catch (error) {
        console.error("❌ Error:", error.message);
        
        // Final fallback: Use the specific model ID
        console.log("🔄 Trying fallback ID...");
        try {
            const fallback = genAI.getGenerativeModel({ model: "models/gemini-1.5-flash" });
            const res = await fallback.generateContent("Hi");
            console.log("✅ Success with models/ prefix!");
        } catch (e) {
            console.log("❌ All attempts failed.");
        }
    }
}

testGemini();