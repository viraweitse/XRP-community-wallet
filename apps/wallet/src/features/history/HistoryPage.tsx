import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Banner, Button, Card, LoadingState, useMediaQuery } from '@rc/ui';
import { useHistoryData } from './hooks/useHistoryData';
import { applyFilters, emptyFilters, isDefaultFilters, type TxFilters as TxFiltersState, type PeriodFilter, type StatusFilter } from './lib/filters';
import { TxFilters } from './components/TxFilters';
import { TxTable } from './components/TxTable';
import { TxMobileList } from './components/TxMobileList';
import { EmptyHistory } from './components/EmptyHistory';
import { TxDetailsDrawer } from './TxDetailsDrawer';
import type { HistoryTx, TxType } from './lib/types';

function readFiltersFromUrl(sp: URLSearchParams): TxFiltersState {
  const f = emptyFilters();
  const tParam = sp.get('type');
  if (tParam) {
    const allowed: TxType[] = ['payment'];
    if (allowed.includes(tParam as TxType)) {
      f.types = new Set([tParam as TxType]);
    }
  }
  const sParam = sp.get('status');
  if (sParam && ['pending', 'completed', 'failed'].includes(sParam)) {
    f.status = sParam as StatusFilter;
  }
  const pParam = sp.get('period');
  if (pParam && ['today', '7d', '30d', 'all'].includes(pParam)) {
    f.period = pParam as PeriodFilter;
  }
  const qParam = sp.get('q');
  if (qParam) f.search = qParam;
  return f;
}

export function HistoryPage() {
  const { t } = useTranslation('history');
  const [searchParams, setSearchParams] = useSearchParams();
  const { txs, loading, hasErrors } = useHistoryData();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const [filters, setFilters] = useState<TxFiltersState>(() => readFiltersFromUrl(searchParams));
  const [selected, setSelected] = useState<HistoryTx | null>(null);

  // URL sync (one direction: filters → URL).
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    const demo = searchParams.get('demo');
    next.delete('type');
    next.delete('status');
    next.delete('period');
    next.delete('q');
    if (filters.types.size === 1) {
      const [only] = Array.from(filters.types);
      if (only) next.set('type', only);
    }
    if (filters.status !== 'all') next.set('status', filters.status);
    if (filters.period !== 'all') next.set('period', filters.period);
    if (filters.search) next.set('q', filters.search);
    if (demo) next.set('demo', demo);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const filtered = useMemo(() => applyFilters(txs, filters), [txs, filters]);
  const totalCount = txs.length;
  const filteredCount = filtered.length;
  const noResults = totalCount > 0 && filteredCount === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1 text-neutral-900">{t('title')}</h1>
        <p className="text-body text-neutral-500">{t('subtitle')}</p>
      </div>

      {hasErrors && (
        <Banner
          severity="warning"
          title={t('errors.explorer.title')}
          body={t('errors.explorer.body')}
        />
      )}

      {totalCount > 0 && (
        <Card>
          <TxFilters filters={filters} onChange={setFilters} totals={txs} />
          {!isDefaultFilters(filters) && (
            <div className="mt-3 flex items-center justify-between">
              <span className="text-caption text-neutral-500">
                {t('list.showing', { shown: filteredCount, total: totalCount })}
              </span>
              <Button variant="link" size="sm" onClick={() => setFilters(emptyFilters())}>
                {t('filters.clear')}
              </Button>
            </div>
          )}
        </Card>
      )}

      {loading && totalCount === 0 ? (
        // Live XRPL/EVM history is still loading — don't render the "you have no transactions"
        // empty state, which flashed on funded accounts for the duration of the network fetch.
        <Card>
          <LoadingState variant="card" label={t('title')} />
        </Card>
      ) : totalCount === 0 ? (
        <Card>
          <EmptyHistory filtered={false} />
        </Card>
      ) : noResults ? (
        <Card>
          <EmptyHistory filtered />
        </Card>
      ) : (
        <Card>
          {isMobile ? (
            <TxMobileList txs={filtered} onSelect={setSelected} />
          ) : (
            <TxTable txs={filtered} onSelect={setSelected} />
          )}
        </Card>
      )}

      <TxDetailsDrawer tx={selected} open={selected !== null} onClose={() => setSelected(null)} />
    </div>
  );
}
