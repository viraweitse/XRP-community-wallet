import {
  Badge,
  Button,
  Card,
  CardActions,
  CardHeader,
  CardTitle,
  EmptyState,
  Helper,
  MobileList,
  MobileListItem,
  Table,
  Td,
  Th,
  Tr,
  useMediaQuery,
} from '@rc/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Inbox } from '@rc/ui';
import {
  dropsToXrp,
  formatCrypto,
  formatDateTime,
  maskAddress,
  truncateMiddle,
  type Transaction,
} from '@rc/types';
import { useRecentUserTxs } from '../hooks/useRecentUserTxs';
import { useActiveAccount } from '~/lib/wallet/useWallet';

function statusVariant(s: Transaction['status']) {
  if (s === 'completed') return 'success' as const;
  if (s === 'failed') return 'danger' as const;
  if (s === 'pending') return 'warning' as const;
  return 'info' as const;
}

function statusLabelKey(s: Transaction['status']): 'pending' | 'completed' | 'failed' {
  return s;
}

function txAmountDisplay(tx: Transaction): string {
  if ('drops' in tx.amount) {
    const xrp = dropsToXrp(tx.amount.drops);
    const f = formatCrypto(xrp, 'XRP');
    return `${f.value} ${f.symbol}`;
  }
  const f = formatCrypto(tx.amount.value, tx.amount.currency);
  return `${f.value} ${f.symbol}`;
}

// The user's own side of a tx is labelled with the active wallet's own label/address — not the
// hardcoded English string "Treasury Account", which both violated the i18n rule and factually
// mislabelled the user's own wallet as a treasury on every real transaction.
function txSource(tx: Transaction, ownLabel: string): string {
  if (tx.direction === 'outgoing') return ownLabel;
  return tx.counterparty.label ?? maskAddress(tx.counterparty.address);
}

function txDestination(tx: Transaction, ownLabel: string): string {
  if (tx.direction === 'outgoing')
    return tx.counterparty.label ?? maskAddress(tx.counterparty.address);
  return ownLabel;
}

export function LastTransactionsCard() {
  const { t } = useTranslation('dashboard');
  const { t: tCommon } = useTranslation('common');
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const items = useRecentUserTxs(5);
  const { profile } = useActiveAccount();
  const ownLabel = profile?.label?.trim() || (profile ? maskAddress(profile.address) : '—');

  return (
    <Card>
      <CardHeader>
        <CardTitle helper={<Helper text={t('widgets.lastTransactions.helper')} />}>
          {t('widgets.lastTransactions.title')}
        </CardTitle>
        <CardActions>
          <Button
            variant="link"
            size="sm"
            rightIcon={<ChevronRight className="h-4 w-4" aria-hidden="true" />}
            onClick={() => navigate('/history')}
          >
            {tCommon('actions.viewAll')}
          </Button>
        </CardActions>
      </CardHeader>

      {items.length === 0 ? (
        <EmptyState icon={<Inbox className="h-10 w-10" />} title={t('widgets.lastTransactions.empty')} />
      ) : isMobile ? (
        <MobileList>
          {items.map((tx) => (
            <MobileListItem
              key={tx.id}
              top={
                <>
                  <span>{formatDateTime(tx.createdAt)}</span>
                  <Badge variant={statusVariant(tx.status)}>
                    {tCommon(`status.${statusLabelKey(tx.status)}`)}
                  </Badge>
                </>
              }
              middle={
                <span className="text-neutral-500">
                  {truncateMiddle(txSource(tx, ownLabel), 24)} → {truncateMiddle(txDestination(tx, ownLabel), 24)}
                </span>
              }
              bottom={txAmountDisplay(tx)}
            />
          ))}
        </MobileList>
      ) : (
        <Table className="table-fixed">
          <colgroup>
            <col className="w-[120px]" />
            <col />
            <col />
            <col className="w-[180px]" />
            <col className="w-[120px]" />
          </colgroup>
          <thead>
            <Tr>
              <Th>{t('widgets.lastTransactions.columns.createdAt')}</Th>
              <Th>{t('widgets.lastTransactions.columns.source')}</Th>
              <Th>{t('widgets.lastTransactions.columns.destination')}</Th>
              <Th align="right">{t('widgets.lastTransactions.columns.value')}</Th>
              <Th>{t('widgets.lastTransactions.columns.status')}</Th>
            </Tr>
          </thead>
          <tbody>
            {items.map((tx) => (
              <Tr key={tx.id}>
                <Td className="text-neutral-500">{formatDateTime(tx.createdAt)}</Td>
                <Td>
                  <div className="truncate" title={txSource(tx, ownLabel)}>
                    {txSource(tx, ownLabel)}
                  </div>
                </Td>
                <Td>
                  <div className="truncate" title={txDestination(tx, ownLabel)}>
                    {txDestination(tx, ownLabel)}
                  </div>
                </Td>
                <Td align="right" className="text-neutral-900 font-medium">
                  {txAmountDisplay(tx)}
                </Td>
                <Td>
                  <Badge variant={statusVariant(tx.status)}>
                    {tCommon(`status.${statusLabelKey(tx.status)}`)}
                  </Badge>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
