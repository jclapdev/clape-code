# Testing Control Center on Windows

The Windows executable has been built but never run. These steps check that it works. They take about ten minutes on a Windows 10 or 11 PC that has Claude Code installed and signed in.

## 1. Get the executable onto the PC

On the Mac, build it if `dist/` doesn't have it yet:

```shell
bun run compile windows-x64
```

Copy `dist/control-center-windows-x64.exe` to the Windows PC, for example with a USB stick or a shared folder.

## 2. Start it

Double-click `control-center-windows-x64.exe`.

- If Windows SmartScreen says "Windows protected your PC", choose **More info**, then **Run anyway**. The file isn't signed, so Windows warns about it.
- A console window opens with `Control Center is running at http://127.0.0.1:4317`, and your browser opens that address.

If the browser doesn't open, type `http://127.0.0.1:4317` into it yourself.

## 3. Check each of these

| Check | What you should see |
|---|---|
| Home loads | "Home" with today's date, and any background jobs. |
| Projects | Your projects listed. Folders where you've run Claude Code appear under "Other folders with Claude sessions". |
| Sessions | Your past sessions listed. Opening one shows the conversation. |
| Paths | Paths shown as `~/…` or `C:\…`, never broken or empty. |
| Saving a file | In Library, open any command or create a test one with **New**, change a word, then press **Save**. A "Saved" message appears. The previous version is in `%APPDATA%\control-center\backups`. |
| Live session | In **Live**, choose **New session**, pick a project, model **Haiku**, and send `Run one command: echo hi > hi.txt`. Approve the command when asked. `hi.txt` appears in that project folder. |
| Dark mode | The moon button at the bottom of the menu switches to dark. |

## 4. Tell me what happened

For anything that didn't work, note which check failed and what you saw instead. A screenshot helps, and so does the text in the console window. Then delete any test command you created, and `hi.txt`.

## If a live session says it can't find Claude Code

The app looks for `claude` on your PATH and in `%USERPROFILE%\.local\bin`. Open a new Command Prompt and run `where claude`. If that prints a path outside those places, include it in your note.
