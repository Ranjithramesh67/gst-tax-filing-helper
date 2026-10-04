import { PaymentMethod, PaymentStatus, Role, RoleScope, SmsProviderKind } from './enums';
import type {
  AdminSmsMessage,
  AppNotification,
  AppRelease,
  AuditLog,
  BillingCycle,
  BillingInvoice,
  BillingInvoiceItem,
  BillingInvoiceStatus,
  BillingInvoiceType,
  Client,
  ClientReceivable,
  ConsentRecord,
  Device,
  Document,
  Filing,
  Firm,
  FirmBillingSummary,
  FirmBranding,
  FirmReceivable,
  GstReturn,
  Invoice,
  Paginated,
  Payment,
  PaymentLink,
  PaymentRequest,
  PermissionGroup,
  PublicPaymentRequest,
  RoleDefinition,
  SmsKeywordConfig,
  SmsMessage,
  SmsProviderConfig,
  SmsRetentionPolicy,
  OtpSource,
  Subscription,
  User,
} from './entities';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  roleId?: string | null;
  roleName?: string | null;
  isSuperAdmin?: boolean;
  permissions?: string[];
  firmId?: string | null;
}

export interface AuthResponse extends AuthTokens {
  user: AuthUser;
}

export interface OtpRequestBody {
  phone: string;
  purpose: 'CLIENT_ONBOARDING' | 'DEVICE_PAIRING' | 'LOGIN';
  clientId?: string;
}

export interface OtpRequestResponse {
  requestId: string;
  expiresIn: number;
  devCode?: string;
}

export interface OtpVerifyBody {
  phone: string;
  code: string;
  purpose: 'CLIENT_ONBOARDING' | 'DEVICE_PAIRING' | 'LOGIN';
  device?: DeviceRegisterBody;
}

export interface OtpVerifyResponse extends AuthTokens {
  user?: AuthUser;
  client?: Client;
  consent?: ConsentRecord;
  device?: Device;
}

export interface LoginBody {
  email: string;
  password: string;
  firmSlug?: string;
}

export interface DeviceRegisterBody {
  androidId: string;
  platform: 'ANDROID' | 'IOS';
  model?: string;
  osVersion?: string;
  appVersion?: string;
  pushToken?: string;
}

export interface SmsIngestItem {
  sender: string;
  body: string;
  receivedAt: string;
  deviceId?: string;
  hash: string;
}

export interface SmsIngestBody {
  items: SmsIngestItem[];
}

export interface SmsIngestResponse {
  accepted: number;
  duplicates: number;
  rejected: number;
  ids: string[];
}

export interface OtpIngestItem {
  code: string;
  source: 'EMAIL';
  fromAddress?: string;
  subject?: string;
  snippet?: string;
  receivedAt: string;
  deviceId?: string;
  /** Provider message id. Always required so dedupe never sees a NULL key. */
  sourceRef: string;
}

export interface OtpIngestBody {
  items: OtpIngestItem[];
}

export interface OtpIngestResponse {
  accepted: number;
  duplicates: number;
  rejected: number;
  ids: string[];
}

export interface ClassifySmsBody {
  category: SmsMessage['category'];
  status?: SmsMessage['status'];
}

export interface ListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
}

export interface ListClientsQuery extends ListQuery {
  status?: string;
  linkStatus?: string;
}

export interface ListSmsQuery extends ListQuery {
  clientId?: string;
  category?: string;
  status?: string;
  from?: string;
  to?: string;
}

export interface ListInboxQuery extends ListQuery {
  clientId?: string;
  /** Applies to raw SMS rows only; OTP groups are always returned. */
  category?: string;
  search?: string;
  from?: string;
  to?: string;
}

/**
 * Unified inbox entry. An OTP group collapses every SMS/EMAIL event carrying the
 * same code within the grouping window into a single card; a non-OTP SMS is
 * passed through with the standard {@link SmsMessage} shape.
 */
export type InboxItem =
  | {
      kind: 'OTP';
      id: string;
      code: string;
      sources: OtpSource[];
      client: { id: string; name: string };
      from: string | null;
      subject: string | null;
      snippet: string | null;
      receivedAt: string;
      latestAt: string;
      eventCount: number;
    }
  | ({ kind: 'SMS' } & SmsMessage);

