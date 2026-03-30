import { useEffect, useState } from "react";
import {
  peekOnlineV2Vault,
  readOnlineV2Vault,
  subscribeOnlineV2Vault,
} from "../../lib/online-v2/onlineV2VaultBridge";

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
          ? "inline-flex rounded-md border border-emerald-500/35 bg-emerald-950/35 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-100 sm:text-[10px]"
          : "rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-2 py-1 text-[11px] font-semibold tabular-nums text-emerald-100 lg:text-[10px]"
      }
      title="Product vault via OV2 bridge"
    >
      Vault: {balance.toLocaleString()}
    </div>
  );
}
