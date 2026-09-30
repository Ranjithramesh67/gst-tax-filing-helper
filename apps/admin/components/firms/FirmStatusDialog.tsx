'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FirmStatus } from '@gstflow/types';
import type { Firm } from '@gstflow/types';
import { api } from '@/lib/api';
import { Button, Card, Field, Select } from '@/components/ui';

const STATUS_OPTIONS = Object.values(FirmStatus);

export function FirmStatusDialog({ firm, onClose }: { firm: Firm; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<FirmStatus>(firm.status);

  const updateStatus = useMutation({
    mutationFn: (next: FirmStatus) => api.admin.firms.update(firm.id, { status: next }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'firms'] });
      onClose();
    },
  });

  const errorMessage =
    updateStatus.error instanceof Error ? updateStatus.error.message : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Update firm status</h3>
          <p className="mt-0.5 text-xs text-slate-400">{firm.name}</p>
        </div>
        <div className="space-y-4 p-4">
          <Field label="Status">
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value as FirmStatus)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </Field>
          {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={updateStatus.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => updateStatus.mutate(status)}
              disabled={updateStatus.isPending || status === firm.status}
            >
              {updateStatus.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
