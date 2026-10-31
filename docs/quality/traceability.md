# Requirements Traceability — FR → AC → UC/TC

**Stan:** `BASELINED` (powiązania planistyczne). Macierz służy do szybkiego doboru kontekstu dla agenta. **Każde AC jest kryterium na papierze, a TC oznacza jedynie plan testu, nie potwierdzony wynik.**

- **FR/AC** — zatwierdzone zachowanie i jego weryfikacja.
- **UC/TC** — reprezentatywne scenariusze i odpowiadające im planowane testy.
- **AC only** — wymaganie posiada AC, ale obecnie nie ma dedykowanego powiązania z E2E; przed implementacją należy dobrać poziom unit/integration/E2E.
- **Bramka** — istniejące `OPEN`, których rozwiązanie może zmienić szczegóły implementacji.

| Wymaganie | Podstawa `DEC/BR` | Kryterium akceptacji | Scenariusze / planowane testy | Bramka szczegółów | Pokrycie formalne |
|---|---|---|---|---|---|
| FR-LC-001 | DEC-001/DEC-002 BR-001 DEC-052 | AC-LC-001 AC-LC-001-01 AC-LC-001-02 | UC-001/TC-001 UC-003/TC-003 UC-004/TC-004 | OPEN-002 | AC + UC/TC planned |
| FR-LC-002 | DEC-002 BR-001 | AC-LC-002 | UC-003/TC-003 UC-004/TC-004 UC-008/TC-008 | OPEN-002 | AC + UC/TC planned |
| FR-LC-003 | DEC-003 BR-002 | AC-LC-003 | UC-006/TC-006 UC-014/TC-014 | OPEN-024 | AC + UC/TC planned |
| FR-LC-004 | DEC-004/DEC-005 BR-003 DEC-052 | AC-LC-004 AC-LC-004-01 | UC-001/TC-001 | OPEN-020 | AC + UC/TC planned |
| FR-LC-005 | DEC-006/DEC-009 BR-004 | AC-LC-005 | UC-002/TC-002 UC-003/TC-003 | OPEN-002 | AC + UC/TC planned |
| FR-LC-006 | DEC-002/DEC-009 BR-001/BR-018 | AC-LC-006 | UC-004/TC-004 UC-008/TC-008 | OPEN-002 | AC + UC/TC planned |
| FR-LC-007 | DEC-006 BR-004/BR-005 | AC-LC-007 | UC-005/TC-005 | OPEN-018 | AC + UC/TC planned |
| FR-LC-008 | DEC-007 BR-006 | AC-LC-008 | UC-005/TC-005 UC-009/TC-009 | OPEN-034 | AC + UC/TC planned |
| FR-LC-009 | DEC-008 BR-006 | AC-LC-009 | UC-009/TC-009 | OPEN-027 | AC + UC/TC planned |
| FR-LC-010 | DEC-008 BR-006 | AC-LC-010 | UC-009/TC-009 | OPEN-003/OPEN-027 | AC + UC/TC planned |
| FR-LC-011 | DEC-008 BR-006 | AC-LC-011 | UC-009/TC-009 | OPEN-003 | AC + UC/TC planned |
| FR-LC-012 | DEC-008 BR-006 | AC-LC-012 | UC-009/TC-009 | OPEN-027/OPEN-034 | AC + UC/TC planned |
| FR-LC-013 | DEC-008/DEC-022 BR-006/BR-015 | AC-LC-013 | UC-009/TC-009 | OPEN-004 | AC + UC/TC planned |
| FR-LC-014 | DEC-009 BR-007 | AC-LC-014 | UC-002/TC-002 UC-005/TC-005 UC-021/TC-021 | OPEN-018/OPEN-020 | AC + UC/TC planned |
| FR-LC-015 | DEC-009/DEC-022 BR-007/BR-016 | AC-LC-015 AC-LC-015-01 | UC-021/TC-021 | OPEN-004/OPEN-020 | AC + UC/TC planned |
| FR-LC-016 | DEC-010 BR-008 | AC-LC-016 AC-LC-016-01 AC-LC-016-02 | UC-012/TC-012 | OPEN-001/OPEN-002 | AC + UC/TC planned |
| FR-LC-017 | DEC-010/DEC-012 BR-010 | AC-LC-017 AC-LC-017-01 | UC-012/TC-012 UC-013/TC-013 | OPEN-004 | AC + UC/TC planned |
| FR-LC-018 | DEC-013 BR-011 | AC-LC-018 AC-LC-018-01 AC-LC-018-02 | UC-012/TC-012 | OPEN-029 | AC + UC/TC planned |
| FR-LC-019 | DEC-012 BR-010 | AC-LC-019 AC-LC-019-01 AC-LC-019-02 | UC-013/TC-013 | OPEN-019/OPEN-020 | AC + UC/TC planned |
| FR-LC-020 | DEC-011/DEC-028 BR-009 | AC-LC-020 | UC-032/TC-032 | OPEN-008 | AC + UC/TC planned |
| FR-LC-021 | DEC-010/DEC-012 BR-012 | AC-LC-021 | UC-013/TC-013 UC-020/TC-020 | OPEN-005/OPEN-038 | AC + UC/TC planned |
| FR-LC-022 | DEC-012 BR-002/BR-010 | AC-LC-022 | UC-014/TC-014 | OPEN-019/OPEN-024 | AC + UC/TC planned |
| FR-LC-023 | DEC-014 BR-013 | AC-LC-023 | UC-007/TC-007 | OPEN-025/OPEN-026 | AC + UC/TC planned |
| FR-LC-024 | DEC-015 BR-014 | AC-LC-024 | UC-002/TC-002 UC-007/TC-007 | OPEN-002/OPEN-026 | AC + UC/TC planned |
| FR-LC-025 | DEC-015 BR-014 | AC-LC-025 | UC-007/TC-007 UC-020/TC-020 | OPEN-013/OPEN-025 | AC + UC/TC planned |
| FR-RW-001 | DEC-019 | AC-RW-001 | UC-027/TC-027 | OPEN-017 | AC + UC/TC planned |
| FR-RW-002 | DEC-019 BR-003 | AC-RW-002 | UC-027/TC-027 | OPEN-028 | AC + UC/TC planned |
| FR-RW-003 | DEC-019 | AC-RW-003 | UC-027/TC-027 | OPEN-017 | AC + UC/TC planned |
| FR-RW-004 | DEC-019 BR-006 | AC-RW-004 | UC-027/TC-027 | OPEN-034 | AC + UC/TC planned |
| FR-RW-005 | DEC-019 | AC-RW-005 | UC-006/TC-006 UC-027/TC-027 | OPEN-017 | AC + UC/TC planned |
| FR-RW-006 | DEC-019 | AC-RW-006 | UC-027/TC-027 | OPEN-028 | AC + UC/TC planned |
| FR-RW-007 | DEC-049 | AC-RW-007 | UC-027/TC-027 | OPEN-028 | AC + UC/TC planned |
| FR-RW-008 | DEC-009/DEC-019 BR-005/BR-007/BR-008/BR-011 | AC-RW-008 | UC-005/TC-005 UC-012/TC-012 UC-021/TC-021 | OPEN-018/OPEN-028/OPEN-029 | AC + UC/TC planned |
| FR-RW-009 | DEC-020 | AC-RW-009 | UC-027/TC-027 | OPEN-017 | AC + UC/TC planned |
| FR-RW-010 | DEC-020 BR-015 | AC-RW-010 | UC-027/TC-027 | OPEN-017 | AC + UC/TC planned |
| FR-RW-011 | DEC-020 | AC-RW-011 | UC-007/TC-007 UC-027/TC-027 | OPEN-002/OPEN-017 | AC + UC/TC planned |
| FR-DB-001 | DEC-016/DEC-018 | AC-DB-001 | UC-024/TC-024 UC-033/TC-033 | OPEN-013 | AC + UC/TC planned |
| FR-DB-002 | DEC-016/DEC-026 | AC-DB-002 | UC-024/TC-024 UC-030/TC-030 | OPEN-040 | AC + UC/TC planned |
| FR-DB-003 | DEC-016/DEC-023 | AC-DB-003 | UC-010/TC-010 UC-011/TC-011 UC-024/TC-024 | OPEN-021/OPEN-037 | AC + UC/TC planned |
| FR-DB-004 | DEC-016/DEC-028 BR-020 | AC-DB-004 | UC-023/TC-023 UC-024/TC-024 | OPEN-008 | AC + UC/TC planned |
| FR-DB-005 | DEC-016/DEC-022 BR-016 | AC-DB-005 | UC-024/TC-024 | OPEN-039 | AC + UC/TC planned |
| FR-DB-006 | DEC-016 | AC-DB-006 | UC-024/TC-024 | OPEN-039 | AC + UC/TC planned |
| FR-DB-007 | DEC-016 | AC-DB-007 | UC-024/TC-024 | — | AC + UC/TC planned |
| FR-DB-008 | DEC-018 | AC-DB-008 | UC-024/TC-024 UC-033/TC-033 | — | AC + UC/TC planned |
| FR-QC-001 | DEC-017/DEC-029 | AC-QC-001 | UC-001/TC-001 UC-024/TC-024 | OPEN-017 | AC + UC/TC planned |
| FR-QC-002 | DEC-029 BR-001 DEC-052 | AC-QC-002 AC-QC-002-01 AC-QC-002-02 AC-QC-002-03 AC-QC-002-04 | UC-004/TC-004 UC-016/TC-016 | OPEN-002 | AC + UC/TC planned |
| FR-QC-003 | DEC-029/DEC-049 | AC-QC-003 | UC-007/TC-007 UC-015/TC-015 UC-016/TC-016 UC-029/TC-029 | OPEN-011/OPEN-025 | AC + UC/TC planned |
| FR-QC-004 | DEC-029 BR-021 | AC-QC-004 | UC-001/TC-001 UC-016/TC-016 | OPEN-002/OPEN-011 | AC + UC/TC planned |
| FR-QC-005 | DEC-030 | AC-QC-005 | UC-016/TC-016 | OPEN-011 | AC + UC/TC planned |
| FR-QC-006 | DEC-031 BR-022 DEC-052 | AC-QC-006 AC-QC-006-01 | UC-007/TC-007 UC-015/TC-015 | OPEN-024/OPEN-025 | AC + UC/TC planned |
| FR-QC-007 | DEC-031 BR-022 DEC-052 | AC-QC-007 AC-QC-007-01 | UC-015/TC-015 | OPEN-024 | AC + UC/TC planned |
| FR-QC-008 | DEC-031 | AC-QC-008 | UC-007/TC-007 UC-015/TC-015 | OPEN-024/OPEN-002 | AC + UC/TC planned |
| FR-QC-009 | DEC-032 BR-029 DEC-052 | AC-QC-009 AC-QC-009-01 | UC-001/TC-001 UC-029/TC-029 | — | AC + UC/TC planned |
| FR-QC-010 | DEC-032 BR-029 DEC-052 | AC-QC-010 AC-QC-010-01 | UC-029/TC-029 | — | AC + UC/TC planned |
| FR-QC-011 | DEC-015/DEC-029 BR-014/BR-021 | AC-QC-011 | UC-001/TC-001 UC-002/TC-002 UC-016/TC-016 | — | AC + UC/TC planned |
| FR-QC-012 | DEC-049 | AC-QC-012 | UC-029/TC-029 | — | AC + UC/TC planned |
| FR-IM-001 | DEC-033 | AC-IM-001 | UC-017/TC-017 | OPEN-007/OPEN-023 | AC + UC/TC planned |
| FR-IM-002 | DEC-033 | AC-IM-002 | UC-017/TC-017 | OPEN-002/OPEN-023 | AC + UC/TC planned |
| FR-IM-003 | DEC-033 | AC-IM-003 | UC-017/TC-017 | OPEN-002/OPEN-023 | AC + UC/TC planned |
| FR-IM-004 | DEC-033 | AC-IM-004 | UC-017/TC-017 | OPEN-001/OPEN-022/OPEN-027 | AC + UC/TC planned |
| FR-IM-005 | DEC-034 BR-021 | AC-IM-005 | UC-017/TC-017 | OPEN-010 | AC + UC/TC planned |
| FR-IM-006 | DEC-034 | AC-IM-006 AC-IM-006-01 | UC-017/TC-017 | OPEN-002/OPEN-022/OPEN-023 | AC + UC/TC planned |
| FR-IM-007 | DEC-034 BR-022 | AC-IM-007 | UC-017/TC-017 UC-026/TC-026 | OPEN-024/OPEN-035 | AC + UC/TC planned |
| FR-IM-008 | DEC-035 BR-023 | AC-IM-008 AC-IM-008-01 AC-IM-008-02 | UC-017/TC-017 | OPEN-010 | AC + UC/TC planned |
| FR-IM-009 | DEC-035 BR-023 | AC-IM-009 | UC-017/TC-017 | OPEN-010/OPEN-022 | AC + UC/TC planned |
| FR-IM-010 | DEC-036 BR-023 | AC-IM-010 AC-IM-010-01 | UC-017/TC-017 | OPEN-010 | AC + UC/TC planned |
| FR-IM-011 | DEC-037 BR-025 | AC-IM-011 AC-IM-011-01 AC-IM-011-02 | UC-017/TC-017 UC-026/TC-026 | OPEN-035 | AC + UC/TC planned |
| FR-IM-012 | DEC-036 BR-024 | AC-IM-012 AC-IM-012-01 | UC-017/TC-017 | OPEN-004/OPEN-022 | AC + UC/TC planned |
| FR-IM-013 | DEC-037 BR-024 | AC-IM-013 | UC-017/TC-017 | OPEN-008 | AC + UC/TC planned |
| FR-IM-014 | DEC-031/DEC-034 BR-022 | AC-IM-014 AC-IM-014-01 AC-IM-014-02 | UC-017/TC-017 UC-026/TC-026 | OPEN-024/OPEN-035 | AC + UC/TC planned |
| FR-HE-001 | DEC-020/DEC-022 BR-015 | AC-HE-001 | UC-002/TC-002 UC-013/TC-013 UC-022/TC-022 | OPEN-004 | AC + UC/TC planned |
| FR-HE-002 | DEC-022 BR-015 | AC-HE-002 AC-HE-002-01 AC-HE-002-02 | UC-019/TC-019 UC-022/TC-022 | OPEN-002/OPEN-037 | AC + UC/TC planned |
| FR-HE-003 | DEC-022 BR-016 | AC-HE-003 AC-HE-003-01 | UC-021/TC-021 UC-028/TC-028 | OPEN-004/OPEN-020 | AC + UC/TC planned |
| FR-HE-004 | DEC-021 | AC-HE-004 | UC-028/TC-028 | OPEN-002/OPEN-017 | AC + UC/TC planned |
| FR-HE-005 | DEC-021 | AC-HE-005 | UC-028/TC-028 | OPEN-017 | AC + UC/TC planned |
| FR-HE-006 | DEC-023 BR-017 | AC-HE-006 | UC-010/TC-010 UC-028/TC-028 | OPEN-021 | AC + UC/TC planned |
| FR-HE-007 | DEC-023 | AC-HE-007 AC-HE-007-01 AC-HE-007-02 | UC-010/TC-010 | OPEN-021/OPEN-037 | AC + UC/TC planned |
| FR-HE-008 | DEC-023 BR-017 | AC-HE-008 AC-HE-008-01 | UC-011/TC-011 | OPEN-021 | AC + UC/TC planned |
| FR-HE-009 | DEC-023 BR-017 | AC-HE-009 | UC-028/TC-028 | OPEN-021 | AC + UC/TC planned |
| FR-HE-010 | DEC-023 BR-017 | AC-HE-010 | UC-022/TC-022 | OPEN-002/OPEN-004 | AC + UC/TC planned |
| FR-HE-011 | DEC-024 BR-017 | AC-HE-011 AC-HE-011-01 | UC-010/TC-010 UC-011/TC-011 | — | AC + UC/TC planned |
| FR-HE-012 | DEC-024 BR-017 | AC-HE-012 AC-HE-012-01 | UC-011/TC-011 | OPEN-021 | AC + UC/TC planned |
| FR-HE-013 | DEC-025 BR-027 | AC-HE-013 | UC-010/TC-010 UC-019/TC-019 UC-022/TC-022 | OPEN-021/OPEN-030 | AC + UC/TC planned |
| FR-TN-001 | DEC-026 | AC-TN-001 | UC-030/TC-030 | OPEN-002 | AC + UC/TC planned |
| FR-TN-002 | DEC-026 | AC-TN-002 | UC-030/TC-030 UC-037/TC-037 | OPEN-002/OPEN-040 | AC + UC/TC planned |
| FR-TN-003 | DEC-026 | AC-TN-003 | UC-030/TC-030 | OPEN-040 | AC + UC/TC planned |
| FR-TN-004 | DEC-027 | AC-TN-004 | UC-023/TC-023 UC-037/TC-037 | OPEN-009 | AC + UC/TC planned |
| FR-TN-005 | DEC-027 | AC-TN-005 | UC-023/TC-023 | OPEN-009/OPEN-013 | AC + UC/TC planned |
| FR-TN-006 | DEC-027 | AC-TN-006 | UC-023/TC-023 | — | AC + UC/TC planned |
| FR-TN-007 | DEC-028 | AC-TN-007 | UC-023/TC-023 UC-032/TC-032 | OPEN-008 | AC + UC/TC planned |
| FR-TN-008 | DEC-028 BR-020 | AC-TN-008 | UC-023/TC-023 UC-032/TC-032 | OPEN-008 | AC + UC/TC planned |
| FR-TN-009 | DEC-028 BR-009/BR-020 | AC-TN-009 | UC-023/TC-023 UC-032/TC-032 | — | AC + UC/TC planned |
| FR-TN-010 | DEC-028 BR-009 | AC-TN-010 | UC-023/TC-023 UC-032/TC-032 | OPEN-008 | AC + UC/TC planned |
| FR-TN-011 | DEC-013 BR-011 | AC-TN-011 | UC-012/TC-012 | OPEN-029/OPEN-040 | AC + UC/TC planned |
| FR-DO-001 | DEC-039 | AC-DO-001 | UC-018/TC-018 UC-031/TC-031 | OPEN-006/OPEN-007 | AC + UC/TC planned |
| FR-DO-002 | DEC-039 | AC-DO-002 AC-DO-002-01 | UC-018/TC-018 | OPEN-005/OPEN-006 | AC + UC/TC planned |
| FR-DO-003 | DEC-039 | AC-DO-003 | UC-018/TC-018 | OPEN-006/OPEN-007 | AC + UC/TC planned |
| FR-DO-004 | DEC-040 | AC-DO-004 | UC-003/TC-003 UC-018/TC-018 | OPEN-036 | AC + UC/TC planned |
| FR-DO-005 | DEC-040 BR-026 | AC-DO-005 AC-DO-005-01 AC-DO-005-02 | UC-003/TC-003 UC-018/TC-018 | OPEN-036 | AC + UC/TC planned |
| FR-DO-006 | DEC-040 BR-026 | AC-DO-006 | UC-003/TC-003 UC-018/TC-018 | — | AC + UC/TC planned |
| FR-DO-007 | DEC-041 | AC-DO-007 | UC-018/TC-018 | OPEN-006 | AC + UC/TC planned |
| FR-DO-008 | DEC-041 | AC-DO-008 | UC-018/TC-018 | OPEN-006/OPEN-007 | AC + UC/TC planned |
| FR-DO-009 | DEC-041 | AC-DO-009 | UC-018/TC-018 | OPEN-006/OPEN-007 | AC + UC/TC planned |
| FR-DO-010 | DEC-039/DEC-041 BR-030 NFR-001 | AC-DO-010 AC-DO-010-01 AC-DO-010-02 | UC-031/TC-031 UC-034/TC-034 | OPEN-006/OPEN-013/OPEN-032 | AC + UC/TC planned |
| FR-CC-001 | DEC-042 | AC-CC-001 | UC-025/TC-025 | OPEN-002 | AC + UC/TC planned |
| FR-CC-002 | DEC-042 BR-028 | AC-CC-002 | UC-008/TC-008 | OPEN-002 | AC + UC/TC planned |
| FR-CC-003 | DEC-042 BR-028 | AC-CC-003 | UC-008/TC-008 | OPEN-002 | AC + UC/TC planned |
| FR-CC-004 | DEC-043 BR-027 | AC-CC-004 | UC-004/TC-004 UC-008/TC-008 UC-019/TC-019 | OPEN-002/OPEN-030 | AC + UC/TC planned |
| FR-CC-005 | DEC-043 BR-027 | AC-CC-005 | UC-019/TC-019 | OPEN-002/OPEN-030 | AC + UC/TC planned |
| FR-CC-006 | DEC-044 BR-018 | AC-CC-006 | UC-025/TC-025 | OPEN-002 | AC + UC/TC planned |
| FR-CC-007 | DEC-044 BR-018 | AC-CC-007 | UC-004/TC-004 UC-025/TC-025 | OPEN-002 | AC + UC/TC planned |
| FR-CC-008 | DEC-043 | AC-CC-008 | UC-006/TC-006 UC-014/TC-014 | OPEN-002 | AC + UC/TC planned |
| FR-CC-009 | DEC-043 BR-019 | AC-CC-009 | UC-019/TC-019 UC-025/TC-025 | OPEN-004/OPEN-030 | AC + UC/TC planned |
| FR-CC-010 | DEC-043 BR-019/BR-027 | AC-CC-010 | UC-019/TC-019 | OPEN-004/OPEN-030 | AC + UC/TC planned |
| FR-CC-011 | DEC-003/DEC-043 BR-002 | AC-CC-011 | UC-006/TC-006 UC-014/TC-014 | OPEN-024 | AC + UC/TC planned |
| FR-GS-001 | DEC-038 | AC-GS-001 | UC-020/TC-020 | OPEN-038 | AC + UC/TC planned |
| FR-GS-002 | DEC-038 | AC-GS-002 | UC-020/TC-020 | OPEN-038 | AC + UC/TC planned |
| FR-GS-003 | DEC-038 | AC-GS-003 | UC-020/TC-020 | OPEN-038 | AC + UC/TC planned |
| FR-GS-004 | DEC-038 BR-014 | AC-GS-004 | UC-007/TC-007 UC-020/TC-020 | OPEN-025/OPEN-038 | AC + UC/TC planned |
| FR-GS-005 | DEC-038 | AC-GS-005 | UC-020/TC-020 UC-034/TC-034 | OPEN-038 | AC + UC/TC planned |
| FR-GS-006 | DEC-038 | AC-GS-006 | UC-020/TC-020 | OPEN-038 | AC + UC/TC planned |
| FR-GS-007 | DEC-038 | AC-GS-007 | UC-020/TC-020 | OPEN-038 | AC + UC/TC planned |
| FR-GS-008 | DEC-038 BR-012 | AC-GS-008 | UC-020/TC-020 | OPEN-005/OPEN-038 | AC + UC/TC planned |
| FR-NV-001 | DEC-017 | AC-NV-001 | UC-024/TC-024 | OPEN-017 | AC + UC/TC planned |
| FR-NV-002 | DEC-017 | AC-NV-002 | UC-020/TC-020 UC-024/TC-024 | OPEN-017 | AC + UC/TC planned |
| FR-NV-003 | DEC-017 | AC-NV-003 | UC-024/TC-024 UC-029/TC-029 | OPEN-017 | AC + UC/TC planned |

