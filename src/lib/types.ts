
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
  estoque: boolean;
  notes: boolean;
  ads: boolean;
  pix: boolean;
  usage: boolean;
};

export type UserProfile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Timestamp;
  role: 'Admin' | 'Agent';
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

export type Client = {
  id: string;
  userId: string;
  name: string;
  email: string[];
  phone: string;
  password?: string | null;
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
  upsellSent?: boolean; // Legacy
  sentUpsellIds?: string[]; // Tracking for multiple upsells
  sentRemarketingIds?: string[]; // Tracking for multiple remarketings
};

export type WhatsAppConnection = {
  id: string;
  userId: string;
  phoneNumber: string;
  apiKey: string;
  connectionStatus: string;
};

export type AutomatedMessageWorkflow = {
  id: string;
  userId: string;
  name: string;
  trigger: string;
  status: 'Active' | 'Inactive';
};

export type MessageAnalytics = {
  id: string;
  timestamp: Timestamp;
  messagesSent: number;
  messagesReceived: number;
  engagementRate: number;
  satisfactionScore: number;
};

export type AIResponseSuggestion = {
  id: string;
  messageContext: string;
  suggestion: string;
  confidenceScore: number;
  timestamp: Timestamp;
};

export type Conversation = {
  id: string;
  customerName: string;
  lastMessage: string;
  timestamp: Timestamp;
  avatarUrl: string;
  unreadCount: number;
};

export type Message = {
  id: string;
  sender: 'user' | 'agent';
  content: string;
  timestamp: Timestamp;
  avatarUrl: string;
};

export type UpsellConfig = {
  id: string;
  isActive: boolean;
  upsellDelayMinutes: number;
  upsellMessage: string;
  createdAt?: number; // Timestamp in ms for filtering
};

export type RemarketingConfig = {
  id: string;
  isActive: boolean;
  days: number;
  message: string;
  createdAt?: number; // Timestamp in ms for filtering
};

export type Settings = {
  webhookToken?: string;
  presetHour?: string;
  presetMinute?: string;
  usePresetTime?: boolean;
  isDueDateMessageActive?: boolean;
  dueDateMessage?: string;
  // Remarketing Pós-Vencimento (Legacy)
  isPostDueDateRemarketingActive?: boolean;
  postDueDateRemarketingDays?: number;
  postDueDateRemarketingMessage?: string;
  // Remarketing Pós-Cadastro (Legacy)
  isPostSignupRemarketingActive?: boolean;
  postSignupRemarketingDays?: number;
  postSignupRemarketingMessage?: string;
  // New Remarketing Arrays
  postSignupRemarketings?: RemarketingConfig[];
  postDueDateRemarketings?: RemarketingConfig[];
  // Upsell
  isUpsellActive?: boolean; // Legacy
  upsellDelayMinutes?: number; // Legacy
  upsellMessage?: string; // Legacy
  upsells?: UpsellConfig[];
  // Support Automation
  isSupportAutomationActive?: boolean;
  supportStartedMessage?: string;
  supportFinishedMessage?: string;
  // Delivery Automation
  isDeliveryAutomationActive?: boolean;
  deliveryMessage?: string;
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

export type Estoque = {
  id: string;
  userId: string;
  nome: string;
  login: string;
  senha: string;
  status: 'Disponível' | 'Em Uso';
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
