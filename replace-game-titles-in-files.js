// Script to replace game titles in game files themselves
// Run with: node replace-game-titles-in-files.js

const fs = require('fs');
const path = require('path');

// Game title replacements in game files
const gameTitleReplacements = [
  // Ultimate Poker
  { file: 'game/arcade/ultimate-cards.js', from: /Ultimate Texas Hold'em/g, to: 'Ultimate Cards' },
  { file: 'game/arcade/ultimate-cards.js', from: /Strategic poker against the opponent!/g, to: 'A strategy-focused card mode with staged decisions and stronger reward tiers.' },
  
  // Chamber
  { file: 'game/mleo-chamber.js', from: /Lucky Chamber/g, to: 'Mystery Chamber' },
  { file: 'game/mleo-chamber.js', from: /Cash out before boom!/g, to: 'Secure your progress before the danger appears!' },
  
  // Plinko v1
  { file: 'game/mleo-plinko-v1.js', from: /MLEO Plinko2/g, to: 'MLEO Drop Run X' },
  { file: 'game/mleo-plinko-v1.js', from: /MLEO Plinko/g, to: 'MLEO Drop Run' },
  { file: 'game/mleo-plinko-v1.js', from: /good luck!/g, to: 'enjoy the challenge!' },
  
  // Plinko v2 - check if it has title
  { file: 'game/mleo-plinko-v2.js', from: /MLEO Plinko2/g, to: 'MLEO Drop Run X' },
  { file: 'game/mleo-plinko-v2.js', from: /MLEO Plinko/g, to: 'MLEO Drop Run' },
  
  // Crash v1
  { file: 'game/mleo-crash-v1.js', from: /MLEO Crash/g, to: 'MLEO Sky Run' },
  
  // Crash v2
  { file: 'game/mleo-crash-v2.js', from: /MLEO Crash2/g, to: 'MLEO Sky Run X' },
  { file: 'game/mleo-crash-v2.js', from: /MLEO Crash/g, to: 'MLEO Sky Run' },
  
  // Blackjack
  { file: 'game/arcade/challenge-21.js', from: /MLEO Blackjack/g, to: 'MLEO 21 Challenge' },
  
  // Poker
  { file: 'game/arcade/card-arena.js', from: /MLEO Poker/g, to: 'MLEO Card Arena' },
  { file: 'game/arcade/card-arena.js', from: /Texas Hold'em/g, to: 'Card Arena' },
  
  // Three Card Poker
  { file: 'game/arcade/triple-cards.js', from: /MLEO Three Card Poker/g, to: 'MLEO Triple Cards' },
  { file: 'game/arcade/triple-cards.js', from: /Three Card Poker/g, to: 'Triple Cards' },
  
  // Roulette
  { file: 'game/arcade/color-wheel.js', from: /MLEO Roulette/g, to: 'MLEO Color Wheel' },
  { file: 'game/arcade/color-wheel.js', from: /Roulette/g, to: 'Color Wheel' },
  
  // Slots
  { file: 'game/arcade/symbol-match.js', from: /MLEO Slots Upgraded/g, to: 'MLEO Symbol Match' },
  { file: 'game/arcade/symbol-match.js', from: /Slots Upgraded/g, to: 'Symbol Match' },
  
  // Mega Wheel
  { file: 'game/mleo-mega-wheel.js', from: /MLEO Mega Wheel/g, to: 'MLEO Mega Spin Board' },
  { file: 'game/mleo-mega-wheel.js', from: /Mega Wheel/g, to: 'Mega Spin Board' },
  
  // Keno
  { file: 'game/mleo-keno.js', from: /MLEO Keno/g, to: 'MLEO Number Hunt' },
  { file: 'game/mleo-keno.js', from: /Keno/g, to: 'Number Hunt' },
  
  // Craps
  { file: 'game/arcade/dice-arena.js', from: /MLEO Craps/g, to: 'MLEO Dice Arena' },
  { file: 'game/arcade/dice-arena.js', from: /Craps/g, to: 'Dice Arena' },
  
  // Baccarat
  { file: 'game/arcade/card-duel.js', from: /MLEO Baccarat/g, to: 'MLEO Card Duel' },
  { file: 'game/arcade/card-duel.js', from: /Baccarat/g, to: 'Card Duel' },
  
  // Sic Bo
  { file: 'game/arcade/triple-dice.js', from: /MLEO Sic Bo/g, to: 'MLEO Triple Dice' },
  { file: 'game/arcade/triple-dice.js', from: /Sic Bo/g, to: 'Triple Dice' },
  
  // Limbo
  { file: 'game/mleo-limbo.js', from: /MLEO Limbo/g, to: 'MLEO Limit Run' },
  { file: 'game/mleo-limbo.js', from: /Limbo/g, to: 'Limit Run' },
  
  // Dice
  { file: 'game/mleo-dice.js', from: /MLEO Dice Over\/Under/g, to: 'MLEO Dice Pick' },
  { file: 'game/mleo-dice.js', from: /Dice Over\/Under/g, to: 'Dice Pick' },
  
  // Horse Racing
  { file: 'game/mleo-horse.js', from: /MLEO Horse Racing/g, to: 'MLEO Speed Track' },
  { file: 'game/mleo-horse.js', from: /Horse Racing/g, to: 'Speed Track' },
  
  // Coin Flip
  { file: 'game/mleo-coin-flip.js', from: /MLEO Coin Flip/g, to: 'MLEO Quick Flip' },
  { file: 'game/mleo-coin-flip.js', from: /Coin Flip/g, to: 'Quick Flip' },
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
console.log('Starting replacement of game titles in game files...\n');

// Process game title replacements
const gameFiles = [...new Set(gameTitleReplacements.map(r => r.file))];
gameFiles.forEach(file => {
  const replacements = gameTitleReplacements.filter(r => r.file === file);
  if (fs.existsSync(file)) {
    console.log(`Processing: ${file}`);
    processFile(file, replacements);
  }
});

console.log('\nReplacement complete!');
