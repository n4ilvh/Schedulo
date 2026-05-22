const fileSelector = document.querySelector('input')
const start = document.querySelector('button')
const img = document.querySelector('img')
const textarea = document.querySelector('textarea')

// display image on upload
fileSelector.onchange = () => {
    const file = fileSelector.files[0]
    if (file) {
        var imgUrl = window.URL.createObjectURL(file)
        img.src = imgUrl;
    }
}

// text recognition
start.onclick = async () => {
    const file = fileSelector.files[0]
    if (!file) {
        textarea.innerHTML = 'Please select an image'
        return
    }

    textarea.innerHTML = 'Processing...'

    const formData = new FormData()
    formData.append('timetable', file)

    try {
        const response = await fetch('http://localhost:3000/api/extract-schedule', {
         method: 'POST',
         body: formData
    })

    const data = await response.json()
    
    if (!response.ok) {
        throw new Error(data.error || 'Server error')
    }

    textarea.innerHTML = JSON.stringify(data.schedule, null, 2)

    } catch (error) {
        console.error(error)
        textarea.innerHTML = `Error: ${error.message}`
    }
}