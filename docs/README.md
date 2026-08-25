# Documentation index

- **Requirements** — what the product must do, and why. Start here if you're new to
  the project.
  - [`requirements/product-requirements.md`](./requirements/product-requirements.md) — the
    full functional/business spec: the practice loop, two-kid model, Parent Mode,
    rewards, AI evaluation, session controls, PWA requirements.
  - [`requirements/curriculum-standards.md`](./requirements/curriculum-standards.md) —
    Georgia K-12 / GCPS AKS standard codes and the ELA writing-task progression.
  - [`requirements/security-requirements.md`](./requirements/security-requirements.md) —
    the required security layers and the budget target they have to fit inside.
- **Architecture** — what was actually built, and how it satisfies the
  requirements above.
  - [`architecture/data-model.md`](./architecture/data-model.md) — every table,
    its columns, and how they relate.
  - [`architecture/auth-and-security.md`](./architecture/auth-and-security.md) — the
    request flow, the two-Postgres-role RLS design, session/PIN handling, CSP, IDOR
    protection, rate limiting — with what's been verified end-to-end vs. what's
    asserted from the code.
  - [`architecture/decisions.md`](./architecture/decisions.md) — where the build
    deviates from the original plan's tech choices (Neon vs. Supabase, Next.js vs.
    Vite, etc.) and why.
  - [`architecture/rag-content-pipeline.md`](./architecture/rag-content-pipeline.md) —
    the PDF-to-draft-content pipeline: Drive import, chunking/embedding via
    `pgvector` on Neon, AI generation, and the parent review queue.

- **Setup** — one-time configuration walkthroughs for optional integrations.
  - [`setup/google-drive-picker-and-voyage.md`](./setup/google-drive-picker-and-voyage.md) —
    provisioning the Google Cloud OAuth client/API key and Voyage AI API key
    the PDF import feature (Stage 2 of the RAG pipeline) needs.

For setup instructions, the tech stack summary, and current project status, see the
[repo root README](../README.md).
