import type { HistoryTx } from '~/features/history/lib/types';

const XRPL_RPC = 'https://xrplcluster.com/';

interface AccountTxResponse {
  result?: {
    status: 'success' | 'error';
    transactions?: Array<{
      meta?: { TransactionResult?: string; delivered_amount?: string | { value?: string; currency?: string; issuer?: string } };
      tx?: {
        TransactionType?: string;
        Account?: string;
        Destination?: string;
        Amount?: string | { value?: string; currency?: string; issuer?: string };
        Fee?: string;
        DestinationTag?: number;
        Memos?: Array<{ Memo?: { MemoData?: string } }>;
        hash?: string;
        ledger_index?: number;
        date?: number;
      };
      validated?: boolean;
    }>;
    error?: string;
  };
}

function ripple2unix(rippleTs: number): string {
  // XRPL дата — секунды с 2000-01-01 UTC.
  const RIPPLE_EPOCH = 946_684_800; // 2000-01-01T00:00:00Z в unix
  return new Date((rippleTs + RIPPLE_EPOCH) * 1000).toISOString();
}

function decodeMemo(memos?: Array<{ Memo?: { MemoData?: string } }>): string | null {
  const data = memos?.[0]?.Memo?.MemoData;
  if (!data) return null;
  try {
    const bytes = new Uint8Array((data.match(/.{1,2}/gu) ?? []).map((h) => parseInt(h, 16)));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export async function fetchXrplHistory(address: string, limit = 30): Promise<HistoryTx[]> {
  const body = {
    method: 'account_tx',
    params: [
      {
        account: address,
        ledger_index_min: -1,
        ledger_index_max: -1,
        limit,
        forward: false,
      },
    ],
  };
  const res = await fetch(XRPL_RPC, {
    method: 'POST',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`xrpl: HTTP ${res.status}`);
  const data = (await res.json()) as AccountTxResponse;
  if (data.result?.status !== 'success' || !data.result.transactions) return [];

  const txs: HistoryTx[] = [];
  for (const entry of data.result.transactions) {
    const tx = entry.tx;
    if (!tx || tx.TransactionType !== 'Payment' || !tx.hash || !tx.date || !tx.Account || !tx.Destination) continue;
    const isOutgoing = tx.Account === address;
    const counterparty = isOutgoing ? tx.Destination : tx.Account;
    const status: 'completed' | 'failed' =
      entry.meta?.TransactionResult === 'tesSUCCESS' ? 'completed' : 'failed';

    // XRPL partial payments (tfPartialPayment) set `Amount` to the sender-specified *maximum*,
    // while the value actually delivered is `meta.delivered_amount`. Displaying `Amount` lets an
    // attacker show the victim a huge "incoming" payment that never arrived (fake-deposit social
    // engineering), so always prefer the delivered amount when the ledger reports it.
    const delivered = entry.meta?.delivered_amount;
    const effectiveAmount =
      delivered !== undefined && delivered !== 'unavailable' ? delivered : tx.Amount;

    let amount: HistoryTx['amount'];
    if (typeof effectiveAmount === 'string') {
      amount = { currency: 'XRP' as const, drops: effectiveAmount };
    } else if (effectiveAmount && typeof effectiveAmount === 'object' && effectiveAmount.value) {
      amount = {
        currency: effectiveAmount.currency ?? '?',
        value: effectiveAmount.value,
        issuer: effectiveAmount.issuer ?? null,
      };
    } else {
      continue;
    }

    txs.push({
      id: tx.hash,
      source: 'live',
      type: 'payment',
      direction: isOutgoing ? 'outgoing' : 'incoming',
      status,
      amount,
      fee: { drops: tx.Fee ?? '0' },
      counterparty: {
        address: counterparty,
        label: null,
        destinationTag: tx.DestinationTag ?? null,
      },
      memo: decodeMemo(tx.Memos),
      txHash: tx.hash,
      ledgerIndex: tx.ledger_index ?? null,
      createdAt: ripple2unix(tx.date),
      completedAt: ripple2unix(tx.date),
    });
  }
  return txs;
}
