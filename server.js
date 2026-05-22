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

        const prompt = `
            Analyze this university timetable image. Extract all course slots and format them into a valid JSON array.
            Each object in the array must strictly match this schema:
            {
                "day": "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", or "Sunday"
                "course_code": "e.g., COMP 2404",
                "start_time": "HH:MM",
                "end_time": "HH:MM",
                "room": "e.g., NN 231"
            }
            Return ONLY the raw JSON data array. No markdown wrappers.
        `;

        // FIXED SDK CALL STRUCTURE
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                prompt,
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: mimeType
                    }
                }
            ],
        });

        // Safe extraction of the text response
        const responseText = response.text;
        if (!responseText) {
            throw new Error("Gemini returned an empty response");
        }

        // Clean up markdown code blocks if the model accidentally included them
        const cleanJsonText = responseText.replace(/```json|```/g, "").trim();
        const parsedSchedule = JSON.parse(cleanJsonText);

        res.json({ schedule: parsedSchedule });

    } catch (error) {
        // Look at your node terminal to see this output!
        console.error("CRITICAL BACKEND ERROR:", error);

        if (error.status === 429) {
            return res.status(429).json({ error: 'System is busy. Please try again in a minute.' });
        }
        
        // This is what your frontend is currently catching
        res.status(500).json({ error: error.message || 'Failed to accurately parse the timetable image.' });
    }
});

app.listen(3000, () => console.log('Server running safely on port 3000'));


import { google } from 'googleapis';

// Initialize the OAuth2 client using your credentials from the .env file
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/oauth2callback' // Must match your Cloud Console precisely
);

// 1. Endpoint to generate the Google Login URL
app.get('/api/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Gives you a refresh token to stay logged in
    scope: ['https://www.googleapis.com/auth/calendar.events'],
  });
  res.json({ url });
});

// 2. Endpoint where Google redirects the user after a successful login
app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  try {
    // Exchange the authorization code for access tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // In a real app, save these tokens securely (e.g., in a session or database)
    // For testing, we can redirect back to your frontend with a success message
    res.redirect('http://127.0.0.1:5500/index.html?auth=success');
  } catch (error) {
    console.error('Error retrieving access token', error);
    res.redirect('http://127.0.0.1:5500/index.html?auth=error');
  }
});

// 3. Endpoint to inject the parsed schedule into the user's calendar
app.post('/api/create-events', async (req, res) => {
  try {
    const { schedule } = req.body; // Pass the JSON array extracted by Gemini
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Helper: Map day names to actual start dates of your specific term
    // Let's assume the Fall semester starts the week of Monday, September 7th, 2026
    const dayToDateMap = {
      'Monday': '2026-09-07',
      'Tuesday': '2026-09-08',
      'Wednesday': '2026-09-09',
      'Thursday': '2026-09-10',
      'Friday': '2026-09-11'
    };

    // End date of the semester for the recurring rule (e.g., Dec 11, 2026)
    const semesterEndDate = '20261211T235959Z';

    for (const item of schedule) {
      const dateStr = dayToDateMap[item.day];
      if (!dateStr) continue;

      const startDateTime = `${dateStr}T${item.start_time}:00`;
      const endDateTime = `${dateStr}T${item.end_time}:00`;

      const event = {
        summary: `${item.course_code} (Sec ${item.section || 'A'})`,
        location: item.room,
        description: 'Automatically imported via Timetable Scanner.',
        start: {
          dateTime: startDateTime,
          timeZone: 'America/Toronto', // Change to your local time zone
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'America/Toronto',
        },
        // RRULE makes the event repeat weekly until the semester ends!
        recurrence: [
          `RRULE:FREQ=WEEKLY;UNTIL=${semesterEndDate}`
        ],
      };

      // Insert the event into the user's primary calendar
      await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
      });
    }

    res.json({ success: true, message: 'All classes successfully added to your Google Calendar!' });

  } catch (error) {
    console.error('Calendar Error:', error);
    res.status(500).json({ error: 'Failed to add events to Google Calendar.' });
  }
});