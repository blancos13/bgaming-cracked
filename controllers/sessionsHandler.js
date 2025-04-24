const cache = require('memory-cache');
const log = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

// In-memory database substitute (for demo purposes)
// In a real application, this would be MongoDB, MySQL, etc.
const sessionDb = [];

class SessionsHandler {
    
    // Store a new session
    static async storeSession(sessionData) {
        try {
            // Store in our mock database
            sessionDb.push(sessionData);
            
            // Store in cache for 120 minutes
            const cacheTimeMinutes = 120;
            cache.put(
                sessionData.token_internal, 
                sessionData, 
                cacheTimeMinutes * 60 * 1000
            );
            
            return true;
        } catch (error) {
            log.error(`Error storing session: ${error.message}`);
            return false;
        }
    }
    
    // Get session data by player ID and token
    static async sessionData(playerId, tokenInternal) {
        try {
            // Try to get from cache first
            const retrieveSessionFromCache = cache.get(tokenInternal);
            
            if (retrieveSessionFromCache) {
                return {
                    data_retrieval_method: 'cache',
                    session_data: retrieveSessionFromCache
                };
            } 
            
            // If not in cache, try to get from database
            const retrieveSessionFromDatabase = sessionDb.find(session => 
                session.player_id === playerId && 
                session.token_internal === tokenInternal
            );
            
            if (retrieveSessionFromDatabase) {
                return {
                    data_retrieval_method: 'database',
                    session_data: retrieveSessionFromDatabase
                };
            }
            
            // If not found anywhere, return false
            return false;
        } catch (error) {
            log.error(`Error retrieving session data: ${error.message}`);
            return false;
        }
    }
    
    // Update session data
    static async sessionUpdate(playerId, tokenInternal, key, newValue) {
        try {
            // Find in database
            const sessionIndex = sessionDb.findIndex(session => 
                session.player_id === playerId && 
                session.token_internal === tokenInternal
            );
            
            if (sessionIndex === -1) {
                // Session not found
                return false;
            }
            
            // Update the session in our mock DB
            const session = sessionDb[sessionIndex];
            session[key] = newValue;
            session.updated_at = new Date();
            
            // Update in cache as well
            cache.put(tokenInternal, session, 120 * 60 * 1000); // 120 minutes
            
            return session;
        } catch (error) {
            log.error(`Error updating session: ${error.message}`);
            cache.del(tokenInternal); // Clear cache if update fails
            return false;
        }
    }
    
    // Invalidate previous sessions
    static async invalidatePrevSessions(playerId, operatorId) {
        try {
            // Find all sessions for this player/operator that are active
            const sessionsToInvalidate = sessionDb.filter(session => 
                session.player_id === playerId &&
                session.operator_id === operatorId &&
                session.expired_bool === 0 &&
                session.state === 'SESSION_INIT'
            );
            
            // Update them all
            sessionsToInvalidate.forEach(session => {
                session.state = 'SESSION_OVERRULE_INVALIDATION';
                session.expired_bool = 1;
                session.updated_at = new Date();
                
                // Also update in cache
                if (cache.get(session.token_internal)) {
                    cache.put(session.token_internal, session, 120 * 60 * 1000);
                }
            });
            
            return true;
        } catch (error) {
            log.error(`Error invalidating previous sessions: ${error.message}`);
            return false;
        }
    }
    
    // Find a previous active session for the same player/game
    static async findPreviousActiveSession(internalToken) {
        try {
            // Get the current session
            const currentSession = cache.get(internalToken) || 
                sessionDb.find(s => s.token_internal === internalToken);
            
            if (!currentSession) {
                return { status: 404, message: 'Current session not found' };
            }
            
            // Look for active sessions with same player_id and game_id
            const previousSession = sessionDb.find(session => 
                session.player_id === currentSession.player_id &&
                session.game_id === currentSession.game_id &&
                session.token_internal !== currentSession.token_internal &&
                session.expired_bool === 0 &&
                session.token_original !== 0
            );
            
            if (previousSession) {
                return { 
                    status: 200, 
                    token_original: previousSession.token_original 
                };
            }
            
            return { status: 404, message: 'No previous active session found' };
        } catch (error) {
            log.error(`Error finding previous active session: ${error.message}`);
            return { status: 500, message: 'Internal server error' };
        }
    }
    
    // Expire a session
    static async expireSession(internalToken) {
        try {
            // Find the session
            const sessionIndex = sessionDb.findIndex(s => s.token_internal === internalToken);
            
            if (sessionIndex === -1) {
                return false;
            }
            
            // Update it
            sessionDb[sessionIndex].expired_bool = 1;
            sessionDb[sessionIndex].state = 'SESSION_EXPIRED';
            sessionDb[sessionIndex].updated_at = new Date();
            
            // Update cache
            const session = sessionDb[sessionIndex];
            if (cache.get(internalToken)) {
                cache.put(internalToken, session, 120 * 60 * 1000);
            }
            
            return true;
        } catch (error) {
            log.error(`Error expiring session: ${error.message}`);
            return false;
        }
    }
}

module.exports = SessionsHandler; 