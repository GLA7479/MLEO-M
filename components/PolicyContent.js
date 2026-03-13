// components/PolicyContent.js
import Link from "next/link";

export function TermsContent() {
  return (
    <div className="space-y-4 text-sm">
      <section>
        <p className="mb-4">Welcome to the MLEO game platform (the "<strong>Platform</strong>", "<strong>we</strong>", "<strong>us</strong>", or "<strong>our</strong>"). These Terms & Conditions ("<strong>Terms</strong>") govern your access to and use of the Platform, including our websites, games, applications, features, wallet-related integrations, testnet functionality, community features, promotional campaigns, and any related services.</p>
        <p className="mb-4">By accessing or using the Platform, you confirm that you have read, understood, and agreed to these Terms. If you do not agree, do not access or use the Platform.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">1. Eligibility</h3>
        <p className="mb-2">You may use the Platform only if:</p>
        <ul className="list-disc ml-5 space-y-1">
          <li>you are at least <strong>18 years old</strong>, or the age of legal majority in your jurisdiction, whichever is higher;</li>
          <li>you have the legal capacity to enter into a binding agreement;</li>
          <li>your use of the Platform is not prohibited by applicable law in your location; and</li>
          <li>you are not accessing the Platform from a jurisdiction where the Platform, digital assets, online games, or related services are restricted or prohibited.</li>
        </ul>
        <p className="mt-2">You are solely responsible for ensuring that your use of the Platform is lawful in your jurisdiction.</p>
      </section>
      <section className="bg-yellow-50 border-2 border-yellow-400 p-4 rounded-lg">
        <h3 className="font-bold text-black mb-2">2. Entertainment Platform Only</h3>
        <p className="mb-2">The Platform is designed for <strong>entertainment, gameplay, community participation, and digital interactive experiences</strong>.</p>
        <p className="mb-2">The Platform is <strong>not</strong> intended to operate as:</p>
        <ul className="list-disc ml-5 space-y-1">
          <li>a casino;</li>
          <li>a gambling or betting service;</li>
          <li>a real-money gaming platform;</li>
          <li>a financial service;</li>
          <li>an exchange, broker, investment platform, or securities offering; or</li>
          <li>a provider of legal, tax, accounting, or investment advice.</li>
        </ul>
        <p className="mt-2">Nothing on the Platform should be interpreted as an invitation to gamble, place bets, make financial decisions, or expect profits.</p>
      </section>
      <section className="bg-red-50 border-2 border-red-400 p-4 rounded-lg">
        <h3 className="font-bold text-black mb-2">3. No Deposits, No Purchase of In-Game Balances</h3>
        <p className="mb-2"><strong>At this time</strong>, the Platform does <strong>not</strong> allow users to deposit fiat currency, cryptocurrency, or any other asset in order to participate in gameplay or obtain in-game balances for gameplay purposes.</p>
        <p className="mb-2"><strong>At this time</strong>, users cannot purchase in-game game balances with money or cryptocurrency for gameplay use on the Platform.</p>
        <p>Any balances, points, rewards, vault amounts, or gameplay progress shown inside the Platform are subject to the rules of the Platform and may exist solely as part of the entertainment experience, test environment, reward mechanics, or technical platform functionality.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">4. Testnet, Wallet, and Blockchain Features</h3>
        <p className="mb-2">Some Platform features may reference:</p>
        <ul className="list-disc ml-5 space-y-1 mb-2">
          <li>wallet connections;</li>
          <li>blockchain addresses;</li>
          <li>smart contracts;</li>
          <li>testnet environments;</li>
          <li>on-chain claim functions;</li>
          <li>token identifiers; or</li>
          <li>public ledger activity.</li>
        </ul>
        <p className="mb-2">Unless explicitly stated otherwise in a separate written notice published by us, any such feature currently made available through the Platform is provided on a <strong>testnet, experimental, beta, development, or limited-access basis</strong>.</p>
        <div className="bg-orange-50 border border-orange-300 p-3 rounded mt-2">
          <h4 className="font-bold mb-1">Important testnet notice</h4>
          <p className="mb-2">Where a feature is labeled <strong>testnet</strong>, <strong>beta</strong>, <strong>demo</strong>, <strong>development</strong>, or similar:</p>
          <ul className="list-disc ml-5 space-y-1">
            <li>it may have <strong>no monetary value</strong>;</li>
            <li>it may be reset, wiped, disabled, delayed, or discontinued at any time;</li>
            <li>it may not correspond to any live or mainnet asset;</li>
            <li>it may not be transferable, redeemable, or exchangeable;</li>
            <li>it may contain bugs, inaccuracies, interruptions, or security vulnerabilities.</li>
          </ul>
          <p className="mt-2">Displaying a wallet address, contract address, pool size, claim status, or other blockchain-related information does <strong>not</strong> mean that any asset has present or future market value, liquidity, redemption rights, or exchangeability.</p>
        </div>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">5. No Guarantee of Value</h3>
        <p className="mb-2">We make <strong>no representation, warranty, or promise</strong> that any digital item, point, reward, balance, vault amount, token label, testnet claim, leaderboard prize, collectible, or any other feature on the Platform has:</p>
        <ul className="list-disc ml-5 space-y-1">
          <li>present value;</li>
          <li>future value;</li>
          <li>resale value;</li>
          <li>utility outside the Platform;</li>
          <li>market liquidity;</li>
          <li>exchangeability;</li>
          <li>transferability; or</li>
          <li>legal classification favorable to the user.</li>
        </ul>
        <p className="mt-2">You acknowledge that any gameplay-related reward, digital balance, or blockchain-linked item may have <strong>no value at all</strong> and may be modified or discontinued at any time.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">6. Future Features</h3>
        <p className="mb-2">We may, in our sole discretion, introduce, modify, limit, suspend, or discontinue features in the future, including features involving digital collectibles, utility features, wallet-based integrations, or blockchain-based mechanics.</p>
        <p className="mb-2">If we introduce any materially different feature in the future, including any feature that changes the legal or operational nature of the Platform, we may publish supplemental rules, special terms, campaign rules, token notices, claim rules, participation criteria, or other policy documents that will apply in addition to these Terms.</p>
        <p>Nothing in these Terms obligates us to launch or maintain any future feature.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">7. Gameplay, Balancing, and Progress</h3>
        <p className="mb-2">The Platform may include games, progression systems, vault systems, idle systems, multipliers, achievements, upgrades, caps, schedules, leaderboards, streaks, bonuses, prestige systems, and promotional mechanics.</p>
        <p className="mb-2">All gameplay systems are subject to change at any time, including:</p>
        <ul className="list-disc ml-5 space-y-1 mb-2">
          <li>reward rates;</li>
          <li>balancing formulas;</li>
          <li>session limits;</li>
          <li>daily or lifetime caps;</li>
          <li>claim windows;</li>
          <li>drop tables;</li>
          <li>scoring models;</li>
          <li>progression speed;</li>
          <li>offline accrual rules;</li>
          <li>eligibility criteria; and</li>
          <li>feature availability.</li>
        </ul>
        <p className="mb-2">We may, at any time and for any reason:</p>
        <ul className="list-disc ml-5 space-y-1">
          <li>rebalance the Platform;</li>
          <li>reset or adjust progress;</li>
          <li>revoke rewards;</li>
          <li>correct errors;</li>
          <li>suspend gameplay features;</li>
          <li>roll back balances;</li>
          <li>remove results affected by bugs, exploits, abuse, or irregular activity.</li>
        </ul>
        <p className="mt-2">You do not acquire ownership rights in gameplay progress merely because it appears in the interface.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">8. Vault, Rewards, and Claims</h3>
        <p className="mb-2">The Platform may display a Vault, accrued amount, claimable amount, session reward, or similar reward indicator.</p>
        <p className="mb-2">Such indicators may reflect internal gameplay logic, testnet logic, promotional logic, or provisional calculations only. They do not constitute a bank balance, stored value account, deposit, wage, salary, property right, or guaranteed entitlement.</p>
        <p className="mb-2">If the Platform offers a "CLAIM" feature:</p>
        <ul className="list-disc ml-5 space-y-1">
          <li>claim availability may be limited, delayed, paused, or disabled;</li>
          <li>claims may be subject to eligibility checks, anti-abuse rules, smart contract controls, cooldowns, rate limits, and technical restrictions;</li>
          <li>claims may fail due to wallet issues, smart contract issues, network issues, user error, gas issues, front-end issues, or third-party service interruptions;</li>
          <li>claims may be revoked, reversed off-platform where permitted, or denied where abuse, error, ineligibility, or legal risk is identified.</li>
        </ul>
        <p className="mt-2">We reserve the right to determine eligibility for rewards, vaulting, testnet claiming, campaigns, or any similar feature in our sole discretion.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">9. Optional Wallet Connection</h3>
        <p className="mb-2">Some features may require or allow connection to a third-party wallet. Wallet connection is optional unless explicitly required for a particular feature.</p>
        <p className="mb-2">You understand and agree that:</p>
        <ul className="list-disc ml-5 space-y-1">
          <li>wallets are provided by third parties outside our control;</li>
          <li>you are solely responsible for your wallet, device security, seed phrase, passwords, keys, backups, and approvals;</li>
          <li>blockchain transactions may be irreversible;</li>
          <li>network fees may apply;</li>
          <li>we are not responsible for phishing, wallet compromise, malware, lost keys, user mistakes, incorrect addresses, approval abuse, network congestion, failed transactions, or blockchain forks.</li>
        </ul>
        <p className="mt-2">We do not custody user funds unless explicitly stated otherwise in a separate service agreement.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">10. Prohibited Conduct</h3>
        <p className="mb-2">You agree not to:</p>
        <ul className="list-disc ml-5 space-y-1">
          <li>use bots, scripts, macros, automation, emulators, or auto-clickers where prohibited;</li>
          <li>exploit bugs, vulnerabilities, timing errors, or reward logic;</li>
          <li>manipulate leaderboards, sessions, rewards, vault balances, or claim calculations;</li>
          <li>create multiple accounts to abuse campaigns or limits;</li>
          <li>impersonate another person or entity;</li>
          <li>interfere with the Platform, servers, APIs, databases, or smart contract operations;</li>
          <li>reverse engineer, decompile, scrape, copy, or extract source code, proprietary logic, or protected content except as permitted by law;</li>
          <li>use the Platform for unlawful, deceptive, abusive, fraudulent, or harmful purposes;</li>
          <li>upload malicious code, spam, or harmful content;</li>
          <li>attempt unauthorized access to accounts, wallets, data, infrastructure, or admin functions.</li>
        </ul>
        <p className="mt-2">We may investigate violations and take any action we consider appropriate, including suspension, resets, removals, permanent bans, denial of claims, revocation of rewards, reporting to authorities, and legal action.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">11. Promotions, Events, Airdrops, and Campaigns</h3>
        <p className="mb-2">From time to time, we may run promotions, events, community campaigns, leaderboard prizes, whitelists, reward periods, giveaways, or airdrop-style activities.</p>
        <p className="mb-2">Unless expressly stated otherwise in official rules published by us:</p>
        <ul className="list-disc ml-5 space-y-1">
          <li>all such programs are discretionary;</li>
          <li>participation does not guarantee selection, receipt, value, or continued eligibility;</li>
          <li>we may cancel, modify, delay, or terminate any campaign at any time;</li>
          <li>additional eligibility requirements may apply;</li>
          <li>abuse, suspicious activity, duplicate participation, or technical manipulation may result in disqualification.</li>
        </ul>
        <p className="mt-2">Official campaign rules, if published, are incorporated into these Terms by reference.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">12. No Financial, Legal, Tax, or Investment Advice</h3>
        <p className="mb-2">All information provided on the Platform is for general informational and entertainment purposes only.</p>
        <p className="mb-2">We do not provide:</p>
        <ul className="list-disc ml-5 space-y-1">
          <li>financial advice;</li>
          <li>investment advice;</li>
          <li>legal advice;</li>
          <li>tax advice;</li>
          <li>accounting advice; or</li>
          <li>professional advisory services.</li>
        </ul>
        <p className="mt-2">You are solely responsible for your own decisions and for obtaining independent professional advice where appropriate.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">13. Third-Party Services</h3>
        <p className="mb-2">The Platform may integrate with or link to third-party services, including:</p>
        <ul className="list-disc ml-5 space-y-1">
          <li>wallet providers;</li>
          <li>blockchain networks;</li>
          <li>RPC services;</li>
          <li>hosting providers;</li>
          <li>analytics providers;</li>
          <li>cloud services;</li>
          <li>community platforms;</li>
          <li>app providers;</li>
          <li>social platforms.</li>
        </ul>
        <p className="mt-2">We do not control and are not responsible for third-party services, their uptime, policies, security, or conduct. Your use of third-party services is governed by their own terms and policies.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">14. Privacy</h3>
        <p>Your use of the Platform is also subject to our <strong>Privacy Policy</strong>, which explains how we collect, use, store, and disclose personal data.</p>
        <p className="mt-2">By using the Platform, you acknowledge that we may process certain data necessary to provide the Platform, such as wallet identifiers, gameplay activity, technical logs, device/browser data, account identifiers, and support communications, in accordance with our Privacy Policy and applicable law.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">15. Cookies and Similar Technologies</h3>
        <p className="mb-2">We may use cookies, local storage, session storage, SDKs, pixels, and similar technologies for functionality, security, authentication, performance, analytics, and user experience.</p>
        <p className="mb-2">Where required by applicable law, we will request consent before using non-essential cookies or similar technologies.</p>
        <p>You may be able to manage certain preferences through your browser or device settings, but disabling some technologies may affect functionality.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">16. Intellectual Property</h3>
        <p className="mb-2">All content, software, design, interfaces, visual elements, text, logos, artwork, sound, video, code, game systems, trademarks, trade dress, and other materials made available through the Platform are owned by us or our licensors and are protected by applicable intellectual property laws.</p>
        <p className="mb-2">Subject to these Terms, we grant you a limited, revocable, non-exclusive, non-transferable, non-sublicensable license to access and use the Platform for personal, lawful, non-commercial use only.</p>
        <p className="mb-2">You may not, without our prior written consent:</p>
        <ul className="list-disc ml-5 space-y-1">
          <li>reproduce, distribute, modify, publish, transmit, perform, display, sell, license, or exploit Platform content;</li>
          <li>create derivative works;</li>
          <li>remove proprietary notices;</li>
          <li>use our marks, brand elements, or materials in a misleading way.</li>
        </ul>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">17. User Content and Feedback</h3>
        <p>If you submit content, feedback, suggestions, bug reports, ideas, or other materials to us, you grant us a worldwide, non-exclusive, royalty-free, perpetual, irrevocable, sublicensable license to use, reproduce, modify, adapt, publish, translate, distribute, and otherwise exploit such materials for the operation, improvement, marketing, and development of the Platform, subject to applicable law and our Privacy Policy.</p>
        <p className="mt-2">You represent that you have the necessary rights to submit such materials.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">18. Suspension and Termination</h3>
        <p className="mb-2">We may, in our sole discretion and with or without notice:</p>
        <ul className="list-disc ml-5 space-y-1 mb-2">
          <li>suspend or restrict your access;</li>
          <li>terminate your access;</li>
          <li>disable wallet-related features for your account;</li>
          <li>revoke rewards or balances;</li>
          <li>remove data or content;</li>
          <li>block claims or gameplay participation.</li>
        </ul>
        <p className="mb-2">We may do so for any reason, including legal risk, security concerns, technical abuse, inactivity, policy violations, fraud prevention, or operational needs.</p>
        <p>Upon termination, your right to use the Platform ends immediately.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">19. Availability and Technical Risks</h3>
        <p className="mb-2">The Platform is provided on an <strong>"AS IS"</strong> and <strong>"AS AVAILABLE"</strong> basis.</p>
        <p className="mb-2">We do not guarantee that the Platform will be:</p>
        <ul className="list-disc ml-5 space-y-1 mb-2">
          <li>uninterrupted;</li>
          <li>secure;</li>
          <li>error-free;</li>
          <li>accurate;</li>
          <li>complete;</li>
          <li>compatible with your device;</li>
          <li>free of bugs, malware, or vulnerabilities;</li>
          <li>continuously available.</li>
        </ul>
        <p>The Platform may be affected by maintenance, outages, software defects, smart contract issues, infrastructure failures, cyberattacks, wallet issues, blockchain congestion, RPC failures, forks, reorgs, validator issues, data corruption, or force majeure events.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">20. Disclaimer of Warranties</h3>
        <p className="mb-2">To the maximum extent permitted by law, we disclaim all warranties of any kind, whether express, implied, statutory, or otherwise, including warranties of:</p>
        <ul className="list-disc ml-5 space-y-1 mb-2">
          <li>merchantability;</li>
          <li>fitness for a particular purpose;</li>
          <li>title;</li>
          <li>non-infringement;</li>
          <li>uninterrupted access;</li>
          <li>accuracy;</li>
          <li>reliability;</li>
          <li>availability.</li>
        </ul>
        <p>We do not warrant that any reward, token label, testnet functionality, digital item, or blockchain-related feature will have any value, utility, legality, or future existence.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">21. Limitation of Liability</h3>
        <p className="mb-2">To the maximum extent permitted by law, neither we nor our affiliates, owners, directors, officers, employees, contractors, licensors, service providers, or agents shall be liable for any indirect, incidental, special, consequential, punitive, or exemplary damages, including damages for:</p>
        <ul className="list-disc ml-5 space-y-1 mb-2">
          <li>lost profits;</li>
          <li>lost revenue;</li>
          <li>lost opportunity;</li>
          <li>loss of data;</li>
          <li>loss of goodwill;</li>
          <li>business interruption;</li>
          <li>device damage;</li>
          <li>digital asset loss;</li>
          <li>transaction failure;</li>
          <li>smart contract failure;</li>
          <li>claim failure;</li>
          <li>platform downtime;</li>
          <li>security breach;</li>
          <li>emotional distress.</li>
        </ul>
        <p className="mb-2">To the maximum extent permitted by law, our total aggregate liability arising out of or relating to the Platform or these Terms shall not exceed the greater of:</p>
        <ul className="list-disc ml-5 space-y-1 mb-2">
          <li><strong>USD $100</strong>, or</li>
          <li>the amount, if any, that you paid directly to us for use of the Platform in the <strong>12 months</strong> preceding the event giving rise to the claim.</li>
        </ul>
        <p>Some jurisdictions do not allow certain limitations, so parts of this section may not apply to you.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">22. Indemnification</h3>
        <p className="mb-2">You agree to defend, indemnify, and hold harmless us and our affiliates, owners, officers, directors, employees, contractors, licensors, and service providers from and against any claims, liabilities, damages, judgments, awards, losses, costs, and expenses, including reasonable legal fees, arising out of or related to:</p>
        <ul className="list-disc ml-5 space-y-1">
          <li>your use or misuse of the Platform;</li>
          <li>your violation of these Terms;</li>
          <li>your violation of applicable law;</li>
          <li>your violation of any third-party rights;</li>
          <li>your fraud, abuse, or misconduct;</li>
          <li>your content, submissions, or communications;</li>
          <li>disputes between you and another user.</li>
        </ul>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">23. Compliance with Laws and Sanctions</h3>
        <p className="mb-2">You represent and warrant that:</p>
        <ul className="list-disc ml-5 space-y-1">
          <li>you are not subject to sanctions or trade restrictions that prohibit your use of the Platform;</li>
          <li>you will comply with all laws applicable to your use of the Platform;</li>
          <li>you will not use the Platform in connection with unlawful conduct, fraud, money laundering, sanctions evasion, or prohibited activity.</li>
        </ul>
        <p className="mt-2">We may restrict access where necessary for legal or compliance reasons.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">24. Changes to the Platform and These Terms</h3>
        <p className="mb-2">We may update these Terms from time to time.</p>
        <p className="mb-2">If we make material changes, we may post the updated Terms on the Platform and update the "Last Updated" date. Your continued use of the Platform after the updated Terms become effective constitutes your acceptance of the revised Terms.</p>
        <p>We may also modify, suspend, or discontinue any part of the Platform at any time.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">25. Governing Law</h3>
        <p>These Terms and any dispute arising out of or relating to them or the Platform shall be governed by the laws of <strong>[Insert Jurisdiction]</strong>, without regard to conflict of law principles.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">26. Dispute Resolution</h3>
        <p className="mb-2">Any dispute, claim, or controversy arising out of or relating to these Terms or the Platform shall be resolved as follows:</p>
        <ul className="list-disc ml-5 space-y-1 mb-2">
          <li>first, the parties will attempt in good faith to resolve the dispute informally;</li>
          <li>if informal resolution is unsuccessful, the dispute shall be resolved by <strong>binding arbitration</strong> in <strong>[Insert Location]</strong> under the rules of <strong>[Insert Arbitration Rules]</strong>, unless applicable law requires otherwise;</li>
          <li>if arbitration is unenforceable or unavailable, the dispute shall be brought exclusively in the courts located in <strong>[Insert Jurisdiction / Venue]</strong>.</li>
        </ul>
        <p>To the extent permitted by law, you agree that disputes will be resolved only on an individual basis and not as part of any class, consolidated, or representative action.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">27. International Use</h3>
        <p>The Platform may not be appropriate, available, or lawful for use in all locations. We make no representation that the Platform is lawful in any specific jurisdiction. Users who access the Platform do so at their own initiative and are responsible for compliance with local laws.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">28. Severability</h3>
        <p>If any provision of these Terms is held invalid, illegal, or unenforceable, the remaining provisions will remain in full force and effect to the maximum extent permitted by law.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">29. No Waiver</h3>
        <p>Our failure to enforce any provision of these Terms shall not constitute a waiver of that provision or any other provision.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">30. Entire Agreement</h3>
        <p>These Terms, together with our Privacy Policy, Cookie Notice, and any supplemental rules or campaign terms that we publish, constitute the entire agreement between you and us regarding the Platform and supersede prior understandings relating to the same subject matter.</p>
      </section>
      <section>
        <h3 className="font-bold text-black mb-2">31. Contact</h3>
        <p className="mb-2">For legal notices, support, privacy requests, copyright complaints, or questions about these Terms, contact us at:</p>
        <ul className="list-none ml-5 space-y-1">
          <li><strong>Email:</strong> [Insert Contact Email]</li>
          <li><strong>Company / Brand Name:</strong> [Insert Name]</li>
          <li><strong>Address:</strong> [Insert Address, if applicable]</li>
        </ul>
      </section>
      <section className="bg-blue-50 border-2 border-blue-400 p-4 rounded-lg">
        <h3 className="font-bold text-black mb-2">32. Acknowledgment</h3>
        <p className="font-bold">BY CLICKING "ACCEPT" OR BY USING THIS PLATFORM, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THESE TERMS & CONDITIONS IN THEIR ENTIRETY.</p>
      </section>
    </div>
  );
}

