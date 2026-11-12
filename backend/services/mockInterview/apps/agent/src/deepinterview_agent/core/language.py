"""Shared language policy for candidate-facing preparation and feedback."""

CHINESE_RESPONSE_INSTRUCTIONS = (
    "\n面向用户的岗位描述、能力名称、摘要、解释、评价、建议、学习计划和参考回答，"
    "统一使用自然、完整的简体中文。保留产品名、编程语言名称和代码的原始写法。"
    "JSON 字段名、枚举值、标识符、URL 和数值遵循原契约。"
    "LocalizedText 对象中的 en 字段仍使用英文，zh 字段使用简体中文。"
)
