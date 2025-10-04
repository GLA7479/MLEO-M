// pages/api/game-pool-data.js
const { ethers } = require('ethers');

const GAMECLAIM_ADDRESS = "0x92AAcb8dDb86b864977c5546b09350ee929caF96";

const GAMECLAIM_ABI = [
  "function globalCap() view returns(uint256)",
  "function globalClaimed() view returns(uint256)", 
  "function dailyUserCap() view returns(uint256)",
  "function paused() view returns(bool)"
];

export default async function handler(req, res) {
  try {
    // For now, return mock data until contract is properly deployed
    // TODO: Replace with actual contract calls when contract is available
    
    console.log('Returning mock data for testing...');
    
    const data = {
      globalCap: "200000000000", // 200B MLEO
      globalClaimed: "1250000000", // 1.25B MLEO claimed
      dailyUserCap: "1000", // 1000 MLEO daily cap per user
      remaining: "198750000000", // Remaining in pool
      percentageClaimed: "0.63", // 0.63% claimed
      paused: false
    };
    
    console.log('Mock data:', data);
    res.status(200).json(data);
  } catch (error) {
    console.error('API Error:', error);
    
    res.status(500).json({ 
      error: 'Failed to load contract data',
      details: error.message
    });
  }
}