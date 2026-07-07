const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // SSE Endpoint
    if (pathname === '/api/live') {
        const state = parsedUrl.query.state || 'up';
        
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });

        // Function to send data in SSE format
        const sendSSE = (data) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        // Load initial data
        const filePath = path.join(__dirname, 'public', 'data', `sample-${state}.json`);

        let currentData = null;
        let updateCount = 0;
        const modifiedIndices = [];

        try {
            if (fs.existsSync(filePath)) {
                currentData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            }
        } catch (err) {
            console.error(`Error reading data file for state ${state}:`, err);
        }

        // Tweak data initially so BJP starts below majority (majority is 116 for totalSeats 230)
        if (state !== 'goa' && currentData && Array.isArray(currentData.data)) {
            let changedCount = 0;
            // Change 10 BJP candidates to SP temporarily to lower BJP count to 104 (NDA to 107)
            currentData.data.forEach((candidate, idx) => {
                if (candidate.party === 'BJP' && changedCount < 10) {
                    candidate.party = 'SP';
                    modifiedIndices.push(idx);
                    changedCount++;
                }
            });
            console.log(`SSE connection: state=${state}. Temporarily changed ${changedCount} BJP seats to SP to start below majority.`);
        }

        // Send initial state data immediately
        if (currentData) {
            sendSSE(currentData);
        }

        // Set interval to simulate live election updates
        const intervalId = setInterval(() => {
            if (currentData) {
                // Keep Goa dataset static as a final Hung Assembly state
                if (state === 'goa') {
                    res.write(`: keepalive\n\n`);
                    return;
                }

                updateCount++;
                let hasChanges = false;

                // Gradually restore BJP candidates to simulate BJP gaining seats and crossing majority
                if (modifiedIndices.length > 0 && updateCount <= 5) {
                    const restoreCount = 2;
                    for (let i = 0; i < restoreCount; i++) {
                        if (modifiedIndices.length > 0) {
                            const idx = modifiedIndices.pop();
                            if (currentData.data[idx]) {
                                currentData.data[idx].party = 'BJP';
                                currentData.data[idx].status = 'leading'; // double-blink gold animation
                                hasChanges = true;
                            }
                        }
                    }
                    console.log(`SSE Update #${updateCount}: Restored candidates to BJP. Remaining modified: ${modifiedIndices.length}`);
                }

                if (Array.isArray(currentData.data) && currentData.data.length > 0) {
                    let parties = [];
                    if (currentData.parties && Array.isArray(currentData.parties)) {
                        parties = currentData.parties.map(p => p.name);
                    } else if (currentData.colors) {
                        parties = Object.keys(currentData.colors).filter(p => p !== 'DEFAULT');
                    }
                    if (parties.length > 1) {
                        currentData.data = currentData.data.map((candidate, idx) => {
                            // Don't fluctuate the candidates we are actively restoring
                            if (modifiedIndices.includes(idx)) {
                                return candidate;
                            }

                            const newCandidate = { ...candidate };
                            // Random chance to update a candidate
                            if (Math.random() < 0.05) {
                                // Only 'leading' candidates can change
                                if (newCandidate.status === 'leading') {
                                    if (Math.random() < 0.2) {
                                        // Candidate wins!
                                        newCandidate.status = 'won';
                                        hasChanges = true;
                                    } else {
                                        // Lead fluctuates between parties
                                        const currentPartyIdx = parties.indexOf(newCandidate.party);
                                        if (currentPartyIdx !== -1) {
                                            const nextPartyIdx = (currentPartyIdx + Math.floor(Math.random() * (parties.length - 1)) + 1) % parties.length;
                                            newCandidate.party = parties[nextPartyIdx];
                                            hasChanges = true;
                                        }
                                    }
                                }
                            }
                            return newCandidate;
                        });
                    }
                }
                
                if (hasChanges) {
                    sendSSE(currentData);
                } else {
                    res.write(`: keepalive\n\n`);
                }
            } else {
                res.write(`: keepalive\n\n`);
            }
        }, 5000);

        req.on('close', () => {
            clearInterval(intervalId);
            res.end();
        });
        return;
    }

    // Static File Server
    let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
    
    // Safety check to ensure we only serve from the directory
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File Not Found');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*'
            });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
