import { useEffect, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { supabaseMP } from "../../lib/supabaseClients";

function formatVault(n) {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return String(Math.floor(num));
}

export default function SoloV2GameUserMenuContent({ vaultBalance = 0, onClose }) {
  const [userInfo, setUserInfo] = useState({ email: null, username: null, isGuest: true });

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabaseMP.auth.getSession();
        if (data?.session?.user) {
          const user = data.session.user;
          setUserInfo({
            email: user.email || null,
            username: user.user_metadata?.username || user.email?.split("@")[0] || null,
            isGuest: false,
          });
        } else {
          setUserInfo({ email: null, username: null, isGuest: true });
        }
      } catch {
        setUserInfo({ email: null, username: null, isGuest: true });
      }
    };
    load();
    const { data: { subscription } } = supabaseMP.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const user = session.user;
        setUserInfo({
          email: user.email || null,
          username: user.user_metadata?.username || user.email?.split("@")[0] || null,
          isGuest: false,
        });
      } else {
        setUserInfo({ email: null, username: null, isGuest: true });
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    try {
      await supabaseMP.auth.signOut();
    } catch {
      // ignore
    }
    onClose?.();
  }

  return (
    <div className="space-y-3 text-left text-sm text-zinc-200">
      <div className="rounded-lg border border-white/15 bg-black/25 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Account</p>
        <div className="mt-1 flex items-center justify-between gap-2 text-xs">
          <span className="text-zinc-400">Status</span>
          <span className={userInfo.isGuest ? "text-amber-200/90" : "text-emerald-300"}>
            {userInfo.isGuest ? "Guest" : "Signed in"}
          </span>
        </div>
        {!userInfo.isGuest ? (
          <p className="mt-1 truncate text-xs text-zinc-300">{userInfo.email || userInfo.username}</p>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">Play continues with your device session.</p>
        )}
      </div>

      <div className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400/80">Vault (this game)</p>
        <p className="mt-0.5 text-lg font-bold text-emerald-300">{formatVault(vaultBalance)}</p>
      </div>

      <div className="rounded-lg border border-white/15 bg-black/25 px-3 py-2">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Wallet</p>
        <div className="flex justify-center [&_button]:max-w-full">
          <ConnectButton chainStatus="none" accountStatus="avatar" showBalance={false} />
        </div>
      </div>

      <Link
        href="/arcade-v2"
        onClick={() => onClose?.()}
        className="block rounded-lg border border-amber-400/30 bg-amber-500/15 px-3 py-2 text-center text-xs font-semibold text-amber-100 hover:bg-amber-500/25"
      >
        Arcade hub
      </Link>

      {!userInfo.isGuest ? (
        <button
          type="button"
          onClick={handleLogout}
          className="w-full rounded-lg border border-red-400/35 bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-100 hover:bg-red-500/30"
        >
          Sign out
        </button>
      ) : (
        <Link
          href="/"
          onClick={() => onClose?.()}
          className="block rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-white/15"
        >
          Sign in on main site
        </Link>
      )}
    </div>
  );
}
