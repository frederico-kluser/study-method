# Third-party notice — on-device Text-to-Speech (GPLv3 components)

> This notice ships **inside the Ondokai installer** (alongside the components it
> describes) to satisfy the GPLv3 distribution obligations for the on-device TTS
> engine. It is an engineering compliance artifact, **not** a legal opinion. The
> final "combined work vs. aggregation" determination is **TODO(CD-02)** — human
> legal review.

## Summary

Ondokai is proprietary software. Its on-device **Text-to-Speech (TTS)** feature is
provided by a **separate program** that Ondokai runs at arm's length (it is invoked
as a child process via the command line; Ondokai links **no** code from it). That
separate program, and the phoneme data it reads, are licensed under the **GNU
General Public License, version 3 (GPLv3)**. They are **separate, replaceable
components** — not part of Ondokai's proprietary code. The full text of the GPLv3 is
in **`GPL-3.0.txt`** in this same directory.

## The GPLv3 components shipped

1. **The TTS engine executable** — `sherpa-onnx-offline-tts`
   (under `resources/tts-engine/<platform>-<arch>/`).
   - It is built from **sherpa-onnx v1.13.3** (Apache-2.0):
     <https://github.com/k2-fsa/sherpa-onnx> · release
     <https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.13.3>
   - It **statically links espeak-ng** (GPLv3) and `piper_phonemize`.
   - As a **combined binary**, the executable as distributed is covered by the
     **GPLv3**. (sherpa-onnx itself is Apache-2.0; the GPLv3 obligation comes from
     the embedded espeak-ng.)

2. **The espeak-ng phoneme data** — `resources/espeak-ng-data/`
   (read by the engine via its `--vits-data-dir` argument). This is part of
   **espeak-ng** and is **GPLv3**.

> The Piper voice models under `resources/tts-models/` are **MIT** (rhasspy/
> piper-voices, packaged via sherpa-onnx) — they are *not* GPL and are listed here
> only for completeness.

## Corresponding source (written offer)

The complete corresponding source for the GPLv3 components above is available at:

- **sherpa-onnx** (the engine), v1.13.3:
  <https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.13.3>
- **espeak-ng** (the GPLv3 part embedded in the engine, and the source of the
  phoneme data), pinned by sherpa-onnx v1.13.3 at commit
  **`f6fed6c58b5e0998b8e68c6610125e2d07d595a7`**:
  - archive: <https://github.com/csukuangfj/espeak-ng/archive/f6fed6c58b5e0998b8e68c6610125e2d07d595a7.zip>
    (SHA-256 `70cbf4050e7a014aae19140b05e57249da4720f56128459fbe3a93beaf971ae6`)
  - this is a fork of upstream **espeak-ng**: <https://github.com/espeak-ng/espeak-ng>

These URLs are the exact versions used to produce the shipped binary/data. If any
link becomes unavailable, the corresponding source is also offered on request to
the contact in Ondokai's "About → Licenses" screen, for at least three years.

## Your right to replace these components (substitutability)

The GPLv3 components are **plain, un-obfuscated files** in the installed app's
resources, so you can study, modify, and **replace** them:

- **TTS engine:** replace the executable at
  `resources/tts-engine/<platform>-<arch>/bin/sherpa-onnx-offline-tts`
  (`sherpa-onnx-offline-tts.exe` on Windows) with your own build of sherpa-onnx's
  offline-tts CLI. Ondokai invokes it with `--vits-model`, `--vits-tokens`,
  `--vits-data-dir`, `--sid`, `--vits-length-scale`, `--num-threads` and
  `--output-filename` (plus the text), and reads back the WAV — any binary honoring
  that command-line interface works. (For development you may also point Ondokai at
  an external build via the `ONDOKAI_TTS_ENGINE_BIN` environment variable.)
- **Phoneme data:** replace the contents of `resources/espeak-ng-data/`.

Ondokai does **not** impose technical measures that prevent this replacement.

## Where to find the application's resources

- macOS: `Ondokai.app/Contents/Resources/`
- Windows: the app's install dir, `resources/`
- Linux (AppImage): mount/extract the AppImage; `resources/`

---

TODO(CD-02): legal review of (a) whether the process-isolation boundary qualifies
as "mere aggregation" in the target jurisdictions, and (b) the precise wording of
this written offer and the EULA cross-reference. See `docs/ondokai-legal-licensing-brief.md`.
