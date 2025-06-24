class BrightnessTool {
    constructor() {
        this.canvas = document.getElementById('imageCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.originalImageData = null;
        this.currentImage = null;
        this.sourceTabId = null;
        
        // Control elements
        this.brightnessSlider = document.getElementById('brightnessSlider');
        this.contrastSlider = document.getElementById('contrastSlider');
        this.zoomSlider = document.getElementById('zoomSlider');
        this.resetButton = document.getElementById('resetButton');
        this.backButton = document.getElementById('backButton');
        this.downloadButton = document.getElementById('downloadButton');
        
        // Value display elements
        this.brightnessValue = document.getElementById('brightnessValue');
        this.contrastValue = document.getElementById('contrastValue');
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
        const fromTab = urlParams.get('fromTab');
        
        if (!imageKey) {
            this.showError('No image data found');
            return;
        }
        
        // Request image data from background script
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'ready',
                imageKey: imageKey
            });
            
            if (response.success) {
                this.sourceTabId = response.sourceTabId;
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
        this.zoomSlider.addEventListener('input', () => this.updateZoom());
        
        // Button events
        this.resetButton.addEventListener('click', () => this.resetAll());
        this.backButton.addEventListener('click', () => this.goBack());
        this.downloadButton.addEventListener('click', () => this.downloadImage());
        
        // Canvas mouse wheel for zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            const currentZoom = parseFloat(this.zoomSlider.value);
            const newZoom = Math.max(0.5, Math.min(3, currentZoom + delta));
            this.zoomSlider.value = newZoom;
            this.updateZoom();
        });
        
        // Update value displays
        this.brightnessSlider.addEventListener('input', () => {
            this.brightnessValue.textContent = this.brightnessSlider.value;
        });
        
        this.contrastSlider.addEventListener('input', () => {
            this.contrastValue.textContent = this.contrastSlider.value;
        });
        
        this.zoomSlider.addEventListener('input', () => {
            this.zoomValue.textContent = this.zoomSlider.value + 'x';
        });
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
                
                // Draw original image
                this.ctx.drawImage(img, 0, 0);
                
                // Store original image data
                this.originalImageData = this.ctx.getImageData(0, 0, img.width, img.height);
                
                // Hide loading spinner
                this.loadingSpinner.style.display = 'none';
                
                // Initial render
                this.updateImage();
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
        
        // Create new image data
        const imageData = new ImageData(
            new Uint8ClampedArray(this.originalImageData.data),
            this.originalImageData.width,
            this.originalImageData.height
        );
        
        // Apply brightness and contrast
        this.applyFilters(imageData, brightness, contrast);
        
        // Draw to canvas
        this.ctx.putImageData(imageData, 0, 0);
        
        // Apply zoom
        this.updateZoom();
    }
    
    applyFilters(imageData, brightness, contrast) {
        const data = imageData.data;
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        
        for (let i = 0; i < data.length; i += 4) {
            // Apply brightness (simple addition)
            let r = data[i] + brightness;
            let g = data[i + 1] + brightness;
            let b = data[i + 2] + brightness;
            
            // Apply contrast
            r = factor * (r - 128) + 128;
            g = factor * (g - 128) + 128;
            b = factor * (b - 128) + 128;
            
            // Clamp values
            data[i] = Math.max(0, Math.min(255, r));
            data[i + 1] = Math.max(0, Math.min(255, g));
            data[i + 2] = Math.max(0, Math.min(255, b));
            // Alpha channel remains unchanged
        }
    }
    
    updateZoom() {
        const zoom = parseFloat(this.zoomSlider.value);
        const canvasContainer = document.querySelector('.canvas-container');
        
        this.canvas.style.transform = `scale(${zoom})`;
        this.canvas.style.transformOrigin = 'center center';
        
        // Update zoom value display
        this.zoomValue.textContent = zoom.toFixed(1) + 'x';
    }
    
    resetAll() {
        console.log('Resetting all values...');
        
        this.brightnessSlider.value = 0;
        this.contrastSlider.value = 0;
        this.zoomSlider.value = 1;
        
        // Update displays
        this.brightnessValue.textContent = '0';
        this.contrastValue.textContent = '0';
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
                // Close current tab
                window.close();
            } catch (error) {
                console.error('Error focusing original tab:', error);
                // Fallback: just close current tab
                window.close();
            }
        } else {
            window.close();
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
