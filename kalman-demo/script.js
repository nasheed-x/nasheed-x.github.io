// Get canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Canvas dimensions
canvas.width = canvas.offsetWidth;
canvas.height = canvas.offsetHeight;

// Variables to store previous trajectories and paths
let storedFlights = [];
let actualPath = [];
let estimatedPath = [];
let covarianceEllipses = [];
let dataPoints = [];

// Colors for different trajectories (more distinct and vibrant)
const trajectoryColors = [
  '#e63946', // Red
  '#1d3557', // Dark Blue
  '#2a9d8f', // Teal
  '#ff006e', // Pink
  '#f4a261', // Orange
  '#264653', // Deep Green
  '#8ac926', // Bright Green
  '#ffbe0b', // Yellow
  '#6a0572', // Purple
  '#118ab2'  // Cyan
];
let colorIndex = 0;

// Viewport variables for scaling
let viewMinX = 0;
let viewMaxX = canvas.width;
let viewMinY = 0;
let viewMaxY = canvas.height;

// Function to resize the canvas dynamically
function resizeCanvas() {
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
}
window.addEventListener('resize', resizeCanvas);

// Get control elements
const launchButton = document.getElementById('launchButton');
const angleInput = document.getElementById('launchAngle');
const angleOutput = document.getElementById('launchAngleValue');
const speedInput = document.getElementById('initialSpeed');
const speedOutput = document.getElementById('initialSpeedValue');
const processNoiseSlider = document.getElementById('processNoise');
const processNoiseOutput = document.getElementById('processNoiseValue');
const measurementNoiseSlider = document.getElementById('measurementNoise');
const measurementNoiseOutput = document.getElementById('measurementNoiseValue');
const windToggle = document.getElementById('windToggle');
const keepTrajectoriesToggle = document.getElementById('keepTrajectories');

// Data display elements
const flightTimeDisplay = document.getElementById('flightTime');
const altitudeDisplay = document.getElementById('altitude');
const velocityDisplay = document.getElementById('velocity');
const accelerationDisplay = document.getElementById('acceleration');

// Chart element
const dataCtx = document.getElementById('dataChart').getContext('2d');

// Function to get chart options
function getChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#1d1d1f',
          font: {
            family: 'Helvetica Neue',
          },
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#1d1d1f' },
        title: {
          display: true,
          text: 'Time (s)',
          color: '#1d1d1f',
          font: {
            family: 'Helvetica Neue',
          },
        },
        grid: {
          color: '#d2d2d7',
        },
      },
      y: {
        ticks: { color: '#1d1d1f' },
        title: {
          display: true,
          text: 'Values',
          color: '#1d1d1f',
          font: {
            family: 'Helvetica Neue',
          },
        },
        grid: {
          color: '#d2d2d7',
        },
      },
    },
  };
}

// Initialize Chart
const dataChart = new Chart(dataCtx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: 'Prediction Error (px)',
        data: [],
        borderColor: '#ff3b30',
        backgroundColor: 'rgba(255, 59, 48, 0.1)',
        fill: true,
        tension: 0.1,
        yAxisID: 'y',
      },
      {
        label: 'Altitude (px)',
        data: [],
        borderColor: '#0071e3',
        backgroundColor: 'rgba(0, 113, 227, 0.1)',
        fill: true,
        tension: 0.1,
        yAxisID: 'y',
      },
      {
        label: 'Velocity (px/s)',
        data: [],
        borderColor: '#34c759',
        backgroundColor: 'rgba(52, 199, 89, 0.1)',
        fill: true,
        tension: 0.1,
        yAxisID: 'y',
      },
    ],
  },
  options: getChartOptions(),
});

// Event listener for the launch button
launchButton.addEventListener('click', launchRocket);

