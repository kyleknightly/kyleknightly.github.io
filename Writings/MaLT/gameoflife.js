const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gridSize = 20; // Size of each cell in pixels
const rows = canvas.height / gridSize;
const cols = canvas.width / gridSize;

let grid = createEmptyGrid();
let interval;
let isPlaying = false;

// Initialize the grid with a glider
function createEmptyGrid() {
    const newGrid = Array.from({ length: rows }, () => Array(cols).fill(0));
    // Glider pattern
    newGrid[1][2] = 1;
    newGrid[2][3] = 1;
    newGrid[3][1] = 1;
    newGrid[3][2] = 1;
    newGrid[3][3] = 1;

    newGrid[16][16] = 1;
    newGrid[17][17] = 1;
    newGrid[15][17] = 1;
    newGrid[17][18] = 1;
    newGrid[15][18] = 1;
    newGrid[16][19] = 1;
    return newGrid;
}

function drawGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            ctx.beginPath();
            ctx.rect(col * gridSize, row * gridSize, gridSize, gridSize);
            ctx.fillStyle = grid[row][col] ? 'black' : 'white';
            ctx.fill();
            ctx.strokeStyle = '#cccccc'; // Light gray grid lines
            ctx.stroke();
        }
    }
}

function updateGrid() {
    const newGrid = createEmptyGrid();
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const neighbors = countNeighbors(row, col);
            if (grid[row][col] === 1) {
                newGrid[row][col] = neighbors === 2 || neighbors === 3 ? 1 : 0;
            } else {
                newGrid[row][col] = neighbors === 3 ? 1 : 0;
            }
        }
    }
    grid = newGrid;
    drawGrid();
}

function countNeighbors(row, col) {
    let count = 0;
    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            if (i === 0 && j === 0) continue;
            const newRow = row + i;
            const newCol = col + j;
            if (newRow >= 0 && newRow < rows && newCol >= 0 && newCol < cols) {
                count += grid[newRow][newCol];
            }
        }
    }
    return count;
}

function togglePlay() {
    const button = document.getElementById('playPauseButton');
    if (isPlaying) {
        clearInterval(interval);
        button.textContent = "Play";
    } else {
        interval = setInterval(updateGrid, 100);
        button.textContent = "Pause";
    }
    isPlaying = !isPlaying;
}

function clearBoard() {
    grid = createEmptyGrid();
    drawGrid();
    if (isPlaying) {
        togglePlay(); // Automatically pause when clearing the board
    }
}

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const col = Math.floor(x / gridSize);
    const row = Math.floor(y / gridSize);
    if (row >= 0 && row < rows && col >= 0 && col < cols) {
        grid[row][col] = 1 - grid[row][col]; // Toggle the cell
        drawGrid();
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (e.buttons === 1) { // Left mouse button is held down
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const col = Math.floor(x / gridSize);
        const row = Math.floor(y / gridSize);
        if (row >= 0 && row < rows && col >= 0 && col < cols && grid[row][col] === 0) {
            grid[row][col] = 1;
            drawGrid();
        }
    }
});

drawGrid(); // Initial draw