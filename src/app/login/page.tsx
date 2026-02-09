'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { MessageSquare } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signInWithEmailAndPassword } from "firebase/auth";
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
  password: z.string().min(6, { message: "A senha deve ter no mínimo 6 caracteres." }),
});

export default function LoginPage() {
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    if (!isUserLoading && user) {
      router.push('/dashboard');
    }
  }, [user, isUserLoading, router]);


  const onSubmit = async (values: z.infer<typeof loginSchema>) => {
    try {
      await signInWithEmailAndPassword(auth, values.email, values.password);
      toast({
        title: "Login bem-sucedido!",
        description: "Redirecionando para o painel...",
      });
      // The useEffect will handle redirection
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

  const handleGoogleLogin = () => {
    // TODO: Implement Google Sign-In
    toast({
        title: "Em breve!",
        description: "O login com Google ainda não foi implementado.",
    });
  }

  if (isUserLoading || user) {
    return (
        <div className="flex h-screen w-screen items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <MessageSquare className="h-12 w-12 animate-pulse text-primary" />
                <p className="text-muted-foreground">Carregando...</p>
            </div>
        </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="mx-auto w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mb-4 flex items-center justify-center gap-2">
            <Image
              src="https://i.imgur.com/sgoiuiz.png"
              alt="EMPREENDIMENTOS Logo"
              width={32}
              height={32}
              className="h-8 w-8"
              data-ai-hint="logo"
            />
            <h1 className="text-2xl font-bold">EMPREENDIMENTOS</h1>
          </div>
          <CardTitle className="text-2xl">Acessar CRM</CardTitle>
          <CardDescription>
            Entre com seu email para acessar o sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="grid gap-2">
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="m@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem className="grid gap-2">
                    <div className="flex items-center">
                      <FormLabel>Senha</FormLabel>
                      <Link
                        href="#"
                        className="ml-auto inline-block text-sm underline"
                      >
                        Esqueceu sua senha?
                      </Link>
                    </div>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Conectando...' : 'Conectar'}
              </Button>
            </form>
          </Form>
           <Button variant="outline" className="w-full mt-4" onClick={handleGoogleLogin}>
              Login com Google
            </Button>
          <div className="mt-4 text-center text-sm">
            Não tem uma conta?{" "}
            <Link href="/signup" className="underline">
              Cadastre-se
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
