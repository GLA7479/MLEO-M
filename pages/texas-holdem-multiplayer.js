import { useState } from 'react';
import TexasHoldemMultiplayerPage from '../game/mleo-texas-holdem-multiplayer';
import TexasHoldemSupabasePage from '../game/mleo-texas-holdem-supabase';

export default function TexasHoldemMultiplayerGamePage() {
  const [useSimpleVersion, setUseSimpleVersion] = useState(true);

  // Show version selector if no version is chosen
  if (typeof window !== 'undefined' && !localStorage.getItem('texas-holdem-version')) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-black to-blue-900 flex items-center justify-center">
        <div className="bg-black/30 border border-white/10 rounded-2xl p-8 max-w-md w-full mx-4">
          <h1 className="text-3xl font-extrabold text-white mb-6 text-center">🎴 Texas Hold'em</h1>
          <p className="text-white/70 text-center mb-6">Choose your version:</p>
          
          <div className="space-y-4">
            <button
              onClick={() => {
                localStorage.setItem('texas-holdem-version', 'simple');
                setUseSimpleVersion(true);
              }}
              className="w-full py-4 rounded-lg font-bold text-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg hover:brightness-110 transition-all"
            >
              🚀 Supabase Version (Recommended)
            </button>
            
            <button
              onClick={() => {
                localStorage.setItem('texas-holdem-version', 'old');
                setUseSimpleVersion(false);
              }}
              className="w-full py-4 rounded-lg font-bold text-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg hover:brightness-110 transition-all"
            >
              🔧 Original Version
            </button>
          </div>
          
          <div className="mt-6 text-xs text-white/60 text-center">
            <p>• Supabase version: Real-time multiplayer with Supabase</p>
            <p>• Original version: Previous WebRTC implementation</p>
          </div>
        </div>
      </div>
    );
  }

  // Use the selected version
  const shouldUseSimple = typeof window !== 'undefined' ? 
    localStorage.getItem('texas-holdem-version') === 'simple' : true;
  
  return shouldUseSimple ? <TexasHoldemSupabasePage /> : <TexasHoldemMultiplayerPage />;
}

// Add getStaticProps to fix Next.js error
export async function getStaticProps() {
  return {
    props: {},
  };
}

