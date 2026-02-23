'use server';
/**
 * @fileOverview A Genkit flow for correcting Portuguese text.
 *
 * - correctText - A function that takes a string and returns a corrected version.
 * - CorrectTextInput - The input type for the correctText function.
 * - CorrectTextOutput - The return type for the correctText function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const CorrectTextInputSchema = z.object({
  text: z.string().describe('The text to be corrected.'),
});
export type CorrectTextInput = z.infer<typeof CorrectTextInputSchema>;

const CorrectTextOutputSchema = z.object({
  correctedText: z.string().describe('The corrected version of the text.'),
});
export type CorrectTextOutput = z.infer<typeof CorrectTextOutputSchema>;

export async function correctText(input: CorrectTextInput): Promise<CorrectTextOutput> {
  return correctTextFlow(input);
}

const prompt = ai.definePrompt({
  name: 'correctTextPrompt',
  input: {schema: CorrectTextInputSchema},
  output: {schema: CorrectTextOutputSchema},
  prompt: `Corrija o seguinte texto em Português do Brasil. Corrija a gramática, ortografia e pontuação, mas mantenha o tom e a intenção originais.

Texto original: {{{text}}}

Retorne apenas o texto corrigido no campo 'correctedText'.`,
});

const correctTextFlow = ai.defineFlow(
  {
    name: 'correctTextFlow',
    inputSchema: CorrectTextInputSchema,
    outputSchema: CorrectTextOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
