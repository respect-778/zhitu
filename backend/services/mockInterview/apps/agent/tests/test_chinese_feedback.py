from deepinterview_agent.coach.prompts import study_module_prompts
from deepinterview_agent.core.adapters.mock import build_mock
from deepinterview_agent.post.prompts import (
    evaluate_answer_prompts,
    language_coach_prompts,
    model_answer_prompts,
    report_summary_prompts,
    verify_score_prompts,
)
from deepinterview_agent.prep.prompts import (
    company_research_prompts,
    cv_analysis_prompts,
    gap_matching_prompts,
    jd_analysis_prompts,
    question_planner_prompts,
)
from deepinterview_agent.shared_models import InterviewContext


def test_all_feedback_builders_request_chinese_and_preserve_contract_fields():
    ctx = build_mock(InterviewContext)
    question = ctx.plan.questions[0]
    prompts = [
        cv_analysis_prompts("Resume"),
        jd_analysis_prompts("Job description", "Example"),
        company_research_prompts("Example", "Notes"),
        gap_matching_prompts(ctx.candidate, ctx.job),
        question_planner_prompts(
            ctx.candidate, ctx.job, ctx.company, ctx.gap, ctx.plan.language_mode
        ),
        evaluate_answer_prompts(question, "Answer"),
        verify_score_prompts("Communication", "Evidence", 3),
        language_coach_prompts("Answer", "zh"),
        model_answer_prompts(question, ctx.candidate, "Answer"),
        report_summary_prompts(ctx, "Communication 3/5", 3),
        study_module_prompts("Communication", "Evidence", "solid"),
    ]
    for system, _ in prompts:
        assert "简体中文" in system
        assert "枚举值" in system
        assert "en 字段" in system
