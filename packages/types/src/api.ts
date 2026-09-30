import { Role } from './enums';
import type {
  AppRelease,
  AuditLog,
  Client,
  ConsentRecord,
  Device,
  Document,
  Filing,
  Firm,
  GstReturn,
  Invoice,
  Paginated,
  SmsMessage,
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
  role: Role;
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
}

export interface ListSmsQuery extends ListQuery {
  clientId?: string;
  category?: string;
  status?: string;
  from?: string;
  to?: string;
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

export interface CreateFirmBody {
  name: string;
  slug?: string;
  gstin?: string;
  email?: string;
  phone?: string;
}

export interface CreateUserBody {
  name: string;
  email: string;
  password: string;
  role: Role;
  phone?: string;
  firmId?: string;
}

export interface UpdateUserBody {
  name?: string;
  phone?: string;
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
  referenceNo?: string;
  notes?: string;
}

export interface UpdateFilingStatusBody {
  status: Filing['status'];
  referenceNo?: string;
  notes?: string;
}

export type PaginatedClients = Paginated<Client>;
export type PaginatedSms = Paginated<SmsMessage>;
export type PaginatedDocuments = Paginated<Document>;
export type PaginatedReturns = Paginated<GstReturn>;
export type PaginatedFilings = Paginated<Filing>;
export type PaginatedInvoices = Paginated<Invoice>;
export type PaginatedAudit = Paginated<AuditLog>;
export type PaginatedFirms = Paginated<Firm>;
export type PaginatedUsers = Paginated<User>;
export type PaginatedReleases = Paginated<AppRelease>;

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  requestId?: string;
}
