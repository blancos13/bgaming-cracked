const cache = require('memory-cache');
const log = require('../utils/logger');

// In a real application, this would be stored in a database
const playerBalances = new Map();

class BalanceManager {
    // Initialize player with starting balance
    static initPlayerBalance(playerId, amount = 50000000) {
        if (!playerBalances.has(playerId)) {
            playerBalances.set(playerId, amount);
            log.info(`Initialized player ${playerId} with balance ${amount}`);
        }
        return this.getBalance(playerId);
    }

    // Get player balance
    static getBalance(playerId) {
        if (!playerBalances.has(playerId)) {
            return this.initPlayerBalance(playerId);
        }
        return playerBalances.get(playerId);
    }

    // Update player balance
    static updateBalance(playerId, amount) {
        if (!playerBalances.has(playerId)) {
            this.initPlayerBalance(playerId);
        }
        
        const currentBalance = playerBalances.get(playerId);
        const newBalance = currentBalance + amount;
        
        if (newBalance < 0) {
            log.warn(`Attempted to set negative balance for player ${playerId}`);
            return false;
        }
        
        playerBalances.set(playerId, newBalance);
        log.info(`Updated player ${playerId} balance: ${currentBalance} -> ${newBalance} (${amount > 0 ? '+' : ''}${amount})`);
        return newBalance;
    }

    // Process bet
    static processBet(playerId, betAmount) {
        return this.updateBalance(playerId, -betAmount);
    }

    // Process win
    static processWin(playerId, winAmount) {
        return this.updateBalance(playerId, winAmount);
    }

    // Get transaction history for a player
    static getTransactionHistory(playerId) {
        // In a real application, this would retrieve transaction history from a database
        return {
            player_id: playerId,
            balance: this.getBalance(playerId),
            message: "Transaction history would be here in a real application"
        };
    }
}

module.exports = BalanceManager; 