'use client';

import { useState, useEffect } from 'react';
import { doc } from 'firebase/firestore';
import { useFirebase, useUser, useDoc, setDocumentNonBlocking, useMemoFirebase } from '@/firebase';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { Settings } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export default function PresetsPage() {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const { toast } = useToast();

  const [presetHour, setPresetHour] = useState('09');
  const [presetMinute, setPresetMinute] = useState('00');
  const [timeMode, setTimeMode] = useState<'live' | 'preset'>('live');

  const settingsDocRef = useMemoFirebase(() => {
    if (!user) return null;
    return doc(firestore, 'users', user.uid, 'settings', 'config');
  }, [firestore, user]);

  const { data: settings, isLoading } = useDoc<Settings>(settingsDocRef);

  useEffect(() => {
    if (settings) {
      setPresetHour(settings.presetHour || '09');
      setPresetMinute(settings.presetMinute || '00');
      setTimeMode(settings.usePresetTime ? 'preset' : 'live');
    }
  }, [settings]);

  const handleSave = () => {
    if (settingsDocRef) {
      const newSettings: Partial<Settings> = {
        presetHour,
        presetMinute,
        usePresetTime: timeMode === 'preset',
      };
      setDocumentNonBlocking(settingsDocRef, newSettings, { merge: true });
      toast({
        title: 'Predefinições Salvas!',
        description: 'Suas configurações de horário foram salvas com sucesso.',
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Predefinição de Horário"
        description="Defina um horário padrão para o vencimento de novos clientes."
      />
      <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Horário Padrão</CardTitle>
            <CardDescription>
              Este horário será usado ao adicionar novos clientes, se a opção "Hora Salva" estiver ativa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-24">
                      <Label htmlFor="presetHour">Hora</Label>
                      <Input
                          id="presetHour"
                          value={presetHour}
                          onChange={(e) => setPresetHour(e.target.value.padStart(2, '0'))}
                          className="text-center text-lg"
                      />
                  </div>
                  <span className="text-lg font-bold">:</span>
                  <div className="w-24">
                      <Label htmlFor="presetMinute">Minuto</Label>
                      <Input
                          id="presetMinute"
                          value={presetMinute}
                          onChange={(e) => setPresetMinute(e.target.value.padStart(2, '0'))}
                          className="text-center text-lg"
                      />
                  </div>
                </div>

                <RadioGroup value={timeMode} onValueChange={(value: 'live' | 'preset') => setTimeMode(value)} className="mt-6 space-y-2">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="live" id="live" />
                    <Label htmlFor="live">Hora ao Vivo</Label>
                  </div>
                   <p className="pl-6 text-sm text-muted-foreground">Usar a hora e minuto atuais no momento da criação do cliente.</p>
                  <div className="flex items-center space-x-2 pt-2">
                    <RadioGroupItem value="preset" id="preset" />
                    <Label htmlFor="preset">Hora Salva</Label>
                  </div>
                  <p className="pl-6 text-sm text-muted-foreground">Usar o horário predefinido acima para todos os novos clientes.</p>
                </RadioGroup>
              </>
            )}
          </CardContent>
          <CardContent>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? 'Carregando...' : 'Salvar Alterações'}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
