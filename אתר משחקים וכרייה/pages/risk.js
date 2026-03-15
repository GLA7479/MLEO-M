// pages/risk.js
import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import Link from "next/link";
import Head from "next/head";
import { useRouter } from "next/router";
import PolicyModal from "../components/PolicyModal";

export default function RiskDisclaimer() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);
  
  useEffect(() => {
    setIsOpen(true);
  }, []);
  
  const handleClose = () => {
    setIsOpen(false);
    // Always try to go back, fallback to home if no history
    setTimeout(() => {
      if (typeof window !== "undefined") {
        const referrer = document.referrer;
        if (referrer && referrer !== window.location.href && window.history.length > 1) {
          // Use window.location.href for full page reload to ensure content updates
          window.location.href = referrer;
        } else {
          window.location.href = "/";
        }
      }
    }, 150);
  };
  
  return (
    <Layout title="Risk Disclaimer — MLEO">
      <Head>
        <meta name="description" content="MLEO Risk / Testnet Disclaimer - Important risks and limitations" />
      </Head>
      
      <PolicyModal 
        isOpen={isOpen} 
        onClose={handleClose}
        title="Risk / Testnet Disclaimer"
      >
        <div className="prose prose-invert max-w-none space-y-6 text-sm leading-relaxed">
          <p className="text-xs text-gray-400 mb-4">Last Updated: [Insert Date]</p>
          
          {/* Warning Banner */}
          <div className="bg-red-900/30 border-2 border-red-700/50 p-4 rounded-lg mb-6">
            <p className="font-bold text-lg mb-2">⚠️ Important Warning</p>
            <p>
              This Risk / Testnet Disclaimer explains important risks, limitations, and warnings relating to the use of the MLEO Platform, including any wallet-related, reward-related, blockchain-related, or testnet-related features.
            </p>
            <p className="mt-2 font-semibold">
              By accessing or using the Platform, you acknowledge and accept the risks described below.
            </p>
          </div>
            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">1. Entertainment and Experimental Platform</h2>
              <p className="mb-2">
                The Platform is provided for entertainment, gameplay, experimental, community, and development purposes. Certain features may be in test, beta, demo, limited-access, or experimental form.
              </p>
              <p>
                The Platform is not a casino, gambling service, exchange, brokerage, financial institution, or investment platform.
              </p>
            </section>

            <section className="bg-yellow-900/20 border border-yellow-700/30 p-4 rounded-lg">
              <h2 className="text-xl font-bold mt-8 mb-4">2. Testnet Features May Have No Value</h2>
              <p className="mb-2">
                Any feature identified as <strong>testnet</strong>, <strong>beta</strong>, <strong>demo</strong>, <strong>development</strong>, <strong>experimental</strong>, or similar may:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>have no monetary value;</li>
                <li>be non-transferable;</li>
                <li>be non-redeemable;</li>
                <li>be subject to resets or deletion;</li>
                <li>be changed, paused, or discontinued at any time;</li>
                <li>not correspond to any live or future mainnet asset.</li>
              </ul>
              <p className="mt-2 font-semibold">
                Displaying a wallet address, token label, contract address, pool amount, claim status, or blockchain data does not mean that any asset has real-world value, liquidity, or redemption rights.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">3. No Promise of Future Launch, Listing, or Utility</h2>
              <p className="mb-2">
                Nothing on the Platform should be interpreted as a promise, guarantee, or representation that any token, reward, balance, vault amount, or digital item will:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>launch on mainnet;</li>
                <li>become transferable;</li>
                <li>become redeemable;</li>
                <li>be listed anywhere;</li>
                <li>retain value;</li>
                <li>gain utility;</li>
                <li>be exchangeable for money, crypto, or anything else.</li>
              </ul>
              <p className="mt-2">
                Any future feature, if introduced at all, may be subject to separate rules, eligibility requirements, technical limitations, and legal restrictions.
              </p>
            </section>

            <section className="bg-red-900/20 border border-red-700/30 p-4 rounded-lg">
              <h2 className="text-xl font-bold mt-8 mb-4">4. Wallet Use Is at Your Own Risk</h2>
              <p className="mb-2">
                If you connect a wallet or interact with blockchain-related features, you do so at your own risk.
              </p>
              <p className="mb-2">You are solely responsible for:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>wallet security;</li>
                <li>device security;</li>
                <li>seed phrases and private keys;</li>
                <li>transaction approvals;</li>
                <li>address accuracy;</li>
                <li>gas fees;</li>
                <li>understanding the network you are using;</li>
                <li>reviewing any transaction before confirming it.</li>
              </ul>
              <p className="mt-2">
                We are not responsible for losses caused by user error, phishing, malicious extensions, compromised wallets, incorrect approvals, fake interfaces, network congestion, chain instability, or third-party wallet failures.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">5. Smart Contract and Blockchain Risks</h2>
              <p className="mb-2">
                Blockchain-related features may involve substantial technical risk, including:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>bugs or vulnerabilities;</li>
                <li>failed transactions;</li>
                <li>incorrect reads or writes;</li>
                <li>RPC failures;</li>
                <li>indexing delays;</li>
                <li>network congestion;</li>
                <li>forks or reorgs;</li>
                <li>front-end mismatches;</li>
                <li>inaccurate balances or claim indicators;</li>
                <li>contract pauses or admin interventions;</li>
                <li>incompatibility with certain wallets or devices.</li>
              </ul>
              <p className="mt-2">
                Even where a smart contract is deployed, available, or visible, interactions may fail or behave unexpectedly.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">6. Claims, Rewards, and Vault Balances Are Not Guaranteed</h2>
              <p className="mb-2">
                Any Vault amount, reward display, accrued total, claimable amount, leaderboard result, or session reward shown on the Platform may be provisional, delayed, approximate, or subject to verification.
              </p>
              <p className="mb-2">Claims or rewards may be:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>rate-limited;</li>
                <li>paused;</li>
                <li>denied;</li>
                <li>recalculated;</li>
                <li>revoked;</li>
                <li>delayed;</li>
                <li>subject to anti-abuse review;</li>
                <li>affected by technical or legal restrictions.</li>
              </ul>
              <p className="mt-2 font-semibold">
                A visible balance or claim button does not guarantee successful receipt of any item or asset.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">7. No Financial, Legal, or Tax Advice</h2>
              <p className="mb-2">
                Nothing on the Platform constitutes financial, investment, legal, accounting, regulatory, or tax advice.
              </p>
              <p>
                You are solely responsible for evaluating the risks of using the Platform and for obtaining independent professional advice where appropriate.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">8. Availability and Service Changes</h2>
              <p className="mb-2">The Platform may be unavailable, interrupted, modified, or discontinued at any time.</p>
              <p className="mb-2">We may:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>change reward formulas;</li>
                <li>rebalance gameplay;</li>
                <li>reset test data;</li>
                <li>modify vault logic;</li>
                <li>disable claims;</li>
                <li>migrate systems;</li>
                <li>remove features;</li>
                <li>wipe local progress;</li>
                <li>restrict access by region, wallet, or device.</li>
              </ul>
              <p className="mt-2">
                We have no obligation to maintain any particular feature or experience.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">9. No Reliance</h2>
              <p className="mb-2">
                You must not rely on the Platform, its interfaces, token labels, pool displays, reward screens, whitepaper text, roadmap references, or technical indicators as guarantees of future functionality, value, rights, or asset ownership.
              </p>
              <p>
                All features are subject to change and should be treated with caution.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">10. Regulatory and Legal Uncertainty</h2>
              <p className="mb-2">
                Digital assets, blockchain applications, wallet integrations, and online reward systems may be subject to changing laws, regulations, interpretations, and enforcement approaches across jurisdictions.
              </p>
              <p>
                We do not guarantee that any feature is appropriate, lawful, or available in every jurisdiction. You are solely responsible for understanding and complying with the laws that apply to you.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">11. Third-Party Dependencies</h2>
              <p className="mb-2">
                The Platform may depend on third-party services, including wallets, hosting providers, RPC providers, infrastructure partners, analytics tools, cloud services, and public blockchain networks.
              </p>
              <p>
                These services may fail, change, suspend access, introduce delays, or create security issues beyond our control. We are not responsible for third-party failures or interruptions.
              </p>
            </section>

            <section className="bg-orange-900/20 border border-orange-700/30 p-4 rounded-lg">
              <h2 className="text-xl font-bold mt-8 mb-4">12. Limitation of Expectations</h2>
              <p className="mb-2">You acknowledge that:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>gameplay systems may change;</li>
                <li>balances may be adjusted;</li>
                <li>claims may fail;</li>
                <li>testnet states may be wiped;</li>
                <li>digital items may never become live assets;</li>
                <li>visible numbers may be informational only;</li>
                <li>experimental systems may break or be removed entirely.</li>
              </ul>
              <p className="mt-2 font-semibold">
                You use the Platform with these limitations fully understood.
              </p>
            </section>

            <section className="bg-blue-900/20 border border-blue-700/30 p-4 rounded-lg">
              <h2 className="text-xl font-bold mt-8 mb-4">13. Contact</h2>
              <p className="mb-2">
                If you have questions about this Risk / Testnet Disclaimer, contact us at:
              </p>
              <ul className="list-none space-y-1">
                <li><strong>Email:</strong> [Insert Contact Email]</li>
                <li><strong>Company / Brand Name:</strong> [Insert Name]</li>
                <li><strong>Address:</strong> [Insert Address, if applicable]</li>
              </ul>
            </section>
          
          {/* Footer Links */}
          <footer className="mt-8 pt-6 border-t border-white/10">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6 justify-between text-xs text-gray-400">
              <div>© {new Date().getFullYear()} MLEO. All rights reserved.</div>
              <div className="flex flex-wrap gap-4">
                <Link href="/" className="hover:text-white transition-colors">Home</Link>
                <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
                <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
                <Link href="/cookies" className="hover:text-white transition-colors">Cookies</Link>
                <Link href="/risk" className="hover:text-white transition-colors">Risk</Link>
              </div>
            </div>
          </footer>
        </div>
      </PolicyModal>
    </Layout>
  );
}
