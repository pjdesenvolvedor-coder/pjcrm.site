'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';


export function CopyButton({ textToCopy }: { textToCopy: string }) {
    const [hasCopied, setHasCopied] = useState(false);
    const { toast } = useToast();

    const handleCopy = () => {
        navigator.clipboard.writeText(textToCopy);
        setHasCopied(true);
        toast({ title: 'Código PIX Copiado!' });
        setTimeout(() => setHasCopied(false), 2000);
    };

    return (
        <div className="relative" onClick={handleCopy} style={{ cursor: 'pointer' }}>
            <Input id="pix-code" readOnly value={textToCopy} className="pr-10 bg-muted cursor-pointer" />
            <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8">
                {hasCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
        </div>
    );
}
