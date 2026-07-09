import { Badge, Button, Drawer, toast, useCopyToClipboard, useMediaQuery, Modal } from '@rc/ui';
import { Copy, ExternalLink } from '@rc/ui';
import { explorerTxUrl } from '~/lib/explorers/links';
import { dropsToXrp, formatCrypto, formatDateTime } from '@rc/types';
import { useTranslation } from 'react-i18next';
import type { HistoryTx } from './lib/types';
import { TxStatusBadge } from './components/TxStatusBadge';
import { TxAmount } from './components/TxAmount';
import { formatDecimal } from '~/lib/chains/balances';

/**
 * Network fee, correctly unit'd per chain. EVM fees are stored in wei (18 decimals) of the
 * chain's native coin — rendering them with `dropsToXrp` (÷1e6) + a hardcoded "XRP" label showed
 * a 0.00044 ETH fee as "441000000 XRP". XRPL fees (native or issued-currency payments) are XRP drops.
 */
function feeDisplay(tx: HistoryTx): string {
  if ('raw' in tx.amount) {
    const symbol = tx.amount.chain === 'eth' ? 'ETH' : tx.amount.chain === 'bsc' ? 'BNB' : 'MATIC';
    let wei: bigint;
    try {
      wei = BigInt(tx.fee.drops || '0');
    } catch {
      wei = 0n;
    }
    return `${formatCrypto(formatDecimal(wei, 18), symbol).value} ${symbol}`;
  }
  return `${formatCrypto(dropsToXrp(tx.fee.drops), 'XRP').value} XRP`;
}

interface Props {
  tx: HistoryTx | null;
  open: boolean;
  onClose: () => void;
}

export function TxDetailsDrawer({ tx, open, onClose }: Props) {
  const { t } = useTranslation('history');
  const { copy } = useCopyToClipboard();
  const isMobile = useMediaQuery('(max-width: 767px)');

  if (!tx) return null;

  const content = <Body tx={tx} onCopy={async (s) => (await copy(s)) && toast.success(t('details.copied'))} />;

  if (isMobile) {
    return (
      <Modal open={open} onOpenChange={(o) => !o && onClose()} title={t('details.title')} size="lg">
        {content}
      </Modal>
    );
  }
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} title={t('details.title')} width={480}>
      {content}
    </Drawer>
  );
}

function Body({ tx, onCopy }: { tx: HistoryTx; onCopy: (s: string) => void }) {
  const { t } = useTranslation('history');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <TxStatusBadge status={tx.status} />
        <Badge variant="neutral">{t(`filters.types.${tx.type}`)}</Badge>
        {tx.source === 'user_send' && <Badge variant="info">{t('details.userSendBadge')}</Badge>}
      </div>

      <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 text-body">
        <Row label={t('details.amount')}>
          <TxAmount tx={tx} />
        </Row>
        <Row label={t('details.fee')}>
          <span className="text-neutral-900">{feeDisplay(tx)}</span>
        </Row>
        <Row label={tx.direction === 'outgoing' ? t('details.to') : t('details.from')}>
          <div className="font-mono text-neutral-900 break-all">
            {tx.counterparty.address}
            {tx.counterparty.label && (
              <span className="ml-2 font-sans text-caption text-neutral-500">
                ({tx.counterparty.label})
              </span>
            )}
          </div>
        </Row>
        {tx.counterparty.destinationTag !== null && (
          <Row label={t('details.memo')}>
            <span className="font-mono text-neutral-900">{tx.counterparty.destinationTag}</span>
          </Row>
        )}
        {tx.memo && (
          <Row label={t('details.memoText')}>
            <span className="text-neutral-900 break-all">{tx.memo}</span>
          </Row>
        )}
        <Row label={t('details.created')}>
          <span className="text-neutral-700">{formatDateTime(tx.createdAt, undefined, 'full')}</span>
        </Row>
        {tx.completedAt && (
          <Row label={t('details.completed')}>
            <span className="text-neutral-700">{formatDateTime(tx.completedAt, undefined, 'full')}</span>
          </Row>
        )}
        <Row label={t('details.txHash')}>
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="font-mono text-neutral-700 truncate" title={tx.txHash}>
              {tx.txHash}
            </span>
            <Button variant="ghost" size="sm" leftIcon={<Copy className="h-4 w-4" />} onClick={() => onCopy(tx.txHash)}>
              {t('details.copy')}
            </Button>
            <ExplorerLink tx={tx} />
          </div>
        </Row>
        {tx.ledgerIndex !== null && (
          <Row label={t('details.ledgerIndex')}>
            <span className="font-mono text-neutral-700">{tx.ledgerIndex}</span>
          </Row>
        )}
        {tx.failure && (
          <Row label={t('details.failed.code')}>
            <div className="flex flex-col gap-1">
              <span className="font-mono text-danger-700">{tx.failure.code}</span>
              <span className="text-caption text-neutral-500">{tx.failure.message}</span>
            </div>
          </Row>
        )}
      </dl>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-neutral-500">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function ExplorerLink({ tx }: { tx: HistoryTx }) {
  const { t } = useTranslation('history');
  const url = explorerTxUrl(tx);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 text-caption text-brand-600 hover:underline"
    >
      {t('details.viewOnExplorer')}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  );
}
