# Third-party notices

## ORCA, by IssueLab Inc. (MIT)

RebarTwin's fix loop (`src/rebartwin/fixes.py`) follows the shape of ORCA's `agent.resolve`, and the BCF writer
(`src/rebartwin/export_bcf.py`) adapts the zip layout and camera of ORCA's `document.bcf_zip`.
Source: https://github.com/IssueLab-Limited/ORCA-hackathon-2026

```
MIT License

Copyright (c) 2026 IssueLab Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Libraries

- pydantic (MIT): the joint model and every result.
- IfcOpenShell (LGPL-3.0), optional: IFC export and the kernel cross-check. Installed separately, not bundled.
