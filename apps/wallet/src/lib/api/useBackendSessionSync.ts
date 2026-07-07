import { useEffect, useRef } from 'react';
import { useWalletProfile } from '~/lib/wallet/useWallet';
import { getUnlockedSlot } from '~/lib/wallet/vault';
import { clearAccessToken } from '~/lib/api/client';
import { getSessionAddress } from '~/lib/api/session';

/**
 * Keeps the backend session bound to the active wallet account. On account switch — and on
 * first entry to the authed shell after unlock/create — re-runs SIWX for the active account
 * so per-account staking data (deposit memo, position) reflects the right backend user
 * instead of whichever account happened to sign in first.
 *
 * Ledger accounts hold no client-side secret, so they cannot SIWX this way and are skipped
 * (their backend session, if any, is established elsewhere).
 */
export function useBackendSessionSync(): void {
  const { profile } = useWalletProfile();
  const address = profile?.address ?? null;
  const attempting = useRef<string | null>(null);

  useEffect(() => {
    if (!address || !profile) return;
    if (getSessionAddress() === address) return; // already bound to this account
    if (attempting.current === address) return; // attempt already in flight
    const slot = getUnlockedSlot(profile.id);
    if (!slot?.secret) {
      // Ledger / no client-side secret: can't SIWX. Drop any other account's session so the
      // staking views show nothing rather than the previous account's memo/position.
      if (getSessionAddress() !== null) clearAccessToken();
      return;
    }

    attempting.current = address;
    let cancelled = false;
    void (async () => {
      try {
        clearAccessToken(); // unbind token + session → per-account queries pause (no stale flash)
        const { walletSignIn } = await import('~/features/auth/walletSignIn');
        await walletSignIn({ seed: slot.secret, address }); // re-binds the session on success
        // A newer account switch may have superseded this attempt while the SIWX round-trip was
        // in flight. walletSignIn unconditionally binds the session to `address`, so a stale
        // attempt that resolves last would leave the token/session pointing at the wrong account
        // — per-account queries (staking position, deposit destination tag, withdrawal prefill)
        // would then load/act on another account's data. If this superseded attempt won the race,
        // drop its binding so we never show or transact under the wrong account.
        if (cancelled && getSessionAddress() === address) {
          clearAccessToken();
        }
      } catch {
        // best-effort: leave the session unbound; it retries on the next account/profile change
      } finally {
        if (!cancelled && attempting.current === address) attempting.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, profile]);
}
