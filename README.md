# HP Prime Web IDE

Write HP Prime PPL programs in the browser and send them to (or read them from) a real
HP Prime calculator over USB, using WebHID.

**Live:** https://apie357.github.io/hp-prime-web/

## Requirements
- Desktop Chrome, Edge, or another Chromium browser (WebHID).
- Linux: allow access to the calculator's HID device, then replug it:
  ```
  sudo cp udev/60-hp-prime.rules /etc/udev/rules.d/
  sudo udevadm control --reload && sudo udevadm trigger
  ```

## Features
- Monaco editor with PPL syntax highlighting.
- Programs stored in a local folder (File System Access API) or in browser storage.
- Send the open program to the calculator, with an overwrite check and read-back verification.
- List programs on the calculator, fetch one by name, and open it in the editor.
- Packet console for debugging the link.

Targets the HP Prime G2; G1 support is untested. See `AGENTS.md` for protocol notes and status.

## Development
```
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```

Protocol references are listed in `THIRD_PARTY.md`.
