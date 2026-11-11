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
- Monaco editor with PPL highlighting, completion, hover, signature help, outline, lint and a formatter;
  Python support for app modules.
- Files stored in a local folder (File System Access API) or in browser storage, with tabs and autosave.
- Send the open program, note or app to the calculator, with an overwrite check and read-back verification.
- List the apps, programs and notes on the calculator, open them in the editor, or delete them.
- Apps: edit an app's program, Info note and files (e.g. Python modules), set its icon, create new apps.
- Exam-mode configurations (optional): edit the timeout, angle, memory and LED options, CAS, and
  copy a password from another configuration.
- Screen view with live mirroring, chat with the calculator, clock sync, and backup to a .zip.
- Packet console for debugging the link.

Targets the HP Prime G2; G1 support is untested. See `AGENTS.md` for status, `docs/PROTOCOL.md` for the USB protocol and `docs/formats/` for the object formats.

## Development
```
npm install
npm run dev     # http://localhost:5173
npm test
npm run build
```

Protocol references are listed in `THIRD_PARTY.md`.

## License
MIT. See `LICENSE`.
