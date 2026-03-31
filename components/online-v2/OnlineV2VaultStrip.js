import { useEffect, useState } from "react";
import {
  peekOnlineV2Vault,
  readOnlineV2Vault,
  subscribeOnlineV2Vault,
} from "../../lib/online-v2/onlineV2VaultBridge";
import { formatCompactNumber } from "../../lib/solo-v2/formatCompactNumber";

/**
 * Compact vault readout using the Online V2 bridge (no direct rush key access).
 */
export default function OnlineV2VaultStrip({ compact = false }) {
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    readOnlineV2Vault({ fresh: true }).catch(() => {});
    setBalance(peekOnlineV2Vault().balance);
    return subscribeOnlineV2Vault(snap => {
      setBalance(snap.balance);
    });
  }, []);

  return (
    <div
      className={
        compact
          ? "inline-flex h-9 items-center rounded-full border border-emerald-500/35 bg-emerald-950/35 px-2.5 text-[11px] font-semibold tabular-nums text-emerald-100 sm:h-9 sm:px-3 sm:text-[11px] lg:h-8 lg:min-h-[32px] lg:px-3 lg:text-[11px]"
          : "rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-2 py-1 text-[11px] font-semibold tabular-nums text-emerald-100 lg:text-[10px]"
      }
      title="Product vault via OV2 bridge"
    >
      {compact ? (
        <>
          <span aria-hidden>🪙</span>
          <span className="ml-1">{formatCompactNumber(balance)}</span>
        </>
      ) : (
        <>Vault: {balance.toLocaleString()}</>
      )}
    </div>
  );
}
