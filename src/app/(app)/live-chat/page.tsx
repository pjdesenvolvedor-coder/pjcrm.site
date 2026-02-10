import { LiveChatView } from '@/components/live-chat-view';
import { PageHeader } from '@/components/page-header';

export default function LiveChatPage() {
  return (
    <div className="flex flex-col h-screen bg-background">
      <PageHeader
        title="Chat Ao Vivo"
        description="Converse com nossa equipe de suporte."
      />
      <LiveChatView />
    </div>
  );
}
