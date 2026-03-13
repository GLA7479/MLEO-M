// pages/privacy.js
import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import Link from "next/link";
import Head from "next/head";
import { useRouter } from "next/router";
import PolicyModal from "../components/PolicyModal";

export default function PrivacyPolicy() {
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
    <Layout title="Privacy Policy — MLEO">
      <Head>
        <meta name="description" content="MLEO Privacy Policy - How we collect, use, and protect your personal data" />
      </Head>
      
      <PolicyModal 
        isOpen={isOpen} 
        onClose={handleClose}
        title="Privacy Policy"
      >
        <div className="prose prose-invert max-w-none space-y-6 text-sm leading-relaxed">
          <p className="text-xs text-gray-400 mb-4">Last Updated: [Insert Date]</p>
            <section>
              <p>
                This Privacy Policy ("<strong>Policy</strong>") explains how MLEO and/or the operator of the MLEO Platform ("<strong>we</strong>", "<strong>us</strong>", or "<strong>our</strong>") collects, uses, stores, shares, and protects personal data when you access or use our websites, games, applications, wallet-related features, testnet features, support channels, community tools, and related services (collectively, the "<strong>Platform</strong>").
              </p>
              <p>
                By accessing or using the Platform, you acknowledge that you have read and understood this Policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">1. Scope of This Policy</h2>
              <p className="mb-2">This Policy applies to personal data we collect when you:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>visit or use the Platform;</li>
                <li>play games or use gameplay-related features;</li>
                <li>connect a wallet;</li>
                <li>interact with testnet or blockchain-related features;</li>
                <li>contact support;</li>
                <li>participate in campaigns, promotions, community activities, or surveys;</li>
                <li>interact with us through forms, emails, or social channels linked from the Platform.</li>
              </ul>
              <p className="mt-2">
                This Policy does not apply to third-party websites, wallets, apps, exchanges, blockchain explorers, analytics tools, social networks, or other services that we do not own or control.
              </p>
            </section>

            <section className="bg-yellow-900/20 border border-yellow-700/30 p-4 rounded-lg">
              <h2 className="text-xl font-bold mt-8 mb-4">2. Important Notice About Blockchain Features</h2>
              <p className="mb-2">Some features of the Platform may involve public blockchain networks, wallet addresses, smart contracts, or testnet environments.</p>
              <p className="mb-2">Please note:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>blockchain networks are public by design;</li>
                <li>wallet addresses and on-chain transactions may be visible to others;</li>
                <li>public blockchain data is generally not deletable;</li>
                <li>we do not control third-party blockchains or public ledgers.</li>
              </ul>
              <p className="mt-2">
                If you connect a wallet or interact with blockchain-related features, certain information may become publicly available independently of our systems.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">3. Categories of Data We Collect</h2>
              <p className="mb-4">Depending on how you use the Platform, we may collect the following categories of information.</p>

              <h3 className="text-lg font-semibold mt-6 mb-2">A. Information You Provide Directly</h3>
              <p className="mb-2">You may provide us with:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>your name or username;</li>
                <li>email address;</li>
                <li>support messages and correspondence;</li>
                <li>information you submit in forms, surveys, bug reports, promotions, or community activities;</li>
                <li>content you voluntarily send to us.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">B. Wallet and Blockchain-Related Information</h3>
              <p className="mb-2">If you use wallet or blockchain-related features, we may collect:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>wallet address;</li>
                <li>network or chain information;</li>
                <li>public transaction identifiers;</li>
                <li>public smart contract interaction data;</li>
                <li>claim attempts, eligibility checks, or testnet participation records;</li>
                <li>associated timestamps and technical metadata.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">C. Gameplay and Platform Activity Information</h3>
              <p className="mb-2">We may collect gameplay and usage information such as:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>game sessions;</li>
                <li>scores, rankings, progression, achievements, rewards, and vault-related activity;</li>
                <li>feature usage;</li>
                <li>login or session events;</li>
                <li>preferences and settings;</li>
                <li>interactions with gameplay mechanics, promotions, and user interface elements;</li>
                <li>anti-abuse and fraud-prevention signals.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">D. Device, Browser, and Technical Information</h3>
              <p className="mb-2">We may collect technical information such as:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>IP address;</li>
                <li>browser type and version;</li>
                <li>device type;</li>
                <li>operating system;</li>
                <li>language settings;</li>
                <li>referring URLs;</li>
                <li>pages visited;</li>
                <li>timestamps;</li>
                <li>crash logs;</li>
                <li>error logs;</li>
                <li>approximate geolocation derived from IP;</li>
                <li>performance and diagnostic data.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">E. Cookies, Local Storage, and Similar Technologies</h3>
              <p className="mb-2">We may collect information through:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>cookies;</li>
                <li>local storage;</li>
                <li>session storage;</li>
                <li>software development kits (SDKs);</li>
                <li>pixels;</li>
                <li>log files;</li>
                <li>similar technologies.</li>
              </ul>
              <p className="mt-2">
                These technologies may store identifiers, preferences, session data, technical flags, gameplay state, and analytics-related information.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">4. How We Use Personal Data</h2>
              <p className="mb-4">We may use personal data for the following purposes:</p>

              <h3 className="text-lg font-semibold mt-6 mb-2">A. To Provide and Operate the Platform</h3>
              <p className="mb-2">Including to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>make the Platform available;</li>
                <li>provide games, features, rewards logic, support tools, and wallet-related interactions;</li>
                <li>maintain accounts, sessions, gameplay state, and platform functionality;</li>
                <li>process testnet or blockchain-related interactions where applicable.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">B. To Improve and Develop the Platform</h3>
              <p className="mb-2">Including to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>analyze performance and usage;</li>
                <li>understand player behavior and product engagement;</li>
                <li>improve game balance, user experience, navigation, and technical stability;</li>
                <li>test new features and content.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">C. To Secure the Platform</h3>
              <p className="mb-2">Including to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>detect fraud, abuse, bots, multi-accounting, exploitation, and suspicious activity;</li>
                <li>investigate bugs, incidents, or security threats;</li>
                <li>enforce our Terms, rules, and policies;</li>
                <li>protect the rights, safety, and property of users, us, and third parties.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">D. To Communicate With You</h3>
              <p className="mb-2">Including to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>respond to support requests;</li>
                <li>send service-related notices;</li>
                <li>provide policy updates, gameplay notices, maintenance alerts, and security communications;</li>
                <li>administer promotions, surveys, or campaigns where permitted.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">E. To Comply With Legal Obligations</h3>
              <p className="mb-2">Including to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>comply with applicable laws, regulations, legal process, and governmental requests;</li>
                <li>maintain records where required;</li>
                <li>establish, exercise, or defend legal claims.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">F. To Prevent Misuse and Preserve Fairness</h3>
              <p className="mb-2">Including to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>validate participation rules;</li>
                <li>manage reward eligibility;</li>
                <li>detect manipulation of claims, leaderboards, sessions, or vault systems;</li>
                <li>apply technical or gameplay restrictions as needed.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">5. Legal Bases for Processing</h2>
              <p className="mb-2">
                Where applicable data protection law requires a legal basis, we may rely on one or more of the following:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>performance of a contract, including providing the Platform and requested features;</li>
                <li>legitimate interests, such as operating, securing, improving, and protecting the Platform;</li>
                <li>compliance with legal obligations;</li>
                <li>consent, where required by law, including for certain cookies or optional communications.</li>
              </ul>
              <p className="mt-2">
                Where we rely on legitimate interests, we consider and balance the potential impact on users and apply safeguards where appropriate.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">6. Cookies and Similar Technologies</h2>
              <p className="mb-2">We may use cookies and similar technologies for:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>essential site functionality;</li>
                <li>security and fraud prevention;</li>
                <li>authentication and session continuity;</li>
                <li>remembering settings and preferences;</li>
                <li>analytics and performance measurement;</li>
                <li>feature testing and platform improvement.</li>
              </ul>
              <p className="mt-2">
                Where required by applicable law, we will request your consent before placing non-essential cookies or using similar non-essential tracking technologies.
              </p>
              <p className="mt-2">
                You may be able to manage cookie preferences through your browser settings or our cookie controls, where available. Disabling certain technologies may affect functionality.
              </p>
              <p className="mt-2">
                For more information, please see our <Link href="/cookies" className="text-blue-400 hover:text-blue-300 underline">Cookie Notice</Link>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">7. When We Share Personal Data</h2>
              <p className="mb-4 font-semibold">We do not sell your personal data for money.</p>
              <p className="mb-4">We may share personal data only in the circumstances described below.</p>

              <h3 className="text-lg font-semibold mt-6 mb-2">A. Service Providers and Infrastructure Partners</h3>
              <p className="mb-2">We may share data with service providers who help us operate the Platform, such as providers of:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>hosting;</li>
                <li>analytics;</li>
                <li>cloud storage;</li>
                <li>customer support tools;</li>
                <li>infrastructure monitoring;</li>
                <li>security services;</li>
                <li>communication tools;</li>
                <li>wallet or blockchain infrastructure integrations.</li>
              </ul>
              <p className="mt-2">
                These providers may access personal data only as needed to perform services for us and subject to appropriate obligations.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-2">B. Legal and Compliance Reasons</h3>
              <p className="mb-2">We may disclose information where we believe disclosure is necessary to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>comply with applicable law, regulation, court order, subpoena, or legal process;</li>
                <li>respond to lawful requests by public authorities;</li>
                <li>enforce our agreements and policies;</li>
                <li>investigate fraud, abuse, security incidents, or unlawful activity;</li>
                <li>protect rights, safety, property, or operations.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">C. Business Transfers</h3>
              <p className="mb-2">
                If we are involved in a merger, acquisition, restructuring, financing, asset sale, or similar transaction, personal data may be transferred as part of that process, subject to applicable safeguards.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-2">D. With Your Direction or Consent</h3>
              <p className="mb-2">We may share information where you instruct us to do so or where you explicitly consent.</p>

              <h3 className="text-lg font-semibold mt-6 mb-2">E. Public Blockchain Data</h3>
              <p className="mb-2">
                If you interact with public blockchain features, certain data may be visible publicly by design and may be accessible through third-party explorers, nodes, or analytics services independently of us.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">8. International Data Transfers</h2>
              <p className="mb-2">
                Your personal data may be processed in countries other than your own, including countries that may have different data protection laws.
              </p>
              <p>
                Where required by law, we take appropriate steps to protect personal data transferred internationally, including contractual safeguards or other lawful transfer mechanisms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">9. Data Retention</h2>
              <p className="mb-2">
                We retain personal data only for as long as reasonably necessary for the purposes described in this Policy, including to:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>provide and operate the Platform;</li>
                <li>maintain records;</li>
                <li>resolve disputes;</li>
                <li>enforce agreements;</li>
                <li>comply with legal obligations;</li>
                <li>investigate security or abuse issues.</li>
              </ul>
              <p className="mt-2">
                Retention periods may vary depending on the type of data, legal requirements, operational needs, and security considerations.
              </p>
              <p className="mt-2">
                We may retain aggregated, anonymized, or de-identified information for longer where permitted by law.
              </p>
              <p className="mt-2 font-semibold">
                Please note that public blockchain data is generally permanent and cannot be deleted by us.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">10. Data Security</h2>
              <p className="mb-2">
                We implement reasonable technical, administrative, and organizational measures designed to protect personal data against unauthorized access, loss, misuse, alteration, or disclosure.
              </p>
              <p className="mb-2">
                However, no system, network, storage method, wallet environment, or transmission over the internet is completely secure. We cannot guarantee absolute security.
              </p>
              <p>
                You are also responsible for protecting your own devices, wallets, seed phrases, passwords, and access credentials.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">11. Children's Privacy</h2>
              <p className="mb-2">The Platform is not intended for children.</p>
              <p>
                We do not knowingly collect personal data from individuals under the age required to use the Platform under our Terms. If you believe a child has provided personal data in violation of this Policy, contact us so we can take appropriate action.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">12. Your Privacy Rights</h2>
              <p className="mb-2">Depending on your jurisdiction, you may have certain rights regarding your personal data, such as the right to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>access personal data we hold about you;</li>
                <li>request correction of inaccurate data;</li>
                <li>request deletion of personal data;</li>
                <li>request restriction of processing;</li>
                <li>object to certain processing;</li>
                <li>request portability of certain data;</li>
                <li>withdraw consent where processing is based on consent;</li>
                <li>lodge a complaint with a supervisory authority.</li>
              </ul>
              <p className="mt-2">
                These rights are not absolute and may be subject to legal, technical, contractual, or security limitations.
              </p>
              <p className="mt-2">
                To exercise your rights, contact us using the details below. We may request information necessary to verify your identity before responding.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">13. Account, Wallet, and Public Data Limitations</h2>
              <p className="mb-2">Please understand the limits of privacy in blockchain and platform environments:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>wallet addresses may be public;</li>
                <li>public blockchain activity is visible to others;</li>
                <li>some gameplay, ranking, or community data may be visible within the Platform;</li>
                <li>if you voluntarily post or share information publicly, it may be copied or redistributed by others;</li>
                <li>we may not be able to delete data that has already been published to a blockchain or public network.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">14. Third-Party Services</h2>
              <p className="mb-2">
                The Platform may contain links to or integrations with third-party services, including wallets, social platforms, explorers, RPC providers, or analytics tools.
              </p>
              <p>
                We are not responsible for the privacy, security, or content practices of third parties. Your use of those services is governed by their own terms and privacy policies.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">15. Automated Monitoring and Anti-Abuse Measures</h2>
              <p className="mb-2">
                To protect the Platform, users, and reward systems, we may use automated tools or rule-based systems to detect suspicious activity, including:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>bot-like behavior;</li>
                <li>abnormal session patterns;</li>
                <li>exploitation attempts;</li>
                <li>duplicate participation;</li>
                <li>fraudulent claim activity;</li>
                <li>service interference.</li>
              </ul>
              <p className="mt-2">
                These tools may affect eligibility, access, rewards, claims, or account status. We may review relevant signals manually or automatically where appropriate.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">16. Communications</h2>
              <p className="mb-2">We may send transactional or service-related communications, such as:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>account or session notices;</li>
                <li>support replies;</li>
                <li>maintenance alerts;</li>
                <li>security notices;</li>
                <li>policy updates;</li>
                <li>claim or feature status notices.</li>
              </ul>
              <p className="mt-2">
                Where required by law, we will obtain consent before sending marketing communications. You may opt out of non-essential promotional messages where applicable.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">17. Do Not Track</h2>
              <p className="mb-2">
                Some browsers offer a "Do Not Track" setting. Because there is not yet a universally accepted standard for responding to such signals, the Platform may not respond to all Do Not Track requests unless required by applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">18. Region-Specific Disclosures</h2>
              <p className="mb-2">
                Depending on your location, additional disclosures or rights may apply under laws such as the GDPR, UK GDPR, or other applicable privacy laws.
              </p>
              <p>
                Where required, we may provide supplemental regional privacy notices.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">19. Changes to This Policy</h2>
              <p className="mb-2">We may update this Policy from time to time.</p>
              <p>
                If we make material changes, we may post the updated version on the Platform and revise the "Last Updated" date. Your continued use of the Platform after the effective date of the updated Policy constitutes your acknowledgment of the revised Policy, to the extent permitted by law.
              </p>
            </section>

            <section className="bg-blue-900/20 border border-blue-700/30 p-4 rounded-lg">
              <h2 className="text-xl font-bold mt-8 mb-4">20. Contact Us</h2>
              <p className="mb-2">
                If you have questions, requests, or concerns about this Policy or our privacy practices, contact us at:
              </p>
              <ul className="list-none space-y-1">
                <li><strong>Email:</strong> [Insert Contact Email]</li>
                <li><strong>Company / Brand Name:</strong> [Insert Name]</li>
                <li><strong>Address:</strong> [Insert Address, if applicable]</li>
              </ul>
              <p className="mt-4">
                If required by applicable law, you may also include the contact details of your privacy representative or data protection contact here.
              </p>
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
