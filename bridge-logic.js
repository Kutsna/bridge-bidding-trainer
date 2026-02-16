// Bridge Logic - Core functionality for hand evaluation

class BridgeHand {
    constructor(cards) {
        this.cards = cards; // Array of card objects: {suit: 'spades', rank: 'A'}
        this.suits = {
            spades: [],
            hearts: [],
            diamonds: [],
            clubs: []
        };
        this.organizeCards();
    }

    organizeCards() {
        const rankOrder = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
        
        this.cards.forEach(card => {
            this.suits[card.suit].push(card.rank);
        });

        // Sort each suit by rank
        Object.keys(this.suits).forEach(suit => {
            this.suits[suit].sort((a, b) => 
                rankOrder.indexOf(a) - rankOrder.indexOf(b)
            );
        });
    }

    calculateHCP() {
        let hcp = 0;
        const pointValues = {
            'A': 4,
            'K': 3,
            'Q': 2,
            'J': 1
        };

        this.cards.forEach(card => {
            hcp += pointValues[card.rank] || 0;
        });

        return hcp;
    }

    getDistribution() {
        return {
            spades: this.suits.spades.length,
            hearts: this.suits.hearts.length,
            diamonds: this.suits.diamonds.length,
            clubs: this.suits.clubs.length
        };
    }

    getDistributionString() {
        const dist = this.getDistribution();
        const lengths = [dist.spades, dist.hearts, dist.diamonds, dist.clubs];
        lengths.sort((a, b) => b - a);
        return lengths.join('-');
    }

    getLongestSuit() {
        const dist = this.getDistribution();
        let longestSuit = 'spades';
        let maxLength = dist.spades;

        Object.keys(dist).forEach(suit => {
            if (dist[suit] > maxLength) {
                maxLength = dist[suit];
                longestSuit = suit;
            }
        });

        return { suit: longestSuit, length: maxLength };
    }

    getHandType() {
        const dist = this.getDistribution();
        const lengths = [dist.spades, dist.hearts, dist.diamonds, dist.clubs];
        lengths.sort((a, b) => b - a);

        const pattern = lengths.join('-');

        // Balanced hands
        if (pattern === '4-3-3-3' || pattern === '4-4-3-2' || pattern === '5-3-3-2') {
            return 'Balanced';
        }

        // Semi-balanced
        if (pattern === '5-4-2-2' || pattern === '6-3-2-2') {
            return 'Semi-Balanced';
        }

        // Unbalanced
        if (lengths[0] >= 6 || lengths[1] >= 5) {
            return 'Unbalanced';
        }

        return 'Other';
    }

    hasStopperIn(suit) {
        const cards = this.suits[suit];
        if (cards.length === 0) return false;
        
        // A or K counts as stopper
        if (cards.includes('A') || cards.includes('K')) return true;
        
        // Q with length >= 2
        if (cards.includes('Q') && cards.length >= 2) return true;
        
        // J with length >= 3
        if (cards.includes('J') && cards.length >= 3) return true;

        return false;
    }

    countAces() {
        return this.cards.filter(card => card.rank === 'A').length;
    }

    countKings() {
        return this.cards.filter(card => card.rank === 'K').length;
    }

    hasMajorSuit() {
        return this.suits.spades.length >= 5 || this.suits.hearts.length >= 5;
    }

    getBestMajor() {
        if (this.suits.spades.length >= 5 && this.suits.hearts.length >= 5) {
            // Choose longer suit, if tied choose spades
            return this.suits.spades.length > this.suits.hearts.length ? 'spades' : 'hearts';
        }
        if (this.suits.spades.length >= 5) return 'spades';
        if (this.suits.hearts.length >= 5) return 'hearts';
        return null;
    }

    getSuitQuality(suit) {
        const cards = this.suits[suit];
        const honors = ['A', 'K', 'Q', 'J', '10'];
        const honorCount = cards.filter(rank => honors.includes(rank)).length;
        return {
            length: cards.length,
            honors: honorCount,
            quality: honorCount / Math.max(1, cards.length)
        };
    }
}

// Bidding sequence tracker
class BiddingSequence {
    constructor() {
        this.bids = [];
        this.currentPosition = 'North'; // You are North
        this.positions = ['North', 'East', 'South', 'West'];
    }

    addBid(position, bid) {
        this.bids.push({ position, bid });
    }

    getLastBid(position = null) {
        if (!position) {
            const contractBids = this.bids.filter(b => b.bid !== 'Pass');
            return contractBids.length > 0 ? contractBids[contractBids.length - 1] : null;
        }
        
        const positionBids = this.bids.filter(b => b.position === position);
        return positionBids.length > 0 ? positionBids[positionBids.length - 1] : null;
    }

    getPartnerLastBid() {
        // Partner is South
        return this.getLastBid('South');
    }

    getNextPosition() {
        if (this.bids.length === 0) return 'North';
        const lastPosition = this.bids[this.bids.length - 1].position;
        const currentIndex = this.positions.indexOf(lastPosition);
        return this.positions[(currentIndex + 1) % 4];
    }

    isComplete() {
        if (this.bids.length < 4) return false;
        const lastThree = this.bids.slice(-3);
        return lastThree.every(b => b.bid === 'Pass');
    }

    getFinalContract() {
        if (!this.isComplete()) return null;
        const contractBids = this.bids.filter(b => b.bid !== 'Pass');
        return contractBids.length > 0 ? contractBids[contractBids.length - 1].bid : 'Passed Out';
    }
}

// Utility function to parse bid strings
function parseBid(bidString) {
    if (bidString === 'Pass') return { type: 'pass' };
    
    const match = bidString.match(/^(\d+)(NT|[SHDC])$/);
    if (match) {
        const level = parseInt(match[1]);
        const strain = match[2];
        return { type: 'contract', level, strain };
    }
    
    return null;
}

function compareBids(bid1, bid2) {
    const parsed1 = parseBid(bid1);
    const parsed2 = parseBid(bid2);
    
    if (!parsed1 || !parsed2) return 0;
    if (parsed1.type === 'pass') return -1;
    if (parsed2.type === 'pass') return 1;
    
    if (parsed1.level !== parsed2.level) {
        return parsed1.level - parsed2.level;
    }
    
    const strainOrder = { 'C': 0, 'D': 1, 'H': 2, 'S': 3, 'NT': 4 };
    return strainOrder[parsed1.strain] - strainOrder[parsed2.strain];
}
