'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { createUnit, updateUnit, deleteUnit } from '@/lib/actions/units';
import { formatCurrency, formatDate } from '@/lib/i18n/hooks';
import { calculateUnitDueDate } from '@/lib/rental/calculations';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { Unit, Location, PaymentCycle, UnitStatus } from '@/types/database';
import type { Locale } from '@/lib/i18n/routing';

export function UnitsManager({
  units, locations, locale, canEdit,
}: {
  units: Unit[];
  locations: Location[];
  locale: string;
  canEdit: boolean;
}) {
  const t = useTranslations('units');
  const tc = useTranslations('common');
  const loc = locale as Locale;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      location_id: fd.get('location_id') as string,
      unit_number: fd.get('unit_number') as string,
      floor: (fd.get('floor') as string) || undefined,
      area_sqm: fd.get('area_sqm') ? Number(fd.get('area_sqm')) : undefined,
      monthly_rent: Number(fd.get('monthly_rent')),
      payment_cycle: fd.get('payment_cycle') as PaymentCycle,
      rent_start_date: (fd.get('rent_start_date') as string) || null,
      rent_end_date: (fd.get('rent_end_date') as string) || null,
      status: fd.get('status') as UnitStatus,
    };

    const result = editing
      ? await updateUnit(locale, editing.id, data)
      : await createUnit(locale, data);

    if (result.success) {
      toast.success(tc('success'));
      setOpen(false);
      setEditing(null);
    } else {
      toast.error('error' in result ? result.error : tc('error'));
    }
  }

  return (
    <>
      {canEdit && (
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="h-4 w-4" />{t('create')}
        </Button>
      )}

      {units.length === 0 ? (
        <p className="text-muted-foreground">{t('empty')}</p>
      ) : (
        <div className="rounded-2xl border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-start">{t('unitNumber')}</th>
                <th className="px-4 py-3 text-start">{t('location')}</th>
                <th className="px-4 py-3 text-start">{t('monthlyRent')}</th>
                <th className="px-4 py-3 text-start">{t('paymentCycle')}</th>
                <th className="px-4 py-3 text-start">{t('dueDate')}</th>
                <th className="px-4 py-3 text-start">{t('rentPeriod')}</th>
                <th className="px-4 py-3 text-start">{t('status')}</th>
                {canEdit && <th className="px-4 py-3 text-end">{tc('actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {units.map((unit) => (
                <tr key={unit.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{unit.unit_number}</td>
                  <td className="px-4 py-3">{unit.location?.name_en ?? '—'}</td>
                  <td className="px-4 py-3">{formatCurrency(Number(unit.monthly_rent), loc)}</td>
                  <td className="px-4 py-3">{tc(`paymentCycle.${unit.payment_cycle}`)}</td>
                  <td className="px-4 py-3">
                    {calculateUnitDueDate(unit) ? formatDate(calculateUnitDueDate(unit)!, loc) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {unit.rent_start_date && unit.rent_end_date
                      ? `${unit.rent_start_date} - ${unit.rent_end_date}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3"><Badge status={unit.status} label={tc(`status.${unit.status}`)} /></td>
                  {canEdit && (
                    <td className="px-4 py-3 text-end space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(unit); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={async () => {
                        if (!confirm(t('deleteConfirm'))) return;
                        const r = await deleteUnit(locale, unit.id);
                        r.success ? toast.success(tc('success')) : toast.error(tc('error'));
                      }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? t('edit') : t('create')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">{t('location')}</label>
            <select name="location_id" defaultValue={editing?.location_id} required className="mt-1.5 flex h-10 w-full rounded-xl border border-border bg-card px-3 text-sm">
              <option value="">{t('selectLocation')}</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name_en}</option>)}
            </select>
          </div>
          <Input name="unit_number" label={t('unitNumber')} defaultValue={editing?.unit_number} required />
          <Input name="floor" label={t('floor')} defaultValue={editing?.floor ?? ''} />
          <Input name="area_sqm" label={t('areaSqm')} type="number" step="0.01" defaultValue={editing?.area_sqm ?? ''} />
          <Input name="monthly_rent" label={t('monthlyRent')} type="number" step="0.01" defaultValue={editing?.monthly_rent} required />
          <Input name="rent_start_date" label={t('rentStartDate')} type="date" defaultValue={editing?.rent_start_date ?? ''} />
          <Input name="rent_end_date" label={t('rentEndDate')} type="date" defaultValue={editing?.rent_end_date ?? ''} />
          <div>
            <label className="text-sm font-medium">{t('paymentCycle')}</label>
            <select name="payment_cycle" defaultValue={editing?.payment_cycle ?? 'monthly'} className="mt-1.5 flex h-10 w-full rounded-xl border border-border bg-card px-3 text-sm">
              {(['monthly', 'quarterly', 'semi_annual', 'yearly'] as const).map((c) => (
                <option key={c} value={c}>{tc(`paymentCycle.${c}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">{t('status')}</label>
            <select name="status" defaultValue={editing?.status ?? 'vacant'} className="mt-1.5 flex h-10 w-full rounded-xl border border-border bg-card px-3 text-sm">
              {(['occupied', 'vacant', 'maintenance'] as const).map((s) => (
                <option key={s} value={s}>{tc(`status.${s}`)}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>{tc('cancel')}</Button>
            <Button type="submit">{tc('save')}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
