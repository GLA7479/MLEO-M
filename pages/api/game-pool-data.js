// pages/api/game-pool-data.js
import { createPublicClient, http } from 'viem';
import { bscTestnet } from 'viem/chains';

export const config = {
  runtime: 'nodejs',
};

function getMockData(source) {
  return {
    globalCap: '200000000000000000000000000000',
    globalClaimed: '1250000000000000000000000000',
    dailyUserCap: '50000000000000000000000000',
    remaining: '198750000000000000000000000000',
    percentageClaimed: '0.63',
    paused: false,
    _source: source,
  };
}

function safeSend(res, status, payload) {
  if (res.writableEnded || res.headersSent) return;
  try {
    res.status(status).json(payload);
  } catch (e) {
    console.error('game-pool-data: failed to send response', e);
  }
}

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

const DEFAULT_GAME_CLAIM_ADDRESS = '0xC19AA307ed110F416dA458b4687a606ffbaCc1D0';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    safeSend(res, 405, { error: 'Method not allowed' });
    return;
  }

  const GAME_CLAIM_ADDRESS = (
    process.env.NEXT_PUBLIC_MLEO_CLAIM_ADDRESS ||
    process.env.NEXT_PUBLIC_GAME_POOL_CONTRACT ||
    DEFAULT_GAME_CLAIM_ADDRESS
  ).trim();

  try {
    const rpcUrl =
      process.env.BSC_TESTNET_RPC ||
      process.env.NEXT_PUBLIC_BSC_TESTNET_RPC ||
      'https://bsc-testnet.publicnode.com';

    const publicClient = createPublicClient({
      chain: bscTestnet,
      transport: http(rpcUrl),
    });

    const [globalCap, globalClaimed, dailyUserCap, paused] = await Promise.all([
      publicClient.readContract({
        address: GAME_CLAIM_ADDRESS,
        abi: GAME_CLAIM_ABI,
        functionName: 'globalCap',
      }),
      publicClient.readContract({
        address: GAME_CLAIM_ADDRESS,
        abi: GAME_CLAIM_ABI,
        functionName: 'globalClaimed',
      }),
      publicClient.readContract({
        address: GAME_CLAIM_ADDRESS,
        abi: GAME_CLAIM_ABI,
        functionName: 'dailyUserCap',
      }),
      publicClient.readContract({
        address: GAME_CLAIM_ADDRESS,
        abi: GAME_CLAIM_ABI,
        functionName: 'paused',
      }),
    ]);

    const remaining = globalCap - globalClaimed;
    const capN = Number(globalCap);
    const claimedN = Number(globalClaimed);
    const percentageClaimed =
      capN > 0 && Number.isFinite(claimedN) && Number.isFinite(capN)
        ? (claimedN / capN) * 100
        : 0;

    const data = {
      globalCap: globalCap.toString(),
      globalClaimed: globalClaimed.toString(),
      dailyUserCap: dailyUserCap.toString(),
      remaining: remaining.toString(),
      percentageClaimed: Number.isFinite(percentageClaimed)
        ? percentageClaimed.toFixed(2)
        : '0',
      paused,
      _source: 'live',
    };

    safeSend(res, 200, data);
  } catch (error) {
    console.error('game-pool-data API:', error?.message || error);
    safeSend(res, 200, getMockData('server_fallback'));
  }
}