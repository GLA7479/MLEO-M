// Script to replace all gambling-related terms across the codebase
// Run with: node replace-gambling-terms.js

const fs = require('fs');
const path = require('path');

// Define all replacements
const replacements = [
  // Basic terms
  { from: /\bBET_TYPES\b/g, to: 'PLAY_TYPES' },
  { from: /\bbetAmount\b/g, to: 'playAmount' },
  { from: /\bsetBetAmount\b/g, to: 'setPlayAmount' },
  { from: /\bselectedBet\b/g, to: 'selectedPlay' },
  { from: /\bsetSelectedBet\b/g, to: 'setSelectedPlay' },
  { from: /\bisEditingBet\b/g, to: 'isEditingPlay' },
  { from: /\bsetIsEditingBet\b/g, to: 'setIsEditingPlay' },
  { from: /\bformatBetDisplay\b/g, to: 'formatPlayDisplay' },
  { from: /\bMIN_BET\b/g, to: 'MIN_PLAY' },
  { from: /\btotalBet\b/g, to: 'totalPlay' },
  { from: /\blastBet\b/g, to: 'lastPlay' },
  
  // Payout -> Prize
  { from: /\bpayout\b/g, to: 'prize' },
  { from: /\bPayout\b/g, to: 'Prize' },
  { from: /\bPAYOUT\b/g, to: 'PRIZE' },
  { from: /\bPAYOUTS\b/g, to: 'PRIZES' },
  { from: /\bpayouts\b/g, to: 'prizes' },
  { from: /\bpayout_amount\b/g, to: 'prize_amount' },
  { from: /\bpayout_multiplier\b/g, to: 'prize_multiplier' },
  
  // Bet -> Play (in text/UI)
  { from: /"Bet"/g, to: '"Play"' },
  { from: /'Bet'/g, to: "'Play'" },
  { from: /\bBet\b/g, to: 'Play' },
  { from: /\bbet\b/g, to: 'play' },
  { from: /\bBET\b/g, to: 'PLAY' },
  { from: /\bbetting\b/g, to: 'playing' },
  { from: /\bBetting\b/g, to: 'Playing' },
  { from: /\bBETTING\b/g, to: 'PLAYING' },
  { from: /\bbets\b/g, to: 'plays' },
  { from: /\bBets\b/g, to: 'Plays' },
  { from: /\bBETS\b/g, to: 'PLAYS' },
  
  // Bet type -> Play type
  { from: /\bbetType\b/g, to: 'playType' },
  { from: /\bbetData\b/g, to: 'playData' },
  
  // Jackpot -> Grand Prize
  { from: /\bjackpot\b/g, to: 'grandPrize' },
  { from: /\bJackpot\b/g, to: 'GrandPrize' },
  { from: /\bJACKPOT\b/g, to: 'GRAND_PRIZE' },
  { from: /\bjackpots\b/g, to: 'grandPrizes' },
  { from: /\bJackpots\b/g, to: 'GrandPrizes' },
  { from: /\bJACKPOTS\b/g, to: 'GRAND_PRIZES' },
  
  // Casino -> Arcade/Gaming
  { from: /\bcasino\b/g, to: 'arcade' },
  { from: /\bCasino\b/g, to: 'Arcade' },
  { from: /\bCASINO\b/g, to: 'ARCADE' },
  { from: /Casino Hub/g, to: 'Gaming Hub' },
  { from: /casino wheel/g, to: 'wheel' },
  { from: /casino dice/g, to: 'dice' },
  { from: /Casino-Style/g, to: 'Arcade' },
  
  // Dealer -> Opponent (in UI text only, keep in code logic)
  { from: /Beat the dealer/g, to: 'Beat the opponent' },
  { from: /vs dealer/g, to: 'vs opponent' },
  { from: /vs Dealer/g, to: 'vs Opponent' },
  { from: /DEALER WINS/g, to: 'OPPONENT WINS' },
  { from: /Dealer shows/g, to: 'Opponent shows' },
  { from: /Dealer has/g, to: 'Opponent has' },
  { from: /Dealer hits/g, to: 'Opponent hits' },
  
  // Stake -> Entry
  { from: /\bstake\b/g, to: 'entry' },
  { from: /\bStake\b/g, to: 'Entry' },
  { from: /\bSTAKE\b/g, to: 'ENTRY' },
  { from: /\bstaking\b/g, to: 'entry' },
  
  // Wager -> Play
  { from: /\bwager\b/g, to: 'play' },
  { from: /\bWager\b/g, to: 'Play' },
  { from: /\bWAGER\b/g, to: 'PLAY' },
  { from: /\bwagering\b/g, to: 'playing' },
  
  // Gambling -> Gaming
  { from: /\bgambling\b/g, to: 'gaming' },
  { from: /\bGambling\b/g, to: 'Gaming' },
  { from: /\bGAMBLING\b/g, to: 'GAMING' },
  
  // House -> Platform/Game
  { from: /\bhouse edge\b/g, to: 'game balance' },
  { from: /\bHouse edge\b/g, to: 'Game balance' },
  { from: /\bHOUSE_EDGE\b/g, to: 'GAME_BALANCE' },
  { from: /\bhouseCut\b/g, to: 'platformCut' },
  { from: /\bhouse\b/g, to: 'platform' },
  { from: /\bHouse\b/g, to: 'Platform' },
  
  // Pot -> Prize Pool
  { from: /\bpot\b/g, to: 'prizePool' },
  { from: /\bPot\b/g, to: 'Prize Pool' },
  { from: /\bPOT\b/g, to: 'PRIZE_POOL' },
  { from: /wins the pot/g, to: 'wins the prize pool' },
  
  // Buy-in -> Entry fee
  { from: /\bbuy-in\b/g, to: 'entry fee' },
  { from: /\bbuyin\b/g, to: 'entryFee' },
  { from: /\bBuyIn\b/g, to: 'EntryFee' },
  { from: /\bBUYIN\b/g, to: 'ENTRY_FEE' },
  { from: /\bBUYIN_PER_MATCH\b/g, to: 'ENTRY_PER_MATCH' },
  
  // Text replacements
  { from: /Place Bet/g, to: 'Start Play' },
  { from: /place bet/g, to: 'start play' },
  { from: /Minimum bet/g, to: 'Minimum play' },
  { from: /minimum bet/g, to: 'minimum play' },
  { from: /Bet on/g, to: 'Choose' },
  { from: /bet on/g, to: 'choose' },
  { from: /Betting rounds/g, to: 'Play rounds' },
  { from: /betting options/g, to: 'play options' },
  { from: /betting phase/g, to: 'playing phase' },
  { from: /betting stage/g, to: 'playing stage' },
  { from: /betting time/g, to: 'playing time' },
  { from: /Current bet/g, to: 'Current play' },
  { from: /current bet/g, to: 'current play' },
  { from: /Select Bet/g, to: 'Select Play' },
  { from: /Bet Types/g, to: 'Play Types' },
  { from: /Bet types/g, to: 'Play types' },
  { from: /Insurance bet/g, to: 'Insurance play' },
  { from: /insurance_bet/g, to: 'insurance_play' },
  { from: /Failed to place bet/g, to: 'Failed to start play' },
  { from: /Find the jackpot/g, to: 'Find the grand prize' },
  { from: /Find the jackpot!/g, to: 'Find the grand prize!' },
  { from: /×40 Jackpot!/g, to: '×40 Grand Prize!' },
  { from: /Ultra rare jackpot/g, to: 'Ultra rare grand prize' },
  { from: /Instant payout/g, to: 'Instant prize' },
  { from: /Payout:/g, to: 'Prize:' },
  { from: /Payout cap/g, to: 'Prize cap' },
  { from: /Blind Bonus Payouts/g, to: 'Blind Bonus Prizes' },
  { from: /Hand Prizes/g, to: 'Hand Rewards' },
  { from: /Total Bet/g, to: 'Total Play' },
  { from: /Reset to minimum bet/g, to: 'Reset to minimum play' },
];

