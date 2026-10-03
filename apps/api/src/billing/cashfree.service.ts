import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

export interface CashfreeLinkInput {
  linkId: string;
  amount: number;
  description: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  returnUrl: string;
  notifyUrl?: string;
}

export interface CashfreeLinkResult {
  providerRef: string;
  url: string;
}

@Injectable()
export class CashfreeService {
  private readonly logger = new Logger(CashfreeService.name);

  constructor(private readonly config: ConfigService) {}

  get appId(): string {
    return this.config.get<string>('CASHFREE_APP_ID')?.trim() ?? '';
  }

  get secretKey(): string {
    return this.config.get<string>('CASHFREE_SECRET_KEY')?.trim() ?? '';
  }

  get environment(): string {
    return (this.config.get<string>('CASHFREE_ENV') ?? 'sandbox').trim().toLowerCase();
  }

  get baseUrl(): string {
    return this.environment === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';
  }

  isConfigured(): boolean {
    return Boolean(this.appId && this.secretKey);
  }

  async createLink(input: CashfreeLinkInput): Promise<CashfreeLinkResult | null> {
    if (!this.isConfigured()) return null;
    const payload = {
      link_id: input.linkId,
      link_amount: input.amount,
      link_currency: 'INR',
      link_purpose: input.description,
      customer_details: {
        customer_name: input.customerName,
        customer_phone: input.customerPhone ?? '9999999999',
        customer_email: input.customerEmail ?? undefined,
      },
      link_meta: {
        return_url: input.returnUrl,
        notify_url: input.notifyUrl,
      },
      link_notify: { send_sms: false, send_email: false },
    };

    try {
      const response = await fetch(`${this.baseUrl}/links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': this.appId,
          'x-client-secret': this.secretKey,
          'x-api-version': '2023-08-01',
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        this.logger.error(
          `Cashfree link creation failed (${response.status}): ${detail.slice(0, 500)}`,
        );
        return null;
      }
      const data = (await response.json()) as {
        link_id?: string;
        link_url?: string;
        cf_link_id?: string;
      };
      if (!data.link_url) return null;
      return {
        providerRef: data.cf_link_id ? String(data.cf_link_id) : input.linkId,
        url: data.link_url,
      };
    } catch (error) {
      this.logger.error(`Cashfree link creation error: ${(error as Error).message}`);
      return null;
    }
  }

  verifyWebhook(rawBody: string, timestamp: string, signature: string): boolean {
    if (!this.secretKey || !timestamp || !signature) return false;
    const expected = createHmac('sha256', this.secretKey)
      .update(`${timestamp}${rawBody}`)
      .digest('base64');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
