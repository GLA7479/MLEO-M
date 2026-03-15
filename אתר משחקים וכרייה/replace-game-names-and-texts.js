// Script to replace game names and gambling-related texts
// Run with: node replace-game-names-and-texts.js

const fs = require('fs');
const path = require('path');

// Define all replacements for texts
const textReplacements = [
  // General gambling terms
  { from: /win big/g, to: 'unlock bigger rewards' },
  { from: /Win big/g, to: 'Unlock bigger rewards' },
  { from: /win MLEO tokens/g, to: 'collect in-app MLEO rewards' },
  { from: /Win MLEO tokens/g, to: 'Collect in-app MLEO rewards' },
  { from: /winnings/g, to: 'rewards' },
  { from: /Winnings/g, to: 'Rewards' },
  { from: /WINNINGS/g, to: 'REWARDS' },
  { from: /all winnings/g, to: 'all rewards' },
  { from: /All winnings/g, to: 'All rewards' },
  { from: /free play wins/g, to: 'free play rewards' },
  { from: /Free play wins/g, to: 'Free play rewards' },
  { from: /game wins/g, to: 'game rewards' },
  { from: /regular game wins/g, to: 'standard session rewards' },
  { from: /prizes/g, to: 'rewards' },
  { from: /Prizes/g, to: 'Rewards' },
  { from: /PRIZES/g, to: 'REWARDS' },
  { from: /prize details/g, to: 'reward structure' },
  { from: /prize/g, to: 'reward' },
  { from: /Prize/g, to: 'Reward' },
  { from: /jackpot/g, to: 'rare bonus' },
  { from: /Jackpot/g, to: 'Rare bonus' },
  { from: /JACKPOT/g, to: 'RARE BONUS' },
  { from: /grand prize/g, to: 'top reward tier' },
  { from: /Grand prize/g, to: 'Top reward tier' },
  { from: /grand prizes/g, to: 'top reward tiers' },
  { from: /good luck/g, to: 'enjoy the challenge' },
  { from: /Good luck/g, to: 'Enjoy the challenge' },
  { from: /risk-free/g, to: 'free to explore' },
  { from: /risk free/g, to: 'free to explore' },
  { from: /real stakes/g, to: 'live session play' },
  { from: /real stakes\./g, to: 'live session play.' },
  { from: /cash out/g, to: 'lock in result' },
  { from: /Cash out/g, to: 'Lock in result' },
  { from: /cash out before/g, to: 'lock in your result before' },
  { from: /Cash out before/g, to: 'Lock in your result before' },
  
  // Specific phrases
  { from: /Cost per Round/g, to: 'Session Cost' },
  { from: /cost per round/g, to: 'session cost' },
  { from: /Max Win/g, to: 'Top Reward Tier' },
  { from: /max win/g, to: 'top reward tier' },
  { from: /Each round costs/g, to: 'Each session uses' },
  { from: /each round costs/g, to: 'each session uses' },
  { from: /per round/g, to: 'per session' },
  { from: /per play/g, to: 'per session' },
  { from: /Win multipliers and prizes/g, to: 'Complete runs, reach milestones, and collect reward boosts' },
  { from: /win multipliers and prizes/g, to: 'complete runs, reach milestones, and collect reward boosts' },
  { from: /based on the game outcome/g, to: 'based on your results' },
  { from: /based on your play amount/g, to: 'depending on the selected mode' },
  { from: /Earn 1 free play token/g, to: 'Receive 1 free play token' },
  { from: /earn 1 free play token/g, to: 'receive 1 free play token' },
  { from: /max 5 tokens/g, to: 'up to 5 stored' },
  { from: /without spending MLEO/g, to: 'without using vault MLEO' },
  { from: /Minimum Play:/g, to: 'Session Cost:' },
  { from: /minimum play amount/g, to: 'session cost' },
  { from: /higher play amounts/g, to: 'different session costs' },
  { from: /MLEO is deducted from your vault/g, to: 'MLEO is taken from your in-app vault' },
  { from: /when you play/g, to: 'when you start a session' },
  { from: /not for free plays/g, to: 'free play sessions do not use vault MLEO' },
  { from: /All winnings are automatically added/g, to: 'Session rewards are added automatically' },
  { from: /all winnings are automatically added/g, to: 'session rewards are added automatically' },
  { from: /including free play wins/g, to: 'including rewards earned from free play sessions' },
  { from: /learn how to play and see prize details/g, to: 'view the rules, controls, and reward structure' },
  { from: /Fair Play:/g, to: 'Game Logic:' },
  { from: /All games use random number generation/g, to: 'Some games use randomized events, while others focus on timing, reaction, memory, or decision-making' },
  { from: /for fair outcomes/g, to: '' },
  { from: /total plays, wins, biggest win/g, to: 'activity, completed sessions, best score, streaks, and progress milestones' },
  { from: /These are mini-games for entertainment/g, to: 'These arcade mini-games are designed for entertainment, progression, and in-app rewards' },
  { from: /The game balance is set to provide fair gameplay/g, to: 'MLEO used here is earned inside the platform and stored in your in-app vault' },
  { from: /you're using in-game MLEO tokens/g, to: 'Focus on fun, strategy, timing, and progression' },
  { from: /that you've earned from the main games/g, to: 'as you explore different game modes' },
  { from: /Have fun and good luck!/g, to: '' },
  { from: /Win Arcade Games/g, to: 'Arcade Rewards' },
  { from: /All winnings from arcade games/g, to: 'All rewards earned in arcade sessions' },
  { from: /Free Play Wins/g, to: 'Free Play Rewards' },
  { from: /Even free play games can win MLEO tokens/g, to: 'Free play sessions can also add MLEO rewards' },
  { from: /Your vault is the same across/g, to: 'Your vault is shared across' },
  { from: /earn more tokens for arcade games/g, to: 'build more balance for arcade sessions' },
  { from: /No need to be online!/g, to: 'No need to stay online.' },
  { from: /Each free play token is worth 1,000 MLEO and can be used on any arcade game/g, to: 'Each free play token can be used to start one arcade session without using vault MLEO' },
  { from: /Free play wins are added to your vault just like regular game wins!/g, to: 'Rewards from free play sessions are added to your vault just like standard session rewards.' },
  { from: /try new games risk-free/g, to: 'explore new games' },
  { from: /and build your vault!/g, to: 'and build your vault through regular play.' },
];

// Game name replacements
const gameNameReplacements = [
  // In pages/arcade.js
  { file: 'pages/arcade.js', from: /title: "Blackjack"/g, to: 'title: "21 Challenge"' },
  { file: 'pages/arcade.js', from: /title: "Poker"/g, to: 'title: "Card Arena"' },
  { file: 'pages/arcade.js', from: /title: "Three Card Poker"/g, to: 'title: "Triple Cards"' },
  { file: 'pages/arcade.js', from: /title: "Ultimate Poker"/g, to: 'title: "Ultimate Cards"' },
  { file: 'pages/arcade.js', from: /title: "Texas Hold'em Rooms"/g, to: 'title: "Card Rooms"' },
  { file: 'pages/arcade.js', from: /title: "Roulette"/g, to: 'title: "Color Wheel"' },
  { file: 'pages/arcade.js', from: /title: "Slots Upgraded"/g, to: 'title: "Symbol Match"' },
  { file: 'pages/arcade.js', from: /title: "Mega Wheel"/g, to: 'title: "Mega Spin Board"' },
  { file: 'pages/arcade.js', from: /title: "Keno"/g, to: 'title: "Number Hunt"' },
  { file: 'pages/arcade.js', from: /title: "Craps"/g, to: 'title: "Dice Arena"' },
  { file: 'pages/arcade.js', from: /title: "Baccarat"/g, to: 'title: "Card Duel"' },
  { file: 'pages/arcade.js', from: /title: "Coin Flip"/g, to: 'title: "Quick Flip"' },
  { file: 'pages/arcade.js', from: /title: "Crash"/g, to: 'title: "Sky Run"' },
  { file: 'pages/arcade.js', from: /title: "Crash2"/g, to: 'title: "Sky Run X"' },
  { file: 'pages/arcade.js', from: /title: "Plinko"/g, to: 'title: "Drop Run"' },
  { file: 'pages/arcade.js', from: /title: "Plinko2"/g, to: 'title: "Drop Run X"' },
  { file: 'pages/arcade.js', from: /title: "Sic Bo"/g, to: 'title: "Triple Dice"' },
  { file: 'pages/arcade.js', from: /title: "Limbo"/g, to: 'title: "Limit Run"' },
  { file: 'pages/arcade.js', from: /title: "Dice Over\/Under"/g, to: 'title: "Dice Pick"' },
  { file: 'pages/arcade.js', from: /title: "Horse Racing"/g, to: 'title: "Speed Track"' },
  { file: 'pages/arcade.js', from: /title: "Lucky Chamber"/g, to: 'title: "Mystery Chamber"' },
  
  // In pages/arcade-online.js
  { file: 'pages/arcade-online.js', from: /title: "Roulette"/g, to: 'title: "Color Wheel"' },
  { file: 'pages/arcade-online.js', from: /title: "Blackjack"/g, to: 'title: "21 Challenge"' },
  { file: 'pages/arcade-online.js', from: /title: "Texas Hold'em"/g, to: 'title: "Card Arena"' },
  { file: 'pages/arcade-online.js', from: /title: "Poker Tables"/g, to: 'title: "Card Strategy Tables"' },
];

// Game description replacements
const gameDescriptionReplacements = [
  // pages/arcade.js descriptions
  { file: 'pages/arcade.js', from: /description: "Drop the ball through pegs! Land on high multipliers for massive wins!"/g, to: 'description: "Drop the ball through pegs and aim for high-value reward zones."' },
  { file: 'pages/arcade.js', from: /description: "Watch the multiplier grow! Cash out before it crashes to win big!"/g, to: 'description: "Watch the boost meter rise and lock in your result before the run ends."' },
  { file: 'pages/arcade.js', from: /description: "Beat the opponent to 21! Classic card game with emoji cards\."/g, to: 'description: "Reach 21 with smart card decisions in this fast card challenge."' },
  { file: 'pages/arcade.js', from: /description: "Texas Hold'em poker! Use your 2 cards \+ 5 community cards to make the best hand\."/g, to: 'description: "Build the strongest hand using your cards and the shared board."' },
  { file: 'pages/arcade.js', from: /description: "Fast poker! 3 cards vs opponent - best hand wins with instant results\."/g, to: 'description: "Fast three-card challenge with quick round results."' },
  { file: 'pages/arcade.js', from: /description: "Texas Hold'em strategy! Raise 4X, 2X, or 1X at different stages\. Beat the opponent!"/g, to: 'description: "A strategy-focused card mode with staged decisions and stronger reward tiers."' },
  { file: 'pages/arcade.js', from: /description: "Join permanent poker tables! Drop-in\/drop-out multiplayer with real stakes\. Play anytime!"/g, to: 'description: "Join live multiplayer card tables with drop-in/drop-out play and session-based progression."' },
  { file: 'pages/arcade.js', from: /description: "Choose 1 box from 10! Find the grand prize or walk away empty!"/g, to: 'description: "Choose 1 box from 10 and uncover a surprise reward tier."' },
  { file: 'pages/arcade.js', from: /description: "6 chambers, 1 danger! Pick wisely and cash out before it's too late!"/g, to: 'description: "Choose your path through 6 chambers and secure your progress before the danger appears."' },
  { file: 'pages/arcade.js', from: /description: "Choose your favorite horse! Watch them race and win big!"/g, to: 'description: "Pick your racer and follow the track to see how your choice performs."' },
  { file: 'pages/arcade.js', from: /description: "Ancient Chinese dice game! Choose totals, triples, and more!"/g, to: 'description: "A fast dice challenge based on totals, patterns, and bonus outcomes."' },
  { file: 'pages/arcade.js', from: /description: "Set your target multiplier and roll! Higher risk = bigger rewards!"/g, to: 'description: "Set your target boost and see whether your run reaches it."' },
  { file: 'pages/arcade.js', from: /description: "Over or Under! Slide your target and roll - ultimate control!"/g, to: 'description: "Choose your target range and roll for a result-based reward tier."' },
  { file: 'pages/arcade.js', from: /description: "Spin the wheel and win big! Classic wheel game with multiple play options\."/g, to: 'description: "Spin the wheel and land on color-based reward zones with different outcomes."' },
  { file: 'pages/arcade.js', from: /description: "5-reel mega slots! Match symbols for huge wins - 💎×500 grand prize!"/g, to: 'description: "Match symbols across 5 reels to unlock bonus reward patterns."' },
  { file: 'pages/arcade.js', from: /description: "40 segments of fortune! Spin for prizes up to ×8 grand prize!"/g, to: 'description: "Spin across 40 segments and land on different reward tiers and bonus events."' },
  { file: 'pages/arcade.js', from: /description: "Classic lottery! Pick 1-10 numbers - match them all for ×1000!"/g, to: 'description: "Choose your numbers and track how many matches you hit in each round."' },
  { file: 'pages/arcade.js', from: /description: "Roll the dice and win big! Classic dice game with multiple play options\."/g, to: 'description: "Roll the dice through different outcome zones and unlock score-based rewards."' },
  { file: 'pages/arcade.js', from: /description: "Choose Player, Banker, or Tie! Classic card game with simple rules\."/g, to: 'description: "Choose between card sides and follow the result in a fast head-to-head round."' },
  { file: 'pages/arcade.js', from: /description: "Choose Heads or Tails! Simple 50\/50 chance with instant results and big wins!"/g, to: 'description: "Choose a side and reveal the result in a quick one-tap challenge."' },
  { file: 'pages/arcade.js', from: /description: "Watch the multiplier grow! Cash out before it crashes to win your play amount times the multiplier!"/g, to: 'description: "Track the live boost curve and lock in your result before the run ends."' },
  { file: 'pages/arcade.js', from: /description: "Enhanced Plinko with 17 rows, wall penalty, and maximized play area!"/g, to: 'description: "Enhanced Drop Run with 17 rows, wall penalty, and maximized play area!"' },
  
  // pages/arcade-online.js descriptions
  { file: 'pages/arcade-online.js', from: /description: "European Roulette! Spin the wheel and win big!"/g, to: 'description: "Spin the wheel in a live multiplayer room and land on different reward zones."' },
  { file: 'pages/arcade-online.js', from: /description: "Beat the opponent to 21! Multiplayer blackjack with friends\."/g, to: 'description: "A live multiplayer 21 card challenge with room-based play."' },
  { file: 'pages/arcade-online.js', from: /description: "Texas Hold'em poker! Multiplayer poker with friends\."/g, to: 'description: "A live multiplayer card room built around hand strategy and table play."' },
  { file: 'pages/arcade-online.js', from: /description: "Texas Hold'em vs Opponent! Strategic play rounds - PRE-FLOP, FLOP, TURN, RIVER\. Best hand wins the prize pool!"/g, to: 'description: "Card Strategy vs Opponent! Strategic play rounds - PRE-FLOP, FLOP, TURN, RIVER. Best hand wins the prize pool!"' },
  { file: 'pages/arcade-online.js', from: /description: "Bingo like Ludo! Online multiplayer \(2-8 players\) or local play\. Win prizes for rows and full board!"/g, to: 'description: "Bingo like Ludo! Online multiplayer (2-8 players) or local play. Earn rewards for rows and full board!"' },
];

// Prize field replacements
const prizeReplacements = [
  { file: 'pages/arcade.js', from: /prize: "×/g, to: 'prize: "Top Tier ×' },
  { file: 'pages/arcade.js', from: /prize: "Unlimited"/g, to: 'prize: "Dynamic"' },
];

function processFile(filePath, replacements) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠ File not found: ${filePath}`);
    return false;
  }
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    replacements.forEach(({ from, to }) => {
      if (from.test(content)) {
        content = content.replace(from, to);
        modified = true;
      }
    });
    
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✓ Updated: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`✗ Error processing ${filePath}:`, error.message);
    return false;
  }
}

// Main execution
console.log('Starting replacement of game names and texts...\n');

// Process text replacements in all files
const filesToProcess = [
  'pages/arcade.js',
  'pages/arcade-online.js',
  'pages/mining.js'
];

filesToProcess.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`Processing text replacements in: ${file}`);
    processFile(file, textReplacements);
  }
});

console.log('');

// Process game name replacements
console.log('Processing game name replacements...');
const gameNameFiles = [...new Set(gameNameReplacements.map(r => r.file))];
gameNameFiles.forEach(file => {
  const replacements = gameNameReplacements.filter(r => r.file === file);
  if (fs.existsSync(file)) {
    console.log(`Processing: ${file}`);
    processFile(file, replacements);
  }
});

console.log('');

// Process game description replacements
console.log('Processing game description replacements...');
const descFiles = [...new Set(gameDescriptionReplacements.map(r => r.file))];
descFiles.forEach(file => {
  const replacements = gameDescriptionReplacements.filter(r => r.file === file);
  if (fs.existsSync(file)) {
    console.log(`Processing: ${file}`);
    processFile(file, replacements);
  }
});

console.log('');

// Process prize replacements
console.log('Processing prize field replacements...');
const prizeFiles = [...new Set(prizeReplacements.map(r => r.file))];
prizeFiles.forEach(file => {
  const replacements = prizeReplacements.filter(r => r.file === file);
  if (fs.existsSync(file)) {
    console.log(`Processing: ${file}`);
    processFile(file, replacements);
  }
});

console.log('\nReplacement complete!');