## AD — Account & Data Management (statusy wymagania jawne)

| Wymaganie | Podstawa `DEC/BR/NFR` | AC | Scenariusze / TC | Bramka | Status FR i pokrycie |
|---|---|---|---|---|---|
| FR-AD-001 | DEC-018/DEC-051 BR-030 ADR-0012 | AC-AD-001 | UC-033/TC-033 | OPEN-013 | APPROVED (limited) · PLANNED / NOT EXECUTED |
| FR-AD-002 | BR-030 NFR-001 DEC-052 | AC-AD-002 AC-AD-002-01 | UC-034/TC-034 UC-036/TC-036* | OPEN-006/OPEN-013/OPEN-032 | APPROVED (invariant) · PLANNED / NOT EXECUTED |
| FR-AD-003 | DEC-051 ADR-0012 | AC-AD-003 | UC-035/TC-035* | OPEN-041/OPEN-013 | PROPOSED — pełny kontrakt; podzakres APPROVED DEC-051 · CONDITIONAL / NOT EXECUTED |
| FR-AD-004 | DEC-051 ADR-0012 | AC-AD-004 | UC-035/TC-035* | OPEN-042/OPEN-013 | PROPOSED — pełny kontrakt; podzakres APPROVED DEC-051 · CONDITIONAL / NOT EXECUTED |
| FR-AD-005 | DEC-051 ADR-0012 NFR-001 | AC-AD-005 | UC-035/TC-035* | OPEN-013/OPEN-042 | PROPOSED — pełny kontrakt; podzakres APPROVED DEC-051 · CONDITIONAL / NOT EXECUTED |
| FR-AD-006 | DEC-051 ADR-0012 | AC-AD-006 | UC-035/TC-035* | OPEN-043/OPEN-013 | PROPOSED — pełny kontrakt; podzakres APPROVED DEC-051 · CONDITIONAL / NOT EXECUTED |
| FR-AD-007 | — | AC-AD-007 | UC-035/TC-035* | OPEN-044/OPEN-002 | PROPOSED · CONDITIONAL / NOT EXECUTED |
| FR-AD-008 | NFR-007 | AC-AD-008 | UC-036/TC-036* | OPEN-032/OPEN-045 | PROPOSED · CONDITIONAL / NOT EXECUTED |
| FR-AD-009 | NFR-007 | AC-AD-009 | UC-036/TC-036* | OPEN-005/OPEN-006/OPEN-032/OPEN-046 | PROPOSED · CONDITIONAL / NOT EXECUTED |

