#!/usr/bin/env python3
"""
PubMed 看護文献要約スクリプト

機能:
- PubMed API で「訪問看護」関連論文をキーワード検索し、抄録（abstract）がある論文を最大3件まで取得
- 各論文について title, abstract, summary, x_post を生成
- Google Sheets に retrieved_at, pmid, title, abstract, summary, x_post, approved, posted を追記
- approved=TRUE かつ posted=FALSE の行の x_post を X（Twitter）に投稿し、投稿後に posted を TRUE に更新
- 引数なしで実行（python main.py）
"""

import os
import re
import sys
import json
import ssl
from datetime import datetime, timezone
from pathlib import Path

import requests
import urllib.request
import urllib.error
import urllib.parse

# PubMed API の SSL 検証を一時的に無効化する場合用（原因切り分けのため）
# verify=False 時の InsecureRequestWarning を非表示にする
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# =============================================================================
# 定数・パス設定
# =============================================================================
# OpenAI API キー（ここに直接設定してください）
OPENAI_API_KEY ="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"

# X (Twitter) API 認証情報（tweepy 用。投稿する場合に設定）
X_API_KEY = ""              # Consumer Key (API Key)
X_API_SECRET = ""           # Consumer Secret (API Secret)
X_ACCESS_TOKEN = ""         # Access Token
X_ACCESS_TOKEN_SECRET = ""  # Access Token Secret

# credentials.json のパス（スクリプトと同じディレクトリ）
SCRIPT_DIR = Path(__file__).resolve().parent
CREDENTIALS_PATH = SCRIPT_DIR / "credentials.json"

# PubMed 検索キーワード（訪問看護。PubMed は英語で検索するため "home visit nursing" を使用）
PUBMED_SEARCH_KEYWORD = "home visit nursing"

# 取得する論文数（抄録ありの論文のみカウント）
PUBMED_TOP_N = 3

# 検索で取得する候補 PMID の上限（抄録なしをスキップするため多めに取得）
PUBMED_SEARCH_CANDIDATE_MAX = 100

# Google Sheets の列構成（この順番で読み書き）
SHEET_COLUMNS = [
    "retrieved_at",  # 取得日時
    "pmid",          # PubMed ID
    "title",         # 論文タイトル
    "abstract",      # 抄録（英文）
    "summary",       # 日本語要約
    "x_post",       # X（Twitter）投稿文
    "approved",      # 承認フラグ
    "posted",        # 投稿済みフラグ
]


# =============================================================================
# カスタム例外クラス（エラー種別を分けて扱うため）
# =============================================================================
class ConfigurationError(Exception):
    """設定エラー（APIキー未設定、credentials.json 不在など）"""
    pass


class PubMedError(Exception):
    """PubMed API エラー（接続失敗、文献未検出など）"""
    pass


class OpenAIError(Exception):
    """OpenAI API エラー（認証失敗、レート制限など）"""
    pass


class GoogleSheetsError(Exception):
    """Google Sheets API エラー"""
    pass


class XPostError(Exception):
    """X (Twitter) 投稿エラー"""
    pass


# =============================================================================
# 設定・認証
# =============================================================================
def get_openai_api_key() -> str:
    """
    コード内の OPENAI_API_KEY 定数から API キーを取得する。
    未設定（プレースホルダーのまま）の場合は ConfigurationError を投げる。
    """
    api_key = OPENAI_API_KEY
    if not api_key or not str(api_key).strip() or api_key == "sk-your-api-key-here":
        raise ConfigurationError(
            "OPENAI_API_KEY が設定されていません。main.py の OPENAI_API_KEY 変数に API キーを設定してください。"
        )
    return api_key.strip()


def ensure_credentials_json() -> Path:
    """
    credentials.json の存在と形式を確認する。
    Google Sheets 連携時に必要。
    """
    if not CREDENTIALS_PATH.exists():
        raise ConfigurationError(
            f"credentials.json が見つかりません。{CREDENTIALS_PATH} に配置してください。"
        )
    try:
        with open(CREDENTIALS_PATH, "r", encoding="utf-8") as f:
            json.load(f)
    except json.JSONDecodeError as e:
        raise ConfigurationError(
            f"credentials.json の形式が不正です。JSON として読み込めません: {e}"
        )
    return CREDENTIALS_PATH


