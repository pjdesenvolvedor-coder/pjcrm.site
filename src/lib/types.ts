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
  zapVendas: boolean;
  calendario: boolean;
  linksClaro: boolean;
  flows?: boolean;
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
  pinScreen?: string | null;
  accessLink?: string | null;
  deliveryMethod?: 'credentials' | 'link' | null;
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
  firstCreatedAt?: Timestamp | null;
  renewalCount?: number;
  upsellSent?: boolean;
  sentUpsellIds?: string[];
  sentUpsell2Ids?: string[];
  sentUpsellMenuIds?: string[];
  sentRemarketingIds?: string[];
  lastBilledDate?: string | null;
  lastBilledAt?: Timestamp | null;

  agentId?: string;
  agentName?: string;
  n8nExported?: boolean;
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
  postSignupSendTime?: string;    // ex: "12:30" — horário Brasília para enviar pós-cadastros
  postDueDateSendTime?: string;   // ex: "12:30" — horário Brasília para enviar pós-vencimentos
  isUpsellActive?: boolean;
  upsellDelayMinutes?: number;
  upsellMessage?: string;
  upsells?: UpsellConfig[];
  upsellMenus?: UpsellMenuConfig[];

  isSupportAutomationActive?: boolean;
  supportStartedMessage?: string;
  supportFinishedMessage?: string;
  isDeliveryAutomationActive?: boolean;
  deliveryMessage?: string;
  customDeliveryMessages?: { [key: string]: string };
  isDeliveryLinkAutomationActive?: boolean;
  deliveryLinkMessage?: string;
  customDeliveryLinkMessages?: { [key: string]: string };
  isLeadAutomationActive?: boolean;
  leadInitialMessage?: string;
  leadConvertedMessage?: string;
  leadLostMessage?: string;
  zapVendasToken?: string;
  billingWebhookToken?: string;
  useSeparateBillingZap?: boolean;

  // Renovação Automática PIX (LinkinPay)
  isAutoRenewalActive?: boolean;
  renewalSendTime?: string;
  lastAutoRenewalRunDate?: string;
  renewalDelaySeconds?: number;
  linkinpayToken?: string;
  renewalSuccessMessage?: string;
  renewalBillingMessage?: string;
  renewalSupportMessage?: string;
  renewalButtonText?: string;
  renewalFooterText?: string;
  renewalZapInstance?: 'main' | 'billing' | 'auto';
};

export type RenewalSessionItem = {
  clientId: string;
  name: string;
  value: string;
  email?: string[];
  screen?: string | null;
  pinScreen?: string | null;
  currentDueDate?: any;
};

export type RenewalSession = {
  id: string;
  userId: string;
  phone: string;
  canonicalPhone: string;
  clientName: string;
  clientIds: string[];
  subscriptions: RenewalSessionItem[];
  status: 'pending' | 'paid' | 'expired';
  pixTransactionId?: string;
  pixCode?: string;
  pixQrCodeBase64?: string;
  totalAmountPaid?: number; // em centavos
  paidAt?: any;
  renewedClientIds?: string[];
  reportedIssues?: {
    clientId: string;
    subscriptionName: string;
  }[];
  supportOpened?: boolean;
  isTest?: boolean;
  createdAt: any;
  expiresAt: any;
};


export type RemarketingConfig = {
  id: string;
  isActive: boolean;
  days: number;
  message: string;
  createdAt?: number;
};

export type UpsellButtonConfig = {
  id: string;
  label: string;
  url: string;
};

export type UpsellConfig = {
  id: string;
  isActive: boolean;
  upsellDelayMinutes: number;
  upsellMessage: string;
  messageType?: 'message' | 'button';
  imageButton?: string;
  footerText?: string;
  buttons?: UpsellButtonConfig[];
  createdAt?: number;
};

