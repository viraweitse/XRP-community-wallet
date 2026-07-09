import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Input, Modal, toast } from '@rc/ui';
import { dropsToXrp, formatCrypto, parseXrpInput } from '@rc/types';
import { useCreateWithdrawalIntent, useMe, useStakingPolicy, useStakingWithdrawals } from '../hooks/useStakingApi';

const ACTIVE_STATUSES = ['epoch_pending', 'ready', 'broadcasting'];

const XRPL_ADDR_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
// XRPL DestinationTag is an unsigned 32-bit integer (0..2^32-1). Using the signed-int max
// (2^31-1) here rejected ~half of all valid exchange deposit tags — forcing users to either
// abandon the withdrawal or omit a required tag (which misroutes funds at the exchange).
const MAX_DEST_TAG = 4_294_967_295;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Optional amount (XRP) to prefill, e.g. when opened from Ripple AI (ADR‑142). */
  initialAmount?: string;
}

function toBig(v: string | undefined): bigint {
  try {
    return BigInt(v ?? '0');
  } catch {
    return 0n;
  }
}

export function WithdrawModal({ open, onClose, initialAmount }: Props) {
  const { t } = useTranslation('staking');
  const me = useMe();
  const policy = useStakingPolicy();
  const withdrawals = useStakingWithdrawals();
  const create = useCreateWithdrawalIntent();

  const hasActive = (withdrawals.data ?? []).some((w) => ACTIVE_STATUSES.includes(w.status));
  const ownAddress = me.data?.user.xrplAddress ?? '';
  const available = toBig(me.data?.position?.availableDrops);
  const minWithdraw = toBig(policy.data?.minWithdrawalDrops);
  const epochDays = policy.data?.epochDurationDays ?? 7;

  const [amountInput, setAmountInput] = useState(initialAmount ?? '');
  const [address, setAddress] = useState('');
  const [tagInput, setTagInput] = useState('');

  // Prefill the destination with the user's own address once it loads.
  useEffect(() => {
    if (open && ownAddress && !address) setAddress(ownAddress);
  }, [open, ownAddress, address]);

  const amountDrops = useMemo(() => parseXrpInput(amountInput || ''), [amountInput]);
  const amountBig = amountDrops !== null ? BigInt(amountDrops) : null;

  const tooBig = amountBig !== null && amountBig > available;
  const tooSmall = amountBig !== null && amountBig > 0n && amountBig < minWithdraw;
  const addrValid = XRPL_ADDR_RE.test(address.trim());
  const tagValid = tagInput.trim() === '' || /^[0-9]+$/.test(tagInput.trim());
  const tagNum = tagInput.trim() === '' ? undefined : Number(tagInput.trim());
  const tagInRange = tagNum === undefined || (Number.isInteger(tagNum) && tagNum >= 0 && tagNum <= MAX_DEST_TAG);

  const canSubmit =
    !hasActive &&
    amountBig !== null &&
    amountBig > 0n &&
    !tooBig &&
    !tooSmall &&
    addrValid &&
    tagValid &&
    tagInRange &&
    !create.isPending;

  const onMax = () => setAmountInput(dropsToXrp(available.toString()));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || amountDrops === null) return;
    try {
      await create.mutateAsync({
        amountDrops,
        destinationAddress: address.trim(),
        destinationTag: tagNum,
      });
      toast.success(t('withdraw.success'));
      setAmountInput('');
      setTagInput('');
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      toast.danger(msg.includes('withdrawal_active') ? t('withdraw.activeExists') : t('withdraw.error'));
    }
  };

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title={t('withdraw.title')} size="md">
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        {hasActive && (
          <div className="rounded-lg bg-warning-100 px-4 py-3 text-caption text-warning-700">
            {t('withdraw.activeExists')}
          </div>
        )}
        <Field
          label={t('withdraw.amount.label')}
          helper={t('withdraw.amount.available', {
            amount: formatCrypto(dropsToXrp(available.toString()), 'XRP').value,
          })}
          error={
            tooBig
              ? t('withdraw.amount.error.tooBig')
              : tooSmall
              ? t('withdraw.amount.error.tooSmall', {
                  min: formatCrypto(dropsToXrp(minWithdraw.toString()), 'XRP').value,
                })
              : undefined
          }
        >
          {(id) => (
            <Input
              id={id}
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              inputMode="decimal"
              placeholder="0.000000"
              autoComplete="off"
              invalid={tooBig || tooSmall}
              rightSlot={
                <Button type="button" variant="ghost" size="sm" onClick={onMax}>
                  {t('withdraw.amount.max')}
                </Button>
              }
            />
          )}
        </Field>

        <Field
          label={t('withdraw.destination.label')}
          helper={t('withdraw.destination.helper')}
          error={address && !addrValid ? t('withdraw.destination.error') : undefined}
        >
          {(id) => (
            <Input
              id={id}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              invalid={Boolean(address) && !addrValid}
              className="font-mono"
            />
          )}
        </Field>

        <Field
          label={t('withdraw.tag.label')}
          error={!tagValid || !tagInRange ? t('withdraw.tag.error') : undefined}
        >
          {(id) => (
            <Input
              id={id}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              invalid={!tagValid || !tagInRange}
            />
          )}
        </Field>

        <div className="rounded-lg bg-nested px-4 py-3 text-caption text-neutral-700">
          <span>{t('withdraw.epochNote', { days: epochDays })}</span>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={create.isPending}>
            {t('withdraw.cancel')}
          </Button>
          <Button type="submit" disabled={!canSubmit} loading={create.isPending}>
            {t('withdraw.confirm')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
