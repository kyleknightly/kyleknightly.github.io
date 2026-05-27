const canvas = document.getElementById("rd-canvas");
const ctx = canvas.getContext("2d");

let width, height;
let cols, rows;

const scale = 2;
let A, B, nextA, nextB;
let image;
let imageData;
const bufferCanvas = document.createElement("canvas");
const bufferCtx = bufferCanvas.getContext("2d");

const dA = 1.0;
const dB = 0.5;

// STANDARD VALUES, OLD VERSION
// const feedCenter = 0.04;
// const killCenter = 0.06;

// These parameters control the Gray-Scott look.
// They now oscillate around center values.
const feedCenter = 0.04;
const killCenter = 0.06;

const feedAmplitude = 0.01;
const killAmplitude = 0.001;

// Different rates so they drift in and out of phase.
const feedRate = 0.0007;
const killRate = 0.0011;

let mouseX = 0;
let mouseY = 0;
let mouseInside = false;

function randomInRange(min, max) {
    return min + Math.random() * (max - min);
}

function index(x, y) {
    return x + y * cols;
}

function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;

    cols = Math.floor(width / scale);
    rows = Math.floor(height / scale);

    const size = cols * rows;

    A = new Float32Array(size);
    B = new Float32Array(size);
    nextA = new Float32Array(size);
    nextB = new Float32Array(size);
    image = ctx.createImageData(cols, rows);
    imageData = image.data;
    bufferCanvas.width = cols;
    bufferCanvas.height = rows;

    for (let i = 0; i < size; i++) {
        A[i] = 1;
        B[i] = 0;
    }

    seedSimulation();
}

function laplace(arr, x, y) {
    let sum = 0;

    sum += arr[index(x, y)] * -1;
    sum += arr[index(x - 1, y)] * 0.2;
    sum += arr[index(x + 1, y)] * 0.2;
    sum += arr[index(x, y - 1)] * 0.2;
    sum += arr[index(x, y + 1)] * 0.2;
    sum += arr[index(x - 1, y - 1)] * 0.05;
    sum += arr[index(x + 1, y - 1)] * 0.05;
    sum += arr[index(x - 1, y + 1)] * 0.05;
    sum += arr[index(x + 1, y + 1)] * 0.05;

    return sum;
}

function addChemicalB(px, py) {
    const cx = Math.floor(px / scale);
    const cy = Math.floor(py / scale);
    const radius = 2;

    for (let y = -radius; y <= radius; y++) {
        for (let x = -radius; x <= radius; x++) {
            const dx = cx + x;
            const dy = cy + y;

            if (
                dx > 1 &&
                dx < cols - 1 &&
                dy > 1 &&
                dy < rows - 1 &&
                x * x + y * y <= radius * radius
            ) {
                B[index(dx, dy)] = 1;
            }
        }
    }
}

function seedSimulation() {
    const centerX = width / 2;
    const centerY = height / 2;
    const seedCount = Math.max(10, Math.floor((cols * rows) / 18000));

    addChemicalB(centerX, centerY);

    for (let i = 0; i < seedCount; i++) {
        addChemicalB(
            Math.random() * width,
            Math.random() * height
        );
    }
}

function updateSimulation() {
    const time = performance.now();

    const feed = feedCenter + feedAmplitude * Math.sin(time * feedRate);
    const kill = killCenter + killAmplitude * Math.sin(time * killRate);

    for (let y = 1; y < rows - 1; y++) {
        for (let x = 1; x < cols - 1; x++) {
            const i = index(x, y);

            const a = A[i];
            const b = B[i];

            const reaction = a * b * b;

            nextA[i] =
                a +
                dA * laplace(A, x, y) -
                reaction +
                feed * (1 - a);

            nextB[i] =
                b +
                dB * laplace(B, x, y) +
                reaction -
                (kill + feed) * b;

            nextA[i] = Math.max(0, Math.min(1, nextA[i]));
            nextB[i] = Math.max(0, Math.min(1, nextB[i]));
        }
    }

    [A, nextA] = [nextA, A];
    [B, nextB] = [nextB, B];

    if (mouseInside) {
        addChemicalB(mouseX, mouseY);
    }
}

function drawSimulation() {
    for (let i = 0; i < cols * rows; i++) {
        const b = B[i];
        const red = Math.floor(255 - b * 223);
        const green = Math.floor(255 - b * 159);
        const blue = Math.floor(255 - b * 191);

        imageData[i * 4 + 0] = red;
        imageData[i * 4 + 1] = green;
        imageData[i * 4 + 2] = blue;
        imageData[i * 4 + 3] = 255;
    }

    bufferCtx.putImageData(image, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bufferCanvas, 0, 0, width, height);
}

function animate() {
    for (let i = 0; i < 6; i++) {
        updateSimulation();
    }

    drawSimulation();
    requestAnimationFrame(animate);
}

window.addEventListener("resize", resize);

window.addEventListener("mousemove", event => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    mouseInside = true;
});

window.addEventListener("mouseleave", () => {
    mouseInside = false;
});

resize();
animate();
