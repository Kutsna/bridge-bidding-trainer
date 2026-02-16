// Main Application Logic

// Global state
let selectedCards = [];
let currentHand = null;
let biddingSequence = null;
let saycSystem = new SAYCSystem();

// Card ranks for each suit
const ranks = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
const suitSymbols = {
    spades: '♠',
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣'
};

// Initialize the application
function init() {
    renderCardSelection();
    setupEventListeners();
}

// Render card selection UI
function renderCardSelection() {
    suits.forEach(suit => {
        const container = document.getElementById(suit);
        container.innerHTML = '';
        
        ranks.forEach(rank => {
            const card = document.createElement('div');
            card.className = 'card';
            if (suit === 'hearts' || suit === 'diamonds') {
                card.classList.add('red');
            }
            card.textContent = rank;
            card.dataset.suit = suit;
            card.dataset.rank = rank;
            
            card.addEventListener('click', () => toggleCard(suit, rank, card));
            container.appendChild(card);
        });
    });
}

// Toggle card selection
function toggleCard(suit, rank, cardElement) {
    const cardKey = `${suit}-${rank}`;
    const cardIndex = selectedCards.findIndex(c => c.suit === suit && c.rank === rank);
    
    if (cardIndex >= 0) {
        // Deselect card
        selectedCards.splice(cardIndex, 1);
        cardElement.classList.remove('selected');
    } else {
        // Select card (max 13)
        if (selectedCards.length >= 13) {
            alert('You can only select 13 cards!');
            return;
        }
        selectedCards.push({ suit, rank });
        cardElement.classList.add('selected');
    }
    
    updateCardCount();
}

// Update card count display
function updateCardCount() {
    const countElement = document.getElementById('card-count');
    countElement.textContent = `Cards Selected: ${selectedCards.length}/13`;
    
    const analyzeBtn = document.getElementById('analyze-btn');
    analyzeBtn.disabled = selectedCards.length !== 13;
}

// Clear all selected cards
function clearAllCards() {
    selectedCards = [];
    document.querySelectorAll('.card.selected').forEach(card => {
        card.classList.remove('selected');
    });
    updateCardCount();
    
    // Hide analysis and bidding sections
    document.getElementById('hand-analysis').style.display = 'none';
    document.getElementById('bidding-section').style.display = 'none';
}

// Analyze hand
function analyzeHand() {
    if (selectedCards.length !== 13) {
        alert('Please select exactly 13 cards!');
        return;
    }
    
    currentHand = new BridgeHand(selectedCards);
    displayHandAnalysis();
    initializeBidding();
}

// Display hand analysis
function displayHandAnalysis() {
    const analysisSection = document.getElementById('hand-analysis');
    analysisSection.style.display = 'block';
    
    const hcp = currentHand.calculateHCP();
    const distribution = currentHand.getDistribution();
    const distributionStr = currentHand.getDistributionString();
    const longestSuit = currentHand.getLongestSuit();
    const handType = currentHand.getHandType();
    
    document.getElementById('hcp-value').textContent = hcp;
    document.getElementById('distribution-value').textContent = 
        `${distribution.spades}-${distribution.hearts}-${distribution.diamonds}-${distribution.clubs}`;
    document.getElementById('longest-suit').textContent = 
        `${suitSymbols[longestSuit.suit]} ${longestSuit.suit} (${longestSuit.length} cards)`;
    document.getElementById('hand-type').textContent = handType;
}

// Initialize bidding
function initializeBidding() {
    biddingSequence = new BiddingSequence();
    
    const biddingSection = document.getElementById('bidding-section');
    biddingSection.style.display = 'block';
    
    // Clear bidding history
    document.getElementById('bidding-history').innerHTML = '';
    
    // Get opening bid recommendation
    const recommendation = saycSystem.getOpeningBid(currentHand);
    displayBidRecommendation(recommendation);
}

