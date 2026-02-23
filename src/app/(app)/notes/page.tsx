'use client';

import { useState, useEffect } from 'react';
import { PlusCircle, CheckCircle, ListTodo, Trash2, Check, X } from 'lucide-react';
import {
  collection,
  query,
  orderBy,
  doc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { format } from 'date-fns';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useFirebase,
  useUser,
  useCollection,
  useMemoFirebase,
  addDocumentNonBlocking,
  setDocumentNonBlocking,
  deleteDocumentNonBlocking,
} from '@/firebase';
import type { Note } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface NoteCardProps {
    note: Note;
    onDelete: (noteId: string) => void;
    onStatusChange: (noteId: string, newStatus: 'todo' | 'done') => void;
}

function NoteCard({ note, onDelete, onStatusChange }: NoteCardProps) {
    return (
        <Card className="shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-start gap-4">
                <div className="flex-1">
                    <p className="pr-8">{note.content}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                        {note.createdAt instanceof Timestamp
                            ? format(note.createdAt.toDate(), "dd/MM/yyyy 'às' HH:mm")
                            : 'agora'}
                    </p>
                </div>
                <div className="flex flex-col gap-1">
                     {note.status === 'todo' ? (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-green-500 hover:bg-green-100 hover:text-green-600" onClick={() => onStatusChange(note.id, 'done')}>
                            <Check className="h-5 w-5" />
                        </Button>
                    ) : (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-yellow-500 hover:bg-yellow-100 hover:text-yellow-600" onClick={() => onStatusChange(note.id, 'todo')}>
                            <X className="h-5 w-5" />
                        </Button>
                    )}
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                                <AlertDialogDescription>Esta ação não pode ser desfeita. A nota será excluída permanentemente.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => onDelete(note.id)}>Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </CardContent>
        </Card>
    );
}

export default function NotesPage() {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  
  const [todoNotes, setTodoNotes] = useState<Note[]>([]);
  const [doneNotes, setDoneNotes] = useState<Note[]>([]);

  const notesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(
      collection(firestore, 'users', user.uid, 'notes'),
      orderBy('createdAt', 'desc')
    );
  }, [firestore, user]);

  const { data: notes, isLoading } = useCollection<Note>(notesQuery);

  useEffect(() => {
    if (notes) {
      setTodoNotes(notes.filter((note) => note.status === 'todo'));
      setDoneNotes(notes.filter((note) => note.status === 'done'));
    }
  }, [notes]);

  const handleAddNote = () => {
    if (!user || !newNoteContent.trim()) return;

    addDocumentNonBlocking(collection(firestore, 'users', user.uid, 'notes'), {
      userId: user.uid,
      content: newNoteContent,
      status: 'todo',
      createdAt: serverTimestamp(),
    });

    toast({ title: 'Nota adicionada!', description: 'Sua nova tarefa foi criada.' });
    setNewNoteContent('');
    setOpen(false);
  };
  
  const handleDeleteNote = (noteId: string) => {
    if (!user) return;
    const docRef = doc(firestore, 'users', user.uid, 'notes', noteId);
    deleteDocumentNonBlocking(docRef);
    toast({ title: 'Nota removida!' });
  };
  
  const handleStatusChange = (noteId: string, newStatus: 'todo' | 'done') => {
    if (!user) return;
    const noteDocRef = doc(firestore, 'users', user.uid, 'notes', noteId);
    setDocumentNonBlocking(noteDocRef, { status: newStatus }, { merge: true });
    
    // Optimistic UI update
    if (newStatus === 'done') {
        const noteToMove = todoNotes.find(n => n.id === noteId);
        if (noteToMove) {
            setTodoNotes(prev => prev.filter(n => n.id !== noteId));
            setDoneNotes(prev => [{...noteToMove, status: 'done'}, ...prev]);
        }
    } else {
        const noteToMove = doneNotes.find(n => n.id === noteId);
        if (noteToMove) {
            setDoneNotes(prev => prev.filter(n => n.id !== noteId));
            setTodoNotes(prev => [{...noteToMove, status: 'todo'}, ...prev]);
        }
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Tarefas" description="Clique nos botões para mover as notas entre as colunas.">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1">
              <PlusCircle className="h-4 w-4" />
              Adicionar Tarefa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Tarefa</DialogTitle>
            </DialogHeader>
            <Textarea
              placeholder="Descreva sua tarefa aqui..."
              value={newNoteContent}
              onChange={(e) => setNewNoteContent(e.target.value)}
              className="min-h-[120px]"
            />
            <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleAddNote}>Salvar Tarefa</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>
      <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="rounded-lg bg-muted/50 p-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                    <ListTodo className="text-yellow-500" />
                    A Fazer ({todoNotes.length})
                </h2>
                <div className="space-y-4 min-h-[100px]">
                    {isLoading ? (
                        <Skeleton className="h-20 w-full" />
                    ) : todoNotes.length > 0 ? (
                        todoNotes.map((note) => (
                            <NoteCard key={note.id} note={note} onDelete={handleDeleteNote} onStatusChange={handleStatusChange} />
                        ))
                    ) : (
                        <div className="text-center text-muted-foreground py-4">
                            Nenhuma tarefa pendente.
                        </div>
                    )}
                </div>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                    <CheckCircle className="text-green-500" />
                    Feitas ({doneNotes.length})
                </h2>
                <div className="space-y-4 min-h-[100px]">
                    {isLoading ? (
                        <Skeleton className="h-20 w-full" />
                    ) : doneNotes.length > 0 ? (
                        doneNotes.map((note) => (
                            <NoteCard key={note.id} note={note} onDelete={handleDeleteNote} onStatusChange={handleStatusChange} />
                        ))
                    ) : (
                        <div className="text-center text-muted-foreground py-4">
                            Nenhuma tarefa concluída ainda.
                        </div>
                    )}
                </div>
            </div>
          </div>
      </main>
    </div>
  );
}
