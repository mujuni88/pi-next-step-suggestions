# pi-next-step-suggestions

A Pi package that offers LLM-generated next-step suggestions after the assistant responds.

## Behavior

- No suggestions in a fresh empty session.
- Suggestions become available after a user prompt receives a completed assistant response.
- Suggestions are generated in the background and shown as compact chips above the editor.
- Use `Alt+1` through `Alt+5` to insert a visible chip suggestion.
- Press Tab in an empty editor after a response to see the same suggestions through autocomplete.
- Press `Ctrl+Shift+N` to open the explicit suggestions picker.
- Selecting a suggestion inserts it into the editor only. It never auto-submits.

## Install

```bash
pi install git:github.com/mujuni88/pi-next-step-suggestions
```

## Development

```bash
npm install
npm run check
```
