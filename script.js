const fileSelector = document.querySelector('input');
const start = document.querySelector('button');
const img = document.querySelector('img');
const textarea = document.getElementById('middle');
const upper = document.getElementById('upper');
const calendarGrid = document.getElementById('calendar-grid');

const imgBox = document.getElementById('image-box');

// Create UI buttons programmatically for Google Calendar
const authButton = document.createElement('button');
authButton.innerHTML = 'Connect Google Calendar';
authButton.classList.add("button");

const exportButton = document.createElement('button');
exportButton.innerHTML = 'Export to Google Calendar';
exportButton.classList.add("button");

// hide some elements on load
exportButton.style.display = 'none';
imgBox.style.display = "none";
calendarGrid.style.display = "none";

// add buttons to top bar
upper.appendChild(authButton);
upper.append(exportButton);

// Append our new workflow buttons right below the main scan button
// start.insertAdjacentElement('afterend', authButton);
// authButton.insertAdjacentElement('afterend', exportButton);

const BACKEND_URL = 'http://localhost:3000';

// Check if the user just returned from a successful Google OAuth login
window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'success') {
        textarea.innerHTML = 'Google Calendar connected successfully!';
    } else if (urlParams.get('auth') === 'error') {
        textarea.innerHTML = 'Calendar authorization failed. Please try again.';
    }
};

// Display image on upload
fileSelector.onchange = () => {
    const file = fileSelector.files[0];
    if (file) {
        imgBox.style.display = "block";
        calendarGrid.style.display = "grid";
        var imgUrl = window.URL.createObjectURL(file);
        img.src = imgUrl;
    }
};

// Kick off OAuth authentication when clicked
authButton.onclick = async () => {
    try {
        textarea.innerHTML = 'Connecting to Google Calendar...';
        const response = await fetch(`${BACKEND_URL}/api/auth/google`);
        const data = await response.json();
        
        // Redirect the user's entire browser tab straight to Google's login portal
        window.location.href = data.url;
    } catch (error) {
        console.error(error);
        textarea.innerHTML = 'Error fetching Google Authentication link.';
    }
};

// =========================================================
// TEXT RECOGNITION & RENDER FLOW
// =========================================================
start.onclick = async () => {
    const file = fileSelector.files[0];
    if (!file) {
        textarea.innerHTML = 'Please select an image';
        return;
    }

    textarea.innerHTML = 'Processing...';

    const formData = new FormData();
    formData.append('timetable', file);

    try {
        const response = await fetch(`${BACKEND_URL}/api/extract-schedule`, {
             method: 'POST',
             body: formData
        });
        
        const data = await response.json();

        // FIXED: Check response.ok AFTER parsing data so we can securely catch server errors
        if (!response.ok) {
            throw new Error(data.error || 'Server error');
        }

        textarea.innerHTML = 'Schedule extracted! Review and adjust any values directly in the calendar columns below before exporting.';

        // Call our rendering function to build your new UI columns
        renderCalendar(data.schedule);

    } catch (error) {
        console.error(error);
        textarea.innerHTML = `Error: ${error.message}`;
    }
};

// Dynamically build your editable day divs
function renderCalendar(scheduleByDay) {
    const calendarGrid = document.getElementById('calendar-grid');
    if (!calendarGrid) {
        console.error("Missing container element: Add <div id='calendar-grid'></div> to your HTML.");
        return;
    }
    
    calendarGrid.innerHTML = '';
    const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    daysOrder.forEach(dayName => {
        const dayColumn = document.createElement('div');
        dayColumn.classList.add('day-column');
        // Set a data attribute so we can find this column easily when collecting inputs later
        dayColumn.setAttribute('data-day', dayName);

        const dayHeader = document.createElement('h3');
        dayHeader.classList.add('day-header');
        dayHeader.innerText = dayName;
        dayColumn.appendChild(dayHeader);

        const dayEvents = scheduleByDay[dayName] || [];

        if (dayEvents.length === 0) {
            const noClassMessage = document.createElement('p');
            noClassMessage.classList.add('no-class-msg');
            noClassMessage.innerText = 'No classes';
            dayColumn.appendChild(noClassMessage);
        } else {
            dayEvents.forEach(item => {
                const classCard = document.createElement('div');
                classCard.classList.add('class-card');

                // Inputs keep values completely flexible for manual corrections
                classCard.innerHTML = `
                    <input type="text" class="edit-code" value="${item.course_code}" />
                    <div class="time-row">
                        <input type="text" class="edit-start" value="${item.start_time}" />
                        <span>-</span>
                        <input type="text" class="edit-end" value="${item.end_time}" />
                    </div>
                    <input type="text" class="edit-room" value="${item.room}" />
                `;
                dayColumn.appendChild(classCard);
            });
        }
        calendarGrid.appendChild(dayColumn);
    });
}

// =========================================================
// READ EDITED DATA & INJECT TO GOOGLE CALENDAR
// =========================================================
exportButton.onclick = async () => {
    const calendarGrid = document.getElementById('calendar-grid');
    const dayColumns = calendarGrid?.querySelectorAll('.day-column');

    if (!dayColumns || dayColumns.length === 0) {
        textarea.innerHTML = 'No parsed schedule UI found to export. Please parse a timetable first.';
        return;
    }

    textarea.innerHTML = 'Scraping changes from your interface and importing into Google Calendar...';

    // RE-ASSEMBLE DATA: Read current text values directly from the UI inputs
    const updatedSchedule = {
        Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: []
    };

    dayColumns.forEach(column => {
        const dayName = column.getAttribute('data-day');
        const cards = column.querySelectorAll('.class-card');

        cards.forEach(card => {
            updatedSchedule[dayName].push({
                course_code: card.querySelector('.edit-code').value,
                start_time: card.querySelector('.edit-start').value,
                end_time: card.querySelector('.edit-end').value,
                room: card.querySelector('.edit-room').value
            });
        });
    });

    try {
        const response = await fetch(`${BACKEND_URL}/api/create-events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ schedule: updatedSchedule }) // Send the fresh edits
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to inject calendar events.');
        }

        textarea.innerHTML = `🎉 Success! ${data.message}`;

    } catch (error) {
        console.error(error);
        textarea.innerHTML = `Calendar Error: ${error.message}`;
    }
};