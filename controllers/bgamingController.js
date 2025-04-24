const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const cache = require('memory-cache');
const config = require('../config/gameConfig');
const sessionsHandler = require('./sessionsHandler');
const log = require('../utils/logger');

class BgamingController {
    
    static async generateSessionToken(gameId, method, userAgent) {
        if(method === 'demo_method') {
            const url = `https://bgaming-network.com/play/${gameId}/FUN?server=demo`;
            try {
                const response = await axios.get(url, {
                    headers: userAgent,
                    timeout: 4000,
                    validateStatus: false
                });
                return {
                    status: response.status,
                    data: response.data
                };
            } catch (error) {
                log.error(`Error generating session token: ${error.message}`);
                return {
                    status: 500,
                    data: null
                };
            }
        }
        return {
            status: 400,
            data: 'generateSessionToken() method not supported'
        };
    }

    static inBetween(start, end, content) {
        // Helper to extract content between two strings (similar to BaseFunctions::in_between)
        const regexPattern = new RegExp(`${start}(.*?)${end}`, 's');
        const match = content.match(regexPattern);
        return match ? match[1] : false;
    }

    static async loadBundle() {
        try {
            const response = await axios.get('https://cdn.bgaming-network.com/html/AlohaKingElvis/basic/v3.1.100_4e305ee/bundle.js');
            return `<script type="text/javascript">${response.data}</script>`;
        } catch (error) {
            log.error(`Error loading bundle: ${error.message}`);
            return '<script type="text/javascript">console.error("Failed to load bundle");</script>';
        }
    }

