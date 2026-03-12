
import { Timestamp } from 'firebase/firestore';

export type UserPermissions = {
  dashboard: boolean;
  customers: boolean;
  inbox: boolean;
  automations: boolean;
  groups: boolean;
  shot: boolean;
  zapconnect: boolean;
  settings: boolean;
  users: boolean;
  attendants: boolean;
  estoque: boolean;
  notes: boolean;
  ads: boolean;
  pix: boolean;
  usage: boolean;
  logs: boolean;
  dbCleaner: boolean;
};

export type UserProfile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Timestamp;
  role: 'Admin' | 'User' | 'Agent';
  parentId?: string | null;
  avatarUrl?: string;
  permissions?: Partial<UserPermissions>;
  subscriptionPlan?: 'basic' | 'pro' | null;
  subscriptionEndDate?: Timestamp;
  status?: 'active' | 'blocked';
  trialActivated?: boolean;
};

export type Note = {
    id: string;
    userId: string;
    content: string;
    status: 'todo' | 'done';
    createdAt: Timestamp;
};

export type Lead = {
  id: string;
  userId: string;
  name: string;
  phone: string;
  interestedSubscription: string;
  status: 'pending' | 'converted' | 'lost';
  createdAt: Timestamp;
};

export type Client = {
  id: string;
  userId: string;
  name: string;
  email: string[];
  phone: string;
  password?: string | null;
  screen?: string | null;
  dueDate?: Timestamp | null;
  status: 'Ativo' | 'Inativo' | 'Vencido';
  telegramUser?: string | null;
  clientType?: 'PACOTE' | 'REVENDA' | null;
  notes?: string | null;
  quantity?: number;
  subscription?: string;
  paymentMethod?: 'PIX' | 'Cartão' | 'Boleto' | null;
  amountPaid?: string | null;
  needsSupport?: boolean;
  createdAt?: Timestamp | null;
  upsellSent?: boolean;
  sentUpsellIds?: string[];
  sentRemarketingIds?: string[];
};

export type MessageLog = {
  id: string;
  userId: string;
  type: 'Vencimento' | 'Remarketing' | 'Upsell' | 'Grupo' | 'Disparo';
  clientName: string;
  target: string;
  status: 'Aguardando' | 'Enviando' | 'Enviado' | 'Erro';
  delayApplied: number;
  timestamp: Timestamp;
};

export type Settings = {
  webhookToken?: string;
  presetHour?: string;
  presetMinute?: string;
  usePresetTime?: boolean;
  isDueDateMessageActive?: boolean;
  dueDateMessage?: string;
  isPostDueDateRemarketingActive?: boolean;
  postDueDateRemarketingDays?: number;
  postDueDateRemarketingMessage?: string;
  isPostSignupRemarketingActive?: boolean;
  postSignupRemarketingDays?: number;
  postSignupRemarketingMessage?: string;
  postSignupRemarketings?: RemarketingConfig[];
  postDueDateRemarketings?: RemarketingConfig[];
  isUpsellActive?: boolean;
  upsellDelayMinutes?: number;
  upsellMessage?: string;
  upsells?: UpsellConfig[];
  isSupportAutomationActive?: boolean;
  supportStartedMessage?: string;
  supportFinishedMessage?: string;
  isDeliveryAutomationActive?: boolean;
  deliveryMessage?: string;
  isLeadAutomationActive?: boolean;
  leadInitialMessage?: string;
  leadConvertedMessage?: string;
  leadLostMessage?: string;
};

export type RemarketingConfig = {
  id: string;
  isActive: boolean;
  days: number;
  message: string;
  createdAt?: number;
};

export type UpsellConfig = {
  id: string;
  isActive: boolean;
  upsellDelayMinutes: number;
  upsellMessage: string;
  createdAt?: number;
};

export type Subscription = {
  id: string;
  userId: string;
  name: string;
  value: string;
};

export type ScheduledMessage = {
  id: string;
  userId: string;
  jid: string;
  message: string;
  imageUrl?: string;
  sendAt: Timestamp;
  repeatDaily: boolean;
  status: 'Scheduled' | 'Sent' | 'Error' | 'Sending';
  claimedAt?: Timestamp | null;
};

export type Token = {
  id: string;
  value: string;
  status: 'available' | 'in_use';
  assignedTo?: string;
  assignedEmail?: string;
};

export type ExtractedGroup = {
  id: string;
  userId: string;
  groupName: string;
  participantCount: string;
  adminPhones: string[];
  memberPhones: string[];
};

export type SystemAlert = {
  instanceId: string;
  message: string;
  isActive: boolean;
  updatedAt: Timestamp;
};

export type SystemMaintenance = {
  isActive: boolean;
  message: string;
  updatedAt: Timestamp;
};

export type AdCampaign = {
  id: string;
  userId: string;
  bm?: string;
  campaignDate: Timestamp;
  amountSpent: number;
  totalReturn: number;
  conversationsStarted: number;
};

export type BusinessManager = {
  id: string;
  userId: string;
  name: string;
};

export type SavedCleanedDb = {
  id: string;
  userId: string;
  name: string;
  content: string;
  createdAt: Timestamp;
};