# =============================================================================
# PubMed API 連携
# =============================================================================
def search_pubmed(keyword: str, max_results: int = 3) -> list[str]:
    """
    PubMed API でキーワード検索し、上位 max_results 件の PMID を取得する。

    Args:
        keyword: 検索キーワード
        max_results: 取得件数

    Returns:
        PMID のリスト（例: ["12345678", "87654321"]）
    """
    base_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
    params = {
        "db": "pubmed",
        "term": keyword,
        "retmax": max_results,
        "retmode": "json",
    }
    url = f"{base_url}esearch.fcgi"

    try:
        response = requests.get(
            url,
            params=params,
            headers={"User-Agent": "PubMed-Nursing-Summary/2.0"},
            timeout=30,
            verify=False,
        )
        response.raise_for_status()
        data = response.json()
    except requests.exceptions.RequestException as e:
        raise PubMedError(
            f"PubMed 検索でエラーが発生しました: {e}\n"
            "→ インターネット接続を確認してください。"
        )

    esearch_result = data.get("esearchresult", {})
    idlist = esearch_result.get("idlist", [])

    return idlist


def has_substantive_abstract(abstract: str) -> bool:
    """
    抄録が実質的に存在するか判定する。
    空・空白のみ・パース失敗時のプレースホルダーは False。
    """
    if not abstract or not str(abstract).strip():
        return False
    s = abstract.strip()
    if s == "(抄録なし)":
        return False
    # 極端に短いものは抄録として不十分とみなす
    if len(s) < 15:
        return False
    return True


def search_pubmed_with_abstract_only(
    keyword: str,
    want: int,
    candidate_max: int | None = None,
) -> list[str]:
    """
    PubMed をキーワード検索し、抄録（abstract）が存在する論文の PMID を
    最大 want 件まで返す。抄録が空の論文はスキップする。

    Args:
        keyword: 検索語
        want: 欲しい件数
        candidate_max: esearch で取得する候補 PMID の上限（省略時は PUBMED_SEARCH_CANDIDATE_MAX）

    Returns:
        抄録ありの PMID のリスト（want 件未満の場合あり）
    """
    cap = candidate_max if candidate_max is not None else PUBMED_SEARCH_CANDIDATE_MAX
    idlist = search_pubmed(keyword, max_results=cap)
    if not idlist:
        return []

    picked: list[str] = []
    for pmid in idlist:
        if len(picked) >= want:
            break
        try:
            title, abstract = fetch_pubmed_record(pmid)
        except PubMedError as e:
            print(f"      PMID {pmid}: 取得失敗のためスキップ — {e}", file=sys.stderr)
            continue

        if not has_substantive_abstract(abstract):
            print(f"      PMID {pmid}: 抄録なしのためスキップ")
            continue

        picked.append(pmid)

    return picked


def fetch_pubmed_raw(pubmed_id: str) -> str:
    """
    PubMed API で文献情報をテキスト形式で取得する。
    戻り値は PubMed の標準テキスト形式（citation + title + authors + abstract）。
    """
    base_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
    params = {
        "db": "pubmed",
        "id": pubmed_id,
        "retmode": "text",
        "rettype": "abstract",
    }
    url = f"{base_url}efetch.fcgi"

    try:
        response = requests.get(
            url,
            params=params,
            headers={"User-Agent": "PubMed-Nursing-Summary/2.0"},
            timeout=30,
            verify=False,
        )
        response.raise_for_status()
        text = response.text
    except requests.exceptions.HTTPError as e:
        raise PubMedError(
            f"PubMed API で HTTP エラーが発生しました (PMID: {pubmed_id}): "
            f"ステータス {e.response.status_code} - {e.response.reason}"
        )
    except requests.exceptions.ConnectionError as e:
        raise PubMedError(
            f"PubMed API に接続できませんでした (PMID: {pubmed_id}): {e}\n"
            "→ インターネット接続を確認してください。"
        )
    except requests.exceptions.Timeout:
        raise PubMedError(
            f"PubMed API がタイムアウトしました (PMID: {pubmed_id})。\n"
            "→ しばらく待って再試行してください。"
        )

    if not text or not text.strip():
        raise PubMedError(
            f"PubMed ID {pubmed_id} の文献が見つかりません。\n"
            "→ PMID が正しいか確認してください。"
        )
    return text.strip()