export type UpsellMenuButton = {
  id: string;
  label: string;   // texto do botão, ex: "Comprar Agora"
  action: string;  // URL, "call:+55...", "copy:código" ou texto simples de resposta
};

export type UpsellMenuConfig = {
  id: string;
  isActive: boolean;
  upsellDelayMinutes: number;
  createdAt?: number;
  text: string;          // mensagem principal (suporta {cliente}, {telefone}, etc.)
  footerText?: string;   // rodapé opcional
  imageUrl?: string;     // imagem opcional
  buttons: UpsellMenuButton[]; // ao menos 1 botão obrigatório
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
  useBillingZap?: boolean;
  errorReason?: string;
  retryCount?: number;
  supportNumber?: string;
  siteLink?: string;
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

export type FullAccount = {
  id: string;
  userId: string;
  email: string;
  password: string;
  subscription: string;
  status: 'available' | 'used';
  createdAt: Timestamp;
  usedAt?: Timestamp;
};

export type Conversation = {
  id: string;
  jid: string;
  name: string;
  customerName?: string;
  avatarUrl?: string;
  lastMessage?: string;
  lastTimestamp?: Timestamp;
  timestamp?: Timestamp;
  unreadCount?: number;
};

export type Message = {
  id: string;
  text?: string;
  content?: string;
  fromMe: boolean;
  sender?: string;
  avatarUrl?: string;
  timestamp: Timestamp;
  type?: string;
};

export type AutomatedMessageWorkflow = {
  id: string;
  name: string;
  isActive: boolean;
  trigger?: string;
  status?: string;
};

export type UazapiConnectionConfig = {
  serverUrl: string;
  instanceToken: string;
  instanceName?: string;
  owner?: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'hibernated' | 'unknown';
  updatedAt?: any;
};

export type FlowKeywordTrigger = {
  id: string;
  keyword: string;
  matchType: 'exact' | 'contains';
  flowId: string;
};

export type FlowTriggerSettings = {
  triggerMode: 'all_messages' | 'keywords';
  defaultFlowId?: string;
  keywords: FlowKeywordTrigger[];
  ignoreIfActiveFlow?: boolean;
  restartKeywords?: string[];
  updatedAt?: any;
};

export type FlowNodeData = {
  label?: string;
  nodeType: 'content' | 'menu' | 'delay' | 'action' | 'condition' | 'flow_connect' | 'randomizer';
  // Conteúdo
  contentType?: 'text' | 'image' | 'audio' | 'video' | 'document';
  text?: string;
  mediaUrl?: string;
  mediaCaption?: string;
  // Menu
  menuType?: 'list' | 'button' | 'numeric';
  menuQuestionText?: string;
  menuButtonTitle?: string;
  menuFooterText?: string;
  menuOptions?: Array<{ id: string; label: string; description?: string }>;
  // Atraso inteligente
  delaySeconds?: number;
  delayPresence?: 'composing' | 'recording' | 'none';
  // Ação
  actionType?: 'add_tag' | 'remove_tag' | 'change_status' | 'open_support' | 'notify_attendant';
  actionValue?: string;
  // Condição
  conditionType?: 'has_tag' | 'client_status' | 'custom_field';
  conditionField?: string;
  conditionValue?: string;
  // Conexão de fluxo
  targetFlowId?: string;
  // Randomizador
  randomAWeight?: number;
};

export type FlowDefinition = {
  id: string;
  userId: string;
  name: string;
  description?: string;
  isActive: boolean;
  isDefault?: boolean;
  nodes: any[];
  edges: any[];
  createdAt?: any;
  updatedAt?: any;
};

export type FlowContactSession = {
  id: string;
  userId: string;
  flowId: string;
  currentNodeId: string;
  status: 'active' | 'waiting_user_input' | 'completed' | 'paused';
  variables?: Record<string, any>;
  lastInteractionAt?: any;
  history?: Array<{ nodeId: string; timestamp: number; input?: string }>;
};


