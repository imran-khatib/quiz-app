const express = require('express');
const cors = require('cors');
const { GoogleGenAI, Type } = require('@google/genai');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize the Google GenAI client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- In-memory Storage ---
let sessions = {};
let leaderboard = [
    { name: 'Alice', score: 4 },
    { name: 'Bob', score: 3 },
];

const textQuestionSchema = {
    type: Type.OBJECT,
    properties: {
        question: { type: Type.STRING },
        options: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
        },
        correctAnswerIndex: { type: Type.INTEGER }
    },
    required: ['question', 'options', 'correctAnswerIndex'],
};

const textQuizSchema = {
    type: Type.ARRAY,
    items: textQuestionSchema,
};

const visualQuestionSchema = {
    type: Type.OBJECT,
    properties: {
        question: { type: Type.STRING, description: "The question text. If the question is about an image, make sure it refers to the image." },
        options: { type: Type.ARRAY, items: { type: Type.STRING } },
        correctAnswerIndex: { type: Type.INTEGER },
        imagePrompt: { type: Type.STRING, description: "A detailed text-to-image prompt for a photorealistic image relevant to the question, or null if this is a text-only question." }
    },
    required: ['question', 'options', 'correctAnswerIndex', 'imagePrompt']
};

const visualQuizSchema = {
    type: Type.ARRAY,
    items: visualQuestionSchema
};


// --- API Endpoints ---

app.post('/startQuiz', async (req, res) => {
    const { name, difficulty, topic, visual } = req.body;
    if (!name || !difficulty || !topic) {
        return res.status(400).json({ error: 'Name, difficulty, and topic are required' });
    }

    try {
        let generatedQuestions;

        if (visual) {
             const prompt = `Generate 5 multiple-choice questions about ${topic} with ${difficulty} difficulty. For 2 of these questions, create a question that refers to an image and provide a detailed, descriptive text-to-image prompt in the "imagePrompt" field. For the other 3 questions, make them text-only and set the "imagePrompt" field to null.`;
             
             const response = await ai.models.generateContent({
                 model: "gemini-2.5-flash",
                 contents: prompt,
                 config: {
                     responseMimeType: "application/json",
                     responseSchema: visualQuizSchema,
                 },
             });

             const questionStructures = JSON.parse(response.text);
             
             generatedQuestions = await Promise.all(questionStructures.map(async (q) => {
                 if (q.imagePrompt) {
                     const imageResponse = await ai.models.generateImages({
                         model: 'imagen-4.0-generate-001',
                         prompt: q.imagePrompt,
                         config: { numberOfImages: 1, outputMimeType: 'image/jpeg' }
                     });
                     const imageBase64 = imageResponse.generatedImages[0].image.imageBytes;
                     return {
                         question: q.question,
                         options: q.options,
                         correctAnswerIndex: q.correctAnswerIndex,
                         imageBase64: imageBase64 
                     };
                 }
                 return { ...q, imageBase64: null };
             }));

        } else {
            const prompt = `Generate 5 multiple-choice questions about ${topic} with ${difficulty} difficulty. For each question, provide a "question" string, an array of 4 "options", and the 0-based index of the correct answer as "correctAnswerIndex".`;

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: textQuizSchema,
                },
            });
            generatedQuestions = JSON.parse(response.text);
        }
        
        if (!Array.isArray(generatedQuestions) || generatedQuestions.length === 0) {
             throw new Error("Invalid response format from AI.");
        }

        const sessionId = `session_${Date.now()}_${Math.random()}`;
        sessions[sessionId] = {
            name,
            difficulty,
            topic,
            score: 0,
            currentQuestionIndex: 0,
            questions: generatedQuestions.map(q => ({ ...q, userAnswerIndex: null })), // Initialize userAnswerIndex
            startTime: Date.now(),
        };

        res.json({ sessionId, totalQuestions: generatedQuestions.length });

    } catch (error) {
        console.error("Error in /startQuiz:", error);
        res.status(500).json({ error: 'Failed to generate quiz questions. The topic might be too specific or the AI service may be busy.' });
    }
});