// Update output values when sliders change
angleInput.addEventListener('input', () => {
  angleOutput.textContent = angleInput.value;
});
speedInput.addEventListener('input', () => {
  speedOutput.textContent = speedInput.value;
});
processNoiseSlider.addEventListener('input', () => {
  processNoiseOutput.textContent = parseFloat(processNoiseSlider.value).toFixed(2);
});
measurementNoiseSlider.addEventListener('input', () => {
  measurementNoiseOutput.textContent = parseFloat(measurementNoiseSlider.value).toFixed(1);
});

// Utility functions for random noise
function randn_bm() {
  let u = 0,
    v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Function to transform points to canvas coordinates
function transformPoint(point) {
  const scaleX = canvas.width / (viewMaxX - viewMinX);
  const scaleY = canvas.height / (viewMaxY - viewMinY);
  return {
    x: (point.x - viewMinX) * scaleX,
    y: canvas.height - (point.y - viewMinY) * scaleY,
  };
}

// Rocket launch function
function launchRocket() {
  // Get initial parameters
  let angle = parseFloat(angleInput.value);
  let speed = parseFloat(speedInput.value);
  let processNoise = parseFloat(processNoiseSlider.value);
  let measurementNoise = parseFloat(measurementNoiseSlider.value);
  let windEnabled = windToggle.checked;
  let keepTrajectories = keepTrajectoriesToggle.checked;

  // Clear current flight data
  actualPath = [];
  estimatedPath = [];
  covarianceEllipses = [];
  dataPoints = [];

  if (!keepTrajectories) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    storedFlights = [];
    colorIndex = 0; // Reset color index
  }

  // Reset viewport
  viewMinX = 0;
  viewMaxX = canvas.width;
  viewMinY = 0;
  viewMaxY = canvas.height;

  let dt = 0.1; // time step
  let time = 0;

  // Initial positions and velocities
  let pos = { x: 0, y: 0 };
  let vel = {
    x: speed * Math.cos((angle * Math.PI) / 180),
    y: speed * Math.sin((angle * Math.PI) / 180),
  };

  // Wind effect
  let windAcceleration = windEnabled ? 2 : 0; // Constant acceleration due to wind

  // Kalman filter variables
  let x_est = { x: pos.x, y: pos.y }; // Estimated state
  let P = [
    [1, 0],
    [0, 1],
  ]; // Error covariance matrix
  const A = [
    [1, 0],
    [0, 1],
  ]; // State transition matrix
  const H = [
    [1, 0],
    [0, 1],
  ]; // Observation matrix
  const Q = [
    [processNoise, 0],
    [0, processNoise],
  ]; // Process noise covariance
  const R = [
    [measurementNoise, 0],
    [0, measurementNoise],
  ]; // Measurement noise covariance

  function update() {
    time += dt;

    // Update actual position
    vel.y -= 9.81 * dt; // Gravity (positive y is upwards)
    vel.x += windAcceleration * dt; // Wind effect on x-velocity
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;

    // Update viewport to include current position
    if (pos.x < viewMinX) viewMinX = pos.x;
    if (pos.x > viewMaxX) viewMaxX = pos.x;
    if (pos.y < viewMinY) viewMinY = pos.y;
    if (pos.y > viewMaxY) viewMaxY = pos.y;

    // Stop the simulation if the rocket reaches the ground
    if (pos.y <= 0) {
      pos.y = 0; // Clamp to ground level
      actualPath.push({ x: pos.x, y: pos.y });
      drawScene();
      updateChart(dataPoints);
      storeFlightData();
      return; // Exit the update loop
    }

    actualPath.push({ x: pos.x, y: pos.y });

    // Simulate measurement with noise
    const z = {
      x: pos.x + randn_bm() * measurementNoise,
      y: pos.y + randn_bm() * measurementNoise,
    };

    // Prediction step
    const x_pred = x_est;
    const P_pred = addMatrices(P, Q);

    // Update step
    const y_meas = subtractVectors(z, multiplyMatrixVector(H, x_pred));
    const S = addMatrices(
      multiplyMatrices(H, multiplyMatrices(P_pred, transposeMatrix(H))),
      R
    );
    const K = multiplyMatrices(
      P_pred,
      multiplyMatrices(transposeMatrix(H), invertMatrix(S))
    );
    x_est = addVectors(x_pred, multiplyMatrixVector(K, y_meas));
    P = multiplyMatrices(
      subtractMatrices(
        [
          [1, 0],
          [0, 1],
        ],
        multiplyMatrices(K, H)
      ),
      P_pred
    );

    estimatedPath.push({ x: x_est.x, y: x_est.y });
    covarianceEllipses.push({ P: P, x: x_est.x, y: x_est.y });

    // Calculate prediction error
    const error = Math.hypot(pos.x - x_est.x, pos.y - x_est.y);

    // Record data
    const altitude = pos.y;
    const velocity = Math.hypot(vel.x, vel.y);
    const acceleration = 9.81; // Gravity acceleration

    dataPoints.push({
      time: time,
      error: error,
      altitude: altitude,
      velocity: velocity,
    });

    // Update data displays
    flightTimeDisplay.textContent = time.toFixed(2);
    altitudeDisplay.textContent = altitude.toFixed(2);
    velocityDisplay.textContent = velocity.toFixed(2);
    accelerationDisplay.textContent = acceleration.toFixed(2);

    // Draw the scene
    drawScene();

    // Update the chart
    updateChart(dataPoints);

    // Request the next frame
    requestAnimationFrame(update);
  }

  update();

  function storeFlightData() {
    const color = trajectoryColors[colorIndex % trajectoryColors.length];
    colorIndex++;
    storedFlights.push({
      actualPath: actualPath.slice(),
      estimatedPath: estimatedPath.slice(),
      covarianceEllipses: covarianceEllipses.slice(),
      color: color,
    });
  }
}