    static async requestSession(session) {
        if (!session) {
            return 'error';
        }
        
        // Get session data
        const selectSession = await sessionsHandler.sessionData(session.player_id, session.token_internal);
        if (!selectSession || !selectSession.session_data) {
            return 'error';
        }

        try {
            // Extract game ID and user agent
            const explodeGame = selectSession.session_data.game_id_original.split('/');
            const originalGameId = explodeGame[1];
            const getUserAgent = typeof selectSession.session_data.user_agent === 'string' 
                ? JSON.parse(selectSession.session_data.user_agent) 
                : selectSession.session_data.user_agent;

            // Generate session with the provider
            const generateSession = await BgamingController.generateSessionToken(originalGameId, 'demo_method', getUserAgent);
            
            if (generateSession.status !== 200) {
                return 'error';
            }

            const gameContent = generateSession.data;
            
            // Extract play token
            const originSessionToken = BgamingController.inBetween('\\"play_token\\":\\"', '\\",\\"', gameContent);
            
            if (originSessionToken === false) {
                log.critical('Not being able to select play_token, even though the status & original game data seems correct.');
                return 'TOKEN_NOT_SELECTABLE';
            }

            // Replace API endpoints in the content
            const newApiEndpoint = config.gameconfig.bgaming.new_api_endpoint; 
            const token = selectSession.session_data.token_internal;
            
            let replacedContent = gameContent;
            
            // Replace known API patterns - make sure to add a slash between endpoint and path
            replacedContent = replacedContent.replace(/https:\/\/bgaming-network\.com\/api\//g, `${newApiEndpoint}/`);
            replacedContent = replacedContent.replace(/https:\/\/bgaming-network-mga\.com\/api\//g, `${newApiEndpoint}/`);
            replacedContent = replacedContent.replace(/https:\/\/demo\.bgaming-network\.com\/api\//g, `${newApiEndpoint}/`);
            
            // Replace without trailing slash (some patterns might not have it)
            replacedContent = replacedContent.replace(/https:\/\/bgaming-network\.com\/api"/g, `${newApiEndpoint}"`);
            replacedContent = replacedContent.replace(/https:\/\/bgaming-network-mga\.com\/api"/g, `${newApiEndpoint}"`);
            replacedContent = replacedContent.replace(/https:\/\/demo\.bgaming-network\.com\/api"/g, `${newApiEndpoint}"`);
            
            // Block analytics and tracking
            replacedContent = replacedContent.replace(/sentry\.softswiss\.net/g, 'bog.asia');
            replacedContent = replacedContent.replace(/googletagmanager\.com/g, 'bog.asia');
            replacedContent = replacedContent.replace(/UA-98852510-1/g, ' ');
            replacedContent = replacedContent.replace(/https:\/\/boost\.bgaming-network\.com\/analytics\.js/g, 
                `custom.js?game=${selectSession.session_data.game_id}`);
            
            // Load and insert bundle
            const bundle = await BgamingController.loadBundle();
            replacedContent = replacedContent.replace(/<body>/g, `<body>${bundle}`);
            
            replacedContent = replacedContent.replace(/document\.write/g, ' ');

            return replacedContent;
        } catch (error) {
            log.error(`Error in requestSession: ${error.message}`);
            return 'error';
        }
    }

    static async entrySession(req, res) {
        try {
            // Validate request parameters
            if (!req.query.token || !req.query.entry || !req.query.player_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required parameters'
                });
            }
            
            const playerId = req.query.player_id;
            const token = req.query.token;
            const entrySecurekey = req.query.entry;
            const userAgent = req.headers['user-agent'];

            // Get session data
            const selectSession = await sessionsHandler.sessionData(playerId, token);
            if (!selectSession) {
                return res.status(404).json({
                    success: false,
                    message: 'Session not found'
                });
            }

            // Verify signature (simplified for demo)
            const verifySignature = BgamingController.verifySign(entrySecurekey, token);
            if (!verifySignature) {
                return res.status(403).json({
                    success: false,
                    message: 'Entry invalid, create new session'
                });
            }

            // Update session state
            const sessionStateUpdate = await sessionsHandler.sessionUpdate(playerId, token, 'state', 'SESSION_ENTRY');
            if (!sessionStateUpdate) {
                return res.status(400).json({
                    success: false,
                    message: 'Not able to change session state'
                });
            }

            // Get game controller and launcher behavior
            const finalSessionData = sessionStateUpdate;
            const selectExtraMeta = JSON.parse(finalSessionData.extra_meta);
            
            // Update user agent
            await sessionsHandler.sessionUpdate(playerId, token, 'user_agent', JSON.stringify({
                'user-agent': userAgent,
                player_ip: req.ip
            }));

            // Request game session
            const requestGameSession = await BgamingController.requestSession(finalSessionData);

            if (requestGameSession === 'error') {
                await sessionsHandler.sessionUpdate(playerId, token, 'state', 'SESSION_FAILED');
                return res.status(400).json({
                    success: false,
                    message: 'Error trying to retrieve origin game, please refresh'
                });
            }

            // Return game content
            await sessionsHandler.sessionUpdate(playerId, token, 'state', 'SESSION_STARTED');
            return res.send(requestGameSession);
            
        } catch (error) {
            log.error(`Error in entrySession: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }

    static async createSession(data) {
        try {
            const { game, currency = 'USD', player, operator_key, mode = 'real', request_ip } = data;
            
            // Mock game selection (in a real system, you'd query from a database)
            const gamesList = [
                { slug: 'softswiss:AlohaKingElvis', provider: 'bgaming', internal_enabled: 1, gid: 'softswiss/AlohaKingElvis' },
                { slug: 'softswiss:WildTexas', provider: 'bgaming', internal_enabled: 1, gid: 'softswiss/WildTexas' }
            ];
            
            const selectGame = gamesList.find(g => g.slug === game && g.internal_enabled === 1);
            
            if (!selectGame) {
                const searchDisabled = gamesList.find(g => g.slug === game && g.internal_enabled === 0);
                if (searchDisabled) {
                    return {
                        status: 'error',
                        message: 'Game found, however this game is disabled.',
                        request_ip
                    };
                } else {
                    return {
                        status: 'error',
                        message: 'Game not found',
                        request_ip
                    };
                }
            }
            
            // Invalidate previous sessions (simplified)
            await BgamingController.invalidatePrev(player, operator_key);
            
            // Create a new session
            const extraMeta = {
                provider: selectGame.provider,
                mode
            };
            
            const tokenGeneration = uuidv4();
            const prependSessionObject = {
                player_id: player,
                operator_id: operator_key,
                game_id: selectGame.slug,
                extra_meta: JSON.stringify(extraMeta),
                user_agent: '[]',
                token_internal: tokenGeneration,
                currency,
                game_id_original: selectGame.gid,
                token_original: 0,
                games_amount: 0,
                expired_bool: 0,
                state: 'SESSION_INIT',
                created_at: new Date(),
                updated_at: new Date()
            };
            
            // Store in database and cache
            await sessionsHandler.storeSession(prependSessionObject);
            
            // Generate entry signature
            const entrySignature = BgamingController.generateSign(tokenGeneration);
            const sessionUrl = `${config.gameconfig.session_entry_url}?token=${tokenGeneration}&entry=${entrySignature}&player_id=${player}`;
            
            return {
                status: 'success',
                message: {
                    session_data: prependSessionObject,
                    session_url: sessionUrl
                },
                request_ip
            };
            
        } catch (error) {
            log.error(`Error in createSession: ${error.message}`);
            return {
                status: 'error',
                message: 'Internal server error',
                request_ip: data.request_ip
            };
        }
    }

    static async invalidatePrev(player, operator) {
        // In production, this would update a database
        // Simplified implementation for demo
        try {
            // Mocking database update
            return true;
        } catch (error) {
            log.error(`Error invalidating previous sessions: ${error.message}`);
            return false;
        }
    }

    // Simple signature generation
    static generateSign(token) {
        return crypto.createHash('md5').update(token + 'someSecretKey').digest('hex');
    }

    // Simple signature verification
    static verifySign(signature, token) {
        const expectedSignature = this.generateSign(token);
        return signature === expectedSignature;
    }

    // Demo launcher endpoint
    static async launchGame(req, res) {
        try {
            const { gameId } = req.params;
            const playerId = req.query.player || 'demo_player';
            
            const data = {
                game: `softswiss:${gameId}`,
                currency: req.query.currency || 'USD',
                player: playerId,
                operator_key: req.query.operator || 'demo_operator',
                mode: 'real',
                request_ip: req.ip
            };
            
            // Initialize player balance with 10000 (default in balanceManager)
            const GameCallbackController = require('./gameCallbackController');
            GameCallbackController.initializePlayerForGame(playerId, gameId);
            
            const sessionResponse = await BgamingController.createSession(data);
            
            if (sessionResponse.status === 'success') {
                // Return iframe HTML that points to the session URL
                const iframeHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>BGaming - ${gameId}</title>
                    <style>
                        body, html {
                            margin: 0;
                            padding: 0;
                            height: 100%;
                            overflow: hidden;
                        }
                        iframe {
                            width: 100%;
                            height: 100%;
                            border: none;
                        }
                    </style>
                </head>
                <body>
                    <iframe src="${sessionResponse.message.session_url}" allowfullscreen></iframe>
                </body>
                </html>
                `;
                return res.send(iframeHtml);
            } else {
                return res.status(400).json(sessionResponse);
            }
        } catch (error) {
            log.error(`Error launching game: ${error.message}`);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
}

module.exports = BgamingController; 