// Privacy Policy content - truncated for brevity, will include full content
export function PrivacyContent() {
  return (
    <div className="space-y-6 text-sm leading-relaxed">
      <section>
        <p>This Privacy Policy ("<strong>Policy</strong>") explains how MLEO and/or the operator of the MLEO Platform ("<strong>we</strong>", "<strong>us</strong>", or "<strong>our</strong>") collects, uses, stores, shares, and protects personal data when you access or use our websites, games, applications, wallet-related features, testnet features, support channels, community tools, and related services (collectively, the "<strong>Platform</strong>").</p>
        <p>By accessing or using the Platform, you acknowledge that you have read and understood this Policy.</p>
      </section>
      {/* Rest of privacy content - full content from privacy.js */}
    </div>
  );
}

// Cookies content - truncated for brevity
export function CookiesContent() {
  return (
    <div className="space-y-6 text-sm leading-relaxed">
      <section>
        <p>This Cookie Notice explains how MLEO and/or the operator of the MLEO Platform ("<strong>we</strong>", "<strong>us</strong>", or "<strong>our</strong>") uses cookies, local storage, session storage, pixels, SDKs, and similar technologies ("<strong>Cookies</strong>") when you access or use our websites, games, apps, wallet-related features, and related services (collectively, the "<strong>Platform</strong>").</p>
        <p>This Cookie Notice should be read together with our Privacy Policy and Terms & Conditions.</p>
      </section>
      {/* Rest of cookies content - full content from cookies.js */}
    </div>
  );
}

// Risk content - truncated for brevity
export function RiskContent() {
  return (
    <div className="space-y-6 text-sm leading-relaxed">
      <div className="bg-red-900/30 border-2 border-red-700/50 p-4 rounded-lg mb-6">
        <p className="font-bold text-lg mb-2">⚠️ Important Warning</p>
        <p>This Risk / Testnet Disclaimer explains important risks, limitations, and warnings relating to the use of the MLEO Platform, including any wallet-related, reward-related, blockchain-related, or testnet-related features.</p>
        <p className="mt-2 font-semibold">By accessing or using the Platform, you acknowledge and accept the risks described below.</p>
      </div>
      {/* Rest of risk content - full content from risk.js */}
    </div>
  );
}
