import { GoogleGenerativeAI } from "@google/generative-ai";

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not set");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export const chatModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
});

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
  if (!data.embedding) {
    console.error('Embed API response:', JSON.stringify(data))
    throw new Error('Embedding failed: ' + JSON.stringify(data))
  }
  return data.embedding.values;
}
