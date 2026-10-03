'use client';

import { PageHeader } from '@/components/ui';
import { BillingPanel } from '@/components/billing/BillingPanel';

export default function BillingPage() {
  return (
    <div>
      <PageHeader
        title="Billing"
        description="Generate invoices, request client payments and manage recurring subscriptions."
      />
      <BillingPanel />
    </div>
  );
}
