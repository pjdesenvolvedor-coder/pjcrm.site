import { Timestamp } from 'firebase/firestore';

export type UserProfile = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Timestamp;
  role: 'Admin' | 'Agent';
  avatarUrl?: string;
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

export type CustomerSegment = {
  id: string;
  userId: string;
  name: string;
  criteria: string;
  customerCount: number;
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

    