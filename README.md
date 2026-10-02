# World Museum

A React, TypeScript and Vite website for the World Docent educational project.
Supabase provides accounts, shared books, guestbooks and uploaded assets.

## Local development

1. Run `npm ci`.
2. Copy `.env.example` to `.env.local` and add the project's public Supabase connection settings.
3. Run `npm run dev`.

## Deploy on Vercel

Import this repository with the Vite preset. Use `npm run build` and the `dist` output directory.
Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel before deploying.
The `vercel.json` file routes direct floor links and refreshes to the application.

Never add Supabase service-role keys, database passwords, or private account tokens to this repository or Vite variables.
The `supabase` folder contains server SQL and account function source. Publishing the frontend does not reapply these server changes.

Original PDFs and local verification captures are excluded from Git. Public ebook files retain their existing filenames and page dimensions.
