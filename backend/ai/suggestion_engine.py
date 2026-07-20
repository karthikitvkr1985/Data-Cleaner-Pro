"""AI suggestion engine — Anthropic API for NL command parsing and preview."""
from __future__ import annotations

import json
import re
import uuid

import pandas as pd

from backend.models.schemas import ColumnProfile, NLCommandPreview


def get_nl_preview(
    instruction: str,
    df: pd.DataFrame,
    columns: list[ColumnProfile],
) -> NLCommandPreview:
    """Parse an NL instruction into a structured intent and return a preview."""
    from backend.config import ANTHROPIC_API_KEY

    if not ANTHROPIC_API_KEY:
        return _rule_based_preview(instruction, df, columns)

    try:
        return _anthropic_preview(instruction, df, columns)
    except Exception as e:
        print(f"[AI] Anthropic error: {e}, falling back to rule-based")
        return _rule_based_preview(instruction, df, columns)


def apply_nl_intent(df: pd.DataFrame, intent: dict) -> pd.DataFrame:
    """Apply a parsed NL intent to the dataframe."""
    action = intent.get("action", "")
    df = df.copy()

    try:
        if action == "split_column":
            source = intent.get("source")
            targets = intent.get("targets", [])
            delimiter = intent.get("delimiter", " ")
            if source and source in df.columns and targets:
                split = df[source].astype(str).str.split(delimiter, n=len(targets) - 1, expand=True)
                for i, t in enumerate(targets):
                    df[t] = split[i] if i < split.shape[1] else ""

        elif action == "filter_rows":
            col = intent.get("column")
            op = intent.get("operator", "eq")
            val = intent.get("value")
            if col and col in df.columns and val is not None:
                if op in ("eq", "equals", "is"):
                    df = df[df[col].astype(str) != str(val)]
                elif op in ("neq", "not_equals", "is_not"):
                    df = df[df[col].astype(str) == str(val)]
                elif op == "contains":
                    df = df[~df[col].astype(str).str.contains(str(val), case=False, na=False)]
                elif op == "lt":
                    df = df[pd.to_numeric(df[col], errors="coerce") >= float(val)]
                elif op == "gt":
                    df = df[pd.to_numeric(df[col], errors="coerce") <= float(val)]

        elif action == "rename_column":
            old = intent.get("old_name")
            new = intent.get("new_name")
            if old and new and old in df.columns:
                df = df.rename(columns={old: new})

        elif action == "drop_column":
            col = intent.get("column")
            if col and col in df.columns:
                df = df.drop(columns=[col])

        elif action == "fill_nulls":
            col = intent.get("column")
            value = intent.get("value", "")
            strategy = intent.get("strategy", "constant")
            if col and col in df.columns:
                if strategy == "mean":
                    df[col] = df[col].fillna(pd.to_numeric(df[col], errors="coerce").mean())
                elif strategy == "median":
                    df[col] = df[col].fillna(pd.to_numeric(df[col], errors="coerce").median())
                elif strategy == "mode":
                    mode = df[col].mode()
                    df[col] = df[col].fillna(mode.iloc[0] if not mode.empty else value)
                elif strategy == "ffill":
                    df[col] = df[col].ffill()
                else:
                    df[col] = df[col].fillna(value)

        elif action == "convert_type":
            col = intent.get("column")
            to_type = intent.get("to_type", "string")
            if col and col in df.columns:
                if to_type in ("integer", "int"):
                    df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int64")
                elif to_type in ("float", "number"):
                    df[col] = pd.to_numeric(df[col], errors="coerce")
                elif to_type == "string":
                    df[col] = df[col].astype(str)
                elif to_type == "datetime":
                    df[col] = pd.to_datetime(df[col], errors="coerce")

        elif action == "standardize_case":
            col = intent.get("column")
            case = intent.get("case", "title")
            if col and col in df.columns:
                if case == "upper":
                    df[col] = df[col].astype(str).str.upper()
                elif case == "lower":
                    df[col] = df[col].astype(str).str.lower()
                else:
                    df[col] = df[col].astype(str).str.title()

        elif action == "strip_whitespace":
            col = intent.get("column")
            if col and col in df.columns:
                df[col] = df[col].astype(str).str.strip()
            elif intent.get("all_columns"):
                for c in df.select_dtypes(include="object").columns:
                    df[c] = df[c].astype(str).str.strip()

        elif action == "deduplicate":
            key_cols = intent.get("key_columns")
            if key_cols:
                key_cols = [c for c in key_cols if c in df.columns]
                df = df.drop_duplicates(subset=key_cols, keep="first") if key_cols else df.drop_duplicates(keep="first")
            else:
                df = df.drop_duplicates(keep="first")

    except Exception as e:
        print(f"[AI] apply_nl_intent error: {e}")

    return df


