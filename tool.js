// Image processing and UI logic for the brightness tool
let canvas, ctx;
let originalImageData = null;
let currentSourceTabId = null;
let isDragging = false;
let lastMouseX, lastMouseY;
let panX = 0, panY = 0;

// Current filter values
let brightness = 0;
let contrast = 0;
let exposure = 0;
let zoom = 1;

// Initialize the tool when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('Tool page loaded');
    
    canvas = document.getElementById('imageCanvas');
    ctx = canvas.getContext('2d');
    
    setupEventListeners();
    
    // Check for image key from URL or wait for message
    const urlParams = new URLSearchParams(window.location.search);
    const imageKey = urlParams.get('imageKey');
    const fromTab = urlParams.get('fromTab');
    
    if (imageKey) {
        currentSourceTabId = fromTab;
        requestImageData(imageKey);
    }
    
    // Listen for new images when tab is reused
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'loadNewImage') {
            console.log('Received new image to load:', message.imageKey);
            currentSourceTabId = message.sourceTabId;
            requestImageData(message.imageKey);
            sendResponse({ success: true });
        }
    });
    
    // Notify when tab is closed
    window.addEventListener('beforeunload', () => {
        chrome.runtime.sendMessage({ type: 'toolTabClosed' });
    });
});

function requestImageData(imageKey) {
    console.log('Requesting image data for key:', imageKey);
    showLoading();
    
    chrome.runtime.sendMessage({
        type: 'ready',
        imageKey: imageKey
    }, (response) => {
        if (response && response.success) {
            console.log('Received image data');
            currentSourceTabId = response.sourceTabId;
            loadImage(response.base64);
        } else {
            console.error('Failed to get image data:', response?.error);
            showError();
        }
    });
}

function setupEventListeners() {
    // Slider event listeners
    const brightnessSlider = document.getElementById('brightnessSlider');
    const contrastSlider = document.getElementById('contrastSlider');
    const exposureSlider = document.getElementById('exposureSlider');
    const zoomSlider = document.getElementById('zoomSlider');
    
    const brightnessValue = document.getElementById('brightnessValue');
    const contrastValue = document.getElementById('contrastValue');
    const exposureValue = document.getElementById('exposureValue');
    const zoomValue = document.getElementById('zoomValue');
    
    brightnessSlider.addEventListener('input', (e) => {
        brightness = parseInt(e.target.value);
        brightnessValue.textContent = brightness;
        applyFilters();
    });
    
    contrastSlider.addEventListener('input', (e) => {
        contrast = parseInt(e.target.value);
        contrastValue.textContent = contrast;
        applyFilters();
    });
    
    exposureSlider.addEventListener('input', (e) => {
        exposure = parseInt(e.target.value);
        exposureValue.textContent = exposure;
        applyFilters();
    });
    
    zoomSlider.addEventListener('input', (e) => {
        zoom = parseFloat(e.target.value);
        zoomValue.textContent = zoom.toFixed(1) + 'x';
        applyFilters();
    });
    
    // Button event listeners
    document.getElementById('resetButton').addEventListener('click', resetAll);
    document.getElementById('downloadButton').addEventListener('click', downloadImage);
    document.getElementById('backButton').addEventListener('click', goBack);
    
    // Canvas mouse events for panning
    canvas.addEventListener('mousedown', startDrag);
    canvas.addEventListener('mousemove', drag);
    canvas.addEventListener('mouseup', endDrag);
    canvas.addEventListener('mouseleave', endDrag);
}

function loadImage(base64Data) {
    hideLoading();
    hideError();
    
    const img = new Image();
    img.onload = function() {
        console.log('Image loaded successfully');
        
        // Set canvas size to fit the image while maintaining aspect ratio
        const maxWidth = 800;
        const maxHeight = 600;
        
        let { width, height } = img;
        
        if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width *= ratio;
            height *= ratio;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw the image and store original data
        ctx.drawImage(img, 0, 0, width, height);
        originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Reset filters and pan
        resetAll();
    };
    
    img.onerror = function() {
        console.error('Failed to load image');
        showError();
    };
    
    img.src = base64Data;
}

