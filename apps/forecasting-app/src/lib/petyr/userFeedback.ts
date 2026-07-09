export const USER_FEEDBACK_CATEGORIES = ["bug", "experience", "data_issue", "other"] as const;
export const USER_FEEDBACK_STATUSES = ["open", "in_progress", "resolved"] as const;

export type UserFeedbackCategoryValue = (typeof USER_FEEDBACK_CATEGORIES)[number];
export type UserFeedbackStatusValue = (typeof USER_FEEDBACK_STATUSES)[number];

export const USER_FEEDBACK_CATEGORY_LABELS: Record<UserFeedbackCategoryValue, string> = {
  bug: "Bug",
  experience: "Experience",
  data_issue: "Data issue",
  other: "Other"
};

export const USER_FEEDBACK_STATUS_LABELS: Record<UserFeedbackStatusValue, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved"
};
