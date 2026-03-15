// pages/api/game-pool-data.js
import { createPublicClient, http, formatEther } from 'viem';
import { bscTestnet } from 'viem/chains';

// MLEOGameClaimV3 Contract ABI (minimal)
const GAME_CLAIM_ABI = [
  {
    type: "function",
    name: "globalCap",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function", 
    name: "globalClaimed",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "dailyUserCap", 
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }]
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view", 
    inputs: [],
    outputs: [{ type: "bool" }]
  }
];

// Contract address from deployed contracts
const GAME_CLAIM_ADDRESS = "0xC19AA307ed110F416dA458b4687a606ffbaCc1D0";

export default async function handler(req, res) {
  try {
    console.log('Fetching real contract data from:', GAME_CLAIM_ADDRESS);
    
    // Create public client for BSC Testnet
    const publicClient = createPublicClient({
      chain: bscTestnet,
      transport: http(process.env.NEXT_PUBLIC_BSC_TESTNET_RPC || "https://bsc-testnet.publicnode.com")
    });

    // Fetch contract data
    const [globalCap, globalClaimed, dailyUserCap, paused] = await Promise.all([
      publicClient.readContract({
        address: GAME_CLAIM_ADDRESS,
        abi: GAME_CLAIM_ABI,
        functionName: 'globalCap'
      }),
      publicClient.readContract({
        address: GAME_CLAIM_ADDRESS,
        abi: GAME_CLAIM_ABI,
        functionName: 'globalClaimed'
      }),
      publicClient.readContract({
        address: GAME_CLAIM_ADDRESS,
        abi: GAME_CLAIM_ABI,
        functionName: 'dailyUserCap'
      }),
      publicClient.readContract({
        address: GAME_CLAIM_ADDRESS,
        abi: GAME_CLAIM_ABI,
        functionName: 'paused'
      })
    ]);

    // Calculate derived values
    const remaining = globalCap - globalClaimed;
    const percentageClaimed = Number(globalClaimed) > 0 ? 
      (Number(globalClaimed) / Number(globalCap)) * 100 : 0;

    const data = {
      globalCap: globalCap.toString(),
      globalClaimed: globalClaimed.toString(),
      dailyUserCap: dailyUserCap.toString(),
      remaining: remaining.toString(),
      percentageClaimed: percentageClaimed.toFixed(2),
      paused: paused
    };
    
    console.log('Real contract data:', data);
    res.status(200).json(data);
  } catch (error) {
    console.error('API Error:', error);
    
    // Fallback to mock data if contract call fails
    console.log('Falling back to mock data...');
    const mockData = {
      globalCap: "200000000000000000000000000000", // 200B MLEO (with 18 decimals)
      globalClaimed: "1250000000000000000000000000", // 1.25B MLEO claimed
      dailyUserCap: "50000000000000000000000000", // 50M MLEO daily cap per user
      remaining: "198750000000000000000000000000", // Remaining in pool
      percentageClaimed: "0.63", // 0.63% claimed
      paused: false
    };
    
    res.status(200).json(mockData);
  }
}