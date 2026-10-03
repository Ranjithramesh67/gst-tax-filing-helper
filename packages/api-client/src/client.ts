import type {
  AppRelease,
  AuthResponse,
  AuthUser,
  BillingInvoice,
  ClassifySmsBody,
  Client,
  ConsentRecord,
  CreateBillingInvoiceBody,
  CreateClientBody,
  CreateFilingBody,
  CreateFirmBody,
  CreateGstReturnBody,
  CreatePaymentBody,
  CreatePaymentRequestBody,
  CreateReleaseBody,
  CreateRoleBody,
  CreateSubscriptionBody,
  CreateTeamMemberBody,
  CreateUserBody,
  Device,
  DeviceRegisterBody,
  Document,
  Filing,
  Firm,
  FirmBillingSummary,
  FirmBranding,
  FirmPermissionsResponse,
  FirmRolesResponse,
  GstReturn,
  Invoice,
  ListBillingInvoicesQuery,
  ListClientsQuery,
  ListPaymentRequestsQuery,
  ListPaymentsQuery,
  ListQuery,
  ListRolesQuery,
  ListSmsQuery,
  LoginBody,
  MarkPaymentRequestPaidBody,
  OtpRequestBody,
  OtpRequestResponse,
  OtpVerifyBody,
  OtpVerifyResponse,
  PaginatedAudit,
  PaginatedBillingInvoices,
  PaginatedClients,
  PaginatedDocuments,
  PaginatedFilings,
  PaginatedFirms,
  PaginatedInvoices,
  PaginatedPayments,
  PaginatedReleases,
  PaginatedReturns,
  PaginatedRoles,
  PaginatedSms,
  PaginatedTeam,
  PaginatedUsers,
  Payment,
  PaymentLink,
  PaymentLinkBody,
  PaymentRequest,
  PermissionCatalog,
  PublicPaymentRequest,
  ReceivablesResponse,
  RoleDefinition,
  SmsIngestBody,
  SmsIngestResponse,
  SmsMessage,
  Subscription,
  UpdateBillingInvoiceBody,
  UpdateClientBody,
  UpdateFilingBody,
  UpdateFilingStatusBody,
  UpdateFirmBody,
  UpdatePaymentBody,
  UpdateRoleBody,
  UpdateSubscriptionBody,
  UpdateTeamMemberBody,
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

  public = {
    branding: (slug: string) =>
      this.http.get<FirmBranding>(`/public/firms/${encodeURIComponent(slug)}`, { skipAuth: true }),
  };

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
    update: (id: string, body: UpdateFilingBody) => this.http.patch<Filing>(`/filings/${id}`, body),
    payments: (id: string) => this.http.get<Payment[]>(`/filings/${id}/payments`),
    addPayment: (id: string, body: CreatePaymentBody) =>
      this.http.post<Payment>(`/filings/${id}/payments`, body),
  };

  payments = {
    list: (query?: ListPaymentsQuery) => this.http.get<PaginatedPayments>('/payments', query),
    receivables: () => this.http.get<ReceivablesResponse>('/payments/receivables'),
    update: (id: string, body: UpdatePaymentBody) =>
      this.http.patch<Payment>(`/payments/${id}`, body),
    remove: (id: string) => this.http.del<{ success: boolean }>(`/payments/${id}`),
    addLink: (id: string, body: PaymentLinkBody) =>
      this.http.post<PaymentLink>(`/payments/${id}/links`, body),
    removeLink: (id: string, linkId: string) =>
      this.http.del<{ success: boolean }>(`/payments/${id}/links/${linkId}`),
  };

  billing = {
    invoices: {
      list: (query?: ListBillingInvoicesQuery) =>
        this.http.get<PaginatedBillingInvoices>('/billing/invoices', query),
      get: (id: string) => this.http.get<BillingInvoice>(`/billing/invoices/${id}`),
      create: (body: CreateBillingInvoiceBody) =>
        this.http.post<BillingInvoice>('/billing/invoices', body),
      update: (id: string, body: UpdateBillingInvoiceBody) =>
        this.http.patch<BillingInvoice>(`/billing/invoices/${id}`, body),
    },
    subscriptions: {
      list: (query?: { clientId?: string }) =>
        this.http.get<Subscription[]>('/billing/subscriptions', query),
      create: (body: CreateSubscriptionBody) =>
        this.http.post<Subscription>('/billing/subscriptions', body),
      update: (id: string, body: UpdateSubscriptionBody) =>
        this.http.patch<Subscription>(`/billing/subscriptions/${id}`, body),
      remove: (id: string) =>
        this.http.del<{ success: boolean }>(`/billing/subscriptions/${id}`),
    },
    paymentRequests: {
      list: (query?: ListPaymentRequestsQuery) =>
        this.http.get<PaymentRequest[]>('/billing/payment-requests', query),
      create: (body: CreatePaymentRequestBody) =>
        this.http.post<PaymentRequest>('/billing/payment-requests', body),
      remove: (id: string) =>
        this.http.del<{ success: boolean }>(`/billing/payment-requests/${id}`),
      markPaid: (id: string, body?: MarkPaymentRequestPaidBody) =>
        this.http.post<PaymentRequest>(`/billing/payment-requests/${id}/mark-paid`, body ?? {}),
    },
  };

  publicBilling = {
    paymentRequest: (id: string) =>
      this.http.get<PublicPaymentRequest>(`/public/payment-requests/${id}`),
  };

  firm = {
    permissions: () => this.http.get<FirmPermissionsResponse>('/firm/permissions'),
    roles: {
      list: () => this.http.get<FirmRolesResponse>('/firm/roles'),
      create: (body: CreateRoleBody) => this.http.post<RoleDefinition>('/firm/roles', body),
      update: (id: string, body: UpdateRoleBody) =>
        this.http.patch<RoleDefinition>(`/firm/roles/${id}`, body),
      remove: (id: string) => this.http.del<{ success: boolean }>(`/firm/roles/${id}`),
    },
    team: {
      list: (query?: ListQuery) => this.http.get<PaginatedTeam>('/firm/users', query),
      create: (body: CreateTeamMemberBody) => this.http.post<User>('/firm/users', body),
      update: (id: string, body: UpdateTeamMemberBody) =>
        this.http.patch<User>(`/firm/users/${id}`, body),
    },
  };

  admin = {
    permissions: () => this.http.get<PermissionCatalog>('/admin/permissions'),
    roles: {
      list: (query?: ListRolesQuery) =>
        this.http.get<PaginatedRoles>('/admin/roles', query),
      get: (id: string) => this.http.get<RoleDefinition>(`/admin/roles/${id}`),
      create: (body: CreateRoleBody) => this.http.post<RoleDefinition>('/admin/roles', body),
      update: (id: string, body: UpdateRoleBody) =>
        this.http.patch<RoleDefinition>(`/admin/roles/${id}`, body),
      remove: (id: string) => this.http.del<{ success: boolean }>(`/admin/roles/${id}`),
    },
    firms: {
      list: (query?: ListQuery) => this.http.get<PaginatedFirms>('/admin/firms', query),
      get: (id: string) => this.http.get<Firm>(`/admin/firms/${id}`),
      create: (body: CreateFirmBody) => this.http.post<Firm>('/admin/firms', body),
      update: (id: string, body: UpdateFirmBody) =>
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
    billing: {
      platform: () => this.http.get<FirmBillingSummary[]>('/admin/billing'),
      firm: (id: string) => this.http.get<ReceivablesResponse>(`/admin/firms/${id}/billing`),
    },
  };
}

export type { ApiClientConfig, RequestOptions };
