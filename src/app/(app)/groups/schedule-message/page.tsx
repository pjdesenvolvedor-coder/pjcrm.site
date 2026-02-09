'use client';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ScheduleMessagePage() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Agendar Mensagens"
        description="Agende o envio de mensagens para os grupos cadastrados."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <div className="w-full max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Agendar Mensagens</CardTitle>
                <CardDescription>
                  Agende o envio de mensagens para os grupos cadastrados.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center text-center text-muted-foreground p-8">
                  <p>Funcionalidade de agendamento de mensagens em desenvolvimento.</p>
                </div>
              </CardContent>
            </Card>
        </div>
      </main>
    </div>
  );
}
