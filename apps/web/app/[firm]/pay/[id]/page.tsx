'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge, Button, Card, Spinner } from '@/components/ui';
import { formatMoney } from '@/components/sms/classification';

export default function PayPage({ params }: { params: { firm: string; id: string } }) {
  const { id } = params;
  const requestQuery = useQuery({
    queryKey: ['public', 'payment-request', id],
    queryFn: () => api.publicBilling.paymentRequest(id),
    retry: false,
  });

  const request = requestQuery.data;

  if (requestQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Loading payment..." />
      </div>
    );
  }
  if (requestQuery.isError || !request) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-md p-8 text-center">
          <p className="text-sm font-medium text-slate-700">Payment request not found</p>
          <p className="mt-1 text-xs text-slate-400">
            This link may have expired or been removed.
          </p>
        </Card>
      </div>
    );
  }

  const paid = request.status === 'COMPLETED';
  const accent = request.firm.brandColor ?? '#0F766E';

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <Card className="w-full max-w-md overflow-hidden">
        <div
          className="flex items-center gap-3 px-6 py-5 text-white"
          style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}
        >
          {request.firm.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={request.firm.logoUrl}
              alt={request.firm.name}
              className="h-10 w-10 rounded bg-white/90 object-contain p-1"
            />
          ) : null}
          <div>
            <p className="text-base font-semibold">{request.firm.name}</p>
            <p className="text-xs text-white/80">Secure payment</p>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div className="text-center">
            <p className="text-xs uppercase tracking-wide text-slate-400">Amount due</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">
              {formatMoney(request.amount)}
            </p>
            {request.description ? (
              <p className="mt-2 text-sm text-slate-500">{request.description}</p>
            ) : null}
            {request.clientName ? (
              <p className="mt-1 text-xs text-slate-400">For {request.clientName}</p>
            ) : null}
          </div>

          <div className="flex items-center justify-center">
            {paid ? (
              <Badge tone="success">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Paid
              </Badge>
            ) : (
              <Badge tone="warning">Awaiting payment</Badge>
            )}
          </div>

          {paid ? (
            <p className="text-center text-sm text-slate-500">
              This payment has been received. Thank you.
            </p>
          ) : request.provider === 'CASHFREE' && request.url ? (
            <a href={request.url} target="_blank" rel="noreferrer">
              <Button className="w-full">
                Pay now <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          ) : (
            <div className="space-y-3 rounded-md bg-slate-50 p-4 text-sm text-slate-600">
              <p>
                Please pay {formatMoney(request.amount)} using the bank / UPI details shared by the
                firm, then share the reference with them.
              </p>
              {request.firm.supportPhone ? (
                <p>
                  Contact: <span className="font-medium">{request.firm.supportPhone}</span>
                </p>
              ) : null}
              {request.firm.supportEmail ? (
                <p>
                  Email: <span className="font-medium">{request.firm.supportEmail}</span>
                </p>
              ) : null}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
