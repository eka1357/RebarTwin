"""The reader: drawing PDF in, `Joint` JSON out, with provenance for every value and a To check list for the rest.

Two channels read each page: Gemini (image plus text layer) and a grammar over the PDF's text layer. A value is
accepted only when both give the same normalised value at the same place on the page; everything else goes to a
person. See ARCHITECTURE.md, Reader.
"""
