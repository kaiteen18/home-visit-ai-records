#!/usr/bin/env python3
"""One-off: fix mojibake in record-form.tsx"""
from pathlib import Path

p = Path("/Users/otanikaito/Documents/home-visit-ai-records/components/record-form.tsx")
text = p.read_text(encoding="utf-8")

JP_ORG = "\u7d44\u7e54\u30e1\u30f3\u30d0\u30fc\u7ba1\u7406"
JP_LABEL_PATIENT = "\u5bfe\u8c61\u60a3\u8005\uff08\u5fc5\u9808\uff09"
JP_PH_SEARCH = "\u60a3\u8005\u540d\u3067\u7d5e\u308a\u8fbc\u307f"
JP_NO_MATCH = "\u8a72\u5f53\u3059\u308b\u60a3\u8005\u304c\u3042\u308a\u307e\u305b\u3093"
JP_PH_PREV = "\u524d\u56de\u306e\u8a2a\u554f\u8a18\u9332\u3084\u8cbc\u308a\u4ed8\u3051"
JP_LABEL_MEMO = "\u4eca\u56de\u30e1\u30e2\uff08\u5fc5\u9808\u30fbAI\u751f\u6210\u306b\u4f7f\u7528\uff09"
JP_PH_MEMO = "\u4eca\u56de\u306e\u89b3\u5bdf\u30fb\u30b1\u30a2\u5185\u5bb9\u306a\u3069\u3092\u5165\u529b"
JP_AUDIT = (
    "\u901a\u5e38\u306f\u65e5\u3005\u306e\u8a18\u9332\u5411\u3051\u3002"
    "\u76e3\u67fb\u306f\u7b2c\u4e09\u8005\u78ba\u8a8d\u30fb\u6307\u6458\u3092"
    "\u610f\u8b58\u3057\u305f\u8868\u73fe\u3092\u512a\u5148\u3057\u307e\u3059\u3002"
)
JP_AI_LABEL = (
    "\u751f\u6210\u7d50\u679c\uff08\u53c2\u7167\u7528\u30fb\u8aad\u307f\u53d6\u308a\u5c02\u7528\uff09"
)

repls = [
    ("組\ufffd\ufffdメン\ufffd\ufffdー管理", JP_ORG),
    ("対象患者（必\ufffd\ufffd）", JP_LABEL_PATIENT),
    ("患者名で\ufffd\ufffdり込み", JP_PH_SEARCH),
    ("患者\ufffdり込み", JP_PH_SEARCH),
    ("\ufffd\ufffd当する患者がありません", JP_NO_MATCH),
    ("前回の\ufffd\ufffd問記録や\ufffdり付け", JP_PH_PREV),
    ("前回の\ufffd\ufffd問記録や\ufffd\ufffdり付け", JP_PH_PREV),
    ("今回メモ（必\ufffd\ufffd・AI生成に使用）", JP_LABEL_MEMO),
    ("今回の\ufffd\ufffd察・ケア内容などを入力", JP_PH_MEMO),
    ("指摘を意\ufffd\ufffdした", "\u6307\u6458\u3092\u610f\u8b58\u3057\u305f"),
    ("読み取り\ufffd\ufffd用）", "\u8aad\u307f\u53d6\u308a\u5c02\u7528\uff09"),
]

for old, new in repls:
    text = text.replace(old, new)

# Fix doubled-garbage from earlier bad edits
text = text.replace("指した", "\u6307\u6458\u3092\u610f\u8b58\u3057\u305f")
text = text.replace("読�用）", "\u8aad\u307f\u53d6\u308a\u5c02\u7528\uff09")

# If audit line was partially corrupted
if "\ufffd" in text and "監査は第三者確認" in text:
    import re

    text = re.sub(
        r"監査は第三者確認・指摘を意\ufffd\ufffdした表現を優先します。",
        JP_AUDIT.split("。")[1] if False else JP_AUDIT,
        text,
    )

# Simpler: replace full paragraph if still broken
bad_audit_fragments = [
    "指摘を意\ufffd\ufffdした表現を優先します。",
    "指摘を意した表現を優先します。",
]
for frag in bad_audit_fragments:
    if frag in text:
        text = text.replace(frag, "\u6307\u6458\u3092\u610f\u8b58\u3057\u305f\u8868\u73fe\u3092\u512a\u5148\u3057\u307e\u3059\u3002")

if "\ufffd" in text:
    for i, line in enumerate(text.splitlines(), 1):
        if "\ufffd" in line:
            print("Still U+FFFD line", i, line[:100])

p.write_text(text, encoding="utf-8")
print("Wrote", p)
