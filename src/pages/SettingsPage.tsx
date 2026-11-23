import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Download, FileSpreadsheet, Save } from 'lucide-react';
import { z } from 'zod';
import { useAuth } from '../contexts/AuthContext';
import { useVillaData } from '../contexts/VillaDataContext';
import { useToast } from '../contexts/ToastContext';
import { settingsSchema } from '../utils/validation';
import {
  fetchExcelBackup,
  fetchOperationalBackup,
  updateVillaSettings,
} from '../services/villaService';
import { getColomboDateStr, VILLA_TIMEZONE } from '../utils/colomboTime';

type SettingsFormValues = z.infer<typeof settingsSchema>;

export const SettingsPage: React.FC = () => {
  const { currentStaff, buildActorContext } = useAuth();
  const { settings, authorizedEmails, adminEmails } = useVillaData();
  const { notify } = useToast();
  const [saving, setSaving] = useState(false);
  const [exportingType, setExportingType] = useState<'excel' | 'json' | null>(null);

  const isAdmin = currentStaff?.role === 'ADMIN';

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema) as never,
    defaultValues: {
      villaName: settings?.villaName || 'Urban Escape Villa',
      currency: settings?.currency || 'LKR',
      inactivityTimeoutMinutes: settings?.inactivityTimeoutMinutes || 30,
    },
  });

  useEffect(() => {
    if (settings) {
      reset({
        villaName: settings.villaName,
        currency: settings.currency,
        inactivityTimeoutMinutes: settings.inactivityTimeoutMinutes,
      });
    }
  }, [settings, reset]);

  const onSubmit = async (values: SettingsFormValues) => {
    const actor = buildActorContext(authorizedEmails, adminEmails);
    if (!actor) return;
    setSaving(true);
    try {
      await updateVillaSettings(actor, settings, values);
      notify('Villa settings saved', 'success');
    } catch (err) {
      notify('Save failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleExportExcel = async () => {
    setExportingType('excel');
    try {
      const blob = await fetchExcelBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `urban-escape-villa-backup-${getColomboDateStr()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      notify('Excel workbook backup downloaded', 'success');
    } catch (err) {
      notify('Excel export failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setExportingType(null);
    }
  };

  const handleExportJson = async () => {
    setExportingType('json');
    try {
      const payload = await fetchOperationalBackup();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `urban-escape-villa-backup-${getColomboDateStr()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify('JSON snapshot exported', 'success');
    } catch (err) {
      notify('Backup export failed', 'error', err instanceof Error ? err.message : undefined);
    } finally {
      setExportingType(null);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2
          className="text-2xl sm:text-3xl font-semibold text-[#1C2420]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Operational &amp; Security Settings
        </h2>
        <p className="text-sm text-[#6E6C63] mt-0.5">
          Manage villa currency, session inactivity expiration, and data backups.
        </p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-white border border-[#E2DFD5] rounded-xl p-6 space-y-5"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
              Villa Name
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              {...register('villaName')}
              className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm disabled:bg-[#F7F6F2]"
            />
            {errors.villaName && (
              <p className="text-xs text-[#B91C1C] mt-1">{errors.villaName.message}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
              Local Timezone (Fixed)
            </label>
            <input
              type="text"
              value={VILLA_TIMEZONE}
              disabled
              className="w-full rounded-lg border border-[#E2DFD5] bg-[#F7F6F2] px-3 py-2 text-sm font-mono text-[#6E6C63]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
              Primary Currency
            </label>
            <select
              disabled={!isAdmin}
              {...register('currency')}
              className="w-full rounded-lg border border-[#CDC9BC] bg-white px-3 py-2 text-sm disabled:bg-[#F7F6F2]"
            >
              <option value="LKR">LKR (Sri Lankan Rupee)</option>
              <option value="USD">USD (US Dollar)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#3D3F3A] mb-1">
              Inactivity Session Timeout (minutes)
            </label>
            <input
              type="number"
              min={5}
              max={240}
              disabled={!isAdmin}
              {...register('inactivityTimeoutMinutes')}
              className="w-full rounded-lg border border-[#CDC9BC] px-3 py-2 text-sm font-mono tabular-nums disabled:bg-[#F7F6F2]"
            />
            {errors.inactivityTimeoutMinutes && (
              <p className="text-xs text-[#B91C1C] mt-1">
                {errors.inactivityTimeoutMinutes.message}
              </p>
            )}
          </div>
        </div>

        {isAdmin ? (
          <div className="pt-3 border-t border-[#E2DFD5] flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#183D2D] hover:bg-[#112D21] rounded-lg disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        ) : (
          <p className="text-xs text-[#6E6C63] pt-2 border-t border-[#E2DFD5]">
            Only administrators can modify villa operational settings.
          </p>
        )}
      </form>

      {isAdmin && (
        <div className="bg-white border border-[#E2DFD5] rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-[#1C2420]">
              Operational Data Backup Export
            </h3>
            <p className="text-xs text-[#6E6C63] mt-1">
              Download a formatted multi-sheet Excel workbook (.xlsx) or raw JSON snapshot of
              events, shoots, rooms, reservations, and payment ledgers.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exportingType !== null}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#183D2D] hover:bg-[#112D21] rounded-lg whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{exportingType === 'excel' ? 'Generating...' : 'Export Excel (.xlsx)'}</span>
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              disabled={exportingType !== null}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-[#183D2D] bg-[#EEF3F0] hover:bg-[#dce7df] rounded-lg whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{exportingType === 'json' ? 'Exporting...' : 'Export JSON'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
