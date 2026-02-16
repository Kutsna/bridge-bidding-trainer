// SAYC (Standard American Yellow Card) Bidding System

class SAYCSystem {
    constructor() {
        this.name = "Standard American Yellow Card (SAYC)";
    }

    // Main method to get opening bid recommendation
    getOpeningBid(hand) {
        const hcp = hand.calculateHCP();
        const dist = hand.getDistribution();
        const handType = hand.getHandType();
        
        // Less than 12 HCP - Pass
        if (hcp < 12) {
            return {
                bid: 'Pass',
                explanation: `With ${hcp} HCP, the hand is too weak to open. SAYC requires at least 12 HCP to open at the one level.`
            };
        }

        // 22-24 HCP Balanced - 2NT (traditional SAYC)
        if (hcp >= 22 && hcp <= 24 && handType === 'Balanced') {
            return {
                bid: '2NT',
                explanation: `With ${hcp} HCP and a balanced hand, open 2NT showing 22-24 HCP (traditional SAYC).`
            };
        }

        if (hcp >= 22) {
            return {
                bid: '2C',
                explanation: `With ${hcp} HCP, open 2♣ (strong artificial forcing). This shows a game-forcing hand.`
            };
        }

        // 20-21 HCP Balanced - Open 2NT
        if (hcp >= 20 && hcp <= 21 && handType === 'Balanced') {
            return {
                bid: '2NT',
                explanation: `With ${hcp} HCP and a balanced hand, open 2NT showing 20-21 HCP.`
            };
        }

        // 15-17 HCP Balanced - Open 1NT
        if (hcp >= 15 && hcp <= 17 && handType === 'Balanced') {
            return {
                bid: '1NT',
                explanation: `With ${hcp} HCP and a balanced hand (${hand.getDistributionString()}), open 1NT showing 15-17 HCP.`
            };
        }

        // 5+ card major
        if (dist.spades >= 5 && dist.hearts >= 5) {
            // Both majors 5+, bid higher ranking (spades) first
            return {
                bid: '1S',
                explanation: `With ${hcp} HCP and 5+ cards in both majors (${dist.spades} spades, ${dist.hearts} hearts), open 1♠ (higher ranking suit).`
            };
        }

        if (dist.spades >= 5) {
            return {
                bid: '1S',
                explanation: `With ${hcp} HCP and ${dist.spades} spades, open 1♠. SAYC opens 5-card majors.`
            };
        }

        if (dist.hearts >= 5) {
            return {
                bid: '1H',
                explanation: `With ${hcp} HCP and ${dist.hearts} hearts, open 1♥. SAYC opens 5-card majors.`
            };
        }

        // Minor suits - prefer longer, if equal prefer clubs
        if (dist.diamonds > dist.clubs) {
            return {
                bid: '1D',
                explanation: `With ${hcp} HCP and no 5-card major, open 1♦ with ${dist.diamonds} diamonds (longer minor).`
            };
        }

        if (dist.clubs >= 3) {
            return {
                bid: '1C',
                explanation: `With ${hcp} HCP and no 5-card major, open 1♣ with ${dist.clubs} clubs. Open longer minor, or 1♣ with equal length.`
            };
        }

        // Default to 1C (should rarely reach here with valid hands)
        return {
            bid: '1C',
            explanation: `With ${hcp} HCP, open 1♣ (better minor or catchall).`
        };
    }

    // Response to partner's bid
    getResponse(hand, partnerBid, sequence) {
        const hcp = hand.calculateHCP();
        const dist = hand.getDistribution();

        // Response to 1NT opening
        if (partnerBid === '1NT') {
            return this.respondTo1NT(hand, hcp, dist);
        }

        // Response to major suit openings
        if (partnerBid === '1S') {
            return this.respondTo1Major(hand, hcp, dist, 'spades');
        }

        if (partnerBid === '1H') {
            return this.respondTo1Major(hand, hcp, dist, 'hearts');
        }

        // Response to minor suit openings
        if (partnerBid === '1D') {
            return this.respondTo1Minor(hand, hcp, dist, 'diamonds');
        }

        if (partnerBid === '1C') {
            return this.respondTo1Minor(hand, hcp, dist, 'clubs');
        }

        // Response to 2NT opening
        if (partnerBid === '2NT') {
            if (hcp >= 4) {
                return {
                    bid: '3NT',
                    explanation: `With ${hcp} HCP, raise to 3NT. Partner has 20-21 HCP, giving partnership at least 24 HCP for game.`
                };
            }
            return {
                bid: 'Pass',
                explanation: `With only ${hcp} HCP, pass partner's 2NT. Partnership lacks 25 HCP for game.`
            };
        }

        // Default response
        if (hcp < 6) {
            return {
                bid: 'Pass',
                explanation: `With only ${hcp} HCP, pass. Insufficient values to respond.`
            };
        }

        return {
            bid: 'Pass',
            explanation: `With ${hcp} HCP, further bidding analysis needed.`
        };
    }

