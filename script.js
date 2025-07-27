const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const micCheckbox = document.getElementById('micCheckbox');
const camCheckbox = document.getElementById('camCheckbox');
const screenPreview = document.getElementById('screenPreview');
const cameraPreview = document.getElementById('cameraPreview');
const micSelect = document.getElementById('micSelect');
const camSelect = document.getElementById('camSelect');
const compositeCanvas = document.getElementById('compositeCanvas');
const outputPreview = document.getElementById('outputPreview');
const camShape = document.getElementById('camShape');
const camRadius = document.getElementById('camRadius');
const camRadiusValue = document.getElementById('camRadiusValue');

let mediaRecorder;
let recordedChunks = [];
let cameraStream;
let screenStream;
let animationFrameId;

let currentShape = 'rectangle';
let currentRadius = 16;

// Camera overlay state for position and size
let overlayState = {
  x: null, // top-left x (set after video loads)
  y: null, // top-left y
  width: null, // overlay width
  height: null, // overlay height
  dragging: false,
  resizing: false,
  dragOffsetX: 0,
  dragOffsetY: 0,
  resizeHandle: null // 'se', 'sw', 'ne', 'nw'
};

const HANDLE_SIZE = 14;

function setDefaultOverlayState(canvasW, canvasH) {
  overlayState.width = Math.floor(canvasW / 4);
  overlayState.height = Math.floor(canvasH / 4);
  overlayState.x = canvasW - overlayState.width - 20;
  overlayState.y = canvasH - overlayState.height - 20;
}

function isInHandle(mx, my, x, y, w, h, handle) {
  // handle: 'se', 'sw', 'ne', 'nw'
  let hx, hy;
  if (handle === 'se') { hx = x + w; hy = y + h; }
  if (handle === 'sw') { hx = x; hy = y + h; }
  if (handle === 'ne') { hx = x + w; hy = y; }
  if (handle === 'nw') { hx = x; hy = y; }
  return Math.abs(mx - hx) < HANDLE_SIZE && Math.abs(my - hy) < HANDLE_SIZE;
}

function isInOverlay(mx, my, x, y, w, h) {
  return mx >= x && mx <= x + w && my >= y && my <= y + h;
}

// Mouse/touch events for overlay
outputPreview.addEventListener('mousedown', onOverlayMouseDown);
outputPreview.addEventListener('mousemove', onOverlayMouseMove);
outputPreview.addEventListener('mouseup', onOverlayMouseUp);
outputPreview.addEventListener('mouseleave', onOverlayMouseUp);

function getMousePos(e) {
  const rect = outputPreview.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (outputPreview.width / rect.width),
    y: (e.clientY - rect.top) * (outputPreview.height / rect.height)
  };
}

function onOverlayMouseDown(e) {
  const { x, y } = getMousePos(e);
  const s = overlayState;
  // Check handles first
  for (const handle of ['se', 'sw', 'ne', 'nw']) {
    if (isInHandle(x, y, s.x, s.y, s.width, s.height, handle)) {
      s.resizing = true;
      s.resizeHandle = handle;
      return;
    }
  }
  // Check drag
  if (isInOverlay(x, y, s.x, s.y, s.width, s.height)) {
    s.dragging = true;
    s.dragOffsetX = x - s.x;
    s.dragOffsetY = y - s.y;
  }
}

function onOverlayMouseMove(e) {
  const { x, y } = getMousePos(e);
  const s = overlayState;
  if (s.resizing && s.resizeHandle) {
    // Resize from handle
    if (s.resizeHandle === 'se') {
      s.width = Math.max(40, x - s.x);
      s.height = Math.max(40, y - s.y);
    } else if (s.resizeHandle === 'sw') {
      s.width = Math.max(40, s.width + (s.x - x));
      s.x = Math.min(x, s.x + s.width - 40);
      s.height = Math.max(40, y - s.y);
    } else if (s.resizeHandle === 'ne') {
      s.width = Math.max(40, x - s.x);
      s.height = Math.max(40, s.height + (s.y - y));
      s.y = Math.min(y, s.y + s.height - 40);
    } else if (s.resizeHandle === 'nw') {
      s.width = Math.max(40, s.width + (s.x - x));
      s.x = Math.min(x, s.x + s.width - 40);
      s.height = Math.max(40, s.height + (s.y - y));
      s.y = Math.min(y, s.y + s.height - 40);
    }
  } else if (s.dragging) {
    // Drag overlay
    s.x = Math.max(0, Math.min(x - s.dragOffsetX, outputPreview.width - s.width));
    s.y = Math.max(0, Math.min(y - s.dragOffsetY, outputPreview.height - s.height));
  }
}

