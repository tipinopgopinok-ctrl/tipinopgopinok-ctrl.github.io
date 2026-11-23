# Nurbek — AI engineering portfolio

A lightweight, self-contained portfolio site for GitHub Pages.

## Publish

The GitHub Actions workflow in `.github/workflows/pages.yml` publishes the repository root whenever a commit is pushed to `main`. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.

The expected site URL is <https://tipinopgopinok-ctrl.github.io/>.

## Product demos

The portfolio links to four standalone, responsive product concepts:

- `/projects/metric-desk/` — business metrics and revenue analytics
- `/projects/ops-board/` — operations board and task workflow
- `/projects/clearpath-docs/` — document register and approvals
- `/projects/fieldnote-ai/` — searchable knowledge-base concept

Each demo runs without a build step or external runtime dependencies. Sample figures, documents, tasks, and knowledge articles are explicitly labeled as fictional demonstration content; the knowledge search is a local prototype without a hosted AI service.

## Local preview

Open `index.html` directly in a browser. To test the project links locally, serve the repository root over HTTP so each demo is available under its `/projects/` path.
