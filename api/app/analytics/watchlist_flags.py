def flags(ratios: dict) -> list[dict]:
    result = []
    for key, threshold, below, label in [('current_ratio', 1, True, 'Thanh khoản ngắn hạn'),
                                        ('cfo_net_income', .8, True, 'Chất lượng lợi nhuận'),
                                        ('debt_equity', 2, False, 'Đòn bẩy tài chính'),
                                        ('profit_growth', 0, True, 'Lợi nhuận suy giảm')]:
        value = ratios.get(key)
        if value is not None and ((value < threshold) if below else (value > threshold)):
            result.append({'name': label, 'indicator': key, 'current_value': value,
                           'warning_threshold': threshold, 'operator': '<' if below else '>',
                           'why': 'Vượt ngưỡng theo dõi cấu hình; cần đọc BCTC gốc để đánh giá.',
                           'time_window': 'Kỳ gần nhất / TTM', 'severity': 'medium'})
    return result
