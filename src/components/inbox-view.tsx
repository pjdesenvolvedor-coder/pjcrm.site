'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Search, Send, Sparkles } from 'lucide-react';
import { mockConversations, mockUsers } from '@/lib/data';
import type { Conversation, Message } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { suggestSmartReplies, SuggestSmartRepliesInput } from '@/ai/flows/suggest-smart-replies';
import { Skeleton } from './ui/skeleton';

export function InboxView() {
  const [conversations, setConversations] = useState<Conversation[]>(mockConversations);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(conversations[0] || null);
  const [message, setMessage] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [selectedConversation?.messages]);

  const handleSelectConversation = async (conversation: Conversation) => {
    setSelectedConversation(conversation);
    setSuggestions([]);
    
    const lastUserMessage = conversation.messages.filter(m => m.sender === 'user').pop();
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

  const handleSendMessage = () => {
    if (message.trim() && selectedConversation) {
      const newMessage: Message = {
        id: `msg-${Date.now()}`,
        sender: 'agent',
        content: message,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        avatarUrl: mockUsers[0].avatarUrl,
      };

      const updatedConversation: Conversation = {
        ...selectedConversation,
        messages: [...selectedConversation.messages, newMessage],
        lastMessage: message,
        timestamp: 'Agora'
      };

      setSelectedConversation(updatedConversation);
      setConversations(
        conversations.map((c) => (c.id === updatedConversation.id ? updatedConversation : c))
      );
      setMessage('');
      setSuggestions([]);
    }
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
          {conversations.map((conv) => (
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
                  <p className="text-xs text-muted-foreground">{conv.timestamp}</p>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-sm text-muted-foreground truncate">{conv.lastMessage}</p>
                  {conv.unreadCount > 0 && (
                    <Badge variant="default" className="w-5 h-5 flex items-center justify-center p-0">{conv.unreadCount}</Badge>
                  )}
                </div>
              </div>
            </button>
          ))}
        </ScrollArea>
      </aside>

      <main className="md:col-span-2 lg:col-span-3 flex flex-col h-full">
        {selectedConversation ? (
          <>
            <header className="flex items-center gap-4 p-4 border-b">
              <Avatar className="h-10 w-10 border">
                <AvatarImage src={selectedConversation.avatarUrl} alt={selectedConversation.customerName} />
                <AvatarFallback>{selectedConversation.customerName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <h2 className="font-semibold text-lg">{selectedConversation.customerName}</h2>
                <p className="text-sm text-muted-foreground">Online</p>
              </div>
            </header>
            <ScrollArea className="flex-1 p-4 md:p-6">
              <div className="space-y-6">
                {selectedConversation.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex items-end gap-3',
                      msg.sender === 'agent' ? 'flex-row-reverse' : 'flex-row'
                    )}
                  >
                    <Avatar className="h-8 w-8 border">
                      <AvatarImage src={msg.avatarUrl} />
                      <AvatarFallback>{msg.sender.charAt(0)}</AvatarFallback>
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
                    <p className="text-xs text-muted-foreground">{msg.timestamp}</p>
                  </div>
                ))}
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
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <p>Selecione uma conversa para começar</p>
          </div>
        )}
      </main>
    </div>
  );
}
