import { Timestamp } from 'firebase/firestore';

export type UserPermissions = {
  dashboard: boolean;
  customers: boolean;
  inbox: boolean;
  automations: boolean;
  groups: boolean;
  zapconnect: boolean;
  settings: boolean;
  users: boolean;
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
};

export type Client = {
  id: string;
  userId: string;
  name: string;
  email: string[];
  phone: string;
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

export type Settings = {
  webhookToken?: string;
  presetHour?: string;
  presetMinute?: string;
  usePresetTime?: boolean;
  isDueDateMessageActive?: boolean;
  dueDateMessage?: string;
  // Remarketing Pós-Vencimento
  isPostDueDateRemarketingActive?: boolean;
  postDueDateRemarketingDays?: number;
  postDueDateRemarketingMessage?: string;
  // Remarketing Pós-Cadastro
  isPostSignupRemarketingActive?: boolean;
  postSignupRemarketingDays?: number;
  postSignupRemarketingMessage?: string;
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
  status: 'Scheduled' | 'Sent' | 'Error';
};
