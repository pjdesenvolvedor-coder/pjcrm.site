import { PageHeader } from '@/components/page-header';
import { Construction } from 'lucide-react';

export default function InboxPage() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Caixa de Entrada"
        description="Gerencie suas conversas com clientes."
      />
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="flex flex-col items-center gap-1 text-center">
            <Construction className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-2xl font-bold tracking-tight">
                Em Desenvolvimento
            </h3>
            <p className="text-sm text-muted-foreground">
                Esta funcionalidade está sendo construída e estará disponível em breve.
            </p>
        </div>
      </main>
    </div>
  );
}
