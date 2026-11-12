# Synthetic Documents test files

All files are generated for tests and contain no CV or user data. `valid.doc` and
`valid.docx` were converted from `valid.txt`; the PDF contains a single empty
page, and the images contain one synthetic pixel. `truncated.*` are intentionally
incomplete. `active.pdf` has an OpenAction JavaScript entry. `macro.docx` adds a
synthetic `word/vbaProject.bin` member. `bomb.docx` contains a 32 MiB repeated
member in a small compressed archive. `encrypted.docx` is an encrypted ZIP with
a synthetic password, not a genuine encrypted Office document; it tests rejection
of encrypted archives only and does not prove handling of Office encryption.
`bad-crc.docx` has a modified ZIP CRC, while `bad-xml.docx` and `xxe.docx`
contain malformed and external-entity XML respectively.