def _build_sample(df: pd.DataFrame) -> list[dict]:
    sample = df.head(3).fillna("").astype(str)
    return sample.to_dict(orient="records")


def _anthropic_preview(
    instruction: str,
    df: pd.DataFrame,
    columns: list[ColumnProfile],
) -> NLCommandPreview:
    import anthropic as anthropic_sdk

    from backend.config import ANTHROPIC_API_KEY

    col_info = [
        {"name": c.name, "type": c.inferred_type, "sample": c.sample_values[:3]}
        for c in columns
    ]
    sample_rows = _build_sample(df)

    system_prompt = """You are a data cleaning assistant. Parse natural language instructions into structured JSON intents.

Available actions:
- split_column: {action, source, targets: [], delimiter}
- filter_rows: {action, column, operator: "eq|neq|contains|lt|gt", value} — removes matching rows
- rename_column: {action, old_name, new_name}
- drop_column: {action, column}
- fill_nulls: {action, column, strategy: "constant|mean|median|mode|ffill", value?}
- convert_type: {action, column, to_type: "integer|float|string|datetime"}
- standardize_case: {action, column, case: "upper|lower|title"}
- strip_whitespace: {action, column?, all_columns?: true}
- deduplicate: {action, key_columns?: []}

If unclear, set clarification_needed to a question string and action to "clarify".
Respond with ONLY valid JSON: {intent: {...}, description: "...", clarification_needed: null | "..."}"""

    user_msg = f"""Columns: {json.dumps(col_info)}
Sample data: {json.dumps(sample_rows)}
Instruction: {instruction}"""

    client = anthropic_sdk.Anthropic(api_key=ANTHROPIC_API_KEY)
    message = client.messages.create(
        model="claude-3-haiku-20240307",
        max_tokens=512,
        system=system_prompt,
        messages=[{"role": "user", "content": user_msg}],
    )

    raw = message.content[0].text.strip()
    # Extract JSON from response
    json_match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not json_match:
        raise ValueError("No JSON in response")

    parsed = json.loads(json_match.group(0))
    intent = parsed.get("intent", {})
    description = parsed.get("description", instruction)
    clarification = parsed.get("clarification_needed")

    return _build_preview(intent, description, clarification, df)


