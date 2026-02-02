// src/ai/flows/suggest-smart-replies.ts
'use server';
/**
 * @fileOverview This file defines a Genkit flow for suggesting smart replies to incoming WhatsApp messages.
 *
 * - suggestSmartReplies - A function that takes an incoming message and returns suggested replies.
 * - SuggestSmartRepliesInput - The input type for the suggestSmartReplies function.
 * - SuggestSmartRepliesOutput - The return type for the suggestSmartReplies function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestSmartRepliesInputSchema = z.object({
  message: z.string().describe('The incoming WhatsApp message from the customer.'),
});
export type SuggestSmartRepliesInput = z.infer<typeof SuggestSmartRepliesInputSchema>;

const SuggestSmartRepliesOutputSchema = z.object({
  suggestions: z.array(z.string()).describe('An array of suggested reply strings.'),
});
export type SuggestSmartRepliesOutput = z.infer<typeof SuggestSmartRepliesOutputSchema>;

export async function suggestSmartReplies(input: SuggestSmartRepliesInput): Promise<SuggestSmartRepliesOutput> {
  return suggestSmartRepliesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestSmartRepliesPrompt',
  input: {schema: SuggestSmartRepliesInputSchema},
  output: {schema: SuggestSmartRepliesOutputSchema},
  prompt: `You are a helpful AI assistant providing smart reply suggestions for a customer service agent.

  Given the following incoming WhatsApp message, suggest three concise and relevant replies that the agent can quickly use.

  Message: {{{message}}}

  Format your response as a JSON array of strings.
  `,
});

const suggestSmartRepliesFlow = ai.defineFlow(
  {
    name: 'suggestSmartRepliesFlow',
    inputSchema: SuggestSmartRepliesInputSchema,
    outputSchema: SuggestSmartRepliesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