// Display bid recommendation
function displayBidRecommendation(recommendation) {
    const bidDisplay = document.getElementById('bid-recommendation');
    const bidExplanation = document.getElementById('bid-explanation');
    
    // Format bid display
    let displayBid = recommendation.bid;
    if (recommendation.bid !== 'Pass') {
        displayBid = formatBid(recommendation.bid);
    }
    
    bidDisplay.textContent = displayBid;
    bidExplanation.textContent = recommendation.explanation;
}

// Format bid with suit symbols
function formatBid(bid) {
    if (bid === 'Pass') return 'Pass';
    
    const suitMap = {
        'C': '♣',
        'D': '♦',
        'H': '♥',
        'S': '♠',
        'NT': 'NT'
    };
    
    const match = bid.match(/^(\d+)(NT|[CDHS])$/);
    if (match) {
        const level = match[1];
        const strain = match[2];
        const symbol = suitMap[strain] || strain;
        return `${level}${symbol}`;
    }
    
    return bid;
}

// Accept recommended bid
function acceptBid() {
    const bidDisplay = document.getElementById('bid-recommendation').textContent;
    const bidExplanation = document.getElementById('bid-explanation').textContent;
    
    // Convert display format back to code format
    let bidCode = unformatBid(bidDisplay);
    
    biddingSequence.addBid('North', bidCode);
    updateBiddingHistory();
    
    // Simulate partner/opponent responses
    if (!biddingSequence.isComplete()) {
        simulateOpponentsBids();
    }
}

// Unformat bid (convert symbols back to letters)
function unformatBid(displayBid) {
    if (displayBid === 'Pass') return 'Pass';
    
    const symbolMap = {
        '♣': 'C',
        '♦': 'D',
        '♥': 'H',
        '♠': 'S',
        'NT': 'NT'
    };
    
    for (let symbol in symbolMap) {
        displayBid = displayBid.replace(symbol, symbolMap[symbol]);
    }
    
    return displayBid;
}

// Simulate opponents' bids (simple logic for demo)
function simulateOpponentsBids() {
    // East passes
    biddingSequence.addBid('East', 'Pass');
    
    // South (partner) responds
    const partnerBid = getSimulatedPartnerBid();
    biddingSequence.addBid('South', partnerBid);
    
    // West passes
    biddingSequence.addBid('West', 'Pass');
    
    updateBiddingHistory();
    
    // Get recommendation for next bid
    if (!biddingSequence.isComplete()) {
        const recommendation = getNextBidRecommendation();
        displayBidRecommendation(recommendation);
    } else {
        displayFinalContract();
    }
}

// Get simulated partner bid (simplified)
function getSimulatedPartnerBid() {
    const lastBid = biddingSequence.getLastBid();
    
    if (!lastBid || lastBid.bid === 'Pass') {
        return 'Pass';
    }
    
    // Simple simulation: partner has 6-9 HCP
    // If we opened 1NT, partner might pass or invite
    if (lastBid.bid === '1NT') {
        return Math.random() > 0.5 ? 'Pass' : '2NT';
    }
    
    // If we opened a suit, partner might raise or bid NT
    const match = lastBid.bid.match(/^1(NT|[CDHS])$/);
    if (match) {
        const strain = match[1];
        if (strain === 'S' || strain === 'H') {
            // 50% chance partner has support
            if (Math.random() > 0.5) {
                return `2${strain}`;
            }
        }
        return '1NT';
    }
    
    return 'Pass';
}

// Get next bid recommendation
function getNextBidRecommendation() {
    const partnerLastBid = biddingSequence.getPartnerLastBid();
    
    if (!partnerLastBid || partnerLastBid.bid === 'Pass') {
        return {
            bid: 'Pass',
            explanation: 'Partner has passed. With no further action indicated, pass to end the auction.'
        };
    }
    
    // Get response recommendation from SAYC system
    return saycSystem.getResponse(currentHand, partnerLastBid.bid, biddingSequence);
}