// Files to process (excluding node_modules, .git, etc.)
const directoriesToProcess = [
  'game',
  'games-online',
  'pages',
  'lib',
  'sql',
  'migrations'
];

// Also process backup directories
const backupDirectories = [
  'game/גיבויים-לא פעילים'
];

const filesToSkip = [
  'node_modules',
  '.git',
  '.next',
  'replace-gambling-terms.js'
];

function shouldProcessFile(filePath) {
  const ext = path.extname(filePath);
  return ['.js', '.jsx', '.ts', '.tsx', '.sql'].includes(ext);
}

function shouldSkipDirectory(dirName) {
  return filesToSkip.some(skip => dirName.includes(skip));
}

function processFile(filePath) {
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

function walkDirectory(dir, baseDir = '') {
  const fullPath = path.join(baseDir, dir);
  if (!fs.existsSync(fullPath)) {
    return;
  }
  
  const entries = fs.readdirSync(fullPath);
  
  entries.forEach(entry => {
    const entryPath = path.join(fullPath, entry);
    const stat = fs.statSync(entryPath);
    
    if (stat.isDirectory()) {
      if (!shouldSkipDirectory(entry)) {
        walkDirectory(entry, baseDir);
      }
    } else if (stat.isFile() && shouldProcessFile(entryPath)) {
      processFile(entryPath);
    }
  });
}

// Main execution
console.log('Starting replacement of gambling-related terms...\n');

directoriesToProcess.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`Processing directory: ${dir}`);
    walkDirectory(dir);
    console.log('');
  } else {
    console.log(`Directory not found: ${dir}`);
  }
});

// Process backup directories
backupDirectories.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`Processing backup directory: ${dir}`);
    walkDirectory(dir);
    console.log('');
  }
});

console.log('Replacement complete!');
