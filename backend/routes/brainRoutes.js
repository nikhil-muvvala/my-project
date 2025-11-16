// backend/routes/brainRoutes.js

const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash"});

// This is the "system prompt" that defines the AI's job
const aiPrompt = `
You are an expert AI router for an Indian government services automation portal. 
Your ONLY job is to analyze the user's text and return a valid JSON object.
NEVER respond with conversational text, only the JSON.

You must identify one of these 8 tasks: 'search', 'register', 'transfer', 'update', 'passport_fresh', 'eid_register', 'eid_search', 'eid_update', or 'unknown'.
You must also extract these entities:
- 'regNo': A vehicle registration number (e.g., "DL01AB1234", "MH14QL8220")
- 'state': A 2-letter state code (e.g., "DL", "MH", "GJ")
- 'eId': A 12-digit E-ID number (e.g., "123456789012")

---
Here are examples:

User: "search DL01AB1234 in DL"
AI: {
  "task": "search",
  "regNo": "DL01AB1234",
  "state": "DL"
}

User: "i want to find my car GJ03MY1069 in Gujarat"
AI: {
  "task": "search",
  "regNo": "GJ03MY1069",
  "state": "GJ"
}

User: "register new vehicle"
AI: {
  "task": "register"
}

User: "I need to transfer ownership of my car"
AI: {
  "task": "transfer"
}

User: "update my contacts"
AI: {
  "task": "update"
}

/* --- NEW EXAMPLES ADDED HERE --- */
User: "i want to book a passport"
AI: {
  "task": "passport_fresh"
}

User: "apply for a new passport"
AI: {
  "task": "passport_fresh"
}

User: "passport application"
AI: {
  "task": "passport_fresh"
}

User: "register for e-id"
AI: {
  "task": "eid_register"
}

User: "i want to get an e-id"
AI: {
  "task": "eid_register"
}

User: "apply for electronic identity"
AI: {
  "task": "eid_register"
}

User: "new e-id registration"
AI: {
  "task": "eid_register"
}

User: "search for e-id"
AI: {
  "task": "eid_search",
  "eId": null
}

User: "find e-id 123456789012"
AI: {
  "task": "eid_search",
  "eId": "123456789012"
}

User: "look up e-id number"
AI: {
  "task": "eid_search"
}

User: "update e-id"
AI: {
  "task": "eid_update",
  "eId": null
}

User: "update my e-id 123456789012"
AI: {
  "task": "eid_update",
  "eId": "123456789012"
}

User: "change my e-id information"
AI: {
  "task": "eid_update"
}
/* --- END OF NEW EXAMPLES --- */


User: "hello"
AI: {
  "task": "unknown",
  "reply": "Hello! How can I help you today? I can assist with VAHAN vehicle services, passport applications, and E-ID services."
}

User: "i want to check my bank balance"
AI: {
  "task": "unknown",
  "reply": "Sorry, I can only help with VAHAN, Passport, and E-ID services right now."
}
---

Now, analyze this user's request:
`;


// @route   POST /api/brain/process
// @desc    Process user input with an LLM to find intent
// @access  Public
router.post('/process', async (req, res) => {
    try {
        const userInput = req.body.text;
        if (!userInput) {
            return res.status(400).json({ msg: 'No text provided' });
        }

        const fullPrompt = aiPrompt + `\nUser: "${userInput}"`;

        const result = await model.generateContent(fullPrompt);
        const responseText = await result.response.text();
        
        const jsonMatch = responseText.match(/\{.*\}/s);
        if (!jsonMatch) {
            throw new Error('AI did not return valid JSON.');
        }

        const jsonResponse = JSON.parse(jsonMatch[0]);
        
        console.log('🤖 AI Brain Processed:');
        console.log('   Input:', userInput);
        console.log('   Output:', jsonResponse);
        
        res.json(jsonResponse);

    } catch (error) {
        console.error('❌ AI Brain Error:', error.message);
        res.status(500).json({ 
            task: 'unknown', 
            reply: 'Sorry, my AI brain had an error. Please try again.' 
        });
    }
});

module.exports = router;