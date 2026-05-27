function updateRatioDisplay() {
    const ratio = parseFloat(document.getElementById('ratio-slider').value).toFixed(3);
    document.getElementById('ratio-display').textContent = ratio;
}

function drawSquares() {
    const canvas = document.getElementById('spiralCanvas');
    const ctx = canvas.getContext('2d');
    const iterations = 30;  // Hardcoded to 10 iterations
    const ratio = parseFloat(document.getElementById('ratio-slider').value);
    // Dynamically set canvas size and resolution
    const width = canvas.clientWidth;
    const height = canvas.clientWidth*0.66;  // Fixed height

    // Set canvas resolution to match display size
    canvas.width = width;
    canvas.height = height;

    let size = canvas.height*4/5;  // Initial square size
    let x = canvas.height/10;
    let y = canvas.height*9/10;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'black';
    ctx.font = "20px 'EB Garamond', serif";  // Set font for labels
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'black';

    for (let i = 0; i < iterations; i++) {
        // Draw the square
        ;
        
        // Update the coordinates and size for the next square
        switch (i % 4) {
            case 0: 
                ctx.strokeStyle = 'black';
                ctx.strokeRect(x, y, size, -size);
                ctx.strokeStyle = 'red';
                ctx.beginPath();
                ctx.arc(x+size, y, size, Math.PI, Math.PI*3/2 ); // Quarter circle from 0 to 90 degrees
                ctx.stroke();
                if (i === 0) ctx.fillText("A", x + size / 2, y - size / 2);  // Label the first square "A"
                x += size;
                y -= size;
                break;
            case 1: 
                ctx.strokeStyle = 'black';
                ctx.strokeRect(x, y, size, size);
                ctx.strokeStyle = 'red';
                ctx.beginPath();
                ctx.arc(x, y+size, size, Math.PI*3/2,Math.PI*2 ); // Quarter circle from 0 to 90 degrees
                ctx.stroke()
                if (i === 1) ctx.fillText("B", x + size / 2, y + size / 2);  // Label the second square "B"
                x += size;
                y += size;
                break;
            case 2: 
                ctx.strokeStyle = 'black';
                ctx.strokeRect(x, y, -size, size);
                ctx.strokeStyle = 'red';
                ctx.beginPath();
                ctx.arc(x-size, y, size, 0,Math.PI/2 ); // Quarter circle from 0 to 90 degrees
                ctx.stroke()
                x -= size;
                y += size;
                break;
            case 3: 
                ctx.strokeStyle = 'black';
                ctx.strokeRect(x, y, -size, -size);
                ctx.strokeStyle = 'red';
                ctx.beginPath();
                ctx.arc(x, y-size, size, Math.PI/2,Math.PI ); // Quarter circle from 0 to 90 degrees
                ctx.stroke()
                x -= size;
                y -= size;
                break;
        }
        size /= ratio;  // Scale the square size by the ratio
        
    }
}

// Initial draw
drawSquares();
document.addEventListener('DOMContentLoaded', function () {
// Get all elements with the class 'ratio-link'
const ratioLinks = document.querySelectorAll('.ratio-link');

// Add a click event listener to each link
ratioLinks.forEach(link => {
    link.addEventListener('click', function () {
        // Get the ratio value from the data attribute
        const newRatio = this.getAttribute('data-ratio');
        
        // Update the slider value
        const slider = document.getElementById('ratio-slider');
        slider.value = newRatio;
        
        // Update the display and redraw the canvas
        updateRatioDisplay();
        drawSquares();
    });
});
});
