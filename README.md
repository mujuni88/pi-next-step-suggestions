# pi-next-step-suggestions

A Pi package that offers LLM-generated next-step suggestions after the assistant responds.

## Behavior

- No suggestions in a fresh empty session.
- Suggestions become available after a user prompt receives a completed assistant response.
- Suggestions are generated in the background and shown as compact chips above the editor.
- Shows 3 suggestions by default.
- Use `Alt+1` through `Alt+3` to insert a visible chip suggestion by default.
- Press Tab in an empty editor after a response to see the same suggestions through autocomplete.
- Press `Ctrl+Shift+N` to open the explicit suggestions picker.
- Selecting a suggestion inserts it into the editor only. It never auto-submits.

## Configuration

Optional config files are loaded from:

- `~/.pi/agent/next-step-suggestions.json`
- `<project>/.pi/next-step-suggestions.json`

Project config overrides global config.

Public defaults use the current active Pi model only:

```json
{
  "suggestionCount": 3,
  "modelPreference": ["current"],
  "timeoutMs": 5000,
  "chips": { "enabled": true },
  "autocomplete": { "enabled": true },
  "picker": { "enabled": true },
  "background": { "enabled": true }
}
```

`modelPreference` accepts either `"current"`, a full `provider/model-id` string, or a substring such as `"nano"` that matches the first available model id/provider path.

## Install

```bash
pi install git:github.com/mujuni88/pi-next-step-suggestions
```

## Development

```bash
npm install
npm run check
```
