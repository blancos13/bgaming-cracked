const express = require('express');
const bgamingRoutes = require('./routes/bgamingRoutes');
const log = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware for development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// Routes
app.use('/api/bgaming', bgamingRoutes);

// Home route - simple test page with game launcher
app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>BGaming Launcher</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                margin: 20px;
            }
            
            h1 {
                color: #333;
            }
            
            .game-list {
                margin: 20px 0;
            }
            
            .game-item {
                margin: 10px 0;
                padding: 10px;
                border: 1px solid #ddd;
                border-radius: 4px;
            }
            
            .game-item a {
                text-decoration: none;
                color: #007bff;
                font-weight: bold;
            }
            
            .game-item a:hover {
                text-decoration: underline;
            }
        </style>
    </head>
    <body>
        <h1>BGaming Game Launcher</h1>
        <p>Click on a game to launch it:</p>
        
        <div class="game-list">
            <div class="game-item">
                <a href="/api/bgaming/launch/AlohaKingElvis" target="_blank">Aloha King Elvis</a>
            </div>
            <div class="game-item">
                <a href="/api/bgaming/launch/WildTexas" target="_blank">Wild Texas</a>
            </div>
        </div>
    </body>
    </html>
    `;
    
    res.send(html);
});

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Error handler
app.use((err, req, res, next) => {
    log.error(`Unhandled error: ${err.message}`);
    res.status(500).json({
        success: false,
        message: 'Internal server error'
    });
});

// Start server
app.listen(PORT, () => {
    log.info(`Server running on port ${PORT}`);
    log.info(`Visit http://localhost:${PORT} to launch games`);
}); 