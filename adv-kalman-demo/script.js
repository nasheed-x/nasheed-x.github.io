// script.js

// Get canvas and context
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Canvas dimensions
function resizeCanvas() {
  canvas.width = canvas.parentElement.clientWidth - 20; // Subtract padding
  canvas.height = canvas.parentElement.clientHeight - 20;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Viewport variables for scaling
let viewMinX = 0;
let viewMaxX = canvas.width;
let viewMinY = 0;
let viewMaxY = canvas.height;

// Get control elements
const launchButton = document.getElementById('launchButton');
const clearButton = document.getElementById('clearButton');
const angleInput = document.getElementById('launchAngle');
const angleOutput = document.getElementById('launchAngleValue');
const speedInput = document.getElementById('initialSpeed');
const speedOutput = document.getElementById('initialSpeedValue');
const massInput = document.getElementById('rocketMass');
const massOutput = document.getElementById('rocketMassValue');
const dragInput = document.getElementById('dragCoefficient');
const dragOutput = document.getElementById('dragCoefficientValue');
const areaInput = document.getElementById('crossSectionalArea');
const areaOutput = document.getElementById('crossSectionalAreaValue');
const airDensityInput = document.getElementById('airDensity');
const airDensityOutput = document.getElementById('airDensityValue');
const thrustInput = document.getElementById('thrust');
const thrustOutput = document.getElementById('thrustValue');
const burnDurationInput = document.getElementById('burnDuration');
const burnDurationOutput = document.getElementById('burnDurationValue');
const gravitySelect = document.getElementById('gravitySelect');
const windToggle = document.getElementById('windToggle');
const modelSelect = document.getElementById('modelSelect');
const processNoiseSlider = document.getElementById('processNoise');
const processNoiseOutput = document.getElementById('processNoiseValue');
const measurementNoiseSlider = document.getElementById('measurementNoise');
const measurementNoiseOutput = document.getElementById('measurementNoiseValue');
const keepTrajectoriesToggle = document.getElementById('keepTrajectories');

// Data display elements
const flightTimeDisplay = document.getElementById('flightTime');
const altitudeDisplay = document.getElementById('altitude');
const velocityDisplay = document.getElementById('velocity');
const accelerationDisplay = document.getElementById('acceleration');

// Chart elements
const altitudeCtx = document.getElementById('altitudeChart').getContext('2d');
const velocityCtx = document.getElementById('velocityChart').getContext('2d');
const errorCtx = document.getElementById('errorChart').getContext('2d');

// Initialize Charts
const altitudeChart = new Chart(altitudeCtx, {
  type: 'line',
  data: {
    datasets: [],
  },
  options: getChartOptions('Altitude (m)'),
});

const velocityChart = new Chart(velocityCtx, {
  type: 'line',
  data: {
    datasets: [],
  },
  options: getChartOptions('Velocity (m/s)'),
});

const errorChart = new Chart(errorCtx, {
  type: 'line',
  data: {
    datasets: [],
  },
  options: getChartOptions('Prediction Error (m)'),
});

// Flight storage for comparison
let flightCounter = 0;
let storedFlights = [];

// Event listeners for controls
launchButton.addEventListener('click', launchRocket);
clearButton.addEventListener('click', clearAll);

angleInput.addEventListener('input', () => {
  angleOutput.textContent = angleInput.value;
});
speedInput.addEventListener('input', () => {
  speedOutput.textContent = speedInput.value;
});
massInput.addEventListener('input', () => {
  massOutput.textContent = massInput.value;
});
dragInput.addEventListener('input', () => {
  dragOutput.textContent = parseFloat(dragInput.value).toFixed(1);
});
areaInput.addEventListener('input', () => {
  areaOutput.textContent = parseFloat(areaInput.value).toFixed(1);
});
airDensityInput.addEventListener('input', () => {
  airDensityOutput.textContent = parseFloat(airDensityInput.value).toFixed(1);
});
thrustInput.addEventListener('input', () => {
  thrustOutput.textContent = thrustInput.value;
});
burnDurationInput.addEventListener('input', () => {
  burnDurationOutput.textContent = burnDurationInput.value;
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

// Rocket launch function
function launchRocket() {
  // Get initial parameters
  let angle = parseFloat(angleInput.value);
  let speed = parseFloat(speedInput.value);
  let mass = parseFloat(massInput.value);
  let dragCoefficient = parseFloat(dragInput.value);
  let area = parseFloat(areaInput.value);
  let airDensity = parseFloat(airDensityInput.value);
  let thrust = parseFloat(thrustInput.value);
  let burnDuration = parseFloat(burnDurationInput.value);
  let gravity = parseFloat(gravitySelect.value);
  let windEnabled = windToggle.checked;
  let motionModel = modelSelect.value;
  let processNoise = parseFloat(processNoiseSlider.value);
  let measurementNoise = parseFloat(measurementNoiseSlider.value);
  let keepTrajectories = keepTrajectoriesToggle.checked;

  // Reset viewport if not keeping trajectories
  if (!keepTrajectories) {
    viewMinX = 0;
    viewMaxX = canvas.width;
    viewMinY = 0;
    viewMaxY = canvas.height;
    storedFlights = [];
    clearCharts();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  let dt = 0.1; // time step
  let time = 0;

  // Initial positions and velocities
  let pos = { x: 0, y: 0 };
  let vel = {
    x: speed * Math.cos((angle * Math.PI) / 180),
    y: speed * Math.sin((angle * Math.PI) / 180),
  };

  // Wind effect variables
  let windAcceleration = windEnabled ? 0 : 0;
  let windChangeInterval = 1; // seconds
  let windTimer = 0;

  // Kalman filter variables
  let stateSize = motionModel === 'constantAcceleration' ? 4 : 2;
  let x_est = new Array(stateSize).fill(0); // Estimated state vector
  let P = math.identity(stateSize)._data; // Error covariance matrix
  let A, H, Q, R;

  // Set up matrices based on motion model
  if (motionModel === 'constantAcceleration') {
    A = [
      [1, 0, dt, 0],
      [0, 1, 0, dt],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
    H = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
    ];
    Q = math.multiply(math.identity(stateSize)._data, processNoise);
  } else {
    A = [
      [1, 0],
      [0, 1],
    ];
    H = [
      [1, 0],
      [0, 1],
    ];
    Q = math.multiply(math.identity(stateSize)._data, processNoise);
  }
  R = math.multiply(math.identity(2)._data, measurementNoise);

  const actualPath = [];
  const estimatedPath = [];
  const dataPoints = [];

  // Flight data storage for comparison
  const flightData = {
    actualPath: [],
    estimatedPath: [],
    dataPoints: [],
    color: getRandomColor(),
    flightNumber: ++flightCounter,
  };

  function update() {
    time += dt;

    // Update wind effect
    windTimer += dt;
    if (windEnabled && windTimer >= windChangeInterval) {
      windAcceleration = (Math.random() - 0.5) * 4; // Random wind acceleration between -2 and 2 m/s²
      windTimer = 0;
    }

    // Thrust phase
    let thrustForce = time <= burnDuration ? thrust : 0;

    // Calculate forces
    let gravityForce = -mass * gravity;
    let dragForceX = -0.5 * airDensity * vel.x * vel.x * dragCoefficient * area * Math.sign(vel.x);
    let dragForceY = -0.5 * airDensity * vel.y * vel.y * dragCoefficient * area * Math.sign(vel.y);
    let windForce = mass * windAcceleration;

    // Net forces
    let netForceX = thrustForce * Math.cos((angle * Math.PI) / 180) + dragForceX + windForce;
    let netForceY = thrustForce * Math.sin((angle * Math.PI) / 180) + dragForceY + gravityForce;

    // Accelerations
    let accelX = netForceX / mass;
    let accelY = netForceY / mass;

    // Update velocities
    vel.x += accelX * dt;
    vel.y += accelY * dt;

    // Update positions
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;

    // Update viewport to include current position
    if (pos.x < viewMinX) viewMinX = pos.x;
    if (pos.x > viewMaxX) viewMaxX = pos.x;
    if (pos.y < viewMinY) viewMinY = pos.y;
    if (pos.y > viewMaxY) viewMaxY = pos.y;

    // Stop the simulation if the rocket reaches the ground
    if (pos.y <= 0 && vel.y <= 0) {
      pos.y = 0; // Clamp to ground level
      flightData.actualPath.push({ x: pos.x, y: pos.y });
      drawScene();
      updateCharts();
      storeFlightData();
      return; // Exit the update loop
    }

    flightData.actualPath.push({ x: pos.x, y: pos.y });

    // Simulate measurement with noise
    const z = [
      pos.x + randn_bm() * measurementNoise,
      pos.y + randn_bm() * measurementNoise,
    ];

    // Kalman Filter Prediction and Update
    // Prediction step
    let x_pred = math.multiply(A, x_est);
    let P_pred = math.add(math.multiply(A, math.multiply(P, math.transpose(A))), Q);

    // Update step
    let y_meas = math.subtract(z, math.multiply(H, x_pred));
    let S = math.add(math.multiply(H, math.multiply(P_pred, math.transpose(H))), R);
    let K = math.multiply(P_pred, math.multiply(math.transpose(H), math.inv(S)));
    x_est = math.add(x_pred, math.multiply(K, y_meas));
    P = math.multiply(math.subtract(math.identity(stateSize)._data, math.multiply(K, H)), P_pred);

    // Store estimated position
    if (motionModel === 'constantAcceleration') {
      flightData.estimatedPath.push({ x: x_est[0], y: x_est[1] });
    } else {
      flightData.estimatedPath.push({ x: x_est[0], y: x_est[1] });
    }

    // Calculate prediction error
    const error = Math.hypot(pos.x - x_est[0], pos.y - x_est[1]);

    // Record data
    const altitude = pos.y;
    const velocity = Math.hypot(vel.x, vel.y);
    const acceleration = Math.hypot(accelX, accelY);

    flightData.dataPoints.push({
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

    // Update the charts
    updateCharts();

    // Request the next frame
    requestAnimationFrame(update);
  }

  update();

  function storeFlightData() {
    storedFlights.push(flightData);
  }

  function drawScene() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Compute scaling factors
    const scaleX = canvas.width / (viewMaxX - viewMinX);
    const scaleY = canvas.height / (viewMaxY - viewMinY);

    // Helper function to transform points to canvas coordinates
    function transformPoint(point) {
      return {
        x: (point.x - viewMinX) * scaleX,
        y: canvas.height - (point.y - viewMinY) * scaleY,
      };
    }

    // Draw all stored flights if keeping trajectories
    if (keepTrajectories) {
      storedFlights.forEach((flight) => {
        drawFlight(flight, transformPoint);
      });
    }

    // Draw current flight
    drawFlight(flightData, transformPoint);

    // Draw ground line
    ctx.strokeStyle = '#8e8e93';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const groundY = transformPoint({ x: 0, y: 0 }).y;
    ctx.moveTo(0, groundY);
    ctx.lineTo(canvas.width, groundY);
    ctx.stroke();
  }

  function drawFlight(flight, transformPoint) {
    // Draw actual path
    ctx.strokeStyle = flight.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    flight.actualPath.forEach((point, index) => {
      const transformedPoint = transformPoint(point);
      if (index === 0) ctx.moveTo(transformedPoint.x, transformedPoint.y);
      else ctx.lineTo(transformedPoint.x, transformedPoint.y);
    });
    ctx.stroke();

    // Draw estimated path
    ctx.strokeStyle = shadeColor(flight.color, -20);
    ctx.lineWidth = 2;
    ctx.beginPath();
    flight.estimatedPath.forEach((point, index) => {
      const transformedPoint = transformPoint(point);
      if (index === 0) ctx.moveTo(transformedPoint.x, transformedPoint.y);
      else ctx.lineTo(transformedPoint.x, transformedPoint.y);
    });
    ctx.stroke();
  }

  function updateCharts() {
    const lastPoint = flightData.dataPoints[flightData.dataPoints.length - 1];

    // Update Altitude Chart
    addDataToChart(altitudeChart, lastPoint.time, lastPoint.altitude, flightData.color, `Flight ${flightData.flightNumber}`);

    // Update Velocity Chart
    addDataToChart(velocityChart, lastPoint.time, lastPoint.velocity, flightData.color, `Flight ${flightData.flightNumber}`);

    // Update Error Chart
    addDataToChart(errorChart, lastPoint.time, lastPoint.error, flightData.color, `Flight ${flightData.flightNumber}`);
  }
}

function addDataToChart(chart, time, value, color, label) {
  let dataset = chart.data.datasets.find((ds) => ds.label === label);
  if (!dataset) {
    dataset = {
      label: label,
      data: [],
      borderColor: color,
      backgroundColor: color + '33',
      fill: false,
      tension: 0.1,
    };
    chart.data.datasets.push(dataset);
  }
  dataset.data.push({ x: time, y: value });
  chart.update('none');
}

function getChartOptions(yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: {
        labels: {
          color: '#1d1d1f',
          font: {
            family: 'Helvetica Neue',
          },
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      },
      zoom: {
        pan: {
          enabled: true,
          mode: 'xy',
        },
        zoom: {
          wheel: {
            enabled: true,
          },
          mode: 'xy',
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        position: 'bottom',
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
          text: yLabel,
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

// Clear all data
function clearAll() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  storedFlights = [];
  clearCharts();
  flightTimeDisplay.textContent = '0.00';
  altitudeDisplay.textContent = '0.00';
  velocityDisplay.textContent = '0.00';
  accelerationDisplay.textContent = '0.00';
  flightCounter = 0;
}

// Clear chart data
function clearCharts() {
  altitudeChart.data.datasets = [];
  altitudeChart.update();

  velocityChart.data.datasets = [];
  velocityChart.update();

  errorChart.data.datasets = [];
  errorChart.update();
}

// Utility functions
function getRandomColor() {
  const colors = ['#FF6633', '#FF33FF', '#00B3E6', '#E6B333', '#3366E6', '#B34D4D', '#80B300', '#809900'];
  return colors[flightCounter % colors.length];
}

function shadeColor(color, percent) {
  // Shade color by a percentage
  const num = parseInt(color.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = ((num >> 8) & 0x00ff) + amt;
  const B = (num & 0x0000ff) + amt;
  return (
    '#' +
    (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)
  );
}
