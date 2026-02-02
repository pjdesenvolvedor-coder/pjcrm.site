export type User = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  role: 'Admin' | 'Agent';
};

export type Message = {
  id: string;
  sender: 'user' | 'agent';
  content: string;
  timestamp: string;
  avatarUrl: string;
};

export type Conversation = {
  id: string;
  customerName: string;
  lastMessage: string;
  timestamp: string;
  avatarUrl: string;
  unreadCount: number;
  messages: Message[];
};

export type Automation = {
  id: string;
  name: string;
  trigger: string;
  action: string;
  status: 'Active' | 'Inactive';
};

export type CustomerSegment = {
  id: string;
  name: string;
  criteria: string;
  customerCount: number;
};
