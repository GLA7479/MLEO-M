"use client";

import { useEffect } from "react";
import { useRouter } from "next/router";

/**
 * Unsupported OV2 game routes: immediate navigation to shared rooms (no legacy shell).
 */
export default function Ov2HardRedirectToSharedRooms() {
  const router = useRouter();
  useEffect(() => {
    void router.replace("/online-v2/rooms");
  }, [router]);
  return (
    <div className="flex min-h-[50dvh] items-center justify-center bg-zinc-950 px-4 text-center text-sm text-zinc-400">
      Opening rooms…
    </div>
  );
}