\* Scenariusz warunkowy dla funkcji `PROPOSED` — zapis w macierzy nie oznacza ich zatwierdzenia.

## Mapa rebaseline 2026-10-29 — dowody techniczne a produktowe

| Wymagania | Decyzja / bramka | Plan techniczny | Stan |
|---|---|---|---|
| FR/AC-AD-003–006, NFR-004 | DEC-051 / ADR-0012, SEC-01 | AUTH-01–12/14 i FQA-22–34/57 v2 w [Foundation QA](../technical/foundation-qa.md) | F3 PLANNED / NOT RUN; wycofane broker-only AUTH-13/FQA-55 SUPERSEDED / NOT APPLICABLE, bez PASS |
| FR/AC-AD-002, BR-030, NFR-001 | SEC-02, ADR-0012 | [Wykonane syntetyczne F2](../technical/foundation-f2.md); ponowienie właściwych RLS przy F3 | Historia F2 bez zmian; produktowe UC/TC-034 nadal NOT EXECUTED |
| FR-IM-005–014, AC-IM-008/011/014, NFR-008 | ADR-0005 nadal ACCEPTED, IM-01 | Minimalne RPC/FQA-35–42 v2 w docelowym import slice | F4 przesunięte / PLANNED / NOT RUN; bez zależności ręcznego CRUD od importer-specific RPC |