app.get('/getQuestion', (req, res) => {
    const { sessionId } = req.query;
    const session = sessions[sessionId];

    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    const { questions, currentQuestionIndex } = session;

    if (currentQuestionIndex >= questions.length) {
        return res.status(404).json({ error: 'No more questions' });
    }
    
    const currentQuestion = questions[currentQuestionIndex];
    // Omit correctAnswerIndex from the payload sent to the client
    const { question, options, imageBase64 } = currentQuestion;
    res.json({ question, options, imageBase64, questionIndex: currentQuestionIndex });
});

app.post('/submitAnswer', (req, res) => {
    const { sessionId, questionIndex, answerIndex } = req.body;
    const session = sessions[sessionId];

    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    const question = session.questions[questionIndex];

    if (!question) {
        return res.status(400).json({ error: 'Invalid question index' });
    }
    
    // Store user's answer
    question.userAnswerIndex = answerIndex;

    const correct = question.correctAnswerIndex === answerIndex;
    if (correct) {
        session.score += 1;
    }
    
    session.currentQuestionIndex += 1;
    
    res.json({ correct, score: session.score });
});

app.post('/getHint', async (req, res) => {
    const { sessionId, questionIndex } = req.body;
    const session = sessions[sessionId];

    if (!session || !session.questions[questionIndex]) {
        return res.status(404).json({ error: 'Session or question not found' });
    }

    const currentQuestion = session.questions[questionIndex];
    
    try {
        const prompt = `Generate a short, subtle, one-sentence hint for the following quiz question. Do not give away the answer. Question: "${currentQuestion.question}"`;
        const response = await ai.models.generateContent({
             model: "gemini-2.5-flash",
             contents: prompt,
        });

        res.json({ hint: response.text });
    } catch (error) {
        console.error("Error in /getHint:", error);
        res.status(500).json({ error: 'Failed to generate a hint.' });
    }
});

app.post('/endQuiz', (req, res) => {
    const { sessionId } = req.body;
    const session = sessions[sessionId];

    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    
    const finalResult = { 
        name: session.name, 
        score: session.score,
        questions: session.questions // Return questions for review
    };
    
    leaderboard.push({ name: session.name, score: session.score });
    leaderboard.sort((a, b) => b.score - a.score);
    leaderboard = leaderboard.slice(0, 5);

    delete sessions[sessionId];

    res.json(finalResult);
});

app.post('/explainMistake', async (req, res) => {
    const { question, options, correctAnswerIndex, userAnswerIndex } = req.body;

    if (question == null || options == null || correctAnswerIndex == null || userAnswerIndex == null) {
        return res.status(400).json({ error: 'Missing required question data for explanation.' });
    }

    const correctAnswerText = options[correctAnswerIndex];
    const userAnswerText = options[userAnswerIndex];

    try {
        const prompt = `A user answered a quiz question incorrectly. Please provide a brief, easy-to-understand explanation.
            Question: "${question}"
            Correct Answer: "${correctAnswerText}"
            User's Incorrect Answer: "${userAnswerText}"
            
            Explain why "${correctAnswerText}" is the correct answer and briefly touch on why "${userAnswerText}" is incorrect. Keep it concise and friendly.`;
        const response = await ai.models.generateContent({
             model: "gemini-2.5-flash",
             contents: prompt,
        });

        res.json({ explanation: response.text });
    } catch (error) {
        console.error("Error in /explainMistake:", error);
        res.status(500).json({ error: 'Failed to generate an explanation.' });
    }
});


app.get('/getLeaderboard', (req, res) => {
    res.json(leaderboard);
});

// --- Serve Frontend Files ---
// This will serve files like `index.tsx` from the root directory
app.use(express.static(path.join(__dirname)));

// This is a catch-all route that sends the `index.html` file
// for any GET request that doesn't match an API route above.
// This allows the React app to handle routing.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


app.listen(PORT, () => {
    console.log(`Quiz server running on http://localhost:${PORT}`);
});
