# Astro Starter Kit: Minimal

```
npm create astro@latest -- --template minimal
```

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/withastro/astro/tree/latest/examples/minimal)
[![Open with CodeSandbox](https://assets.codesandbox.io/github/button-edit-lime.svg)](https://codesandbox.io/p/sandbox/github/withastro/astro/tree/latest/examples/minimal)
[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/withastro/astro?devcontainer_path=.devcontainer/minimal/devcontainer.json)

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                | Action                                           |
| :--------------------- | :----------------------------------------------- |
| `npm install`          | Installs dependencies                            |
| `npm run dev`          | Starts local dev server at `localhost:3000`      |
| `npm run build`        | Build your production site to `./dist/`          |
| `npm run preview`      | Preview your build locally, before deploying     |
| `npm run astro ...`    | Run CLI commands like `astro add`, `astro check` |
| `npm run astro --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).

## 🖼️ Image Generation

This project supports multiple image generation providers:

| Provider | Description | Setup |
| :------- | :---------- | :---- |
| `local` | Local Stable Diffusion API (default) | Requires a running Stable Diffusion API server at http://127.0.0.1:7860 |
| `replicate` | Cloud-based image generation using Replicate | Requires `REPLICATE_API_TOKEN` in your `.env` file |

To switch between providers, set the `IMAGE_PROVIDER` environment variable in your `.env` file:

```sh
# Use 'local' for local Stable Diffusion API or 'replicate' for Replicate API
IMAGE_PROVIDER='local'

# Configure which Replicate model to use (default is google/imagen-3)
REPLICATE_MODEL='black-forest-labs/flux-schnell'

# Optional: Enable fallback to local Stable Diffusion if Replicate fails
FALLBACK_TO_LOCAL='true'
```

When using Replicate, you can configure different models by setting the `REPLICATE_MODEL` environment variable. The default model is `google/imagen-3`, but you can use any model available on Replicate.

The fallback mechanism allows you to automatically attempt image generation with the local Stable Diffusion API if Replicate fails. This is useful for ensuring your image generation pipeline remains functional even when the external API is unavailable.

## 🤖 LLM Integration

This project supports multiple LLM providers for the paper rewriting functionality:

| Provider | Description | Setup |
| :------- | :---------- | :---- |
| `ollama` | Local LLM using Ollama (default) | No API key needed, just ensure Ollama is running locally |
| `groq` | Cloud-based LLM using Groq | Requires `GROQ_API_KEY` in your `.env` file |

To switch between providers, set the `LLM_PROVIDER` environment variable in your `.env` file:

```sh
# Use 'ollama' for local LLM or 'groq' for Groq API
LLM_PROVIDER='ollama'
```
