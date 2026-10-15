from typing import Any

from app.models import DataField


def reconcile(field: str, candidates: list[dict[str, Any]], threshold: float, unit: str = 'VND') -> DataField:
    available = [c for c in candidates if c.get('value') is not None]
    if not available:
        return DataField(field=field, unit=unit, note='Không có dữ liệu')
    chosen = available[0]
    # Different periods are retained for inspection, but must not trigger numerical comparison.
    comparable = [c for c in available[1:] if chosen.get('period') and c.get('period') == chosen.get('period')
                  and c.get('scope', 'unknown') == chosen.get('scope', 'unknown')]
    value = chosen['value']
    discrepancy = any(isinstance(value, (int, float)) and isinstance(c['value'], (int, float))
                      and abs(value-c['value']) > threshold * max(abs(value), 1e-12) for c in comparable)
    return DataField(field=field, unit=unit, value=value, period=chosen.get('period'),
                     scope=chosen.get('scope', 'unknown'), chosen_source=chosen['source'],
                     source_url=chosen.get('url'), alternates=available[1:], discrepancy=discrepancy,
                     note=chosen.get('note'))
