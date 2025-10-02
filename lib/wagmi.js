// lib/wagmi.js
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { cookieStorage, createStorage, http } from "wagmi";
import {
  mainnet,
  polygon,
  arbitrum,
  base,
  optimism,
  sepolia,
  bsc,
  bscTestnet,
} from "wagmi/chains";

// ---- WalletConnect project id (supports both env names) ----
const WC_PROJECT_ID =
  (process.env.NEXT_PUBLIC_WC_PROJECT_ID &&
    process.env.NEXT_PUBLIC_WC_PROJECT_ID.trim()) ||
  (process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID &&
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.trim()) ||
  "be3ad62c2aa9264ea256b81e4c1da41d"; // safe fallback for dev

if (!process.env.NEXT_PUBLIC_WC_PROJECT_ID && !process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) {
  console.warn(
    "[wagmi] WC project id env not set (NEXT_PUBLIC_WC_PROJECT_ID / NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) — using a dev fallback."
  );
}

// ---- RPCs ----
const BSC_TESTNET_RPC =
  (process.env.NEXT_PUBLIC_BSC_TESTNET_RPC &&
    process.env.NEXT_PUBLIC_BSC_TESTNET_RPC.trim()) ||
  "https://bsc-testnet.publicnode.com"; // fallback

// you can add a mainnet RPC if you want a custom endpoint later
const BSC_MAINNET_RPC = undefined; // http() will pick defaults

// ---- Chains list (added bsc + bscTestnet) ----
export const CHAINS = [
  mainnet,
  polygon,
  arbitrum,
  base,
  optimism,
  sepolia,
  bsc,
  bscTestnet,
];

// for easy imports elsewhere (claim/miners use 97)
export const REQUIRED_CHAIN = bscTestnet;
export const REQUIRED_CHAIN_ID = bscTestnet.id; // 97

export const wagmiConfig = getDefaultConfig({
  appName: "MLEO Miners",
  projectId: WC_PROJECT_ID,
  chains: CHAINS,
  transports: {
    [mainnet.id]: http(),           // default public RPC
    [polygon.id]: http(),
    [arbitrum.id]: http(),
    [base.id]: http(),
    [optimism.id]: http(),
    [sepolia.id]: http(),
    [bsc.id]: http(BSC_MAINNET_RPC),      // can stay http() if you prefer
    [bscTestnet.id]: http(BSC_TESTNET_RPC),
  },
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
});