// Update bidding history display
function updateBiddingHistory() {
    const historyContainer = document.getElementById('bidding-history');
    historyContainer.innerHTML = '';
    
    // Group bids into rows of 4 (one per position)
    const positions = ['North', 'East', 'South', 'West'];
    let currentRow = null;
    
    biddingSequence.bids.forEach((bidInfo, index) => {
        const posIndex = positions.indexOf(bidInfo.position);
        
        // Create new row if needed
        if (index % 4 === 0) {
            currentRow = document.createElement('div');
            currentRow.className = 'bidding-row';
            historyContainer.appendChild(currentRow);
            
            // Add empty cells for positions before the first bid
            if (index === 0) {
                for (let i = 0; i < posIndex; i++) {
                    const cell = document.createElement('div');
                    cell.className = 'bid-cell';
                    cell.textContent = '-';
                    currentRow.appendChild(cell);
                }
            }
        }
        
        const cell = document.createElement('div');
        cell.className = 'bid-cell';
        if (bidInfo.bid === 'Pass') {
            cell.classList.add('pass');
        } else {
            cell.classList.add('contract');
        }
        cell.textContent = formatBid(bidInfo.bid);
        currentRow.appendChild(cell);
    });
}

// Display final contract
function displayFinalContract() {
    const finalContract = biddingSequence.getFinalContract();
    displayBidRecommendation({
        bid: 'Pass',
        explanation: `Bidding is complete. Final contract: ${formatBid(finalContract)}`
    });
}

// Open custom bid modal
function openCustomBidModal() {
    const modal = document.getElementById('custom-bid-modal');
    modal.style.display = 'flex';
    
    renderBidOptions();
}

// Close custom bid modal
function closeCustomBidModal() {
    const modal = document.getElementById('custom-bid-modal');
    modal.style.display = 'none';
}

// Render bid options in modal
function renderBidOptions() {
    const container = document.getElementById('bid-options');
    container.innerHTML = '';
    
    // Get minimum legal bid
    const lastBid = biddingSequence.getLastBid();
    let minLevel = 1;
    let minStrain = 'C';
    
    if (lastBid && lastBid.bid !== 'Pass') {
        const parsed = parseBid(lastBid.bid);
        if (parsed && parsed.type === 'contract') {
            minLevel = parsed.level;
            minStrain = parsed.strain;
        }
    }
    
    // Add Pass option
    const passOption = document.createElement('div');
    passOption.className = 'bid-option';
    passOption.textContent = 'Pass';
    passOption.style.gridColumn = 'span 7';
    passOption.addEventListener('click', () => makeCustomBid('Pass'));
    container.appendChild(passOption);
    
    // Add contract bids
    const strains = ['C', 'D', 'H', 'S', 'NT'];
    const strainSymbols = { 'C': '♣', 'D': '♦', 'H': '♥', 'S': '♠', 'NT': 'NT' };
    
    for (let level = 1; level <= 7; level++) {
        strains.forEach(strain => {
            const bid = `${level}${strain}`;
            
            // Check if bid is legal (higher than last bid)
            const isLegal = !lastBid || lastBid.bid === 'Pass' || compareBids(bid, lastBid.bid) > 0;
            
            const option = document.createElement('div');
            option.className = 'bid-option';
            option.textContent = `${level}${strainSymbols[strain]}`;
            
            if (isLegal) {
                option.addEventListener('click', () => makeCustomBid(bid));
            } else {
                option.style.opacity = '0.3';
                option.style.cursor = 'not-allowed';
            }
            
            container.appendChild(option);
        });
    }
}

// Make custom bid
function makeCustomBid(bid) {
    closeCustomBidModal();
    
    biddingSequence.addBid('North', bid);
    updateBiddingHistory();
    
    // Continue with opponents' bids
    if (!biddingSequence.isComplete()) {
        simulateOpponentsBids();
    }
}

// Reset bidding
function resetBidding() {
    if (confirm('Reset the bidding sequence?')) {
        initializeBidding();
    }
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('clear-btn').addEventListener('click', clearAllCards);
    document.getElementById('analyze-btn').addEventListener('click', analyzeHand);
    document.getElementById('accept-bid-btn').addEventListener('click', acceptBid);
    document.getElementById('custom-bid-btn').addEventListener('click', openCustomBidModal);
    document.getElementById('reset-bidding-btn').addEventListener('click', resetBidding);
    document.getElementById('close-modal-btn').addEventListener('click', closeCustomBidModal);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
