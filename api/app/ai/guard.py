import math
import re
import unicodedata

from pydantic import BaseModel

FORBIDDEN = ['chắc chắn tăng', 'nên mua ngay', 'đảm bảo sinh lời', 'không có rủi ro', 'chắc chắn sinh lời']


def validate_vietnamese(output: BaseModel) -> None:
    """Reject unaccented/English comparison prose; evidence identifiers stay unchanged."""
    for section in ('summary', 'strengths', 'weaknesses', 'risks'):
        for claim in getattr(output, section, []):
            content = unicodedata.normalize('NFD', claim.text)
            if not any(unicodedata.combining(c) for c in content) and 'đ' not in content.lower():
                raise ValueError('Comparison prose must be Vietnamese')


def numbers(text: str, source_locale: bool = False) -> list[float]:
    result = []
    for token in re.findall(r'(?<![\w/])-?\d+(?:[.,]\d+)*(?:[eE][+-]?\d+)?', text):
        try:
            if source_locale and '.' in token and ',' in token:
                # Public news mixes Vietnamese and English separators; the final separator is decimal.
                decimal, grouping = (',', '.') if token.rfind(',') > token.rfind('.') else ('.', ',')
                result.append(float(token.replace(grouping, '').replace(decimal, '.')))
            elif source_locale and token.count('.')+token.count(',') > 1:
                parts = re.split(r'[.,]', token)
                if all(len(p) == 3 for p in parts[1:]):
                    result.append(float(''.join(parts)))
            else:
                result.append(float(token.replace(',', '.')))
                if source_locale and re.fullmatch(r'-?[1-9]\d{0,2}[.,]\d{3}', token):
                    result.append(float(token.replace('.', '').replace(',', '')))
        except ValueError:
            if source_locale:
                continue
            raise ValueError('Ambiguous numeric format in AI output')
    return result


def validate_output(output: BaseModel, facts: dict, evidence: set[str]) -> None:
    raw = output.model_dump()
    allowed_numbers: list[float] = []
    def collect(value):
        if isinstance(value, dict):
            for item in value.values():
                collect(item)
        elif isinstance(value, list):
            for item in value:
                collect(item)
        elif isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value):
            allowed_numbers.append(float(value))
        elif isinstance(value, str):
            allowed_numbers.extend(numbers(value, source_locale=True))
    collect(facts)
    def visit(value):
        if isinstance(value, dict):
            if 'evidence' in value and (not value['evidence'] or any(e not in evidence for e in value['evidence'])):
                raise ValueError('Unknown AI evidence')
            for key, item in value.items():
                if key != 'evidence':
                    visit(item)
        elif isinstance(value, list):
            for item in value:
                visit(item)
        elif isinstance(value, str):
            if any(word in value.lower() for word in FORBIDDEN):
                raise ValueError('Absolute investment recommendation')
            for number in numbers(value):
                if not any(math.isclose(number, n, rel_tol=.005, abs_tol=.005) for n in allowed_numbers):
                    raise ValueError('Unsupported number in AI output')
    visit(raw)
