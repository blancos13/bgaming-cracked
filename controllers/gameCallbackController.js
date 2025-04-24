const axios = require('axios');
const log = require('../utils/logger');
const BalanceManager = require('./balanceManager');

class GameCallbackController {
    
    static async handleCallback(req, res) {
        try {
            // Extract token from URL segments
            const segments = req.path.split('/');
            const gameId = segments[2] || 'AlohaKingElvis'; 
            const sessionId = segments[3] || '362904';
            const token = segments[4] || 'ebfb32d3-b8ff-477c-85e0-2e54e4485e45';
            
            // Log the incoming request with detailed info
            log.info(`Game callback received: ${req.method} ${req.path}`);
            log.info(`Request body: ${JSON.stringify(req.body || {})}`);
            log.info(`Request headers: ${JSON.stringify(req.headers)}`);
            
            // Get player ID (in real app would come from session)
            const playerId = req.query.player_id || req.body.player_id || token || sessionId || 'demo_player';
            
            // Ensure player has balance
            const balance = BalanceManager.getBalance(playerId);
            log.info(`Player ${playerId} current balance: ${balance}`);
            
            // Currency settings - define the currency we want to use
            const currencyCode = process.env.GAME_CURRENCY_CODE || 'ZEROBYTE';
            const currencySymbol = process.env.GAME_CURRENCY_SYMBOL || '$';
            log.info(`Using currency: ${currencyCode} (${currencySymbol})`);
            
            // Handle session initialization if needed
            if (req.body && req.body.command === 'init' && !req.headers['x-fresh-session']) {
                log.info(`Attempting to create a fresh session for game: ${gameId}`);
                
                try {
                    // First, we need to get a proper session by accessing the game page
                    // Note: We still need to use the path format with the currency code
                    const gameUrl = `https://bgaming-network.com/play/${gameId}/${currencyCode}?server=demo`;
                    log.info(`Fetching game page: ${gameUrl}`);
                    
                    const gamePageResponse = await axios.get(gameUrl, {
                        headers: {
                            'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.9',
                        }
                    });
                    
                    log.info(`Game page status: ${gamePageResponse.status}`);
                    
                    // Extract cookies from response
                    const cookies = gamePageResponse.headers['set-cookie'];
                    if (cookies) {
                        log.info(`Received cookies from game page: ${JSON.stringify(cookies)}`);
                    }
                    
                    // Extract CSRF token and play_token
                    const htmlContent = gamePageResponse.data;
                    const csrfTokenMatch = htmlContent.match(/meta content="([^"]+)" name="csrf-token"/);
                    const playTokenMatch = htmlContent.match(/"play_token":"([^"]+)"/);
                    
                    if (csrfTokenMatch && playTokenMatch) {
                        const csrfToken = csrfTokenMatch[1];
                        const playToken = playTokenMatch[1];
                        
                        log.info(`Extracted CSRF token: ${csrfToken}`);
                        log.info(`Extracted play token: ${playToken}`);
                        
                        // Create a cookie jar from the response
                        const cookieJar = {};
                        if (cookies) {
                            cookies.forEach(cookie => {
                                const cookieParts = cookie.split(';')[0].split('=');
                                if (cookieParts.length >= 2) {
                                    const name = cookieParts[0];
                                    const value = cookieParts.slice(1).join('=');
                                    cookieJar[name] = value;
                                }
                            });
                        }
                        
                        // Now we need to make a proper API request with the tokens and cookies
                        const apiUrl = `https://bgaming-network.com/api/${gameId}/${sessionId}/${playToken}`;
                        
                        // Build cookie string
                        let cookieString = '';
                        Object.entries(cookieJar).forEach(([name, value]) => {
                            cookieString += `${name}=${value}; `;
                        });
                        
                        const apiHeaders = {
                            'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
                            'Accept': '*/*',
                            'Content-Type': 'application/json',
                            'Origin': 'https://bgaming-network.com',
                            'Referer': `https://bgaming-network.com/games/${gameId}/${currencyCode}?play_token=${playToken}`,
                            'X-CSRF-Token': csrfToken,
                            'Cookie': cookieString
                        };
                        
                        // Make the init request with our fresh session
                        const freshInitResponse = await axios.post(apiUrl, req.body, {
                            headers: apiHeaders
                        });
                        
                        log.info(`Fresh session API response status: ${freshInitResponse.status}`);
                        log.info(`Fresh session API response: ${JSON.stringify(freshInitResponse.data)}`);
                        
                        // Replace balance with our internal balance
                        const responseData = freshInitResponse.data;
                        if (responseData.balance) {
                            responseData.balance = {
                                game: 0,
                                wallet: Math.round(balance * 100) // In cents
                            };
                        }
                        
                        // Update currency object in the response if needed
                        if (responseData.options && responseData.options.currency) {
                            // Keep the original structure but update values
                            responseData.options.currency = {
                                code: currencyCode,
                                symbol: currencySymbol,
                                subunits: 100,
                                exponent: 2
                            };
                            log.info(`Updated currency in response to: ${currencyCode}`);
                        }
                        
                        // Return the modified response
                        return res.json(responseData);
                    } else {
                        log.error(`Could not extract tokens from game page: CSRF ${csrfTokenMatch ? 'found' : 'not found'}, PlayToken ${playTokenMatch ? 'found' : 'not found'}`);
                    }
                } catch (sessionError) {
                    log.error(`Error creating fresh session: ${sessionError.message}`);
                    log.error(`Session error details: ${sessionError.stack}`);
                    
                    if (sessionError.response) {
                        log.error(`Session error response status: ${sessionError.response.status}`);
                        log.error(`Session error response headers: ${JSON.stringify(sessionError.response.headers)}`);
                        log.error(`Session error response data: ${JSON.stringify(sessionError.response.data)}`);
                    }
                }
            }
            
