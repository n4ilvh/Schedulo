import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config'; // Loads your GEMINI_API_KEY from a .env file

const app = express();
app.use(cors()); // Allow your frontend to talk to the backend
app.use(express.json());

// Setup memory storage for uploaded images so we don't clog up the disk
const upload = multer({ storage: multer.memoryStorage() });

// Initialize the Google Gen AI client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post('/api/extract-schedule', upload.single('timetable'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file uploaded.' });
        }

        // Convert file buffer to base64 format for Gemini
        const base64Image = req.file.buffer.toString('base64');
        const mimeType = req.file.mimetype;

        // Structured prompt ensuring schema alignment for Google Calendar injection later
        const prompt = `
            Analyze this university timetable image. Extract all course slots and format them into a valid JSON array.
            
            Each object in the array must strictly match this schema:
            {
                "day": "Monday", "Tuesday", "Wednesday", "Thursday", or "Friday",
                "course_code": "e.g., COMP 2404 C",
                "start_time": "HH:MM (24-hour format)",
                "end_time": "HH:MM (24-hour format)",
                "room": "e.g., NN 231"
            }

            Return ONLY the raw JSON data. Do not wrap it in markdown block quotes like \`\`\`json or provide any text explanations.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: mimeType
                    }
                },
                prompt
            ],
        });

        // Safeguard to clean up the response string if markdown wrappers leak through
        const cleanJsonText = response.text.replace(/```json|```/g, "").trim();
        const parsedSchedule = JSON.parse(cleanJsonText);

        res.json({ schedule: parsedSchedule });

    } catch (error) {
        console.error("AI Error:", error);

        // Catch specific API limits or connection bottlenecks
        if (error.status === 429) {
            return res.status(429).json({ error: 'System is busy. Please try again in a minute.' });
        }
        
        res.status(500).json({ error: 'Failed to accurately parse the timetable image.' });
    }
});

app.listen(3000, () => console.log('Server running safely on port 3000'));