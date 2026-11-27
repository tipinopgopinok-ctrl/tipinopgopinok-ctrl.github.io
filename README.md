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

The standalone **DNA Compute Core** page is published at `/dna-compute/`. Its HTML is copied byte-for-byte from the supplied file; it loads Tailwind CSS from its existing CDN reference.

## Community messenger

The responsive messenger interface is available at `/messenger/`. GitHub Discussions has been enabled on this repository; the messenger loads its categories after sign-in. It uses Discussions for public group-chat messages and text-only emoji stickers, with GitHub identity and avatar. It does not use a separate server or store a second password/account database. The login uses GitHub OAuth Device Flow; configure an OAuth App Client ID in the messenger settings (never add a client secret or personal access token to the page). Each participant needs permission to read and comment in the selected discussion category.

The site's static frontend cannot safely upload or persist photos through the supported GitHub Discussions API, so photo posts, image stickers, and photo messages remain unavailable rather than being simulated. The approximate 20-person target is informational and is not enforced. All chat comments are public. GitHub's GraphQL endpoint permits browser CORS; OAuth Device Flow still needs to be tested with the owner's OAuth App Client ID. If GitHub blocks those browser requests, CORS cannot be bypassed without a server-side component (which this project intentionally does not use). A successful Pages deployment and live OAuth configuration must be verified separately; this repository change alone does not publish or activate the service.

## Local preview

Open `index.html` directly in a browser. To test the project links locally, serve the repository root over HTTP so each demo is available under its `/projects/` path.
