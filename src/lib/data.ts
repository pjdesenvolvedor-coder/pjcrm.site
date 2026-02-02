import type { User, Conversation, Message, Automation, CustomerSegment } from '@/lib/types';
import { PlaceHolderImages } from '@/lib/placeholder-images';

const userAvatar1 = PlaceHolderImages.find(img => img.id === 'user-avatar-1')?.imageUrl || '';
const userAvatar2 = PlaceHolderImages.find(img => img.id === 'user-avatar-2')?.imageUrl || '';
const userAvatar3 = PlaceHolderImages.find(img => img.id === 'user-avatar-3')?.imageUrl || '';
const userAvatar4 = PlaceHolderImages.find(img => img.id === 'user-avatar-4')?.imageUrl || '';

export const mockUsers: User[] = [
  { id: '1', name: 'Ana Silva', email: 'ana.silva@example.com', avatarUrl: userAvatar1, role: 'Admin' },
  { id: '2', name: 'Bruno Costa', email: 'bruno.costa@example.com', avatarUrl: userAvatar3, role: 'Agent' },
  { id: '3', name: 'Carla Dias', email: 'carla.dias@example.com', avatarUrl: userAvatar2, role: 'Agent' },
];

export const mockMessages: Record<string, Message[]> = {
  'conv-1': [
    { id: 'msg-1-1', sender: 'user', content: 'Olá, gostaria de saber mais sobre o plano Pro.', timestamp: '10:00', avatarUrl: userAvatar2 },
    { id: 'msg-1-2', sender: 'agent', content: 'Olá! Claro, o plano Pro custa R$99/mês e inclui automações ilimitadas.', timestamp: '10:01', avatarUrl: userAvatar1 },
  ],
  'conv-2': [
    { id: 'msg-2-1', sender: 'user', content: 'Qual o horário de funcionamento?', timestamp: 'Ontem', avatarUrl: userAvatar4 },
  ],
  'conv-3': [
    { id: 'msg-3-1', sender: 'user', content: 'Preciso de ajuda com a integração.', timestamp: 'Sexta-feira', avatarUrl: userAvatar3 },
  ],
};

export const mockConversations: Conversation[] = [
  { id: 'conv-1', customerName: 'Carla Dias', lastMessage: 'Olá! Claro, o plano Pro custa R$99/mês e inclui...', timestamp: '10:01', avatarUrl: userAvatar2, unreadCount: 0, messages: mockMessages['conv-1'] },
  { id: 'conv-2', customerName: 'Fernando Souza', lastMessage: 'Qual o horário de funcionamento?', timestamp: 'Ontem', avatarUrl: userAvatar4, unreadCount: 1, messages: mockMessages['conv-2'] },
  { id: 'conv-3', customerName: 'Bruno Costa', lastMessage: 'Preciso de ajuda com a integração.', timestamp: 'Sexta-feira', avatarUrl: userAvatar3, unreadCount: 0, messages: mockMessages['conv-3'] },
];

export const mockAutomations: Automation[] = [
  { id: '1', name: 'Mensagem de Boas-vindas', trigger: 'Novo Cliente', action: 'Enviar Mensagem', status: 'Active' },
  { id: '2', name: 'Pesquisa de Satisfação', trigger: 'Ticket Fechado', action: 'Enviar Formulário', status: 'Active' },
  { id: '3', name: 'Aviso de Inatividade', trigger: 'Inativo por 30 dias', action: 'Enviar Notificação', status: 'Inactive' },
];

export const mockCustomerSegments: CustomerSegment[] = [
  { id: '1', name: 'Clientes VIP', criteria: 'Comprou > R$ 1000', customerCount: 42 },
  { id: '2', name: 'Novos Clientes (Últimos 30 dias)', criteria: 'Data de Cadastro < 30d', customerCount: 112 },
  { id: '3', name: 'Clientes Inativos', criteria: 'Última Compra > 90d', customerCount: 78 },
];
