// Function to generate logistic map values
function logisticMap(r, x0, iterations) {
    let x = x0;
    let values = [x];
    for (let i = 1; i < iterations; i++) {
        x = r * x * (1 - x);
        values.push(x);
    }
    return values;
}

// Initial parameters
let r = 1.0;
let x0 = 0.25; // Initial value of x
let iterations = 30;

// Function to update the graph
function updateGraph() {
    r = parseFloat(document.getElementById("r-slider").value);
    document.getElementById("r-value").textContent = `r = ${r.toFixed(2)}`;

    let yValues = logisticMap(r, x0, iterations);
    let xValues = Array.from({length: iterations}, (_, i) => i + 1);

    let trace = {
        x: xValues,
        y: yValues,
        mode: 'lines+markers',
        type: 'scatter'
    };

    let layout = {
        xaxis: {title: {
                text: 'n'  // LaTeX expression for the axis title
            }},
        yaxis: {title: 'x',
                range: [0, 1]},
        font: {
            family: "'EB Garamond', serif", // Apply this font family to all text elements
            size: 14,
            color: '#333333'},
        margin: { t: 50 }
    };
    // Remove the toolbar
    let config = { displayModeBar: false,
        staticPlot: true
    };

    Plotly.newPlot('logistic-map', [trace], layout, config);
}

// Initial plot
updateGraph();
// Add event listeners to clickable terms
document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.r-link').forEach(function(element) {
        element.addEventListener('click', function() {
            const rValue = parseFloat(this.getAttribute('data-r'));
            document.getElementById('r-slider').value = rValue; // Change slider value
            updateGraph(); // Update the graph
        });
    });
});