'use client';

import Link from "next/link";
import { useState } from "react";
import { Mail } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { sendPasswordResetEmail } from "firebase/auth";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from '@/firebase';
import { FirebaseError } from 'firebase/app';

const forgotPasswordSchema = z.object({
  email: z.string().email({ message: "Por favor, insira um email válido." }),
});

export default function ForgotPasswordPage() {
  const auth = useAuth();
  const { toast } = useToast();
  const [emailSent, setEmailSent] = useState(false);

  const form = useForm<z.infer<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof forgotPasswordSchema>) => {
    try {
      await sendPasswordResetEmail(auth, values.email);
      setEmailSent(true);
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Falha ao enviar e-mail",
        description: "Não foi possível processar sua solicitação. Tente novamente mais tarde.",
      });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="mx-auto w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Image
              src="https://i.imgur.com/sgoiuiz.png"
              alt="EMPREENDIMENTOS Logo"
              width={40}
              height={40}
              className="h-10 w-10"
              data-ai-hint="logo"
            />
            <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">EMPREENDIMENTOS</h1>
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">Recuperar Senha</CardTitle>
            <CardDescription className="text-gray-500 dark:text-gray-400 pt-1">
              {emailSent 
                ? "Verifique sua caixa de entrada!"
                : "Insira seu e-mail para receber o link de recuperação."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {emailSent ? (
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Um e-mail foi enviado para <span className="font-semibold">{form.getValues('email')}</span> com as instruções para redefinir sua senha.
              </p>
              <Button asChild className="mt-6 w-full">
                <Link href="/login">Voltar para o Login</Link>
              </Button>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel>E-mail</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                          <Input
                            type="email"
                            placeholder="m@example.com"
                            className="pl-10"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? 'Enviando...' : 'Enviar Link de Recuperação'}
                </Button>
              </form>
            </Form>
          )}
           <div className="mt-6 text-center text-sm">
            Lembrou a senha?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Fazer login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
