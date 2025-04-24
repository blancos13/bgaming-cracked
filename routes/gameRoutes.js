const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');

// Get list of all games
router.get('/list', gameController.getGameList.bind(gameController));

// Get specific game details
router.get('/game/:gameId', gameController.getGame.bind(gameController));

module.exports = router; 