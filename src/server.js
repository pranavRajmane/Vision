// server.js (Node.js backend)
const express = require('express');
const compression = require('compression');
const path = require('path');

const app = express();

// Enable gzip compression
app.use(compression());

// Serve static files with caching
app.use('/vtp', express.static(path.join(__dirname, 'vtp'), {
    maxAge: '1d',
    etag: true
}));

// API endpoint for metadata
app.get('/api/metadata', (req, res) => {
    res.json(require('./data/metadata.json'));
});

// Range requests for large files
app.get('/vtp/:final', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(__dirname, 'vtp', filename);
    
    // Support range requests for progressive loading
    const range = req.headers.range;
    if (range) {
        // Handle range request
        // ... implementation
    }
});

app.listen(3001, () => {
    console.log('Server running on http://localhost:3001');
});