// Clear chart data
function clearChart() {
  dataChart.data.labels = [];
  dataChart.data.datasets.forEach((dataset) => {
    dataset.data = [];
  });
  dataChart.update();

  // Reset data displays
  flightTimeDisplay.textContent = '0.00';
  altitudeDisplay.textContent = '0.00';
  velocityDisplay.textContent = '0.00';
  accelerationDisplay.textContent = '0.00';
}

// Drawing function with dynamic scaling
function drawScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw stored flights if keeping trajectories
  if (keepTrajectoriesToggle.checked) {
    storedFlights.forEach((flight) => {
      drawFlight(flight.actualPath, flight.estimatedPath, flight.covarianceEllipses, flight.color, false);
    });
  }

  // Draw current flight
  drawFlight(actualPath, estimatedPath, covarianceEllipses, trajectoryColors[colorIndex % trajectoryColors.length], true);
}

function drawFlight(actualPath, estimatedPath, covarianceEllipses, color, currentFlight) {
  // Draw actual path
  ctx.strokeStyle = color;
  ctx.lineWidth = currentFlight ? 2 : 1;
  ctx.beginPath();
  actualPath.forEach((point, index) => {
    const transformedPoint = transformPoint(point);
    if (index === 0) ctx.moveTo(transformedPoint.x, transformedPoint.y);
    else ctx.lineTo(transformedPoint.x, transformedPoint.y);
  });
  ctx.stroke();

  // Draw estimated path
  ctx.strokeStyle = currentFlight ? '#34c759' : 'rgba(52, 199, 89, 0.5)';
  ctx.lineWidth = currentFlight ? 2 : 1;
  ctx.beginPath();
  estimatedPath.forEach((point, index) => {
    const transformedPoint = transformPoint(point);
    if (index === 0) ctx.moveTo(transformedPoint.x, transformedPoint.y);
    else ctx.lineTo(transformedPoint.x, transformedPoint.y);
  });
  ctx.stroke();

  // Draw covariance ellipses
  covarianceEllipses.forEach((covariance) => {
    const transformedPoint = transformPoint({ x: covariance.x, y: covariance.y });
    drawEllipse(ctx, transformedPoint.x, transformedPoint.y, covariance.P);
  });
}