export interface PaginatedInbox {
  items: InboxItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ListNotificationsQuery extends ListQuery {
  unreadOnly?: boolean;
}

export interface UnreadCountResponse {
  count: number;
}

export interface CreateClientBody {
  name: string;
  phone: string;
  gstin?: string;
  pan?: string;
  email?: string;
  address?: string;
  stateCode?: string;
}

export interface UpdateClientBody extends Partial<CreateClientBody> {
  status?: Client['status'];
}

/** Firm-initiated request/refresh of a mutual-consent link with a party. */
export interface RequestLinkBody {
  note?: string;
}

export interface CreateFirmBody {
  name: string;
  slug?: string;
  gstin?: string;
  email?: string;
  phone?: string;
  logoUrl?: string;
  brandColor?: string;
  supportEmail?: string;
  supportPhone?: string;
  address?: string;
  defaultFilingFee?: number;
}

export interface UpdateFirmBody extends Partial<CreateFirmBody> {
  status?: Firm['status'];
}

/** Firm-admin self-service profile update. Slug and status are intentionally excluded. */
export interface UpdateFirmSettingsBody {
  name?: string;
  gstin?: string | null;
  email?: string | null;
  phone?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  address?: string | null;
  defaultFilingFee?: number | null;
}

export interface CreateUserBody {
  name: string;
  email: string;
  password: string;
  role?: Role;
  roleId?: string;
  phone?: string;
  firmId?: string;
}

export interface UpdateUserBody {
  name?: string;
  phone?: string;
  role?: Role;
  roleId?: string;
  isActive?: boolean;
}

export interface CreateRoleBody {
  key: string;
  name: string;
  description?: string;
  scope?: RoleScope;
  firmId?: string;
  permissions: string[];
}

export interface UpdateRoleBody {
  name?: string;
  description?: string;
  permissions?: string[];
}

export interface AssignRoleBody {
  roleId: string;
}

export interface ListRolesQuery extends ListQuery {
  scope?: RoleScope;
  firmId?: string;
}

export interface PermissionCatalog {
  groups: PermissionGroup[];
}

export interface FirmPermissionsResponse {
  groups: PermissionGroup[];
  permissions: string[];
}

export interface FirmRolesResponse {
  system: RoleDefinition[];
  firm: RoleDefinition[];
}

export interface CreateTeamMemberBody {
  name: string;
  email: string;
  password: string;
  roleId?: string;
  role?: Role;
  phone?: string;
}

export interface UpdateTeamMemberBody {
  name?: string;
  phone?: string;
  roleId?: string;
  role?: Role;
  isActive?: boolean;
}

export interface CreateReleaseBody {
  platform: 'ANDROID' | 'IOS';
  version: string;
  versionCode: number;
  channel: 'STABLE' | 'BETA';
  url: string;
  checksum?: string;
  changelog?: string;
  mandatory?: boolean;
}

export interface SmsProviderBody {
  name: string;
  provider?: SmsProviderKind;
  isActive?: boolean;
  url: string;
  method?: 'GET' | 'POST';
  sender: string;
  route?: string;
  templateId?: string;
  header?: string;
  credentials?: Record<string, string>;
  messageTemplate: string;
  appName: string;
  variables?: Record<string, string>;
  timeoutMs?: number;
}

export type UpdateSmsProviderBody = Partial<SmsProviderBody>;

export interface TestSmsProviderBody {
  numbers: string[];
  code?: string;
  providerId?: string;
  config?: UpdateSmsProviderBody;
}

export type SmsProviderConfigList = SmsProviderConfig[];

export interface UpdateSmsRetentionBody {
  enabled: boolean;
  archiveAfterDays: number;
  purgeBackupAfterDays: number;
}

export type PublicRetentionPolicy = SmsRetentionPolicy;

export interface UpdateSmsKeywordBody {
  bodyKeywords: string[];
  headerKeywords: string[];
  hideAfterForward: boolean;
}

export type PublicSmsKeywordConfig = SmsKeywordConfig;

export interface CreateGstReturnBody {
  clientId: string;
  type: GstReturn['type'];
  period: string;
  dueDate?: string;
  notes?: string;
  status?: GstReturn['status'];
}

export interface CreateFilingBody {
  clientId: string;
  returnId?: string;
  type: Filing['type'];
  period: string;
  feeAmount?: number;
  referenceNo?: string;
  notes?: string;
}

export interface UpdateFilingBody {
  feeAmount?: number;
  referenceNo?: string;
  notes?: string;
}

export interface CreatePaymentBody {
  amount: number;
  status?: PaymentStatus;
  method?: PaymentMethod;
  paidAt?: string;
  reference?: string;
  notes?: string;
}

export type UpdatePaymentBody = Partial<CreatePaymentBody>;

export interface PaymentLinkBody {
  label: string;
  url: string;
}

export interface ListPaymentsQuery extends ListQuery {
  clientId?: string;
  filingId?: string;
  status?: PaymentStatus;
  from?: string;
  to?: string;
}

export interface ReceivablesResponse {
  clients: ClientReceivable[];
  billed: number;
  collected: number;
  outstanding: number;
}

export interface FirmBillingDetail {
  summary: FirmBillingSummary;
  clients: ClientReceivable[];
  firms?: FirmReceivable[];
}

export type PaginatedPayments = Paginated<Payment>;
export type { FirmBranding, FirmBillingSummary, ClientReceivable, Payment, PaymentLink };

export interface CreateBillingInvoiceItemBody {
  filingId?: string;
  description: string;
  amount: number;
}

export interface CreateBillingInvoiceBody {
  clientId: string;
  type?: BillingInvoiceType;
  issueDate?: string;
  dueDate?: string;
  notes?: string;
  items: CreateBillingInvoiceItemBody[];
}

export interface UpdateBillingInvoiceBody {
  dueDate?: string | null;
  notes?: string | null;
  status?: Extract<BillingInvoiceStatus, 'DRAFT' | 'ISSUED' | 'VOID'>;
}

export interface ListBillingInvoicesQuery extends ListQuery {
  clientId?: string;
  status?: BillingInvoiceStatus;
  type?: BillingInvoiceType;
}

export interface CreateSubscriptionBody {
  clientId: string;
  amount: number;
  cycle?: BillingCycle;
  startDate?: string;
  nextDueDate?: string;
  active?: boolean;
  notes?: string;
}

export interface UpdateSubscriptionBody {
  amount?: number;
  cycle?: BillingCycle;
  nextDueDate?: string;
  active?: boolean;
  notes?: string | null;
}

export interface CreatePaymentRequestBody {
  clientId?: string;
  invoiceId?: string;
  filingId?: string;
  amount: number;
  description?: string;
  expiresAt?: string;
}

export interface ListPaymentRequestsQuery {
  clientId?: string;
  invoiceId?: string;
  status?: PaymentStatus;
}

export interface MarkPaymentRequestPaidBody {
  method?: PaymentMethod;
  reference?: string;
  providerRef?: string;
}

export type PaginatedBillingInvoices = Paginated<BillingInvoice>;
export type {
  BillingInvoice,
  BillingInvoiceItem,
  PaymentRequest,
  PublicPaymentRequest,
  Subscription,
};

export interface UpdateFilingStatusBody {
  status: Filing['status'];
  referenceNo?: string;
  notes?: string;
}

export type PaginatedClients = Paginated<Client>;
export type PaginatedSms = Paginated<SmsMessage>;
export type PaginatedAdminSms = Paginated<AdminSmsMessage>;
export type PaginatedDocuments = Paginated<Document>;
export type PaginatedReturns = Paginated<GstReturn>;
export type PaginatedFilings = Paginated<Filing>;
export type PaginatedInvoices = Paginated<Invoice>;
export type PaginatedAudit = Paginated<AuditLog>;
export type PaginatedFirms = Paginated<Firm>;
export type PaginatedUsers = Paginated<User>;
export type PaginatedReleases = Paginated<AppRelease>;
export type PaginatedRoles = Paginated<RoleDefinition>;
export type PaginatedTeam = Paginated<User>;
export type PaginatedNotifications = Paginated<AppNotification>;

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  requestId?: string;
}
