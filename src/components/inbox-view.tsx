'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Search, Send, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { suggestSmartReplies, SuggestSmartRepliesInput } from '@/ai/flows/suggest-smart-replies';
import { Skeleton } from './ui/skeleton';
import { useCollection, useFirebase, useUser, useMemoFirebase } from '@/firebase';
import { addDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { collection, query, orderBy, serverTimestamp, Timestamp } from 'firebase/firestore';
import type { Conversation, Message } from '@/lib/types';


export function InboxView() {
  const { firestore } = useFirebase();
  const { user } = useUser();

  const conversationsQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'conversations'), orderBy('timestamp', 'desc'));
  }, [firestore, user]);

  const { data: conversations, isLoading: isLoadingConversations } = useCollection<Conversation>(conversationsQuery);

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  useEffect(() => {
    if (!selectedConversation && conversations && conversations.length > 0) {
      setSelectedConversation(conversations[0]);
    } else if (selectedConversation) {
      // update selected conversation with latest data
      const updatedConv = conversations?.find(c => c.id === selectedConversation.id);
      if (updatedConv) {
        setSelectedConversation(updatedConv);
      }
    }
  }, [conversations, selectedConversation]);

  const handleSelectConversation = async (conversation: Conversation) => {
    setSelectedConversation(conversation);
  };

  return (
    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 border-t h-[calc(100vh-4rem-1px)]">
      <aside className="md:col-span-1 lg:col-span-1 border-r flex flex-col h-full">
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Pesquisar conversas..." className="pl-9" />
          </div>
        </div>
        <ScrollArea className="flex-1">
          {isLoadingConversations ? (
            <div className="p-4 space-y-4">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            conversations?.map((conv) => (
            <button
              key={conv.id}
              onClick={() => handleSelectConversation(conv)}
              className={cn(
                'flex w-full text-left items-start gap-4 p-4 transition-colors hover:bg-muted/50',
                selectedConversation?.id === conv.id && 'bg-muted'
              )}
            >
              <Avatar className="h-10 w-10 border">
                <AvatarImage src={conv.avatarUrl} alt={conv.customerName} />
                <AvatarFallback>{conv.customerName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 overflow-hidden">
                <div className="flex items-baseline justify-between">
                  <p className="font-semibold truncate">{conv.customerName}</p>
                  <p className="text-xs text-muted-foreground">
                    {conv.timestamp ? (new Date(conv.timestamp.seconds * 1000)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </p>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-sm text-muted-foreground truncate">{conv.lastMessage}</p>
                  {conv.unreadCount > 0 && (
                    <Badge variant="default" className="w-5 h-5 flex items-center justify-center p-0">{conv.unreadCount}</Badge>
                  )}
                </div>
              </div>
            </button>
          )))}
        </ScrollArea>
      </aside>

      <main className="md:col-span-2 lg:col-span-3 flex flex-col h-full">
        {selectedConversation ? (
          <ConversationPanel conversation={selectedConversation} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <p>Selecione uma conversa para começar</p>
          </div>
        )}
      </main>
    </div>
  );
}


function ConversationPanel({ conversation }: { conversation: Conversation }) {
  const { firestore } = useFirebase();
  const { user } = useUser();
  const [message, setMessage] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  const messagesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, 'users', user.uid, 'conversations', conversation.id, 'messages'), orderBy('timestamp', 'asc'));
  }, [firestore, user, conversation.id]);

  const { data: messages, isLoading: isLoadingMessages } = useCollection<Message>(messagesQuery);

  const scrollToBottom = () => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!messages || messages.length === 0) return;
      const lastUserMessage = [...messages].reverse().find(m => m.sender === 'user');
      if (lastUserMessage) {
        setIsLoadingSuggestions(true);
        try {
          const input: SuggestSmartRepliesInput = { message: lastUserMessage.content };
          const result = await suggestSmartReplies(input);
          setSuggestions(result.suggestions);
        } catch (error) {
          console.error("Error fetching smart replies:", error);
          setSuggestions([]);
        } finally {
          setIsLoadingSuggestions(false);
        }
      }
    };
    fetchSuggestions();
  }, [messages]);


  const handleSendMessage = () => {
    if (message.trim() && user) {
      const messagesCol = collection(firestore, 'users', user.uid, 'conversations', conversation.id, 'messages');
      addDocumentNonBlocking(messagesCol, {
        sender: 'agent',
        content: message,
        timestamp: serverTimestamp(),
        avatarUrl: 'https://picsum.photos/seed/agent/40/40', // Replace with actual agent avatar
      });
      setMessage('');
      setSuggestions([]);
    }
  };

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return '';
    if (timestamp instanceof Timestamp) {
      return timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (timestamp.seconds) {
        return new Date(timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return 'agora';
  }

  return (
    <>
      <header className="flex items-center gap-4 p-4 border-b">
        <Avatar className="h-10 w-10 border">
          <AvatarImage src={conversation.avatarUrl} alt={conversation.customerName} />
          <AvatarFallback>{conversation.customerName.charAt(0)}</AvatarFallback>
        </Avatar>
        <div>
          <h2 className="font-semibold text-lg">{conversation.customerName}</h2>
          <p className="text-sm text-muted-foreground">Online</p>
        </div>
      </header>
      <ScrollArea className="flex-1 p-4 md:p-6">
        <div className="space-y-6">
          {isLoadingMessages ? (
             <div className="flex justify-center items-center h-full">Carregando mensagens...</div>
          ) : (
            messages?.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex items-end gap-3',
                  msg.sender === 'agent' ? 'flex-row-reverse' : 'flex-row'
                )}
              >
                <Avatar className="h-8 w-8 border">
                  <AvatarImage src={msg.avatarUrl} />
                  <AvatarFallback>{msg.sender.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    'max-w-xs lg:max-w-md rounded-xl p-3',
                    msg.sender === 'agent'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  <p className="text-sm">{msg.content}</p>
                </div>
                <p className="text-xs text-muted-foreground">{formatTimestamp(msg.timestamp)}</p>
              </div>
            ))
          )}
          <div ref={endOfMessagesRef} />
        </div>
      </ScrollArea>
      <footer className="p-4 border-t bg-background">
        {(isLoadingSuggestions || suggestions.length > 0) && (
          <div className="mb-3">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2 text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              Sugestões de Resposta
            </h4>
            {isLoadingSuggestions ? (
              <div className="flex gap-2">
                  <Skeleton className="h-8 w-1/3" />
                  <Skeleton className="h-8 w-1/3" />
                  <Skeleton className="h-8 w-1/3" />
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={() => setMessage(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="relative">
          <Textarea
            placeholder="Digite sua mensagem..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            className="pr-20"
          />
          <Button
            size="icon"
            className="absolute right-3 top-1/2 -translate-y-1/2"
            onClick={handleSendMessage}
            disabled={!message.trim()}
          >
            <Send className="h-5 w-5" />
            <span className="sr-only">Enviar</span>
          </Button>
        </div>
      </footer>
    </>
  );
}

    