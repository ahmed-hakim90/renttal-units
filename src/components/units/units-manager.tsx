'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { createUnit, updateUnit, deleteUnit } from '@/lib/actions/units';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { Unit, Location, UnitStatus } from '@/types/database';

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
  const searchParams = useSearchParams();
  const search = searchParams.get('search')?.trim().toLowerCase() ?? '';
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [selectedStatus, setSelectedStatus] = useState<UnitStatus>('vacant');

  const visibleUnits = useMemo(() => {
    if (!search) return units;
    return units.filter((unit) => [
      unit.unit_number,
      unit.location?.name_en,
      unit.location?.name_ar,
      unit.tenant?.full_name,
      unit.status,
    ].join(' ').toLowerCase().includes(search));
  }, [search, units]);

  function openCreateModal() {
    setEditing(null);
    setSelectedStatus('vacant');
    setOpen(true);
  }

  function openEditModal(unit: Unit) {
    setEditing(unit);
    setSelectedStatus(unit.status);
    setOpen(true);
  }

  function closeModal() {
    if (isSavingRef.current) return;
    setOpen(false);
  }

  function getActionErrorMessage(error: string) {
    if (error === 'duplicateUnit') return t('duplicateUnit');
    if (error === 'unitHasFinancialRecords') return t('unitHasFinancialRecords');
    return error;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSavingRef.current) return;

    const fd = new FormData(e.currentTarget);
    const data = {
      location_id: fd.get('location_id') as string,
      unit_number: fd.get('unit_number') as string,
      floor: (fd.get('floor') as string) || undefined,
      area_sqm: fd.get('area_sqm') ? Number(fd.get('area_sqm')) : undefined,
      status: fd.get('status') as UnitStatus,
    };

    isSavingRef.current = true;
    setIsSaving(true);
    try {
      const result = editing
        ? await updateUnit(locale, editing.id, data)
        : await createUnit(locale, data);

      if (result.success) {
        toast.success(tc('success'));
        setOpen(false);
        setEditing(null);
      } else {
        toast.error(result.error ? getActionErrorMessage(result.error) : tc('error'));
      }
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <>
      {canEdit && (
        <Button className="mb-4 w-full sm:w-auto" onClick={openCreateModal}>
          <Plus className="h-4 w-4" />{t('create')}
        </Button>
      )}

      {visibleUnits.length === 0 ? (
        <p className="text-muted-foreground">{t('empty')}</p>
      ) : (
        <>
        <div className="grid gap-3 md:hidden">
          {visibleUnits.map((unit) => (
              <div key={unit.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{unit.unit_number}</p>
                    <p className="text-sm text-muted-foreground">{unit.location?.name_en ?? '—'}</p>
                  </div>
                  <Badge status={unit.status} label={tc(`status.${unit.status}`)} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('floor')}</p>
                    <p>{unit.floor || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t('areaSqm')}</p>
                    <p>{unit.area_sqm ?? '—'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">{t('contractStatus')}</p>
                    <p>{unit.active_contract ? t('hasActiveContract') : t('noActiveContract')}</p>
                  </div>
                </div>
                {canEdit && (
                  <div className="mt-4 flex gap-2">
                    <Button className="flex-1" variant="outline" size="sm" onClick={() => openEditModal(unit)}>
                      <Pencil className="h-4 w-4" />
                      {tc('edit')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={async () => {
                      if (!confirm(t('deleteConfirm'))) return;
                      const r = await deleteUnit(locale, unit.id);
                      if (r.success) toast.success(tc('success'));
                      else toast.error(r.error ? getActionErrorMessage(r.error) : tc('error'));
                    }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
          ))}
        </div>

        <div className="hidden rounded-2xl border border-border overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-start">{t('unitNumber')}</th>
                <th className="px-4 py-3 text-start">{t('location')}</th>
                <th className="px-4 py-3 text-start">{t('floor')}</th>
                <th className="px-4 py-3 text-start">{t('areaSqm')}</th>
                <th className="px-4 py-3 text-start">{t('contractStatus')}</th>
                <th className="px-4 py-3 text-start">{t('status')}</th>
                {canEdit && <th className="px-4 py-3 text-end">{tc('actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {visibleUnits.map((unit) => (
                  <tr key={unit.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{unit.unit_number}</td>
                    <td className="px-4 py-3">{unit.location?.name_en ?? '—'}</td>
                    <td className="px-4 py-3">{unit.floor || '—'}</td>
                    <td className="px-4 py-3">{unit.area_sqm ?? '—'}</td>
                    <td className="px-4 py-3">{unit.active_contract ? t('hasActiveContract') : t('noActiveContract')}</td>
                    <td className="px-4 py-3"><Badge status={unit.status} label={tc(`status.${unit.status}`)} /></td>
                    {canEdit && (
                      <td className="px-4 py-3 text-end space-x-2">
                        <Button variant="ghost" size="sm" onClick={() => openEditModal(unit)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={async () => {
                          if (!confirm(t('deleteConfirm'))) return;
                          const r = await deleteUnit(locale, unit.id);
                          if (r.success) toast.success(tc('success'));
                          else toast.error(r.error ? getActionErrorMessage(r.error) : tc('error'));
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
        </>
      )}

      <Modal open={open} onClose={closeModal} title={editing ? t('edit') : t('create')}>
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
          <div>
            <label className="text-sm font-medium">{t('status')}</label>
            <select
              name="status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as UnitStatus)}
              className="mt-1.5 flex h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
            >
              {(['occupied', 'vacant', 'maintenance'] as const).map((s) => (
                <option key={s} value={s}>{tc(`status.${s}`)}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" disabled={isSaving} onClick={closeModal}>{tc('cancel')}</Button>
            <Button type="submit" disabled={isSaving}>{isSaving ? tc('loading') : tc('save')}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