def parse_title_and_abstract(raw_text: str) -> tuple[str, str]:
    """
    PubMed のテキスト形式から「タイトル」と「抄録（abstract）」を抽出する。
    """
    title = ""
    abstract = ""

    if "Author information:" in raw_text:
        before_auth, after_auth = raw_text.split("Author information:", 1)
        lines = after_auth.split("\n")
        abstract_lines = []
        in_abstract = False
        for line in lines:
            stripped = line.strip()
            if re.match(r"^(DOI|PMID|PMCID|Conflict of interest):", stripped, re.I):
                break
            if re.match(r"^\(\d+\)", stripped):
                continue
            if stripped:
                in_abstract = True
            if in_abstract and stripped:
                abstract_lines.append(stripped)
        abstract = " ".join(abstract_lines)

        before_lines = before_auth.strip().split("\n")
        title_parts = []
        skip_pattern = re.compile(
            r"^\d+\.\s|"
            r"^.*\bdoi:\s|"
            r"^(Online ahead of print|Epub)\.?$|"
            r"^[A-Z][a-z]+ [A-Z]\(|"
        )
        for line in before_lines:
            s = line.strip()
            if not s:
                continue
            if skip_pattern.match(s) or re.match(r"^[A-Z][a-z]+\s+[A-Z]", s):
                break
            title_parts.append(s)
        title = " ".join(title_parts) if title_parts else ""
    else:
        abstract = raw_text
        title = "(タイトル取得なし)"

    if not abstract.strip():
        abstract = "(抄録なし)"

    return (title or "(タイトル取得なし)"), abstract


def fetch_pubmed_record(pubmed_id: str) -> tuple[str, str]:
    """
    PubMed からタイトルと abstract を取得する。
    戻り値: (title, abstract)
    """
    raw = fetch_pubmed_raw(pubmed_id)
    return parse_title_and_abstract(raw)


# =============================================================================
# OpenAI API 連携
# =============================================================================
def _call_openai(
    api_key: str,
    system_prompt: str,
    user_content: str,
    temperature: float = 0.3,
) -> str:
    """
    OpenAI Chat API を呼び出して応答テキストを返す。
    """
    url = "https://api.openai.com/v1/chat/completions"
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        "temperature": temperature,
    }
    data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=60, context=ctx) as response:
            result = json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        try:
            err_data = json.loads(body)
            msg = err_data.get("error", {}).get("message", body)
        except json.JSONDecodeError:
            msg = body or str(e)

        if e.code == 401:
            raise OpenAIError(
                "OpenAI API キーが正しくありません。\n"
                "→ main.py の OPENAI_API_KEY を確認してください。"
            )
        if e.code == 429:
            raise OpenAIError(
                "OpenAI API のレート制限に達しました。\n"
                "→ しばらく待ってから再試行してください。"
            )
        if e.code == 500:
            raise OpenAIError(
                "OpenAI サーバーでエラーが発生しました。\n"
                "→ しばらく待ってから再試行してください。"
            )
        raise OpenAIError(f"OpenAI API エラー (HTTP {e.code}): {msg}")

    except urllib.error.URLError as e:
        raise OpenAIError(
            f"OpenAI API に接続できませんでした: {e.reason}\n"
            "→ インターネット接続を確認してください。"
        )
    except TimeoutError:
        raise OpenAIError(
            "OpenAI API がタイムアウトしました。\n"
            "→ しばらく待って再試行してください。"
        )
    except json.JSONDecodeError as e:
        raise OpenAIError(f"OpenAI の応答が不正です: {e}")

    choices = result.get("choices", [])
    if not choices:
        raise OpenAIError("OpenAI が応答を返しませんでした。")
    content = choices[0].get("message", {}).get("content", "")
    if not content:
        raise OpenAIError("OpenAI の応答が空でした。")
    return content.strip()


def summarize_with_openai(abstract: str, api_key: str) -> str:
    """
    abstract（抄録）を元に、OpenAI で日本語要約を生成する。
    """
    system_prompt = (
        "あなたは看護・医療文献の要約専門家です。"
        "英文の抄録（abstract）を日本語で簡潔に要約してください。"
        "専門用語は必要に応じてカタカナで、重要ポイントを箇条書きでまとめてください。"
    )
    user_content = f"以下の PubMed 抄録を日本語で要約してください。\n\n{abstract}"
    return _call_openai(api_key, system_prompt, user_content, temperature=0.3)


def generate_x_post(title: str, summary: str, api_key: str) -> str:
    """
    タイトルと要約を元に、X（Twitter）用の投稿文を生成する。
    """
    system_prompt = (
        "あなたは看護・医療の情報発信を支援するアシスタントです。"
        "文献のタイトルと日本語要約を元に、X（旧Twitter）用の投稿文を作成してください。"
        "・280文字以内"
        "・看護師・医療従事者が興味を持つような書き出し"
        "・重要なポイントを簡潔に伝える"
        "・ハッシュタグは必要に応じて1〜2個程度"
        "・改行は使ってよい"
        "・投稿文のみを出力（説明や前置きは不要）"
    )
    user_content = (
        f"以下の文献について、X投稿文を作成してください。\n\n"
        f"【タイトル】\n{title}\n\n【要約】\n{summary}"
    )
    return _call_openai(api_key, system_prompt, user_content, temperature=0.5)