Stabilne ID FR/AC/UC/TC pozostają. Aktualizacja kontraktów Auth i technicznej atomowości wynika z decyzji PO/ADR; nie przypisuje nowych wyników wcześniej wykonanym testom ani nie promuje całych FR PROPOSED.

## Raport pokrycia (na etapie dokumentacji)

- FR: **135** (126 dotychczasowych `APPROVED` + 2 `APPROVED` ograniczone do niezmienników + 7 `PROPOSED`), każde z co najmniej jednym AC.
- Scenariusze UC/TC: **37 / 37**: `TC-001`–`TC-034` PLANNED oraz `TC-035/036` warunkowe PROPOSED; **żadnego nie wykonano**.
- FR ze skojarzonym UC/TC: **135** (w tym 7 przez scenariusze warunkowe).
- FR bez dedykowanego UC/TC: **0**; powiązanie z UC nie stanowi automatycznie wykonanej asercji.

**Nie** interpretuj obecności `TC-*` jako zielonego testu. Zagadnienia `P0 OPEN` i wrażliwe funkcje muszą zostać rozstrzygnięte przed implementacją i odbiorem.


**Wykonanie technicznego podzakresu F3 (2026-10-29):** [raport F3](../technical/foundation-f3.md) mapuje AUTH/FQA v2 na lokalne dowody SDK/SSR i syntetyczne RLS A/B. Nie jest to wykonanie pełnych UC/TC-034/035 ani całych FR/AC-AD-002–006 dla nieistniejących modułów danych, dokumentów i otwartych polityk. Statusy APPROVED/PROPOSED/OPEN i historyczne wyniki pozostają bez zmian.


