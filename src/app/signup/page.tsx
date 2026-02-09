'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { MessageSquare } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, serverTimestamp } from "firebase/firestore";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth, useUser, useFirebase, setDocumentNonBlocking } from '@/firebase';
import { FirebaseError } from "firebase/app";
import { UserPermissions } from "@/lib/types";

const signupSchema = z.object({
  firstName: z.string().min(1, { message: "O nome é obrigatório." }),
  lastName: z.string().min(1, { message: "O sobrenome é obrigatório." }),
  email: z.string().email({ message: "Por favor, insira um email válido." }),
  password: z.string().min(6, { message: "A senha deve ter no mínimo 6 caracteres." }),
});

export default function SignupPage() {
  const auth = useAuth();
  const { firestore } = useFirebase();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    if (!isUserLoading && user) {
      router.push('/dashboard');
    }
  }, [user, isUserLoading, router]);

  const onSubmit = async (values: z.infer<typeof signupSchema>) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, values.email, values.password);
      const firebaseUser = userCredential.user;
      
      await updateProfile(firebaseUser, {
        displayName: `${values.firstName} ${values.lastName}`
      });

      const userDocRef = doc(firestore, "users", firebaseUser.uid);
      
      // By default, new users are Agents with only dashboard access.
      // The first user should go to the Firebase Console to change their role to 'Admin'.
      const defaultPermissions: UserPermissions = {
        dashboard: true,
        customers: false,
        inbox: false,
        automations: false,
        zapconnect: false,
        settings: false,
        users: false,
      };

      setDocumentNonBlocking(userDocRef, {
        id: firebaseUser.uid,
        firstName: values.firstName,
        lastName: values.lastName,
        email: firebaseUser.email,
        createdAt: serverTimestamp(),
        role: "Agent", 
        permissions: defaultPermissions,
        avatarUrl: `https://picsum.photos/seed/${firebaseUser.uid}/40/40`
      }, { merge: true });

      toast({
        title: "Conta criada com sucesso!",
        description: "Redirecionando para o painel...",
      });
      // The useEffect will handle redirection
    } catch (error) {
      console.error(error);
      let description = "Ocorreu um erro desconhecido.";
      if (error instanceof FirebaseError) {
        if (error.code === 'auth/email-already-in-use') {
          description = "Este email já está em uso.";
        } else {
          description = "Ocorreu um erro ao tentar criar a conta.";
        }
      }
      toast({
        variant: "destructive",
        title: "Falha no cadastro",
        description,
      });
    }
  };
  
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
          <CardTitle className="text-2xl">Criar uma conta</CardTitle>
          <CardDescription>
            Insira seus dados para criar seu acesso ao CRM.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input placeholder="Seu nome" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sobrenome</FormLabel>
                    <FormControl>
                      <Input placeholder="Seu sobrenome" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
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
                  <FormItem>
                    <FormLabel>Senha</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Criando conta...' : 'Criar conta'}
              </Button>
            </form>
          </Form>
          <div className="mt-4 text-center text-sm">
            Já tem uma conta?{" "}
            <Link href="/login" className="underline">
              Fazer login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
