const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const processLectureContent = async (text) => {
  // We use the most stable model string for 2026
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `
    Summarize the following university lecture notes into 5 clear bullet points.
    Then, create 3 multiple-choice questions for a student tournament.
    
    Output exactly in this JSON format:
    {
      "summary": ["point 1", "point 2", ...],
      "quiz": [
        { "question": "...", "options": ["A", "B", "C", "D"], "answer": 0 }
      ]
    }

    Notes: ${text}
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const cleanJson = response.text().replace(/```json|```/g, ""); // Clean markdown
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("Gemini Error:", error.message);
    throw new Error("AI Processing failed. Check API Key or Model availability.");
  }
};

module.exports = { processLectureContent };