function showLoading() {
    document.getElementById('loadingSpinner').style.display = 'flex';
    document.getElementById('errorMessage').style.display = 'none';
}

function hideLoading() {
    document.getElementById('loadingSpinner').style.display = 'none';
}

function showError() {
    document.getElementById('loadingSpinner').style.display = 'none';
    document.getElementById('errorMessage').style.display = 'flex';
}

function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

function startDrag(e) {
    if (zoom > 1) {
        isDragging = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        canvas.style.cursor = 'grabbing';
    }
}

function drag(e) {
    if (isDragging && zoom > 1) {
        const deltaX = e.clientX - lastMouseX;
        const deltaY = e.clientY - lastMouseY;
        
        panX += deltaX;
        panY += deltaY;
        
        // Apply constraints to prevent dragging too far
        const maxPanX = (canvas.width * (zoom - 1)) / 2;
        const maxPanY = (canvas.height * (zoom - 1)) / 2;
        
        panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
        panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
        
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        
        applyFilters();
    }
}

function endDrag() {
    isDragging = false;
    canvas.style.cursor = zoom > 1 ? 'grab' : 'default';
}

function applyFilters() {
    if (!originalImageData) return;
    
    // Create a copy of the original image data
    const imageData = ctx.createImageData(originalImageData);
    const data = imageData.data;
    const originalData = originalImageData.data;
    
    // Apply filters pixel by pixel
    for (let i = 0; i < data.length; i += 4) {
        let r = originalData[i];
        let g = originalData[i + 1];
        let b = originalData[i + 2];
        
        // Apply exposure (multiplicative)
        if (exposure !== 0) {
            const exposureFactor = Math.pow(2, exposure / 100);
            r *= exposureFactor;
            g *= exposureFactor;
            b *= exposureFactor;
        }
        
        // Apply brightness (additive)
        if (brightness !== 0) {
            const brightnessFactor = brightness * 2.55; // Convert to 0-255 range
            r += brightnessFactor;
            g += brightnessFactor;
            b += brightnessFactor;
        }
        
        // Apply contrast
        if (contrast !== 0) {
            const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
            r = contrastFactor * (r - 128) + 128;
            g = contrastFactor * (g - 128) + 128;
            b = contrastFactor * (b - 128) + 128;
        }
        
        // Clamp values to 0-255
        data[i] = Math.max(0, Math.min(255, r));
        data[i + 1] = Math.max(0, Math.min(255, g));
        data[i + 2] = Math.max(0, Math.min(255, b));
        data[i + 3] = originalData[i + 3]; // Alpha channel
    }
    
    // Clear canvas and apply zoom/pan
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Apply zoom and pan transformations
    ctx.translate(canvas.width / 2 + panX, canvas.height / 2 + panY);
    ctx.scale(zoom, zoom);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
    
    // Put the filtered image data back
    ctx.putImageData(imageData, 0, 0);
    ctx.restore();
    
    // Update cursor based on zoom level
    canvas.style.cursor = zoom > 1 ? 'grab' : 'default';
}

function resetAll() {
    brightness = 0;
    contrast = 0;
    exposure = 0;
    zoom = 1;
    panX = 0;
    panY = 0;
    
    // Reset slider values
    document.getElementById('brightnessSlider').value = 0;
    document.getElementById('contrastSlider').value = 0;
    document.getElementById('exposureSlider').value = 0;
    document.getElementById('zoomSlider').value = 1;
    
    // Reset display values
    document.getElementById('brightnessValue').textContent = '0';
    document.getElementById('contrastValue').textContent = '0';
    document.getElementById('exposureValue').textContent = '0';
    document.getElementById('zoomValue').textContent = '1.0x';
    
    applyFilters();
}

function downloadImage() {
    const link = document.createElement('a');
    link.download = 'edited-image.png';
    link.href = canvas.toDataURL();
    link.click();
}

function goBack() {
    if (currentSourceTabId) {
        chrome.runtime.sendMessage({
            type: 'focusTab',
            tabId: parseInt(currentSourceTabId)
        });
    }
}
