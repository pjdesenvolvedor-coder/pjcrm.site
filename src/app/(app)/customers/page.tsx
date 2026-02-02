import { PlusCircle } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { mockCustomerSegments } from '@/lib/data';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from '@/components/ui/textarea';

export default function CustomersPage() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Segmentos de Clientes"
        description="Agrupe seus clientes com base em critérios personalizados."
      >
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <PlusCircle className="h-4 w-4" />
              Criar Segmento
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Novo Segmento</DialogTitle>
              <DialogDescription>
                Defina um novo segmento de clientes.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">
                  Nome
                </Label>
                <Input id="name" defaultValue="Clientes VIP" className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="criteria" className="text-right pt-2">
                  Critérios
                </Label>
                <Textarea id="criteria" defaultValue="Comprou > R$ 1000 nos últimos 6 meses" className="col-span-3" />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">Salvar Segmento</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Segmentos Criados</CardTitle>
            <CardDescription>
              Gerencie seus segmentos de clientes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome do Segmento</TableHead>
                  <TableHead>Critérios</TableHead>
                  <TableHead className="text-right">Nº de Clientes</TableHead>
                  <TableHead>
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockCustomerSegments.map((segment) => (
                  <TableRow key={segment.id}>
                    <TableCell className="font-medium">{segment.name}</TableCell>
                    <TableCell>{segment.criteria}</TableCell>
                    <TableCell className="text-right">{segment.customerCount}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">Ver Clientes</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
