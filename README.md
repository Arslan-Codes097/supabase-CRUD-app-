# Supabase Full-Stack CRUD & File Management App

A production-ready file management application demonstrating robust file storage, Edge Function validation, metadata tracking, and relational data CRUD using a single **Supabase backend**. 

This project features a **Dual-Client Architecture**:
1. **Python Admin CLI:** A terminal-based admin application.
2. **Next.js Web UI:** A modern, dark-themed React web application with user segregation.

---

## 🌟 Architecture Overview

Both clients communicate with the exact same Supabase backend.

- **Storage Bucket (`user-files`)**: Stores the actual binary files.
- **Postgres Table (`file_metadata`)**: Stores file metadata (filename, size, content type, storage path, owner).
- **Edge Function (`validate-file`)**: A Deno serverless function that intercepts uploads and strictly enforces validation rules (max 10MB, permitted MIME types). If validation fails, it aggressively deletes the file from storage and the database.

---

## 🚀 Features

- **File CRUD Operations:** Create, Read, Update, Delete functionality across both CLI and Web.
- **Server-Side Validation:** Edge Function ensures no malicious or oversized files are kept.
- **User Segregation:** Next.js frontend isolates files by `owner` username without complex Auth setup.
- **Modern UI:** Next.js 14 App Router, Tailwind CSS, Lucide Icons, Dark Mode glassmorphism design.

---

## 💻 Tech Stack

- **Backend:** Supabase (Postgres, Storage, Edge Functions)
- **Frontend:** Next.js, React, Tailwind CSS
- **CLI:** Python, `supabase-py`

---

## 🛠 Setup Instructions

### 1. Supabase Project Setup
1. Create a project at [Supabase](https://app.supabase.com).
2. Run this SQL in the SQL Editor to create the table and disable RLS for the demo:
   ```sql
   create table public.file_metadata (
       id uuid default gen_random_uuid() primary key,
       filename text not null,
       size bigint not null,
       content_type text,
       storage_path text not null,
       owner text,
       created_at timestamp with time zone default timezone('utc'::text, now()) not null
   );

   alter table public.file_metadata disable row level security;

   create policy "Public Storage Access"
   on storage.objects for all
   to public
   using ( bucket_id = 'user-files' )
   with check ( bucket_id = 'user-files' );
   ```
3. Create a public storage bucket named `user-files`.

### 2. Edge Function Deployment
To deploy the Deno Edge Function:
1. Install Supabase CLI: `npm install -g supabase`
2. Log in: `supabase login`
3. Link your project: `supabase link --project-ref <your-project-ref>`
4. Deploy: `supabase functions deploy validate-file`

### 3. Python CLI
1. Navigate to the `cli/` folder.
2. Create a `.env` file with `SUPABASE_URL` and `SUPABASE_KEY` (use the secret/service_role key).
3. Install dependencies: `pip install -r requirements.txt`
4. Run commands: 
   - `python app.py list`
   - `python app.py create <filepath>`
   - `python app.py update <id> <filepath>`
   - `python app.py download <id> <destination>`
   - `python app.py delete <id>`

### 4. Next.js Web UI
1. Navigate to the `web/` folder.
2. Create a `.env.local` file with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (use the publishable/anon key).
3. Install dependencies: `npm install`
4. Run development server: `npm run dev`
5. Open `http://localhost:3000`

---

## 🌐 Deploying to Vercel

1. Push this repository to GitHub.
2. Go to [Vercel](https://vercel.com) and import the repository.
3. Make sure the "Framework Preset" is set to Next.js, and the "Root Directory" is set to `web`.
4. Under Environment Variables, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Click **Deploy**.
