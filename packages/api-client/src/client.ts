import type {
  AppRelease,
  AuthResponse,
  AuthUser,
  ClassifySmsBody,
  Client,
  ConsentRecord,
  CreateClientBody,
  CreateFilingBody,
  CreateFirmBody,
  CreateGstReturnBody,
  CreateReleaseBody,
  CreateUserBody,
  Device,
  DeviceRegisterBody,
  Document,
  Filing,
  Firm,
  GstReturn,
  Invoice,
  ListClientsQuery,
  ListQuery,
  ListSmsQuery,
  LoginBody,
  OtpRequestBody,
  OtpRequestResponse,
  OtpVerifyBody,
  OtpVerifyResponse,
  PaginatedAudit,
  PaginatedClients,
  PaginatedDocuments,
  PaginatedFilings,
  PaginatedFirms,
  PaginatedInvoices,
  PaginatedReleases,
  PaginatedReturns,
  PaginatedSms,
  PaginatedUsers,
  SmsIngestBody,
  SmsIngestResponse,
  SmsMessage,
  UpdateClientBody,
  UpdateFilingStatusBody,
  UpdateUserBody,
  User,
} from '@gstflow/types';
import { ApiClient, type ApiClientConfig, RequestOptions } from './http';

export class GstFlowApi {
  readonly http: ApiClient;

  constructor(config: ApiClientConfig) {
    this.http = new ApiClient(config);
  }

  health = () => this.http.get<{ status: string; uptime: number }>('/health');

  auth = {
    login: (body: LoginBody) => this.http.post<AuthResponse>('/auth/login', body, { skipAuth: true }),
    requestOtp: (body: OtpRequestBody) =>
      this.http.post<OtpRequestResponse>('/auth/otp/request', body, { skipAuth: true }),
    verifyOtp: (body: OtpVerifyBody) =>
      this.http.post<OtpVerifyResponse>('/auth/otp/verify', body, { skipAuth: true }),
    me: () => this.http.get<AuthUser>('/auth/me'),
    logout: (refreshToken: string) => this.http.post<{ success: boolean }>('/auth/logout', { refreshToken }),
  };

  clients = {
    list: (query?: ListClientsQuery) => this.http.get<PaginatedClients>('/clients', query),
    get: (id: string) => this.http.get<Client>(`/clients/${id}`),
    create: (body: CreateClientBody) => this.http.post<Client>('/clients', body),
    update: (id: string, body: UpdateClientBody) => this.http.patch<Client>(`/clients/${id}`, body),
    remove: (id: string) => this.http.del<{ success: boolean }>(`/clients/${id}`),
    consents: (id: string) => this.http.get<ConsentRecord[]>(`/clients/${id}/consents`),
  };

  devices = {
    list: (query?: ListQuery & { clientId?: string }) => this.http.get<Device[]>('/devices', query),
    register: (body: DeviceRegisterBody) => this.http.post<Device>('/devices/register', body),
    revoke: (id: string) => this.http.post<Device>(`/devices/${id}/revoke`),
  };

  sms = {
    ingest: (body: SmsIngestBody) => this.http.post<SmsIngestResponse>('/sms/ingest', body),
    list: (query?: ListSmsQuery) => this.http.get<PaginatedSms>('/sms', query),
    get: (id: string) => this.http.get<SmsMessage>(`/sms/${id}`),
    classify: (id: string, body: ClassifySmsBody) =>
      this.http.post<SmsMessage>(`/sms/${id}/classify`, body),
  };

  documents = {
    list: (query?: ListQuery & { clientId?: string; type?: string }) =>
      this.http.get<PaginatedDocuments>('/documents', query),
    get: (id: string) => this.http.get<Document>(`/documents/${id}`),
    upload: (formData: FormData) => this.http.post<Document>('/documents', undefined, { formData }),
  };

  invoices = {
    list: (query?: ListQuery & { clientId?: string }) =>
      this.http.get<PaginatedInvoices>('/invoices', query),
    create: (body: Record<string, unknown>) => this.http.post<Invoice>('/invoices', body),
  };

  returns = {
    list: (query?: ListQuery & { clientId?: string; status?: string }) =>
      this.http.get<PaginatedReturns>('/returns', query),
    create: (body: CreateGstReturnBody) => this.http.post<GstReturn>('/returns', body),
  };

  filings = {
    list: (query?: ListQuery & { clientId?: string; status?: string }) =>
      this.http.get<PaginatedFilings>('/filings', query),
    create: (body: CreateFilingBody) => this.http.post<Filing>('/filings', body),
    updateStatus: (id: string, body: UpdateFilingStatusBody) =>
      this.http.patch<Filing>(`/filings/${id}/status`, body),
  };

  admin = {
    firms: {
      list: (query?: ListQuery) => this.http.get<PaginatedFirms>('/admin/firms', query),
      create: (body: CreateFirmBody) => this.http.post<Firm>('/admin/firms', body),
      update: (id: string, body: Partial<CreateFirmBody> & { status?: string }) =>
        this.http.patch<Firm>(`/admin/firms/${id}`, body),
    },
    users: {
      list: (query?: ListQuery & { firmId?: string; role?: string }) =>
        this.http.get<PaginatedUsers>('/admin/users', query),
      create: (body: CreateUserBody) => this.http.post<User>('/admin/users', body),
      update: (id: string, body: UpdateUserBody) =>
        this.http.patch<User>(`/admin/users/${id}`, body),
    },
    releases: {
      list: (query?: ListQuery & { platform?: string; channel?: string }) =>
        this.http.get<PaginatedReleases>('/admin/releases', query),
      create: (body: CreateReleaseBody) => this.http.post<AppRelease>('/admin/releases', body),
    },
    audit: {
      list: (query?: ListQuery & { firmId?: string; action?: string; entity?: string }) =>
        this.http.get<PaginatedAudit>('/admin/audit', query),
    },
  };
}

export type { ApiClientConfig, RequestOptions };