def _rule_based_preview(
    instruction: str,
    df: pd.DataFrame,
    columns: list[ColumnProfile],
) -> NLCommandPreview:
    """Simple rule-based NL parsing when Anthropic is unavailable."""
    lower = instruction.lower()
    col_names = [c.name for c in columns]
    intent: dict = {}
    description = instruction

    # Split column detection
    split_match = re.search(r"""split\s+['"]?(\w[\w\s]*)['"]?\s+(?:by|on|using|into)\s+(.+)""", lower)
    if split_match:
        source = _find_col(split_match.group(1).strip(), col_names)
        delimiter_part = split_match.group(2).strip()
        delimiter = " " if "space" in delimiter_part else (
            "," if "comma" in delimiter_part else
            "-" if "hyphen" in delimiter_part else " "
        )
        if source:
            # Guess target names from instruction or use First/Last
            targets_match = re.findall(r"""['"](\w[\w\s]*)['"]""", instruction)
            targets = targets_match if len(targets_match) >= 2 else [source + "_1", source + "_2"]
            intent = {"action": "split_column", "source": source, "targets": targets[:2], "delimiter": delimiter}
            description = f"Split '{source}' into {targets} by '{delimiter}'"

    # Filter/remove rows
    elif re.search(r"(remove|delete|filter|drop)\s+rows?\s+where", lower):
        col_match = re.search(r"""where\s+['"]?(\w[\w\s]*)['"]?\s+(is|equals?|=|contains?)\s+['"]?([^'"]+)['"]?""", lower)
        if col_match:
            col = _find_col(col_match.group(1).strip(), col_names)
            op_word = col_match.group(2).strip()
            val = col_match.group(3).strip()
            op = "contains" if "contain" in op_word else "eq"
            if col:
                intent = {"action": "filter_rows", "column": col, "operator": op, "value": val}
                description = f"Remove rows where '{col}' {op} '{val}'"

    # Rename column
    elif re.search(r"""rename\s+['"]?(\w[\w\s]*)['"]?\s+to\s+['"]?(\w[\w\s]*)['"]?""", lower):
        m = re.search(r"""rename\s+['"]?(\w[\w\s]*)['"]?\s+to\s+['"]?(\w[\w\s]*)['"]?""", lower)
        if m:
            old = _find_col(m.group(1).strip(), col_names)
            new = m.group(2).strip()
            if old:
                intent = {"action": "rename_column", "old_name": old, "new_name": new}
                description = f"Rename '{old}' to '{new}'"

    # Fill nulls
    elif re.search(r"fill\s+(null|missing|empty|blank|na)", lower):
        col_found = _find_col_in_text(lower, col_names)
        strategy = "mean" if "mean" in lower else ("median" if "median" in lower else
                   "mode" if "mode" in lower else "constant")
        val_match = re.search(r"""with\s+['"]?([^'"]+)['"]?$""", lower)
        val = val_match.group(1).strip() if val_match else "0"
        intent = {
            "action": "fill_nulls",
            "column": col_found or (col_names[0] if col_names else ""),
            "strategy": strategy,
            "value": val,
        }
        description = f"Fill missing values in '{intent.get('column')}' ({strategy})"

    # Deduplicate
    elif re.search(r"(dedup|deduplicate|remove\s+dup|drop\s+dup)", lower):
        intent = {"action": "deduplicate"}
        description = "Remove duplicate rows"

    # Standardize case
    elif re.search(r"(upper|lower|title)\s*case", lower):
        case = "upper" if "upper" in lower else ("lower" if "lower" in lower else "title")
        col_found = _find_col_in_text(lower, col_names)
        intent = {
            "action": "standardize_case",
            "column": col_found or (col_names[0] if col_names else ""),
            "case": case,
        }
        description = f"Standardize '{intent.get('column')}' to {case} case"

    # Strip whitespace
    elif re.search(r"strip\s+(whitespace|spaces?|trim)", lower):
        col_found = _find_col_in_text(lower, col_names)
        intent = {
            "action": "strip_whitespace",
            "column": col_found,
            "all_columns": col_found is None,
        }
        description = f"Strip whitespace from {'all columns' if not col_found else col_found}"

    else:
        # Unknown — ask for clarification
        return NLCommandPreview(
            preview_id=str(uuid.uuid4()),
            description=instruction,
            intent={"action": "clarify"},
            sample_before=[],
            sample_after=[],
            affected_count=0,
            clarification_needed=(
                "I couldn't understand that instruction. Try something like: "
                "'split Full Name into First Name and Last Name by space', "
                "'remove rows where Status is cancelled', or "
                "'fill missing values in Revenue with 0'."
                " (Set ANTHROPIC_API_KEY for smarter parsing.)"
            ),
        )

    return _build_preview(intent, description, None, df)


def _find_col(query: str, col_names: list[str]) -> str | None:
    q_lower = query.lower()
    for col in col_names:
        if col.lower() == q_lower:
            return col
    for col in col_names:
        if q_lower in col.lower() or col.lower() in q_lower:
            return col
    return None


def _find_col_in_text(text: str, col_names: list[str]) -> str | None:
    for col in col_names:
        if col.lower() in text:
            return col
    return None


def _build_preview(
    intent: dict,
    description: str,
    clarification: str | None,
    df: pd.DataFrame,
) -> NLCommandPreview:
    sample_before = _build_sample(df)
    sample_after: list[dict] = []
    affected_count = 0

    if intent.get("action") not in ("clarify", None):
        try:
            df_after = apply_nl_intent(df, intent)
            sample_after = _build_sample(df_after)
            affected_count = abs(len(df) - len(df_after)) or min(len(df), 10)
        except Exception:
            sample_after = sample_before

    return NLCommandPreview(
        preview_id=str(uuid.uuid4()),
        description=description,
        intent=intent,
        sample_before=sample_before,
        sample_after=sample_after,
        affected_count=affected_count,
        clarification_needed=clarification,
    )