## Pierwszy biznesowy create/read — DEC-052 (2026-10-29)

Status modelu: **APPROVED**; OPEN-002/024 i DATA-01 **PARTIALLY RESOLVED**, pozostałe podzakresy **OPEN**. Status wykonania: na etapie formalizacji **NOT RUN**; późniejsze komendy, środowisko, kandydat i dowody w [raporcie](../technical/recruitment-case-first-slice-report.md). Poniższa macierz opisuje zakres testowania, nie prognozę PASS.

| Podstawa | Zatwierdzony podzakres / nowe AC | Scenariusz i poziom testu | Granica pełnego pokrycia |
| --- | --- | --- | --- |
| FR/AC-LC-001; DEC-001/002/052; BR-001/028 | LC-001-01/02: nazwa, opcjonalny opis, Unicode; bez innych wymagań | UC/TC-001 adaptacja manual; unit + DB + browser | Brak pełnych wariantów z akcjami LC-002/UC-003/004 |
| FR/AC-LC-004; DEC-004/052; BR-003/004/007/016 | LC-004-01: Zapisane i brak spoofingu przez API | UC/TC-001 częściowo; HTTP/SQL i browser | Bez lifecycle/przejść; PARTIAL COVERAGE |
| FR/AC-QC-001/002; DEC-017/029/052 | QC-002-01–04: 4 kroki, runtime walidacja, HTTP(S) bez fetch, idempotencja/retry | UC/TC-001 częściowo; unit, HTTP concurrency i Playwright | Siedem modułów/Smart Import poza zakresem; QC-001 PARTIAL COVERAGE |
| FR/AC-QC-006/007; DEC-031/052; BR-021/022 | QC-006-01/007-01: owner-only nazwa/URL, wybór i brak merge/update | HTTP A/B + Playwright warning/continue/cancel | FR-QC-008 i zaawansowany/importowy dedup OPEN |
| FR/AC-QC-009/010; DEC-032/052; BR-029 | QC-009-01/010-01: toast, bieżący widok, pusty nowy zamiar | UC/TC-029 adaptacja manual; Playwright | Pełny UC-029 obejmuje URL/Smart Import i NV; PARTIAL COVERAGE |
| FR/AC-RW-005/009; DEC-019/020/052 | Własna lista newest-first i pełny minimalny detal | HTTP i Playwright list/detail | Bez Kanbana, drawera i pełnych powiązań; PARTIAL COVERAGE |
| FR/AC-AD-002; BR-030; NFR-001; ADR-0012 | AD-002-01: prawdziwe RLS/grants HTTP A/B/anon i brak metadanych | UC/TC-034 częściowo; Data API, SQL catalog, browser logout/cache | Brak dokumentów/Search/relacji; PARTIAL COVERAGE |

