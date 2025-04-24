// Simple logger implementation
// In a production environment, you'd use a proper logging library like winston

const logger = {
    info: (message) => {
        console.log(`[INFO] ${new Date().toISOString()}: ${message}`);
    },
    
    error: (message) => {
        console.error(`[ERROR] ${new Date().toISOString()}: ${message}`);
    },
    
    warn: (message) => {
        console.warn(`[WARN] ${new Date().toISOString()}: ${message}`);
    },
    
    debug: (message) => {
        console.debug(`[DEBUG] ${new Date().toISOString()}: ${message}`);
    },
    
    critical: (message) => {
        console.error(`[CRITICAL] ${new Date().toISOString()}: ${message}`);
    }
};

module.exports = logger; 