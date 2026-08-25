import { z } from "zod";

const trimmedText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const wordContentSchema = z
  .object({
    learningText: trimmedText(300),
    meanings: z.array(trimmedText(600)).min(1).max(8),
    comment: z.string().trim().max(12_000).default(""),
  })
  .superRefine((value, context) => {
    const normalized = value.meanings.map((meaning) =>
      meaning.normalize("NFKC").toLocaleLowerCase(),
    );
    if (new Set(normalized).size !== normalized.length) {
      context.addIssue({
        code: "custom",
        path: ["meanings"],
        message: "Meanings must be unique",
      });
    }
  });

export const updateWordSchema = wordContentSchema.and(
  z.object({ version: z.number().int().positive() }),
);

export const showWordSchema = z.object({
  direction: z.enum(["learning-to-known", "known-to-learning"]),
});

export const answerWordSchema = z.object({
  correct: z.boolean(),
  mode: z.enum(["scheduled", "free"]),
  operationId: z.uuid(),
});

export const statisticsQuerySchema = z.object({
  timeZone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Time zone must be a valid IANA identifier"),
});

export const settingsSchema = z
  .object({
    learningLanguage: z.string().trim().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
    knownLanguage: z.string().trim().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/),
    theme: z.enum(["system", "light", "dark"]),
  })
  .refine((value) => value.learningLanguage !== value.knownLanguage, {
    message: "Learning and known languages must be different",
  });