Dodatkowo regresje F1/F2/F3 i harness są zachowane jako osobne dowody. Testy link-table rollback i owner-qualified relation są NOT APPLICABLE, jeśli ostateczna implementacja ma jedną tabelę z `source_url`; atomiczność bieżącego zapisu wszystkich pól nadal wymaga dowodu. [Analiza i plan](../technical/recruitment-case-first-slice-analysis.md), [kontrakt modelu](../technical/recruitment-case-first-slice.md).

## UI Foundation & UX Polish — DEC-053 (2026-10-30)

Zakres APPROVED przez PO; implementacja i wykonanie kontroli początkowo NOT RUN. [Plan/raport](../technical/ui-foundation-report.md), [research](../ux/visual-design-research.md), [wybrany visual language](../ux/visual-language.md). To warstwa istniejącego produktu, bez rozszerzenia domenowego create/read.

| Kontrakt | Kontrola | Granica |
| --- | --- | --- |
| FR/AC-NV-001/003, DEC-017/053 | Desktop/sidebar collapse/mobile nav, aktywna trasa, QC z istniejących ekranów, klawiatura i focus | Pozostałe pięć modułów niedostępne; brak pełnego siedmiomodułowego PASS. NV-002/Search poza zakresem. |
| FR/AC-DB-001/007/008 | Landing i celowy pusty stan, bez fikcyjnych statystyk/aktywności/terminów i onboardingu | DB-002–006 bez nowej implementacji. |
| FR/AC-RW-005/009, LC-001/004; DEC-052 | Lista/detal, hierarchia i techniczne metadane, paginacja, długie dane | Bez Kanbana, edycji, historii i relacji. |
| FR/AC-QC-001/002/006/007/009/010; UC/TC-001/029 | Regresja czterech kroków, summary/warning/toast, retry/recovery i idempotencja; visual/focus/mobile | Wyłącznie manual DEC-052, bez zmiany kontraktu i walidacji. |
| FR/AC-AD-002, DEC-051, BR-030; UC/TC-034 częściowo | Menu konta, trzy logout scopes, F3/HTTP/RLS/E2E i prywatność po logout | Natywne JWT/SDK/callback bez zmian; pełne AD i publiczne polityki nadal OPEN. |
| NFR-005, OPEN-017/033 częściowo, DEC-053 | Rzeczywisty render 1440/1024/768/375, reflow/zoom, klawiatura, kontrasty WCAG 2.2 AA, stany skrajne i independent design/frontend review | Brak domniemanej certyfikacji AT/fizycznych urządzeń i przyszłych modułów. |

