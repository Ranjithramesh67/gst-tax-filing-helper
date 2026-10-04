import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SmsSendResult {
  ok: boolean;
  status?: number;
  skipped?: boolean;
  error?: string;
}

const DEFAULT_URL = 'http://site.ping4sms.com/api/smsapi';
const DEFAULT_SENDER = 'VHOMEE';
const DEFAULT_ROUTE = '4';
const DEFAULT_TEMPLATE_ID = '1207170351303889084';
const DEFAULT_APP_NAME = 'GSTFlow';
const DEFAULT_TIMEOUT_MS = 8000;

// Sends transactional OTP SMS through the ping4sms HTTP API. Delivery is
// best-effort: failures are reported to the caller, never thrown, so an OTP
// request is never blocked by a provider outage.
@Injectable()
export class SmsGatewayService {
  private readonly logger = new Logger(SmsGatewayService.name);

  constructor(private readonly config: ConfigService) {}

  private get enabled(): boolean {
    return this.config.get<string>('SMS_GATEWAY_ENABLED') === 'true';
  }

  private string(key: string, fallback: string): string {
    const value = this.config.get<string>(key);
    return value == null || value === '' ? fallback : value;
  }

  buildOtpMessage(appName: string, code: string): string {
    return (
      `Hi, Your OTP to Login into ${appName} App is ${code}. ` +
      "This OTP is sent by Ranji, Please don't share this OTP with anyone. " +
      'This OTP will expire in 2Mins.'
    );
  }

  async sendOtp(phone: string, code: string): Promise<SmsSendResult> {
    if (!this.enabled) return { ok: false, skipped: true };

    const key = this.config.get<string>('SMS_GATEWAY_KEY');
    if (!key) {
      this.logger.warn('SMS gateway is enabled but SMS_GATEWAY_KEY is not set');
      return { ok: false, skipped: true };
    }

    const url = this.string('SMS_GATEWAY_URL', DEFAULT_URL);
    const appName = this.string('SMS_GATEWAY_APP_NAME', DEFAULT_APP_NAME);
    const params = new URLSearchParams({
      key,
      sender: this.string('SMS_GATEWAY_SENDER', DEFAULT_SENDER),
      number: phone,
      route: this.string('SMS_GATEWAY_ROUTE', DEFAULT_ROUTE),
      sms: this.buildOtpMessage(appName, code),
      templateid: this.string('SMS_GATEWAY_TEMPLATE_ID', DEFAULT_TEMPLATE_ID),
    });

    const timeoutMs = Number(this.config.get<string>('SMS_GATEWAY_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${url}?${params.toString()}`, {
        method: 'GET',
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(`SMS gateway responded ${response.status}`);
        return { ok: false, status: response.status };
      }
      return { ok: true, status: response.status };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`SMS gateway request failed: ${message}`);
      return { ok: false, error: message };
    } finally {
      clearTimeout(timer);
    }
  }
}