// Function to draw covariance ellipse
function drawEllipse(ctx, x, y, P) {
  ctx.save();
  ctx.beginPath();

  // Eigenvalues and eigenvectors for the covariance matrix
  const eigen = numeric.eig(P);
  const eigenvalues = eigen.lambda.x;
  const eigenvectors = eigen.E.x;

  const angle = Math.atan2(eigenvectors[1][0], eigenvectors[0][0]);
  const scaleX = canvas.width / (viewMaxX - viewMinX);
  const scaleY = canvas.height / (viewMaxY - viewMinY);
  const width = Math.sqrt(eigenvalues[0]) * scaleX * 2;
  const height = Math.sqrt(eigenvalues[1]) * scaleY * 2;

  ctx.translate(x, y);
  ctx.rotate(-angle);
  ctx.strokeStyle = 'rgba(255, 149, 0, 0.5)';
  ctx.ellipse(0, 0, width, height, 0, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

// Update the chart
function updateChart(dataPoints) {
  const lastPoint = dataPoints[dataPoints.length - 1];
  dataChart.data.labels.push(lastPoint.time.toFixed(2));
  dataChart.data.datasets[0].data.push(lastPoint.error.toFixed(2)); // Prediction Error
  dataChart.data.datasets[1].data.push(lastPoint.altitude.toFixed(2)); // Altitude
  dataChart.data.datasets[2].data.push(lastPoint.velocity.toFixed(2)); // Velocity
  dataChart.update();
}

// Vector and Matrix operations
function addVectors(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

function subtractVectors(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function multiplyMatrixVector(m, v) {
  return {
    x: m[0][0] * v.x + m[0][1] * v.y,
    y: m[1][0] * v.x + m[1][1] * v.y,
  };
}

function addMatrices(a, b) {
  return [
    [a[0][0] + b[0][0], a[0][1] + b[0][1]],
    [a[1][0] + b[1][0], a[1][1] + b[1][1]],
  ];
}

function subtractMatrices(a, b) {
  return [
    [a[0][0] - b[0][0], a[0][1] - b[0][1]],
    [a[1][0] - b[1][0], a[1][1] - b[1][1]],
  ];
}

function multiplyMatrices(a, b) {
  const result = [
    [
      a[0][0] * b[0][0] + a[0][1] * b[1][0],
      a[0][0] * b[0][1] + a[0][1] * b[1][1],
    ],
    [
      a[1][0] * b[0][0] + a[1][1] * b[1][0],
      a[1][0] * b[0][1] + a[1][1] * b[1][1],
    ],
  ];
  return result;
}

function transposeMatrix(m) {
  return [
    [m[0][0], m[1][0]],
    [m[0][1], m[1][1]],
  ];
}

function invertMatrix(m) {
  const det = m[0][0] * m[1][1] - m[0][1] * m[1][0];
  if (det === 0) {
    throw new Error('Matrix is not invertible');
  }
  const invDet = 1 / det;
  return [
    [m[1][1] * invDet, -m[0][1] * invDet],
    [-m[1][0] * invDet, m[0][0] * invDet],
  ];
}

// Function to clear all trajectories and reset the chart
function clearTrajectories() {
  // Clear stored flight paths and reset variables
  storedFlights = [];
  actualPath = [];
  estimatedPath = [];
  covarianceEllipses = [];
  dataPoints = [];
  colorIndex = 0; // Reset color index

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Clear chart data
  dataChart.data.labels = [];
  dataChart.data.datasets.forEach((dataset) => (dataset.data = []));
  dataChart.update();

  // Reset data displays
  flightTimeDisplay.textContent = '0.00';
  altitudeDisplay.textContent = '0.00';
  velocityDisplay.textContent = '0.00';
  accelerationDisplay.textContent = '0.00';
}

const clearButton = document.getElementById('clearButton');
clearButton.addEventListener('click', clearTrajectories);
