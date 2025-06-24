class BrightnessTool {
    constructor() {
        this.canvas = document.getElementById('imageCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvasWrapper = document.querySelector('.canvas-wrapper');
        this.originalImageData = null;
        this.currentImage = null;
        this.sourceTabId = null;
        
        // Zoom and pan state
        this.zoomLevel = 1;
        this.panX = 0;
        this.panY = 0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        
        // Control elements
        this.brightnessSlider = document.getElementById('brightnessSlider');
        this.contrastSlider = document.getElementById('contrastSlider');
        this.exposureSlider = document.getElementById('exposureSlider');
        this.zoomSlider = document.getElementById('zoomSlider');
        this.resetButton = document.getElementById('resetButton');
        this.backButton = document.getElementById('backButton');
        this.downloadButton = document.getElementById('downloadButton');
        
        // Value display elements
        this.brightnessValue = document.getElementById('brightnessValue');
        this.contrastValue = document.getElementById('contrastValue');
        this.exposureValue = document.getElementById('exposureValue');
        this.zoomValue = document.getElementById('zoomValue');
        
        // Loading and error elements
        this.loadingSpinner = document.getElementById('loadingSpinner');
        this.errorMessage = document.getElementById('errorMessage');
        
        this.init();
    }
    
    async init() {
        console.log('Initializing Brightness Tool...');
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Get image key from URL
        const urlParams = new URLSearchParams(window.location.search);
        const imageKey = urlParams.get('imageKey');
        
        if (!imageKey) {
            this.showError('No image data found');
            return;
        }
        
        await this.loadImageFromKey(imageKey);
        
        // Listen for new images from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'loadNewImage') {
                this.loadImageFromKey(message.imageKey, message.sourceTabId);
                sendResponse({ success: true });
            }
        });
        
        // Notify background when tab is closed
        window.addEventListener('beforeunload', () => {
            chrome.runtime.sendMessage({ type: 'toolTabClosed' });
        });
    }
    
    async loadImageFromKey(imageKey, newSourceTabId = null) {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'ready',
                imageKey: imageKey
            });
            
            if (response.success) {
                if (newSourceTabId) {
                    this.sourceTabId = newSourceTabId;
                } else {
                    this.sourceTabId = response.sourceTabId;
                }
                await this.loadImage(response.base64);
            } else {
                this.showError(response.error || 'Failed to load image');
            }
        } catch (error) {
            console.error('Error getting image data:', error);
            this.showError('Failed to communicate with extension');
        }
    }
    
    setupEventListeners() {
        // Slider events
        this.brightnessSlider.addEventListener('input', () => this.updateImage());
        this.contrastSlider.addEventListener('input', () => this.updateImage());
        this.exposureSlider.addEventListener('input', () => this.updateImage());
        this.zoomSlider.addEventListener('input', () => this.updateZoom());
        
        // Button events
        this.resetButton.addEventListener('click', () => this.resetAll());
        this.backButton.addEventListener('click', () => this.goBack());
        this.downloadButton.addEventListener('click', () => this.downloadImage());
        
        // Canvas mouse events for pan and zoom
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.handleMouseUp());
        
        // Update value displays
        this.brightnessSlider.addEventListener('input', () => {
            this.brightnessValue.textContent = this.brightnessSlider.value;
        });
        
        this.contrastSlider.addEventListener('input', () => {
            this.contrastValue.textContent = this.contrastSlider.value;
        });
        
        this.exposureSlider.addEventListener('input', () => {
            this.exposureValue.textContent = this.exposureSlider.value;
        });
        
        this.zoomSlider.addEventListener('input', () => {
            this.zoomValue.textContent = this.zoomSlider.value + 'x';
        });
    }
    
    handleWheel(e) {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = Math.max(0.5, Math.min(3, this.zoomLevel + delta));
        
        // Calculate zoom center point
        const zoomFactor = newZoom / this.zoomLevel;
        this.panX = mouseX - (mouseX - this.panX) * zoomFactor;
        this.panY = mouseY - (mouseY - this.panY) * zoomFactor;
        
        this.zoomLevel = newZoom;
        this.zoomSlider.value = newZoom;
        this.updateZoom();
    }
    
    handleMouseDown(e) {
        this.isDragging = true;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        this.canvas.style.cursor = 'grabbing';
    }
    
    handleMouseMove(e) {
        if (this.isDragging) {
            const deltaX = e.clientX - this.lastMouseX;
            const deltaY = e.clientY - this.lastMouseY;
            
            this.panX += deltaX;
            this.panY += deltaY;
            
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            
            this.updateZoom();
        }
    }
    
    handleMouseUp() {
        this.isDragging = false;
        this.canvas.style.cursor = 'grab';
    }
    
    async loadImage(base64Data) {
        try {
            console.log('Loading image...');
            
            const img = new Image();
            
            img.onload = () => {
                console.log('Image loaded successfully');
                this.currentImage = img;
                
                // Set canvas size
                this.canvas.width = img.width;
                this.canvas.height = img.height;
                
                // Reset zoom and pan
                this.zoomLevel = 1;
                this.panX = 0;
                this.panY = 0;
                this.zoomSlider.value = 1;
                
                // Draw original image
                this.ctx.drawImage(img, 0, 0);
                
                // Store original image data
                this.originalImageData = this.ctx.getImageData(0, 0, img.width, img.height);
                
                // Hide loading spinner
                this.loadingSpinner.style.display = 'none';
                this.errorMessage.style.display = 'none';
                
                // Initial render
                this.updateImage();
                this.canvas.style.cursor = 'grab';
            };
            
            img.onerror = () => {
                console.error('Failed to load image');
                this.showError('Failed to load image');
            };
            
            img.src = base64Data;
            
        } catch (error) {
            console.error('Error loading image:', error);
            this.showError('Error loading image');
        }
    }
    
    updateImage() {
        if (!this.originalImageData) return;
        
        const brightness = parseInt(this.brightnessSlider.value);
        const contrast = parseInt(this.contrastSlider.value);
        const exposure = parseInt(this.exposureSlider.value);
        
        // Create new image data
        const imageData = new ImageData(
            new Uint8ClampedArray(this.originalImageData.data),
            this.originalImageData.width,
            this.originalImageData.height
        );
        
        // Apply filters
        this.applyFilters(imageData, brightness, contrast, exposure);
        
        // Draw to canvas
        this.ctx.putImageData(imageData, 0, 0);
        
        // Apply zoom and pan
        this.updateZoom();
    }
    
    applyFilters(imageData, brightness, contrast, exposure) {
        const data = imageData.data;
        const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        const exposureFactor = Math.pow(2, exposure / 50); // Exposure as power of 2
        
        for (let i = 0; i < data.length; i += 4) {
            // Apply brightness (simple addition)
            let r = data[i] + brightness;
            let g = data[i + 1] + brightness;
            let b = data[i + 2] + brightness;
            
            // Apply contrast
            r = contrastFactor * (r - 128) + 128;
            g = contrastFactor * (g - 128) + 128;
            b = contrastFactor * (b - 128) + 128;
            
            // Apply exposure
            r = r * exposureFactor;
            g = g * exposureFactor;
            b = b * exposureFactor;
            
            // Clamp values
            data[i] = Math.max(0, Math.min(255, r));
            data[i + 1] = Math.max(0, Math.min(255, g));
            data[i + 2] = Math.max(0, Math.min(255, b));
            // Alpha channel remains unchanged
        }
    }
    
    updateZoom() {
        this.zoomLevel = parseFloat(this.zoomSlider.value);
        
        const transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;
        this.canvas.style.transform = transform;
        this.canvas.style.transformOrigin = '0 0';
        
        // Update zoom value display
        this.zoomValue.textContent = this.zoomLevel.toFixed(1) + 'x';
    }
    
    resetAll() {
        console.log('Resetting all values...');
        
        this.brightnessSlider.value = 0;
        this.contrastSlider.value = 0;
        this.exposureSlider.value = 0;
        this.zoomSlider.value = 1;
        
        // Reset zoom and pan
        this.zoomLevel = 1;
        this.panX = 0;
        this.panY = 0;
        
        // Update displays
        this.brightnessValue.textContent = '0';
        this.contrastValue.textContent = '0';
        this.exposureValue.textContent = '0';
        this.zoomValue.textContent = '1.0x';
        
        // Reset image
        this.updateImage();
    }
    
    async goBack() {
        if (this.sourceTabId) {
            try {
                await chrome.runtime.sendMessage({
                    type: 'focusTab',
                    tabId: this.sourceTabId
                });
            } catch (error) {
                console.error('Error focusing original tab:', error);
            }
        }
    }
    
    downloadImage() {
        try {
            // Create download link
            const link = document.createElement('a');
            link.download = `brightness-tool-image-${Date.now()}.png`;
            link.href = this.canvas.toDataURL('image/png');
            
            // Trigger download
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            console.log('Image downloaded successfully');
        } catch (error) {
            console.error('Error downloading image:', error);
        }
    }
    
    showError(message) {
        console.error('Error:', message);
        this.loadingSpinner.style.display = 'none';
        this.errorMessage.style.display = 'flex';
        this.errorMessage.querySelector('p').textContent = `❌ ${message}`;
    }
}

// Initialize the tool when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new BrightnessTool();
});