Wyniki poszczególnych komend, screenshoty, kandydat i ograniczenia są w raporcie; sam zapis macierzy nie nadaje PASS. OPEN-015 zachowuje docelową nazwę/logo/branding, OPEN-017/033 pozostałą część produktu i macierz wsparcia.

## Recruitment Lifecycle 3A — DEC-054

| Wymaganie / podzakres | Dodatkowe AC | Scenariusz / dowód |
|---|---|---|
| FR-LC-005 | AC-LC-005-01 | TC-002/003 częściowo, 3A aplikowanie |
| FR-LC-006 | AC-LC-006-01 | TC-004 częściowo, 3A inbound/outbound |
| FR-LC-014 | AC-LC-014-01 | 3A komenda, retry/conflict/race/atomicity |
| FR-HE-001 | AC-HE-001-01 | 3A chronologia i nieznane daty |
| FR-HE-002 | AC-HE-002-03 | 3A dzień zdarzenia i osobny czas zapisu |
| FR-HE-003 | AC-HE-003-02 | 3A brak fikcyjnej historii i jawne ograniczenie append-only |
| FR-AD-002 / BR-030 | istniejące AC-AD-002 | 3A real Auth/Data API A/B/anon, relacje i brak wycieków |

[Kontrakt/plan i delegacja](../technical/recruitment-lifecycle-3a.md). Pełne FR i TC-002/003/004 nie są ukończone w 3A; kanały, CV i osoby poza przyrostem. OPEN-004 jest bramką publicznego udostępnienia. Wyniki wykonania będą raportowane oddzielnie od pokrycia planem.

**Wynik wykonania 3A:** [raport](../technical/recruitment-lifecycle-3a-report.md): unit208+87 PASS, real local integration43/43 PASS, HTTPS browser42/42 PASS, backend/frontend/security review PASS po zamknięciu P3. Dodatkowe AC zakresu objęte dowodami domeny/integracji/browser; nie podnosi to pełnych TC-002/003/004 ani całych modułów do ukończonych. Exact-SHA CI jest osobnym wynikiem PR.


## Recruitment Lifecycle 3B — DEC-055

| Podzakres | AC | Scenariusz / plan dowodu |
|---|---|---|
| FR-LC-007/008 | AC-LC-007-01/008-01 | UC/TC-005 częściowo; zaproszenie, atomowy status/etap, odczyt lista/detal |
| FR-LC-011/012/013 | AC-LC-011-01/012-01/013-01 | UC/TC-009 częściowo; indywidualna nazwa, pomijanie, snapshot historii |
| FR-LC-014 | AC-LC-014-02 | Idempotencja po progresji, stale-stage conflict, rollback/race |
| FR-LC-005/006 | AC-LC-005-02/006-02 | Dalsze fakty w W rekrutacji bez cofania stanu; regresje 3A |
| FR-HE-001/002/003 | AC-HE-001-01/002-04/003-03 | Mieszana paginowana historia, dzień/unknown i czas zapisu, brak fikcyjnych faktów |
| FR-AD-002 / BR-030 | AC-AD-002 | A/B/anon, listy/direct ID/count/recovery/relacje i bezpośredni Data API |

[Kontrakt, wpływ, plan i decyzje](../technical/recruitment-lifecycle-3b-analysis.md). Na etapie zapisu: PLANNED / NOT RUN; rzeczywiste wyniki w raporcie 3B po wykonaniu. Bez pełnego PASS dla LC-009/010, UC/TC-005/009, Kanbana lub publicznego udostępnienia.


**Wynik wykonania 3B:** [raport](../technical/recruitment-lifecycle-3b-report.md) i [QA](../technical/recruitment-lifecycle-3b-qa.md):235+87unitPASS,53/53realintegrationPASS,50/50HTTPSbrowserPASS na produkcie f6db0d4. Osobna korekta capture w1c9c830: build/integracja53/targetedbrowser1PASS; nie zastępuje ani nie rozszerza liczby50. Backend/frontend/security statycznyreviewPASS; runtime wykonywało QA. Publiczne udostępnienie i pełne moduły/TC pozostają poza akceptacją. Final-SHA CI osobno w PR.

## History Corrections & Integrity — DEC-056

