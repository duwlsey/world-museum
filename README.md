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

## Fast book reading

The three bundled 3F books use versioned WebP pages under `public/book-pages`. Only the current pages and nearby spreads are prepared; original PDFs remain available for download. Other uploaded PDFs use the PDF reader as a fallback. The PDF engine is loaded only when required.

When replacing a bundled PDF, run `python scripts/prepare-book-pages.py` from the project root with Poppler (`pdftoppm`) and Pillow installed. Commit both the generated images and `src/bookAssets.json`. The generated directory name contains the PDF content hash, so published page images cannot be confused with an older version.

4F books render saved story content directly and share the same layout renderer with PDF downloads. PDF creation runs only on download. Both readers prepare the next two spreads and the previous spread, adapt canvas size to the screen, and keep a bounded page cache.

Run `npm test` to check page ordering, covers, shared rendering, cache eviction, retry behavior, and all bundled page assets. Also verify opening, forward/backward navigation, guestbooks, and downloads in the browser before deploying reader changes.
