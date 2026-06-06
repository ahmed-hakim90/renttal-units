'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { createLocation, updateLocation, deleteLocation } from '@/lib/actions/locations';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import type { Location } from '@/types/database';

export function LocationsPageClient({
  locations, locale, canEdit,
}: {
  locations: Location[];
  locale: string;
  canEdit: boolean;
}) {
  const t = useTranslations('locations');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      name_en: fd.get('name_en') as string,
      name_ar: fd.get('name_ar') as string,
      address: (fd.get('address') as string) || undefined,
      city: (fd.get('city') as string) || undefined,
      region: (fd.get('region') as string) || undefined,
    };

    const result = editing
      ? await updateLocation(locale, editing.id, data)
      : await createLocation(locale, data);

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

      {locations.length === 0 ? (
        <p className="text-muted-foreground mt-6">{t('empty')}</p>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden mt-6">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-start font-medium">{t('nameEn')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('nameAr')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('city')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('region')}</th>
                {canEdit && <th className="px-4 py-3 text-end font-medium">{tc('actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {locations.map((loc) => (
                <tr key={loc.id} className="border-t border-border">
                  <td className="px-4 py-3">{loc.name_en}</td>
                  <td className="px-4 py-3">{loc.name_ar}</td>
                  <td className="px-4 py-3">{loc.city ?? '—'}</td>
                  <td className="px-4 py-3">{loc.region ?? '—'}</td>
                  {canEdit && (
                    <td className="px-4 py-3 text-end space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(loc); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={async () => {
                        if (!confirm(t('deleteConfirm'))) return;
                        const result = await deleteLocation(locale, loc.id);
                        result.success ? toast.success(tc('success')) : toast.error('error' in result ? result.error : tc('error'));
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

      <Modal open={open} onClose={() => { setOpen(false); setEditing(null); }} title={editing ? t('edit') : t('create')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input name="name_en" label={t('nameEn')} defaultValue={editing?.name_en} required />
          <Input name="name_ar" label={t('nameAr')} defaultValue={editing?.name_ar} required />
          <Input name="address" label={t('address')} defaultValue={editing?.address ?? ''} />
          <Input name="city" label={t('city')} defaultValue={editing?.city ?? ''} />
          <Input name="region" label={t('region')} defaultValue={editing?.region ?? ''} />
          <div className="flex justify-end gap-3">
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>{tc('cancel')}</Button>
            <Button type="submit">{tc('save')}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
