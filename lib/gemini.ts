import Groq from "groq-sdk";

if (!process.env.GROQ_API_KEY) {
  throw new Error("GROQ_API_KEY is not set");
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export const chatModel = groq;

export async function embedText(text: string): Promise<number[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { parts: [{ text }] } }),
    },
  );
  const data = await response.json();
  if (!data.embedding)
    throw new Error("Embedding failed: " + JSON.stringify(data));
  return data.embedding.values;
}