# =============================================================================
# Google Sheets 連携
# =============================================================================
def write_result_to_sheets(
    pmid: str,
    title: str,
    abstract: str,
    summary: str,
    x_post: str,
) -> None:
    """
    処理結果をスプレッドシートに1行追加する。
    列: retrieved_at, pmid, title, abstract, summary, x_post, approved, posted
    環境変数 GOOGLE_SHEETS_SPREADSHEET_ID でスプレッドシートを指定。
    """
    if not CREDENTIALS_PATH.exists():
        return
    if not os.environ.get("GOOGLE_SHEETS_SPREADSHEET_ID"):
        print("[Sheets] GOOGLE_SHEETS_SPREADSHEET_ID 未設定のためスキップ", file=sys.stderr)
        return

    try:
        import traceback
        from sheets_loader import append_row_to_sheets
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        row = [now, pmid, title, abstract, summary, x_post, "", ""]
        append_row_to_sheets(row)
    except ImportError:
        print(
            "[注意] Sheets への書き込みには gspread 等が必要です。\n"
            "  pip install -r requirements.txt",
            file=sys.stderr,
        )
    except Exception as e:
        print(f"[Sheets 書き込みエラー] {e}", file=sys.stderr)
        traceback.print_exc()


# =============================================================================
# X (Twitter) 投稿
# =============================================================================
def _has_x_credentials() -> bool:
    """X API 認証情報が設定されているか"""
    return all([
        X_API_KEY and str(X_API_KEY).strip(),
        X_API_SECRET and str(X_API_SECRET).strip(),
        X_ACCESS_TOKEN and str(X_ACCESS_TOKEN).strip(),
        X_ACCESS_TOKEN_SECRET and str(X_ACCESS_TOKEN_SECRET).strip(),
    ])


def post_tweet_to_x(text: str) -> None:
    """
    x_post の内容を X (Twitter) に投稿する。
    tweepy を使用。
    """
    if not _has_x_credentials():
        raise XPostError(
            "X API 認証情報が未設定です。main.py の X_API_KEY, X_API_SECRET, "
            "X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET を設定してください。"
        )

    try:
        import tweepy
    except ImportError:
        raise XPostError("tweepy がインストールされていません。pip install tweepy")

    client = tweepy.Client(
        consumer_key=X_API_KEY,
        consumer_secret=X_API_SECRET,
        access_token=X_ACCESS_TOKEN,
        access_token_secret=X_ACCESS_TOKEN_SECRET,
    )
    response = client.create_tweet(text=text[:280])  # 280文字制限
    if not response or not response.data:
        raise XPostError("X への投稿に失敗しました。")


