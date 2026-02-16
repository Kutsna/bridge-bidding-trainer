# Bridge Bidding Trainer (BBT)

A web-based bridge bidding trainer that helps players learn and practice the SAYC (Standard American Yellow Card) bidding system.

## Features

- **Interactive Card Selection**: Select your 13-card hand using an intuitive visual interface
- **Hand Analysis**: Automatic calculation of:
  - High Card Points (HCP)
  - Distribution pattern
  - Hand type (Balanced/Semi-Balanced/Unbalanced)
  - Longest suit
- **SAYC Bidding System**: Comprehensive implementation of SAYC bidding rules
- **Intelligent Bid Recommendations**: Get expert advice on what to bid based on your cards
- **Interactive Bidding Sequence**: Simulate a complete bidding auction with partner and opponents
- **Detailed Explanations**: Learn why each bid is recommended with clear explanations

## How to Use

1. **Open the Application**: Open `index.html` in any modern web browser
2. **Select Your Cards**: Click on 13 cards to represent your hand
   - Cards are organized by suit: ♠ Spades, ♥ Hearts, ♦ Diamonds, ♣ Clubs
   - Selected cards are highlighted
3. **Analyze Your Hand**: Click "Analyze Hand" to see hand evaluation and bidding advice
4. **Follow Bidding Recommendations**: 
   - The system will recommend an opening bid based on SAYC rules
   - Accept the recommendation or choose a different bid
   - See partner and opponent responses
   - Continue the bidding sequence
5. **Learn as You Go**: Read the explanations for each recommended bid to understand the reasoning

## SAYC Bidding System

The application implements key SAYC conventions:

### Opening Bids
- **1NT**: 15-17 HCP, balanced hand
- **1♥/1♠**: 12+ HCP, 5+ card major
- **1♣/1♦**: 12+ HCP, no 5-card major, bid longer minor
- **2NT**: 20-21 HCP, balanced hand
- **2♣**: 22+ HCP, strong forcing

### Responses
- Support partner's major with 3+ cards
- Bid 4-card majors up the line over minor suit openings
- Use invitational and game-forcing bids based on HCP

## File Structure

```
bridge-bidding-trainer/
├── index.html          # Main HTML structure
├── styles.css          # Styling and layout
├── bridge-logic.js     # Core bridge hand evaluation logic
├── sayc-system.js      # SAYC bidding system implementation
├── app.js              # Main application logic and UI interactions
└── README.md           # This file
```

## Technical Details

- **Pure JavaScript**: No external dependencies required
- **Responsive Design**: Works on desktop and mobile devices
- **Modern Browser Support**: Requires ES6+ support

## Future Enhancements

- Image recognition for capturing physical cards (camera/upload)
- Additional bidding systems (2/1, Precision, etc.)
- AI-powered bidding recommendations
- Bidding quiz mode
- Hand history and statistics
- Multi-player mode

## Development

To modify or extend the application:

1. **bridge-logic.js**: Contains the `BridgeHand` class for hand evaluation and `BiddingSequence` for tracking bids
2. **sayc-system.js**: Contains the `SAYCSystem` class with bidding rules and recommendations
3. **app.js**: Contains UI logic and event handlers
4. **styles.css**: Modify for visual customization

## License

This project is open source and available for educational purposes.