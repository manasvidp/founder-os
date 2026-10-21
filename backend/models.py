from typing import Optional, List, Literal, Annotated
from pydantic import BaseModel, Field, StringConstraints, create_model, ConfigDict

from core import new_id

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
Text = Annotated[str, StringConstraints(max_length=20000)]
DateStr = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]
DateTimeStr = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}")]
TimeStr = Annotated[str, StringConstraints(pattern=r"^\d{2}:\d{2}$")]
MonthStr = Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}$")]
Domain = Literal["business", "personal"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Item(Strict):
    id: str = Field(default_factory=new_id)
    title: Title
    done: bool = False
    due_date: Optional[DateStr] = None


class GoalIn(Strict):
    title: Title
    description: Optional[Text] = None
    horizon: Literal["vision", "three_year", "annual", "quarter", "month", "week"] = "quarter"
    domain: Domain = "business"
    area: Optional[Short] = None
    parent_id: Optional[str] = None
    metric_name: Optional[Short] = None
    unit: Optional[Short] = None
    baseline: Optional[float] = None
    target: Optional[float] = None
    current: Optional[float] = None
    start_date: Optional[DateStr] = None
    due_date: Optional[DateStr] = None
    status: Literal["active", "achieved", "paused", "abandoned"] = "active"
    rationale: Optional[Text] = None
    change_note: Optional[Text] = None


class ProjectIn(Strict):
    title: Title
    description: Optional[Text] = None
    goal_id: Optional[str] = None
    domain: Domain = "business"
    status: Literal["planning", "active", "on_hold", "completed", "cancelled"] = "active"
    start_date: Optional[DateStr] = None
    due_date: Optional[DateStr] = None
    milestones: List[Item] = []
    change_note: Optional[Text] = None


class TaskIn(Strict):
    title: Title
    notes: Optional[Text] = None
    status: Literal["inbox", "todo", "in_progress", "waiting", "done"] = "inbox"
    priority: int = Field(3, ge=1, le=4)
    due_date: Optional[DateStr] = None
    scheduled_date: Optional[DateStr] = None
    scheduled_time: Optional[TimeStr] = None
    est_minutes: Optional[int] = Field(None, ge=0, le=1440)
    actual_minutes: Optional[int] = Field(None, ge=0, le=100000)
    project_id: Optional[str] = None
    goal_id: Optional[str] = None
    contact_id: Optional[str] = None
    domain: Domain = "business"
    top3_date: Optional[DateStr] = None
    delegated_to: Optional[Short] = None
    waiting_on: Optional[Short] = None
    recurrence: Literal["none", "daily", "weekly", "monthly"] = "none"
    blocked_by: List[str] = []
    subtasks: List[Item] = []
    completion_criteria: Optional[Text] = None
    outcome: Optional[Text] = None


class EventIn(Strict):
    title: Title
    start: DateTimeStr
    end: DateTimeStr
    domain: Domain = "business"
    kind: Literal["meeting", "focus", "personal", "travel", "other"] = "meeting"
    location: Optional[Short] = None
    contact_id: Optional[str] = None
    project_id: Optional[str] = None
    goal_id: Optional[str] = None
    prep_notes: Optional[Text] = None


class ContactIn(Strict):
    name: Title
    organisation: Optional[Short] = None
    role: Optional[Short] = None
    email: Optional[Short] = None
    phone: Optional[Short] = None
    linkedin: Optional[Short] = None
    kind: Literal["client", "prospect", "investor", "mentor", "founder", "collaborator", "supplier", "personal", "other"] = "prospect"
    domain: Domain = "business"
    stage: Literal["lead", "contacted", "meeting", "proposal", "won", "lost", "nurture"] = "lead"
    deal_value: Optional[float] = None
    tags: List[Short] = []
    communication_pref: Optional[Short] = None
    notes: Optional[Text] = None
    next_follow_up: Optional[DateStr] = None
    last_contacted: Optional[DateStr] = None


class InteractionIn(Strict):
    contact_id: str
    kind: Literal["call", "email", "meeting", "message", "event", "other"] = "meeting"
    date: DateStr
    summary: Title
    next_step: Optional[Short] = None
    next_step_date: Optional[DateStr] = None


class AccountIn(Strict):
    name: Title
    domain: Domain = "business"
    kind: Literal["bank", "cash", "savings", "credit", "investment"] = "bank"
    balance: float = 0


class TransactionIn(Strict):
    date: DateStr
    description: Title
    amount: float = Field(..., ge=0)
    direction: Literal["income", "expense"] = "expense"
    category: Short = "General"
    domain: Domain = "business"
    status: Literal["actual", "pending", "projected"] = "actual"
    account_id: Optional[str] = None
    contact_id: Optional[str] = None
    recurring: bool = False


class BudgetIn(Strict):
    domain: Domain = "business"
    category: Title
    month: MonthStr
    amount: float = Field(..., ge=0)


class HabitIn(Strict):
    name: Title
    area: Literal["health", "fitness", "sleep", "mind", "learning", "relationships", "creativity", "admin", "work", "other"] = "health"
    domain: Domain = "personal"
    target_per_week: int = Field(7, ge=1, le=7)
    routine: Literal["morning", "evening", "anytime"] = "anytime"
    active: bool = True


class NoteIn(Strict):
    title: Title
    body: Optional[Text] = None
    kind: Literal["note", "idea", "decision", "meeting", "journal", "learning"] = "note"
    domain: Domain = "business"
    project_id: Optional[str] = None
    goal_id: Optional[str] = None
    contact_id: Optional[str] = None
    decision: Optional[Text] = None
    rationale: Optional[Text] = None
    alternatives: Optional[Text] = None
    tags: List[Short] = []


class ReviewIn(Strict):
    kind: Literal["daily", "weekly", "monthly", "quarterly"] = "weekly"
    period_start: DateStr
    period_end: DateStr
    wins: Optional[Text] = None
    challenges: Optional[Text] = None
    lessons: Optional[Text] = None
    next_focus: Optional[Text] = None
    gratitude: Optional[Text] = None
    energy: Optional[int] = Field(None, ge=1, le=5)
    draft: bool = False
    stats: dict = {}


class AchievementIn(Strict):
    title: Title
    description: Optional[Text] = None
    kind: Literal["win", "milestone", "goal", "project", "badge", "personal"] = "win"
    domain: Domain = "business"
    date: DateStr


class BizIn(Strict):
    kind: Literal["product", "revenue_stream", "kpi", "procedure", "team_member", "risk", "decision", "opportunity", "meeting", "assumption"]
    title: Title
    description: Optional[Text] = None
    owner: Optional[Short] = None
    status: Optional[Short] = None
    goal_id: Optional[str] = None
    project_id: Optional[str] = None
    contact_id: Optional[str] = None
    unit: Optional[Short] = None
    baseline: Optional[float] = None
    target: Optional[float] = None
    current: Optional[float] = None
    amount: Optional[float] = None
    due_date: Optional[DateStr] = None
    cadence: Optional[Literal["daily", "weekly", "monthly", "quarterly", "ad_hoc"]] = None
    severity: Optional[Literal["low", "medium", "high"]] = None
    action_items: List[Item] = []


class ContentIn(Strict):
    title: Title
    format: Literal["linkedin_post", "article", "case_study", "lead_magnet", "newsletter", "other"] = "linkedin_post"
    status: Literal["idea", "drafting", "review", "approved", "scheduled", "published"] = "idea"
    pillar: Optional[Short] = None
    audience: Optional[Short] = None
    body: Optional[Text] = None
    cta: Optional[Short] = None
    campaign: Optional[Short] = None
    sources: Optional[Text] = None
    scheduled_date: Optional[DateStr] = None
    published_url: Optional[Short] = None
    goal_id: Optional[str] = None
    contact_id: Optional[str] = None
    source_content_id: Optional[str] = None
    ai_generated: bool = False
    impressions: Optional[int] = Field(None, ge=0)
    engagements: Optional[int] = Field(None, ge=0)
    leads: Optional[int] = Field(None, ge=0)


def make_update(model):
    fields = {k: (Optional[v.rebuild_annotation()], None) for k, v in model.model_fields.items() if k != "id"}
    return create_model(model.__name__ + "Update", __base__=Strict, **fields)


# name -> (collection, create model, default sort, title field)
ENTITIES = {
    "goals": ("goals", GoalIn, ("created_at", -1), "title"),
    "projects": ("projects", ProjectIn, ("created_at", -1), "title"),
    "tasks": ("tasks", TaskIn, ("created_at", -1), "title"),
    "events": ("events", EventIn, ("start", 1), "title"),
    "contacts": ("contacts", ContactIn, ("name", 1), "name"),
    "interactions": ("interactions", InteractionIn, ("date", -1), "summary"),
    "accounts": ("accounts", AccountIn, ("name", 1), "name"),
    "transactions": ("transactions", TransactionIn, ("date", -1), "description"),
    "budgets": ("budgets", BudgetIn, ("category", 1), "category"),
    "habits": ("habits", HabitIn, ("created_at", 1), "name"),
    "notes": ("notes", NoteIn, ("created_at", -1), "title"),
    "reviews": ("reviews", ReviewIn, ("period_start", -1), "kind"),
    "achievements": ("achievements", AchievementIn, ("date", -1), "title"),
    "biz": ("biz", BizIn, ("created_at", -1), "title"),
    "content": ("content", ContentIn, ("created_at", -1), "title"),
}
UPDATES = {k: make_update(v[1]) for k, v in ENTITIES.items()}

# link field -> target collection
LINKS = {
    "project_id": "projects", "goal_id": "goals", "contact_id": "contacts",
    "parent_id": "goals", "account_id": "accounts", "source_content_id": "content",
}
TRANSIENT = {"change_note"}
