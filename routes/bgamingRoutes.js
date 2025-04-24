const express = require('express');
const router = express.Router();
const BgamingController = require('../controllers/bgamingController');
const GameCallbackController = require('../controllers/gameCallbackController');

// Launch a game through iframe
router.get('/launch/:gameId', BgamingController.launchGame);

// Entry session endpoint (used by the iframe to load the game)
router.get('/entry-session', BgamingController.entrySession);

// Game API callbacks - use a wildcard to catch all patterns
router.all('/callback*', GameCallbackController.handleCallback);

// Dynamic asset loader
router.get('/asset/:assetName', (req, res) => {
    const { assetName } = req.params;
    
    if (assetName === 'custom.js') {
        res.setHeader('Content-Type', 'application/javascript');
        res.send('window.localStorage.clear();');
    } else {
        res.status(404).send('Asset not found');
    }
});

module.exports = router; 