class BalanceManager {
    static balances = {};
    
    static getBalance(playerId) {
        if (!this.balances[playerId]) {
            // Initialize balance for new players
            this.balances[playerId] = 10000000; // 10 million starting balance
        }
        return this.balances[playerId];
    }
    
    // ... existing code ...
} 