function onOverlayMouseUp(e) {
  overlayState.dragging = false;
  overlayState.resizing = false;
  overlayState.resizeHandle = null;
}

// Draw overlay handles and border on preview
function drawOverlayHandles(ctx, s) {
  ctx.save();
  ctx.strokeStyle = '#4f8cff';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(s.x, s.y, s.width, s.height);
  ctx.setLineDash([]);
  // Draw handles
  ctx.fillStyle = '#232b3a';
  ctx.strokeStyle = '#4f8cff';
  for (const handle of ['se', 'sw', 'ne', 'nw']) {
    let hx, hy;
    if (handle === 'se') { hx = s.x + s.width; hy = s.y + s.height; }
    if (handle === 'sw') { hx = s.x; hy = s.y + s.height; }
    if (handle === 'ne') { hx = s.x + s.width; hy = s.y; }
    if (handle === 'nw') { hx = s.x; hy = s.y; }
    ctx.beginPath();
    ctx.arc(hx, hy, HANDLE_SIZE / 2, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

camShape.addEventListener('change', () => {
  currentShape = camShape.value;
  if (currentShape === 'custom') {
    camRadius.style.display = '';
    camRadiusValue.style.display = '';
  } else {
    camRadius.style.display = 'none';
    camRadiusValue.style.display = 'none';
  }
});
camRadius.addEventListener('input', () => {
  currentRadius = parseInt(camRadius.value, 10);
  camRadiusValue.textContent = currentRadius;
});

// Populate device dropdowns
async function populateDeviceLists() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    micSelect.innerHTML = '';
    camSelect.innerHTML = '';
    let micCount = 0, camCount = 0;
    devices.forEach(device => {
      if (device.kind === 'audioinput') {
        micCount++;
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = device.label || `Microphone ${micCount}`;
        micSelect.appendChild(option);
      } else if (device.kind === 'videoinput') {
        camCount++;
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = device.label || `Camera ${camCount}`;
        camSelect.appendChild(option);
      }
    });
  } catch (err) {
    alert('Could not access media devices: ' + err.message);
  }
}

// Call on load
populateDeviceLists();
navigator.mediaDevices.addEventListener('devicechange', populateDeviceLists);

function drawCameraOverlay(ctx, cameraVideo, x, y, w, h, shape, radius) {
  if (!cameraVideo || !cameraVideo.srcObject) return;
  ctx.save();
  // Drop shadow
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4;

  // Shape clipping
  if (shape === 'circle') {
    const r = Math.min(w, h) / 2;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, r, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.clip();
  } else if (shape === 'square') {
    const side = Math.min(w, h);
    const cx = x + (w - side) / 2;
    const cy = y + (h - side) / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy + radius);
    ctx.arcTo(cx, cy, cx + side, cy, radius);
    ctx.arcTo(cx + side, cy, cx + side, cy + side, radius);
    ctx.arcTo(cx + side, cy + side, cx, cy + side, radius);
    ctx.arcTo(cx, cy + side, cx, cy, radius);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(cameraVideo, cx, cy, side, side);
    // Border
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.restore();
    return;
  } else if (shape === 'custom') {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.clip();
  } else {
    // rectangle
    if (radius > 0) {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo(x + radius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.clip();
    }
  }
  ctx.drawImage(cameraVideo, x, y, w, h);
  // Border
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#fff';
  if (shape === 'circle') {
    const r = Math.min(w, h) / 2;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, r, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.stroke();
  } else {
    ctx.beginPath();
    if (shape === 'custom' || shape === 'rectangle') {
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + w - radius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
      ctx.lineTo(x + w, y + h - radius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
      ctx.lineTo(x + radius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

// Update compositing and preview to use overlayState
function startCompositing(screenVideo, cameraVideo, width, height, camOverlay = true) {
  compositeCanvas.width = width;
  compositeCanvas.height = height;
  outputPreview.width = width;
  outputPreview.height = height;
  // Set default overlay if not set
  if (overlayState.x === null || overlayState.y === null) {
    setDefaultOverlayState(width, height);
  }
  const ctx = compositeCanvas.getContext('2d');
  const previewCtx = outputPreview.getContext('2d');

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(screenVideo, 0, 0, width, height);
    previewCtx.clearRect(0, 0, width, height);
    previewCtx.drawImage(screenVideo, 0, 0, width, height);
    if (camOverlay && cameraVideo && cameraVideo.srcObject) {
      // Use overlayState for position/size
      const { x, y, width: w, height: h } = overlayState;
      // Draw on both canvases with selected shape
      drawCameraOverlay(ctx, cameraVideo, x, y, w, h, currentShape, currentShape === 'custom' ? currentRadius : (currentShape === 'rectangle' ? 16 : (currentShape === 'square' ? 16 : 0)));
      drawCameraOverlay(previewCtx, cameraVideo, x, y, w, h, currentShape, currentShape === 'custom' ? currentRadius : (currentShape === 'rectangle' ? 16 : (currentShape === 'square' ? 16 : 0)));
      // Draw overlay handles on preview only
      drawOverlayHandles(previewCtx, overlayState);
    }
    animationFrameId = requestAnimationFrame(draw);
  }
  draw();
}

function stopCompositing() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

startBtn.onclick = async () => {
  startBtn.disabled = true;
  stopBtn.disabled = false;

  try {
    // Get screen stream
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false // We'll add audio manually if needed
    });
    screenPreview.srcObject = screenStream;

    // Add microphone if selected
    if (micCheckbox.checked) {
      const audioSource = micSelect.value;
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: audioSource ? { exact: audioSource } : undefined }
      });
      micStream.getAudioTracks().forEach(track => screenStream.addTrack(track));
    }

    // Camera overlay if selected
    let camOverlay = false;
    if (camCheckbox.checked) {
      const videoSource = camSelect.value;
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: videoSource ? { exact: videoSource } : undefined },
        audio: false
      });
      cameraPreview.srcObject = cameraStream;
      cameraPreview.style.display = 'block';
      camOverlay = true;
    } else {
      cameraPreview.style.display = 'none';
    }

    // Wait for video to be ready
    await new Promise(resolve => {
      screenPreview.onloadedmetadata = resolve;
    });
    if (camOverlay) {
      await new Promise(resolve => {
        cameraPreview.onloadedmetadata = resolve;
      });
    }

    // Start compositing
    const width = screenPreview.videoWidth || 1280;
    const height = screenPreview.videoHeight || 720;
    startCompositing(screenPreview, camOverlay ? cameraPreview : null, width, height, camOverlay);
    canvasStream = compositeCanvas.captureStream(30);

    // Add audio tracks from screenStream (system audio and/or mic)
    screenStream.getAudioTracks().forEach(track => canvasStream.addTrack(track));

    mediaRecorder = new MediaRecorder(canvasStream);
    recordedChunks = [];

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      stopCompositing();
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'recording.webm';
      a.click();
      URL.revokeObjectURL(url);
    };

    mediaRecorder.start();
  } catch (err) {
    alert('Error accessing media devices: ' + err.message);
    startBtn.disabled = false;
    stopBtn.disabled = true;
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
    }
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
    }
    stopCompositing();
  }
};

stopBtn.onclick = () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  startBtn.disabled = false;
  stopBtn.disabled = true;

  if (screenPreview.srcObject) {
    screenPreview.srcObject.getTracks().forEach(t => t.stop());
  }
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
  }
  stopCompositing();
};

// Sidebar navigation logic
const navHome = document.getElementById('navHome');
const navSettings = document.getElementById('navSettings');
const homePanel = document.getElementById('homePanel');
const settingsPanel = document.getElementById('settingsPanel');

navHome.addEventListener('click', () => {
  navHome.classList.add('active');
  navSettings.classList.remove('active');
  homePanel.style.display = '';
  settingsPanel.style.display = 'none';
});
navSettings.addEventListener('click', () => {
  navSettings.classList.add('active');
  navHome.classList.remove('active');
  homePanel.style.display = 'none';
  settingsPanel.style.display = '';
});
