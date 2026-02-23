'use client';

import { useState, useEffect } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  rectIntersection,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { PlusCircle, CheckCircle, ListTodo, Trash2 } from 'lucide-react';
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

interface Columns {
  todo: {
    id: 'todo';
    title: 'A Fazer';
    notes: Note[];
  };
  done: {
    id: 'done';
    title: 'Feitas';
    notes: Note[];
  };
}

function SortableNote({ note, onDelete }: { note: Note; onDelete: (noteId: string) => void; }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: note.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : 0,
        position: 'relative' as 'relative',
    };
    
    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <Card className={`shadow-sm hover:shadow-md transition-shadow ${isDragging ? 'shadow-lg' : ''}`}>
                <CardContent className="p-4 relative">
                    <p className="pr-8">{note.content}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                        {note.createdAt instanceof Timestamp
                            ? format(note.createdAt.toDate(), "dd/MM/yyyy 'às' HH:mm")
                            : 'agora'}
                    </p>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="absolute top-1 right-1 h-7 w-7">
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
                </CardContent>
            </Card>
        </div>
    );
}


export default function NotesPage() {
  const { firestore, user } = useFirebase();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  const [columns, setColumns] = useState<Columns>({
    todo: { id: 'todo', title: 'A Fazer', notes: [] },
    done: { id: 'done', title: 'Feitas', notes: [] },
  });

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
      const todoNotes = notes.filter((note) => note.status === 'todo');
      const doneNotes = notes.filter((note) => note.status === 'done');
      setColumns({
        todo: { ...columns.todo, notes: todoNotes },
        done: { ...columns.done, notes: doneNotes },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  
  const findContainer = (id: string) => {
    if (id in columns) {
        return id as keyof Columns;
    }
    return Object.keys(columns).find((key) => 
      columns[key as keyof Columns].notes.some((note) => note.id === id)
    ) as keyof Columns | undefined;
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const activeContainer = findContainer(activeId);
    const overContainer = findContainer(overId);

    // Reordering within the same column
    if (activeContainer && overContainer && activeContainer === overContainer && activeId !== overId) {
        const column = columns[activeContainer];
        const oldIndex = column.notes.findIndex((n) => n.id === activeId);
        const newIndex = column.notes.findIndex((n) => n.id === overId);
        
        setColumns((prev) => ({
            ...prev,
            [activeContainer]: {
                ...prev[activeContainer],
                notes: arrayMove(prev[activeContainer].notes, oldIndex, newIndex),
            },
        }));
        return;
    }

    // Moving to a different column
    if (activeContainer && overContainer && activeContainer !== overContainer) {
        setColumns((prev) => {
            const activeItems = prev[activeContainer].notes;
            const overItems = prev[overContainer].notes;
            const activeIndex = activeItems.findIndex((item) => item.id === activeId);
            const overIndex = overItems.findIndex((item) => item.id === overId);
            
            const newIndex = overIndex >= 0 ? overIndex : overItems.length;

            return {
                ...prev,
                [activeContainer]: {
                    ...prev[activeContainer],
                    notes: activeItems.filter((item) => item.id !== activeId),
                },
                [overContainer]: {
                    ...prev[overContainer],
                    notes: [
                        ...overItems.slice(0, newIndex),
                        activeItems[activeIndex],
                        ...overItems.slice(newIndex)
                    ],
                },
            };
        });

         if (user) {
            const noteDocRef = doc(firestore, 'users', user.uid, 'notes', activeId);
            setDocumentNonBlocking(noteDocRef, { status: overContainer }, { merge: true });
         }
    }
  };
  
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor)
    );

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Tarefas" description="Arraste as notas entre as colunas para alterar o status.">
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
        <DndContext sensors={sensors} onDragEnd={onDragEnd} collisionDetection={rectIntersection}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {Object.values(columns).map((column) => (
                <div key={column.id} className="rounded-lg bg-muted/50 p-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                        {column.id === 'todo' ? <ListTodo className="text-yellow-500" /> : <CheckCircle className="text-green-500" />}
                        {column.title} ({column.notes.length})
                    </h2>
                     <SortableContext items={column.notes.map(n => n.id)} strategy={verticalListSortingStrategy}>
                        <div id={column.id} className="space-y-4 min-h-[100px]">
                            {isLoading ? (
                                <Skeleton className="h-20 w-full" />
                            ) : column.notes.length > 0 ? (
                                column.notes.map((note) => (
                                    <SortableNote key={note.id} note={note} onDelete={handleDeleteNote}/>
                                ))
                            ) : (
                                <div className="text-center text-muted-foreground py-4">
                                {column.id === 'todo' ? 'Nenhuma tarefa pendente.' : 'Nenhuma tarefa concluída ainda.'}
                                </div>
                            )}
                        </div>
                    </SortableContext>
                </div>
            ))}
          </div>
        </DndContext>
      </main>
    </div>
  );
}
