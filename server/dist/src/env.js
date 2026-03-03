import dotenv from "dotenv";
import { z } from "zod";
dotenv.config();
const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.string().default("8080"),
    DATABASE_URL: z.string().min(1),
    SESSION_SECRET: z.string().min(12),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_CALLBACK_URL: z.string().min(1),
    CLIENT_URL: z.string().default("http://localhost:5173")
});
export const env = envSchema.parse(process.env);