    respondTo1NT(hand, hcp, dist) {
        // 0-7 HCP - Pass or weak takeout
        if (hcp < 8) {
            if (dist.spades >= 5 || dist.hearts >= 5 || dist.diamonds >= 6 || dist.clubs >= 6) {
                return {
                    bid: 'Pass',
                    explanation: `With ${hcp} HCP, pass 1NT. In real SAYC, you might use transfer bids with a long suit.`
                };
            }
            return {
                bid: 'Pass',
                explanation: `With only ${hcp} HCP, pass 1NT. Partnership has 22-24 HCP, not enough for game.`
            };
        }

        // 8-9 HCP - Invite to game
        if (hcp >= 8 && hcp <= 9) {
            return {
                bid: '2NT',
                explanation: `With ${hcp} HCP, invite game with 2NT. Partner will pass with minimum or bid 3NT with maximum.`
            };
        }

        // 10+ HCP - Bid game
        if (hcp >= 10) {
            return {
                bid: '3NT',
                explanation: `With ${hcp} HCP, bid game in 3NT. Partnership has at least 25 HCP.`
            };
        }

        return {
            bid: 'Pass',
            explanation: `With ${hcp} HCP, pass 1NT.`
        };
    }

    respondTo1Major(hand, hcp, dist, suit) {
        const supportLength = dist[suit];
        const suitSymbol = suit === 'spades' ? '♠' : '♥';
        const suitCode = suit === 'spades' ? 'S' : 'H';

        // 6-9 HCP with 3+ card support - simple raise
        if (hcp >= 6 && hcp <= 9 && supportLength >= 3) {
            return {
                bid: `2${suitCode}`,
                explanation: `With ${hcp} HCP and ${supportLength}-card support for partner's ${suitSymbol}, raise to 2${suitSymbol} (simple raise showing 6-9 HCP).`
            };
        }

        // 10-12 HCP with 3+ card support - limit raise
        if (hcp >= 10 && hcp <= 12 && supportLength >= 3) {
            return {
                bid: `3${suitCode}`,
                explanation: `With ${hcp} HCP and ${supportLength}-card support, make a limit raise to 3${suitSymbol} showing 10-12 HCP.`
            };
        }

        // 13+ HCP with 3+ card support - game
        if (hcp >= 13 && supportLength >= 3) {
            return {
                bid: `4${suitCode}`,
                explanation: `With ${hcp} HCP and ${supportLength}-card support, bid game in 4${suitSymbol}. Partnership has game values.`
            };
        }

        // Without support, bid new suit or NT
        if (hcp >= 6 && hcp <= 9) {
            // Bid another 4+ card major or longest suit
            if (suit === 'hearts' && dist.spades >= 4) {
                return {
                    bid: '1S',
                    explanation: `With ${hcp} HCP and ${dist.spades} spades, bid 1♠ (4+ card spades over 1♥).`
                };
            }
            return {
                bid: '1NT',
                explanation: `With ${hcp} HCP but lacking support, bid 1NT showing 6-9 HCP and no fit.`
            };
        }

        if (hcp >= 10) {
            return {
                bid: '2NT',
                explanation: `With ${hcp} HCP but no fit, bid 2NT showing 10-12 HCP balanced.`
            };
        }

        return {
            bid: 'Pass',
            explanation: `With ${hcp} HCP, insufficient values to respond.`
        };
    }

    respondTo1Minor(hand, hcp, dist, suit) {
        const suitCode = suit === 'diamonds' ? 'D' : 'C';
        
        // Less than 6 HCP - Pass
        if (hcp < 6) {
            return {
                bid: 'Pass',
                explanation: `With only ${hcp} HCP, pass. Insufficient values to respond.`
            };
        }

        // 6-9 HCP - Bid 4+ card major if available, otherwise 1NT
        if (hcp >= 6 && hcp <= 9) {
            if (dist.spades >= 4) {
                return {
                    bid: '1S',
                    explanation: `With ${hcp} HCP and ${dist.spades} spades, bid 1♠. Show 4-card majors up the line.`
                };
            }
            if (dist.hearts >= 4) {
                return {
                    bid: '1H',
                    explanation: `With ${hcp} HCP and ${dist.hearts} hearts, bid 1♥. Show 4-card majors up the line.`
                };
            }
            return {
                bid: '1NT',
                explanation: `With ${hcp} HCP and no 4-card major, bid 1NT showing 6-9 HCP.`
            };
        }

        // 10-12 HCP - Bid major or 2NT
        if (hcp >= 10 && hcp <= 12) {
            if (dist.spades >= 4) {
                return {
                    bid: '1S',
                    explanation: `With ${hcp} HCP and ${dist.spades} spades, bid 1♠. Show majors first.`
                };
            }
            if (dist.hearts >= 4) {
                return {
                    bid: '1H',
                    explanation: `With ${hcp} HCP and ${dist.hearts} hearts, bid 1♥. Show majors first.`
                };
            }
            return {
                bid: '2NT',
                explanation: `With ${hcp} HCP and no 4-card major, bid 2NT showing 10-12 HCP balanced.`
            };
        }

        // 13+ HCP - Game values
        if (hcp >= 13) {
            if (dist.spades >= 4) {
                return {
                    bid: '1S',
                    explanation: `With ${hcp} HCP and ${dist.spades} spades, bid 1♠. Show majors and then explore game.`
                };
            }
            if (dist.hearts >= 4) {
                return {
                    bid: '1H',
                    explanation: `With ${hcp} HCP and ${dist.hearts} hearts, bid 1♥. Show majors and then explore game.`
                };
            }
            return {
                bid: '3NT',
                explanation: `With ${hcp} HCP, bid game in 3NT. Partnership has sufficient values.`
            };
        }

        return {
            bid: 'Pass',
            explanation: `With ${hcp} HCP, further bidding analysis needed.`
        };
    }
}
