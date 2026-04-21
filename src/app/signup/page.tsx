
'use client';

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";
import { MessageSquare, Mail, Lock } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, serverTimestamp, getDoc } from "firebase/firestore";
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

function SignupForm() {
  const auth = useAuth();
  const { firestore } = useFirebase();
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const ref = searchParams.get('ref');

  const form = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "" },
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
      
      await updateProfile(firebaseUser, { displayName: `${values.firstName} ${values.lastName}` });

      const userDocRef = doc(firestore, "users", firebaseUser.uid);
      
      // Default permissions for new accounts
      const defaultPermissions: UserPermissions = {
        dashboard: true, customers: false, inbox: false, automations: false,
        groups: false, shot: false, zapconnect: false, settings: false, users: false,
        attendants: false, notes: true, ads: false, pix: false, usage: false, estoque: false,
        logs: false, dbCleaner: false, zapVendas: false, calendario: false
      };

      const profileData: any = {
        id: firebaseUser.uid,
        firstName: values.firstName,
        lastName: values.lastName,
        email: firebaseUser.email,
        createdAt: serverTimestamp(),
        role: ref ? "Agent" : "User", // If invited, it's an agent
        parentId: ref || null, // Link to owner
        permissions: defaultPermissions,
        avatarUrl: `https://picsum.photos/seed/${firebaseUser.uid}/40/40`,
        status: 'active',
        subscriptionPlan: null,
        subscriptionEndDate: null,
      };

      // If it's an attendant, copy parent's plan info
      if (ref) {
          const parentDoc = await getDoc(doc(firestore, "users", ref));
          if (parentDoc.exists()) {
              const parentData = parentDoc.data();
              profileData.subscriptionPlan = parentData.subscriptionPlan ?? null;
              profileData.subscriptionEndDate = parentData.subscriptionEndDate ?? null;
          }
      }

      setDocumentNonBlocking(userDocRef, profileData, { merge: true });

      toast({ title: "Conta criada!", description: "Bem-vindo ao sistema." });
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", title: "Falha no cadastro" });
    }
  };

  if (isUserLoading || user) {
    return (
        <div className="flex h-screen w-screen items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
                <MessageSquare className="h-12 w-12 animate-pulse text-primary" />
                <p className="text-muted-foreground">Carregando...</p>
            </div>
        </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="mx-auto w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-4">
           <div className="flex items-center justify-center gap-2">
            <Image src="https://i.imgur.com/sgoiuiz.png" alt="Logo" width={40} height={40} className="h-10 w-10" />
            <h1 className="text-3xl font-bold">EMPREENDIMENTOS</h1>
          </div>
          <div>
            <CardTitle className="text-2xl font-semibold">
                {ref ? "Cadastro de Atendente" : "Criar sua Conta"}
            </CardTitle>
            <CardDescription className="pt-1">
              {ref ? "Você foi convidado para trabalhar nesta equipe." : "Insira seus dados para começar."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="firstName" render={({ field }) => (
                        <FormItem><FormLabel>Nome</FormLabel><FormControl><Input placeholder="Ex: João" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="lastName" render={({ field }) => (
                        <FormItem><FormLabel>Sobrenome</FormLabel><FormControl><Input placeholder="Ex: Silva" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                </div>
                <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel>E-mail</FormLabel><FormControl><Input placeholder="m@exemplo.com" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem><FormLabel>Senha</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl><FormMessage /></FormItem>
                )}/>
                <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? 'Processando...' : 'Finalizar Cadastro'}
                </Button>
            </form>
          </Form>
          <div className="mt-6 text-center text-sm">
            Já tem conta? <Link href="/login" className="font-medium text-primary hover:underline">Fazer login</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function SignupPage() {
    return (
        <Suspense fallback={<div>Carregando...</div>}>
            <SignupForm />
        </Suspense>
    );
}