def run_x_posting() -> int:
    """
    approved=TRUE かつ posted=FALSE の行を取得し、x_post を X に投稿する。
    投稿後、posted 列を TRUE に更新。一度投稿したものは再投稿しない。

    Returns:
        投稿した件数
    """
    if not CREDENTIALS_PATH.exists() or not os.environ.get("GOOGLE_SHEETS_SPREADSHEET_ID"):
        return 0
    if not _has_x_credentials():
        return 0

    try:
        from sheets_loader import get_pending_x_posts, update_posted_to_true
    except ImportError:
        return 0

    pending = get_pending_x_posts()
    if not pending:
        print("\n[X 投稿] 投稿待ちの行はありません。（approved=TRUE かつ posted=FALSE の行）")
        return 0

    print(f"\n[X 投稿] 投稿待ち {len(pending)} 件を X に投稿します...")
    posted_count = 0

    for item in pending:
        row_num = item["row_number"]
        x_post = item["x_post"]
        print(f"  [{row_num}行目] 投稿中...")
        try:
            post_tweet_to_x(x_post)
            update_posted_to_true(row_num)
            posted_count += 1
            print(f"  [{row_num}行目] 投稿完了。posted を TRUE に更新しました。")
        except Exception as e:
            print(f"  [{row_num}行目] 投稿失敗: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc()

    if posted_count > 0:
        print(f"\n[X 投稿] {posted_count} 件の投稿が完了しました。")
    return posted_count


# =============================================================================
# メイン処理
# =============================================================================
def process_one_pmid(pmid: str, api_key: str, write_to_sheets: bool) -> bool:
    """
    1件の PMID について、取得→要約→x_post まで実行する。
    成功時は True、失敗時は False。
    """
    print(f"\n--- PMID: {pmid} ---")

    try:
        # 1. PubMed からタイトルと abstract を取得
        print("[1/4] PubMed から文献を取得中...")
        title, abstract = fetch_pubmed_record(pmid)
        print(f"      タイトル: {title[:80]}{'...' if len(title) > 80 else ''}")
        if len(abstract) > 200:
            print(f"      抄録: {abstract[:200]}...")
        else:
            print(f"      抄録: {abstract}")

        # 2. abstract を元に日本語要約を生成
        print("[2/4] 日本語要約を生成中...")
        summary = summarize_with_openai(abstract, api_key)
        print(f"[日本語要約]\n{summary}\n")

        # 3. X投稿文を生成
        print("[3/4] X投稿文を生成中...")
        x_post = generate_x_post(title, summary, api_key)
        print(f"[X投稿文]\n{x_post}\n")

        # 4. Google Sheets に書き込み
        if write_to_sheets:
            print("[4/4] Google Sheets に書き込み中...")
            write_result_to_sheets(pmid, title, abstract, summary, x_post)
            print("      書き込み完了。")
        else:
            print("[4/4] Sheets 書き込みはスキップ（credentials.json または GOOGLE_SHEETS_SPREADSHEET_ID なし）")

        return True

    except PubMedError as e:
        print("\n[PubMed エラー] 文献の取得に失敗しました。", file=sys.stderr)
        print(f"  詳細: {e}", file=sys.stderr)
        return False

    except OpenAIError as e:
        print("\n[OpenAI エラー] 要約または X投稿文の生成に失敗しました。", file=sys.stderr)
        print(f"  詳細: {e}", file=sys.stderr)
        return False

    except Exception as e:
        print("\n[予期せぬエラー] 処理中にエラーが発生しました。", file=sys.stderr)
        print(f"  種類: {type(e).__name__}: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return False


def main() -> int:
    """
    メインエントリポイント。
    引数なしで実行。PubMed で「訪問看護」関連論文を検索し、上位3件を処理して Sheets に追記。
    """
    print("PubMed 訪問看護文献 自動要約スクリプト")
    print(f"検索キーワード: {PUBMED_SEARCH_KEYWORD}")
    print(f"取得件数: 上位 {PUBMED_TOP_N} 件\n")

    # API キー取得
    try:
        api_key = get_openai_api_key()
    except ConfigurationError as e:
        print("[エラー] 設定に問題があります。", file=sys.stderr)
        print(f"  詳細: {e}", file=sys.stderr)
        return 1

    # PubMed でキーワード検索し、抄録ありの論文を最大 N 件まで取得
    print(f"[0/4] PubMed で「{PUBMED_SEARCH_KEYWORD}」を検索中（抄録ありのみ）...")
    try:
        pubmed_ids = search_pubmed_with_abstract_only(
            PUBMED_SEARCH_KEYWORD, want=PUBMED_TOP_N
        )
    except PubMedError as e:
        print(f"[PubMed 検索エラー] {e}", file=sys.stderr)
        return 1

    if not pubmed_ids:
        print(
            "[エラー] 抄録付きの論文が見つかりませんでした。"
            " 検索候補を増やす場合は PUBMED_SEARCH_CANDIDATE_MAX を大きくしてください。",
            file=sys.stderr,
        )
        return 1

    if len(pubmed_ids) < PUBMED_TOP_N:
        print(
            f"      注意: 抄録ありは {len(pubmed_ids)} 件のみ（目標 {PUBMED_TOP_N} 件）",
            file=sys.stderr,
        )

    print(f"      処理対象 PMID（抄録あり）: {pubmed_ids}\n")

    # Sheets 書き込みの可否
    write_to_sheets = CREDENTIALS_PATH.exists() and bool(os.environ.get("GOOGLE_SHEETS_SPREADSHEET_ID"))

    # 各 PMID を処理
    success_count = 0
    for pmid in pubmed_ids:
        if process_one_pmid(pmid, api_key, write_to_sheets):
            success_count += 1

    # 完了メッセージ
    if success_count == len(pubmed_ids):
        print(f"\n完了: {success_count} 件すべて成功しました。")
    else:
        failed = len(pubmed_ids) - success_count
        print(f"\n完了: {success_count} 件成功、{failed} 件失敗しました。", file=sys.stderr)

    # approved=TRUE かつ posted=FALSE の行を X に投稿
    run_x_posting()

    return 0 if success_count == len(pubmed_ids) else 1


if __name__ == "__main__":
    sys.exit(main())