            // If we get here, continue with the regular API proxy approach
            
            // Make a request to BGaming API
            if (req.body) {
                const command = req.body.command;
                log.info(`Command: ${command}`);
                
                // All headers from the actual request
                const headers = {
                    'accept': '*/*',
                    'accept-encoding': 'gzip, deflate, br, zstd',
                    'accept-language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
                    'content-type': 'application/json',
                    'cookie': '_ga=GA1.1.2053870881.1745446163; _casino_games_session=cCJ5IlRTMtfXAkwmGbs5qmSIYaFS1edNAGfTZ32CdY%2BhMG5u0hQ2FInt7E1DjxbJbs5sSKZ8kiK710RIgVgrunx9igWzho9%2Brec7PJiR2AQShoSVkku2Foy9k%2FmerS3Y74Um%2FiWuVuqNdavu6qGWFO2sgiKqDK5CLCkgkqLRWsQm0pBZrIS1eokoBukV74fmvMKgpftnieb814e7NGQaNVXQ6RekL%2BWO%2FYhOa4g1XmzOr1kdcJy4x6Unw2DpMXsixQ3%2FzyAGvFd%2BzlBX%2BFMlZSkG6vrAol%2Fr4F5bv2Y%3D--r4X5DTgWtSWAmIOc--R6MhpnmYgNunpp5xq2W%2Ffw%3D%3D; _ga_1TYS5KPFP4=GS1.1.1745450027.2.1.1745453855.16.0.0',
                    'origin': 'https://demo.bgaming-network.com',
                    'referer': `https://demo.bgaming-network.com/games/${gameId}/${currencyCode}?play_token=${token}`,
                    'sec-ch-ua': '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
                    'x-csrf-token': 'IiREoM6NSAoioP9iUMQB3zYn3UX1-y3jZwdnpnrN8dlb_SgzswDi5KXLwA3ZFY6VjJ2-fFGR1jc5pOV97UuVwQ'
                };
                
                // Update the URL with the demo domain
                const bgamingApiUrl = `https://demo.bgaming-network.com/api/${gameId}/${sessionId}/${token}`;
                log.info(`BGaming API URL: ${bgamingApiUrl}`);
                log.info(`BGaming request headers: ${JSON.stringify(headers)}`);
                log.info(`BGaming request body: ${JSON.stringify(req.body)}`);
                
                try {
                    // Make the actual request to BGaming
                    log.info(`Sending request to BGaming API...`);
                    
                    const bgamingResponse = await axios.post(bgamingApiUrl, req.body, { 
                        headers: headers,
                        withCredentials: true, // Important for cookies
                        validateStatus: false // Don't throw error for non-2xx status codes
                    });
                    
                    // Log detailed response information
                    log.info(`BGaming response status: ${bgamingResponse.status}`);
                    log.info(`BGaming response headers: ${JSON.stringify(bgamingResponse.headers)}`);
                    log.info(`BGaming response data: ${JSON.stringify(bgamingResponse.data)}`);
                    
                    const bgamingData = bgamingResponse.data;
                    
                    // If we got an error response - special handling for unknown_exception
                    if (bgamingData.errors) {
                        const errorCode = bgamingData.errors[0]?.code;
                        const errorDesc = bgamingData.errors[0]?.desc;
                        
                        log.error(`BGaming API returned errors: ${JSON.stringify(bgamingData.errors)}`);
                        
                        // If we get unknown_exception on init, we should try with a fresh session
                        if (command === 'init' && errorCode === 204 && errorDesc === 'unknown_exception') {
                            log.info(`Received unknown_exception on init, will retry with a fresh session`);
                            
                            // Set a header to prevent infinite loops
                            req.headers['x-fresh-session'] = 'attempted';
                            
                            // Recursively call handleCallback to attempt with fresh session
                            return this.handleCallback(req, res);
                        }
                        
                        // Return the error with our balance
                        return res.json({
                            ...bgamingData,
                            balance: {
                                game: 0,
                                wallet: Math.round(balance * 100) // In cents
                            }
                        });
                    }
                    
                    // Process balance based on command type
                    if (command === 'init' || command === 'close') {
                        // Just replace the balance for init command
                        if (bgamingData.balance) {
                            bgamingData.balance = {
                                game: 0,
                                wallet: Math.round(balance * 100) // In cents
                            };
                        }
                        
                        // Update currency object in the response if needed
                        if (bgamingData.options && bgamingData.options.currency) {
                            // Keep the original structure but update values
                            bgamingData.options.currency = {
                                code: currencyCode,
                                symbol: currencySymbol,
                                subunits: 100,
                                exponent: 2
                            };
                            log.info(`Updated currency in init response to: ${currencyCode}`);
                        }
                        
                        log.info(`Replaced balance in ${command} response: ${JSON.stringify(bgamingData.balance)}`);
                    } else if (command === 'spin') {
                        // Process bet and win for spin command
                        let betAmount = 0;
                        let winAmount = 0;
                        
                        // Extract bet and win amounts
                        if (bgamingData.outcome && bgamingData.outcome.bet) {
                            betAmount = parseFloat(bgamingData.outcome.bet) / 100; // Convert cents to dollars
                        } else if (req.body.bet) {
                            betAmount = parseFloat(req.body.bet) / 100; // From request if not in response
                        }
                        
                        if (bgamingData.outcome && bgamingData.outcome.win) {
                            winAmount = parseFloat(bgamingData.outcome.win) / 100; // Convert cents to dollars
                        }
                        
                        log.info(`Spin: bet amount = ${betAmount}, win amount = ${winAmount}`);
                        
                        // Process bet in our system
                        BalanceManager.processBet(playerId, betAmount);
                        log.info(`Processed bet: ${betAmount}, new balance: ${BalanceManager.getBalance(playerId)}`);
                        
                        // Process win in our system if any
                        if (winAmount > 0) {
                            BalanceManager.processWin(playerId, winAmount);
                            log.info(`Processed win: ${winAmount}, new balance: ${BalanceManager.getBalance(playerId)}`);
                        }
                        
                        // Get updated balance
                        const updatedBalance = BalanceManager.getBalance(playerId);
                        
                        // Update balance in response
                        if (bgamingData.balance) {
                            bgamingData.balance = {
                                game: Math.round(winAmount * 100), // Game balance shows win amount in cents
                                wallet: Math.round(updatedBalance * 100) // In cents
                            };
                        }
                        
                        // Update currency object in the response if needed
                        if (bgamingData.options && bgamingData.options.currency) {
                            // Keep the original structure but update values
                            bgamingData.options.currency = {
                                code: currencyCode,
                                symbol: currencySymbol,
                                subunits: 100,
                                exponent: 2
                            };
                            log.info(`Updated currency in spin response to: ${currencyCode}`);
                        }
                        
                        log.info(`Replaced balance in spin response: ${JSON.stringify(bgamingData.balance)}`);
                    } else if (command === 'freespin') {
                        // For freespin, only add win amount if any
                        let winAmount = 0;
                        
                        if (bgamingData.outcome && bgamingData.outcome.win) {
                            winAmount = parseFloat(bgamingData.outcome.win) / 100; // Convert cents to dollars
                        }
                        
                        log.info(`Freespin: win amount = ${winAmount}`);
                        
                        // Process win in our system if any
                        if (winAmount > 0) {
                            BalanceManager.processWin(playerId, winAmount);
                            log.info(`Processed freespin win: ${winAmount}, new balance: ${BalanceManager.getBalance(playerId)}`);
                        }
                        
                        // Get updated balance
                        const updatedBalance = BalanceManager.getBalance(playerId);
                        
                        // Update balance in response
                        if (bgamingData.balance) {
                            bgamingData.balance = {
                                game: Math.round(winAmount * 100), // Game balance shows win amount in cents
                                wallet: Math.round(updatedBalance * 100) // In cents
                            };
                        }
                        
                        // Update currency object in the response if needed
                        if (bgamingData.options && bgamingData.options.currency) {
                            // Keep the original structure but update values
                            bgamingData.options.currency = {
                                code: currencyCode,
                                symbol: currencySymbol,
                                subunits: 100,
                                exponent: 2
                            };
                            log.info(`Updated currency in freespin response to: ${currencyCode}`);
                        }
                        
                        log.info(`Replaced balance in freespin response: ${JSON.stringify(bgamingData.balance)}`);
                    } else {
                        // For any other command
                        if (bgamingData.balance) {
                            bgamingData.balance = {
                                game: 0,
                                wallet: Math.round(balance * 100) // In cents
                            };
                        }
                        
                        // Update currency object in the response if needed
                        if (bgamingData.options && bgamingData.options.currency) {
                            // Keep the original structure but update values
                            bgamingData.options.currency = {
                                code: currencyCode,
                                symbol: currencySymbol,
                                subunits: 100,
                                exponent: 2
                            };
                            log.info(`Updated currency in ${command} response to: ${currencyCode}`);
                        }
                        
                        log.info(`Replaced balance in ${command} response: ${JSON.stringify(bgamingData.balance)}`);
                    }
                    
                    // Log the final response before sending
                    log.info(`Sending final response: ${JSON.stringify(bgamingData)}`);
                    
                    // Return modified response
                    return res.json(bgamingData);
                    
                } catch (error) {
                    log.error(`Error with BGaming API: ${error.message}`);
                    log.error(`Error details: ${error.stack}`);
                    
                    if (error.response) {
                        log.error(`Error response status: ${error.response.status}`);
                        log.error(`Error response headers: ${JSON.stringify(error.response.headers)}`);
                        log.error(`Error response data: ${JSON.stringify(error.response.data)}`);
                    }
                    
                    // If it was a spin and we got an error, refund the bet
                    if (command === 'spin' && req.body.bet) {
                        const betAmount = parseFloat(req.body.bet || 25) / 100; // Convert cents to dollars
                        BalanceManager.processWin(playerId, betAmount); // Refund
                        log.info(`Refunded bet due to error: ${betAmount}, new balance: ${BalanceManager.getBalance(playerId)}`);
                    }
                    
                    // Return error response with all details
                    const errorResponse = {
                        "errors": [{
                            "code": error.response?.status || 500,
                            "desc": `Error connecting to game server: ${error.message}`
                        }],
                        "balance": {
                            "game": 0,
                            "wallet": Math.round(balance * 100) // In cents
                        }
                    };
                    
                    log.info(`Sending error response: ${JSON.stringify(errorResponse)}`);
                    return res.json(errorResponse); // Return as 200 OK with error details inside
                }
            }
            
            // Fallback response if no body
            const invalidResponse = {
                "errors": [{
                    "code": 400,
                    "desc": "Invalid request"
                }],
                "balance": {
                    "game": 0,
                    "wallet": Math.round(balance * 100) // In cents
                }
            };
            
            log.info(`Sending invalid request response: ${JSON.stringify(invalidResponse)}`);
            return res.json(invalidResponse);  // Return as 200 OK with error details inside
            
        } catch (error) {
            log.error(`Error in handleCallback: ${error.message}`);
            log.error(`Error stack: ${error.stack}`);
            
            // Always return a successful response to prevent game errors
            const serverErrorResponse = {
                "errors": [{
                    "code": 500,
                    "desc": `Internal server error: ${error.message}`
                }],
                "balance": {
                    "game": 0,
                    "wallet": 10000000 // In cents
                }
            };
            
            log.info(`Sending server error response: ${JSON.stringify(serverErrorResponse)}`);
            return res.json(serverErrorResponse);  // Return as 200 OK with error details inside
        }
    }
    
    // Initialize a player's balance when they start playing
    static initializePlayerForGame(playerId, gameId) {
        return BalanceManager.initPlayerBalance(playerId);
    }
}

module.exports = GameCallbackController; 