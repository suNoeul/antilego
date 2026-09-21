"""개역한글(1961) 본문 로더 + 무결성 점검.

전자본 3종을 같은 OSIS 절 키로 정규화해 비교한다.
  unbound   data/raw/kor-korean.osis.xml           (The Unbound Bible / seven1m 경유)
  bluesaurel data/raw/krv/bluesaurel_1961_krv.json (66권 1189장 31102절, 옛 표기 보존)
  yuhwan    data/raw/krv/yuhwan/*.json             (66권 31102절, 표기 일부 현대화)

본문은 수정하지 않는다(동일성유지권).
**주 본문 로더 `load_bluesaurel()` 은 원본 문자열을 그대로 돌려준다** — strip 도 하지 않는다
(2026-09-21, 리뷰 F5). web/data/ 로 나가는 본문은 이 로더만 쓴다.
비교·정규화용 로더(`load_yuhwan`·`load_unbound`)는 판본 대조에만 쓰므로 strip 이 남아 있다.
`python krv.py` 로 실행하면 무결성 리포트를 찍는다.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"

# OSIS 책 약어 66권 (개신교 정경 순서)
OSIS_BOOKS = [
    "Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth", "1Sam", "2Sam",
    "1Kgs", "2Kgs", "1Chr", "2Chr", "Ezra", "Neh", "Esth", "Job", "Ps", "Prov",
    "Eccl", "Song", "Isa", "Jer", "Lam", "Ezek", "Dan", "Hos", "Joel", "Amos",
    "Obad", "Jonah", "Mic", "Nah", "Hab", "Zeph", "Hag", "Zech", "Mal",
    "Matt", "Mark", "Luke", "John", "Acts", "Rom", "1Cor", "2Cor", "Gal", "Eph",
    "Phil", "Col", "1Thess", "2Thess", "1Tim", "2Tim", "Titus", "Phlm", "Heb",
    "Jas", "1Pet", "2Pet", "1John", "2John", "3John", "Jude", "Rev",
]
KO_BOOKS = [
    "창세기", "출애굽기", "레위기", "민수기", "신명기", "여호수아", "사사기", "룻기",
    "사무엘상", "사무엘하", "열왕기상", "열왕기하", "역대상", "역대하", "에스라",
    "느헤미야", "에스더", "욥기", "시편", "잠언", "전도서", "아가", "이사야",
    "예레미야", "예레미야애가", "에스겔", "다니엘", "호세아", "요엘", "아모스",
    "오바댜", "요나", "미가", "나훔", "하박국", "스바냐", "학개", "스가랴", "말라기",
    "마태복음", "마가복음", "누가복음", "요한복음", "사도행전", "로마서",
    "고린도전서", "고린도후서", "갈라디아서", "에베소서", "빌립보서", "골로새서",
    "데살로니가전서", "데살로니가후서", "디모데전서", "디모데후서", "디도서",
    "빌레몬서", "히브리서", "야고보서", "베드로전서", "베드로후서",
    "요한1서", "요한2서", "요한3서", "유다서", "요한계시록",
]
EN_BOOKS = [
    "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges",
    "Ruth", "1Samuel", "2Samuel", "1Kings", "2Kings", "1Chronicles", "2Chronicles",
    "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes",
    "SongofSolomon", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel",
    "Hosea", "Joel", "Amos", "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk",
    "Zephaniah", "Haggai", "Zechariah", "Malachi", "Matthew", "Mark", "Luke",
    "John", "Acts", "Romans", "1Corinthians", "2Corinthians", "Galatians",
    "Ephesians", "Philippians", "Colossians", "1Thessalonians", "2Thessalonians",
    "1Timothy", "2Timothy", "Titus", "Philemon", "Hebrews", "James", "1Peter",
    "2Peter", "1John", "2John", "3John", "Jude", "Revelation",
]
KO2OSIS = dict(zip(KO_BOOKS, OSIS_BOOKS))
EN2OSIS = dict(zip(EN_BOOKS, OSIS_BOOKS))


def load_bluesaurel():
    """주 본문. 원본 문자열을 **한 글자도 손대지 않고** 돌려준다 (strip 없음 — F5)."""
    data = json.loads((RAW / "krv" / "bluesaurel_1961_krv.json").read_text(encoding="utf-8"))
    out = {}
    for book in data:
        b = EN2OSIS[book["book"]]
        for ch in book["chapters"]:
            for v in ch["verses"]:
                out[f"{b}.{ch['chapter']}.{v['verse']}"] = v["text"]
    return out


def load_yuhwan():
    """대조용 전자본. 정규화 비교에만 쓰므로 strip 이 남아 있다 (web 으로 나가지 않는다)."""
    out = {}
    for ko in KO_BOOKS:
        d = json.loads((RAW / "krv" / "yuhwan" / f"{ko}.json").read_text(encoding="utf-8"))
        b = KO2OSIS[ko]
        for ch in d["chapters"]:
            for v in ch["verses"]:
                out[f"{b}.{ch['chapter']}.{v['verse']}"] = v["text"].strip()
    return out


def load_unbound():
    txt = (RAW / "kor-korean.osis.xml").read_text(encoding="utf-8")
    out = {}
    for osis, body in re.findall(r"<verse osisID='([^']+)'>(.*?)</verse>", txt, re.S):
        body = re.sub(r"<[^>]+>", "", body).strip()
        for oid in osis.split():
            out[oid] = body
    return out


def load(primary="bluesaurel"):
    """{osisID: 본문}. 기본 본문 + (다른 전자본에만 있는 표기 차이) 를 함께 돌려준다.

    반환: (primary_dict, alt_dict)
    """
    prim = load_bluesaurel() if primary == "bluesaurel" else load_yuhwan()
    alt = load_yuhwan() if primary == "bluesaurel" else load_bluesaurel()
    return prim, alt


_PUNC = re.compile(r"[\s!?.,·`'‘’“”()\[\]{}:;~\-—「」『』]+")


def norm(s, archaic=True):
    s = _PUNC.sub("", s)
    if archaic:  # 1961 옛 표기 ↔ 현대 표기 차이를 지운다
        s = s.replace("찌", "지").replace("찐", "진").replace("쌔", "새").replace("께", "게")
    return s


def main():
    bl, yu, un = load_bluesaurel(), load_yuhwan(), load_unbound()
    print(f"절 수  bluesaurel={len(bl)}  yuhwan={len(yu)}  unbound={len(un)}   (기준 31,102)")
    for name, d in [("bluesaurel", bl), ("yuhwan", yu), ("unbound", un)]:
        chs = {k.rsplit(".", 1)[0] for k in d}
        print(f"  {name:11s} 책 {len({k.split('.')[0] for k in d})}권  장 {len(chs)}개")

    print("\n--- 전자본 간 일치율 (구두점·옛표기 정규화 후) ---")
    pairs = [("bluesaurel", bl, "yuhwan", yu), ("bluesaurel", bl, "unbound", un),
             ("yuhwan", yu, "unbound", un)]
    for n1, d1, n2, d2 in pairs:
        common = set(d1) & set(d2)
        same = sum(1 for r in common if norm(d1[r]) == norm(d2[r]))
        print(f"  {n1:11s} vs {n2:11s} 공통 {len(common):6d}  일치 {same:6d}  {same / len(common):.2%}")

    print("\n--- 판본 판별 (개역한글 vs 개역개정) ---")
    marks = [
        ("John.3.16", "저를", "그를"),
        ("Gen.1.3", "가라사대", "이르시되"),
        ("Matt.5.3", "저희", "그들"),
    ]
    for ref, krv_mark, rnksv_mark in marks:
        t = bl.get(ref, "")
        verdict = "개역한글" if krv_mark in t else ("개역개정?" if rnksv_mark in t else "?")
        print(f"  {ref:10s} [{verdict}] {t}")

    print("\n--- 절 정렬 확인 (개역한글 기준 본문) ---")
    for ref in ["Josh.10.12", "2Chr.36.23", "Ps.118.29", "Job.42.1", "Col.4.13", "1Pet.5.13"]:
        print(f"  {ref:12s} bl: {bl.get(ref, '<없음>')[:60]}")
        print(f"  {'':12s} un: {un.get(ref, '<없음>')[:60]}")


if __name__ == "__main__":
    main()
