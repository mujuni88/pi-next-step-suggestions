# pi-suggest

[![npm version](https://img.shields.io/npm/v/pi-suggest.svg)](https://www.npmjs.com/package/pi-suggest)

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

- `~/.pi/agent/pi-suggest/config.json`
- `<project>/.pi/pi-suggest/config.json`

Project config overrides global config.

Public defaults use the current active Pi model only. A complete config with every available option looks like this:

```json
{
  "suggestionCount": 3,
  "modelPreference": [
    "current"
  ],
  "timeoutMs": 5000,
  "chips": {
    "enabled": true,
    "hint": "Alt+# insert • Ctrl+Shift+N more"
  },
  "autocomplete": {
    "enabled": true
  },
  "picker": {
    "enabled": true
  },
  "background": {
    "enabled": true
  }
}
```

Fields:

- `suggestionCount`: number of suggestions to show, clamped to `1` through `5`.
- `modelPreference`: ordered model fallback list. Use `"current"`, a full `provider/model-id` string, or a substring such as `"nano"` that matches the first available model id/provider path.
- `timeoutMs`: generation timeout, clamped to `500` through `30000` milliseconds.
- `chips.enabled`: show/hide suggestion chips above the editor.
- `chips.hint`: optional text shown on the far right of the chip row. If omitted, the hint is generated from `suggestionCount`.
- `autocomplete.enabled`: enable/disable Tab autocomplete suggestions.
- `picker.enabled`: enable/disable the `Ctrl+Shift+N` picker.
- `background.enabled`: enable/disable background suggestion generation after assistant responses.

## Install

Public npm package:

```bash
pi install npm:pi-suggest
```

Source package from GitHub:

```bash
pi install git:github.com/mujuni88/pi-suggest
```

## Development

```bash
npm install
npm run check
```
