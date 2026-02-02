import { InboxView } from '@/components/inbox-view';
import { PageHeader } from '@/components/page-header';

export default function InboxPage() {
  return (
    <div className="flex flex-col h-screen bg-background">
      <PageHeader
        title="Caixa de Entrada"
        description="Gerencie suas conversas com clientes."
      />
      <InboxView />
    </div>
  );
}
