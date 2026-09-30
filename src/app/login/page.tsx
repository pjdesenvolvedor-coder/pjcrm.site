'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MessageSquare, Mail, Lock, ShieldCheck, UserCheck, ArrowLeft, RefreshCw, Send, CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth, useUser } from '@/firebase';
import { FirebaseError } from 'firebase/app';

const loginSchema = z.object({
  email: z.string().email({ message: "Por favor, insira um email válido." }),
  password: z.string().min(1, { message: "A senha é obrigatória." }),
});

interface TwoFactorRecipient {
  id: string;
  name: string;
  phone: string;
}

type LoginStep = 'credentials' | 'select_recipient' | 'enter_code';

export default function LoginPage() {
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  // 2FA Flow State
  const [step, setStep] = useState<LoginStep>('credentials');
  const [twoFactorConfig, setTwoFactorConfig] = useState<{
    enabled: boolean;
    recipients: TwoFactorRecipient[];
  }>({
    enabled: true,
    recipients: [
      { id: '1', name: 'Jivago', phone: '77998413534' },
      { id: '2', name: 'May', phone: '87991791807' },
    ],
  });

  const [selectedRecipient, setSelectedRecipient] = useState<TwoFactorRecipient | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [phoneMasked, setPhoneMasked] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [isPassed2FA, setIsPassed2FA] = useState(false);

  // Form
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // Pre-fetch 2FA config
  useEffect(() => {
    fetch('/api/2-fatores/login-config')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setTwoFactorConfig({
            enabled: data.enabled !== undefined ? data.enabled : true,
            recipients: Array.isArray(data.recipients) && data.recipients.length > 0
              ? data.recipients
              : [
                  { id: '1', name: 'Jivago', phone: '77998413534' },
                  { id: '2', name: 'May', phone: '87991791807' },
                ],
          });
        }
      })
      .catch((e) => console.error('Erro ao carregar config 2FA:', e));
  }, []);

  // Redirect to dashboard only when 2FA passed or not required
  useEffect(() => {
    if (!isUserLoading && user && isPassed2FA) {
      router.push('/dashboard');
    }
  }, [user, isUserLoading, isPassed2FA, router]);

  // Step 1: Submit Credentials
  const onSubmitCredentials = async (values: z.infer<typeof loginSchema>) => {
    try {
      await signInWithEmailAndPassword(auth, values.email, values.password);

      // Se o 2FA estiver ativado, avança para a escolha do destinatário
      if (twoFactorConfig.enabled) {
        setStep('select_recipient');
        toast({
          title: "Senha Correta! 🔒",
          description: "Selecione quem irá acessar o Painel para receber o código 2FA.",
        });
      } else {
        // Se 2FA estiver desativado, libera login direto
        setIsPassed2FA(true);
        toast({
          title: "Login bem-sucedido!",
          description: "Redirecionando para o painel...",
        });
      }
    } catch (error) {
      console.error(error);
      let description = "Ocorreu um erro desconhecido.";
      if (error instanceof FirebaseError) {
        switch (error.code) {
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            description = "Email ou senha inválidos.";
            break;
          default:
            description = "Ocorreu um erro ao tentar fazer login.";
        }
      }
      toast({
        variant: "destructive",
        title: "Falha no login",
        description,
      });
    }
  };

  // Step 2: Choose Recipient and send 2FA Code via WhatsApp
  const handleSelectRecipient = async (recipient: TwoFactorRecipient) => {
    setSelectedRecipient(recipient);
    setIsSendingCode(true);

    try {
      const res = await fetch('/api/2-fatores/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: recipient.id }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSessionId(data.sessionId);
        setPhoneMasked(data.phoneMasked || recipient.phone);
        setStep('enter_code');
        setInputCode('');
        toast({
          title: `Código Enviado! 📲`,
          description: `Enviamos o código 2FA no WhatsApp de ${recipient.name}.`,
        });
      } else {
        throw new Error(data.error || 'Falha ao enviar código.');
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro no envio do código",
        description: err.message || "Não foi possível enviar o código via WhatsApp.",
      });
    } finally {
      setIsSendingCode(false);
    }
  };

  // Step 3: Verify Code
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) {
      toast({
        variant: "destructive",
        title: "Código obrigatório",
        description: "Digite o código de 6 dígitos que você recebeu no WhatsApp.",
      });
      return;
    }

    setIsVerifyingCode(true);
    try {
      const res = await fetch('/api/2-fatores/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          code: inputCode.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: "Acesso Autorizado! ✅",
          description: `Bem-vindo ao Painel ADM, ${selectedRecipient?.name || ''}!`,
        });
        setIsPassed2FA(true);
        router.push('/dashboard');
      } else {
        throw new Error(data.error || 'Código incorreto.');
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Falha na verificação",
        description: err.message || "Código inválido ou expirado.",
      });
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleBackToSelect = () => {
    setStep('select_recipient');
    setInputCode('');
  };

  const handleCancelLogin = async () => {
    try {
      await signOut(auth);
    } catch {}
    setStep('credentials');
    setSelectedRecipient(null);
    setInputCode('');
    setIsPassed2FA(false);
  };

  if (isUserLoading || (user && isPassed2FA)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <MessageSquare className="h-12 w-12 animate-pulse text-primary" />
          <p className="text-muted-foreground font-medium">Carregando painel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="mx-auto w-full max-w-md shadow-xl border-primary/20">
        <CardHeader className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <Image
              src="https://i.imgur.com/sgoiuiz.png"
              alt="EMPREENDIMENTOS Logo"
              width={42}
              height={42}
              className="h-10 w-10"
              data-ai-hint="logo"
            />
            <h1 className="text-2xl font-bold tracking-tight text-gray-800 dark:text-gray-200">
              EMPREENDIMENTOS
            </h1>
          </div>

          {step === 'credentials' && (
            <div>
              <CardTitle className="text-2xl font-semibold">Acesse seu CRM</CardTitle>
              <CardDescription className="text-gray-500 dark:text-gray-400 pt-1">
                Acesse seu painel com segurança.
              </CardDescription>
            </div>
          )}

          {step === 'select_recipient' && (
            <div>
              <div className="inline-flex p-2.5 rounded-full bg-primary/10 text-primary mb-2">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <CardTitle className="text-xl font-bold">Verificação em Duas Etapas (2FA)</CardTitle>
              <CardDescription className="text-sm font-medium text-foreground pt-1">
                Quem está acessando o Painel ADM?
              </CardDescription>
            </div>
          )}

          {step === 'enter_code' && (
            <div>
              <div className="inline-flex p-2.5 rounded-full bg-emerald-500/10 text-emerald-600 mb-2">
                <Lock className="h-7 w-7" />
              </div>
              <CardTitle className="text-xl font-bold">Digite o Código de Acesso</CardTitle>
              <CardDescription className="text-xs text-muted-foreground pt-1">
                Enviamos um código para o WhatsApp de <b>{selectedRecipient?.name}</b> ({phoneMasked}).
              </CardDescription>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-6 pt-2">
          {/* ETAPA 1: EMAIL E SENHA */}
          {step === 'credentials' && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitCredentials)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel>E-mail</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                          <Input
                            type="email"
                            placeholder="admin@exemplo.com"
                            className="pl-10"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <FormLabel>Senha</FormLabel>
                        <Link
                          href="/forgot-password"
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Esqueceu sua senha?
                        </Link>
                      </div>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                          <Input
                            type="password"
                            placeholder="••••••••"
                            className="pl-10"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full font-bold text-base h-11"
                  disabled={form.formState.isSubmitting}
                >
                  {form.formState.isSubmitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      Autenticando...
                    </>
                  ) : (
                    'Entrar no Painel'
                  )}
                </Button>
              </form>
            </Form>
          )}

          {/* ETAPA 2: ESCOLHER DESTINATÁRIO (BOTÕES JIVAGO / MAY) */}
          {step === 'select_recipient' && (
            <div className="space-y-4">
              <p className="text-xs text-center text-muted-foreground">
                Clique no seu nome para receber o código de liberação no seu WhatsApp:
              </p>

              <div className="grid grid-cols-1 gap-3 pt-2">
                {twoFactorConfig.recipients.map((recipient) => (
                  <Button
                    key={recipient.id}
                    type="button"
                    variant="outline"
                    onClick={() => handleSelectRecipient(recipient)}
                    disabled={isSendingCode}
                    className="w-full h-14 justify-start px-4 text-base font-bold border-2 hover:border-primary hover:bg-primary/5 transition-all gap-3"
                  >
                    <div className="flex items-center justify-center h-9 w-9 rounded-full bg-primary/10 text-primary shrink-0">
                      <UserCheck className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col items-start text-left flex-1">
                      <span className="text-sm font-bold text-foreground">{recipient.name}</span>
                      <span className="text-xs font-normal text-muted-foreground font-mono">
                        Enviar para WhatsApp ({recipient.phone.slice(-4)})
                      </span>
                    </div>
                    {isSendingCode && selectedRecipient?.id === recipient.id ? (
                      <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <Send className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                ))}
              </div>

              <div className="pt-3 border-t flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelLogin}
                  className="text-xs text-muted-foreground gap-1.5"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao Login
                </Button>
              </div>
            </div>
          )}

          {/* ETAPA 3: DIGITAR CÓDIGO 2FA */}
          {step === 'enter_code' && (
            <form onSubmit={handleVerifyCode} className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-center block text-muted-foreground">
                  CÓDIGO DE VERIFICAÇÃO:
                </label>
                <Input
                  type="text"
                  autoFocus
                  placeholder="Ex: 849204"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  className="text-center font-mono font-extrabold text-2xl tracking-[0.25em] h-14 bg-muted/30 border-2 focus-visible:border-primary uppercase"
                  maxLength={10}
                />
              </div>

              <Button
                type="submit"
                disabled={isVerifyingCode || !inputCode.trim()}
                className="w-full font-bold text-base h-11 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                {isVerifyingCode ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    Verificando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5" />
                    Confirmar e Entrar
                  </>
                )}
              </Button>

              <div className="flex items-center justify-between pt-2 border-t text-xs">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => selectedRecipient && handleSelectRecipient(selectedRecipient)}
                  disabled={isSendingCode}
                  className="text-xs text-primary font-medium p-0 h-auto hover:bg-transparent hover:underline gap-1"
                >
                  <RefreshCw className={`h-3 w-3 ${isSendingCode ? 'animate-spin' : ''}`} />
                  Reenviar código
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleBackToSelect}
                  className="text-xs text-muted-foreground p-0 h-auto hover:bg-transparent hover:underline gap-1"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Trocar pessoa
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
