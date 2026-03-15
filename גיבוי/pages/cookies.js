// pages/cookies.js
import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import Link from "next/link";
import Head from "next/head";
import { useRouter } from "next/router";
import PolicyModal from "../components/PolicyModal";

export default function CookieNotice() {
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
    <Layout title="Cookie Notice — MLEO">
      <Head>
        <meta name="description" content="MLEO Cookie Notice - How we use cookies and similar technologies" />
      </Head>
      
      <PolicyModal 
        isOpen={isOpen} 
        onClose={handleClose}
        title="Cookie Notice"
      >
        <div className="prose prose-invert max-w-none space-y-6 text-sm leading-relaxed">
          <p className="text-xs text-gray-400 mb-4">Last Updated: [Insert Date]</p>
            <section>
              <p>
                This Cookie Notice explains how MLEO and/or the operator of the MLEO Platform ("<strong>we</strong>", "<strong>us</strong>", or "<strong>our</strong>") uses cookies, local storage, session storage, pixels, SDKs, and similar technologies ("<strong>Cookies</strong>") when you access or use our websites, games, apps, wallet-related features, and related services (collectively, the "<strong>Platform</strong>").
              </p>
              <p>
                This Cookie Notice should be read together with our <Link href="/privacy" className="text-blue-400 hover:text-blue-300 underline">Privacy Policy</Link> and <Link href="/terms" className="text-blue-400 hover:text-blue-300 underline">Terms & Conditions</Link>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">1. What Are Cookies and Similar Technologies</h2>
              <p className="mb-2">
                Cookies are small text files placed on your browser or device when you visit a website or use an application. Similar technologies may include:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>local storage;</li>
                <li>session storage;</li>
                <li>tags;</li>
                <li>pixels;</li>
                <li>scripts;</li>
                <li>SDKs;</li>
                <li>device identifiers;</li>
                <li>log-based tracking tools.</li>
              </ul>
              <p className="mt-2">
                These technologies help websites and apps function properly, remember preferences, improve performance, analyze usage, and support security and fraud prevention.
              </p>
              <p className="mt-2">
                For simplicity, we refer to all of these technologies as "Cookies" in this Notice, unless otherwise stated.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">2. Why We Use Cookies</h2>
              <p className="mb-4">We may use Cookies for the following purposes:</p>

              <h3 className="text-lg font-semibold mt-6 mb-2">A. Strictly Necessary Cookies</h3>
              <p className="mb-2">These Cookies are necessary for the Platform to function properly and securely. They may be used to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>enable core site functionality;</li>
                <li>maintain sessions;</li>
                <li>remember basic user settings;</li>
                <li>provide security features;</li>
                <li>protect against abuse, fraud, and malicious activity;</li>
                <li>support load balancing or infrastructure stability;</li>
                <li>maintain wallet-related connection state where applicable.</li>
              </ul>
              <p className="mt-2">
                These Cookies do not usually require consent where permitted by law because they are necessary for the operation of the Platform.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-2">B. Functional Cookies</h3>
              <p className="mb-2">These Cookies help us remember preferences and improve your experience, such as:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>language preferences;</li>
                <li>display settings;</li>
                <li>game settings;</li>
                <li>gameplay-related state;</li>
                <li>basic user interface customizations;</li>
                <li>saved preferences across visits.</li>
              </ul>

              <h3 className="text-lg font-semibold mt-6 mb-2">C. Analytics and Performance Cookies</h3>
              <p className="mb-2">These Cookies help us understand how users interact with the Platform so we can improve design, performance, and gameplay experience. They may be used to collect information such as:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>pages visited;</li>
                <li>features used;</li>
                <li>clicks and interactions;</li>
                <li>session length;</li>
                <li>performance issues;</li>
                <li>crash data;</li>
                <li>browser and device type;</li>
                <li>general usage trends.</li>
              </ul>
              <p className="mt-2">
                Where required by law, we will obtain consent before using non-essential analytics Cookies.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-2">D. Security and Anti-Abuse Technologies</h3>
              <p className="mb-2">We may use Cookies and related technologies to detect and prevent:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>bot activity;</li>
                <li>session abuse;</li>
                <li>automated exploitation;</li>
                <li>suspicious or repeated claim activity;</li>
                <li>manipulation of gameplay or platform features;</li>
                <li>unauthorized access attempts.</li>
              </ul>
              <p className="mt-2">
                These protections may be necessary to protect the Platform, users, and reward systems.
              </p>

              <h3 className="text-lg font-semibold mt-6 mb-2">E. Testing and Improvement Tools</h3>
              <p className="mb-2">We may use certain technologies to:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>test new features;</li>
                <li>evaluate interface improvements;</li>
                <li>measure feature reliability;</li>
                <li>understand how updates affect performance or usability.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">3. Types of Information Collected Through Cookies</h2>
              <p className="mb-2">Depending on the technology used, Cookies may collect or store information such as:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>IP address;</li>
                <li>browser type and version;</li>
                <li>operating system;</li>
                <li>device identifiers;</li>
                <li>preferred language;</li>
                <li>session identifiers;</li>
                <li>site navigation data;</li>
                <li>pages or screens viewed;</li>
                <li>interaction events;</li>
                <li>timestamps;</li>
                <li>approximate location derived from IP;</li>
                <li>technical diagnostics;</li>
                <li>locally stored gameplay or preference data.</li>
              </ul>
              <p className="mt-2">
                Some Cookies may assign or store unique identifiers.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">4. Local Storage and Game-Related Functionality</h2>
              <p className="mb-2">
                Because the Platform may include browser-based games, game progress systems, or wallet-related UI logic, we may use local storage or session storage to support:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>game state persistence;</li>
                <li>session continuity;</li>
                <li>user preferences;</li>
                <li>temporary gameplay progress;</li>
                <li>UI settings;</li>
                <li>feature flags;</li>
                <li>locally stored technical states.</li>
              </ul>
              <p className="mt-2 font-semibold">
                Please note that locally stored browser data may be lost, reset, modified, blocked by your browser, or unavailable across devices. We do not guarantee that browser-stored data will always persist.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">5. Third-Party Cookies and Technologies</h2>
              <p className="mb-2">
                We may allow trusted third-party providers to place or access Cookies or similar technologies for purposes such as:
              </p>
              <ul className="list-disc ml-6 space-y-1">
                <li>analytics;</li>
                <li>performance monitoring;</li>
                <li>hosting or infrastructure support;</li>
                <li>security services;</li>
                <li>wallet integration support;</li>
                <li>embedded content functionality.</li>
              </ul>
              <p className="mt-2">
                These third parties may collect information according to their own privacy notices and policies. We do not control all third-party technologies once enabled through their services.
              </p>
              <p className="mt-2">
                Examples may include providers related to hosting, analytics, monitoring, wallet connection infrastructure, embedded media, or technical support tools.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">6. Consent and Lawful Use</h2>
              <p className="mb-2">
                Where required by applicable law, we will ask for your consent before using non-essential Cookies or similar technologies.
              </p>
              <p className="mb-2">
                Where permitted, strictly necessary Cookies may be used without consent because they are required for the functioning, security, or integrity of the Platform.
              </p>
              <p>
                If you give consent, you may later withdraw it through available cookie settings, consent tools, or relevant browser controls, subject to technical limitations.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">7. How to Manage Cookies</h2>
              <p className="mb-2">You may be able to control or disable Cookies through:</p>
              <ul className="list-disc ml-6 space-y-1">
                <li>your browser settings;</li>
                <li>device settings;</li>
                <li>cookie banners or consent tools on the Platform, where available;</li>
                <li>privacy tools or extensions.</li>
              </ul>
              <p className="mt-2 font-semibold">
                Please note that blocking or disabling certain Cookies may affect the functionality, availability, security, or performance of the Platform, including gameplay features, stored preferences, wallet-related UI behavior, and session continuity.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">8. Browser-Based Storage Limitations</h2>
              <p className="mb-2">
                Some Platform features may rely on local or session storage rather than traditional browser cookies. If you clear your browser data, change devices, use private browsing, install blockers, or disable storage permissions, some gameplay state or saved settings may no longer be available.
              </p>
              <p>
                We are not responsible for data loss caused by browser clearing, device changes, extension interference, privacy settings, or user-configured deletion of stored local data.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold mt-8 mb-4">9. Changes to This Cookie Notice</h2>
              <p className="mb-2">We may update this Cookie Notice from time to time. If we do, we may post the updated version on the Platform and revise the "Last Updated" date.</p>
              <p>
                Your continued use of the Platform after the updated Cookie Notice becomes effective constitutes your acknowledgment of the revised notice, to the extent permitted by applicable law.
              </p>
            </section>

            <section className="bg-blue-900/20 border border-blue-700/30 p-4 rounded-lg">
              <h2 className="text-xl font-bold mt-8 mb-4">10. Contact Us</h2>
              <p className="mb-2">
                If you have questions about this Cookie Notice or our use of Cookies, contact us at:
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
