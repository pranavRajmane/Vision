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

// Serve VTP files from VTK/vtp_output directory with caching
app.use('/VTK/vtp_output', express.static(path.join(__dirname, '..', 'VTK', 'vtp_output'), {
    maxAge: '1d',
    etag: true
}));

// Alternative route for data access (points to VTK/vtp_output)
app.use('/data', express.static(path.join(__dirname, '..', 'VTK', 'vtp_output'), {
    maxAge: '1d',
    etag: true
}));

// Root route - serve index.html
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'index.html');
    
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
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

// Function to generate metadata by scanning the VTP files
function generateMetadataFromFiles(vtpOutputPath) {
    let timesteps = [];
    
    if (fs.existsSync(vtpOutputPath)) {
        const files = fs.readdirSync(vtpOutputPath);
        const vtpFiles = files.filter(file => 
            file.startsWith('combined_timestep_') && file.endsWith('.vtp')
        );
        
        timesteps = vtpFiles.map(file => {
            const match = file.match(/combined_timestep_(\d+)\.vtp/);
            return match ? parseInt(match[1]) : 0;
        }).sort((a, b) => a - b);
    }
    
    return {
        totalTimesteps: timesteps.length,
        timeStep: 0.1,
        timesteps: timesteps,
        fields: ['T', 'U', 'alpha.water', 'p', 'p_rgh', 'k', 'epsilon', 'omega'],
        bounds: [-0.5, 0.5, -0.5, 0.5, 0, 0.3]
    };
}

// API endpoint for metadata
app.get('/api/metadata', (req, res) => {
    const vtpOutputPath = path.join(__dirname, '..', 'VTK', 'vtp_output');
    const metadataPath = path.join(vtpOutputPath, 'metadata.json');
    
    if (fs.existsSync(metadataPath)) {
        try {
            const metadata = require(metadataPath);
            res.json(metadata);
        } catch (error) {
            const metadata = generateMetadataFromFiles(vtpOutputPath);
            res.json(metadata);
        }
    } else {
        const metadata = generateMetadataFromFiles(vtpOutputPath);
        res.json(metadata);
    }
});

// Range requests for large VTP files
app.get('/data/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, '..', 'VTK', 'vtp_output', filename);
    
    if (!fs.existsSync(filepath)) {
        return res.status(404).send('VTP file not found: ' + filename);
    }
    
    const stat = fs.statSync(filepath);
    const fileSize = stat.size;
    const range = req.headers.range;
    
    if (range) {
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
        const head = {
            'Content-Length': fileSize,
            'Content-Type': 'application/xml',
        };
        res.writeHead(200, head);
        fs.createReadStream(filepath).pipe(res);
    }
});

// API endpoint to get available timesteps
app.get('/api/timesteps', (req, res) => {
    const vtpOutputPath = path.join(__dirname, '..', 'VTK', 'vtp_output');
    let timesteps = [];
    
    if (fs.existsSync(vtpOutputPath)) {
        const files = fs.readdirSync(vtpOutputPath);
        const vtpFiles = files.filter(file => 
            file.startsWith('combined_timestep_') && file.endsWith('.vtp')
        );
        
        timesteps = vtpFiles.map(file => {
            const match = file.match(/combined_timestep_(\d+)\.vtp/);
            return {
                timestep: match ? parseInt(match[1]) : 0,
                filename: file
            };
        }).sort((a, b) => a.timestep - b.timestep);
    }
    
    res.json(timesteps);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'VTK.js casting visualization server is running' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Server running on http://localhost:' + PORT);
    console.log('Current working directory: ' + process.cwd());
    console.log('Server file location: ' + __dirname);
    
    const vtpPath = path.join(__dirname, '..', 'VTK', 'vtp_output');
    console.log('VTP files directory: ' + vtpPath);
    console.log('VTP directory exists:', fs.existsSync(vtpPath));
    
    if (fs.existsSync(vtpPath)) {
        const files = fs.readdirSync(vtpPath);
        const vtpFiles = files.filter(f => f.endsWith('.vtp'));
        console.log('VTP files found:', vtpFiles);
    } else {
        console.log('VTP directory not found. Checking alternative locations...');
        const alternatives = [
            path.join(__dirname, 'VTK', 'vtp_output'),
            path.join(process.cwd(), 'VTK', 'vtp_output')
        ];
        alternatives.forEach((alt, i) => {
            console.log(`Alternative ${i+1}: ${alt} - exists: ${fs.existsSync(alt)}`);
        });
    }
});