| FR | AC w przyroście | Scenariusz / dowód |
|---|---|---|
| FR-HE-002 | AC-HE-002-05, HE-002-01/-02 | UC/TC-021 podscenariusze korekty dnia; QA/runtime osobno |
| FR-HE-003 | AC-HE-003-04, HE-003/-01 | UC/TC-021; audit/void bez fikcyjnych faktów |
| FR-LC-015 | AC-LC-015-02/-03, LC-015/-01 | UC/TC-021 częściowo bez DnD; zależności i uzgodnienie stanu |
| FR-LC-014 | AC-LC-014-03/-04 | UC/TC-021; concurrency/replay/recovery + regresje 3A/3B |
| FR-LC-013 | AC-LC-013 | UC/TC-009 regresja snapshotów |
| FR-AD-002 | AC-AD-002 | owner A/B/anon, audit/ID/count/relacje/Data API/recovery |

APPROVED podzakres DEC-056, testy i review nie wynikają ze statusu decyzji. Raport wykonania: [History Corrections & Integrity](../technical/history-corrections-integrity-report.md).

## Lifecycle 3C — DEC-057

Wyniki: [raport](../technical/recruitment-lifecycle-3c-report.md), [QA](../technical/recruitment-lifecycle-3c-qa.md). Lokalne 291+87 unit, 83/83 integracje, 73/73 HTTPS browser PASS na produkcie 33c/testach 252; niezależne review PASS w opisanych niezmienionych zakresach. Pełne TC-012 i Search poza pokryciem. Bez merge/deploymentu.

| FR | AC | Scenariusz / granica |
|---|---|---|
| FR-LC-016 | AC-LC-016/-01/-02/-03/-04 | podzakres UC/TC-012: wynik, potwierdzenie oferty, aplikacje w cyklu |
| FR-LC-017/019 | AC-LC-017/-01/-02/-03, LC-019/-01/-02/-03 | UC/TC-013: close/reopen/close, audyt zakończeń, oryginalne snapshoty |
| FR-LC-015/014 | AC-LC-015-04, LC-014-05 | regresje DEC-056, bariera zamknięcia, concurrency/replay/recovery |
| FR-HE-001/002/003 | AC-HE-001-01, HE-002-06, HE-003-04 | historia/unknown/day/registration, rewizje bez nowej aktywności |
| FR-AD-002 | AC-AD-002 | A/B/anon list/ID/count/relacje/audyt/recovery/Data API |
| FR-LC-018/TN-011 | AC-LC-018, AC-TN-011 | pełny TC-012 NOT RUN: 3C wyłącznie bez otwartych Task/CalendarEvent; BR-011 zachowana |
| FR-LC-021 | AC-LC-021 częściowo | lista/detal; Global Search poza zakresem |

[Kontrakt i plan](../technical/recruitment-lifecycle-3c.md). Zatwierdzenie nie jest dowodem testów; wyniki osobno.

## Companies & Contacts — DEC-058

| Podstawa | Podzakres | Plan dowodów |
|---|---|---|
| FR/AC-CC-001–006/008/011, DEC-042–044/058, BR-001/002/018/027/028 | Katalog/create/read/edit, jawne M:N i role, dedup | Unit + nowe integracje i browser CC; TC-006/008/014/025 częściowo |
| FR/AC-AD-002, BR-030, SEC-01/02 | RLS obu końców, metadata, dedup/audit/recovery i Origin, immutable audyt/intent | Real Auth/Data API A/B/anon, direct write attempts, cache/PII |
| BR-016/019, DEC-054–057 | Katalog nie zmienia lifecycle/zdarzeń/revisions/closures | Snapshoty + regresja runnera |
| FR/AC-CC-007/009/010 | Poza przyrostem | NOT RUN: komunikacja/źródłowe uczestnictwo/historia osoby |

Kontrakt i plan: [CC](../technical/companies-contacts-analysis.md). Wyniki wykonania wymagają osobnego raportu, bez domniemania PASS.

### Wykonanie CC — 2026-10-31

[Raport](../technical/companies-contacts-report.md) i [QA](../technical/companies-contacts-qa.md): PASS FR/AC-CC-001–006/008/011 w zatwierdzonym zakresie DEC-058, podzakres AD-002, unit333+87, pełny runner105/105 integration i92/92 browser, natural exit0. Niezależne review domknęło1P1+4P2 i oceniło późniejsze delty. AC-CC-007/009/010, pełne TC-019/025/034 oraz publiczny produkt nadal poza tym dowodem. Hosted CI odrębnie dla exact PR head.

## Recruitment Workspace — DEC-059

FR/AC-RW-001–007/009 i sufiksy RW-005-01, RW-006-01–03, RW-009-01–02 → UC/TC-027 częściowo → [kontrakt](../technical/recruitment-workspace-analysis.md), [UX](../ux/recruitment-workspace-slice.md). BR-003/005/006/007/008/011/015/016/027/028/030 i AD-002 to niezmienniki/regresje. Dedykowane workspace unit/integration/E2E; wyniki osobno. RW-008 poza przyrostem, RW-010 zachowuje istniejący detal, RW-011 tylko wdrożony kontekst.

Wykonanie 1A/2A: [raport](../technical/recruitment-workspace-report.md), [macierz QA i historia wyników](../technical/recruitment-workspace-qa.md). Dokładny kandydat0564b4c: lokalnie386+87 unit,115/115 integracji i20/20 jawnie wybranych browser PASS oraz niezależne backend/frontend/security PASS_STATIC. Pełne104 browser i cały gate dokładnego publikowanego head pozostają obowiązkowym sprawdzeniem CI w PR; lokalny wybór nie nadaje pełnego PASS TC-027 ani przyszłych kontekstów RW-011.
