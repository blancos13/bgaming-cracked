// Game configuration
const gameConfig = {
    gameconfig: {
        bgaming: {
            new_api_endpoint: 'http://localhost:3000/api/bgaming/callback',
            controller: 'BgamingController',
            launcher_behaviour: 'internal_game'
        },
        session_entry_url: 'http://localhost:3000/api/bgaming/entry-session'
    }
};

module.exports = gameConfig; 