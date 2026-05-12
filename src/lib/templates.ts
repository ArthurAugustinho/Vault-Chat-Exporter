export interface FrontmatterTemplate {
  id: string
  label: string
  fields: Record<string, string>
}

export const TEMPLATES: FrontmatterTemplate[] = [
  {
    id: "study",
    label: "Estudo",
    fields: { type: "study", status: "draft", area: "", difficulty: "" }
  },
  {
    id: "bug",
    label: "Bug",
    fields: { type: "bug", status: "open", severity: "", project: "" }
  },
  {
    id: "project",
    label: "Projeto",
    fields: { type: "project-note", status: "active", project: "", related: "" }
  },
  {
    id: "reference",
    label: "Referência",
    fields: { type: "reference", status: "saved", source_type: "ai-chat" }
  }
]
