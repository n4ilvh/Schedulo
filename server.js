import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import 'dotenv/config'; // Loads GEMINI_API_KEY from a .env file
import { google } from 'googleapis';

const app = express();
app.use(cors()); // Allow your frontend to talk to the backend
app.use(express.json());

// Setup memory storage for uploaded images so we don't clog up the disk
const upload = multer({ storage: multer.memoryStorage() });

// Initialize the Google Gen AI client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Initialize the OAuth2 client using your credentials from the .env file
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/oauth2callback' // Must match Cloud Console
);

// ==========================================
// 1. TIMETABLE EXTRACTION ROUTE
// ==========================================
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
            If you do not detect any text return nothing.
            If you do not detect a schedule return nothing.
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

        // Clean up markdown code blocks if the model accidentally included them
        const cleanJsonText = responseText.replace(/```json|```/g, "").trim();
        const parsedSchedule = JSON.parse(cleanJsonText);

        const structuredByDay = {
            Monday: [], Tuesday: [], Wednesday: [], 
            Thursday: [], Friday: [], Saturday: [], Sunday: []
        };

        parsedSchedule.forEach(item => {
            if (structuredByDay[item.day]) {
                structuredByDay[item.day].push(item);
            } else {
                // Handle edge case if the model didn't perfectly capitalize the day
                console.warn(`Unexpected day format found: ${item.day}`);
            }
        });

        res.json({ schedule: structuredByDay });

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


// ==========================================
// 2. GOOGLE AUTH ROUTES
// ==========================================
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
    res.redirect('http://127.0.0.1:5500/index.html?auth=success');
  } catch (error) {
    console.error('Error retrieving access token', error);
    res.redirect('http://127.0.0.1:5500/index.html?auth=error');
  }
});

// ==========================================
// 3. GOOGLE CALENDAR EXPORT ROUTE
// ==========================================
app.post('/api/create-events', async (req, res) => {
  try {
    const { schedule } = req.body; // Pass the JSON array extracted by Gemini
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // FIX let users choose course start date
    const dayToDateMap = {
      'Monday': '2026-09-07',
      'Tuesday': '2026-09-08',
      'Wednesday': '2026-09-09',
      'Thursday': '2026-09-10',
      'Friday': '2026-09-11'
    };

    // FIX let users choose course end date
    const semesterEndDate = '20261211T235959Z';

    const flatSchedule = [];
 for (const day in schedule) {
      schedule[day].forEach(item => {
        // Ensure the item keeps its day property attached just in case
        flatSchedule.push({ ...item, day: day });
      });
    }

    // Now loop over the flat array like before
    for (const item of flatSchedule) {
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
          timeZone: 'America/Toronto', 
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'America/Toronto',
        },
        recurrence: [
          `RRULE:FREQ=WEEKLY;UNTIL=${semesterEndDate}`
        ],
      };

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

app.listen(3000, () => console.log('Server running safely on port 3000'));