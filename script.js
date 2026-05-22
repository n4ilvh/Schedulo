const fileSelector = document.querySelector('input')
const start = document.querySelector('button')
const img = document.querySelector('img')
const textarea = document.querySelector('textarea')


// Create a couple of new UI buttons programmatically for Google Calendar
const authButton = document.createElement('button')
authButton.innerHTML = 'Connect Google Calendar'
authButton.style.display = 'block'
authButton.style.marginTop = '10px'
authButton.classList.add("button")

const exportButton = document.createElement('button')
exportButton.innerHTML = '3. Export to Google Calendar'
exportButton.style.display = 'none' // Hidden until schedule is scanned
exportButton.style.marginTop = '10px'

// Append our new workflow buttons right below the main scan button
start.insertAdjacentElement('afterend', authButton)
authButton.insertAdjacentElement('afterend', exportButton)

let globalExtractedSchedule = null; // Holds our JSON data globally once parsed
const BACKEND_URL = 'http://localhost:3000';

// Check if the user just returned from a successful Google OAuth login
window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === 'success') {
        textarea.innerHTML = '✅ Google Calendar successfully authorized! You can now scan and export your timetable.';
    } else if (urlParams.get('auth') === 'error') {
        textarea.innerHTML = '❌ Calendar authorization failed. Please try again.';
    }
}



// display image on upload
fileSelector.onchange = () => {
    const file = fileSelector.files[0]
    if (file) {
        var imgUrl = window.URL.createObjectURL(file)
        img.src = imgUrl;
    }
}


// Kick off OAuth authentication when clicked
authButton.onclick = async () => {
    try {
        textarea.innerHTML = 'Connecting to Google Authentication...';
        const response = await fetch(`${BACKEND_URL}/api/auth/google`);
        const data = await response.json();
        
        // Redirect the user's entire browser tab straight to Google's login portal
        window.location.href = data.url;
    } catch (error) {
        console.error(error);
        textarea.innerHTML = 'Error fetching Google Authentication link.';
    }
};



// text recognition
start.onclick = async () => {
    const file = fileSelector.files[0]
    if (!file) {
        textarea.innerHTML = 'Please select an image'
        return
    }

    textarea.innerHTML = 'Processing...'
    exportButton.style.display = 'none';

    const formData = new FormData()
    formData.append('timetable', file)

    try {
        const response = await fetch('http://localhost:3000/api/extract-schedule', {
         method: 'POST',
         body: formData
    })
    
    if (!response.ok) {
        throw new Error(data.error || 'Server error')
    }

    const data = await response.json();

    globalExtractedSchedule = data.schedule;

    textarea.innerHTML = JSON.stringify(data.schedule, null, 2)

    } catch (error) {
        console.error(error)
        textarea.innerHTML = `Error: ${error.message}`
    }
}

// Inject parsed data into Google Calendar
exportButton.onclick = async () => {
    if (!globalExtractedSchedule) {
        textarea.innerHTML = 'No parsed schedule found to export.';
        return;
    }

    textarea.innerHTML = 'Injecting classes into your Google Calendar...';

    try {
        const response = await fetch(`${BACKEND_URL}/api/create-events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ schedule: globalExtractedSchedule })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to inject calendar events.');
        }

        textarea.innerHTML = `🎉 Success! ${data.message}`;
        exportButton.style.display = 'none'; // Hide it when finished successfully

    } catch (error) {
        console.error(error);
        textarea.innerHTML = `Calendar Error: ${error.message}`;
    }
};