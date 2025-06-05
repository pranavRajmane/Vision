// server.js (Node.js backend)
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();

// Enable gzip compression if available
try {
  const compression = require('compression');
  app.use(compression());
} catch (e) {
  console.log('Compression not available, continuing without it');
}

// Serve static files from src directory
app.use(express.static(path.join(__dirname)));

// Serve static files from dist directory (webpack output)
app.use('/dist', express.static(path.join(__dirname, '..', 'dist')));

// Serve VTP files with caching
app.use('/vtp', express.static(path.join(__dirname, 'vtp'), {
    maxAge: '1d',
    etag: true
}));

// Serve VTP files from the vtp directory (go up one level from src)
app.use('/data', express.static(path.join(__dirname, '..', 'vtp'), {
    maxAge: '1d',
    etag: true
}));

// Root route - serve index.html
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'index.html');
    
    // Check if index.html exists, if not create a basic one
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        // Create a basic HTML file if it doesn't exist
        const basicHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Casting Visualization</title>
    <style>
        body { margin: 0; padding: 0; overflow: hidden; font-family: Arial, sans-serif; }
        #renderWindow { width: 100vw; height: 100vh; }
        .controls {
            position: absolute;
            top: 10px;
            left: 10px;
            background: rgba(255,255,255,0.9);
            padding: 15px;
            border-radius: 5px;
            z-index: 1000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .control-group {
            margin-bottom: 10px;
        }
        label {
            display: inline-block;
            width: 100px;
            font-weight: bold;
        }
        select, input[type="range"], button {
            margin-left: 10px;
            padding: 5px;
        }
        #timeSlider {
            width: 200px;
        }
        button {
            background: #007cba;
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        button:hover {
            background: #005a87;
        }
    </style>
</head>
<body>
    <div id="renderWindow"></div>
    <div class="controls">
        <div class="control-group">
            <label for="fieldSelect">Field:</label>
            <select id="fieldSelect">
                <option value="">Loading fields...</option>
            </select>
        </div>
        <div class="control-group">
            <label for="timeSlider">Time:</label>
            <input type="range" id="timeSlider" min="0" max="100" value="0">
            <span id="timeDisplay">0.00s</span>
        </div>
        <div class="control-group">
            <button id="playButton">Play</button>
            <button id="resetButton">Reset</button>
        </div>
        <div class="control-group">
            <div id="loadStatus" style="font-size: 12px; color: #666; margin-top: 5px;">
                Initializing...
            </div>
        </div>
    </div>
    <script src="/dist/index.js"></script>
</body>
</html>`;
        res.send(basicHTML);
    }
});

// API endpoint for metadata - look in root vtp directory
app.get('/api/metadata', (req, res) => {
    // Look for metadata in the root vtp directory (up one level from src)
    const metadataPath = path.join(__dirname, '..', 'vtp', 'metadata.json');
    
    if (fs.existsSync(metadataPath)) {
        try {
            const metadata = require(metadataPath);
            res.json(metadata);
        } catch (error) {
            // Return default metadata if file doesn't exist or is malformed
            res.json({
                totalTimesteps: 7,  // Updated to match your 7 VTP files
                timeStep: 0.1,
                fields: ['T', 'U', 'alpha.water', 'p', 'p_rgh', 'k', 'epsilon', 'omega'],
                bounds: [-0.5, 0.5, -0.5, 0.5, 0, 0.3]
            });
        }
    } else {
        // Return default metadata matching your file count
        res.json({
            totalTimesteps: 7,  // You have final_0.vtp through final_6.vtp
            timeStep: 0.1,
            fields: ['T', 'U', 'alpha.water', 'p', 'p_rgh', 'k', 'epsilon', 'omega'],
            bounds: [-0.5, 0.5, -0.5, 0.5, 0, 0.3]
        });
    }
});

// Range requests for large VTP files from root vtp directory
app.get('/data/:filename', (req, res) => {
    const filename = req.params.filename;
    // Look for VTP files in the root vtp directory (up one level from src)
    const filepath = path.join(__dirname, '..', 'vtp', filename);
    
    // Check if file exists
    if (!fs.existsSync(filepath)) {
        return res.status(404).send('VTP file not found: ' + filename);
    }
    
    const stat = fs.statSync(filepath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    if (range) {
        // Handle range request for progressive loading
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filepath, { start, end });
        const head = {
            'Content-Range': 'bytes ' + start + '-' + end + '/' + fileSize,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'application/xml',
        };
        res.writeHead(206, head);
        file.pipe(res);
    } else {
        // Send entire file
        const head = {
            'Content-Length': fileSize,
            'Content-Type': 'application/xml',
        };
        res.writeHead(200, head);
        fs.createReadStream(filepath).pipe(res);
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'VTK.js casting visualization server is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Server running on http://localhost:' + PORT);
    console.log('Serving static files from: ' + __dirname);
    console.log('Webpack dist files from: ' + path.join(__dirname, '..', 'dist'));
    
    const vtpPath = path.join(__dirname, '..', 'vtp');
    console.log('VTP files directory: ' + vtpPath);
    console.log('VTP directory exists:', fs.existsSync(vtpPath));
    
    // List VTP files if directory exists
    if (fs.existsSync(vtpPath)) {
        const files = fs.readdirSync(vtpPath);
        console.log('Files in VTP directory:', files);
    }
    
    console.log('Data files directory: ' + path.join(__dirname, 'data'));
    
    // Test if final_0.vtp exists
    const testFile = path.join(__dirname, '..', 'vtp', 'final_0.vtp');
    console.log('final_0.vtp exists:', fs.existsSync(testFile));
});